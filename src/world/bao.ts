import * as T from 'three';
import { DECK, EXTENSIONS, LIFT, STAGES, type CrewId } from '../rules/content.ts';
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
  /**
   * Battle stations (the owner's ship-battle raids): the garden and every fitting sink below the deck and are then not
   * drawn at all while the fight lasts; the gongs rise in their place. The hatch, posts and specks stay.
   */
  stow = new T.Group();
  gongs: T.Object3D[] = [];
  private battleK = 0;
  private battleTarget = 0;
  battle(on: boolean) { this.battleTarget = on ? 1 : 0; }
  get stowed() { return this.battleK > .97; }
  /** Wobbles a gong's disc after it is rung. */
  ringGong(i: number) { const g = this.gongs[i]; if (g) g.userData.ring = 1; }
  /** Juno's chime cannon (it stays up at battle stations) and Bao's boarding plank (out when a Gloom ship is alongside). */
  cannon: T.Object3D | null = null;
  plank: T.Object3D | null = null;
  plankOut = false;
  /** The scooter is flying (its parked copy is hidden). */
  droneOut = false;
  private liftK = 0; private liftTarget = 0; private crateOpen = 0; private recoil = 0;
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
    this.deck.add(this.stow, this.extGroup);
    this.root.add(this.whale, this.deck);
    this.buildProps();
  }

  private buildProps() {
    const make = (name: string, fallback: () => T.Object3D, shadows = true) => {
      const o = part('props', name, { shadows }) ?? fallback();
      (name === 'hatch' ? this.deck : this.stow).add(o); this.props[name] = o; return o;
    };
    make('hatch', fallbackHatch, false);
    make('workbench', () => standIn('box', '#c77a3a', 1.1));
    make('maptable', () => standIn('box', '#8a4b25', .9));
    make('ropepost', () => standIn('pillar', '#c77a3a', .5));
    make('crate', () => standIn('box', '#c98a4a', .9));
    make('drone_pad', () => standIn('box', '#e3a05a', .5));
    // The Sky Scooter parked on its pad (the game flies its own copy).
    make('drone', () => standIn('box', '#2fb0a8', .6));
    make('lift', () => standIn('pillar', '#c77a3a', .6));
    make('pantry', () => standIn('box', '#f2b33d', .8));
    for (let i = 0; i < DECK.posts.length; i++) {
      const p = part('props', 'chimepost', { shadows: true }) ?? standIn('pillar', '#ffc83a', .6);
      p.visible = false; this.deck.add(p); this.posts.push(p);
    }
    for (let i = 0; i < 5; i++) {
      const sp = part('props', 'speck') ?? standIn('blob', '#8c86a8', .35);
      sp.visible = false; this.deck.add(sp); this.specks.push(sp);
    }
    for (let i = 0; i < DECK.plots.length; i++) { const pv = new PlotView(); this.plots.push(pv); this.stow.add(pv.group); }
    for (let i = 0; i < 8; i++) { const l = part('props', 'lantern') ?? standIn('box', '#ffb13b', .35); l.visible = false; this.stow.add(l); this.lanterns.push(l); }
    for (let i = 0; i < DECK.gongs.length; i++) { const g = part('props', 'gong', { shadows: true }) ?? fallbackGong(); g.visible = false; this.deck.add(g); this.gongs.push(g); }
    const kinds = ['flower_a', 'flower_b', 'flower_c'];
    for (let i = 0; i < 7; i++) { const f = part('nature', kinds[i % 3]) ?? standIn('blob', '#ff5c8a', .4); f.position.set((i - 3) * .55, 0, Math.abs(i - 3) * .18); this.crown.add(f); }
    this.crown.visible = false; this.stow.add(this.crown);
    this.cannon = part('props', 'chime_cannon', { shadows: true }) ?? standIn('box', '#d9a441', .8);
    this.cannon.visible = false; this.deck.add(this.cannon);
    this.plank = part('props', 'bao_plank', { shadows: true }) ?? standIn('box', '#c98a4a', .5);
    this.plank.visible = false; this.deck.add(this.plank);
    this.anvil = part('props', 'forge', { shadows: true });
    if (this.anvil) { this.anvil.scale.setScalar(.55); this.anvil.visible = false; this.stow.add(this.anvil); }
  }

  /** Deck metres at the current stage for a calf-size position. */
  at(p: readonly [number, number] | number[], out = new T.Vector3()) { return out.set(p[0] * this.scale, 0, p[1] * this.scale); }
  /** Half-axes of the walkable ellipse now. */
  half() { const [ax, bz] = this.calfHalf(); return [ax * this.scale, bz * this.scale] as const; }
  /** Deck extensions built (0–3): the walkable oval, in calf metres. */
  deckTier = 0;
  calfHalf() { const e = EXTENSIONS[this.deckTier].half; return [DECK.half[0] + e[0], DECK.half[1] + e[1]] as const; }
  /** The fishing lift and the boarding plank sit on the starboard rail, wherever the rail is now. */
  liftCalf(): [number, number] { const [a, b] = this.calfHalf(), z = DECK.lift[1]; return [a * Math.sqrt(1 - (z / b) ** 2) - .1, z]; }
  plankCalf(): [number, number] { const [a, b] = this.calfHalf(), z = DECK.plank[1]; return [a * Math.sqrt(1 - (z / b) ** 2) - .4, z]; }
  /** Builds the wooden deck extensions bolted round Bao's rim (one ring per tier, each from the oval before it). */
  setDeck(tier: number) {
    tier = Math.max(0, Math.min(3, tier));
    if (tier === this.deckTier && this.extGroup.children.length === tier) return;
    this.deckTier = tier;
    this.extGroup.clear();
    for (let i = 1; i <= tier; i++) {
      const a0 = DECK.half[0] + EXTENSIONS[i - 1].half[0], b0 = DECK.half[1] + EXTENSIONS[i - 1].half[1];
      const a1 = DECK.half[0] + EXTENSIONS[i].half[0] + .15, b1 = DECK.half[1] + EXTENSIONS[i].half[1] + .15;
      this.extGroup.add(deckRing(a0 - .1, b0 - .1, a1, b1, i === tier, i));
    }
    // The whale's own gunwale and weed sit inside the first extension: hide them, so the planks run on unbroken.
    const rim = findChild(this.model, 'rim'); if (rim) rim.visible = tier === 0;
    this.layout();
  }
  private extGroup = new T.Group();

  setStage(stage: number, instant = false) {
    this.scaleTarget = STAGES[stage].scale;
    if (instant) { this.scale = this.scaleTarget; this.layout(); }
  }
  get growing() { return Math.abs(this.scale - this.scaleTarget) > .002; }

  private layout() {
    this.whale.scale.setScalar(this.scale);
    const put = (name: string, p: readonly [number, number], rot = 0) => { const o = this.props[name]; if (o) { this.at(p, o.position); o.rotation.y = rot; } };
    put('drone_pad', DECK.dronePad, 0); put('drone', DECK.dronePad, Math.PI); if (this.props.drone) this.props.drone.position.y = .12;
    put('hatch', DECK.hatch, .4); put('workbench', DECK.workbench, -Math.PI / 2); put('crate', DECK.crate, -Math.PI / 2);
    put('maptable', DECK.maptable, .3); put('ropepost', DECK.ropepost, -Math.PI / 2); put('lift', this.liftCalf(), 0); put('pantry', DECK.pantry, Math.PI / 2);
    this.extGroup.scale.set(this.scale, 1, this.scale);
    if (this.cannon) this.at(DECK.cannon, this.cannon.position);
    // The plank leaves the starboard rail (its +z turned to +x).
    if (this.plank) { this.at(this.plankCalf(), this.plank.position); this.plank.rotation.y = Math.PI / 2; }
    this.posts.forEach((p, i) => this.at(DECK.posts[i], p.position));
    this.plots.forEach((pv, i) => this.at(DECK.plots[i], pv.group.position));
    this.lanterns.forEach((l, i) => { const a = i / this.lanterns.length * Math.PI * 2 + .2; l.position.set(Math.cos(a) * DECK.half[0] * .93 * this.scale, 0, Math.sin(a) * DECK.half[1] * .93 * this.scale); });
    this.at([0, -7.3], this.crown.position);
    this.gongs.forEach((g, i) => { this.at(DECK.gongs[i], g.position); g.rotation.y = i ? Math.PI : 0; });
    if (this.anvil) { this.at([DECK.workbench[0] - .2, DECK.workbench[1] - 1.35], this.anvil.position); this.anvil.rotation.y = -Math.PI / 2; }
    const rng = makeRng('specks');
    this.specks.forEach(sp => { const a = rng.next() * Math.PI * 2, r = .3 + rng.next() * .55; sp.position.set(Math.cos(a) * DECK.half[0] * r * this.scale, 0, Math.sin(a) * DECK.half[1] * r * this.scale); sp.rotation.y = rng.next() * 6; });
  }

  /** Mirror the save into the view (cheap: only visibility and models that changed). */
  sync(s: GameState, raidActive: boolean) {
    if (this.anvil) this.anvil.visible = s.crew.includes('tam');
    if (this.cannon) this.cannon.visible = s.crew.includes('juno');
    this.props.drone_pad.visible = s.gear.drone > 0; this.props.drone.visible = s.gear.drone > 0 && !this.droneOut;
    if (this.plank) this.plank.visible = this.plankOut;
    for (const l of this.lanterns) l.visible = s.keepsakes.includes('lanterns');
    this.crown.visible = s.keepsakes.includes('crown');
    this.posts.forEach((p, i) => { p.visible = s.posts.includes(i); });
    this.specks.forEach((sp, i) => { sp.visible = i < s.whale.specks; });
    this.plots.forEach((pv, i) => pv.sync(s.plots[i], i < s.plots.length));
    // During a raid the crew climb down the hatch (the game walks them there and hides them).
    for (const [id, actor] of this.crew) if (!raidActive) actor.root.visible = s.crew.includes(id);
  }

  happy() { this.happyFor = .9; }
  /** The fishing lift's platform: 0 at the deck, 1 down at the skiff (`drop` metres below). */
  lowerLift(k: number) { this.liftTarget = k; }
  get liftDown() { return this.liftK; }
  setLift(k: number) { this.liftK = this.liftTarget = k; this.poseLift(); }
  /** The skiff hangs 4 m under Bao's belly (deeper as Bao grows), so the whale shows overhead with the rope to it. */
  get liftDrop() { return LIFT.drop + 6.6 * this.scale; }
  private poseLift() {
    const lift = this.props.lift, platform = lift ? findChild(lift, 'platform') : null, rope = lift ? findChild(lift, 'rope') : null;
    const drop = this.liftK * this.liftDrop;
    if (platform) { platform.userData.y0 ??= platform.position.y; platform.position.y = (platform.userData.y0 as number) - drop; }
    if (rope) rope.scale.y = 1 + drop;
  }
  /** World position of the lift's platform top (where the Captain stands on the way down). */
  liftSpot(out = new T.Vector3()) { this.at(this.liftCalf(), out); out.x += 1.6; out.y = -this.liftK * this.liftDrop; return out; }
  /** The crate's lid lifts while the finches fly off. */
  openCrate() { this.crateOpen = 1.4; }
  /** Turns Juno's cannon toward a deck point and kicks the barrel back. */
  fireCannon(at: T.Vector3) {
    const c = this.cannon; if (!c) return;
    c.rotation.y = Math.atan2(at.x - c.position.x, at.z - c.position.z);
    this.recoil = 1;
  }
  /** Opens the hatch's gate for a moment (entering or leaving the cabin, the crew hiding in a raid). */
  openHatch(seconds = 1.2) { this.hatchOpen = seconds; }
  private hatchOpen = 0;
  private hatchDoor: T.Object3D | null | undefined;

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
    // Battle stations: sink and hide the stowed deck, raise the gongs (and the reverse after the raid).
    if (Math.abs(this.battleK - this.battleTarget) > .001) {
      this.battleK += (this.battleTarget - this.battleK) * (1 - Math.exp(-4.5 * dt));
      if (Math.abs(this.battleK - this.battleTarget) < .01) this.battleK = this.battleTarget;
      this.stow.position.y = -1.6 * this.battleK;
      this.stow.visible = this.battleK < .97;
      for (const g of this.gongs) { g.position.y = -2.4 * (1 - this.battleK); g.visible = this.battleK > .03; }
    }
    for (const g of this.gongs) {
      const ring = g.userData.ring as number | undefined;
      if (!ring) continue;
      g.userData.ring = Math.max(0, ring - dt * 1.4);
      const disc = findChild(g, 'disc');
      if (disc) disc.rotation.x = Math.sin(ring * 30) * .25 * ring;
    }
    this.hatchOpen = Math.max(0, this.hatchOpen - dt);
    const door = this.hatchDoor ??= findChild(this.props.hatch, 'door');
    if (door) door.rotation.x += ((this.hatchOpen > 0 ? -1.9 : 0) - door.rotation.x) * (1 - Math.exp(-9 * dt));
    for (const pv of this.plots) pv.update(dt, t);
    if (Math.abs(this.liftK - this.liftTarget) > .0005) { this.liftK += Math.sign(this.liftTarget - this.liftK) * Math.min(Math.abs(this.liftTarget - this.liftK), dt * 1.2); this.poseLift(); }
    this.crateOpen = Math.max(0, this.crateOpen - dt);
    const lid = this.props.crate ? (this.props.crate.userData.lid ??= findChild(this.props.crate, 'lid')) as T.Object3D | null : null;
    if (lid) lid.rotation.x += ((this.crateOpen > 0 ? -1.5 : 0) - lid.rotation.x) * (1 - Math.exp(-9 * dt));
    this.recoil = Math.max(0, this.recoil - dt * 3);
    const barrel = this.cannon ? (this.cannon.userData.barrel ??= findChild(this.cannon, 'barrel')) as T.Object3D | null : null;
    if (barrel) { barrel.userData.z0 ??= barrel.position.z; barrel.position.z = (barrel.userData.z0 as number) - this.recoil * .25; }
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

