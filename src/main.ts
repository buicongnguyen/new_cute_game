import '@fontsource-variable/nunito';
import './style.css';
import { initLanguage, setLanguage, language, t, onLanguage } from './i18n.ts';
import { loadModels } from './world/assets.ts';
import { loadGame, saveGame } from './save-game.ts';
import { catchUp } from './rules/tick.ts';
import { unlockAudio, startMusic, play } from './sfx.ts';
import { PROLOGUE, SCENES } from './dialogue.ts';
import { NIGHT } from './world/look.ts';
import { h } from './ui/dom.ts';
import { installMobileGameSupport } from './mobile-game-support.mjs';
import type { Game } from './game.ts';
import { newGame, repair, type GameState } from './rules/state.ts';
import { STAGES, type IsleId } from './rules/content.ts';
import { installTestHooks } from './core/test-hooks.ts';

initLanguage();
const app = document.getElementById('app')!;
const canvas = h('canvas', { id: 'world', 'aria-label': 'Cloudback' });
const ui = h('div', { id: 'ui' }, h('div', { id: 'float-layer' }), h('div', { id: 'veil' }));
app.append(canvas, ui);

// The loading card, then the title.
const loading = h('div', { class: 'screen loading' }, h('h1', { class: 'logo' }, 'Cloudback'), h('div', { class: 'load-bar' }, h('i', { id: 'load-i' })), h('p', {}, t('Waking Bao up…')));
app.append(loading);

let game: Game | null = null;

async function boot() {
  await loadModels((done, all) => { (document.getElementById('load-i') as HTMLElement).style.width = `${done / all * 100}%`; });
  const { Game } = await import('./game.ts');
  const { state, fresh } = loadGame();
  game = new Game(canvas, ui, state);
  installMobileGameSupport({ translate: t, menus: [], fullscreen: false, controls: ['#buttons', '.hud-top', '.goal', '.speech', '.stick-zone'] });
  game.start();
  game.frozen = true;
  document.body.classList.add('hide-ui');
  game.cinematic = { dist: 46, pitch: 18, spin: .05 };
  loading.remove();
  title(state, fresh);
  hooks(game);
  document.addEventListener('visibilitychange', () => {
    if (!game) return;
    if (document.hidden) saveGame(game.state); else catchUp(game.state, Date.now());
  });
  window.addEventListener('pagehide', () => { if (game) saveGame(game.state); });
  game.onEnding = () => ending();
  onLanguage(() => { if (game) saveGame(game.state); location.reload(); });
}

function title(state: GameState, fresh: boolean) {
  const g = game!;
  g.frozenLook = null;
  const started = !fresh && (state.story.prologueSeen || state.playSeconds > 5);
  const screen = h('div', { class: 'screen title' },
    h('div', { class: 'title-card' },
      h('h1', { class: 'logo' }, 'Cloudback'),
      h('p', { class: 'tagline' }, t('A cozy sky adventure on the back of a growing whale')),
      started ? h('p', { class: 'save-line' }, t('{stage} whale · Level {n} · {notes}/3 Notes', { stage: STAGES[state.whale.stage].name, n: state.hero.level, notes: state.notes.length })) : null,
      h('button', { class: 'act primary big', onclick: () => { unlockAudio(); startMusic(); play('arrive'); screen.remove(); begin(); } }, started ? t('Continue') : t('Play')),
      h('div', { class: 'acts' },
        h('button', { class: `act ${language() === 'en' ? 'on' : ''}`, onclick: () => setLanguage('en') }, 'English'),
        h('button', { class: `act ${language() === 'vi' ? 'on' : ''}`, onclick: () => setLanguage('vi') }, 'Tiếng Việt')),
      h('p', { class: 'hint' }, t('Phone: drag on the left to walk, tap things to use them. PC: WASD to walk, F to use, Space to ring.'))));
  app.append(screen);
}

function begin() {
  const g = game!;
  const show = () => { document.body.classList.remove('hide-ui'); g.cinematic = null; };
  if (!g.state.story.prologueSeen) prologue(() => { show(); g.state.story.prologueSeen = true; g.frozen = false; g.save(); g.scene_('intro'); });
  else { show(); g.frozen = false; g.scene_('intro'); }
}

/** Five cards over the night sky (very dark blue, black-blue clouds), then dawn on Bao's back. */
function prologue(done: () => void) {
  const g = game!;
  g.frozenLook = NIGHT;
  let i = 0;
  const text = h('p', { class: 'story-text' });
  const next = h('button', { class: 'act primary', onclick: () => step() }, t('Next'));
  const card = h('div', { class: 'screen prologue' }, h('div', { class: 'prologue-card' }, text, h('div', { class: 'acts' }, h('button', { class: 'act', onclick: () => finish() }, t('Skip')), next)));
  app.append(card);
  const finish = () => { card.remove(); g.frozenLook = null; play('hum'); done(); };
  const step = () => {
    if (i >= PROLOGUE.length) { finish(); return; }
    text.classList.remove('in'); void text.offsetWidth;
    text.textContent = t(PROLOGUE[i]); text.classList.add('in');
    next.textContent = i === PROLOGUE.length - 1 ? t('Wake up') : t('Next');
    if (i === 1) play('shield'); if (i === 3) play('song');
    i++;
  };
  step();
}

