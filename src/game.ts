import * as T from 'three';
import { GameLoop } from './core/loop.ts';
import { ActionMap } from './core/input.ts';
import { RngStreams } from './core/rng.ts';
import { damp } from './core/feel.ts';
import { verticalFovForAspect } from './core/camera.ts';
import { t } from './i18n.ts';
import { CREW, DECK, ISLE_MAPS, ITEMS, KEEPER, MARKETS, PLACES, POST, RAID, VOYAGE, type CrewId, type FishId, type IsleId, type ItemId, type MealId, type PlaceId, type RecipeId, type TreeId } from './rules/content.ts';
import { count, hasCrew, newGame, type GameState } from './rules/state.ts';
import { tickRules, catchUp } from './rules/tick.ts';
import { crustTree, harvest, plant, ringCrust, uproot } from './rules/garden.ts';
import { brush, feed, feedAll, grow, pet } from './rules/whale.ts';
import { collectDew, collectTreasure, endRaid, startVoyage } from './rules/voyage.ts';
import { addXp, eat, heal, maxHp, quickEat, quickEatItem, ringDamage } from './rules/keeper.ts';
import { faint as rulesFaint, formFreed, groupCleared, hiveBroken, hiveMaxHp, hiveShielded, mineOre, oreReady, pickWild, rescue, spireBroken, tierOf, wildReady, LEFTOVER_FORMS } from './rules/isle.ts';
import { buy, cook, craft, sell } from './rules/trade.ts';
import { goal, raidPlan, type RaidPlan } from './rules/story.ts';
import { biteWait, biteWindow, landFish, rollFish, takeBite } from './rules/fishing.ts';
import { HEART } from './rules/content.ts';
import { CABIN_LOOK, LOOKS, Lighting, GLOOM, NIGHT, mixLook, type Look } from './world/look.ts';
import { Sky } from './world/sky.ts';
import { Fx } from './world/fx.ts';
import { Bao } from './world/bao.ts';
import { IsleView, type Blocker } from './world/isle-view.ts';
import { Actor, walkTo } from './world/actors.ts';
import { Combat, flat, type Ground } from './world/combat.ts';
import { HiveFight, noteView } from './world/hive.ts';
import { CabinView, CABIN } from './world/cabin.ts';
import { Keeper } from './world/keeper.ts';
import { part, whole } from './world/assets.ts';
import { makeToon } from './world/look.ts';
import { Hud, type HudView } from './ui/hud.ts';
import { Panels, type GameApi, type PanelKind } from './ui/panels.ts';
import { SCENES, CHATTER, type Line } from './dialogue.ts';
import { play, setMusic } from './sfx.ts';
import { saveGame, exportCode, importCode, saves } from './save-game.ts';
import { Governor } from './graphics.ts';

type Mode = 'deck' | 'isle' | 'house' | 'cut';
interface Interactable { id: string; pos: T.Vector3; radius: number; label: string; icon: string; act: () => void; auto?: boolean }
interface Follower { who: CrewId; actor: Actor; boarding: boolean; t: number }

/** Portrait screens use a wider lens and a little more distance (as Zoo Garden does), never the full horizontal-FOV rule, which went past 100°. */
const CAMERA = { fov: 40, portraitFov: 47, pitch: 47, deck: 19, isle: 22, house: 14, portrait: 1.22 };
/** Where an isle floats while Bao hovers over it: below and off to the side, so it shows past the whale. */
const ISLE_BELOW = new T.Vector3(30, -28, -18);

