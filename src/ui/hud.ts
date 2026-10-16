import { h, setText, setWidth, toggle, $ } from './dom.ts';
import { t } from '../i18n.ts';
import { CREW, STAGES, moodLabel } from '../rules/content.ts';
import type { GameState } from '../rules/state.ts';
import { maxHp, nextLevelXp, prevLevelXp, buffOn } from '../rules/keeper.ts';
import { canGrow, growNeeds } from '../rules/whale.ts';
import type { Goal } from '../rules/story.ts';
import type { Line, Speaker } from '../dialogue.ts';
import { play } from '../sfx.ts';

export interface HudActions {
  context(): void; ring(): void; spin(): void; hop(): void; eat(): void; reel(held: boolean): void; conch(): void; pull(): void;
  open(panel: 'bag' | 'bao' | 'map' | 'journal' | 'settings'): void;
  grow(): void;
}
export interface HudView { mode: 'deck' | 'isle' | 'house' | 'skiff'; combat: boolean; context: string | null; contextIcon: string; fishing: 'off' | 'wait' | 'bite'; cooldowns: { spin: number; hop: number }; eat: string | null; bossName?: string; boss?: number; bossShield?: boolean; bossStatus?: string | null; raid?: string | null; place: string; conch?: boolean; pull?: boolean;
  /** Zoo Garden's fishing game: the phase, the line's tension and how far the fish is reeled in. */
  reel?: { phase: string; tension: number; progress: number; strained: boolean } | null }

const WHO_COLOR: Record<Speaker, string> = { bao: '#3fa9f5', gloom: '#9a8cc8', keeper: '#16a9a0', folk: '#5aa8e0', ...Object.fromEntries(Object.entries(CREW).map(([k, v]) => [k, v.color])) } as Record<Speaker, string>;
const WHO_NAME = (w: Speaker) => w === 'bao' ? 'Bao' : w === 'gloom' ? 'The Gloom' : w === 'keeper' ? 'You' : w === 'folk' ? 'A backfolk family' : CREW[w].name;

