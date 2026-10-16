import { eventsFor, type EventBus } from './core/events.ts';
import { syncStoryEvents } from './rules/story.ts';
import * as T from 'three';
import { GameLoop } from './core/loop.ts';
import { ActionMap } from './core/input.ts';
import { RngStreams } from './core/rng.ts';
import { damp } from './core/feel.ts';
import { verticalFovForAspect } from './core/camera.ts';
import { t } from './i18n.ts';
import { BELOW, CANNON, CONCH, DRONE, CREW, DECK, BEAST, HELPER, HELPERS, HIVES, HOME, ISLE_MAPS, ITEMS, KEEPER, LIFT, LIST, MARKETS, PLACES, POST, RAID, RECIPES, ROOMS, SKILL_NAMES, UPGRADES, VOYAGE, isLand, isShip,
  type CrewId, type FishId, type HelperId, type IsleId, type ItemId, type LandId, type MealId, type PlaceId, type RecipeId, type RoomId, type ShipId, type SkillId, type TreeId, type UpgradeId } from './rules/content.ts';
import { count, give, hasCrew, newGame, type GameState } from './rules/state.ts';
import { tickRules, catchUp } from './rules/tick.ts';
import { crustStored, harvest, plant, ringCrust, uproot } from './rules/garden.ts';
import { brush, canGrow, feed, feedAll, grow, pet } from './rules/whale.ts';
import { collectDew, collectTreasure, endRaid, startVoyage } from './rules/voyage.ts';
import { addXp, eat, heal, maxHp, quickEat, quickEatItem, ringDamage } from './rules/keeper.ts';
import { cageLocked, faint as rulesFaint, formFreed, freeCaptive, groupCleared, hiveBroken, hiveMaxHp, hiveShielded, mineOre, oreReady, pickWild, rescue, spireBroken, tierOf, wildReady, LEFTOVER_FORMS } from './rules/isle.ts';
import { buy, buyUpgrade, cook, craft, sell } from './rules/trade.ts';
import { repairRoom, shipCrate } from './rules/home.ts';
import { goal, raidPlan, type RaidPlan, type Where } from './rules/story.ts';
import { castFor, landFish, rollFish, takeBite } from './rules/fishing.ts';
import { FISH_POWER, ReelSim } from './rules/reel.ts';
import { HEART } from './rules/content.ts';
import { CABIN_LOOK, LOOKS, Lighting, GLOOM, NIGHT, addGloom, mixLook, type Look } from './world/look.ts';
import { Sky } from './world/sky.ts';
import { Fx } from './world/fx.ts';
import { Bao } from './world/bao.ts';
import { IsleView, type Blocker } from './world/isle-view.ts';
import { BeastShipView } from './world/beast-ship.ts';
import { Actor, walkTo } from './world/actors.ts';
import { Combat, flat, type Ground } from './world/combat.ts';
import { HiveFight, noteView } from './world/hive.ts';
import { CottageView, ROOM_DOORS, placementOf } from './world/cottage.ts';
import { HOUSE } from './world/house-plan.ts';
import { Keeper } from './world/keeper.ts';
import { findChild, part, whole } from './world/assets.ts';
import { makeToon } from './world/look.ts';
import { Hud, type HudView } from './ui/hud.ts';
import { Panels, type GameApi, type PanelKind } from './ui/panels.ts';
import { SCENES, CHATTER, type Line } from './dialogue.ts';
import { play, setMusic } from './sfx.ts';
import { saveGame, exportCode, importCode, saves } from './save-game.ts';
import { Governor } from './graphics.ts';

type Mode = 'deck' | 'isle' | 'house' | 'skiff' | 'ride' | 'drone' | 'cut';
type PlaceView = IsleView | BeastShipView;
interface Ship { ship: T.Object3D; plank: T.Object3D; out: T.Vector3; rim: T.Vector3; dock: T.Vector3; centre: T.Vector3; k: number; leaving: boolean }
interface Interactable { id: string; pos: T.Vector3; radius: number; label: string; icon: string; act: () => void; auto?: boolean }
interface Follower { who: CrewId; actor: Actor; boarding: boolean; t: number }
/** A crew mate fighting beside the Captain on a Gloom ship (they are never hurt). */
interface Helper { id: HelperId; actor: Actor; t: number; heal: number; side: number }
/** A family freed from a ship's hold, walking over the plank to Bao. */
interface Family { actors: Actor[]; cage: number; t: number }
/** A bell from Juno's chime cannon in flight. */
interface Shell { mesh: T.Object3D; from: T.Vector3; to: T.Vector3; t: number; deck: boolean }

/** Portrait screens use a wider lens and a little more distance (as Zoo Garden does), never the full horizontal-FOV rule, which went past 100°. */
const CAMERA = { fov: 40, portraitFov: 47, pitch: 47, deck: 19, isle: 22, house: 19, ship: 21, skiff: 15, skiffPitch: 6, portrait: 1.22 };
/** Where a land floats while Bao hovers over it: below and off to the side, so it shows past the whale. */
const ISLE_BELOW = new T.Vector3(30, -28, -18);

