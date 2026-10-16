import { h } from './dom.ts';
import { language, setLanguage, t } from '../i18n.ts';
import { CREW, FISH, ITEMS, MALLET, COAT, MARKETS, MEALS, MEAL_IDS, NOTE_ISLES, PLACES, PLACE_IDS, RECIPES, RECIPE_IDS, STAGES, TREES, TREE_IDS, moodFactor, moodLabel, seedOf, type IsleId, type ItemId, type ItemKind, type MealId, type PlaceId, type RecipeId, type TreeId } from '../rules/content.ts';
import { count, type GameState } from '../rules/state.ts';
import { plotProgress, plotSecondsLeft, gardenSpeed } from '../rules/garden.ts';
import { canGrow, growNeeds, canFeed } from '../rules/whale.ts';
import { canSail, voyagePlan } from '../rules/voyage.ts';
import { recipeState, sellPrice, marketOpen, canCook } from '../rules/trade.ts';
import { noteName, storyIsle } from '../rules/story.ts';
import { maxHp, ringDamage } from '../rules/keeper.ts';
import { getVolume, setVolume, play } from '../sfx.ts';

export type PanelKind = 'plot' | 'bao' | 'map' | 'workbench' | 'kitchen' | 'market' | 'bag' | 'journal' | 'settings';
export interface GameApi {
  state(): GameState;
  onDeck(): boolean;
  plant(plot: number, tree: TreeId): void; uproot(plot: number): void; harvest(plot: number): void;
  feed(item: ItemId): void; feedAll(): void; pet(): void; grow(): void;
  sail(to: PlaceId): void;
  craft(id: RecipeId): void; cook(id: MealId): void;
  sell(isle: IsleId, item: ItemId, n: number): void; buy(isle: IsleId, item: ItemId): void;
  eat(item: ItemId): void;
  exportSave(): string; importSave(code: string): boolean; reset(): void; replayPrologue(): void;
  settings: { shake: boolean; graphics: string; setShake(v: boolean): void; setGraphics(v: string): void };
}

const KIND_LABEL: Record<ItemKind, string> = { whale: 'Whale food', people: 'People food', craft: 'Craft', fish: 'Fish', meal: 'Meals', seed: 'Seeds' };
const ICON: Partial<Record<ItemId | 'glimmer', string>> = {
  puffberry: '🍓', glowplum: '🫐', starfig: '⭐', cloudpear: '🍐', honeybun: '🥯', fibre: '🧶', chimewood: '🪵', ore: '🪨',
  puff_minnow: '🐟', sun_carp: '🐠', star_ray: '🪼', cloud_koi: '🎏', pear_tart: '🥧', fish_bun: '🥟', sky_stew: '🍲', glimmer: '✦',
};
export const itemIcon = (id: ItemId) => ICON[id] ?? (id.startsWith('seed_') ? '🌱' : '•');
const mmss = (s: number) => s >= 60 ? `${Math.floor(s / 60)}m ${Math.ceil(s % 60)}s` : `${Math.ceil(s)}s`;
const costLine = (s: GameState, cost: Partial<Record<string, number>>, glimmer = 0) => h('div', { class: 'cost' },
  ...Object.entries(cost).map(([id, n]) => { const have = id === 'fish' ? FISH.reduce((a, f) => a + count(s, f), 0) : count(s, id as ItemId); return h('span', { class: have >= (n ?? 0) ? 'ok' : 'short' }, `${id === 'fish' ? '🐟' : itemIcon(id as ItemId)} ${have}/${n} ${t(id === 'fish' ? 'any fish' : ITEMS[id as ItemId].name)}`); }),
  glimmer ? h('span', { class: s.glimmer >= glimmer ? 'ok' : 'short' }, `✦ ${glimmer}`) : null);

