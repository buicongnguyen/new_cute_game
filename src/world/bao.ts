import * as T from 'three';
import { DECK, STAGES, type CrewId } from '../rules/content.ts';
import type { GameState } from '../rules/state.ts';
import { treeStage } from '../rules/garden.ts';
import { findChild, part, standIn, whole } from './assets.ts';
import { makeToon } from './look.ts';
import { Actor } from './actors.ts';
import { makeRng } from '../core/rng.ts';

/**
 * Bao and its back. The deck (the walkable top of the back) is at y = 0 with the head toward −z; the whale's
 * model hangs below it. Everything on the deck is placed in calf-size metres times the stage scale, so the back
 * "stretches" when Bao grows (design §3).
 */
export class Bao {
  root = new T.Group();
  whale = new T.Group();
  deck = new T.Group();
  private model: T.Object3D;
  private tail: T.Object3D | null; private finL: T.Object3D | null; private finR: T.Object3D | null;
  private eyes: T.Object3D[] = [];
  blowhole = new T.Vector3(0, 1.2, -6.5);
  mouth = new T.Vector3(0, -1.2, -10.5);
  scale = 1;
  private scaleTarget = 1;
  private t = 0;
  private blinkAt = 2;
  private happyFor = 0;
  /** Plot views by index. */
  plots: PlotView[] = [];
  props: Record<string, T.Object3D> = {};
  posts: T.Object3D[] = [];
  specks: T.Object3D[] = [];
  crew = new Map<CrewId, Actor>();
  /** Keepsakes (they only decorate) and Tam's anvil. */
  private lanterns: T.Object3D[] = [];
  private crown = new T.Group();
  private anvil: T.Object3D | null = null;

  constructor() {
    const model = whole('whale') ?? fallbackWhale();
    this.model = model;
    // The model faces +z; Bao flies toward −z.
    this.model.rotation.y = Math.PI;
    this.whale.add(this.model);
    this.tail = findChild(this.model, 'tail'); this.finL = findChild(this.model, 'fin_l'); this.finR = findChild(this.model, 'fin_r');
    for (const n of ['eye_l', 'eye_r']) { const e = findChild(this.model, n); if (e) this.eyes.push(e); }
    const bh = findChild(this.model, 'blowhole'), mo = findChild(this.model, 'mouth');
    this.model.updateMatrixWorld(true);
    if (bh) bh.getWorldPosition(this.blowhole);
    if (mo) mo.getWorldPosition(this.mouth);
    this.model.traverse(o => { const m = o as T.Mesh; if (m.isMesh) { m.receiveShadow = true; m.castShadow = false; } });
    this.root.add(this.whale, this.deck);
    this.buildProps();
  }

  private buildProps() {
    const make = (name: string, fallback: () => T.Object3D, shadows = true) => {
      const o = part('props', name, { shadows }) ?? fallback();
      this.deck.add(o); this.props[name] = o; return o;
    };
    make('hatch', fallbackHatch, false);
    make('workbench', () => standIn('box', '#c77a3a', 1.1));
    make('kitchen', () => standIn('box', '#ff8a2a', 1.0));
    make('maptable', () => standIn('box', '#8a4b25', .9));
    make('ropepost', () => standIn('pillar', '#c77a3a', .5));
    make('fishspot', () => standIn('box', '#e3a05a', .7), false);
    make('pantry', () => standIn('box', '#f2b33d', .8));
    for (let i = 0; i < DECK.posts.length; i++) {
      const p = part('props', 'chimepost', { shadows: true }) ?? standIn('pillar', '#ffc83a', .6);
      p.visible = false; this.deck.add(p); this.posts.push(p);
    }
    for (let i = 0; i < 5; i++) {
      const sp = part('props', 'speck') ?? standIn('blob', '#8c86a8', .35);
      sp.visible = false; this.deck.add(sp); this.specks.push(sp);
    }
    for (let i = 0; i < 10; i++) { const pv = new PlotView(); this.plots.push(pv); this.deck.add(pv.group); }
    for (let i = 0; i < 8; i++) { const l = part('props', 'lantern') ?? standIn('box', '#ffb13b', .35); l.visible = false; this.deck.add(l); this.lanterns.push(l); }
    const kinds = ['flower_a', 'flower_b', 'flower_c'];
    for (let i = 0; i < 7; i++) { const f = part('nature', kinds[i % 3]) ?? standIn('blob', '#ff5c8a', .4); f.position.set((i - 3) * .55, 0, Math.abs(i - 3) * .18); this.crown.add(f); }
    this.crown.visible = false; this.deck.add(this.crown);
    this.anvil = part('props', 'forge', { shadows: true });
    if (this.anvil) { this.anvil.scale.setScalar(.55); this.anvil.visible = false; this.deck.add(this.anvil); }
  }