export class Game {
  renderer: T.WebGLRenderer;
  scene = new T.Scene();
  camera = new T.PerspectiveCamera(CAMERA.fov, 1, .5, 900);
  lighting: Lighting; sky: Sky; fx: Fx; bao: Bao;
  loop: GameLoop;
  keys = new ActionMap({ up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'], ring: ['Space'], spin: ['KeyQ'], hop: ['KeyE', 'ShiftLeft', 'ShiftRight'], interact: ['KeyF', 'Enter'], eat: ['KeyR'], conch: ['KeyC'] });
  state: GameState;
  events: EventBus;
  rng: RngStreams;
  hud: Hud; panels: Panels;
  keeper: Keeper;
  combat: Combat;
  hive: HiveFight | null = null;
  isles = new Map<IsleId, PlaceView>();
  isle: PlaceView | null = null;
  mode: Mode = 'deck';
  private followers: Follower[] = [];
  private helpers: Helper[] = [];
  private families: Family[] = [];
  private shells: Shell[] = [];
  private campNpc: Actor | null = null;
  private fishing: { state: 'off' | 'wait' | 'bite'; sim: ReelSim | null; pause: number; bobber: T.Object3D; line: T.Line; at: T.Vector3 };
  private dews: { o: T.Object3D; treasure: boolean; alive: boolean }[] = [];
  private raid: { plan: RaidPlan; wave: number; t: number; warn: number; total: number; postT: number[]; ships: Ship[]; queue: { kind: RaidPlan['waves'][number][number]; ship: number; t: number }[]; gongCd: number[] } | null = null;
  private interactables: Interactable[] = [];
  private nearby: Interactable | null = null;
  private focus = new T.Vector3();
  private zoom = 1;
  private paused = false;
  private saveT = 0;
  private hudT = 0;
  private gloomTarget = 1;
  private note: { o: T.Object3D; t: number } | null = null;
  private pod: T.Object3D[] = [];
  private chatter = new Map<CrewId, number>();
  private crewWander = new Map<CrewId, { at: T.Vector3; t: number }>();
  /** The fishing trip: the skiff on the cloud sea below Bao, and the lift ride down or up. */
  private skiff = new T.Group();
  private ride: { t: number; dur: number; up: boolean } | null = null;
  private cannonT = 0;
  /** The Grey Star's list: seconds into this side, and which rail is low. */
  private listT = 0; private listSide = 1;
  /** A nap in the bed makes the next bath count (Fresh). */
  private napped = false;
  governor: Governor;
  settings = { shake: true };
  onEnding: (() => void) | null = null;
  frozen = false;

  constructor(private canvas: HTMLCanvasElement, private uiRoot: HTMLElement, state: GameState) {
    this.state = state;
    this.events = eventsFor(state);
    this.rng = new RngStreams(state.seed + ':' + state.stats.voyages);
    this.renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.renderer.toneMapping = T.NoToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = T.PCFSoftShadowMap;
    this.governor = new Governor(this.renderer, this.lightingProxy());
    this.lighting = new Lighting(this.scene);
    this.governor.attach(this.lighting.sun);
    this.sky = new Sky();
    this.fx = new Fx(uiRoot.querySelector('#float-layer'));
    this.bao = new Bao();
    this.bao.setStage(state.whale.stage, true);
    this.buildSkiff();
    this.scene.add(this.sky.group, this.bao.root, this.fx.group, this.camera, this.cabin.group, this.ambientPod, this.skiff);
    try { this.settings.shake = localStorage.getItem('cloudback:shake') !== 'off'; } catch { /* default */ }
    if (matchMedia?.('(prefers-reduced-motion: reduce)').matches) this.settings.shake = false;
    this.fx.shakeScale = this.settings.shake ? 1 : 0;

    const deckGround = this.deckGround();
    this.keeper = new Keeper(state, this.fx, {
      strike: (o, f, r, d, spin) => this.strike(o, f, r, d, spin),
      target: (p, r) => this.target(p, r),
      aim: (p, r) => this.aim(p, r),
      hurt: () => play('hurt'),
      faint: () => this.onFaint(),
      sound: n => play(n),
    }, deckGround);
    this.scene.add(this.keeper.actor.root);
    this.combat = new Combat(this.fx, this.keeper, deckGround, {
      freed: (form, at, group, raid, reward) => this.onFreed(form, at, group, raid, reward),
      spire: (i, at) => this.onSpire(i, at),
      cage: (i, at) => this.onCage(i, at),
      captive: (i, at) => this.onCaptive(i, at),
      crust: at => { if (crustStored(this.state) >= 0) { this.fx.burst(at.clone().setY(.8), '#9a8cc8', 14); play('shield'); this.hud.toast(t('A raider on the hatch crusted a tree below deck!'), 'warn'); } },
      overboard: at => { this.state.glimmer += 1; play('dive'); this.fx.ring(at, '#ffffff', .3, 1.6, .35); },
      sound: n => play(n),
      freeze: s => this.loop.freeze(s),
    });
    this.scene.add(this.combat.group);
    this.fishing = this.makeFishing();
    this.makeCrew();
    for (let i = 0; i < 3; i++) { const o = part('props', 'skydew') ?? (() => { const m = new T.Mesh(new T.IcosahedronGeometry(.7, 1), makeToon('#ffffff', { emissive: '#3a4a7a' })); const g = new T.Group(); g.add(m); return g; })(); o.visible = false; this.scene.add(o); this.dews.push({ o, treasure: false, alive: false }); }

    this.hud = new Hud(uiRoot, {
      context: () => this.live() && this.useNearby(),
      ring: () => this.live() && this.keeper.ring(false), spin: () => this.live() && this.keeper.ring(true),
      hop: () => this.live() && this.keeper.hop(this.hud.stick.x || this.keeper.vel.x, this.hud.stick.z || this.keeper.vel.z),
      eat: () => this.live() && this.quickEat(), reel: (held: boolean) => { if (this.live() || !held) this.reel(held); },
      conch: () => this.live() && this.blowConch(),
      pull: () => this.live() && (this.mode === 'drone' ? this.landDrone() : this.pullRope()),
      open: p => this.openPanel(p),
      grow: () => this.doGrow(),
    });
    this.panels = new Panels(uiRoot, this.api());
    this.panels.onClose = () => { this.keys.blocked = false; };
    this.loop = new GameLoop({ step: dt => this.step(dt), render: (_, realDt) => this.render(realDt) });
    this.keys.attach(window);
    this.bindPointer();
    window.addEventListener('resize', () => this.resize());
    this.resize();
    // Start on Bao (a save made on an isle loads here, design §13.7); a new captain wakes in the cottage (main.ts).
    this.enterDeck(true);
  }

  private lightingProxy() { return { setShadowSize: (n: number) => { if (!this.lighting) return; this.lighting.sun.shadow.mapSize.set(n, n); this.lighting.sun.shadow.map?.dispose(); this.lighting.sun.shadow.map = null; } }; }

  // ------------------------------------------------------------- grounds
  private deckGround(): Ground {
    const blockers: Blocker[] = [];
    const k = (p: T.Vector3) => { const [a, b] = this.bao.half(); return (p.x / a) ** 2 + (p.z / b) ** 2; };
    return {
      height: () => 0,
      // Past the gunwale (raiders only; the Captain is held by clamp).
      outside: p => k(p) > 1,
      // Raiders walk on the deck; a knocked one slides on past the gunwale and goes overboard.
      formClamp: (p, knocked) => { const kk = k(p), most = knocked ? 1.4 : .94; if (kk > most) { const s = Math.sqrt(most / kk); p.x *= s; p.z *= s; } },
      clamp: p => {
        const [a, b] = this.bao.half(), ax = a - .55, bz = b - .7;
        const kk = (p.x / ax) ** 2 + (p.z / bz) ** 2;
        if (kk > 1) { const s = 1 / Math.sqrt(kk); p.x *= s; p.z *= s; }
      },
      get blockers() {
        return blockers;
      },
    } as Ground & { blockers: Blocker[] };
  }
  /** Obstacle lists are rebuilt at most every 0.2 s of game time (code review 15: they were rebuilt per form per step). */
  private blockMemo = new Map<string, { at: number; list: Blocker[] }>();
  private memoBlockers(key: string, build: () => Blocker[]) {
    const hit = this.blockMemo.get(key), now = this.loop?.gameTime ?? 0;
    if (hit && now - hit.at < .2 && now >= hit.at) return hit.list;
    const list = build(); this.blockMemo.set(key, { at: now, list }); return list;
  }
  /** Deck obstacles: the hatch, fittings, posts and grown trees; at battle stations only the hatch, posts, gongs and cannon. */
  private deckBlockers() {
    const s = this.state, list: Blocker[] = [];
    const add = (p: readonly [number, number], r: number) => { const v = this.bao.at(p); list.push({ x: v.x, z: v.z, r: r * this.bao.scale }); };
    add(DECK.hatch, .85);
    s.posts.forEach(i => add(DECK.posts[i], .3));
    if (hasCrew(s, 'juno')) add(DECK.cannon, .55);
    if (this.raid) { DECK.gongs.forEach(g => add(g, .55)); return list; }
    add(DECK.workbench, .65); add(DECK.maptable, .55); add(DECK.pantry, .5); add(DECK.ropepost, .3); add(DECK.crate, .55); add(this.bao.liftCalf(), .35);
    s.plots.forEach((p, i) => { if (p.tree && p.phase !== 'empty') add(DECK.plots[i], .32); });
    return list;
  }
  private isleGround(isle: PlaceView): Ground {
    const extra = (): Blocker[] => [
      ...this.combat.spires.filter(sp => !sp.broken).map(sp => ({ x: sp.pos.x, z: sp.pos.z, r: .75 })),
      ...this.combat.cages.filter(c => !c.open).map(c => ({ x: c.pos.x, z: c.pos.z, r: .8 })),
      ...(this.hive && !this.hive.broken ? [{ x: this.hive.pos.x, z: this.hive.pos.z, r: this.hive.radius }, ...this.hive.blockers()] : []),
    ];
    const memo = () => this.memoBlockers('isle', () => [...isle.blockers, ...extra()]);
    if (isle.kind === 'ship') return { height: () => 0, clamp: p => isle.clampInside(p), outside: p => isle.outside(p), formClamp: (p, k) => isle.formClamp(p, k), get blockers() { return memo(); } } as Ground;
    return { height: (x, z) => isle.height(x, z), clamp: p => isle.clampInside(p), get blockers() { return memo(); } } as Ground;
  }

  // -------------------------------------------------------------- scenes
  /**
   * Down the hatch into Nana's cottage (Zoo Garden's house), which floats in the open sky (the owner's wish: no black
   * void). `bed`: a new captain wakes up in the patchwork bed (chapter 1).
   */
  enterHouse(spawn: 'door' | 'bed' = 'door') {
    if (this.raid) { this.hud.toast(t('Not now: the Gloom is aboard!'), 'warn'); return; }
    const go = () => {
      this.mode = 'house';
      this.stopFishing();
      this.bao.root.visible = false; this.skiff.visible = false;
      for (const [, v] of this.isles) v.group.visible = false;
      this.sky.hole = null;
      this.syncCabin();
      this.cabin.group.visible = true;
      const g = this.cabinGround();
      this.keeper.bounds = g; this.combat.ground = g;
      if (spawn === 'bed') { const bed = placementOf('bed'); this.keeper.place((bed?.x ?? -8) + 1.25, (bed?.z ?? -6.7) + .9); this.keeper.actor.facing = Math.PI * .8; }
      else { const at = this.cabin.spawn(); this.keeper.place(at.x, at.z); }
      this.snapCamera(); this.applyLook();
      if (spawn === 'door') this.scene_('cabin');
    };
    if (spawn === 'bed') { go(); return; }
    this.bao.openHatch();
    this.cut(go);
  }
  private syncCabin() { this.cabin.sync(this.state.notes, this.state.crew, this.state.rooms); }
  private cabinGround(): Ground { const c = this.cabin; return { height: () => 0, clamp: p => c.clamp(p), get blockers() { return c.blockers; } } as Ground; }
  leaveHouse() { this.cut(() => this.enterDeck(false, 'hatch')); }

  enterDeck(first = false, from: 'rope' | 'hatch' | 'lift' | 'plank' = 'rope') {
    this.hideSparks();
    this.cabin.group.visible = false;
    this.skiff.visible = false; this.ride = null; this.bao.setLift(0);
    this.mode = 'deck';
    this.clearIsle();
    this.bao.root.position.set(0, 0, 0);
    this.bao.root.visible = true;
    const g = this.deckGround();
    Object.defineProperty(g, 'blockers', { get: () => this.memoBlockers('deck', () => this.deckBlockers()) });
    this.keeper.bounds = g; this.combat.ground = g;
    const post = this.bao.at(DECK.ropepost), hatch = this.bao.at(DECK.hatch), lift = this.bao.at(this.bao.liftCalf()), plank = this.bao.at(this.bao.plankCalf());
    if (first) this.keeper.place(0, 1.5);
    else if (from === 'hatch') { this.keeper.place(hatch.x + 1.2, hatch.z + .3); this.bao.openHatch(.9); }
    else if (from === 'lift') this.keeper.place(lift.x - 1, lift.z);
    else if (from === 'plank') this.keeper.place(plank.x - 1.2, plank.z);
    else this.keeper.place(post.x - 1.1, post.z + .4);
    this.keeper.fainted = false; this.keeper.actor.action = 'none';
    if (this.state.hero.hp <= 0) this.state.hero.hp = maxHp(this.state);
    // Chapter 1: the first time up the ladder.
    if (!first && from === 'hatch' && !this.state.story.flags.onDeck) { this.state.story.flags.onDeck = true; this.scene_('deck_first'); this.save(); }
    this.checkCanGrow();
    this.showIsleBelow();
    this.snapCamera();
    this.applyLook();
    this.syncDeck();
  }

  /** While Bao hovers over a land, the land floats below it; at a Gloom ship, the ship floats off the starboard rail. */
  private showIsleBelow() {
    for (const [, v] of this.isles) v.group.visible = false;
    this.sky.hole = null;
    this.bao.plankOut = false;
    if (this.state.voyage || this.state.place === 'dawnreach') { this.isle = null; return; }
    const id = this.state.place as IsleId, v = this.isleView(id);
    v.group.visible = true; v.setFar(true);
    if (v.kind === 'ship') {
      const rail = this.bao.half()[0] * .93;
      v.group.position.set(rail + 3.2 + BEAST.half[0], 0, this.bao.plankCalf()[1] * this.bao.scale);
      v.setFreed(this.state.isles[id].freed, true);
      this.bao.plankOut = !this.state.isles[id].freed;
      this.gloomTarget = 0; GLOOM.value = 0;
    } else {
      v.group.position.copy(ISLE_BELOW); v.rope.visible = false; v.group.scale.setScalar(1);
      this.sky.hole = { x: ISLE_BELOW.x, z: ISLE_BELOW.z, r: v.radius + 4 };
      this.gloomTarget = this.state.isles[id].freed ? 0 : 1; GLOOM.value = this.gloomTarget;
    }
    this.isle = v;
  }

  private isleView(id: IsleId): PlaceView {
    let v = this.isles.get(id);
    if (!v) { v = isShip(id) ? new BeastShipView(id) : new IsleView(id as LandId); this.isles.set(id, v); this.scene.add(v.group); }
    return v;
  }

  private clearIsle() {
    this.combat.clear();
    this.combat.onShip = false;
    for (const w of this.pod) this.scene.remove(w);
    this.pod = [];
    if (this.hive) { this.hive.dispose(); this.hive = null; }
    for (const f of this.followers) this.scene.remove(f.actor.root);
    this.followers = [];
    for (const h of this.helpers) this.scene.remove(h.actor.root);
    this.helpers = [];
    for (const f of this.families) for (const a of f.actors) this.scene.remove(a.root);
    this.families = [];
    for (const s of this.shells) this.scene.remove(s.mesh);
    this.shells = [];
    if (this.campNpc) { this.scene.remove(this.campNpc.root); this.campNpc = null; }
  }

  /** Slide down the rope: build the land's fight from the save (uncleared groups, standing Spires, closed cages). */
  descend() {
    const s = this.state, id = s.place as IsleId;
    if (s.voyage || s.place === 'dawnreach') { this.hud.toast(t('Only clouds below. Sail to a land first.'), 'warn'); return; }
    if (isShip(id)) { this.board(); return; }
    if (!s.gear.rope) { this.hud.toast(t('You need a Climbing Rope (Workbench, 3 Fibre).'), 'warn'); return; }
    this.cut(() => {
      this.mode = 'isle';
      const v = this.isleView(id) as IsleView, map = ISLE_MAPS[id], prog = s.isles[id], tier = tierOf(id);
      for (const [, o] of this.isles) o.group.visible = false;
      v.group.visible = true; v.group.position.set(0, 0, 0); v.rope.visible = true; v.setFar(false); this.sky.hole = null;
      this.isle = v;
      this.clearIsle();
      const g = this.isleGround(v);
      this.keeper.bounds = g; this.combat.ground = g; this.combat.formsTier = tier; this.combat.raidTarget = null;
      if (!prog.freed) {
        map.groups.forEach((grp, gi) => {
          if (prog.groups[gi]) return;
          grp.forms.forEach((f, i) => { const a = i / grp.forms.length * Math.PI * 2; this.combat.spawn(f, new T.Vector3(grp.at[0] + Math.cos(a) * 2, 0, grp.at[1] + Math.sin(a) * 2), tier, { group: gi }); });
        });
        map.spires.forEach((sp, i) => { if (!prog.spires[i]) this.combat.addSpire(i, new T.Vector3(sp[0], 0, sp[1]), tier); });
        this.makeHive(id, new T.Vector3(map.hive[0], v.height(map.hive[0], map.hive[1]), map.hive[1]));
      } else if (prog.leftover) {
        LEFTOVER_FORMS.forEach((f, i) => this.combat.spawn(f, new T.Vector3(map.groups[0].at[0] + i, 0, map.groups[0].at[1]), tier, { group: 99 }));
      }
      map.cages.forEach((c, i) => { if (!prog.cages[i]) { const cage = this.combat.addCage(i, new T.Vector3(c.at[0], 0, c.at[1])); cage.locked = cageLocked(s, id, i); this.caged(c.who, c.at); } });
      this.showCamp();
      this.keeper.place(map.landing[0], map.landing[1] - 1.5);
      this.keeper.fainted = false;
      this.bao.root.position.set(map.landing[0] + 4, 30, map.landing[1] - 14);
      this.gloomTarget = prog.freed ? 0 : 1; GLOOM.value = this.gloomTarget;
      prog.visited = true;
      this.snapCamera(); this.applyLook();
      this.hud.toast(t(PLACES[id].name), 'good');
      setMusic(prog.freed ? 'calm' : 'gloom');
      if (!s.story.flags.conch) { s.story.flags.conch = true; this.scene_('conch'); }
    });
  }

  private makeHive(id: IsleId, at: T.Vector3) {
    const s = this.state;
    this.hive = new HiveFight(id, at, this.combat, this.fx, this.keeper, {
      broken: p => this.onHive(p), song: () => this.heartSong(), sound: n => play(n), freeze: x => this.loop.freeze(x),
    }, hiveMaxHp(s, id));
    this.hive.setShield(hiveShielded(s, id), true);
  }

  /** Boarding a Gloom ship (chapter 5): Juno's plank, and two crew mates of your choice. */
  board() {
    const s = this.state, id = s.place as ShipId;
    if (!isShip(id)) return;
    if (s.isles[id].freed) { this.hud.toast(t('This ship is free. Nobody aboard needs help.'), 'info'); return; }
    if (!hasCrew(s, 'juno')) { this.hud.toast(t('Without Juno’s plank, Bao cannot board a ship.'), 'warn'); return; }
    this.openPanel('board');
  }
  /** Over the plank onto the enemy deck, with the picked crew mates. */
  boardNow(picked: HelperId[]) {
    const s = this.state, id = s.place as ShipId;
    s.boarders = picked.filter(h => hasCrew(s, h)).slice(0, 2);
    this.panels.close();
    this.cut(() => {
      this.mode = 'isle';
      this.stopFishing();
      const v = this.isleView(id) as BeastShipView, map = ISLE_MAPS[id], prog = s.isles[id], tier = tierOf(id);
      for (const [, o] of this.isles) o.group.visible = false;
      v.group.visible = true; v.group.position.set(0, 0, 0); v.setFar(false); v.tilt = 0; v.setFreed(prog.freed, true); this.sky.hole = null;
      this.isle = v;
      this.clearIsle();
      const g = this.isleGround(v);
      this.keeper.bounds = g; this.combat.ground = g; this.combat.formsTier = tier; this.combat.raidTarget = null; this.combat.onShip = true;
      // Bao alongside, its plank laid across to the landing gap.
      const rail = this.bao.half()[0] * .93;
      this.bao.root.position.set(-(rail + 3.2 + BEAST.half[0]), 0, -this.bao.plankCalf()[1] * this.bao.scale);
      this.bao.plankOut = true; this.bao.sync(s, false);
      map.groups.forEach((grp, gi) => {
        if (prog.groups[gi]) return;
        grp.forms.forEach((f, i) => { const a = i / grp.forms.length * Math.PI * 2; this.combat.spawn(f, new T.Vector3(grp.at[0] + Math.cos(a) * 1.8, 0, grp.at[1] + Math.sin(a) * 1.8), tier, { group: gi }); });
      });
      map.captives.forEach((c, i) => { if (!prog.captives[i]) { this.combat.addCage(i, new T.Vector3(c.at[0], 0, c.at[1]), true); this.familyIn(i, c.at); } });
      this.makeHive(id, new T.Vector3(map.hive[0], 0, map.hive[1]));
      this.keeper.place(map.landing[0] + .8, map.landing[1] - .6);
      this.keeper.fainted = false;
      s.boarders.forEach((h, i) => { const a = new Actor('crew', h, CREW[h].color); a.root.position.set(map.landing[0] + .4, 0, map.landing[1] + .6 + i * .8); this.scene.add(a.root); this.helpers.push({ id: h, actor: a, t: i * .7, heal: 0, side: i ? 1 : -1 }); });
      this.cannonT = 2; this.listT = 0; this.listSide = 1;
      this.gloomTarget = 0; GLOOM.value = 0;
      // Under the Grey Star the pod sleeps in the Deep Mist, crusted (the shared Gloom tint).
      if (id === 'star') this.sleepingPod(prog.freed);
      prog.visited = true;
      this.snapCamera(); this.applyLook();
      this.hud.toast(t(PLACES[id].name), 'good');
      setMusic(id === 'star' ? 'night' : 'gloom');
      this.scene_('board_first');
    });
  }

  ascend() {
    const ship = this.isle?.kind === 'ship';
    this.cut(() => {
      // Followers who were still walking climb up anyway: nobody is lost (design §9).
      for (const f of [...this.followers]) { const climbing = CREW[f.who].joins && this.state.crew.includes(f.who); this.boardFollower(f.who); if (climbing) setTimeout(() => this.scene_(`board_${f.who}`), 800); }
      this.enterDeck(false, ship ? 'plank' : 'rope');
      setMusic('calm');
    });
  }

  /** Nana's conch: Bao lowers the rope where you stand, except near a boss (its hush swallows the sound). */
  blowConch() {
    if (this.mode !== 'isle') return;
    const h = this.hive;
    play('hum');
    this.fx.ring(this.keeper.pos, '#ffe6f0', .3, 3, .5);
    if (h && !h.broken && flat(this.keeper.pos, h.pos) - h.radius < CONCH.arena) { this.hud.toast(t('The hush swallows the conch. Step away from the boss first.'), 'warn'); this.scene_('conch_hush'); return; }
    if (this.isle?.kind === 'land') { this.isle.rope.position.set(this.keeper.pos.x + .6, 30, this.keeper.pos.z); this.isle.rope.visible = true; }
    this.hud.toast(t('Bao heard the conch and lowers the rope!'), 'good');
    setTimeout(() => { if (this.mode === 'isle') this.ascend(); }, 700);
  }

  /** A quick white fade around a scene change. */
  private cut(change: () => void) {
    if (this.mode === 'cut') return;
    const prev = this.mode;
    this.mode = 'cut';
    const veil = this.uiRoot.querySelector('#veil') as HTMLElement;
    veil.classList.add('on');
    play('hop');
    setTimeout(() => { try { change(); } catch (e) { console.error(e); this.mode = prev; } veil.classList.remove('on'); }, 380);
  }

  // ------------------------------------------------------------ fishing trip
  /**
   * The skiff on the sea far below the clouds (the owner: fishing goes down to the sea): a blue sea with a few rocks
   * and buoys, cloud banks overhead, and sky fish swimming just under the surface.
   */
  private buildSkiff() {
    const boat = part('props', 'skiff', { shadows: true }) ?? (() => { const m = new T.Mesh(new T.BoxGeometry(1.4, .4, 3.2).translate(0, -.2, 0), makeToon('#c98a4a')); const g = new T.Group(); g.add(m); return g; })();
    boat.name = 'skiff-boat'; boat.rotation.y = Math.PI / 2;
    const sea = new T.Mesh(new T.CircleGeometry(90, 48).rotateX(-Math.PI / 2), new T.MeshLambertMaterial({ color: '#2f9be0', emissive: '#0d4f8a', emissiveIntensity: .35, transparent: true, opacity: .82, depthWrite: false, fog: true }));
    sea.name = 'sea'; sea.position.y = -.12; sea.renderOrder = 2;
    const deep = new T.Mesh(new T.CircleGeometry(90, 48).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ color: '#0b3d73', fog: true }));
    deep.position.y = -2.2;
    this.skiff.add(boat, sea, deep);
    const rng = this.rng.stream('skiff');
    // Rocks and buoys around, and cloud banks high overhead (Bao is up above them).
    for (let i = 0; i < 7; i++) {
      const o = part('props', i % 2 ? 'sea_buoy' : 'sea_rock') ?? new T.Mesh(new T.IcosahedronGeometry(.8, 0), makeToon('#8c95a5'));
      const a = i / 7 * Math.PI * 2 + rng.next() * .5, r = 8 + rng.next() * 16;
      o.position.set(Math.cos(a) * r, 0, Math.sin(a) * r); o.rotation.y = rng.next() * 6; o.scale.setScalar(i % 2 ? 1 : 1.4 + rng.next());
      this.skiff.add(o);
    }
    for (let i = 0; i < 12; i++) {
      const puff = part('nature', 'cloud_puff') ?? new T.Mesh(new T.IcosahedronGeometry(2, 1), PUFF);
      puff.traverse(o => { const m = o as T.Mesh; if (m.isMesh) m.material = PUFF; });
      const a = i / 12 * Math.PI * 2 + rng.next() * .4, r = 22 + rng.next() * 30;
      puff.position.set(Math.cos(a) * (r + 10), 1 + rng.next() * 3, Math.sin(a) * (r + 10)); puff.scale.setScalar(2.4 + rng.next() * 2); puff.rotation.y = rng.next() * 6;
      this.skiff.add(puff);
    }
    // The school: a few fish swimming in loops under the surface; one of them comes to the bobber.
    for (let i = 0; i < 7; i++) {
      const id = FISH_IDS[i % FISH_IDS.length], o = part('fish', id) ?? new T.Mesh(new T.SphereGeometry(.25, 8, 6), makeToon('#7cc8ff'));
      o.scale.setScalar(1.6);
      this.skiff.add(o);
      this.swimmers.push({ o, id, a: rng.next() * 6, r: 3 + rng.next() * 6, speed: .3 + rng.next() * .4, y: -.45 - rng.next() * .4 });
    }
    this.skiff.visible = false;
  }
  private swimmers: { o: T.Object3D; id: FishId; a: number; r: number; speed: number; y: number }[] = [];
  private skiffAt() { const p = this.bao.at(this.bao.liftCalf()); return new T.Vector3(p.x + 1.6, -this.bao.liftDrop, p.z); }
  private skiffGround(): Ground {
    const c = this.skiffAt();
    return { height: () => c.y, clamp: p => { const dx = (p.x - c.x) / 1.15, dz = (p.z - c.z) / .42, k = dx * dx + dz * dz; if (k > 1) { const s = 1 / Math.sqrt(k); p.x = c.x + (p.x - c.x) * s; p.z = c.z + (p.z - c.z) * s; } }, blockers: [] } as Ground;
  }
  /** Down the lift to the skiff (chapter 2): the sky fish swim deep in the cloud layer. */
  goFishing() {
    if (this.raid) { this.hud.toast(t('Not now: the Gloom is aboard!'), 'warn'); return; }
    if (this.mode !== 'deck') return;
    this.skiff.position.copy(this.skiffAt()).setY(0); this.skiff.visible = true;
    this.skiff.position.y = -this.bao.liftDrop;
    this.ride = { t: 0, dur: LIFT.seconds * (hasCrew(this.state, 'juno') ? LIFT.juno : 1), up: false };
    this.mode = 'ride'; this.nearby = null;
    // Clear the cloud layer round the skiff, so Bao and the rope show overhead.
    { const c = this.skiffAt(); this.sky.hole = { x: c.x, z: c.z, r: 34 }; }
    this.keeper.place(this.bao.liftSpot().x, this.bao.liftSpot().z);
    play('sail');
  }
  /** Pull the rope: the lift hauls you back up to the deck. */
  pullRope() {
    if (this.mode !== 'skiff') return;
    this.stopFishing();
    this.ride = { t: 0, dur: LIFT.seconds * (hasCrew(this.state, 'juno') ? LIFT.juno : 1), up: true };
    this.mode = 'ride'; this.nearby = null;
    play('hop');
  }
  private updateRide(dt: number) {
    const r = this.ride; if (!r) return;
    r.t += dt;
    const k = Math.min(1, r.t / r.dur), e = k * k * (3 - 2 * k);
    this.bao.setLift(r.up ? 1 - e : e);
    const at = this.bao.liftSpot();
    this.keeper.pos.set(at.x, at.y, at.z); this.keeper.actor.speed = 0; this.keeper.actor.facing = Math.PI / 2;
    this.keeper.actor.update(dt);
    if (k < 1) return;
    this.ride = null;
    if (r.up) { this.enterDeck(false, 'lift'); return; }
    this.mode = 'skiff';
    const g = this.skiffGround(), c = this.skiffAt();
    this.keeper.bounds = g; this.combat.ground = g;
    this.keeper.place(c.x - .3, c.z); this.keeper.actor.facing = Math.PI / 2;
    this.scene_('skiff_first');
  }