export class Panels {
  root: HTMLElement;
  private sheet: HTMLElement;
  kind: PanelKind | null = null;
  private arg: unknown = null;
  private mapPick: PlaceId | null = null;
  private marketTab: 'sell' | 'buy' = 'sell';
  onClose: (() => void) | null = null;
  constructor(parent: HTMLElement, private api: GameApi) {
    this.sheet = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true' });
    this.root = h('div', { class: 'panel-backdrop', hidden: true, onclick: (e: Event) => { if (e.target === this.root) this.close(); } }, this.sheet);
    parent.append(this.root);
    window.addEventListener('keydown', e => { if (e.key === 'Escape' && this.kind) { e.preventDefault(); this.close(); } });
  }
  get open() { return this.kind !== null; }
  show(kind: PanelKind, arg: unknown = null) { this.kind = kind; this.arg = arg; if (kind === 'map') this.mapPick = null; this.root.hidden = false; this.render(); }
  close() { if (!this.kind) return; this.kind = null; this.root.hidden = true; this.sheet.replaceChildren(); this.onClose?.(); }
  refresh() { if (this.kind) this.render(); }

  private frame(title: string, ...body: (Node | null)[]) {
    this.sheet.replaceChildren(h('header', {}, h('h2', {}, title), h('button', { class: 'x', 'aria-label': t('Close'), onclick: () => this.close() }, '✕')), h('div', { class: 'body' }, ...body));
  }
  private button(label: string, onClick: () => void, opts: { disabled?: boolean; kind?: string } = {}) {
    return h('button', { class: `act ${opts.kind ?? ''}`, disabled: opts.disabled, onclick: () => { play('click'); onClick(); this.refresh(); } }, label);
  }

  private render() {
    const s = this.api.state();
    switch (this.kind) {
      case 'plot': return this.plot(s, this.arg as number);
      case 'bao': return this.bao(s);
      case 'map': return this.map(s);
      case 'workbench': return this.workbench(s);
      case 'kitchen': return this.kitchen(s);
      case 'market': return this.market(s, this.arg as IsleId);
      case 'bag': return this.bag(s);
      case 'journal': return this.journal(s);
      case 'settings': return this.settings();
    }
  }

  private plot(s: GameState, i: number) {
    const p = s.plots[i];
    if (!p) return this.close();
    if (!p.tree) {
      const seeds = TREE_IDS.filter(id => count(s, seedOf(id)) > 0);
      return this.frame(t('Plant a tree'),
        h('p', { class: 'hint' }, t('Trees fruit again and again. Uprooting gives the seed back.')),
        seeds.length ? h('div', { class: 'list' }, ...seeds.map(id => {
          const tr = TREES[id];
          return h('div', { class: 'row' },
            h('span', { class: 'big' }, '🌱'),
            h('div', { class: 'grow' }, h('b', {}, t(tr.name)), h('small', {}, `${t(KIND_LABEL[tr.kind === 'decor' ? 'seed' : tr.kind])} · ${t('first fruit {t}', { t: mmss(tr.grow / gardenSpeed(s)) })}${tr.yield ? ` · ${tr.yield[1]}× ${itemIcon(tr.yield[0])}` : ''}`)),
            h('span', { class: 'count' }, `×${count(s, seedOf(id))}`),
            this.button(t('Plant'), () => { this.api.plant(i, id); this.close(); }));
        })) : h('p', {}, t('You have no seeds. Markets on rescued isles sell them.')));
    }
    const tr = TREES[p.tree];
    const left = plotSecondsLeft(s, p);
    return this.frame(t(tr.name),
      h('div', { class: 'progress' }, h('i', { style: { width: `${plotProgress(p) * 100}%` } })),
      h('p', {}, p.crust > 0 ? t('Crusted by the Gloom: ring it {n} more times.', { n: p.crust }) : p.phase === 'ripe' ? (tr.yield ? t('Ripe! Pick it.') : t('Fully grown.')) : t('Fruit in {t}', { t: mmss(left) })),
      h('p', { class: 'hint' }, t('Bao’s mood: {m} (growth ×{k})', { m: t(moodLabel(s.whale.mood)), k: gardenSpeed(s).toFixed(2) })),
      h('div', { class: 'acts' },
        p.phase === 'ripe' && tr.yield && p.crust === 0 ? this.button(t('Harvest'), () => { this.api.harvest(i); this.close(); }, { kind: 'primary' }) : null,
        this.button(t('Uproot (seed back)'), () => { this.api.uproot(i); this.close(); })));
  }