  /** Deck metres at the current stage for a calf-size position. */
  at(p: readonly [number, number] | number[], out = new T.Vector3()) { return out.set(p[0] * this.scale, 0, p[1] * this.scale); }
  /** Half-axes of the walkable ellipse now. */
  half() { return [DECK.half[0] * this.scale, DECK.half[1] * this.scale] as const; }

  setStage(stage: number, instant = false) {
    this.scaleTarget = STAGES[stage].scale;
    if (instant) { this.scale = this.scaleTarget; this.layout(); }
  }
  get growing() { return Math.abs(this.scale - this.scaleTarget) > .002; }

  private layout() {
    this.whale.scale.setScalar(this.scale);
    const put = (name: string, p: readonly [number, number], rot = 0) => { const o = this.props[name]; if (o) { this.at(p, o.position); o.rotation.y = rot; } };
    put('hatch', DECK.hatch, .4); put('workbench', DECK.workbench, -Math.PI / 2); put('kitchen', DECK.kitchen, -Math.PI / 2);
    put('maptable', DECK.maptable, .3); put('ropepost', DECK.ropepost, -Math.PI / 2); put('fishspot', DECK.fishspot, Math.PI); put('pantry', DECK.pantry, Math.PI / 2);
    this.posts.forEach((p, i) => this.at(DECK.posts[i], p.position));
    this.plots.forEach((pv, i) => this.at(DECK.plots[i], pv.group.position));
    this.lanterns.forEach((l, i) => { const a = i / this.lanterns.length * Math.PI * 2 + .2; l.position.set(Math.cos(a) * DECK.half[0] * .93 * this.scale, 0, Math.sin(a) * DECK.half[1] * .93 * this.scale); });
    this.at([0, -7.3], this.crown.position);
    if (this.anvil) { this.at([DECK.workbench[0] - .2, DECK.workbench[1] - 1.35], this.anvil.position); this.anvil.rotation.y = -Math.PI / 2; }
    const rng = makeRng('specks');
    this.specks.forEach(sp => { const a = rng.next() * Math.PI * 2, r = .3 + rng.next() * .55; sp.position.set(Math.cos(a) * DECK.half[0] * r * this.scale, 0, Math.sin(a) * DECK.half[1] * r * this.scale); sp.rotation.y = rng.next() * 6; });
  }

  /** Mirror the save into the view (cheap: only visibility and models that changed). */
  sync(s: GameState, raidActive: boolean) {
    this.props.kitchen.visible = s.crew.includes('mina');
    if (this.anvil) this.anvil.visible = s.crew.includes('tam');
    for (const l of this.lanterns) l.visible = s.keepsakes.includes('lanterns');
    this.crown.visible = s.keepsakes.includes('crown');
    this.posts.forEach((p, i) => { p.visible = s.posts.includes(i); });
    this.specks.forEach((sp, i) => { sp.visible = i < s.whale.specks; });
    this.plots.forEach((pv, i) => pv.sync(s.plots[i], i < s.plots.length));
    // During a raid the crew climb down the hatch (the game walks them there and hides them).
    for (const [id, actor] of this.crew) if (!raidActive) actor.root.visible = s.crew.includes(id);
  }

  happy() { this.happyFor = .9; }
  /** Opens the hatch's gate for a moment (entering or leaving the cabin, the crew hiding in a raid). */
  openHatch(seconds = 1.2) { this.hatchOpen = seconds; }
  private hatchOpen = 0;