  // ---------------------------------------------------------------- crew
  private makeCrew() {
    for (const id of Object.keys(CREW) as CrewId[]) {
      if (!CREW[id].joins) continue;
      const a = new Actor('crew', id, CREW[id].color);
      a.root.visible = false;
      this.bao.crew.set(id, a);
      this.bao.deck.add(a.root);
    }
  }
  private placeCrew() {
    for (const [id, a] of this.bao.crew) { const p = this.bao.at(DECK.crewSpots[id]); a.root.position.copy(p); a.facing = Math.PI * (id === 'nana' ? .2 : 1); }
  }
  private updateCrew(dt: number) {
    const raid = !!this.raid;
    for (const [id, a] of this.bao.crew) {
      if (!this.state.crew.includes(id)) continue;
      const home = this.bao.at(DECK.crewSpots[id]);
      if (raid) {
        // Down the hatch, banging pots below (hiding is fine; keeping still is not).
        if (!a.root.visible) continue;
        const h = this.bao.at(DECK.hatch);
        if (walkTo(a, h.x, h.z, 3.4, dt, .35)) { a.root.visible = false; this.bao.openHatch(.8); play('chime', .3); }
        continue;
      }
      let w = this.crewWander.get(id);
      if (!w) { w = { at: home.clone(), t: 2 + id.length }; this.crewWander.set(id, w); }
      w.t -= dt;
      if (w.t <= 0) { const r = this.rng.stream('crew'); w.t = 3 + r.next() * 5; w.at.set(home.x + (r.next() - .5) * 1.6, 0, home.z + (r.next() - .5) * 1.6); }
      if (walkTo(a, w.at.x, w.at.z, 1.1, dt)) { const k = this.keeper.pos; if (flat(k, a.root.position) < 2.5) a.lookAt(k.x, k.z); }
    }
  }

  /** A person in a cage: shown frozen inside the crystal until rescued. */
  private caged(who: CrewId, at: [number, number]) {
    const a = new Actor('crew', who, CREW[who].color);
    a.root.position.set(at[0], this.isle!.height(at[0], at[1]), at[1]);
    a.facing = Math.atan2(-at[0], ISLE_MAPS[this.state.place as IsleId].landing[1] - at[1]);
    this.scene.add(a.root);
    this.followers.push({ who, actor: a, boarding: false, t: -1 });
  }
  /** A backfolk family (a grown-up and a child) in a cage in a Gloom ship's hold. */
  private familyIn(cage: number, at: [number, number]) {
    const actors = (['folk_a', 'folk_b'] as const).map((name, i) => { const a = new Actor('crew', name, i ? '#7bd54a' : '#7cc8ff'); a.root.position.set(at[0] + (i ? .28 : -.22), 0, at[1] + (i ? .1 : -.05)); a.facing = Math.PI * .5; this.scene.add(a.root); return a; });
    this.families.push({ actors, cage, t: -1 });
  }
  private showCamp() {
    const id = this.state.place as IsleId, m = MARKETS[id as LandId], v = this.isle;
    if (!v || !v.market) return;
    const open = !!m && this.state.rescued.includes(m.owner);
    v.market.visible = open;
    if (open && m && !this.campNpc) {
      const pos = ISLE_MAPS[id].market!;
      const a = new Actor('crew', m.owner, CREW[m.owner].color);
      a.root.position.set(pos[0] + .2, v.height(pos[0], pos[1]), pos[1] + 1.3);
      a.facing = Math.atan2(-pos[0], 6);
      this.campNpc = a; this.scene.add(a.root);
    }
  }

  private boardFollower(who: CrewId) {
    const i = this.followers.findIndex(f => f.who === who);
    if (i >= 0) { this.scene.remove(this.followers[i].actor.root); this.followers.splice(i, 1); }
  }

  private updateFollowers(dt: number) {
    const id = this.state.place as IsleId;
    if (this.mode !== 'isle') return;
    const map = ISLE_MAPS[id];
    for (const f of [...this.followers]) {
      const cageIdx = map.cages.findIndex(c => c.who === f.who);
      if (!this.state.isles[id].cages[cageIdx]) { f.actor.speed = 0; f.actor.update(dt); continue; }
      f.t += dt;
      if (f.t < 1.4) { if (f.actor.action !== 'cheer') f.actor.play('cheer', 1.4); f.actor.update(dt); continue; }
      const joins = CREW[f.who].joins;
      if (!joins) {
        const mk = map.market!;
        if (walkTo(f.actor, mk[0] + .2, mk[1] + 1.3, 3, dt)) { this.boardFollower(f.who); this.showCamp(); }
      } else {
        // Crew walk back to the rope on their own and climb up to Bao (nobody is escorted, logic check 3, 1.4).
        const rope = new T.Vector3(map.landing[0] + 1.2, 0, map.landing[1] - .6);
        const near = walkTo(f.actor, rope.x, rope.z, 4.2, dt, .3);
        if (near) {
          if (f.actor.action !== 'climb') { f.actor.play('climb', 9); }
          f.actor.root.position.y += dt * 3.2;
          if (f.actor.root.position.y > 6) { this.boardFollower(f.who); this.hud.toast(t('{who} climbed up to Bao!', { who: CREW[f.who].name }), 'good'); this.scene_(`board_${f.who}`); }
        } else f.actor.root.position.y = this.isle!.height(f.actor.root.position.x, f.actor.root.position.z);
      }
      f.actor.update(dt);
    }
    // Freed families cheer, then walk to the landing gap and over the plank onto Bao.
    for (const fam of [...this.families]) {
      if (fam.t < 0) { for (const a of fam.actors) { a.speed = 0; a.update(dt); } continue; }
      fam.t += dt;
      if (fam.t < 1.4) { for (const a of fam.actors) { if (a.action !== 'cheer') a.play('cheer', 1.4); a.update(dt); } continue; }
      let gone = true;
      fam.actors.forEach((a, i) => {
        const p = a.root.position, target = p.x > -BEAST.half[0] + .4 ? new T.Vector3(-BEAST.half[0] + .2, 0, (i - .5) * .7) : new T.Vector3(-BEAST.half[0] - 4, 0, 0);
        walkTo(a, target.x, target.z, 3.2, dt, .2);
        a.update(dt);
        if (p.x > -BEAST.half[0] - 3.5) gone = false;
      });
      if (gone) { for (const a of fam.actors) this.scene.remove(a.root); this.families.splice(this.families.indexOf(fam), 1); }
    }
    this.campNpc?.update(dt);
  }

  /** Crew mates on a boarding: follow the Captain and ring raiders near them. */
  private updateHelpers(dt: number) {
    if (this.mode !== 'isle' || !this.helpers.length) return;
    const k = this.keeper.pos;
    for (const h of this.helpers) {
      const def = HELPERS[h.id], a = h.actor, p = a.root.position;
      h.t -= dt; h.heal += dt;
      const foe = this.combat.forms.filter(f => !f.dead && !f.boarding).sort((x, y) => flat(x.pos, p) - flat(y.pos, p))[0];
      const near = foe && flat(foe.pos, p) < 5 && flat(foe.pos, k) < 9;
      if (near) {
        if (flat(foe.pos, p) > HELPER.reach - .4) walkTo(a, foe.pos.x, foe.pos.z, HELPER.speed, dt, HELPER.reach - .5);
        else { a.speed = damp(a.speed, 0, 10, dt); a.lookAt(foe.pos.x, foe.pos.z); }
        if (h.t <= 0 && flat(foe.pos, p) < HELPER.reach + foe.radius) {
          h.t = HELPER.every; a.lookAt(foe.pos.x, foe.pos.z); a.play('swing', .24);
          this.combat.strike(p.clone(), a.facing, HELPER.reach, ringDamage(this.state) * def.damage, false, { quiet: true, slow: def.slow, push: def.push, cages: false });
          this.fx.ring(p, CREW[h.id].color, .3, 1.4, .3, .6);
        }
      } else {
        // Keep beside the Captain, a little behind.
        const side = new T.Vector3(Math.cos(this.keeper.actor.facing) * h.side, 0, -Math.sin(this.keeper.actor.facing) * h.side).multiplyScalar(1.3);
        const back = new T.Vector3(Math.sin(this.keeper.actor.facing), 0, Math.cos(this.keeper.actor.facing)).multiplyScalar(-1.2);
        const want = k.clone().add(side).add(back);
        this.keeper.bounds.clamp(want);
        if (walkTo(a, want.x, want.z, HELPER.speed, dt, .4)) a.lookAt(k.x + Math.sin(this.keeper.actor.facing) * 3, k.z + Math.cos(this.keeper.actor.facing) * 3);
      }
      this.keeper.bounds.clamp(p);
      if (def.heal && h.heal >= HELPER.healEvery && this.state.hero.hp < maxHp(this.state) && this.keeper.alive()) {
        h.heal = 0; heal(this.state, def.heal);
        this.fx.text(k, `+${def.heal}`, 'heal'); this.fx.sparkle(k.clone().setY(1), CREW.mina.color, 8);
      }
      a.update(dt);
    }
  }

  // -------------------------------------------------------------- combat
  private strike(origin: T.Vector3, facing: number, reach: number, damage: number, spin: boolean) {
    // Inside a dome of silence the mallet makes no sound and does nothing (the Hush Bell).
    if (this.hive?.hushes(origin)) { this.fx.text(origin.clone().setY(origin.y + 1.6), t('…silence…'), 'info'); return 0; }
    let hits = this.combat.strike(origin, facing, reach, damage, spin);
    if (this.hive) hits += this.hive.hit(origin, facing, reach, damage, spin) > 0 ? 1 : 0;
    if (this.mode === 'deck' && !this.raid) {
      // Ring the crust off raided trees.
      this.state.plots.forEach((p, i) => {
        if (p.crust <= 0) return;
        const at = this.bao.at(DECK.plots[i]);
        if (flat(origin, at) > reach + .7) return;
        hits++;
        const clean = ringCrust(this.state, i);
        this.fx.ring(at, '#ffe28a', .4, 1.6, .3); play('chime');
        if (clean) { this.fx.burst(at.clone().setY(.8), '#c9b8ff', 14); this.hud.toast(t('The tree is clean again!'), 'good'); }
        this.syncDeck();
      });
    }
    return hits;
  }
  private target(p: T.Vector3, range: number) {
    const n = this.combat.nearest(p, range);
    if (n) return n.pos;
    const h = this.hive;
    if (h && !h.broken) {
      for (const tp of h.targets()) if (flat(p, tp) < range + .4) return tp;
      if (!h.shielded && h.factor() > 0 && flat(p, h.pos) - h.radius < range) return h.pos;
    }
    return null;
  }

  private aim(p: T.Vector3, range: number) {
    const t = this.target(p, range);
    if (t) return t;
    let best: T.Vector3 | null = null, bd = range + .8;
    for (const c of this.combat.cages) if (!c.open) { const d = flat(p, c.pos); if (d < bd) { bd = d; best = c.pos; } }
    if (this.hive && !this.hive.broken && flat(p, this.hive.pos) - this.hive.radius < bd) best = this.hive.pos;
    if (this.mode === 'deck') this.state.plots.forEach((pl, i) => { if (pl.crust <= 0) return; const at = this.bao.at(DECK.plots[i]); const d = flat(p, at); if (d < bd) { bd = d; best = at; } });
    return best;
  }