  private bao(s: GameState) {
    const need = growNeeds(s), next = STAGES[s.whale.stage + 1];
    const feedables = (Object.keys(s.items) as ItemId[]).filter(id => canFeed(id) && count(s, id) > 0);
    const deck = this.api.onDeck();
    return this.frame(t('Bao the sky whale'),
      h('div', { class: 'stats' },
        stat(t('Stage'), t(STAGES[s.whale.stage].name)),
        stat(t('Fullness'), `${Math.round(s.whale.hunger)}/100`),
        stat(t('Mood'), `${t(moodLabel(s.whale.mood))} (${Math.round(s.whale.mood)})`),
        stat(t('Tree growth'), `×${moodFactor(s.whale.mood).toFixed(2)}`),
        stat(t('Growth'), next ? `${s.whale.xp}/${next.xp}` : `${s.whale.xp}`),
        stat(t('Specks'), String(s.whale.specks))),
      h('div', { class: 'notes' }, ...NOTE_ISLES.map(n => h('span', { class: s.notes.includes(n) ? 'note got' : 'note' }, `♪ ${t(noteName(n))}`))),
      next ? h('p', { class: 'hint' }, canGrow(s) ? t('Bao is ready to grow!') : [need?.xp ? t('{xp} more growth', { xp: need.xp }) : '', need?.note ? t('needs the {note}', { note: noteName(need.note) }) : ''].filter(Boolean).join(' · ')) : h('p', { class: 'hint' }, t('Bao is a Great whale!')),
      canGrow(s) ? this.button(t('Grow!'), () => { this.api.grow(); this.close(); }, { kind: 'primary', disabled: !!s.voyage }) : null,
      h('h3', {}, t('Feed Bao')),
      !deck ? h('p', { class: 'hint' }, t('Feed Bao from its back.')) : null,
      feedables.length ? h('div', { class: 'list' }, ...feedables.map(id => {
        const f = ITEMS[id].feed!;
        return h('div', { class: 'row' }, h('span', { class: 'big' }, itemIcon(id)), h('div', { class: 'grow' }, h('b', {}, t(ITEMS[id].name)), h('small', {}, `+${f.hunger} ${t('full')} · +${f.xp} ${t('growth')} · +${f.mood} ${t('mood')}`)), h('span', { class: 'count' }, `×${count(s, id)}`), this.button(t('Feed'), () => this.api.feed(id), { disabled: !deck }));
      })) : h('p', { class: 'hint' }, t('No whale food. Grow Puffberries, Glowplums or Starfigs, or catch fish for treats.')),
      h('div', { class: 'acts' },
        this.button(t('Feed all whale food'), () => this.api.feedAll(), { disabled: !deck || !feedables.some(id => ITEMS[id].kind === 'whale'), kind: 'primary' }),
        this.button(t('Pat Bao'), () => this.api.pet(), { disabled: !deck || s.playSeconds < s.whale.petAt })));
  }