/** A gong on a frame (before props.glb has one). */
function fallbackGong() {
  const g = new T.Group(), wood = makeToon('#8a4b25');
  for (const side of [-1, 1]) { const post = new T.Mesh(new T.BoxGeometry(.14, 1.9, .14), wood); post.position.set(side * .75, .95, 0); g.add(post); }
  const top = new T.Mesh(new T.BoxGeometry(1.7, .16, .16), wood); top.position.y = 1.85; g.add(top);
  const disc = new T.Group(); disc.name = 'disc'; disc.position.y = 1.75;
  const face = new T.Mesh(new T.CylinderGeometry(.6, .6, .08, 28).rotateX(Math.PI / 2), makeToon('#f5b21e', { emissive: '#4a2a00' })); face.position.y = -.68; disc.add(face);
  g.add(disc);
  return g;
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

/**
 * One deck extension, built to continue Bao's own deck (build_whale.py): lengthwise planks 0.44 m wide on the same
 * columns as the deck's planks, honey and caramel (pal_wood_light / pal_wood) over dark seams, joints staggered from
 * plank to plank, nail dots at the joints, and on the outermost ring the same rounded dark gunwale with weed growing
 * over it. Everything is between the oval (a0, b0) and the oval (a1, b1), in calf metres; one draw call.
 */
const PLANK_W = 2 * 4.4 / 20, PLANK_GAP = .04, JOINT_GAP = .035;
function deckRing(a0: number, b0: number, a1: number, b1: number, outer: boolean, tier: number) {
  const pos: number[] = [], col: number[] = [], c = new T.Color();
  const quad = (p: number[][], hex: string) => { c.set(hex); for (const i of [0, 1, 2, 0, 2, 3]) { pos.push(...p[i]); col.push(c.r, c.g, c.b); } };
  const rng = makeRng(`deck-ext-${tier}`);
  const zIn = (x: number) => Math.abs(x) < a0 ? b0 * Math.sqrt(1 - (x / a0) ** 2) : 0;
  const zOut = (x: number) => Math.abs(x) < a1 ? b1 * Math.sqrt(1 - (x / a1) ** 2) : 0;
  // The dark wood under the planks (it shows in the seams), and a skirt down the outer edge.
  const seg = 96;
  for (let i = 0; i < seg; i++) {
    const t0 = i / seg * Math.PI * 2, t1 = (i + 1) / seg * Math.PI * 2, p = (a: number, b: number, t: number, y: number) => [Math.cos(t) * a, y, Math.sin(t) * b];
    quad([p(a0, b0, t0, -.03), p(a0, b0, t1, -.03), p(a1, b1, t1, -.03), p(a1, b1, t0, -.03)], '#8A4B25');
    quad([p(a1, b1, t0, -.03), p(a1, b1, t1, -.03), p(a1, b1, t1, -.5), p(a1, b1, t0, -.5)], '#7a4424');
  }
  // Planks: each column covers the ring where it lies outside the old oval and inside the new one.
  const first = Math.floor(-a1 / PLANK_W) - 1, last = Math.ceil(a1 / PLANK_W) + 1;
  for (let i = first; i <= last; i++) {
    const xa = i * PLANK_W + PLANK_GAP / 2, xb = (i + 1) * PLANK_W - PLANK_GAP / 2;
    if (Math.max(Math.abs(xa), Math.abs(xb)) >= a1 * .995) continue;
    for (const side of [-1, 1]) {
      // From the old rim (or the middle, for columns beyond it) out to the new rim, following the curves at both edges.
      const ia = zIn(xa), ib = zIn(xb), oa = zOut(xa), ob = zOut(xb);
      const startA = Math.abs(xa) < a0 && Math.abs(xb) < a0 ? ia : 0, startB = Math.abs(xa) < a0 && Math.abs(xb) < a0 ? ib : 0;
      if (startA === 0 && startB === 0 && side < 0) continue; // a full column is drawn once, from −z to +z
      const z0a = startA === 0 && startB === 0 ? -oa : startA, z0b = startA === 0 && startB === 0 ? -ob : startB;
      const len = Math.min(oa - z0a, ob - z0b);
      if (len < .2) continue;
      // Staggered joints, like the deck's own.
      const cuts = len > 3.2 ? [z0a + len * (.35 + rng.next() * .3)] : [];
      const edges = [0, ...cuts.map(z => z - z0a), len];
      for (let k = 0; k < edges.length - 1; k++) {
        const s0 = edges[k] + (k > 0 ? JOINT_GAP / 2 : 0), s1 = edges[k + 1] - (k < edges.length - 2 ? JOINT_GAP / 2 : 0);
        const last = k === edges.length - 2;
        const za0 = z0a + s0, zb0 = z0b + s0, za1 = last ? oa : z0a + s1, zb1 = last ? ob : z0b + s1;
        const sg = side < 0 && !(startA === 0 && startB === 0) ? -1 : 1;
        const hex = rng.next() < .34 ? '#C77A3A' : '#E3A05A';
        quad([[xa, 0, sg * za0], [xb, 0, sg * zb0], [xb, 0, sg * zb1], [xa, 0, sg * za1]], hex);
        if (k > 0) for (const xx of [xa + PLANK_W * .24, xb - PLANK_W * .24]) { const zz = sg * (za0 + .09), q = .028; quad([[xx - q, .004, zz - q], [xx + q, .004, zz - q], [xx + q, .004, zz + q], [xx - q, .004, zz + q]], '#4a4a55'); }
      }
    }
  }
  // The gunwale and the weed at the new edge (the whale's own rim is hidden while an extension is on).
  if (outer) {
    const ga = a1 * 1.005, gb = b1 * 1.005, r = .11, n = 128;
    for (let i = 0; i < n; i++) {
      const t0 = i / n * Math.PI * 2, t1 = (i + 1) / n * Math.PI * 2;
      for (let k = 0; k < 4; k++) {
        const u0 = k / 4 * Math.PI, u1 = (k + 1) / 4 * Math.PI;
        const v = (t: number, u: number) => { const nx = Math.cos(t) / ga, nz = Math.sin(t) / gb, L = Math.hypot(nx, nz); return [Math.cos(t) * ga + Math.cos(u) * r * nx / L, .02 + Math.sin(u) * r, Math.sin(t) * gb + Math.cos(u) * r * nz / L]; };
        quad([v(t0, u0), v(t1, u0), v(t1, u1), v(t0, u1)], '#8A4B25');
      }
    }
    const weed = ['#5fcb45', '#3e9e36', '#9be36a'];
    for (let i = 0; i < 90; i++) {
      const t = i / 90 * Math.PI * 2 + rng.next() * .05; if (rng.next() < .3) continue;
      const x = Math.cos(t) * ga, z = Math.sin(t) * gb, s = .16 + rng.next() * .14, dir = Math.atan2(z / gb, x / ga);
      const ox = Math.cos(dir), oz = Math.sin(dir), tx = -oz, tz = ox;
      quad([[x - tx * s - ox * s * .4, .14, z - tz * s - oz * s * .4], [x + tx * s - ox * s * .4, .14, z + tz * s - oz * s * .4], [x + tx * s * .6 + ox * s * 1.2, -.05, z + tz * s * .6 + oz * s * 1.2], [x - tx * s * .6 + ox * s * 1.2, -.05, z - tz * s * .6 + oz * s * 1.2]], weed[i % 3]);
    }
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new T.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  const m = new T.Mesh(g, makeToon('#ffffff', { vertexColors: true }));
  m.material.side = T.DoubleSide; m.receiveShadow = true; m.name = 'deck-extension';
  return m;
}