  private onFreed(form: string, at: T.Vector3, group: number, raid: boolean, reward: boolean) {
    const s = this.state, tier = raid && this.raid ? this.raid.plan.tier : this.mode === 'isle' ? tierOf(s.place as IsleId) : 0;
    const r = formFreed(s, form as never, tier, reward);
    if (r.glimmer) this.fx.text(at, `+${r.glimmer}✦`, 'gain');
    if (r.levels) this.levelUp();
    if (this.mode === 'isle' && group >= 0 && group !== 99 && !this.combat.groupAlive(group)) {
      const id = s.place as IsleId;
      groupCleared(s, id, group);
      this.hud.toast(t('Group freed!'), 'good');
      // On a ship, the captain's crust opens once its guards are gone.
      if (isShip(id) && this.hive?.shielded && !hiveShielded(s, id)) { this.hive.setShield(false); this.hud.toast(t('The raiders are gone: the captain’s crust is open!'), 'good'); this.scene_(id === 'sloop' ? 'barnacle_first' : id === 'warship' ? 'wyrm_first' : 'spires_down'); }
      this.save();
    }
    if (group === 99 && !this.combat.groupAlive(99)) { s.isles[s.place as IsleId].leftover = false; this.hud.toast(t('The leftover Gloom is gone.'), 'good'); }
  }
  private onSpire(i: number, at: T.Vector3) {
    const s = this.state, id = s.place as IsleId;
    const r = spireBroken(s, id, i);
    if (r) { this.fx.text(at, `+${r.glimmer}✦`, 'gain'); if (r.levels) this.levelUp(); }
    play('shield');
    // A cage the Spire guarded opens up (Juno's workshop).
    for (const c of this.combat.cages) if (c.locked && !cageLocked(s, id, c.index)) { c.locked = false; this.fx.sparkle(c.pos.clone().setY(1.4), '#ffe28a', 16); this.hud.toast(t('The workshop door gives way!'), 'good'); }
    const left = s.isles[id].spires.filter(b => !b).length;
    this.hud.toast(left ? t('Spire broken! {n} left.', { n: left }) : t('Every Spire is down: the Hive’s dome falls!'), 'good');
    if (!left && this.hive) { this.hive.setShield(false); this.scene_(id === 'frost' ? 'hush_first' : 'spires_down'); }
    this.save();
  }
  private onCage(i: number, at: T.Vector3) {
    const s = this.state, id = s.place as IsleId;
    const r = rescue(s, id, i);
    if (!r.ok) return;
    if (r.levels) this.levelUp();
    play('free'); this.fx.sparkle(at.clone().setY(1.4), '#ffffff', 16);
    const f = this.followers.find(x => x.who === r.who);
    if (f) f.t = 0;
    this.hud.toast(r.joins ? t('{who} is free and heads up to Bao!', { who: CREW[r.who].name }) : t('{who} is free and opens a market at the landing!', { who: CREW[r.who].name }), 'good');
    this.scene_(`rescue_${r.who}`);
    this.save();
  }
  private onCaptive(i: number, at: T.Vector3) {
    const s = this.state, id = s.place as IsleId;
    const r = freeCaptive(s, id, i);
    if (!r.ok) return;
    if (r.levels) this.levelUp();
    play('free'); this.fx.sparkle(at.clone().setY(1.4), '#ffffff', 16);
    const fam = this.families.find(x => x.cage === i); if (fam) fam.t = 0;
    this.fx.text(at.clone().setY(2), `+${r.glimmer}✦`, 'gain');
    this.hud.toast(t('A family is free! They give you {n} {item}.', { n: r.gift[1], item: ITEMS[r.gift[0]].name }), 'good');
    this.scene_('family');
    this.save();
  }
  private onHive(at: T.Vector3) {
    const s = this.state, id = s.place as IsleId;
    const r = hiveBroken(s, id);
    if (!r) return;
    if (r.levels) this.levelUp();
    this.fx.text(at.clone().setY(3), `+${r.glimmer}✦`, 'gain');
    play('song');
    this.gloomTarget = 0;
    // The song shatters every shell still standing and opens every cage (logic check 3, 2.3 and 2.4).
    this.combat.freeAll();
    for (const c of this.combat.cages) if (!c.open) { c.open = true; c.view.visible = false; this.fx.sparkle(c.pos.clone().setY(1.2), '#ffe28a', 12); }
    for (const fam of this.families) if (fam.t < 0) fam.t = 0;
    if (isLand(id)) {
      // The Note flies up to Bao, Bao sings, and colour pours back over the land.
      const n = noteView(); n.position.copy(at).setY(at.y + 2); this.scene.add(n); this.note = { o: n, t: 0 };
      for (const who of r.opened) {
        const f = this.followers.find(x => x.who === who); if (f) f.t = 0;
        setTimeout(() => this.scene_(`rescue_${who}`), 3400);
      }
    } else {
      // A captain beaten: the crust shatters off the creature it rode, and its colours pour back.
      const v = this.isle; if (v?.kind === 'ship') { v.setFreed(true); v.tilt = 0; }
      this.fx.burst(new T.Vector3(0, 2, 0), '#c9b8ff', 60, { speed: 10, up: 8, size: .25, life: 1.4 });
    }
    setMusic('calm');
    this.hud.toast(id === 'star' ? t('The Grey Heart shatters!') : t('{isle} is free!', { isle: PLACES[id].name }), 'good');
    this.save();
    if (id === 'star') setTimeout(() => this.ending(), 2600);
    else setTimeout(() => { this.scene_(`freed_${id}`); if (id === 'frost') this.scene_('fleet'); }, 1600);
  }
  private heartSong() {
    heal(this.state, HEART.songHeal);
    this.fx.text(this.keeper.pos, `+${HEART.songHeal}`, 'heal');
    this.fx.sparkle(this.keeper.pos.clone().setY(1), '#ffe28a', 12);
    play('song'); this.hud.toast(t('Bao sings! The Heart’s shield cracks.'), 'good');
    this.scene_('heart_song');
  }

  private onFaint() {
    const s = this.state;
    rulesFaint(s, null);
    play('faint');
    if (this.raid) { this.finishRaid(false); return; }
    if (this.mode !== 'isle') { setTimeout(() => { s.hero.hp = maxHp(s); this.keeper.fainted = false; }, 1500); return; }
    const atHive = this.hive && this.hive.awake && !this.hive.broken ? s.place as IsleId : null;
    const cracked = !!atHive && s.isles[atHive].cracks < 3;
    rulesFaint(s, atHive); s.stats.faints--; // counted once, above
    setTimeout(() => {
      this.cut(() => {
        s.hero.hp = maxHp(s);
        const id = s.place as IsleId;
        for (const f of [...this.followers]) if (s.isles[id].cages[ISLE_MAPS[id].cages.findIndex(c => c.who === f.who)]) this.boardFollower(f.who);
        this.enterDeck(false, isShip(id) ? 'plank' : 'rope');
        this.scene_(cracked ? 'faint_hive' : 'faint', true);
      });
    }, 1100);
  }

  private levelUp() { play('level'); this.hud.toast(t('Level {n}! You feel stronger.', { n: this.state.hero.level }), 'good'); this.fx.ring(this.keeper.pos, '#ffe28a', .5, 3, .6); }
  private skillUp(id: SkillId, level: number) { if (!level) return; play('level', .6); this.hud.toast(t('{skill} level {n}!', { skill: t(SKILL_NAMES[id]), n: level }), 'good'); }

  // ---------------------------------------------------------- chime cannon
  /**
   * Juno's chime cannon fires a ringing bell at the thickest crowd of Gloom forms: on Bao's deck during a raid, and
   * onto the enemy deck during a boarding (it fires from Bao, alongside).
   */
  private updateCannon(dt: number) {
    if (!hasCrew(this.state, 'juno')) return;
    const onDeck = this.mode === 'deck' && !!this.raid && this.raid.wave >= 0, boarding = this.mode === 'isle' && this.isle?.kind === 'ship';
    if (!onDeck && !boarding) return;
    this.cannonT -= dt;
    if (this.cannonT > 0) return;
    const forms = this.combat.forms.filter(f => !f.dead && !f.boarding);
    if (!forms.length) return;
    const best = forms.map(f => ({ f, n: forms.filter(o => flat(o.pos, f.pos) < CANNON.radius).length })).sort((a, b) => b.n - a.n)[0].f;
    this.cannonT = CANNON.every;
    const muzzle = this.bao.at(DECK.cannon).add(this.bao.root.position).setY(1.2);
    this.bao.fireCannon(best.pos.clone().sub(this.bao.root.position));
    const bell = new T.Mesh(BELL_GEO, GOLD);
    bell.position.copy(muzzle);
    this.scene.add(bell);
    this.shells.push({ mesh: bell, from: muzzle, to: best.pos.clone(), t: 0, deck: onDeck });
    play('gong', .5);
  }
  private updateShells(dt: number) {
    for (const s of [...this.shells]) {
      s.t += dt / .7;
      const k = Math.min(1, s.t);
      s.mesh.position.lerpVectors(s.from, s.to, k); s.mesh.position.y += Math.sin(k * Math.PI) * 4; s.mesh.rotation.x += dt * 9;
      if (k < 1) continue;
      this.scene.remove(s.mesh); this.shells.splice(this.shells.indexOf(s), 1);
      this.fx.ring(s.to, '#ffe28a', .5, CANNON.radius, .5); this.fx.burst(s.to.clone().setY(.8), '#ffe28a', 14, { speed: 5, up: 4 });
      this.fx.shake(.25); play('gong');
      this.combat.blast(s.to, CANNON.radius, CANNON.push, ringDamage(this.state) * CANNON.damage);
    }
  }

  // ---------------------------------------------------------------- raids
  /**
   * A raid is a ship battle (the owner, 2026-10-16): battle stations sink the garden and fittings below the deck (they
   * are not drawn during the fight), two gongs rise, and Gloom ships come alongside from different sides. Raiders walk
   * over the planks and head for the hatch; ring them, Spin them or blast them with a gong until they fall overboard.
   */
  private startRaid() {
    // The Gloom comes aboard: whoever is in the cottage or the skiff comes up to defend Bao.
    if (this.mode === 'house') { this.cabin.group.visible = false; this.enterDeck(false, 'hatch'); }
    if (this.mode === 'skiff' || this.mode === 'ride') { this.stopFishing(); this.enterDeck(false, 'lift'); }
    if (this.mode === 'drone') this.landDrone(true);
    const small = !this.state.voyage?.scripted;
    const plan = raidPlan(this.state, small);
    if (!plan) { if (this.state.voyage) this.state.voyage.raidState = 'done'; return; }
    const warn = hasCrew(this.state, 'ria') ? RAID.warnLookout : RAID.warn;
    this.stopFishing();
    this.bao.battle(true);
    play('slam');
    this.raid = { plan, wave: -1, t: 0, warn, total: 0, postT: [], ships: this.makeShips(small ? 1 : RAID.ships), queue: [], gongCd: DECK.gongs.map(() => 0) };
    this.combat.raidTarget = this.bao.at(DECK.hatch);
    this.cannonT = 3;
    play('raid');
    this.hud.toast(hasCrew(this.state, 'ria') ? t('Ria: “Gloom ships off the side! Battle stations!”') : t('Gloom ships! Battle stations: the garden goes below!'), 'warn');
    this.panels.close();
    if (!this.state.story.flags.scene_raid_first) this.scene_('raid_first');
    this.syncDeck();
  }

  /** Gloom ships on different sides of Bao, each with a boarding plank to the deck's edge. */
  private makeShips(n: number) {
    const [a, b] = this.bao.half(), rng = this.rng.stream('raid');
    const sides = (['left', 'right', 'front', 'back'] as const).map(s => ({ s, k: rng.next() })).sort((x, y) => x.k - y.k).slice(0, n).map(x => x.s);
    return sides.map(side => {
      const out = side === 'left' ? new T.Vector3(-1, 0, 0) : side === 'right' ? new T.Vector3(1, 0, 0) : side === 'front' ? new T.Vector3(0, 0, -1) : new T.Vector3(0, 0, 1);
      const along = (rng.next() - .5) * .5;
      const rim = side === 'left' || side === 'right' ? new T.Vector3(out.x * a * .96, 0, along * b) : new T.Vector3(along * a, 0, out.z * b * .96);
      const centre = rim.clone().addScaledVector(out, 5.6), dock = rim.clone().addScaledVector(out, 3.6);
      // A small crusted sky creature with a plank platform on its back (the owner: no sailing ships).
      const ship = part('gloom', 'gloom_raider', { shadows: false }) ?? makeGloomCloud(true);
      ship.traverse(o => { const m = o as T.Mesh; if (m.isMesh && !(m.material as T.Material).name.startsWith('gloom') && !(m.material as T.Material).name.startsWith('glow')) m.material = addGloom((m.material as T.Material).clone(), RAIDER_GLOOM); });
      // Head toward Bao's stern, so it swims alongside.
      ship.rotation.y = side === 'left' || side === 'right' ? 0 : Math.PI / 2;
      const plank = part('gloom', 'plank') ?? (() => { const m = new T.Mesh(new T.BoxGeometry(.8, .1, 3.2).translate(0, -.05, 1.6), makeToon('#8c86a8')); const g = new T.Group(); g.add(m); return g; })();
      plank.position.copy(dock); plank.rotation.y = Math.atan2(-out.x, -out.z);
      plank.scale.set(1, 1, Math.max(.5, dock.distanceTo(rim) / 3.2));
      plank.visible = false;
      this.scene.add(ship, plank);
      ship.position.copy(centre).addScaledVector(out, 40); ship.position.y = -8;
      return { ship, plank, out, rim, dock, centre, k: 0, leaving: false };
    });
  }

  private updateRaid(dt: number) {
    const r = this.raid; if (!r) return;
    r.t += dt;
    for (let i = 0; i < r.gongCd.length; i++) r.gongCd[i] = Math.max(0, r.gongCd[i] - dt);
    if (r.wave < 0) { if (r.t >= r.warn) { r.wave = 0; this.queueWave(); } return; }
    r.total += dt;
    // Chime Posts ring Gloom forms near them.
    this.state.posts.forEach((spot, i) => {
      r.postT[i] = (r.postT[i] ?? 0) + dt;
      if (r.postT[i] < POST.every) return;
      const at = this.bao.at(DECK.posts[spot]);
      if (!this.combat.forms.some(f => !f.dead && !f.boarding && flat(f.pos, at) < POST.radius)) return;
      r.postT[i] = 0;
      this.fx.ring(at, '#ffe28a', .4, POST.radius, .35, .6);
      this.combat.strike(at, 0, POST.radius, ringDamage(this.state) * POST.share * (hasCrew(this.state, 'tam') ? POST.tamBonus : 1), true, { quiet: true, slow: true, cages: false });
    });
    // Raiders board one after another from each ship.
    for (const q of r.queue) {
      q.t -= dt;
      if (q.t > 0) continue;
      const ship = r.ships[q.ship], f = this.combat.spawn(q.kind, ship.dock, r.plan.tier, { scale: r.plan.scale, raid: true });
      const to = ship.rim.clone().addScaledVector(ship.out, -.9);
      f.boarding = { from: ship.dock.clone(), to, t: 0, len: ship.dock.distanceTo(to) };
      this.fx.burst(ship.dock.clone().setY(.6), '#9a8cc8', 6, { speed: 2, up: 2 });
    }
    r.queue = r.queue.filter(q => q.t > 0);
    if (this.combat.aliveCount() === 0 && !r.queue.length) {
      if (r.wave + 1 < r.plan.waves.length) { r.wave++; this.queueWave(); }
      else this.finishRaid(true);
      return;
    }
    if (r.total >= RAID.timeout) this.finishRaid(false);
  }
  private queueWave() {
    const r = this.raid!, wave = r.plan.waves[r.wave];
    wave.forEach((kind, i) => { const ship = i % r.ships.length; r.queue.push({ kind, ship, t: .3 + Math.floor(i / r.ships.length) * RAID.boardEvery }); });
    for (const s of r.ships) s.plank.visible = true;
    this.hud.toast(t('Wave {n} of {all}! Knock them overboard!', { n: r.wave + 1, all: r.plan.waves.length }), 'warn');
  }
  /** A gong: one blast that throws every raider near it toward the edge. */
  private ringGong(i: number) {
    const r = this.raid; if (!r) return;
    if (r.gongCd[i] > 0) { this.hud.toast(t('The gong is still humming…'), 'info'); return; }
    r.gongCd[i] = RAID.gong.cooldown;
    const at = this.bao.at(DECK.gongs[i]);
    this.keeper.actor.lookAt(at.x, at.z); this.keeper.actor.play('swing', .24);
    this.bao.ringGong(i);
    play('gong');
    this.fx.ring(at, '#ffe28a', .6, RAID.gong.radius, .6); this.fx.ring(at, '#ffffff', .3, RAID.gong.radius * .7, .45, .6);
    this.fx.shake(.35);
    this.combat.blast(at, RAID.gong.radius, RAID.gong.push, ringDamage(this.state) * RAID.gong.damage);
  }
  private finishRaid(won: boolean) {
    const r = this.raid; if (!r) return;
    endRaid(this.state, won, won ? r.plan.waves.length : 0);
    // Raiders that give up pop in the sunlight and float off as animals; the ships sail away.
    this.combat.freeAll();
    for (const s of r.ships) { s.leaving = true; s.plank.visible = false; }
    this.leavingShips.push(...r.ships);
    this.combat.raidTarget = null;
    this.raid = null;
    this.bao.battle(false);
    if (won) { play('arrive'); this.hud.toast(t('Raid beaten! +{g} glimmer', { g: r.plan.waves.length * RAID.winPerWave }), 'good'); this.scene_('raid_won'); }
    else { this.hud.toast(t('The Gloom left… some trees below deck are crusted.'), 'warn'); this.scene_('raid_lost'); }
    if (this.keeper.fainted) { this.state.hero.hp = maxHp(this.state); this.keeper.fainted = false; this.keeper.actor.action = 'none'; }
    this.syncDeck();
    this.save();
  }
  /** Ships come in from far away during the warning, then sail off when the raid is over. */
  private updateShips(dt: number) {
    const live = this.raid?.ships ?? [];
    for (const s of [...live, ...this.leavingShips]) {
      s.k = s.leaving ? Math.max(0, s.k - dt / 2.4) : Math.min(1, s.k + dt / Math.max(1.5, this.raid?.warn ?? 3));
      const e = 1 - (1 - s.k) ** 3;
      s.ship.position.copy(s.centre).addScaledVector(s.out, 40 * (1 - e));
      s.ship.position.y = -8 * (1 - e) + Math.sin(this.loop.realTime * 1.3 + s.centre.x) * .25;
      s.ship.rotation.z = Math.sin(this.loop.realTime * .9 + s.centre.z) * .04;
      const t2 = this.loop.realTime + s.centre.x;
      const finL = findChild(s.ship, 'fin_l'), finR = findChild(s.ship, 'fin_r'), tail = findChild(s.ship, 'tail');
      if (finL) finL.rotation.z = Math.sin(t2 * 1.6) * .3; if (finR) finR.rotation.z = -Math.sin(t2 * 1.6) * .3; if (tail) tail.rotation.x = Math.sin(t2 * 1.2) * .25;
    }
    this.leavingShips = this.leavingShips.filter(s => {
      if (s.k > 0) return true;
      this.scene.remove(s.ship, s.plank);
      // The raid creature's tinted materials were its own copies.
      s.ship.traverse(o => { const m = o as T.Mesh; if (m.isMesh && (m.material as T.Material).customProgramCacheKey?.() === 'gloom') (m.material as T.Material).dispose(); });
      return false;
    });
  }
  private leavingShips: Ship[] = [];