/** The HUD: top cards, goal, the phone stick and buttons, toasts and the speech card. */
export class Hud {
  root: HTMLElement;
  stick = { x: 0, z: 0 };
  private stickBase: HTMLElement; private stickKnob: HTMLElement; private stickId: number | null = null; private stickOrigin = { x: 0, y: 0 };
  private dialog: HTMLElement; private queue: Line[] = []; private onDone: (() => void) | null = null;
  private toasts: HTMLElement;
  constructor(parent: HTMLElement, private act: HudActions) {
    this.root = h('div', { id: 'hud' },
      h('div', { class: 'hud-top' },
        h('div', { class: 'hero-card' },
          h('div', { class: 'lvl', id: 'h-lvl' }, '1'),
          h('div', { class: 'bars' },
            h('div', { class: 'bar hp' }, h('i', { id: 'h-hp' }), h('span', { id: 'h-hpt' })),
            h('div', { class: 'bar xp' }, h('i', { id: 'h-xp' }))),
          h('div', { class: 'buff', id: 'h-buff', hidden: true })),
        h('div', { class: 'hud-right' },
          h('div', { class: 'pill glimmer', id: 'h-glim', title: t('Glimmer') }, '✦ 0'),
          h('button', { class: 'bao-card', id: 'h-bao', 'aria-label': t('Bao'), onclick: () => { play('click'); this.act.open('bao'); } },
            h('div', { class: 'bao-face', id: 'h-face' }, '◕‿◕'),
            h('div', { class: 'bao-bars' },
              h('div', { class: 'bao-name' }, h('b', {}, 'Bao'), ' ', h('span', { id: 'h-stage' })),
              h('div', { class: 'bar hunger', title: t('Fullness') }, h('i', { id: 'h-hunger' })),
              h('div', { class: 'bar growth', title: t('Growth') }, h('i', { id: 'h-growth' }))),
            h('div', { class: 'grow-badge', id: 'h-grow', hidden: true }, t('Grow!'))),
          h('div', { class: 'icon-row' },
            iconButton('🗺️', 'Sky map', () => this.act.open('map')),
            iconButton('🎒', 'Bag', () => this.act.open('bag')),
            iconButton('📖', 'Journal', () => this.act.open('journal')),
            iconButton('⚙️', 'Settings', () => this.act.open('settings'))))),
      h('div', { class: 'goal', id: 'h-goal' }, h('span', { class: 'goal-dot' }, '➜'), h('span', { id: 'h-goal-t' })),
      h('div', { class: 'boss', id: 'h-boss', hidden: true }, h('div', { class: 'boss-name', id: 'h-boss-n' }), h('div', { class: 'bar boss-bar' }, h('i', { id: 'h-boss-hp' }))),
      h('div', { class: 'raid-banner', id: 'h-raid', hidden: true }),
      this.toasts = h('div', { class: 'toasts' }),
      h('div', { class: 'stick-zone', id: 'stick-zone' }),
      this.stickBase = h('div', { class: 'stick', hidden: true }, this.stickKnob = h('div', { class: 'knob' })),
      h('div', { class: 'buttons', id: 'buttons' },
        h('button', { class: 'btn conch', id: 'b-conch', hidden: true, 'aria-label': t('Blow the conch'), title: t('Blow the conch'), onclick: () => { play('click'); this.act.conch(); } }, h('span', { class: 'ico' }, '🐚')),
        h('button', { class: 'btn pull', id: 'b-pull', hidden: true, 'aria-label': t('Pull the rope'), title: t('Pull the rope'), onclick: () => { play('click'); this.act.pull(); } }, h('span', { class: 'ico' }, '🪢'), h('small', {}, t('Pull the rope'))),
        h('button', { class: 'btn eat', id: 'b-eat', 'aria-label': t('Quick Eat'), onclick: () => this.act.eat() }, h('span', { class: 'ico' }, '🍐'), h('small', { id: 'b-eat-n' })),
        h('button', { class: 'btn hop', id: 'b-hop', 'aria-label': t('Hop'), onpointerdown: (e: PointerEvent) => { e.preventDefault(); this.act.hop(); } }, h('span', { class: 'ico' }, '💨'), h('i', { class: 'cd', id: 'b-hop-cd' })),
        h('button', { class: 'btn spin', id: 'b-spin', 'aria-label': t('Chime Spin'), onpointerdown: (e: PointerEvent) => { e.preventDefault(); this.act.spin(); } }, h('span', { class: 'ico' }, '🌀'), h('i', { class: 'cd', id: 'b-spin-cd' })),
        h('button', { class: 'btn ring', id: 'b-ring', 'aria-label': t('Ring'), onpointerdown: (e: PointerEvent) => { e.preventDefault(); this.act.ring(); } }, h('span', { class: 'ico' }, '🔔')),
        h('button', { class: 'btn context', id: 'b-ctx', onclick: () => { play('click'); this.act.context(); } }, h('span', { class: 'ico', id: 'b-ctx-i' }, '✋'), h('small', { id: 'b-ctx-t' })),
        h('button', { class: 'btn reel', id: 'b-reel', hidden: true, onpointerdown: (e: PointerEvent) => { e.preventDefault(); (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); this.act.reel(true); }, onpointerup: () => this.act.reel(false), onpointercancel: () => this.act.reel(false), onlostpointercapture: () => this.act.reel(false) }, h('span', { class: 'ico' }, '🎣'), h('small', { id: 'b-reel-t' }, t('Reel!')))),
      h('div', { class: 'reel-meter', id: 'h-reel', hidden: true }, h('div', { class: 'bar tension' }, h('i', { id: 'h-tension' })), h('div', { class: 'bar landed' }, h('i', { id: 'h-landed' })), h('small', { id: 'h-reel-t' })),
      this.dialog = h('div', { class: 'speech', id: 'speech', hidden: true, onclick: () => this.next() },
        h('div', { class: 'who', id: 's-who' }), h('div', { class: 'say', id: 's-say' }), h('div', { class: 'tap' }, t('Tap to continue'))),
    );
    parent.append(this.root);
    $('#h-grow', this.root)!.addEventListener('click', e => { e.stopPropagation(); this.act.grow(); });
    // A clicked HUD button lets go of the keyboard focus, so Space and F go back to the game.
    this.root.addEventListener('click', e => { const b = (e.target as Element).closest?.('button'); if (b) (b as HTMLElement).blur(); });
    this.bindStick($('#stick-zone', this.root)!);
  }