export class Game {
  renderer: T.WebGLRenderer;
  scene = new T.Scene();
  camera = new T.PerspectiveCamera(CAMERA.fov, 1, .5, 900);
  lighting: Lighting; sky: Sky; fx: Fx; bao: Bao;
  loop: GameLoop;
  keys = new ActionMap({ up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'], ring: ['Space'], spin: ['KeyQ'], hop: ['KeyE', 'ShiftLeft', 'ShiftRight'], interact: ['KeyF', 'Enter'], eat: ['KeyR'] });
  state: GameState;
  rng: RngStreams;
  hud: Hud; panels: Panels;
  keeper: Keeper;
  combat: Combat;
  hive: HiveFight | null = null;
  isles = new Map<IsleId, IsleView>();
  isle: IsleView | null = null;
  mode: Mode = 'deck';
  private followers: Follower[] = [];
  private campNpc: Actor | null = null;
  private fishing: { state: 'off' | 'wait' | 'bite'; t: number; fish: FishId | null; window: number; bobber: T.Object3D; line: T.Line } ;
  private dews: { o: T.Object3D; treasure: boolean; alive: boolean }[] = [];
  private raid: { plan: RaidPlan; wave: number; t: number; warn: number; total: number; postT: number[]; drops: { at: T.Vector3; kind: RaidPlan['waves'][number][number]; t: number }[] } | null = null;
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
  governor: Governor;
  settings = { shake: true };
  onEnding: (() => void) | null = null;
  frozen = false;

  constructor(private canvas: HTMLCanvasElement, private uiRoot: HTMLElement, state: GameState) {
    this.state = state;
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
    this.scene.add(this.sky.group, this.bao.root, this.fx.group, this.camera, this.gloomCloud, this.cabin.group);
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
      crust: plot => { if (crustTree(this.state, plot)) { this.fx.burst(this.bao.at(DECK.plots[plot]).setY(.8), '#9a8cc8', 12); play('shield'); } },
      sound: n => play(n),
      freeze: s => this.loop.freeze(s),
    });
    this.scene.add(this.combat.group);
    this.fishing = this.makeFishing();
    this.makeCrew();
    for (let i = 0; i < 3; i++) { const o = part('props', 'skydew') ?? (() => { const m = new T.Mesh(new T.IcosahedronGeometry(.7, 1), makeToon('#ffffff', { emissive: '#3a4a7a' })); const g = new T.Group(); g.add(m); return g; })(); o.visible = false; this.scene.add(o); this.dews.push({ o, treasure: false, alive: false }); }

    this.hud = new Hud(uiRoot, {
      context: () => this.useNearby(),
      ring: () => this.keeper.ring(false), spin: () => this.keeper.ring(true),
      hop: () => this.keeper.hop(this.hud.stick.x || this.keeper.vel.x, this.hud.stick.z || this.keeper.vel.z),
      eat: () => this.quickEat(), reel: () => this.reel(),
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
    // Start on Bao (a save made on an isle loads here, design §13.7).
    this.enterDeck(true);
  }

  private lightingProxy() { return { setShadowSize: (n: number) => { if (!this.lighting) return; this.lighting.sun.shadow.mapSize.set(n, n); this.lighting.sun.shadow.map?.dispose(); this.lighting.sun.shadow.map = null; } }; }

  // ------------------------------------------------------------- grounds
  private deckGround(): Ground {
    const blockers: Blocker[] = [];
    return {
      height: () => 0,
      clamp: p => {
        const [a, b] = this.bao.half(), ax = a - .55, bz = b - .7;
        const k = (p.x / ax) ** 2 + (p.z / bz) ** 2;
        if (k > 1) { const s = 1 / Math.sqrt(k); p.x *= s; p.z *= s; }
      },
      get blockers() {
        return blockers;
      },
    } as Ground & { blockers: Blocker[] };
  }
  /** Deck obstacles: props, the posts and grown trees (rebuilt when the stage or the garden changes). */
  private deckBlockers() {
    const s = this.state, list: Blocker[] = [];
    const add = (p: readonly [number, number], r: number) => { const v = this.bao.at(p); list.push({ x: v.x, z: v.z, r: r * this.bao.scale }); };
    add(DECK.hatch, .85); add(DECK.workbench, .65); add(DECK.maptable, .55); add(DECK.pantry, .5); add(DECK.ropepost, .3);
    if (hasCrew(s, 'mina')) add(DECK.kitchen, .6);
    s.posts.forEach(i => add(DECK.posts[i], .3));
    s.plots.forEach((p, i) => { if (p.tree && p.phase !== 'empty') add(DECK.plots[i], .32); });
    return list;
  }
  private isleGround(isle: IsleView): Ground {
    const extra = (): Blocker[] => [
      ...this.combat.spires.filter(sp => !sp.broken).map(sp => ({ x: sp.pos.x, z: sp.pos.z, r: .75 })),
      ...this.combat.cages.filter(c => !c.open).map(c => ({ x: c.pos.x, z: c.pos.z, r: .8 })),
      ...(this.hive && !this.hive.broken ? [{ x: this.hive.pos.x, z: this.hive.pos.z, r: this.hive.radius }] : []),
    ];
    return { height: (x, z) => isle.height(x, z), clamp: p => isle.clampInside(p), get blockers() { return [...isle.blockers, ...extra()]; } } as Ground;
  }

  // -------------------------------------------------------------- scenes
  /** Down the hatch into Nana's cabin, which floats in the open sky (the owner's wish: no black void). */
  enterHouse() {
    if (this.raid) { this.hud.toast(t('Not now: the Gloom is aboard!'), 'warn'); return; }
    this.bao.openHatch();
    this.cut(() => {
      this.mode = 'house';
      this.stopFishing();
      this.bao.root.visible = false;
      for (const [, v] of this.isles) v.group.visible = false;
      this.sky.hole = null;
      this.cabin.sync(this.state.notes);
      this.cabin.group.visible = true;
      const g = this.cabinGround();
      this.keeper.bounds = g; this.combat.ground = g;
      this.keeper.place(CABIN.ladder[0], CABIN.ladder[1] + 1);
      this.snapCamera();
      this.scene_('cabin');
    });
  }
  private cabinGround(): Ground { const c = this.cabin; return { height: () => 0, clamp: p => c.clamp(p), get blockers() { return c.blockers; } } as Ground; }
  leaveHouse() { this.cut(() => this.enterDeck(false, 'hatch')); }

  enterDeck(first = false, from: 'rope' | 'hatch' = 'rope') {
    this.cabin.group.visible = false;
    this.mode = 'deck';
    this.clearIsle();
    this.bao.root.position.set(0, 0, 0);
    this.bao.root.visible = true;
    const g = this.deckGround();
    (g as unknown as { blockers: Blocker[] }).blockers;
    Object.defineProperty(g, 'blockers', { get: () => this.deckBlockers() });
    this.keeper.bounds = g; this.combat.ground = g;
    const post = this.bao.at(DECK.ropepost), hatch = this.bao.at(DECK.hatch);
    if (first) this.keeper.place(0, 1.5);
    else if (from === 'hatch') { this.keeper.place(hatch.x + 1.2, hatch.z + .3); this.bao.openHatch(.9); }
    else this.keeper.place(post.x - 1.1, post.z + .4);
    this.keeper.fainted = false;
    if (this.state.hero.hp <= 0) this.state.hero.hp = maxHp(this.state);
    this.showIsleBelow();
    this.snapCamera();
    this.applyLook();
    this.syncDeck();
  }

  /** While Bao hovers over an isle, the isle floats below it. */
  private showIsleBelow() {
    for (const [, v] of this.isles) v.group.visible = false;
    this.sky.hole = null;
    if (this.state.voyage || this.state.place === 'dawnreach') { this.isle = null; return; }
    const v = this.isleView(this.state.place as IsleId);
    v.group.visible = true; v.group.position.copy(ISLE_BELOW); v.rope.visible = false; v.group.scale.setScalar(1); v.setFar(true);
    this.sky.hole = { x: ISLE_BELOW.x, z: ISLE_BELOW.z, r: v.radius + 4 };
    this.isle = v;
    this.gloomTarget = this.state.isles[v.isle].freed ? 0 : 1; GLOOM.value = this.gloomTarget;
  }

  private isleView(id: IsleId) {
    let v = this.isles.get(id);
    if (!v) { v = new IsleView(id); this.isles.set(id, v); this.scene.add(v.group); }
    return v;
  }

  private clearIsle() {
    this.combat.clear();
    for (const w of this.pod) this.scene.remove(w);
    this.pod = [];
    if (this.hive) { this.combat.group.remove(this.hive.view); this.hive = null; }
    for (const f of this.followers) this.scene.remove(f.actor.root);
    this.followers = [];
    if (this.campNpc) { this.scene.remove(this.campNpc.root); this.campNpc = null; }
  }

  /** Slide down the rope: build the isle's fight from the save (uncleared groups, standing Spires, closed cages). */
  descend() {
    const s = this.state, id = s.place as IsleId;
    if (s.voyage || s.place === 'dawnreach') { this.hud.toast(t('Only clouds below. Sail to an isle first.'), 'warn'); return; }
    if (!s.gear.rope) { this.hud.toast(t('You need a Climbing Rope (Workbench, 3 Fibre).'), 'warn'); return; }
    this.cut(() => {
      this.mode = 'isle';
      const v = this.isleView(id), map = ISLE_MAPS[id], prog = s.isles[id], tier = tierOf(id);
      for (const [, o] of this.isles) o.group.visible = false;
      v.group.visible = true; v.group.position.set(0, 0, 0); v.rope.visible = true; v.setFar(false); this.sky.hole = null;
      this.isle = v;
      this.clearIsle();
      const g = this.isleGround(v);
      this.keeper.bounds = g; this.combat.ground = g; this.combat.formsTier = tier; this.combat.plots = [];
      if (!prog.freed) {
        map.groups.forEach((grp, gi) => {
          if (prog.groups[gi]) return;
          grp.forms.forEach((f, i) => { const a = i / grp.forms.length * Math.PI * 2; this.combat.spawn(f, new T.Vector3(grp.at[0] + Math.cos(a) * 2, 0, grp.at[1] + Math.sin(a) * 2), tier, { group: gi }); });
        });
        map.spires.forEach((sp, i) => { if (!prog.spires[i]) this.combat.addSpire(i, new T.Vector3(sp[0], 0, sp[1]), tier); });
        this.hive = new HiveFight(id, new T.Vector3(map.hive[0], v.height(map.hive[0], map.hive[1]), map.hive[1]), this.combat, this.fx, this.keeper, {
          broken: at => this.onHive(at), song: () => this.heartSong(), sound: n => play(n), freeze: x => this.loop.freeze(x),
        }, hiveMaxHp(s, id));
        this.hive.setShield(hiveShielded(s, id));
      } else if (prog.leftover) {
        LEFTOVER_FORMS.forEach((f, i) => this.combat.spawn(f, new T.Vector3(map.groups[0].at[0] + i, 0, map.groups[0].at[1]), tier, { group: 99 }));
      }
      map.cages.forEach((c, i) => { if (!prog.cages[i]) { this.combat.addCage(i, new T.Vector3(c.at[0], 0, c.at[1])); this.caged(c.who, c.at); } });
      this.showCamp();
      if (id === 'star') this.sleepingPod(prog.freed);
      this.keeper.place(map.landing[0], map.landing[1] - 1.5);
      this.keeper.fainted = false;
      this.bao.root.position.set(map.landing[0] + 4, 30, map.landing[1] - 14);
      this.gloomTarget = prog.freed ? 0 : 1; GLOOM.value = this.gloomTarget;
      prog.visited = true;
      this.snapCamera(); this.applyLook();
      this.hud.toast(t(PLACES[id].name), 'good');
      this.scene_(`arrive_${id}`);
      setMusic(prog.freed ? 'calm' : id === 'star' ? 'night' : 'gloom');
    });
  }

  ascend() {
    this.cut(() => {
      // Followers who were still walking climb up anyway: nobody is lost (design §9).
      for (const f of this.followers) this.board(f.who);
      this.enterDeck();
      setMusic('calm');
    });
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
  private showCamp() {
    const id = this.state.place as IsleId, m = MARKETS[id], v = this.isle;
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

  private board(who: CrewId) {
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
        if (walkTo(f.actor, mk[0] + .2, mk[1] + 1.3, 3, dt)) { this.board(f.who); this.showCamp(); }
      } else {
        // Crew walk back to the rope on their own and climb up to Bao (nobody is escorted, logic check 3, 1.4).
        const rope = new T.Vector3(map.landing[0] + 1.2, 0, map.landing[1] - .6);
        const near = walkTo(f.actor, rope.x, rope.z, 4.2, dt, .3);
        if (near) {
          if (f.actor.action !== 'climb') { f.actor.play('climb', 9); }
          f.actor.root.position.y += dt * 3.2;
          if (f.actor.root.position.y > 6) { this.board(f.who); this.hud.toast(t('{who} climbed up to Bao!', { who: CREW[f.who].name }), 'good'); this.scene_(`board_${f.who}`); }
        } else f.actor.root.position.y = this.isle!.height(f.actor.root.position.x, f.actor.root.position.z);
      }
      f.actor.update(dt);
    }
    this.campNpc?.update(dt);
  }

  // -------------------------------------------------------------- combat
  private strike(origin: T.Vector3, facing: number, reach: number, damage: number, spin: boolean) {
    let hits = this.combat.strike(origin, facing, reach, damage, spin);
    if (this.hive) hits += this.hive.hit(origin, facing, reach, damage, spin) > 0 ? 1 : 0;
    if (this.mode === 'deck') {
      // Ring the crust off raided trees.
      this.state.plots.forEach((p, i) => {
        if (p.crust <= 0) return;
        const at = this.bao.at(DECK.plots[i]);
        if (flat(origin, at) > reach + .7) return;
        hits++;
        const clean = ringCrust(this.state, i);
        this.fx.ring(at, '#ffe28a', .4, 1.6, .3); play('chime');
        if (clean) { this.fx.burst(at.clone().setY(.8), '#c9b8ff', 14); this.hud.toast(t('The tree is clean again!'), 'good'); this.combat.plots[i] && (this.combat.plots[i].ok = !!p.tree); }
      });
    }
    return hits;
  }
  private target(p: T.Vector3, range: number) {
    const n = this.combat.nearest(p, range);
    if (n) return n.pos;
    if (this.hive && !this.hive.broken && !this.hive.shielded && flat(p, this.hive.pos) - this.hive.radius < range) return this.hive.pos;
    return null;
  }

  private aim(p: T.Vector3, range: number) {
    const t = this.target(p, range);
    if (t) return t;
    let best: T.Vector3 | null = null, bd = range + .8;
    for (const c of this.combat.cages) if (!c.open) { const d = flat(p, c.pos); if (d < bd) { bd = d; best = c.pos; } }
    if (this.mode === 'deck') this.state.plots.forEach((pl, i) => { if (pl.crust <= 0) return; const at = this.bao.at(DECK.plots[i]); const d = flat(p, at); if (d < bd) { bd = d; best = at; } });
    return best;
  }

  private onFreed(form: string, at: T.Vector3, group: number, raid: boolean, reward: boolean) {
    const s = this.state, tier = raid && this.raid ? this.raid.plan.tier : this.mode === 'isle' ? tierOf(s.place as IsleId) : 0;
    const r = formFreed(s, form as never, tier, reward);
    if (r.glimmer) this.fx.text(at, `+${r.glimmer}✦`, 'gain');
    if (r.levels) this.levelUp();
    if (this.mode === 'isle' && group >= 0 && group !== 99 && !this.combat.groupAlive(group)) {
      groupCleared(s, s.place as IsleId, group);
      this.hud.toast(t('Group freed!'), 'good');
    }
    if (group === 99 && !this.combat.groupAlive(99)) { s.isles[s.place as IsleId].leftover = false; this.hud.toast(t('The leftover Gloom is gone.'), 'good'); }
  }
  private onSpire(i: number, at: T.Vector3) {
    const s = this.state, id = s.place as IsleId;
    const r = spireBroken(s, id, i);
    if (r) { this.fx.text(at, `+${r.glimmer}✦`, 'gain'); if (r.levels) this.levelUp(); }
    play('shield');
    // Its woken Gloomlings fade with it.
    const left = s.isles[id].spires.filter(b => !b).length;
    this.hud.toast(left ? t('Spire broken! {n} left.', { n: left }) : t('Every Spire is down: the Hive’s dome falls!'), 'good');
    if (!left && this.hive) { this.hive.setShield(false); this.scene_('spires_down'); }
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
    this.hud.toast(r.joins ? t('{who} is free and follows you!', { who: CREW[r.who].name }) : t('{who} is free and opens a market at the landing!', { who: CREW[r.who].name }), 'good');
    this.scene_(`rescue_${r.who}`);
    this.save();
  }
  private onHive(at: T.Vector3) {
    const s = this.state, id = s.place as IsleId;
    const r = hiveBroken(s, id);
    if (!r) return;
    if (r.levels) this.levelUp();
    this.fx.text(at.clone().setY(3), `+${r.glimmer}✦`, 'gain');
    play('song');
    // The Note flies up to Bao, Bao sings, and colour pours back over the isle.
    const n = noteView(); n.position.copy(at).setY(at.y + 2); this.scene.add(n); this.note = { o: n, t: 0 };
    this.gloomTarget = 0;
    // The song shatters every shell still standing and opens every cage (logic check 3, 2.3 and 2.4).
    this.combat.freeAll();
    for (const who of r.opened) {
      const c = this.combat.cages[ISLE_MAPS[id].cages.findIndex(x => x.who === who)] ?? this.combat.cages.find(x => !x.open);
      if (c) { c.open = true; c.view.visible = false; this.fx.sparkle(c.pos.clone().setY(1.2), '#ffe28a', 12); }
      const f = this.followers.find(x => x.who === who); if (f) f.t = 0;
    }
    setMusic('calm');
    this.hud.toast(id === 'star' ? t('The Grey Heart shatters!') : t('{isle} is free!', { isle: PLACES[id].name }), 'good');
    this.save();
    if (id === 'star') setTimeout(() => this.ending(), 2600);
    else setTimeout(() => this.scene_(`freed_${id}`), 1600);
  }
  private heartSong() {
    heal(this.state, HEART.songHeal);
    this.fx.text(this.keeper.pos, `+${HEART.songHeal}`, 'heal');
    this.fx.sparkle(this.keeper.pos.clone().setY(1), '#ffe28a', 12);
    play('song'); this.hud.toast(t('Bao sings! The Heart’s shield cracks.'), 'good');
  }

  private onFaint() {
    const s = this.state;
    rulesFaint(s, null);
    play('faint');
    if (this.raid) { this.finishRaid(false); return; }
    if (this.mode !== 'isle') { setTimeout(() => { s.hero.hp = maxHp(s); this.keeper.fainted = false; }, 1500); return; }
    const atHive = this.hive && this.hive.awake && !this.hive.broken ? s.place as IsleId : null;
    if (atHive) s.isles[atHive].cracks = Math.min(3, s.isles[atHive].cracks + 1);
    setTimeout(() => {
      this.cut(() => {
        s.hero.hp = maxHp(s);
        for (const f of this.followers) if (s.isles[s.place as IsleId].cages[ISLE_MAPS[s.place as IsleId].cages.findIndex(c => c.who === f.who)]) this.board(f.who);
        this.enterDeck();
        this.scene_(atHive ? 'faint_hive' : 'faint', true);
      });
    }, 1100);
  }

  private levelUp() { play('level'); this.hud.toast(t('Level {n}! You feel stronger.', { n: this.state.hero.level }), 'good'); this.fx.ring(this.keeper.pos, '#ffe28a', .5, 3, .6); }

  // ---------------------------------------------------------------- raids
  private startRaid() {
    // The Gloom comes aboard: whoever is in the cabin climbs up to defend the trees.
    if (this.mode === 'house') { this.cabin.group.visible = false; this.enterDeck(false, 'hatch'); }
    const plan = raidPlan(this.state, !this.state.voyage?.scripted);
    if (!plan) { endRaid(this.state, true, 0); return; }
    this.gloomCloud.visible = true; this.gloomCloud.scale.setScalar(.2);
    const warn = hasCrew(this.state, 'ria') ? RAID.warnLookout : RAID.warn;
    this.raid = { plan, wave: -1, t: 0, warn, total: 0, postT: [], drops: [] };
    play('raid');
    this.hud.toast(hasCrew(this.state, 'ria') ? t('Ria: “Grey cloud off the side! Get ready!”') : t('A grey cloud! The Gloom is coming aboard!'), 'warn');
    this.panels.close();
    if (!this.state.story.flags.scene_raid_first) this.scene_('raid_first');
    this.combat.plots = this.state.plots.map((p, i) => ({ pos: this.bao.at(DECK.plots[i]), ok: !!p.tree && p.crust === 0 }));
  }
  private updateRaid(dt: number) {
    const r = this.raid; if (!r) return;
    r.t += dt;
    if (r.wave < 0) { if (r.t >= r.warn) { r.wave = 0; this.spawnWave(); } return; }
    r.total += dt;
    // Chime Posts ring Gloom forms near them.
    this.state.posts.forEach((spot, i) => {
      r.postT[i] = (r.postT[i] ?? 0) + dt;
      if (r.postT[i] < POST.every) return;
      const at = this.bao.at(DECK.posts[spot]);
      if (!this.combat.forms.some(f => !f.dead && flat(f.pos, at) < POST.radius)) return;
      r.postT[i] = 0;
      this.fx.ring(at, '#ffe28a', .4, POST.radius, .35, .6);
      this.combat.strike(at, 0, POST.radius, ringDamage(this.state) * POST.share * (hasCrew(this.state, 'tam') ? POST.tamBonus : 1), true, true);
    });
    for (const d of r.drops) { d.t -= dt; if (d.t <= 0) { const f = this.combat.spawn(d.kind, d.at, r.plan.tier, { scale: r.plan.scale, raid: true }); this.fx.burst(f.pos.clone().setY(.6), '#9a8cc8', 10, { speed: 3, up: 3 }); this.fx.shake(.12); } }
    r.drops = r.drops.filter(d => d.t > 0);
    if (this.combat.aliveCount() === 0 && !r.drops.length) {
      if (r.wave + 1 < r.plan.waves.length) { r.wave++; this.spawnWave(); }
      else this.finishRaid(true);
      return;
    }
    if (r.total >= RAID.timeout) this.finishRaid(false);
  }
  private spawnWave() {
    const r = this.raid!, wave = r.plan.waves[r.wave], [a, b] = this.bao.half(), rng = this.rng.stream('raid');
    // Drop spots are marked on the deck before the wave lands (logic check 3, 6.4).
    wave.forEach(kind => {
      const ang = rng.next() * Math.PI * 2, rad = .4 + rng.next() * .45;
      const at = new T.Vector3(Math.cos(ang) * a * rad, 0, Math.sin(ang) * b * rad);
      this.fx.telegraph('disc', at, { radius: .9, seconds: RAID.drop, color: '#b26bff' });
      r.drops.push({ at, kind, t: RAID.drop });
    });
    this.hud.toast(t('Wave {n} of {all}!', { n: r.wave + 1, all: r.plan.waves.length }), 'warn');
  }
  private finishRaid(won: boolean) {
    const r = this.raid; if (!r) return;
    endRaid(this.state, won, won ? r.plan.waves.length : 0);
    // Raiders that give up pop in the sunlight and float off as animals.
    this.combat.freeAll();
    this.gloomCloud.userData.leaving = true;
    this.raid = null;
    if (won) { play('arrive'); this.hud.toast(t('Raid beaten! +{g} glimmer', { g: r.plan.waves.length * RAID.winPerWave }), 'good'); this.scene_('raid_won'); }
    else { this.hud.toast(t('The Gloom left… some trees are crusted.'), 'warn'); this.scene_('raid_lost'); }
    if (this.keeper.fainted) { this.state.hero.hp = maxHp(this.state); this.keeper.fainted = false; }
    this.save();
  }

  // --------------------------------------------------------------- fishing
  private makeFishing() {
    const bobber = new T.Group();
    const ball = new T.Mesh(new T.SphereGeometry(.16, 12, 8), makeToon('#ff5c5c')); bobber.add(ball);
    const top = new T.Mesh(new T.SphereGeometry(.1, 10, 6), makeToon('#ffffff')); top.position.y = .12; bobber.add(top);
    bobber.visible = false;
    const line = new T.Line(new T.BufferGeometry().setFromPoints([new T.Vector3(), new T.Vector3()]), new T.LineBasicMaterial({ color: '#ffffff' }));
    line.visible = false; line.frustumCulled = false;
    this.scene.add(bobber, line);
    return { state: 'off' as 'off' | 'wait' | 'bite', t: 0, fish: null as FishId | null, window: 0, bobber, line };
  }
  private startFishing() {
    const f = this.fishing, spot = this.bao.at(DECK.fishspot);
    if (this.state.school.left <= 0) { this.hud.toast(t('The fish are hiding. Try again in a little while.'), 'info'); return; }
    f.state = 'wait'; f.t = biteWait(this.rng.stream('fish'));
    f.bobber.position.set(spot.x + .2, -1.6, spot.z + 3.4 * this.bao.scale);
    f.bobber.visible = f.line.visible = true;
    this.keeper.actor.lookAt(spot.x, spot.z + 6);
    this.keeper.actor.play('cast', .5);
    play('splash');
  }
  private stopFishing() { const f = this.fishing; f.state = 'off'; f.bobber.visible = f.line.visible = false; }
  private reel() {
    const f = this.fishing;
    if (f.state === 'bite' && f.fish) {
      landFish(this.state, f.fish);
      play('catch');
      this.fx.sparkle(f.bobber.position.clone().setY(0), '#8fdbff', 12);
      this.hud.toast(t('You caught a {fish}!', { fish: ITEMS[f.fish].name }), 'good');
      this.keeper.actor.play('cheer', .9);
      this.startFishing();
    } else if (f.state === 'wait') { this.hud.toast(t('Too early! Wait for the bobber to dip.'), 'info'); play('miss'); this.startFishing(); }
  }
  private updateFishing(dt: number) {
    const f = this.fishing;
    if (f.state === 'off') return;
    const spot = this.bao.at(DECK.fishspot);
    if (this.mode !== 'deck' || flat(this.keeper.pos, spot) > 2.4 || this.raid) { this.stopFishing(); return; }
    f.t -= dt;
    const bob = f.state === 'bite' ? -.25 + Math.sin(f.t * 40) * .06 : Math.sin(this.loop.gameTime * 2.4) * .06;
    f.bobber.position.y = -1.6 + bob;
    const hand = this.keeper.pos.clone().add(new T.Vector3(Math.sin(this.keeper.actor.facing) * .5, 1.5, Math.cos(this.keeper.actor.facing) * .5));
    (f.line.geometry as T.BufferGeometry).setFromPoints([hand, f.bobber.position]);
    if (f.state === 'wait' && f.t <= 0) {
      if (!takeBite(this.state)) { this.hud.toast(t('The fish are hiding. Try again in a little while.'), 'info'); this.stopFishing(); return; }
      f.fish = rollFish(this.rng.stream('fish'), this.state.place, this.state.gear.line);
      f.window = biteWindow(f.fish, this.state.gear.line);
      f.state = 'bite'; f.t = f.window;
      play('bite'); this.fx.burst(f.bobber.position.clone(), '#ffffff', 8, { speed: 2, up: 2, size: .08, life: .4 });
    } else if (f.state === 'bite' && f.t <= 0) {
      play('miss'); this.hud.toast(t('It got away. Cast again!'), 'info');
      this.startFishing();
    }
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
  private buildInteractables() {
    const s = this.state, list: Interactable[] = [];
    const add = (id: string, pos: T.Vector3, radius: number, label: string, icon: string, act: () => void) => list.push({ id, pos, radius, label, icon, act });
    if (this.mode === 'deck') {
      const at = (p: readonly [number, number]) => this.bao.at(p);
      s.plots.forEach((p, i) => {
        const pos = at(DECK.plots[i]);
        if (p.crust > 0) add(`plot${i}`, pos, 1.3, 'Ring the crust', '🔔', () => { this.keeper.actor.lookAt(pos.x, pos.z); this.keeper.ring(false); });
        else if (!p.tree) add(`plot${i}`, pos, 1.2, 'Plant', '🌱', () => this.openPanel('plot', i));
        else if (p.phase === 'ripe' && p.tree !== 'golden') add(`plot${i}`, pos, 1.2, 'Harvest', '🧺', () => this.doHarvest(i));
        else add(`plot${i}`, pos, 1.1, 'Look', '👀', () => this.openPanel('plot', i));
      });
      for (let i = 0; i < s.whale.specks; i++) { const sp = this.bao.specks[i]; add(`speck${i}`, sp.position.clone(), 1.2, 'Brush', '🧹', () => this.doBrush(i)); }
      add('feed', at(DECK.feed), 1.6, 'Feed Bao', '🍓', () => this.doFeedAll());
      add('map', at(DECK.maptable), 1.6, 'Sky map', '🗺️', () => this.openPanel('map'));
      add('workbench', at(DECK.workbench), 1.6, 'Workbench', '🔨', () => this.openPanel('workbench'));
      if (hasCrew(s, 'mina')) add('kitchen', at(DECK.kitchen), 1.6, 'Kitchen', '🍳', () => this.openPanel('kitchen'));
      add('pantry', at(DECK.pantry), 1.4, 'Bag', '🎒', () => this.openPanel('bag'));
      add('hatch', at(DECK.hatch), 1.6, 'Go inside', '🚪', () => this.enterHouse());
      add('rope', at(DECK.ropepost), 1.5, s.place === 'dawnreach' || s.voyage ? 'Rope' : 'Go down', '🪢', () => this.descend());
      add('fish', at(DECK.fishspot), 1.7, 'Fish', '🎣', () => this.startFishing());
      for (const [id, a] of this.bao.crew) if (s.crew.includes(id) && a.root.visible) add(`crew-${id}`, a.root.position, 1.4, 'Talk', '💬', () => this.talk(id));
      for (const d of this.dews) if (d.alive) add('dew', d.o.position, 0, 'Catch', '✨', () => this.catchDew(d));
    } else if (this.mode === 'house') {
      const at = (p: readonly [number, number], y = 0) => new T.Vector3(p[0], y, p[1]);
      add('ladder', at(CABIN.ladder), 1.5, 'Climb up', '🪜', () => this.leaveHouse());
      add('bed', at(CABIN.bed), 1.7, 'Rest', '🛏️', () => this.doRest());
      add('shelf', at(CABIN.shelf), 1.6, 'The Notes', '🎵', () => this.openPanel('bao'));
      add('stove', at(CABIN.stove), 1.5, hasCrew(s, 'mina') ? 'Kitchen' : 'Stove', '🍳', () => hasCrew(s, 'mina') ? this.openPanel('kitchen') : this.hud.toast(t('A cook would love this stove.'), 'info'));
      add('chest', at(CABIN.chest), 1.5, 'Bag', '🎒', () => this.openPanel('bag'));
    } else if (this.mode === 'isle' && this.isle) {
      const id = s.place as IsleId, map = ISLE_MAPS[id], v = this.isle;
      const rope = new T.Vector3(map.landing[0] + 1.2, v.height(map.landing[0], map.landing[1]), map.landing[1] - .6);
      add('rope', rope, 1.6, 'Climb up', '🪢', () => this.ascend());
      for (const c of this.combat.cages) if (!c.open) add(`cage${c.index}`, c.pos, 1.9, 'Ring the cage', '🔔', () => { this.keeper.actor.lookAt(c.pos.x, c.pos.z); this.keeper.ring(false); });
      map.ore.forEach((o, i) => { if (oreReady(s, id, i)) add(`ore${i}`, v.ore[i].position, 1.8, 'Mine ore', '⛏️', () => this.doMine(i)); });
      map.wild.forEach((w, i) => { if (wildReady(s, id, i)) add(`wild${i}`, v.wild[i].position, 1.6, 'Pick', '🧺', () => this.doWild(i)); });
      if (map.market && v.market?.visible) add('market', v.market.position, 2.2, 'Trade', '🛍️', () => this.openPanel('market', id));
    }
    this.interactables = list;
    // The context button shows the nearest thing in reach.
    let best: Interactable | null = null, bd = Infinity;
    for (const it of list) { if (!it.radius) continue; const d = flat(this.keeper.pos, it.pos); if (d < it.radius && d < bd) { bd = d; best = it; } }
    this.nearby = best;
  }
  /** Use the nearest thing, measured now (not at the last frame), so a press right after a move hits what is in reach. */
  private useNearby() { if (this.mode === 'deck' || this.mode === 'isle' || this.mode === 'house') this.buildInteractables(); const n = this.nearby; if (n && !this.paused) n.act(); }

  // ----------------------------------------------------------------- pointer
  private bindPointer() {
    let down: { x: number; y: number; id: number; t: number } | null = null;
    this.canvas.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY, id: e.pointerId, t: performance.now() }; });
    this.canvas.addEventListener('pointerup', e => {
      if (!down || down.id !== e.pointerId) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      down = null;
      if (moved > 12 || this.paused || this.mode === 'cut') return;
      this.tap(e.clientX, e.clientY);
    });
    this.canvas.addEventListener('wheel', e => { e.preventDefault(); this.zoom = Math.min(1.35, Math.max(.75, this.zoom * (1 + Math.sign(e.deltaY) * .08))); }, { passive: false });
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
      consider(it.pos, it.id === 'dew' ? 0 : .6, () => {
        if (it.id === 'dew') { it.act(); return; }
        if (flat(this.keeper.pos, it.pos) <= it.radius) it.act();
        else this.keeper.walkTo(it.pos.x, it.pos.z, () => it.act(), Math.max(.6, it.radius - .5));
      });
    }
    for (const f of this.combat.forms) if (!f.dead) consider(f.pos, .6, () => this.keeper.walkTo(f.pos.x, f.pos.z, null, 1.6));
    if (best) { (best as { act: () => void }).act(); return; }
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
    this.scene_('harvested');
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
  private fedFx(pieces: number, xp: number) {
    const at = this.bao.feedSpot().setY(.6);
    this.fx.burst(at, '#ff7fa8', Math.min(24, 4 + pieces * 2), { speed: 3, up: 4, size: .14 });
    this.fx.text(at, `+${xp} ${t('growth')}`, 'gain');
    this.bao.happy(); play('feed'); setTimeout(() => play('hum'), 300);
    if (this.state.whale.stage < 3 && !this.state.story.flags.scene_can_grow && this.canGrowNow()) this.scene_('can_grow');
  }
  private canGrowNow() { const s = this.state; const st = s.whale.stage; return st < 3 && s.whale.xp >= [450, 1000, 1900][st] && s.notes.length > st; }
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
    const r = mineOre(this.state, this.state.place as IsleId, i);
    if (!r.ok) return;
    const o = this.isle!.ore[i];
    this.keeper.actor.lookAt(o.position.x, o.position.z); this.keeper.actor.play('swing', .24);
    this.fx.burst(o.position.clone().setY(.8), '#ffb03a', 12); this.fx.text(o.position, `+${r.n} ${t('Ore')}`, 'gain'); play('chime');
  }
  private doWild(i: number) {
    const r = pickWild(this.state, this.state.place as IsleId, i);
    if (!r.ok) return;
    const o = this.isle!.wild[i];
    this.fx.sparkle(o.position.clone().setY(1), '#ffe28a', 8); this.fx.text(o.position, `+${r.n} ${t(ITEMS[r.item].name)}`, 'gain'); play('harvest');
  }
  /** A nap in Nana's bed: full health, a saved game, and Bao's lullaby. */
  private doRest() {
    const s = this.state;
    const veil = this.uiRoot.querySelector('#veil') as HTMLElement;
    veil.classList.add('on');
    play('hum');
    setTimeout(() => {
      s.hero.hp = maxHp(s);
      this.save();
      veil.classList.remove('on');
      this.hud.toast(t('You napped while Bao hummed a lullaby. Fully rested!'), 'good');
    }, 650);
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

  openPanel(kind: PanelKind | 'bao' | 'map' | 'bag' | 'journal' | 'settings', arg: unknown = null) {
    this.keys.blocked = true;
    this.hud.releaseStick();
    this.panels.show(kind as PanelKind, arg);
  }

  // ----------------------------------------------------------------- loop
  start() { this.renderer.setAnimationLoop(() => { const now = performance.now(); const dt = (now - (this.lastFrame || now)) / 1000; this.lastFrame = now; this.loop.advance(dt); }); }
  private lastFrame = 0;

  /** Test hook: run `seconds` of game steps without rendering each one (fights, voyages, raids). */
  simulate(seconds: number) { for (let i = 0; i < seconds * 60; i++) this.step(1 / 60); }

  private step(dt: number) {
    const s = this.state, now = Date.now();
    this.paused = this.panels.open || this.hud.talking || this.mode === 'cut' || this.frozen;
    this.keys.now = this.loop.gameTime;
    if (this.paused) { catchUp(s, now); this.keys.endStep(); return; }
    // Input → intents.
    const kx = (this.keys.isDown('right') ? 1 : 0) - (this.keys.isDown('left') ? 1 : 0), kz = (this.keys.isDown('down') ? 1 : 0) - (this.keys.isDown('up') ? 1 : 0);
    const stick = kx || kz ? { x: kx, z: kz } : this.hud.stick;
    if (this.keys.pressed('ring')) this.keeper.ring(false);
    if (this.keys.pressed('spin')) this.keeper.ring(true);
    if (this.keys.pressed('hop')) this.keeper.hop(stick.x, stick.z);
    if (this.keys.pressed('interact')) { if (this.fishing.state !== 'off') this.reel(); else this.useNearby(); }
    if (this.keys.pressed('eat')) this.quickEat();
    this.keys.endStep();
    const combatOn = this.mode === 'isle' || !!this.raid;
    this.keeper.autoAttack = combatOn;
    // The isle's colour returns over about 3 s of game time after the song.
    GLOOM.value = damp(GLOOM.value, this.gloomTarget, 1.4, dt);
    if (Math.abs(GLOOM.value - this.gloomTarget) < .002) GLOOM.value = this.gloomTarget;
    this.keeper.update(dt, stick);
    this.fx.stepGame(dt);
    this.combat.update(dt);
    if (combatOn) this.hive?.update(dt);
    this.updateRaid(dt);
    this.updateFollowers(dt);
    if (this.mode === 'deck') { this.updateCrew(dt); this.updateFishing(dt); this.updateDew(dt); }
    const ev = tickRules(s, dt, this.mode === 'deck' || this.mode === 'house', now, !this.raid);
    if (ev.ripened.length && this.mode === 'deck') { play('harvest', .2); }
    if (ev.picked) this.hud.toast(t('Pip picked {list}', { list: Object.entries(ev.picked).map(([k, n]) => `${n} ${t(ITEMS[k as ItemId].name)}`).join(', ') }), 'info');
    if (ev.speck) { this.scene_('speck'); this.syncDeck(); }
    if (ev.gifts.length) { this.scene_('nana_gift', true); }
    if (ev.leftover) this.hud.toast(t('Leftover Gloom crept back onto {place}.', { place: PLACES[ev.leftover as IsleId].name }), 'warn');
    if (ev.voyage === 'raid') this.startRaid();
    if (ev.voyage === 'dew') this.spawnDew(false);
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
    this.showIsleBelow();
    this.dews.forEach(d => { d.alive = false; d.o.visible = false; });
    this.hud.toast(t('Bao is over {place}.', { place: PLACES[s.place].name }), 'good');
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
    if (this.mode === 'isle') { this.isle?.update(realDt); this.bao.root.position.y = 30 + Math.sin(this.loop.realTime * .4) * .4; }
    if (this.note) {
      this.note.t += realDt;
      const n = this.note.o; n.position.y += realDt * 6; n.rotation.y += realDt * 3;
      this.fx.sparkle(n.position, '#ffe28a', 1, .6);
      if (this.note.t > 2.2) { this.scene.remove(n); this.note = null; }
    }
    // The raiding cloud swells beside Bao, then drifts off and fades when the raid ends.
    const gc = this.gloomCloud;
    if (gc.visible) {
      const [a] = this.bao.half();
      gc.position.set(a + 6, 2 + Math.sin(this.loop.realTime) * .4, -2);
      gc.rotation.y += realDt * .2;
      const target = gc.userData.leaving ? 0 : 1;
      const k = damp(gc.scale.x, target, 2.2, realDt); gc.scale.setScalar(k);
      if (gc.userData.leaving && k < .05) { gc.visible = false; gc.userData.leaving = false; }
    }
    for (const p of this.pod) if (p.userData.rising) { p.position.y = Math.min(p.userData.toY, p.position.y + realDt * 1.8); p.rotation.y += realDt * .04; }
    if (this.mode === 'deck' || this.mode === 'isle' || this.mode === 'house') this.buildInteractables();
    if (this.mode === 'house') this.cabin.update(realDt);
    // Camera: follow the Keeper.
    const aspect = this.canvas.clientWidth / Math.max(1, this.canvas.clientHeight);
    const dist = (this.mode === 'isle' ? CAMERA.isle : this.mode === 'house' ? CAMERA.house : CAMERA.deck) * this.zoom * (aspect < .8 ? CAMERA.portrait : 1);
    const k = this.keeper.pos;
    this.focus.x = damp(this.focus.x, k.x, 7, realDt); this.focus.z = damp(this.focus.z, k.z, 7, realDt); this.focus.y = damp(this.focus.y, k.y, 4, realDt);
    const cin = this.cinematic;
    if (cin) {
      const a = this.loop.realTime * cin.spin, pr = cin.pitch * Math.PI / 180;
      this.camera.position.set(Math.sin(a) * Math.cos(pr) * cin.dist, Math.sin(pr) * cin.dist - 2, Math.cos(a) * Math.cos(pr) * cin.dist);
      this.camera.lookAt(0, -3, 0);
    } else {
      const pr = CAMERA.pitch * Math.PI / 180;
      this.camera.position.set(this.focus.x, this.focus.y + Math.sin(pr) * dist + .6, this.focus.z + Math.cos(pr) * dist);
      this.camera.lookAt(this.focus.x, this.focus.y + .6, this.focus.z);
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
    this.lighting.apply(look); this.sky.apply(look);
    this.renderer.setClearColor(look.fog);
  }
  private lastLook: Look | null = null;
  frozenLook: Look | null = null;
  /** A far, slow camera for the prologue and the ending. */
  cinematic: { dist: number; pitch: number; spin: number } | null = null;

  private updateHud() {
    const s = this.state, g = goal(s, this.mode === 'isle' ? 'isle' : 'deck');
    const hive = this.mode === 'isle' && this.hive && !this.hive.broken && (this.hive.awake || flat(this.keeper.pos, this.hive.pos) < 18) ? this.hive : null;
    const view: HudView = {
      mode: this.mode === 'isle' ? 'isle' : 'deck', combat: this.mode === 'isle' || !!this.raid,
      context: this.nearby ? this.nearby.label : null, contextIcon: this.nearby?.icon ?? '✋',
      fishing: this.fishing.state, cooldowns: { spin: this.keeper.spinCd / KEEPER.spin.cooldown, hop: this.keeper.hopCd / KEEPER.hop.cooldown },
      eat: quickEatItem(s), place: PLACES[s.place].name,
      raid: this.raid ? (this.raid.wave < 0 ? t('Gloom raid in {n}…', { n: Math.ceil(this.raid.warn - this.raid.t) }) : t('Raid: free every Gloom form! {n}s', { n: Math.max(0, Math.ceil(RAID.timeout - this.raid.total)) })) : null,
    };
    if (hive) { view.boss = hive.hp / hive.max; view.bossName = hive.id === 'greyheart' ? 'Grey Heart' : hive.id[0].toUpperCase() + hive.id.slice(1); view.bossShield = hive.shielded; }
    this.hud.update(s, g, view);
    this.panels.refresh();
  }

  syncDeck() {
    this.bao.sync(this.state, !!this.raid);
    // The golden-bell keepsake: the Keeper's mallet shines gold.
    const gold = this.state.keepsakes.includes('goldbell');
    if (this.keeper.actor.mallet && this.keeper.actor.mallet.userData.gold !== gold) {
      this.keeper.actor.mallet.userData.gold = gold;
      this.keeper.actor.mallet.traverse(o => { const m = o as T.Mesh; if (!m.isMesh) return; m.userData.plain ??= m.material; m.material = gold ? GOLD : m.userData.plain; });
    } if (this.mode === 'deck' && !this.crewPlaced) { this.placeCrew(); this.crewPlaced = true; } }
  private crewPlaced = false;
  cabin = new CabinView();
  /** The grey raiding cloud that drifts beside Bao while the Gloom comes aboard. */
  private gloomCloud = makeGloomCloud();

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

  save() { saveGame(this.state); }

  // ----------------------------------------------------------------- ending
  /**
   * The pod asleep in the Grey Star's crystal: Grand Hana behind the Heart and two more whales half-buried at the
   * sides. They wear the shared Gloom tint, so when the Heart breaks the colour pours back into them too.
   */
  private sleepingPod(freed: boolean) {
    for (const w of this.pod) this.scene.remove(w);
    this.pod = [];
    const spots: [number, number, number, number, number][] = [[0, -4.5, -36, 0, 2.1], [-27, -3.5, -12, 1.25, 1.35], [27, -3.5, -15, -1.3, 1.35]];
    for (const [x, y, z, rot, scale] of spots) {
      const w = whole('whale', { gloom: true }) ?? new T.Group();
      w.position.set(x, freed ? 8 + scale * 3 : y, z); w.rotation.y = rot; w.scale.setScalar(scale);
      w.userData.toY = 8 + scale * 3;
      this.scene.add(w); this.pod.push(w);
    }
  }

  private ending() {
    const s = this.state;
    // The pod wakes: the crust's colour is already fading (the shared Gloom tint), and the whales rise.
    for (const w of this.pod) w.userData.rising = true;
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
      onDeck: () => g.mode === 'deck' || g.mode === 'house',
      plant: (i, tree: TreeId) => { const r = plant(g.state, i, tree); if (!r.ok) g.hud.toast(t(r.why), 'warn'); else { play('harvest'); g.fx.sparkle(g.bao.at(DECK.plots[i]).setY(.5), '#9be36a', 10); g.syncDeck(); } },
      uproot: i => { uproot(g.state, i); g.syncDeck(); },
      harvest: i => g.doHarvest(i),
      feed: item => { const r = feed(g.state, item); if (!r.ok) g.hud.toast(t(r.why), 'warn'); else { g.fedFx(1, r.xp); g.scene_('fed'); } },
      feedAll: () => g.doFeedAll(),
      pet: () => { const r = pet(g.state); if (r.ok) { g.bao.happy(); play('hum'); g.hud.toast(t('Bao hums happily.'), 'good'); } },
      grow: () => g.doGrow(),
      sail: to => g.sail(to),
      craft: (id: RecipeId) => { const r = craft(g.state, id); if (!r.ok) g.hud.toast(t(r.why), 'warn'); else { play('chime'); g.hud.toast(t('Made: {thing}', { thing: id === 'post' ? 'Chime Post' : id === 'rope' ? 'Climbing Rope' : id === 'line' ? 'Good Line' : id.startsWith('mallet') ? `Mallet ${'I'.repeat(Number(id.slice(-1))).replace('IIII', 'IV')}` : `Coat ${'I'.repeat(Number(id.slice(-1))).replace('IIII', 'IV')}` }), 'good'); g.syncDeck(); if (maxHp(g.state) > g.state.hero.hp) g.state.hero.hp = Math.min(maxHp(g.state), g.state.hero.hp + 40); g.save(); } },
      cook: (id: MealId) => { const r = cook(g.state, id); if (!r.ok) g.hud.toast(t(r.why), 'warn'); else { play('harvest'); g.hud.toast(t('Mina cooked a {meal}!', { meal: ITEMS[id].name }), 'good'); } },
      sell: (isle, item, n) => { const r = sell(g.state, isle, item, n); if (r.ok) play('coin'); else g.hud.toast(t(r.why), 'warn'); },
      buy: (isle, item) => { const r = buy(g.state, isle, item); if (r.ok) play('coin'); else g.hud.toast(t(r.why), 'warn'); },
      eat: item => { const r = eat(g.state, item); if (r.ok) { g.fx.text(g.keeper.pos, `+${r.heal}`, 'heal'); play('feed'); } else g.hud.toast(t(r.why), 'warn'); },
      exportSave: () => exportCode(g.state),
      importSave: code => { const s = importCode(code); if (!s) return false; saveGame(s); location.reload(); return true; },
      reset: () => { try { localStorage.removeItem(saves.key); } catch { /* ignore */ } saveGame(newGame(`cb-${Date.now() % 1e9}`)); location.reload(); },
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
    return { mode: this.mode, place: s.place, voyage: s.voyage ? { to: s.voyage.to, k: s.voyage.elapsed / s.voyage.duration, raid: s.voyage.raidState } : null, stage: s.whale.stage, hunger: s.whale.hunger, mood: s.whale.mood, whaleXp: s.whale.xp, level: s.hero.level, hp: s.hero.hp, glimmer: s.glimmer, notes: s.notes, crew: s.crew, rescued: s.rescued, forms: this.combat.aliveCount(), hive: this.hive ? { hp: this.hive.hp, shielded: this.hive.shielded, broken: this.hive.broken } : null, nearby: this.nearby?.id ?? null, fishing: this.fishing.state, raid: !!this.raid, goal: goal(s, this.mode === 'isle' ? 'isle' : 'deck').text, items: s.items, gloom: GLOOM.value, keeper: { x: this.keeper.pos.x, z: this.keeper.pos.z } };
  }
}

const GOLD = makeToon('#ffc83a', { emissive: '#5a3a00' });
function makeGloomCloud() {
  const g = new T.Group(), dark = makeToon('#5e5878'), light = makeToon('#8c86a8');
  const lumps: [number, number, number, number][] = [[0, 0, 0, 2.6], [2.2, -.3, .6, 1.9], [-2.1, -.2, -.4, 2], [.6, .9, -.8, 1.7], [-.8, -.6, 1.4, 1.6]];
  lumps.forEach(([x, y, z, r], i) => { const m = new T.Mesh(new T.IcosahedronGeometry(r, 2), i % 2 ? light : dark); m.position.set(x, y, z); g.add(m); });
  const eye = new T.Mesh(new T.SphereGeometry(.55, 14, 10), makeToon('#b26bff', { emissive: '#8a3dff' })); eye.position.set(-1.2, .5, 2.2); g.add(eye);
  g.visible = false;
  return g;
}

export { NIGHT, addXp };