  /** The Grey Star's deck lists toward one rail, then the other: everyone slides, and raiders near a gap fall. */
  private updateList(dt: number) {
    const v = this.isle;
    if (this.mode !== 'isle' || v?.kind !== 'ship' || v.isle !== 'star' || v.freed || !this.hive || this.hive.shielded) { if (v?.kind === 'ship') v.tilt = 0; return; }
    this.listT += dt;
    if (this.listT >= LIST.every) { this.listT = 0; this.listSide = -this.listSide; this.hud.toast(t('The deck lists the other way!'), 'warn'); play('slam', .5); }
    v.tilt = this.listSide;
    const push = this.listSide * LIST.drift * dt;
    if (this.keeper.alive()) { this.keeper.pos.x += push; this.keeper.bounds.clamp(this.keeper.pos); }
    for (const f of this.combat.forms) if (!f.dead && !f.boarding) f.pos.x += push * 1.2;
  }

  // ----------------------------------------------------------- Sky Scooter
  /**
   * The Sky Scooter (the owner): ride a little drone off the deck and fly freely round Bao, on a tether so never too
   * far. Sky Sparks float out there (they build and upgrade the scooter), and sky dew and treasure clouds can be caught.
   */
  private drone: { obj: T.Object3D; vel: T.Vector3; rotors: T.Object3D[]; tether: T.Line } | null = null;
  private sparks: { o: T.Object3D; alive: boolean; t: number; phase: number }[] = [];
  private startDrone() {
    const s = this.state;
    if (s.gear.drone <= 0 || this.raid || this.mode !== 'deck') return;
    const obj = part('props', 'drone', { shadows: true }) ?? (() => { const m = new T.Mesh(new T.CylinderGeometry(.7, .8, .35, 16), makeToon('#2fb0a8')); const g = new T.Group(); g.add(m); return g; })();
    const rotors = [0, 1, 2, 3].map(i => findChild(obj, `rotor_${i}`)).filter((r): r is T.Object3D => !!r);
    const tether = new T.Line(new T.BufferGeometry().setFromPoints([new T.Vector3(), new T.Vector3()]), new T.LineBasicMaterial({ color: '#fff3d6' }));
    tether.frustumCulled = false;
    this.scene.add(obj, tether);
    const pad = this.bao.at(DECK.dronePad);
    obj.position.set(pad.x, .12, pad.z);
    this.drone = { obj, vel: new T.Vector3(), rotors, tether };
    this.bao.droneOut = true; this.syncDeck();
    this.mode = 'drone'; this.nearby = null;
    if (!this.sparks.length) this.makeSparks();
    play('sail');
    this.scene_('drone_first');
  }
  private droneRange() { return DRONE.range[Math.min(2, this.state.gear.drone)] + this.bao.half()[1] * .5; }
  private updateDrone(dt: number, stick: { x: number; z: number }) {
    const d = this.drone; if (!d) return;
    const want = new T.Vector3(stick.x, 0, stick.z).multiplyScalar(DRONE.speed);
    d.vel.x = damp(d.vel.x, want.x, 4, dt); d.vel.z = damp(d.vel.z, want.z, 4, dt);
    const p = d.obj.position;
    p.x += d.vel.x * dt; p.z += d.vel.z * dt;
    // The tether: it stops at its length, and the scooter leans back against it.
    const r = Math.hypot(p.x, p.z), max = this.droneRange();
    if (r > max) { p.x *= max / r; p.z *= max / r; if (!this.tetherWarned) { this.tetherWarned = true; this.hud.toast(t('The tether is at its end: this is as far as the scooter goes.'), 'info'); } } else if (r < max - 4) this.tetherWarned = false;
    p.y = damp(p.y, DRONE.height + Math.sin(this.loop.gameTime * 1.6) * .25, 3, dt);
    const speed = Math.hypot(d.vel.x, d.vel.z);
    if (speed > .4) d.obj.rotation.y = Math.atan2(d.vel.x, d.vel.z);
    d.obj.rotation.x = d.vel.z / DRONE.speed * .2; d.obj.rotation.z = -d.vel.x / DRONE.speed * .2;
    for (const rot of d.rotors) rot.rotation.y += dt * 40;
    // The Captain sits in the saddle.
    this.keeper.pos.set(p.x, p.y + .5, p.z); this.keeper.actor.facing = d.obj.rotation.y; this.keeper.actor.speed = 0; this.keeper.actor.update(dt);
    const pad = this.bao.at(DECK.dronePad);
    (d.tether.geometry as T.BufferGeometry).setFromPoints([pad.setY(.2), p.clone().setY(p.y - .1)]);
    // Sky dew and treasure clouds can be caught on the wing.
    for (const dw of this.dews) if (dw.alive && dw.o.position.distanceTo(p) < 2) this.catchDew(dw);
  }
  private tetherWarned = false;
  /** Back to the pad (at once in a raid). */
  landDrone(now = false) {
    const d = this.drone; if (!d) return;
    const finish = () => { this.scene.remove(d.obj, d.tether); this.drone = null; this.bao.droneOut = false; const pad = this.bao.at(DECK.dronePad); this.mode = 'deck'; this.keeper.place(pad.x + 1.3, pad.z); this.syncDeck(); play('hop'); };
    if (now) { finish(); return; }
    this.cut(finish);
  }
  private makeSparks() {
    const rng = this.rng.stream('sparks');
    for (let i = 0; i < DRONE.sparks; i++) {
      const o = part('props', 'sky_spark') ?? new T.Mesh(new T.OctahedronGeometry(.25, 0), makeToon('#ffd23a', { emissive: '#ffb000' }));
      this.scene.add(o);
      const s = { o, alive: false, t: rng.next() * 3, phase: rng.next() * 6 };
      this.sparks.push(s);
    }
  }
  /** Sparks float round Bao (only while the scooter flies); a caught one comes back somewhere else later. */
  private updateSparks(dt: number) {
    const d = this.drone, rng = this.rng.stream('sparks'), max = this.droneRange();
    for (const sp of this.sparks) {
      if (!sp.alive) {
        sp.t -= dt; sp.o.visible = false;
        if (sp.t > 0) continue;
        const a = rng.next() * Math.PI * 2, r = this.bao.half()[1] * .9 + rng.next() * (max - this.bao.half()[1] * .9);
        sp.o.position.set(Math.cos(a) * r, 1.5 + rng.next() * 4, Math.sin(a) * r); sp.alive = true; sp.o.visible = true;
      }
      sp.phase += dt; sp.o.rotation.y += dt * 2; sp.o.position.y += Math.sin(sp.phase * 2) * dt * .3;
      if (d && sp.o.position.distanceTo(d.obj.position) < DRONE.catch + .5) {
        sp.alive = false; sp.t = DRONE.respawn; sp.o.visible = false;
        give(this.state, 'spark');
        this.fx.sparkle(sp.o.position.clone(), '#ffe28a', 14); this.fx.text(sp.o.position, `+1 ${t('Sky Spark')}`, 'gain'); play('dew');
      }
    }
  }
  private hideSparks() { for (const sp of this.sparks) sp.o.visible = false; }

  // --------------------------------------------------------------- fishing
  private makeFishing() {
    const bobber = new T.Group();
    const ball = new T.Mesh(new T.SphereGeometry(.16, 12, 8), makeToon('#ff5c5c')); bobber.add(ball);
    const top = new T.Mesh(new T.SphereGeometry(.1, 10, 6), makeToon('#ffffff')); top.position.y = .12; bobber.add(top);
    bobber.visible = false;
    const line = new T.Line(new T.BufferGeometry().setFromPoints([new T.Vector3(), new T.Vector3()]), new T.LineBasicMaterial({ color: '#ffffff' }));
    line.visible = false; line.frustumCulled = false;
    this.scene.add(bobber, line);
    return { state: 'off' as 'off' | 'wait' | 'bite', sim: null as ReelSim | null, pause: 0, bobber, line, at: new T.Vector3() };
  }
  /** Where the bobber lands: off the skiff's bow. */
  private bobberSpot() { const c = this.skiffAt(); return new T.Vector3(c.x + 4.2, c.y, c.z + .3); }
  /**
   * A cast (Zoo Garden's fishing game, rules/reel.ts): a fish swims up, nibbles, bites; hook it, then hold Reel and let
   * go when it surges, or the line strains and may snap.
   */
  private startFishing() {
    const f = this.fishing;
    if (this.mode !== 'skiff') return;
    if ((this.state.schools[this.state.place]?.left ?? 0) <= 0) { this.hud.toast(t('The fish are hiding. Try again in a little while.'), 'info'); return; }
    const s = this.state, c = castFor(s), rng = this.rng.stream('fish');
    f.sim = new ReelSim({
      quality: Math.min(1, .3 + (c.line ? .3 : 0) + c.window), bait: c.bait, random: () => rng.next(),
      choose: bonus => { if (!takeBite(s)) return null; const id = rollFish(rng, s.place, c.line, c.rare * (1 + bonus * .4)); return { id, power: FISH_POWER[id] }; },
    });
    f.state = 'wait'; f.pause = 0;
    f.at.copy(this.bobberSpot()); f.bobber.position.copy(this.keeper.pos).setY(this.keeper.pos.y + 1.4);
    f.bobber.visible = f.line.visible = true;
    this.keeper.actor.lookAt(f.at.x, f.at.z);
    this.keeper.actor.play('cast', .5);
    play('splash');
  }
  private stopFishing() { const f = this.fishing; f.state = 'off'; f.sim = null; f.bobber.visible = f.line.visible = false; }
  /** Reel held (the Reel button, F or a long press): press and release go to the simulation. */
  private reelHeld = false;
  private reel(held = true) { if (this.mode === 'skiff' && !this.fishing.sim && held) { this.startFishing(); return; } this.reelHeld = held; }
  private updateFishing(dt: number) {
    const f = this.fishing;
    // The swimmers circle under the surface whatever happens.
    const t0 = this.loop.gameTime, sim = f.sim, coming = sim && (sim.phase === 'approach' || sim.phase === 'nibble' || sim.phase === 'bite' || sim.phase === 'hooked') ? sim.pick?.id ?? null : null;
    let comer = coming ? this.swimmers.find(w => w.id === coming) ?? this.swimmers[0] : null;
    for (const w of this.swimmers) {
      if (w === comer) continue;
      w.a += dt * w.speed;
      const c = this.skiffAt();
      w.o.position.set(c.x + 3 + Math.cos(w.a) * w.r, c.y + w.y, c.z + Math.sin(w.a) * w.r * .7);
      w.o.rotation.y = -w.a;
    }
    if (f.state === 'off' || !sim) return;
    if (this.mode !== 'skiff' || this.raid) { this.stopFishing(); return; }
    if (f.pause > 0) { f.pause -= dt; if (f.pause <= 0) this.startFishing(); return; }
    const held = this.reelHeld || this.keys.isDown('interact');
    const before = sim.phase;
    sim.update(dt, held);
    // The bobber: a short arc out, a bob on the swell, dips for nibbles, pulled under on the bite, dragged in as you reel.
    const surface = this.skiffAt().y;
    if (sim.phase === 'cast') { const k = Math.min(1, (this.loop.gameTime % 10) * 0 + .2); void k; f.bobber.position.lerp(f.at, Math.min(1, dt * 6)); f.bobber.position.y = surface + .6; }
    else {
      const pulled = sim.phase === 'hooked' ? f.at.clone().lerp(this.keeper.pos, sim.progress * .8) : f.at;
      const dip = sim.phase === 'bite' ? -.32 + Math.sin(t0 * 40) * .05 : sim.dart > 0 ? -.18 : sim.phase === 'hooked' ? -.15 + Math.sin(t0 * 25) * .08 * (sim.surge > 0 ? 2 : 1) : Math.sin(t0 * 2.4) * .05;
      f.bobber.position.set(pulled.x, surface + dip, pulled.z);
    }
    const hand = this.keeper.pos.clone().add(new T.Vector3(Math.sin(this.keeper.actor.facing) * .5, 1.5, Math.cos(this.keeper.actor.facing) * .5));
    (f.line.geometry as T.BufferGeometry).setFromPoints([hand, f.bobber.position]);
    (f.line.material as T.LineBasicMaterial).color.set(sim.strained ? '#ff5c5c' : '#ffffff');
    // The coming fish swims to the bobber, darts at it, and thrashes on the line.
    if (comer) {
      const bp = f.bobber.position, d = sim.phase === 'approach' ? sim.fishDistance : .45;
      const ang = Math.atan2(comer.o.position.z - bp.z, comer.o.position.x - bp.x) || 0;
      comer.o.position.set(bp.x + Math.cos(ang) * d, surface - .35 + (sim.phase === 'hooked' ? Math.abs(Math.sin(t0 * 9)) * .3 : 0), bp.z + Math.sin(ang) * d);
      comer.o.rotation.y = Math.PI / 2 - ang + (sim.phase === 'hooked' ? Math.sin(t0 * 14) * .5 : 0);
    }
    f.state = sim.phase === 'bite' || sim.phase === 'hooked' ? 'bite' : 'wait';
    if (before !== sim.phase) {
      if (sim.phase === 'nibble') play('bite', .4);
      if (sim.phase === 'bite') { play('bite'); this.fx.burst(f.bobber.position.clone(), '#ffffff', 8, { speed: 2, up: 2, size: .08, life: .4 }); this.hud.toast(t('A bite! Reel!'), 'good'); }
      if (sim.phase === 'hooked') { play('splash'); this.keeper.actor.play('cast', .4); }
      if (sim.phase === 'wait' && sim.reason) { this.hud.toast(t(sim.reason), 'info'); sim.reason = ''; if (before !== 'cast') play('miss'); }
      if (sim.phase === 'caught' && sim.pick) {
        const id = sim.pick.id, level = landFish(this.state, id);
        play('catch'); this.fx.sparkle(f.bobber.position.clone().setY(surface + .5), '#8fdbff', 14);
        this.hud.toast(t('You caught a {fish}!', { fish: ITEMS[id].name }), 'good');
        this.keeper.actor.play('cheer', .9);
        this.skillUp('fish', level);
        this.scene_('fished');
        f.pause = 1.2; f.bobber.visible = false;
      }
      if (sim.phase === 'escaped') { this.hud.toast(t(sim.reason), 'warn'); play(sim.reason.includes('snapped') ? 'shield' : 'miss'); if (sim.reason.includes('hiding')) { this.stopFishing(); return; } f.pause = 1.2; }
    }
  }
  /** What the HUD shows of a cast. */
  private fishingView() {
    const sim = this.fishing.sim;
    if (!sim) return { reel: null };
    return { reel: { phase: sim.phase, tension: sim.tension, progress: sim.progress, strained: sim.strained } };
  }