/** The pod rises; credits; then free play continues. */
function ending() {
  const g = game!;
  g.frozenLook = null;
  setTimeout(() => { document.body.classList.add('hide-ui'); g.cinematic = { dist: 70, pitch: 14, spin: .04 }; }, 1400);
  const lines = [
    t('The Heart shattered into a fountain of glimmer.'),
    t('One by one, the sky whales woke and rose. Grand Hana rose last, and hummed to Bao.'),
    t('Whales carry gardens. Gardens feed whales. And whales carry each other.'),
  ];
  const card = h('div', { class: 'screen ending' }, h('div', { class: 'prologue-card' },
    h('h2', {}, t('The End… and a new dawn')),
    ...lines.map(l => h('p', { class: 'story-text in' }, l)),
    h('p', { class: 'credits' }, t('Cloudback — story, code, art and sound made for this game. Thank you for playing!')),
    h('p', { class: 'hint' }, t('A Golden Seed drifted down from Hana’s back. Your garden, the markets and the sky are still yours.')),
    h('button', { class: 'act primary big', onclick: () => { card.remove(); document.body.classList.remove('hide-ui'); g.cinematic = null; g.state.story.endingSeen = true; g.save(); } }, t('Keep playing'))));
  setTimeout(() => app.append(card), 1500);
  void SCENES;
}

/** window.__cloud in development (and with ?test): read the state, jump to situations, step time. */
function hooks(g: Game) {
  const enabled = import.meta.env.DEV || new URLSearchParams(location.search).has('test');
  const STATES: Record<string, (s: GameState) => void> = {
    'new-game': () => { Object.assign(g.state, newGame('test', Date.now())); },
    'rope': s => { s.gear.rope = true; s.story.flags = { planted: true, harvested: true, fed: true, scene_intro: true, scene_rope: true, scene_planted: true, scene_harvested: true, scene_fed: true }; s.story.prologueSeen = true; },
    'clover': s => { STATES.rope(s); s.place = 'clover'; },
    'reef': s => { STATES.rope(s); s.whale.stage = 1; s.notes = ['clover']; s.isles.clover.freed = true; s.crew.push('pip'); s.rescued.push('olla', 'pip'); s.place = 'reef'; s.hero.level = 6; s.hero.xp = 450; s.gear.mallet = 2; },
    'ember': s => { STATES.reef(s); s.whale.stage = 2; s.notes.push('reef'); s.isles.reef.freed = true; s.crew.push('mina', 'ria'); s.rescued.push('kai', 'mina', 'ria'); s.place = 'ember'; s.hero.level = 10; s.hero.xp = 1320; },
    'star': s => { STATES.ember(s); s.whale.stage = 3; s.notes.push('ember'); s.isles.ember.freed = true; s.crew.push('tam'); s.rescued.push('coal', 'tam'); s.place = 'star'; s.hero.level = 14; s.hero.xp = 3300; s.gear.mallet = 3; s.gear.coat = 3; },
    'rich': s => { s.glimmer = 2000; for (const id of ['puffberry', 'glowplum', 'starfig', 'cloudpear', 'honeybun', 'fibre', 'chimewood', 'ore', 'sun_carp', 'cloud_koi'] as const) s.items[id] = 20; for (const id of ['seed_glowplum', 'seed_starfig', 'seed_cloudpear', 'seed_chimewood', 'seed_honeybun'] as const) s.items[id] = 3; },
    'garden': s => { s.plots.forEach((p, i) => Object.assign(p, { tree: (['puffberry', 'ropevine', 'cloudpear', 'glowplum', 'starfig', 'chimewood'] as const)[i % 6], phase: 'ripe', progress: 999, crust: 0 })); },
  };
  installTestHooks({
    state: () => g.summary(),
    step: ms => { for (let tt = 0; tt < ms; tt += 1000 / 60) g.loop.advance(1 / 60); },
    seed: () => { /* the save carries its own seed */ },
    setState: name => {
      const [base, ...rest] = name.split('+');
      for (const part of [base, ...rest]) { const make = STATES[part]; if (!make) throw new Error(`unknown state ${part}`); make(g.state); }
      Object.assign(g.state, repair(g.state));
      g.bao.setStage(g.state.whale.stage, true);
      g.frozen = false;
      document.querySelectorAll('.screen').forEach(e => e.remove());
      document.body.classList.remove('hide-ui'); g.cinematic = null; g.frozenLook = null;
      g.enterDeck(true);
    },
    freeze: on => { g.frozen = on; },
    reducedMotion: on => { g.fx.shakeScale = on ? 0 : 1; },
    hideUi: on => { document.body.classList.toggle('hide-ui', on); },
  }, { enabled, name: '__cloud' });
  if (enabled) Object.assign(window, { __game: g, __descend: () => g.descend(), __sail: (to: IsleId) => g.sail(to),
    // Garden time travel for tests: the garden runs on the wall clock.
    __warp: (seconds: number) => { g.state.clock -= seconds * 1000; catchUp(g.state, Date.now()); g.syncDeck(); } });
}

boot().catch(err => {
  console.error(err);
  loading.querySelector('p')!.textContent = t('Something went wrong while loading. Please reload the page.');
});