  update(dt: number, mood: number) {
    this.t += dt;
    if (this.growing) {
      this.scale += (this.scaleTarget - this.scale) * (1 - Math.exp(-2.2 * dt));
      if (!this.growing) this.scale = this.scaleTarget;
      this.layout();
    }
    const t = this.t;
    if (this.tail) this.tail.rotation.x = Math.sin(t * 1.05) * .2;
    if (this.finL) this.finL.rotation.z = Math.sin(t * 1.3) * .22;
    if (this.finR) this.finR.rotation.z = -Math.sin(t * 1.3) * .22;
    this.model.position.y = Math.sin(t * .7) * .015;
    // Eyes: a blink every few seconds, happy squints after a treat, a droop when sad.
    this.happyFor = Math.max(0, this.happyFor - dt);
    if (t > this.blinkAt) this.blinkAt = t + 2.5 + Math.abs(Math.sin(t * 7.3)) * 3;
    const blink = this.blinkAt - t < .12 ? .12 : 1;
    const eyeY = this.happyFor > 0 ? .35 : mood < 25 ? .7 : 1;
    for (const e of this.eyes) e.scale.y = Math.min(blink, eyeY);
    for (const [, a] of this.crew) a.update(dt);
    this.hatchOpen = Math.max(0, this.hatchOpen - dt);
    const door = findChild(this.props.hatch, 'door');
    if (door) door.rotation.x += ((this.hatchOpen > 0 ? -1.9 : 0) - door.rotation.x) * (1 - Math.exp(-9 * dt));
    for (const pv of this.plots) pv.update(dt, t);
  }

  /** World position of the deck's front edge, where fruit is tossed to Bao's mouth. */
  feedSpot(out = new T.Vector3()) { return this.at(DECK.feed, out); }
}

/** A rounded whale built in code, used only when whale.glb is missing. */
export function fallbackWhale() {
  const g = new T.Group();
  const prof: T.Vector2[] = [];
  for (let i = 0; i <= 24; i++) { const k = i / 24, r = Math.sin(Math.PI * Math.pow(k, .8)) * 4.6 + .05; prof.push(new T.Vector2(r, (k - .5) * 22)); }
  const geo = new T.LatheGeometry(prof, 32).rotateX(Math.PI / 2);
  geo.scale(1, .82, 1); geo.translate(0, -3.75, 0);
  const body = new T.Mesh(geo, makeToon('#3fa9f5')); body.name = 'body'; g.add(body);
  const belly = new T.Mesh(new T.SphereGeometry(4.2, 24, 12, 0, Math.PI * 2, Math.PI * .55, Math.PI * .45), makeToon('#fff0d6'));
  belly.scale.set(.95, .8, 2.3); belly.position.y = -3.6; g.add(belly);
  const moss = new T.Mesh(new T.CylinderGeometry(1, 1, .3, 40), makeToon('#5fcb45'));
  moss.scale.set(4.5, 1, 8.2); moss.position.y = -.12; g.add(moss);
  const tail = new T.Group(); tail.name = 'tail'; tail.position.set(0, -2.5, -10.5);
  const fluke = new T.Mesh(new T.ConeGeometry(2.6, 4.5, 4).rotateX(-Math.PI / 2), makeToon('#2477d6')); fluke.scale.set(1.6, .25, 1); fluke.position.z = -2; tail.add(fluke); g.add(tail);
  for (const side of [-1, 1]) {
    const fin = new T.Group(); fin.name = side < 0 ? 'fin_l' : 'fin_r'; fin.position.set(side * 4.3, -4, 3);
    const f = new T.Mesh(new T.SphereGeometry(1.5, 12, 8), makeToon('#2477d6')); f.scale.set(1.9, .3, 1); f.position.x = side * 1.6; fin.add(f); g.add(fin);
    const eye = new T.Group(); eye.name = side < 0 ? 'eye_l' : 'eye_r'; eye.position.set(side * 3.2, -2.6, 8.4);
    const w = new T.Mesh(new T.SphereGeometry(.85, 16, 12), makeToon('#ffffff')); eye.add(w);
    const pupil = new T.Mesh(new T.SphereGeometry(.5, 12, 10), makeToon('#1a1d33')); pupil.position.set(side * .25, 0, .5); eye.add(pupil);
    g.add(eye);
    const cheek = new T.Mesh(new T.SphereGeometry(.6, 10, 8), makeToon('#ff7fa8')); cheek.scale.set(1, .5, .3); cheek.position.set(side * 3.4, -3.8, 8.4); g.add(cheek);
  }
  const mouth = new T.Object3D(); mouth.name = 'mouth'; mouth.position.set(0, -4.6, 10.6); g.add(mouth);
  const bh = new T.Object3D(); bh.name = 'blowhole'; bh.position.set(0, .2, 6.6); g.add(bh);
  return g;
}