  // ---------------------------------------------------------------- dew
  private spawnDew(treasure = false) {
    const d = this.dews.find(x => !x.alive); if (!d) return;
    const side = this.rng.stream('dew').next() < .5 ? -1 : 1, [a] = this.bao.half();
    d.alive = true; d.treasure = treasure; d.o.visible = true;
    d.o.position.set(side * (a + 1.6), 1 + this.rng.stream('dew').next() * 1.2, -34);
    d.o.scale.setScalar(treasure ? 1.7 : 1);
  }
  private updateDew(dt: number) {
    for (const d of this.dews) {
      if (!d.alive) continue;
      d.o.position.z += this.sky.speed * .75 * dt;
      d.o.rotation.y += dt;
      d.o.position.y += Math.sin(this.loop.gameTime * 2 + d.o.position.x) * .004;
      if (d.o.position.z > 26 || this.mode !== 'deck') { d.alive = false; d.o.visible = false; }
    }
  }
  private catchDew(d: { o: T.Object3D; treasure: boolean; alive: boolean }) {
    if (!d.alive) return;
    d.alive = false; d.o.visible = false;
    if (d.treasure) { if (collectTreasure(this.state)) { this.hud.toast(t('Treasure cloud! +{g} glimmer', { g: VOYAGE.treasure }), 'good'); this.fx.sparkle(d.o.position, '#ffe28a', 20); } }
    else { collectDew(this.state); this.fx.sparkle(d.o.position, '#8fdbff', 10); this.fx.text(d.o.position, '+1✦', 'gain'); }
    play('dew');
  }

  // -------------------------------------------------------- interactables
  buildInteractables() {
    const s = this.state, list: Interactable[] = [];
    const add = (id: string, pos: T.Vector3, radius: number, label: string, icon: string, act: () => void) => list.push({ id, pos, radius, label, icon, act });
    if (this.mode === 'deck' && this.raid) {
      // Battle stations: only the gongs are on deck.
      DECK.gongs.forEach((g, i) => add(`gong${i}`, this.bao.at(g), 1.8, 'Ring the gong', '🔔', () => this.ringGong(i)));
    } else if (this.mode === 'deck') {
      const at = (p: readonly [number, number]) => this.bao.at(p);
      s.plots.forEach((p, i) => {
        const pos = at(DECK.plots[i]);
        if (p.crust > 0) add(`plot${i}`, pos, 1.3, 'Ring the crust', '🔔', () => { this.keeper.actor.lookAt(pos.x, pos.z); this.keeper.ring(false); });
        else if (!p.tree) add(`plot${i}`, pos, 1.2, 'Plant', '🌱', () => this.openPanel('plot', i));
        else if (p.phase === 'ripe' && p.tree !== 'golden') add(`plot${i}`, pos, 1.2, 'Harvest', '🧺', () => this.doHarvest(i));
        else add(`plot${i}`, pos, 1.1, 'Look', '👀', () => this.openPanel('plot', i));
      });
      for (let i = 0; i < s.whale.specks; i++) { const sp = this.bao.specks[i]; add(`speck${i}`, sp.position.clone(), 1.2, 'Brush', '🧹', () => this.doBrush(i)); }
      const whaleFood = (['starfig', 'glowplum', 'puffberry'] as ItemId[]).some(id => count(s, id) > 0);
      if (!s.story.flags.petted || !whaleFood) add('feed', at(DECK.feed), 1.6, 'Pat Bao', '🤚', () => this.doPet());
      else add('feed', at(DECK.feed), 1.6, 'Feed Bao', '🍓', () => this.doFeedAll());
      add('map', at(DECK.maptable), 1.6, 'Sky map', '🗺️', () => this.openPanel('map'));
      add('workbench', at(DECK.workbench), 1.6, 'Workbench', '🔨', () => this.openPanel('workbench'));
      add('crate', at(DECK.crate), 1.5, 'Shipping crate', '📦', () => this.openPanel('crate'));
      add('pantry', at(DECK.pantry), 1.4, 'Bag', '🎒', () => this.openPanel('bag'));
      add('hatch', at(DECK.hatch), 1.6, 'Go inside', '🚪', () => this.enterHouse());
      if (isShip(s.place) && !s.voyage) add('plank', at(this.bao.plankCalf()), 1.7, 'Board the ship', '⚔️', () => this.board());
      else add('rope', at(DECK.ropepost), 1.5, s.place === 'dawnreach' || s.voyage ? 'Rope' : 'Go down', '🪢', () => this.descend());
      add('lift', at(this.bao.liftCalf()), 1.6, 'Go fishing', '🎣', () => this.goFishing());
      if (s.gear.drone > 0) add('drone', at(DECK.dronePad), 1.6, 'Fly the scooter', '🛸', () => this.startDrone());
      for (const [id, a] of this.bao.crew) if (s.crew.includes(id) && a.root.visible) add(`crew-${id}`, a.root.position, 1.4, 'Talk', '💬', () => this.talk(id));
      for (const d of this.dews) if (d.alive) add('dew', d.o.position, 0, 'Catch', '✨', () => this.catchDew(d));
    } else if (this.mode === 'skiff') {
      // Casting is the context button; pulling the rope has its own button (HUD).
      if (this.fishing.state === 'off') add('cast', this.keeper.pos.clone(), 9, 'Cast', '🎣', () => this.startFishing());
    } else if (this.mode === 'house') {
      // The owner's cottage furniture, each with a Cloudback job.
      const at = (kit: string) => { const p = placementOf(kit); return p ? new T.Vector3(p.x, 0, p.z) : null; };
      const use = (id: string, kit: string, radius: number, label: string, icon: string, act: () => void) => { const p = at(kit); if (p) add(id, p, radius, label, icon, act); };
      add('ladder', new T.Vector3(0, 0, HOUSE.bounds.z1 - .7), 1.6, 'Climb up', '🪜', () => this.leaveHouse());
      use('bed', 'bed', 2.0, 'Rest', '🛏️', () => this.doRest());
      use('shelf', 'trophy_shelf', 1.8, 'The Notes', '🎵', () => this.openPanel('bao'));
      use('wardrobe', 'wardrobe', 1.7, 'Bag', '🎒', () => this.openPanel('bag'));
      if (s.rooms.kitchen) use('stove', 'stove', 1.6, 'Cook', '🍳', () => this.openPanel('kitchen'));
      if (s.rooms.craft) use('bench', 'workbench', 1.9, 'Workbench', '🔨', () => this.openPanel('workbench'));
      if (s.rooms.study) { use('globe', 'globe', 1.5, 'Sky map', '🗺️', () => this.openPanel('map')); use('desk', 'desk', 1.6, 'Journal', '📖', () => this.openPanel('journal')); }
      if (s.rooms.bath) use('bath', 'bathtub', 1.8, 'Take a bath', '🛁', () => this.doBath());
      for (const room of Object.keys(ROOM_DOORS) as RoomId[]) if (!s.rooms[room]) { const o = ROOM_DOORS[room].outside; add(`repair-${room}`, new T.Vector3(o.x, 0, o.z), 1.6, 'Repair', '🛠️', () => this.openPanel('repair', room)); }
      for (const [id, a] of this.cabin.crew) if (a.root.visible) add(`crew-${id}`, a.root.position, 1.4, 'Talk', '💬', () => this.talk(id));
    } else if (this.mode === 'isle' && this.isle) {
      const id = s.place as IsleId, map = ISLE_MAPS[id], v = this.isle;
      if (v.kind === 'ship') add('rope', new T.Vector3(map.landing[0] - .3, 0, map.landing[1]), 1.7, 'To Bao', '🐋', () => this.ascend());
      else {
        const rope = new T.Vector3(map.landing[0] + 1.2, v.height(map.landing[0], map.landing[1]), map.landing[1] - .6);
        add('rope', rope, 1.6, 'Climb up', '🪢', () => this.ascend());
      }
      for (const c of this.combat.cages) if (!c.open) add(`cage${c.captive ? 'f' : ''}${c.index}`, c.pos, 1.9, c.locked ? 'Locked' : 'Ring the cage', '🔔', () => { this.keeper.actor.lookAt(c.pos.x, c.pos.z); this.keeper.ring(false); });
      if (v.kind === 'land') {
        map.ore.forEach((o, i) => { if (oreReady(s, id, i)) add(`ore${i}`, v.ore[i].position, 1.8, 'Mine ore', '⛏️', () => this.doMine(i)); });
        map.wild.forEach((w, i) => { if (wildReady(s, id, i)) add(`wild${i}`, v.wild[i].position, 1.6, 'Pick', '🧺', () => this.doWild(i)); });
        if (map.market && v.market?.visible) add('market', v.market.position, 2.2, 'Trade', '🛍️', () => this.openPanel('market', id));
      }
    }
    this.interactables = list;
    // The context button shows the nearest thing in reach.
    let best: Interactable | null = null, bd = Infinity;
    // Talking to the crew loses ties to objects (people wander next to the hatch and the plots).
    for (const it of list) { if (!it.radius) continue; const d = flat(this.keeper.pos, it.pos), score = d + (it.id.startsWith('crew-') ? .7 : 0); if (d < it.radius && score < bd) { bd = score; best = it; } }
    this.nearby = best;
  }
  /** True while play is running (no panel, no speech, no scene change): HUD buttons act only then (code review 10). */
  private live() { return !(this.panels.open || this.hud.talking || this.mode === 'cut' || this.mode === 'ride' || this.frozen); }

  /** Use the nearest thing, measured now (not at the last frame), so a press right after a move hits what is in reach. */
  private useNearby() { if (this.mode === 'deck' || this.mode === 'isle' || this.mode === 'house' || this.mode === 'skiff') this.buildInteractables(); const n = this.nearby; if (n && !this.paused) n.act(); }