  private bindStick(zone: HTMLElement) {
    zone.addEventListener('pointerdown', e => {
      if (this.stickId !== null) return;
      this.stickId = e.pointerId; zone.setPointerCapture(e.pointerId);
      this.stickOrigin = { x: e.clientX, y: e.clientY };
      Object.assign(this.stickBase.style, { left: `${e.clientX}px`, top: `${e.clientY}px` });
      this.stickBase.hidden = false; this.stickKnob.style.transform = 'translate(-50%, -50%)';
    });
    const move = (e: PointerEvent) => {
      if (e.pointerId !== this.stickId) return;
      const dx = e.clientX - this.stickOrigin.x, dy = e.clientY - this.stickOrigin.y, R = 52, d = Math.hypot(dx, dy);
      const k = d > R ? R / d : 1;
      this.stickKnob.style.transform = `translate(calc(-50% + ${dx * k}px), calc(-50% + ${dy * k}px))`;
      const m = Math.min(1, d / R), dead = .08;
      this.stick = d > 2 && m > dead ? { x: dx / d * m, z: dy / d * m } : { x: 0, z: 0 };
    };
    const end = (e: PointerEvent) => { if (e.pointerId !== this.stickId) return; this.stickId = null; this.stick = { x: 0, z: 0 }; this.stickBase.hidden = true; };
    zone.addEventListener('pointermove', move); zone.addEventListener('pointerup', end); zone.addEventListener('pointercancel', end); zone.addEventListener('lostpointercapture', end);
  }
  releaseStick() { this.stickId = null; this.stick = { x: 0, z: 0 }; this.stickBase.hidden = true; }

  // ---------------------------------------------------------------- speech
  get talking() { return !this.dialog.hidden; }
  say(lines: Line[], onDone?: () => void) {
    if (!lines.length) { onDone?.(); return; }
    this.queue.push(...lines);
    if (onDone) { const prev = this.onDone; this.onDone = () => { prev?.(); onDone(); }; }
    if (this.dialog.hidden) this.next();
  }
  next() {
    const line = this.queue.shift();
    if (!line) { this.dialog.hidden = true; const f = this.onDone; this.onDone = null; f?.(); return; }
    this.dialog.hidden = false;
    const who = $('#s-who', this.dialog)!;
    who.textContent = t(WHO_NAME(line.who)); who.style.background = WHO_COLOR[line.who];
    setText($('#s-say', this.dialog), t(line.text));
    this.dialog.classList.toggle('gloom', line.who === 'gloom');
    play('click', .2);
  }

  toast(text: string, kind: 'info' | 'good' | 'warn' = 'info') {
    const el = h('div', { class: `toast ${kind}` }, text);
    this.toasts.append(el);
    while (this.toasts.children.length > 3) this.toasts.firstElementChild?.remove();
    setTimeout(() => el.classList.add('out'), 2200);
    setTimeout(() => el.remove(), 2700);
  }