  private map(s: GameState) {
    const W = 320, H = 360, sx = (x: number) => W / 2 + x * 4.2, sy = (y: number) => 30 - y * 4.6;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('class', 'skymap');
    const el = (tag: string, attrs: Record<string, string | number>, text?: string) => { const n = document.createElementNS('http://www.w3.org/2000/svg', tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v)); if (text) n.textContent = text; svg.append(n); return n; };
    el('rect', { x: 0, y: 0, width: W, height: H, rx: 16, fill: '#1c4fa8' });
    for (let i = 0; i < 26; i++) el('circle', { cx: (i * 97) % W, cy: (i * 53) % H, r: 8 + (i % 4) * 5, fill: '#ffffff', opacity: .08 });
    for (const gate of [{ y: -20, label: 'Wind Wall' }, { y: -38, label: 'Storm Belt' }, { y: -58, label: 'Deep Mist' }]) {
      el('line', { x1: 10, x2: W - 10, y1: sy(gate.y), y2: sy(gate.y), stroke: '#bfe2ff', 'stroke-width': 3, 'stroke-dasharray': '6 6', opacity: .55 });
      el('text', { x: W - 14, y: sy(gate.y) - 5, fill: '#dff0ff', 'font-size': 11, 'text-anchor': 'end' }, t(gate.label));
    }
    for (const id of PLACE_IDS) {
      const p = PLACES[id], [x, y] = p.pos, freed = id !== 'dawnreach' && s.isles[id].freed;
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('class', `place ${this.mapPick === id ? 'picked' : ''}`); g.setAttribute('tabindex', '0'); g.setAttribute('role', 'button');
      g.addEventListener('click', () => { this.mapPick = id; play('click'); this.render(); });
      svg.append(g);
      const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      Object.entries({ cx: sx(x), cy: sy(y), r: id === 'dawnreach' ? 9 : 17, fill: id === 'dawnreach' ? '#7cc8ff' : freed ? p.hue : '#8c86a8', stroke: '#ffffff', 'stroke-width': this.mapPick === id ? 4 : 2 }).forEach(([k, v]) => c.setAttribute(k, String(v)));
      g.append(c);
      const tx = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      Object.entries({ x: sx(x), y: sy(y) + 32, fill: '#ffffff', 'font-size': 12, 'font-weight': 700, 'text-anchor': 'middle' }).forEach(([k, v]) => tx.setAttribute(k, String(v)));
      tx.textContent = t(p.name); g.append(tx);
      // A larger invisible target so the tap area is at least 44 px.
      const hit = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      Object.entries({ cx: sx(x), cy: sy(y) + 6, r: 30, fill: 'transparent' }).forEach(([k, v]) => hit.setAttribute(k, String(v)));
      g.append(hit);
    }
    const here = s.voyage ? s.voyage.to : s.place, [bx, by] = PLACES[s.voyage ? s.voyage.from : s.place].pos;
    let px = bx, py = by;
    if (s.voyage) { const [tx2, ty2] = PLACES[here].pos, k = s.voyage.elapsed / s.voyage.duration; px = bx + (tx2 - bx) * k; py = by + (ty2 - by) * k; }
    el('text', { x: sx(px), y: sy(py) + 6, 'font-size': 20, 'text-anchor': 'middle' }, '🐋');
    const pick = this.mapPick;
    let info: Node | null = h('p', { class: 'hint' }, t('Tap a place to see the way there.'));
    if (pick && pick !== s.place) {
      const ok = canSail(s, pick), plan = voyagePlan(s, pick), story = storyIsle(s);
      info = h('div', { class: 'map-info' },
        h('b', {}, t(PLACES[pick].name)), pick === story ? h('span', { class: 'tag' }, t('Next on your journey')) : null,
        h('small', {}, `${t('{n} leagues', { n: Math.round(plan.distance) })} · ${t('{s}s flight', { s: Math.round(plan.duration) })} · ${t('{n} fullness', { n: plan.cost })}${plan.hungry ? ` · ${t('Bao is too hungry: slow flight')}` : ''}`),
        !ok.ok ? h('p', { class: 'warn' }, t(ok.why)) : null,
        this.button(t('Sail!'), () => { this.api.sail(pick); this.close(); }, { disabled: !ok.ok || !this.api.onDeck(), kind: 'primary' }),
        !this.api.onDeck() ? h('p', { class: 'hint' }, t('Climb back up to Bao to sail.')) : null);
    } else if (pick === s.place) info = h('p', { class: 'hint' }, t('Bao is here.'));
    return this.frame(t('Sky map'), svg, info);
  }

  private workbench(s: GameState) {
    return this.frame(t('Workbench'),
      h('p', { class: 'hint' }, t('Mallet ×{m} · Coat +{c} HP · Damage {d}', { m: MALLET[s.gear.mallet - 1], c: COAT[s.gear.coat - 1], d: Math.round(ringDamage(s)) })),
      h('div', { class: 'list' }, ...RECIPE_IDS.map(id => {
        const r = RECIPES[id], st = recipeState(s, id);
        if (st === 'owned' && id !== 'post') return null;
        return h('div', { class: `row ${st}` },
          h('div', { class: 'grow' }, h('b', {}, t(r.name)), h('small', {}, t(r.effect)), st === 'locked' ? h('small', { class: 'warn' }, r.needsTam && !s.crew.includes('tam') ? t('Only Tam the Smith can make this') : t('Make the tier before it first')) : costLine(s, r.cost, r.glimmer), id === 'post' ? h('small', {}, t('{n}/4 posts built', { n: s.posts.length })) : null),
          this.button(t('Make'), () => this.api.craft(id), { disabled: st !== 'ready' }));
      })));
  }

  private kitchen(s: GameState) {
    return this.frame(t('Mina’s Kitchen'),
      h('p', { class: 'hint' }, t('Meals heal more, and some give a buff for 150 s.')),
      h('div', { class: 'list' }, ...MEAL_IDS.map(id => {
        const def = ITEMS[id];
        return h('div', { class: 'row' }, h('span', { class: 'big' }, itemIcon(id)),
          h('div', { class: 'grow' }, h('b', {}, t(def.name)), h('small', {}, `+${def.eat!.heal} HP${def.eat!.buff === 'power' ? ` · ${t('+20% damage')}` : def.eat!.buff === 'guard' ? ` · ${t('−25% damage taken')}` : ''}`), costLine(s, MEALS[id].cost)),
          h('span', { class: 'count' }, `×${count(s, id)}`),
          this.button(t('Cook'), () => this.api.cook(id), { disabled: !canCook(s, id) }));
      })));
  }

  private market(s: GameState, isle: IsleId) {
    const m = MARKETS[isle];
    if (!m || !marketOpen(s, isle)) return this.close();
    const tabs = h('div', { class: 'tabs' },
      this.button(t('Sell'), () => { this.marketTab = 'sell'; }, { kind: this.marketTab === 'sell' ? 'on' : '' }),
      this.button(t('Buy'), () => { this.marketTab = 'buy'; }, { kind: this.marketTab === 'buy' ? 'on' : '' }));
    const owner = CREW[m.owner].name;
    let body: Node;
    if (this.marketTab === 'sell') {
      const items = (Object.keys(s.items) as ItemId[]).filter(id => sellPrice(isle, id) > 0 && count(s, id) > 0);
      body = items.length ? h('div', { class: 'list' }, ...items.map(id => h('div', { class: 'row' }, h('span', { class: 'big' }, itemIcon(id)),
        h('div', { class: 'grow' }, h('b', {}, t(ITEMS[id].name)), h('small', {}, `✦ ${sellPrice(isle, id)} ${ITEMS[id].kind === m.likes ? `· ${t('they love it!')}` : ''}`)),
        h('span', { class: 'count' }, `×${count(s, id)}`),
        this.button(t('Sell 1'), () => this.api.sell(isle, id, 1)), this.button(t('All'), () => this.api.sell(isle, id, count(s, id)))))) : h('p', { class: 'hint' }, t('Nothing to sell.'));
    } else {
      body = h('div', { class: 'list' }, ...(Object.entries(m.sells) as [ItemId, number][]).map(([id, price]) => h('div', { class: 'row' }, h('span', { class: 'big' }, itemIcon(id)),
        h('div', { class: 'grow' }, h('b', {}, t(ITEMS[id].name)), h('small', {}, id.startsWith('seed_') ? t(KIND_LABEL[TREES[id.slice(5) as TreeId].kind === 'decor' ? 'seed' : TREES[id.slice(5) as TreeId].kind as ItemKind]) : t(KIND_LABEL[ITEMS[id].kind]))),
        h('span', { class: 'count' }, `×${count(s, id)}`),
        this.button(`✦ ${price}`, () => this.api.buy(isle, id), { disabled: s.glimmer < price }))));
    }
    return this.frame(t(m.name), h('p', { class: 'hint' }, `${t(owner)}: ${t('pays ×1.5 for {kind}', { kind: t(KIND_LABEL[m.likes]) })} · ✦ ${s.glimmer}`), tabs, body);
  }

  private bag(s: GameState) {
    const kinds: ItemKind[] = ['whale', 'people', 'meal', 'fish', 'craft', 'seed'];
    const deck = this.api.onDeck();
    return this.frame(t('Bag'),
      h('p', { class: 'hint' }, `✦ ${s.glimmer} ${t('glimmer')} · HP ${Math.ceil(s.hero.hp)}/${maxHp(s)}`),
      ...kinds.map(kind => {
        const ids = (Object.keys(s.items) as ItemId[]).filter(id => ITEMS[id].kind === kind && count(s, id) > 0);
        if (!ids.length) return null;
        return h('section', {}, h('h3', {}, t(KIND_LABEL[kind])), h('div', { class: 'grid' }, ...ids.map(id => h('div', { class: 'cell', title: t(ITEMS[id].name) },
          h('span', { class: 'big' }, itemIcon(id)), h('small', {}, t(ITEMS[id].name)), h('b', {}, `×${count(s, id)}`),
          ITEMS[id].eat ? this.button(t('Eat'), () => this.api.eat(id)) : null,
          canFeed(id) && deck ? this.button(t('Feed'), () => this.api.feed(id)) : null))));
      }));
  }

  private journal(s: GameState) {
    const chapters: [string, boolean][] = [['Morning on a small whale', s.gear.rope], ['Clover Rise', s.isles.clover.freed], ['Lantern Reef', s.isles.reef.freed], ['Ember Peaks', s.isles.ember.freed], ['The Grey Star', s.isles.star.freed]];
    return this.frame(t('Journal'),
      h('h3', {}, t('Chapters')),
      h('ol', { class: 'chapters' }, ...chapters.map(([name, done]) => h('li', { class: done ? 'done' : '' }, `${done ? '✔ ' : ''}${t(name)}`))),
      h('h3', {}, t('Crew aboard Bao')),
      h('div', { class: 'list' }, ...s.crew.map(id => h('div', { class: 'row' }, h('span', { class: 'dot', style: { background: CREW[id].color } }), h('div', { class: 'grow' }, h('b', {}, t(CREW[id].name)), h('small', {}, t(CREW[id].job)))))),
      h('h3', {}, t('Rescued')),
      h('p', {}, s.rescued.length ? s.rescued.map(id => t(CREW[id].name)).join(', ') : t('No one yet.')),
      h('h3', {}, t('Records')),
      h('div', { class: 'stats' }, stat(t('Isles freed'), String(s.stats.freed)), stat(t('Fish caught'), String(s.stats.fish)), stat(t('Fruit picked'), String(s.stats.harvested)), stat(t('Voyages'), String(s.stats.voyages)), stat(t('Raids won'), String(s.stats.raidsWon)), stat(t('Level'), String(s.hero.level))));
  }

  private settings() {
    const v = getVolume(), api = this.api;
    const slider = (label: string, value: number, on: (v: number) => void) => h('label', { class: 'slider' }, h('span', {}, label), h('input', { type: 'range', min: 0, max: 100, value: Math.round(value * 100), oninput: (e: Event) => on(Number((e.target as HTMLInputElement).value) / 100) }));
    const code = h('textarea', { class: 'code', rows: 3, placeholder: t('Paste a save code here') }) as HTMLTextAreaElement;
    return this.frame(t('Settings'),
      h('div', { class: 'acts' },
        this.button('English', () => { setLanguage('en'); }, { kind: language() === 'en' ? 'on' : '' }),
        this.button('Tiếng Việt', () => { setLanguage('vi'); }, { kind: language() === 'vi' ? 'on' : '' })),
      slider(t('Sound'), v.sfx, x => setVolume('sfx', x)),
      slider(t('Music'), v.music, x => setVolume('music', x)),
      h('div', { class: 'acts' },
        this.button(api.settings.shake ? t('Screen shake: on') : t('Screen shake: off'), () => api.settings.setShake(!api.settings.shake))),
      h('h3', {}, t('Graphics')),
      h('div', { class: 'acts' }, ...(['auto', 'high', 'medium', 'low'] as const).map(g => this.button(t(({ auto: 'Auto', high: 'Sharp', medium: 'Balanced', low: 'Battery saver' } as const)[g]), () => api.settings.setGraphics(g), { kind: api.settings.graphics === g ? 'on' : '' }))),
      h('h3', {}, t('Save code')),
      h('p', { class: 'hint' }, t('Keep a copy of your adventure, or move it to another device.')),
      code,
      h('div', { class: 'acts' },
        this.button(t('Make code'), () => { code.value = api.exportSave(); code.select(); }),
        this.button(t('Load code'), () => { if (!api.importSave(code.value)) code.value = t('That code did not work.'); })),
      h('h3', {}, t('More')),
      h('div', { class: 'acts' },
        this.button(t('Replay the prologue'), () => { this.close(); api.replayPrologue(); }),
        this.button(t('Start over'), () => { if (confirm(t('Start a new adventure? Your current one will be lost.'))) api.reset(); }, { kind: 'danger' })),
      h('p', { class: 'hint credits' }, t('Cloudback · made with Three.js · original art and sound')));
  }
}

function stat(label: string, value: string) { return h('div', { class: 'stat' }, h('small', {}, label), h('b', {}, value)); }