  // ----------------------------------------------------------------- pointer
  private bindPointer() {
    let down: { x: number; y: number; id: number; t: number } | null = null;
    this.canvas.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY, id: e.pointerId, t: performance.now() }; });
    this.canvas.addEventListener('pointerup', e => {
      if (!down || down.id !== e.pointerId) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      down = null;
      if (moved > 12 || this.paused || this.mode === 'cut' || this.mode === 'ride') return;
      this.tap(e.clientX, e.clientY);
    });
    this.canvas.addEventListener('wheel', e => { e.preventDefault(); this.setZoom(this.zoom * (1 + Math.sign(e.deltaY) * .08)); }, { passive: false });
    // Two fingers on the canvas pinch the camera in and out (phones had no zoom before).
    const touches = new Map<number, { x: number; y: number }>();
    let pinch0 = 0, zoom0 = 1;
    const spread = () => { const [a, b] = [...touches.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
    this.canvas.addEventListener('pointerdown', e => { if (e.pointerType !== 'touch') return; touches.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (touches.size === 2) { pinch0 = spread(); zoom0 = this.zoom; down = null; } });
    this.canvas.addEventListener('pointermove', e => { if (!touches.has(e.pointerId)) return; touches.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (touches.size === 2 && pinch0 > 10) this.setZoom(zoom0 * pinch0 / Math.max(10, spread())); });
    for (const ev of ['pointerup', 'pointercancel'] as const) this.canvas.addEventListener(ev, e => { touches.delete(e.pointerId); if (touches.size < 2) pinch0 = 0; });
  }
  /** A tap picks the nearest thing on screen (in pixels, so small things stay easy to hit), else walks there. */
  tap(cx: number, cy: number) {
    const rect = this.canvas.getBoundingClientRect(), v = new T.Vector3();
    const pickR = 48 * Math.min(1.4, Math.max(.8, rect.height / 800));
    let best: { d: number; act: () => void } | null = null;
    const consider = (pos: T.Vector3, lift: number, act: () => void) => {
      v.copy(pos); v.y += lift; v.project(this.camera);
      if (v.z > 1) return;
      const x = rect.left + (v.x * .5 + .5) * rect.width, y = rect.top + (-v.y * .5 + .5) * rect.height, d = Math.hypot(x - cx, y - cy);
      if (d < pickR && (!best || d < best.d)) best = { d, act };
    };
    for (const it of this.interactables) {
      // In the skiff the two buttons are the whole job; a tap there is a cast or a reel, never a walk.
      if (this.mode === 'skiff') continue;
      consider(it.pos, it.id === 'dew' ? 0 : .6, () => {
        if (it.id === 'dew') { it.act(); return; }
        if (flat(this.keeper.pos, it.pos) <= it.radius) it.act();
        else this.keeper.walkTo(it.pos.x, it.pos.z, () => it.act(), Math.max(.6, it.radius - .5));
      });
    }
    for (const f of this.combat.forms) if (!f.dead) consider(f.pos, .6, () => this.keeper.walkTo(f.pos.x, f.pos.z, null, 1.6));
    if (best) { (best as { act: () => void }).act(); return; }
    if (this.mode === 'skiff') { if (this.fishing.state === 'off') this.startFishing(); return; }
    // Walk to the ground point under the tap.
    const ndc = new T.Vector2((cx - rect.left) / rect.width * 2 - 1, -((cy - rect.top) / rect.height) * 2 + 1);
    const ray = new T.Raycaster(); ray.setFromCamera(ndc, this.camera);
    const plane = new T.Plane(new T.Vector3(0, 1, 0), -this.keeper.pos.y), hit = new T.Vector3();
    if (ray.ray.intersectPlane(plane, hit)) { this.keeper.walkTo(hit.x, hit.z); this.fx.ring(hit, '#ffffff', .2, .7, .3, .6); }
  }

  // ----------------------------------------------------------------- actions
  private doHarvest(i: number) {
    const r = harvest(this.state, i);
    if (!r.ok) { this.hud.toast(t(r.why), 'info'); return; }
    const at = this.bao.at(DECK.plots[i]).setY(1.2);
    this.fx.sparkle(at, '#ffe28a', 8); this.fx.text(at, `+${r.n} ${t(ITEMS[r.item].name)}`, 'gain');
    play('harvest');
    if (r.sparks) { this.fx.text(at.clone().setY(at.y + .6), `+1 ${t('Sky Spark')}`, 'crit'); this.fx.sparkle(at, '#fff3a0', 16); play('dew'); this.scene_('spark_first'); }
    this.skillUp('garden', r.skill);
    if (ITEMS[r.item].kind === 'whale') this.scene_('harvested');
    this.syncDeck();
  }
  private doFeedAll() {
    const s = this.state;
    const whaleFood = (['starfig', 'glowplum', 'puffberry'] as ItemId[]).some(id => count(s, id) > 0);
    if (!whaleFood) { this.openPanel('bao'); return; }
    const r = feedAll(s);
    this.fedFx(r.pieces, r.xp);
    this.scene_('fed');
  }
  /** A pat at the bow (chapter 1: "Meet Bao": Bao opens one huge eye and hums). */
  private doPet() {
    const first = !this.state.story.flags.petted, r = pet(this.state);
    if (!r.ok) { this.hud.toast(t(r.why), 'info'); return; }
    this.bao.happy(); play('hum');
    const at = this.bao.feedSpot().setY(.8);
    this.fx.sparkle(at, '#ffb0d8', 14); this.fx.text(at, `+${r.mood} ${t('mood')}`, 'gain');
    if (first) this.scene_('met_bao'); else this.hud.toast(t('Bao hums happily.'), 'good');
  }
  private fedFx(pieces: number, xp: number) {
    const at = this.bao.feedSpot().setY(.6);
    this.fx.burst(at, '#ff7fa8', Math.min(24, 4 + pieces * 2), { speed: 3, up: 4, size: .14 });
    this.fx.text(at, `+${xp} ${t('growth')}`, 'gain');
    this.bao.happy(); play('feed'); setTimeout(() => play('hum'), 300);
    this.checkCanGrow();
  }
  /** Nana's 'Bao can grow!' line, the first time the badge lights up (logic review 5). */
  private checkCanGrow() { if (!this.state.story.flags.scene_can_grow && canGrow(this.state) && !this.state.voyage) this.scene_('can_grow'); }
  private doBrush(i: number) {
    if (!brush(this.state).ok) return;
    const sp = this.bao.specks[Math.min(i, this.bao.specks.length - 1)];
    this.fx.burst(sp.position.clone().setY(.4), '#9a8cc8', 10, { speed: 2, up: 3 }); this.fx.text(sp.position, '+2✦', 'gain');
    play('brush'); this.bao.happy();
    this.syncDeck();
  }
  private doGrow() {
    const r = grow(this.state);
    if (!r.ok) { this.hud.toast(t(r.why), 'info'); return; }
    this.bao.setStage(r.stage);
    play('grow');
    this.fx.sparkle(new T.Vector3(0, 1.5, 0), '#ffe28a', 40, 2);
    this.fx.ring(new T.Vector3(0, 0, 0), '#ffffff', 2, 14, 1.4);
    this.hud.toast(t('Bao grew into a {stage} whale!', { stage: ['Calf', 'Young', 'Adult', 'Great'][r.stage] }), 'good');
    setTimeout(() => this.scene_(`grown_${r.stage}`), 1200);
    this.panels.close();
    this.syncDeck(); this.save();
  }
  private doMine(i: number) {
    const v = this.isle; if (v?.kind !== 'land') return;
    const r = mineOre(this.state, this.state.place as IsleId, i);
    if (!r.ok) return;
    const o = v.ore[i];
    this.keeper.actor.lookAt(o.position.x, o.position.z); this.keeper.actor.play('swing', .24);
    this.fx.burst(o.position.clone().setY(.8), '#ffb03a', 12); this.fx.text(o.position, `+${r.n} ${t('Ore')}`, 'gain'); play('chime');
  }
  private doWild(i: number) {
    const v = this.isle; if (v?.kind !== 'land') return;
    const r = pickWild(this.state, this.state.place as IsleId, i);
    if (!r.ok) return;
    const o = v.wild[i];
    this.fx.sparkle(o.position.clone().setY(1), '#ffe28a', 8); this.fx.text(o.position, `+${r.n} ${t(ITEMS[r.item].name)}`, 'gain'); play('harvest');
  }
  /** A nap in Nana's bed: full health, a saved game, and Bao's lullaby. */
  private doRest() {
    if (!this.live()) return;
    const s = this.state;
    const veil = this.uiRoot.querySelector('#veil') as HTMLElement;
    veil.classList.add('on');
    play('hum');
    setTimeout(() => {
      s.hero.hp = maxHp(s);
      this.napped = true;
      this.save();
      veil.classList.remove('on');
      this.hud.toast(s.rooms.bath ? t('You napped while Bao hummed a lullaby. Now a hot bath!') : t('You napped while Bao hummed a lullaby. Fully rested!'), 'good');
    }, 650);
  }
  /** After a nap, a bath makes the Captain Fresh (the repaired bathroom). */
  private doBath() {
    const s = this.state;
    if (!this.napped) { this.hud.toast(t('Have a nap in the bed first, then a bath.'), 'info'); return; }
    this.napped = false;
    s.hero.freshUntil = s.playSeconds + HOME.fresh.seconds;
    play('splash'); this.fx.sparkle(this.keeper.pos.clone().setY(1.2), '#bfe8ff', 18);
    this.hud.toast(t('Fresh! Your mallet rings harder for 5 minutes.'), 'good');
  }

  private quickEat() {
    const r = quickEat(this.state);
    if (!r.ok) { this.hud.toast(t('No food in your bag'), 'info'); return; }
    this.fx.text(this.keeper.pos, `+${r.heal}`, 'heal'); play('feed');
  }
  private talk(id: CrewId) {
    const lines = CHATTER[id], n = this.chatter.get(id) ?? 0;
    this.chatter.set(id, n + 1);
    this.hud.say([{ who: id, text: lines[n % lines.length] }]);
  }
  sail(to: PlaceId) {
    const r = startVoyage(this.state, to, this.rng.stream('voyage'));
    if (!r.ok) { this.hud.toast(t(r.why), 'warn'); return; }
    this.stopFishing();
    play('sail');
    this.hud.toast(r.hungry ? t('Bao is hungry: a slow flight…') : t('Bao flies to {place}!', { place: PLACES[to].name }), r.hungry ? 'warn' : 'good');
    this.showIsleBelow();
    this.save();
  }

  /** Play a story scene once (flags in the save). */
  scene_(key: string, always = false) {
    const lines: Line[] | undefined = SCENES[key];
    if (!lines) return;
    const flag = `scene_${key}`;
    if (!always && this.state.story.flags[flag]) return;
    this.state.story.flags[flag] = true;
    this.hud.say(lines);
  }

  openPanel(kind: PanelKind, arg: unknown = null) {
    this.keys.blocked = true;
    this.hud.releaseStick();
    this.panels.show(kind, arg);
  }

  /** Chapter 1: a new captain wakes up in the cottage's patchwork bed. */
  wakeUp() { this.enterHouse('bed'); this.scene_('wake'); }

  // ----------------------------------------------------------------- loop
  start() { this.renderer.setAnimationLoop(() => { const now = performance.now(); const dt = (now - (this.lastFrame || now)) / 1000; this.lastFrame = now; this.loop.advance(dt); }); }
  private lastFrame = 0;
  /** Camera distance factor: closer 0.75, farther up to 1.6 (wheel, pinch). */
  setZoom(z: number) { this.zoom = Math.min(1.6, Math.max(.75, z)); }

  /** Test hook: run `seconds` of game steps without rendering each one (fights, voyages, raids). */
  simulate(seconds: number) { for (let i = 0; i < seconds * 60; i++) this.step(1 / 60); }

  private where(): Where { if (this.mode === 'drone') return 'deck'; return this.mode === 'isle' ? 'isle' : this.mode === 'house' ? 'house' : this.mode === 'skiff' || this.mode === 'ride' ? 'skiff' : 'deck'; }

  private step(dt: number) {
    const s = this.state, now = Date.now();
    this.paused = this.panels.open || this.hud.talking || this.mode === 'cut' || this.frozen;
    this.keys.now = this.loop.gameTime;
    // F (or Enter) also turns the page of the speech card (code review 18).
    if (this.hud.talking && !this.panels.open && this.keys.pressed('interact')) this.hud.next();
    if (this.paused) { catchUp(s, now); this.keys.endStep(); return; }
    if (this.mode === 'ride') { this.updateRide(dt); this.keys.endStep(); tickRules(s, dt, true, now, !this.raid); return; }
    // Input → intents.
    const kx = (this.keys.isDown('right') ? 1 : 0) - (this.keys.isDown('left') ? 1 : 0), kz = (this.keys.isDown('down') ? 1 : 0) - (this.keys.isDown('up') ? 1 : 0);
    const stick = this.mode === 'skiff' ? { x: 0, z: 0 } : kx || kz ? { x: kx, z: kz } : this.hud.stick;
    if (this.keys.pressed('ring')) this.keeper.ring(false);
    if (this.keys.pressed('spin')) this.keeper.ring(true);
    if (this.keys.pressed('hop')) this.keeper.hop(stick.x, stick.z);
    if (this.keys.pressed('conch')) this.blowConch();
    if (this.keys.pressed('interact')) {
      // In the skiff F casts, then reels; anywhere else it uses what is in reach.
      if (this.mode === 'skiff') { if (this.fishing.state === 'off') this.startFishing(); }
      else this.useNearby();
    }
    if (this.keys.pressed('eat')) this.quickEat();
    this.keys.endStep();
    const combatOn = this.mode === 'isle' || !!this.raid;
    this.keeper.autoAttack = combatOn;
    // The land's colour returns over about 3 s of game time after the song.
    GLOOM.value = damp(GLOOM.value, this.gloomTarget, 1.4, dt);
    if (Math.abs(GLOOM.value - this.gloomTarget) < .002) GLOOM.value = this.gloomTarget;
    this.updateList(dt);
    if (this.mode === 'drone') this.updateDrone(dt, kx || kz ? { x: kx, z: kz } : this.hud.stick);
    else this.keeper.update(dt, stick);
    this.fx.stepGame(dt);
    this.combat.update(dt);
    if (combatOn) this.hive?.update(dt);
    this.updateRaid(dt);
    this.updateCannon(dt);
    this.updateShells(dt);
    this.updateFollowers(dt);
    this.updateHelpers(dt);
    if (this.mode === 'deck') { this.updateCrew(dt); this.updateDew(dt); }
    if (this.mode === 'drone') { this.updateDew(dt); this.updateSparks(dt); }
    this.updateFishing(dt);
    // First meetings with each boss's trick.
    if (this.hive?.awake && !this.hive.broken && !this.hive.shielded) { const key = ({ hushbell: 'hush_first', barnacle: 'barnacle_first', coilwyrm: 'wyrm_first' } as Record<string, string>)[this.hive.id]; if (key) this.scene_(key); }
    const ev = tickRules(s, dt, this.mode === 'deck' || this.mode === 'house' || this.mode === 'skiff' || this.mode === 'drone', now, !this.raid);
    if (ev.ripened.length && this.mode === 'deck') { play('harvest', .2); }
    if (ev.picked) this.hud.toast(t('Pip picked {list}', { list: Object.entries(ev.picked).map(([k, n]) => `${n} ${t(ITEMS[k as ItemId].name)}`).join(', ') }), 'info');
    if (ev.meal) this.hud.toast(t('Mina left a Fish Bun in your bag.'), 'good');
    if (ev.speck) { this.scene_('speck'); this.syncDeck(); }
    if (ev.gifts.length) { this.scene_('nana_gift', true); }
    if (ev.leftover) this.hud.toast(t('Leftover Gloom crept back onto {place}.', { place: PLACES[ev.leftover as IsleId].name }), 'warn');
    if (ev.voyage === 'raid') this.startRaid();
    if (ev.voyage === 'dew' && this.mode === 'deck') this.spawnDew(false);
    if (s.voyage?.treasure && s.voyage.elapsed > s.voyage.duration * .6 && !this.dews.some(d => d.treasure && d.alive)) { this.spawnDew(true); }
    if (ev.voyage === 'arrive') this.arrive();
    // Story triggers that depend on state.
    if (s.gear.rope && !s.story.flags.scene_rope) this.scene_('rope');
    if (s.story.flags.planted && !s.story.flags.scene_planted) this.scene_('planted');
    this.saveT += dt;
    if (this.saveT > 10) { this.saveT = 0; this.save(); }
  }

  private arrive() {
    const s = this.state;
    play('arrive');
    if (this.mode === 'deck') this.showIsleBelow();
    if (s.place !== 'dawnreach') setTimeout(() => this.scene_(`arrive_${s.place}`), 900);
    this.checkCanGrow();
    this.dews.forEach(d => { d.alive = false; d.o.visible = false; });
    this.hud.toast(t('Bao is over {place}.', { place: PLACES[s.place].name }), 'good');
    // Alongside a Gloom ship, Juno's cannon softens its crust.
    if (isShip(s.place) && !s.isles[s.place].freed && hasCrew(s, 'juno')) {
      setTimeout(() => { const v = this.isle; if (v?.kind !== 'ship') return; this.bao.fireCannon(v.group.position); play('gong'); this.fx.ring(v.group.position.clone().setY(1), '#ffe28a', 1, 8, .7); this.hud.toast(t('Juno’s cannon softens its crust!'), 'good'); }, 1600);
    }
    if (s.place !== 'dawnreach' && !s.isles[s.place as IsleId].freed) setMusic(s.place === 'star' ? 'night' : 'gloom'); else setMusic('calm');
    this.rng = new RngStreams(s.seed + ':' + s.stats.voyages);
    this.save();
  }

  // ---------------------------------------------------------------- render
  private render(realDt: number) {
    const s = this.state;
    // Sky speed and look: blend toward the destination while flying.
    this.sky.target = s.voyage ? 9 : .8;
    this.applyLook();
    this.bao.update(realDt, s.whale.mood);
    if (this.mode === 'isle' && this.isle?.kind === 'land') { this.isle.update(realDt); this.bao.root.position.y = 30 + Math.sin(this.loop.realTime * .4) * .4; }
    if (this.isle?.kind === 'ship') this.isle.update(realDt);
    if (this.note) {
      this.note.t += realDt;
      const n = this.note.o; n.position.y += realDt * 6; n.rotation.y += realDt * 3;
      this.fx.sparkle(n.position, '#ffe28a', 1, .6);
      if (this.note.t > 2.2) { this.scene.remove(n); this.note = null; }
    }
    // Trees ripen, Pip picks, raids crust: the deck follows the save a few times a second (logic review 4).
    this.syncT += realDt;
    if (this.syncT > .25 && this.mode === 'deck') { this.syncT = 0; this.bao.sync(this.state, !!this.raid); }
    this.updateShips(realDt);
    this.updateAmbientPod(realDt);
    for (const p of this.pod) if (p.userData.rising) { p.position.y = Math.min(p.userData.toY, p.position.y + realDt * 1.8); p.rotation.y += realDt * .04; }
    this.interactT += realDt;
    if (this.interactT > .1 && (this.mode === 'deck' || this.mode === 'isle' || this.mode === 'house' || this.mode === 'skiff')) { this.interactT = 0; this.buildInteractables(); }
    if (this.mode === 'house') this.cabin.update(realDt, this.keeper.pos);
    // Camera: follow the Captain (low and close in the skiff, so Bao's belly shows overhead).
    const aspect = this.canvas.clientWidth / Math.max(1, this.canvas.clientHeight);
    const skiff = this.mode === 'skiff' || this.mode === 'ride';
    const base = this.mode === 'drone' ? CAMERA.deck * 1.1 : skiff ? CAMERA.skiff : this.mode === 'isle' ? (this.isle?.kind === 'ship' ? CAMERA.ship : CAMERA.isle) : this.mode === 'house' ? CAMERA.house : CAMERA.deck * (1 + .38 * Math.max(0, this.bao.half()[1] / 8 - 1));
    const dist = base * this.zoom * (aspect < .8 ? CAMERA.portrait : 1);
    const k = this.keeper.pos;
    this.focus.x = damp(this.focus.x, k.x, 7, realDt); this.focus.z = damp(this.focus.z, k.z, 7, realDt); this.focus.y = damp(this.focus.y, k.y, this.mode === 'ride' ? 12 : 4, realDt);
    const cin = this.cinematic;
    if (cin) {
      const a = this.loop.realTime * cin.spin, pr = cin.pitch * Math.PI / 180;
      this.camera.position.set(Math.sin(a) * Math.cos(pr) * cin.dist, Math.sin(pr) * cin.dist - 2, Math.cos(a) * Math.cos(pr) * cin.dist);
      this.camera.lookAt(0, -3, 0);
    } else {
      const pr = (skiff ? CAMERA.skiffPitch : CAMERA.pitch) * Math.PI / 180, lift = skiff ? 1.6 : .6;
      if (skiff) {
        // Low and outboard, looking up past the skiff at Bao's belly and the lift rope that holds the boat to the ship.
        this.camera.position.set(this.focus.x + dist * .55, this.focus.y + Math.sin(pr) * dist + lift, this.focus.z + dist * .8);
        this.camera.lookAt(this.focus.x - 2.5, this.focus.y + 4.2, this.focus.z);
      } else {
        this.camera.position.set(this.focus.x, this.focus.y + Math.sin(pr) * dist + lift, this.focus.z + Math.cos(pr) * dist);
        this.camera.lookAt(this.focus.x, this.focus.y + lift, this.focus.z);
      }
    }
    const sh = this.fx.trauma.offset(this.loop.realTime);
    this.camera.rotateY(sh.yaw * Math.PI / 180); this.camera.rotateX(sh.pitch * Math.PI / 180); this.camera.rotateZ(sh.roll * Math.PI / 180);
    this.lighting.follow(this.focus.x, this.focus.y, this.focus.z);
    this.sky.update(realDt, this.camera);
    this.fx.update(realDt, this.camera, this.canvas.clientWidth, this.canvas.clientHeight);
    this.governor.sample(realDt, !this.paused);
    this.renderer.render(this.scene, this.camera);
    this.hudT += realDt;
    if (this.hudT > .05) { this.hudT = 0; this.updateHud(); }
  }

  private applyLook() {
    const s = this.state;
    let look: Look;
    if (this.frozenLook) look = this.frozenLook;
    else if (this.mode === 'house') look = CABIN_LOOK;
    else if (s.voyage) { const a = LOOKS[s.voyage.from], b = LOOKS[s.voyage.to], k = Math.min(1, s.voyage.elapsed / s.voyage.duration); look = mixLook(mixLook(a, LOOKS.voyage, Math.min(1, k * 3)), b, Math.max(0, (k - .55) / .45)); }
    else look = LOOKS[s.place];
    if (look === this.lastLook) return;
    this.lastLook = look;
    // Halfway through a voyage the ground below turns into the destination's.
    this.sky.setBelow(this.mode === 'house' ? 'clouds' : s.voyage ? BELOW[s.voyage.elapsed / s.voyage.duration > .5 ? s.voyage.to : s.voyage.from] : BELOW[s.place]);
    this.lighting.apply(look); this.sky.apply(look);
    this.renderer.setClearColor(look.fog);
    const sea = this.skiff.getObjectByName('cloud-sea') as T.Mesh | undefined;
    if (sea) (sea.material as T.MeshLambertMaterial).color.set(look.cloud);
  }
  private lastLook: Look | null = null;
  frozenLook: Look | null = null;
  /** A far, slow camera for the prologue and the ending. */
  cinematic: { dist: number; pitch: number; spin: number } | null = null;

  private updateHud() {
    const s = this.state, where = this.where(), g = syncStoryEvents(s, where);
    const hive = this.mode === 'isle' && this.hive && !this.hive.broken && (this.hive.awake || flat(this.keeper.pos, this.hive.pos) < 18) ? this.hive : null;
    const view: HudView = {
      mode: where, combat: this.mode === 'isle' || !!this.raid,
      context: this.nearby ? this.nearby.label : null, contextIcon: this.nearby?.icon ?? '✋',
      fishing: this.fishing.state, ...this.fishingView(), cooldowns: { spin: this.keeper.spinCd / KEEPER.spin.cooldown, hop: this.keeper.hopCd / KEEPER.hop.cooldown },
      eat: quickEatItem(s), place: PLACES[s.place].name,
      raid: this.raid ? (this.raid.wave < 0 ? t('Gloom ships in {n}…', { n: Math.ceil(this.raid.warn - this.raid.t) }) : t('Ship battle! {n}s', { n: Math.max(0, Math.ceil(RAID.timeout - this.raid.total)) })) : null,
      conch: this.mode === 'isle' && !!s.story.flags.conch,
      pull: this.mode === 'skiff' || this.mode === 'drone', pullLabel: this.mode === 'drone' ? 'Land' : 'Pull the rope',
    };
    if (hive) { view.boss = hive.hp / hive.max; view.bossName = HIVES[hive.id].name; view.bossShield = hive.shielded; view.bossStatus = hive.status(); }
    this.hud.update(s, g, view);
    this.panels.refresh();
  }

  syncDeck() {
    this.bao.setDeck(this.state.gear.deck);
    this.bao.sync(this.state, !!this.raid);
    // The golden-bell keepsake: the Captain's mallet shines gold.
    const gold = this.state.keepsakes.includes('goldbell');
    if (this.keeper.actor.mallet && this.keeper.actor.mallet.userData.gold !== gold) {
      this.keeper.actor.mallet.userData.gold = gold;
      this.keeper.actor.mallet.traverse(o => { const m = o as T.Mesh; if (!m.isMesh) return; m.userData.plain ??= m.material; m.material = gold ? GOLD : m.userData.plain; });
    } if (this.mode === 'deck' && !this.crewPlaced) { this.placeCrew(); this.crewPlaced = true; } }
  private crewPlaced = false;
  private syncT = 0;
  private interactT = 0;
  cabin = new CottageView();

  private snapCamera() { const k = this.keeper.pos; this.focus.copy(k); }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setPixelRatio(this.governor.ratio);
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = `${w}px`; this.canvas.style.height = `${h}px`;
    this.camera.aspect = w / h;
    this.camera.fov = w / h < .8 ? CAMERA.portraitFov : verticalFovForAspect(CAMERA.fov, w / h, 16 / 10);
    this.camera.updateProjectionMatrix();
  }

  /** Set while the page reloads into another save (Start over, Load code): nothing may save the old game then. */
  reloading = false;
  save() { if (!this.reloading) saveGame(this.state); }

  // ----------------------------------------------------------------- ending
  /**
   * The pod asleep in the Deep Mist under the Grey Star: Grand Hana behind the flagship and two more whales at the
   * sides, crusted grey-violet. When the Heart breaks the crust's colour pours out of them and they rise.
   */
  private sleepingPod(freed: boolean) {
    for (const w of this.pod) this.scene.remove(w);
    this.pod = [];
    const spots: [number, number, number, number, number][] = [[0, -18, -50, 0, 2.1], [-40, -16, -18, 1.25, 1.35], [40, -16, -24, -1.3, 1.35]];
    for (const [x, y, z, rot, scale] of spots) {
      const w = whole('whale', { gloom: true }) ?? new T.Group();
      w.position.set(x, freed ? 6 + scale * 3 : y, z); w.rotation.y = rot; w.scale.setScalar(scale);
      w.userData.toY = 6 + scale * 3;
      this.scene.add(w); this.pod.push(w);
    }
    GLOOM.value = freed ? 0 : 1; this.gloomTarget = GLOOM.value;
  }

  /** After the ending the pod drifts across the sky around Bao (STORY §11), Grand Hana the biggest. */
  private ambientPod = new T.Group();
  private updateAmbientPod(dt: number) {
    const show = this.state.story.ended && this.state.story.endingSeen && this.mode === 'deck';
    if (show && !this.ambientPod.children.length) {
      ([[2.2, 70, 0], [1.4, 52, 2.1], [1.3, 60, 4.2]] as [number, number, number][]).forEach(([scale, r, a]) => {
        const w = whole('whale') ?? new T.Group(); w.scale.setScalar(scale); w.userData.orbit = { r, a }; this.ambientPod.add(w);
      });
    }
    this.ambientPod.visible = show;
    if (!show) return;
    for (const w of this.ambientPod.children) {
      const o = w.userData.orbit as { r: number; a: number };
      o.a += dt * .03;
      w.position.set(Math.cos(o.a) * o.r, -10 + Math.sin(o.a * 3) * 2, Math.sin(o.a) * o.r - 20);
      w.rotation.y = -o.a + Math.PI;
    }
  }

  private ending() {
    const s = this.state;
    // The pod wakes: the crust's colour is already fading (the shared Gloom tint), and the whales rise.
    for (const w of this.pod) w.userData.rising = true;
    this.gloomTarget = 0;
    play('song'); setTimeout(() => play('grow'), 1200);
    this.scene_('ending');
    if (!s.items.seed_golden) { s.items.seed_golden = 1; }
    this.save();
    setTimeout(() => this.onEnding?.(), 5200);
  }

  // ---------------------------------------------------------------- api
  api(): GameApi {
    const g = this;
    return {
      state: () => g.state,
      onDeck: () => g.mode === 'deck' || g.mode === 'house' || g.mode === 'skiff',
      plant: (i, tree: TreeId) => { const r = plant(g.state, i, tree); if (!r.ok) g.hud.toast(t(r.why), 'warn'); else { play('harvest'); g.fx.sparkle(g.bao.at(DECK.plots[i]).setY(.5), '#9be36a', 10); g.syncDeck(); } },
      uproot: i => { uproot(g.state, i); g.syncDeck(); },
      harvest: i => g.doHarvest(i),
      feed: item => { const r = feed(g.state, item); if (!r.ok) g.hud.toast(t(r.why), 'warn'); else { g.fedFx(1, r.xp); g.scene_('fed'); } },
      feedAll: () => g.doFeedAll(),
      pet: () => g.doPet(),
      grow: () => g.doGrow(),
      sail: to => g.sail(to),
      craft: (id: RecipeId) => {
        const before = maxHp(g.state), r = craft(g.state, id);
        if (!r.ok) { g.hud.toast(t(r.why), 'warn'); return; }
        play('chime'); g.hud.toast(t('Made: {thing}', { thing: RECIPES[id].name }), 'good');
        g.skillUp('craft', r.skill);
        // A new coat adds its health straight away.
        g.state.hero.hp = Math.min(maxHp(g.state), g.state.hero.hp + Math.max(0, maxHp(g.state) - before));
        g.syncDeck(); g.save();
      },
      cook: (id: MealId) => {
        const r = cook(g.state, id);
        if (!r.ok) { g.hud.toast(t(r.why), 'warn'); return; }
        play('harvest'); g.hud.toast(r.portions > 1 ? t('You cooked two {meal}s!', { meal: ITEMS[id].name }) : t('You cooked a {meal}!', { meal: ITEMS[id].name }), 'good');
        g.skillUp('cook', r.skill);
        g.scene_('cooked');
      },
      ship: (item: ItemId, n: number) => {
        const r = shipCrate(g.state, item, n);
        if (!r.ok) { g.hud.toast(t(r.why), 'warn'); return; }
        play('coin'); g.bao.openCrate();
        const at = g.bao.at(DECK.crate).setY(1.2); g.fx.sparkle(at, '#ffe28a', 10); g.fx.text(at, `+${r.glimmer}✦`, 'gain');
        g.scene_('shipped');
      },
      repair: (room: RoomId) => {
        const r = repairRoom(g.state, room);
        if (!r.ok) { g.hud.toast(t(r.why), 'warn'); return; }
        play('grow'); g.panels.close();
        g.syncCabin();
        const o = ROOM_DOORS[room].door; g.fx.sparkle(new T.Vector3(o.x, 1, o.z), '#ffe28a', 30, 1.6); g.fx.ring(new T.Vector3(o.x, 0, o.z), '#ffffff', .5, 4, .8);
        g.hud.toast(t('The {room} is fixed up!', { room: ROOMS[room].name }), 'good');
        g.skillUp('craft', r.level);
        g.scene_(room === 'craft' ? (hasCrew(g.state, 'tam') ? 'room_craft' : 'room_craft_nana') : `room_${room}`);
        g.save();
      },
      board: (picked: HelperId[]) => g.boardNow(picked),
      sell: (isle, item, n) => { const r = sell(g.state, isle, item, n); if (r.ok) play('coin'); else g.hud.toast(t(r.why), 'warn'); },
      buy: (isle, item) => { const r = buy(g.state, isle, item); if (r.ok) play('coin'); else g.hud.toast(t(r.why), 'warn'); },
      upgrade: (isle, id: UpgradeId) => { const r = buyUpgrade(g.state, isle, id); if (r.ok) { play('coin'); g.hud.toast(t('Bought: {thing}', { thing: UPGRADES[id].name }), 'good'); } else g.hud.toast(t(r.why), 'warn'); },
      eat: item => { const r = eat(g.state, item); if (r.ok) { g.fx.text(g.keeper.pos, `+${r.heal}`, 'heal'); play('feed'); } else g.hud.toast(t(r.why), 'warn'); },
      exportSave: () => exportCode(g.state),
      // The old game must not be saved over the new one while the page unloads (logic review 3).
      importSave: code => { const s = importCode(code); if (!s) return false; g.reloading = true; saveGame(s); location.reload(); return true; },
      reset: () => { g.reloading = true; try { localStorage.removeItem(saves.key); } catch { /* ignore */ } saveGame(newGame(`cb-${Date.now() % 1e9}`)); location.reload(); },
      replayPrologue: () => { g.state.story.prologueSeen = false; g.save(); location.reload(); },
      settings: {
        get shake() { return g.settings.shake; },
        get graphics() { return g.governor.setting; },
        setShake: v => { g.settings.shake = v; g.fx.shakeScale = v ? 1 : 0; try { localStorage.setItem('cloudback:shake', v ? 'on' : 'off'); } catch { /* ignore */ } },
        setGraphics: v => { g.governor.choose(v as never); g.resize(); },
      },
    };
  }

  /** Plain-data summary for tests and the test hook. */
  summary() {
    const s = this.state;
    return { mode: this.mode, place: s.place, voyage: s.voyage ? { to: s.voyage.to, k: s.voyage.elapsed / s.voyage.duration, raid: s.voyage.raidState } : null, stage: s.whale.stage, hunger: s.whale.hunger, mood: s.whale.mood, whaleXp: s.whale.xp, level: s.hero.level, hp: s.hero.hp, glimmer: s.glimmer, notes: s.notes, crew: s.crew, rescued: s.rescued, rooms: s.rooms, skills: s.skills, forms: this.combat.aliveCount(), hive: this.hive ? { id: this.hive.id, hp: this.hive.hp, shielded: this.hive.shielded, broken: this.hive.broken, status: this.hive.status() } : null, nearby: this.nearby?.id ?? null, fishing: this.fishing.state, reel: this.fishingView().reel, raid: !!this.raid, goal: goal(s, this.where()).text, items: s.items, gloom: GLOOM.value, keeper: { x: this.keeper.pos.x, y: this.keeper.pos.y, z: this.keeper.pos.z }, helpers: this.helpers.map(h => h.id), families: this.families.length };
  }
}