  // ---------------------------------------------------------------- update
  update(s: GameState, goal: Goal, view: HudView) {
    const r = this.root;
    setText($('#h-lvl', r), String(s.hero.level));
    const hpMax = maxHp(s);
    setWidth($('#h-hp', r), s.hero.hp / hpMax);
    setText($('#h-hpt', r), `${Math.ceil(s.hero.hp)}/${hpMax}`);
    const next = nextLevelXp(s.hero.level), prev = prevLevelXp(s.hero.level);
    setWidth($('#h-xp', r), next ? (s.hero.xp - prev) / (next - prev) : 1);
    const buff = buffOn(s, 'power') ? `💪 ${Math.ceil(s.hero.buffUntil - s.playSeconds)}s` : buffOn(s, 'guard') ? `🛡️ ${Math.ceil(s.hero.buffUntil - s.playSeconds)}s` : '';
    toggle($('#h-buff', r), !!buff); setText($('#h-buff', r), buff);
    setText($('#h-glim', r), `✦ ${s.glimmer}`);
    setText($('#h-stage', r), t(STAGES[s.whale.stage].name));
    setWidth($('#h-hunger', r), s.whale.hunger / 100);
    const need = growNeeds(s), nextStage = STAGES[s.whale.stage + 1];
    setWidth($('#h-growth', r), nextStage ? Math.min(1, (s.whale.xp - STAGES[s.whale.stage].xp) / (nextStage.xp - STAGES[s.whale.stage].xp)) : 1);
    toggle($('#h-grow', r), canGrow(s) && !s.voyage);
    const m = s.whale.mood;
    setText($('#h-face', r), m >= 80 ? '◕ᴗ◕' : m >= 50 ? '◕‿◕' : m >= 25 ? '•︵•' : '╥﹏╥');
    $('#h-face', r)!.title = t(moodLabel(m));
    $('#h-bao', r)!.classList.toggle('needs', !!need && need.xp === 0 && !!need.note);
    setText($('#h-goal-t', r), t(goal.text, goal.vars));
    // Buttons.
    toggle($('#b-ring', r), view.combat); toggle($('#b-spin', r), view.combat); toggle($('#b-hop', r), view.combat || view.mode === 'isle');
    toggle($('#b-eat', r), view.mode === 'isle' || view.combat);
    toggle($('#b-conch', r), !!view.conch);
    toggle($('#b-pull', r), !!view.pull);
    setText($('#b-eat-n', r), view.eat ? '✓' : '–');
    $('#b-eat', r)!.classList.toggle('empty', !view.eat);
    const ctx = $('#b-ctx', r)!;
    toggle(ctx, !!view.context && view.fishing === 'off');
    setText($('#b-ctx-t', r), view.context ? t(view.context) : '');
    setText($('#b-ctx-i', r), view.contextIcon);
    toggle($('#b-reel', r), view.fishing !== 'off');
    $('#b-reel', r)!.classList.toggle('bite', view.fishing === 'bite');
    const rl = view.reel;
    setText($('#b-reel-t', r), !rl ? t('Wait…') : rl.phase === 'hooked' ? (rl.strained ? t('Let go!') : t('Hold!')) : rl.phase === 'bite' ? t('Reel!') : t('Wait…'));
    toggle($('#h-reel', r), rl?.phase === 'hooked');
    if (rl?.phase === 'hooked') { setWidth($('#h-tension', r), rl.tension); setWidth($('#h-landed', r), rl.progress); setText($('#h-reel-t', r), rl.strained ? t('Line strained! Let go!') : t('Hold Reel; let go when it surges')); $('#h-reel', r)!.classList.toggle('strained', rl.strained); }
    cooldown($('#b-spin-cd', r), view.cooldowns.spin); cooldown($('#b-hop-cd', r), view.cooldowns.hop);
    toggle($('#h-boss', r), view.boss !== undefined);
    if (view.boss !== undefined) {
      setText($('#h-boss-n', r), `${t(view.bossName ?? '')}${view.bossStatus ? ` · ${t(view.bossStatus)}` : ''}`);
      setWidth($('#h-boss-hp', r), view.boss);
      $('#h-boss', r)!.classList.toggle('shielded', !!view.bossShield);
    }
    toggle($('#h-raid', r), !!view.raid); if (view.raid) setText($('#h-raid', r), view.raid);
  }
}

function iconButton(icon: string, label: string, onClick: () => void) {
  return h('button', { class: 'icon-btn', 'aria-label': t(label), title: t(label), onclick: () => { play('click'); onClick(); } }, icon);
}
function cooldown(el: HTMLElement | null, k: number) { if (!el) return; const v = `${Math.round(k * 100)}%`; if (el.style.height !== v) el.style.height = v; }