/** One moss patch and its tree (three stages, fruit shown when ripe, a Gloom crust after a raid). */
export class PlotView {
  group = new T.Group();
  private patch: T.Object3D;
  private tree: T.Object3D | null = null;
  private treeKey = '';
  private fruits: T.Object3D | null = null;
  private crust: T.Object3D;
  private ripe = false;
  private pop = 0;
  private soilY = 0;
  constructor() {
    // Wooden planter boxes on the deck (the moss patch disc is the fallback).
    const planter = part('props', 'planter', { shadows: true });
    this.patch = planter ?? part('trees', 'plot') ?? (() => { const m = new T.Mesh(new T.CylinderGeometry(.72, .78, .12, 24), makeToon('#3e9e36')); m.position.y = .06; return m; })();
    const soil = planter ? findChild(planter, 'soil') : null;
    this.soilY = soil ? soil.position.y : planter ? .27 : 0;
    this.crust = part('gloom', 'cage') ? crustShards() : crustShards();
    this.crust.visible = false;
    this.group.add(this.patch, this.crust);
  }
  sync(p: GameState['plots'][number] | undefined, active: boolean) {
    this.group.visible = active;
    if (!active || !p) return;
    const stage = treeStage(p);
    const key = p.tree && stage !== 'none' ? `${p.tree}_${stage}` : '';
    if (key !== this.treeKey) {
      if (this.tree) this.group.remove(this.tree);
      this.tree = key ? (part('trees', key, { shadows: true }) ?? standIn('tree', '#4fbf3a', stage === 'sprout' ? .35 : stage === 'young' ? .7 : 1.2)) : null;
      this.fruits = this.tree ? findChild(this.tree, 'fruits') : null;
      if (this.tree) { this.tree.position.y = this.soilY; this.group.add(this.tree); this.pop = .25; }
      this.treeKey = key;
    }
    const ripe = p.phase === 'ripe';
    if (this.fruits) this.fruits.visible = ripe;
    if (ripe && !this.ripe) this.pop = .25;
    this.ripe = ripe;
    this.crust.visible = p.crust > 0;
  }
  update(dt: number, t: number) {
    if (this.pop > 0) this.pop = Math.max(0, this.pop - dt);
    if (this.tree) {
      const s = 1 + Math.sin((1 - this.pop / .25) * Math.PI) * (this.pop > 0 ? .12 : 0);
      this.tree.scale.set(s, s, s);
      this.tree.rotation.z = Math.sin(t * 1.4 + this.group.position.x) * .02;
    }
  }
}

/** A round hatch with a hinged wooden gate (before props.glb has one). */
function fallbackHatch() {
  const g = new T.Group();
  const rim = new T.Mesh(new T.TorusGeometry(.78, .12, 10, 28).rotateX(Math.PI / 2), makeToon('#f5b21e')); rim.position.y = .08; g.add(rim);
  const hole = new T.Mesh(new T.CircleGeometry(.72, 28).rotateX(-Math.PI / 2), makeToon('#1a1d33')); hole.position.y = .03; g.add(hole);
  const door = new T.Group(); door.name = 'door'; door.position.set(0, .14, -.75);
  const lid = new T.Mesh(new T.CylinderGeometry(.74, .74, .1, 28), makeToon('#c77a3a')); lid.position.z = .75; door.add(lid);
  g.add(door);
  return g;
}

function crustShards() {
  const g = new T.Group(), mat = makeToon('#8c86a8', { emissive: '#2a1840' }), rng = makeRng('crust');
  for (let i = 0; i < 6; i++) {
    const m = new T.Mesh(new T.OctahedronGeometry(.25 + rng.next() * .2, 0), mat);
    const a = i / 6 * Math.PI * 2;
    m.position.set(Math.cos(a) * .45, .2 + rng.next() * .5, Math.sin(a) * .45); m.scale.y = 1.6; m.rotation.set(rng.next(), rng.next(), rng.next() * .5);
    g.add(m);
  }
  return g;
}