const GOLD = makeToon('#ffc83a', { emissive: '#5a3a00' });
/** Raid creatures stay crusted (their own Gloom tint, always on). */
const RAIDER_GLOOM = { value: 1 };
/** Cloud puffs around the skiff: bright white like the sky's clouds. */
const FISH_IDS: FishId[] = ['puff_minnow', 'sun_carp', 'star_ray', 'cloud_koi', 'sun_carp', 'puff_minnow', 'star_ray'];
const PUFF = new T.MeshLambertMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: .45, fog: true });
/** The chime cannon's shot: a little golden bell. */
const BELL_GEO = (() => { const g = new T.CylinderGeometry(.12, .3, .42, 12, 1, true); g.translate(0, -.1, 0); return g; })();
/** A crusted cloud raft: the stand-in Gloom ship before gloom.glb has one (raft = flat-topped, raiders stand on it). */
function makeGloomCloud(raft = false) {
  const g = new T.Group(), dark = makeToon('#5e5878'), light = makeToon('#8c86a8');
  if (raft) { const deck = new T.Mesh(new T.CylinderGeometry(3.2, 2.6, .5, 18), dark); deck.scale.z = 1.5; deck.position.y = -.25; g.add(deck); }
  const lumps: [number, number, number, number][] = [[0, 0, 0, 2.6], [2.2, -.3, .6, 1.9], [-2.1, -.2, -.4, 2], [.6, .9, -.8, 1.7], [-.8, -.6, 1.4, 1.6]];
  lumps.forEach(([x, y, z, r], i) => { const m = new T.Mesh(new T.IcosahedronGeometry(r, 2), i % 2 ? light : dark); m.position.set(x, raft ? y - 2.6 : y, z); g.add(m); });
  const eye = new T.Mesh(new T.SphereGeometry(.55, 14, 10), makeToon('#b26bff', { emissive: '#8a3dff' })); eye.position.set(-1.2, .5, 2.2); g.add(eye);
  g.visible = raft;
  return g;
}

export { NIGHT, addXp };
