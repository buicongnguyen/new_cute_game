import * as T from 'three';
import { eventsFor, type EventBus } from './core/events.ts';
import { damp } from './core/feel.ts';
import { ActionMap } from './core/input.ts';
import { GameLoop } from './core/loop.ts';
import { RngStreams } from './core/rng.ts';
import { Governor } from './graphics.ts';
import { t } from './i18n.ts';
import {
  ITEMS,
  PLACES,
  isShip,
  type CrewId, type FishId,
  type IsleId, type ItemId
} from './rules/content.ts';
import { crustStored } from './rules/garden.ts';
import { addXp } from './rules/keeper.ts';
import { ReelSim } from './rules/reel.ts';
import { type GameState } from './rules/state.ts';
import { goal, type RaidPlan, type Where } from './rules/story.ts';
import { catchUp, tickRules } from './rules/tick.ts';
import { saveGame } from './save-game.ts';
import { play } from './sfx.ts';
import { CameraSystem } from './systems/camera.ts';
import { CutSystem } from './systems/cut.ts';
import { DeckSystem } from './systems/deck.ts';
import { DroneSystem } from './systems/drone.ts';
import { HouseSystem } from './systems/house.ts';
import { InteractSystem } from './systems/interact.ts';
import { IsleSystem } from './systems/isle.ts';
import { RaidSystem } from './systems/raid.ts';
import { CAMERA, Family, Follower, Helper, Interactable, Mode, PlaceView, Shell, Ship } from './systems/shared.ts';
import { ShipSystem } from './systems/ship.ts';
import { SkiffSystem } from './systems/skiff.ts';
import { StorySystem } from './systems/story.ts';
import type { System } from './systems/system.ts';
import { Hud } from './ui/hud.ts';
import { Panels } from './ui/panels.ts';
import { Actor } from './world/actors.ts';
import { part } from './world/assets.ts';
import { Bao } from './world/bao.ts';
import { Combat } from './world/combat.ts';
import { CottageView } from './world/cottage.ts';
import { Fx } from './world/fx.ts';
import { HiveFight } from './world/hive.ts';
import { type Blocker } from './world/isle-view.ts';
import { Keeper } from './world/keeper.ts';
import { GLOOM, Lighting, NIGHT, makeToon, type Look } from './world/look.ts';
import { Sky } from './world/sky.ts';

/** Owns shared state, the frame loop and mode transitions. Systems own behavior. */
export class Game {
  readonly systems = {
    deck: new DeckSystem(this),
    isle: new IsleSystem(this),
    ship: new ShipSystem(this),
    raid: new RaidSystem(this),
    skiff: new SkiffSystem(this),
    drone: new DroneSystem(this),
    cut: new CutSystem(this),
    camera: new CameraSystem(this),
    house: new HouseSystem(this),
    story: new StorySystem(this),
    interact: new InteractSystem(this),
  };
  activeSystem: System | null = null;
  setMode(mode: Mode) {
    this.mode = mode;
    const next = mode === 'isle' ? (isShip(this.state.place) ? this.systems.ship : this.systems.isle)
      : mode === 'ride' ? this.systems.skiff : this.systems[mode];
    if (this.activeSystem !== next) { this.activeSystem?.exit(); this.activeSystem = next; next.enter(); }
  }

  renderer: T.WebGLRenderer;

  scene = new T.Scene();

  camera = new T.PerspectiveCamera(CAMERA.fov, 1, .5, 900);

  lighting: Lighting;
  sky: Sky;
  fx: Fx;
  bao: Bao;

  loop: GameLoop;

  keys = new ActionMap({ up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'], ring: ['Space'], spin: ['KeyQ'], hop: ['KeyE', 'ShiftLeft', 'ShiftRight'], interact: ['KeyF', 'Enter'], eat: ['KeyR'], conch: ['KeyC'] });

  state: GameState;

  events: EventBus;

  rng: RngStreams;

  hud: Hud;
  panels: Panels;

  keeper: Keeper;

  combat: Combat;

  hive: HiveFight | null = null;

  isles = new Map<IsleId, PlaceView>();

  isle: PlaceView | null = null;

  mode: Mode = 'deck';

  followers: Follower[] = [];

  helpers: Helper[] = [];

  families: Family[] = [];

  shells: Shell[] = [];

  campNpc: Actor | null = null;

  fishing: { state: 'off' | 'wait' | 'bite'; sim: ReelSim | null; pause: number; bobber: T.Object3D; line: T.Line; at: T.Vector3 };

  dews: { o: T.Object3D; treasure: boolean; alive: boolean }[] = [];

  raid: { plan: RaidPlan; wave: number; t: number; warn: number; total: number; postT: number[]; ships: Ship[]; queue: { kind: RaidPlan['waves'][number][number]; ship: number; t: number }[]; gongCd: number[] } | null = null;

  interactables: Interactable[] = [];

  nearby: Interactable | null = null;

  focus = new T.Vector3();

  zoom = 1;

  paused = false;

  saveT = 0;

  hudT = 0;

  gloomTarget = 1;

  note: { o: T.Object3D; t: number } | null = null;

  pod: T.Object3D[] = [];

  chatter = new Map<CrewId, number>();

  crewWander = new Map<CrewId, { at: T.Vector3; t: number }>();

  /** The fishing trip: the skiff on the cloud sea below Bao, and the lift ride down or up. */
  skiff = new T.Group();

  ride: { t: number; dur: number; up: boolean } | null = null;

  cannonT = 0;

  /** The Grey Star's list: seconds into this side, and which rail is low. */
  listT = 0;
  listSide = 1;

  /** A nap in the bed makes the next bath count (Fresh). */
  napped = false;

  governor: Governor;

  settings = { shake: true };

  onEnding: (() => void) | null = null;

  frozen = false;

  constructor(public canvas: HTMLCanvasElement, public uiRoot: HTMLElement, state: GameState) {
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
    for (let i = 0;i < 3;i++) { const o = part('props', 'skydew') ?? (() => { const m = new T.Mesh(new T.IcosahedronGeometry(.7, 1), makeToon('#ffffff', { emissive: '#3a4a7a' })); const g = new T.Group(); g.add(m); return g; })(); o.visible = false; this.scene.add(o); this.dews.push({ o, treasure: false, alive: false }); }

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

  lightingProxy() { return { setShadowSize: (n: number) => { if (!this.lighting) return; this.lighting.sun.shadow.mapSize.set(n, n); this.lighting.sun.shadow.map?.dispose(); this.lighting.sun.shadow.map = null; } }; }
  deckGround(...args: Parameters<DeckSystem['deckGround']>): ReturnType<DeckSystem['deckGround']> { return this.systems.deck.deckGround(...args); }

  /** Obstacle lists are rebuilt at most every 0.2 s of game time (code review 15: they were rebuilt per form per step). */
  blockMemo = new Map<string, { at: number; list: Blocker[] }>();

  memoBlockers(key: string, build: () => Blocker[]) {
    const hit = this.blockMemo.get(key), now = this.loop?.gameTime ?? 0;
    if (hit && now - hit.at < .2 && now >= hit.at) return hit.list;
    const list = build(); this.blockMemo.set(key, { at: now, list }); return list;
  }
  deckBlockers(...args: Parameters<DeckSystem['deckBlockers']>): ReturnType<DeckSystem['deckBlockers']> { return this.systems.deck.deckBlockers(...args); }
  isleGround(...args: Parameters<IsleSystem['isleGround']>): ReturnType<IsleSystem['isleGround']> { return this.systems.isle.isleGround(...args); }
  enterHouse(...args: Parameters<HouseSystem['enterHouse']>): ReturnType<HouseSystem['enterHouse']> { return this.systems.house.enterHouse(...args); }
  syncCabin(...args: Parameters<HouseSystem['syncCabin']>): ReturnType<HouseSystem['syncCabin']> { return this.systems.house.syncCabin(...args); }
  cabinGround(...args: Parameters<HouseSystem['cabinGround']>): ReturnType<HouseSystem['cabinGround']> { return this.systems.house.cabinGround(...args); }
  leaveHouse(...args: Parameters<HouseSystem['leaveHouse']>): ReturnType<HouseSystem['leaveHouse']> { return this.systems.house.leaveHouse(...args); }
  enterDeck(...args: Parameters<DeckSystem['enterDeck']>): ReturnType<DeckSystem['enterDeck']> { return this.systems.deck.enterDeck(...args); }
  showIsleBelow(...args: Parameters<IsleSystem['showIsleBelow']>): ReturnType<IsleSystem['showIsleBelow']> { return this.systems.isle.showIsleBelow(...args); }
  isleView(...args: Parameters<IsleSystem['isleView']>): ReturnType<IsleSystem['isleView']> { return this.systems.isle.isleView(...args); }
  clearIsle(...args: Parameters<IsleSystem['clearIsle']>): ReturnType<IsleSystem['clearIsle']> { return this.systems.isle.clearIsle(...args); }
  descend(...args: Parameters<IsleSystem['descend']>): ReturnType<IsleSystem['descend']> { return this.systems.isle.descend(...args); }
  makeHive(...args: Parameters<IsleSystem['makeHive']>): ReturnType<IsleSystem['makeHive']> { return this.systems.isle.makeHive(...args); }
  board(...args: Parameters<ShipSystem['board']>): ReturnType<ShipSystem['board']> { return this.systems.ship.board(...args); }
  boardNow(...args: Parameters<ShipSystem['boardNow']>): ReturnType<ShipSystem['boardNow']> { return this.systems.ship.boardNow(...args); }
  ascend(...args: Parameters<IsleSystem['ascend']>): ReturnType<IsleSystem['ascend']> { return this.systems.isle.ascend(...args); }
  blowConch(...args: Parameters<IsleSystem['blowConch']>): ReturnType<IsleSystem['blowConch']> { return this.systems.isle.blowConch(...args); }
  cut(...args: Parameters<CutSystem['cut']>): ReturnType<CutSystem['cut']> { return this.systems.cut.cut(...args); }
  buildSkiff(...args: Parameters<SkiffSystem['buildSkiff']>): ReturnType<SkiffSystem['buildSkiff']> { return this.systems.skiff.buildSkiff(...args); }

  swimmers: { o: T.Object3D; id: FishId; a: number; r: number; speed: number; y: number }[] = [];
  skiffAt(...args: Parameters<SkiffSystem['skiffAt']>): ReturnType<SkiffSystem['skiffAt']> { return this.systems.skiff.skiffAt(...args); }
  skiffGround(...args: Parameters<SkiffSystem['skiffGround']>): ReturnType<SkiffSystem['skiffGround']> { return this.systems.skiff.skiffGround(...args); }
  goFishing(...args: Parameters<SkiffSystem['goFishing']>): ReturnType<SkiffSystem['goFishing']> { return this.systems.skiff.goFishing(...args); }
  pullRope(...args: Parameters<SkiffSystem['pullRope']>): ReturnType<SkiffSystem['pullRope']> { return this.systems.skiff.pullRope(...args); }
  updateRide(...args: Parameters<SkiffSystem['updateRide']>): ReturnType<SkiffSystem['updateRide']> { return this.systems.skiff.updateRide(...args); }
  makeCrew(...args: Parameters<DeckSystem['makeCrew']>): ReturnType<DeckSystem['makeCrew']> { return this.systems.deck.makeCrew(...args); }
  placeCrew(...args: Parameters<DeckSystem['placeCrew']>): ReturnType<DeckSystem['placeCrew']> { return this.systems.deck.placeCrew(...args); }
  updateCrew(...args: Parameters<DeckSystem['updateCrew']>): ReturnType<DeckSystem['updateCrew']> { return this.systems.deck.updateCrew(...args); }
  caged(...args: Parameters<IsleSystem['caged']>): ReturnType<IsleSystem['caged']> { return this.systems.isle.caged(...args); }
  familyIn(...args: Parameters<ShipSystem['familyIn']>): ReturnType<ShipSystem['familyIn']> { return this.systems.ship.familyIn(...args); }
  showCamp(...args: Parameters<IsleSystem['showCamp']>): ReturnType<IsleSystem['showCamp']> { return this.systems.isle.showCamp(...args); }
  boardFollower(...args: Parameters<IsleSystem['boardFollower']>): ReturnType<IsleSystem['boardFollower']> { return this.systems.isle.boardFollower(...args); }
  updateFollowers(...args: Parameters<IsleSystem['updateFollowers']>): ReturnType<IsleSystem['updateFollowers']> { return this.systems.isle.updateFollowers(...args); }
  updateHelpers(...args: Parameters<ShipSystem['updateHelpers']>): ReturnType<ShipSystem['updateHelpers']> { return this.systems.ship.updateHelpers(...args); }
  strike(...args: Parameters<IsleSystem['strike']>): ReturnType<IsleSystem['strike']> { return this.systems.isle.strike(...args); }
  target(...args: Parameters<IsleSystem['target']>): ReturnType<IsleSystem['target']> { return this.systems.isle.target(...args); }
  aim(...args: Parameters<IsleSystem['aim']>): ReturnType<IsleSystem['aim']> { return this.systems.isle.aim(...args); }
  onFreed(...args: Parameters<IsleSystem['onFreed']>): ReturnType<IsleSystem['onFreed']> { return this.systems.isle.onFreed(...args); }
  onSpire(...args: Parameters<IsleSystem['onSpire']>): ReturnType<IsleSystem['onSpire']> { return this.systems.isle.onSpire(...args); }
  onCage(...args: Parameters<IsleSystem['onCage']>): ReturnType<IsleSystem['onCage']> { return this.systems.isle.onCage(...args); }
  onCaptive(...args: Parameters<ShipSystem['onCaptive']>): ReturnType<ShipSystem['onCaptive']> { return this.systems.ship.onCaptive(...args); }
  onHive(...args: Parameters<IsleSystem['onHive']>): ReturnType<IsleSystem['onHive']> { return this.systems.isle.onHive(...args); }
  heartSong(...args: Parameters<ShipSystem['heartSong']>): ReturnType<ShipSystem['heartSong']> { return this.systems.ship.heartSong(...args); }
  onFaint(...args: Parameters<IsleSystem['onFaint']>): ReturnType<IsleSystem['onFaint']> { return this.systems.isle.onFaint(...args); }
  levelUp(...args: Parameters<StorySystem['levelUp']>): ReturnType<StorySystem['levelUp']> { return this.systems.story.levelUp(...args); }
  skillUp(...args: Parameters<StorySystem['skillUp']>): ReturnType<StorySystem['skillUp']> { return this.systems.story.skillUp(...args); }
  updateCannon(...args: Parameters<ShipSystem['updateCannon']>): ReturnType<ShipSystem['updateCannon']> { return this.systems.ship.updateCannon(...args); }
  updateShells(...args: Parameters<ShipSystem['updateShells']>): ReturnType<ShipSystem['updateShells']> { return this.systems.ship.updateShells(...args); }
  startRaid(...args: Parameters<RaidSystem['startRaid']>): ReturnType<RaidSystem['startRaid']> { return this.systems.raid.startRaid(...args); }
  makeShips(...args: Parameters<RaidSystem['makeShips']>): ReturnType<RaidSystem['makeShips']> { return this.systems.raid.makeShips(...args); }
  updateRaid(...args: Parameters<RaidSystem['updateRaid']>): ReturnType<RaidSystem['updateRaid']> { return this.systems.raid.updateRaid(...args); }
  queueWave(...args: Parameters<RaidSystem['queueWave']>): ReturnType<RaidSystem['queueWave']> { return this.systems.raid.queueWave(...args); }
  ringGong(...args: Parameters<RaidSystem['ringGong']>): ReturnType<RaidSystem['ringGong']> { return this.systems.raid.ringGong(...args); }
  finishRaid(...args: Parameters<RaidSystem['finishRaid']>): ReturnType<RaidSystem['finishRaid']> { return this.systems.raid.finishRaid(...args); }
  updateShips(...args: Parameters<RaidSystem['updateShips']>): ReturnType<RaidSystem['updateShips']> { return this.systems.raid.updateShips(...args); }

  leavingShips: Ship[] = [];
  updateList(...args: Parameters<ShipSystem['updateList']>): ReturnType<ShipSystem['updateList']> { return this.systems.ship.updateList(...args); }

  // ----------------------------------------------------------- Sky Scooter
  /**
   * The Sky Scooter (the owner): ride a little drone off the deck and fly freely round Bao, on a tether so never too
   * far. Sky Sparks float out there (they build and upgrade the scooter), and sky dew and treasure clouds can be caught.
   */
  drone: { obj: T.Object3D; vel: T.Vector3; rotors: T.Object3D[]; tether: T.Line } | null = null;

  sparks: { o: T.Object3D; alive: boolean; t: number; phase: number }[] = [];
  startDrone(...args: Parameters<DroneSystem['startDrone']>): ReturnType<DroneSystem['startDrone']> { return this.systems.drone.startDrone(...args); }
  droneRange(...args: Parameters<DroneSystem['droneRange']>): ReturnType<DroneSystem['droneRange']> { return this.systems.drone.droneRange(...args); }
  updateDrone(...args: Parameters<DroneSystem['updateDrone']>): ReturnType<DroneSystem['updateDrone']> { return this.systems.drone.updateDrone(...args); }

  tetherWarned = false;
  landDrone(...args: Parameters<DroneSystem['landDrone']>): ReturnType<DroneSystem['landDrone']> { return this.systems.drone.landDrone(...args); }
  makeSparks(...args: Parameters<DroneSystem['makeSparks']>): ReturnType<DroneSystem['makeSparks']> { return this.systems.drone.makeSparks(...args); }
  updateSparks(...args: Parameters<DroneSystem['updateSparks']>): ReturnType<DroneSystem['updateSparks']> { return this.systems.drone.updateSparks(...args); }
  hideSparks(...args: Parameters<DroneSystem['hideSparks']>): ReturnType<DroneSystem['hideSparks']> { return this.systems.drone.hideSparks(...args); }
  makeFishing(...args: Parameters<SkiffSystem['makeFishing']>): ReturnType<SkiffSystem['makeFishing']> { return this.systems.skiff.makeFishing(...args); }
  bobberSpot(...args: Parameters<SkiffSystem['bobberSpot']>): ReturnType<SkiffSystem['bobberSpot']> { return this.systems.skiff.bobberSpot(...args); }
  startFishing(...args: Parameters<SkiffSystem['startFishing']>): ReturnType<SkiffSystem['startFishing']> { return this.systems.skiff.startFishing(...args); }
  stopFishing(...args: Parameters<SkiffSystem['stopFishing']>): ReturnType<SkiffSystem['stopFishing']> { return this.systems.skiff.stopFishing(...args); }

  /** Reel held (the Reel button, F or a long press): press and release go to the simulation. */
  reelHeld = false;
  reel(...args: Parameters<SkiffSystem['reel']>): ReturnType<SkiffSystem['reel']> { return this.systems.skiff.reel(...args); }
  updateFishing(...args: Parameters<SkiffSystem['updateFishing']>): ReturnType<SkiffSystem['updateFishing']> { return this.systems.skiff.updateFishing(...args); }
  fishingView(...args: Parameters<SkiffSystem['fishingView']>): ReturnType<SkiffSystem['fishingView']> { return this.systems.skiff.fishingView(...args); }
  spawnDew(...args: Parameters<DeckSystem['spawnDew']>): ReturnType<DeckSystem['spawnDew']> { return this.systems.deck.spawnDew(...args); }
  updateDew(...args: Parameters<DeckSystem['updateDew']>): ReturnType<DeckSystem['updateDew']> { return this.systems.deck.updateDew(...args); }
  catchDew(...args: Parameters<DeckSystem['catchDew']>): ReturnType<DeckSystem['catchDew']> { return this.systems.deck.catchDew(...args); }
  buildInteractables(...args: Parameters<InteractSystem['buildInteractables']>): ReturnType<InteractSystem['buildInteractables']> { return this.systems.interact.buildInteractables(...args); }
  live(...args: Parameters<InteractSystem['live']>): ReturnType<InteractSystem['live']> { return this.systems.interact.live(...args); }
  useNearby(...args: Parameters<InteractSystem['useNearby']>): ReturnType<InteractSystem['useNearby']> { return this.systems.interact.useNearby(...args); }
  bindPointer(...args: Parameters<InteractSystem['bindPointer']>): ReturnType<InteractSystem['bindPointer']> { return this.systems.interact.bindPointer(...args); }
  tap(...args: Parameters<InteractSystem['tap']>): ReturnType<InteractSystem['tap']> { return this.systems.interact.tap(...args); }
  doHarvest(...args: Parameters<DeckSystem['doHarvest']>): ReturnType<DeckSystem['doHarvest']> { return this.systems.deck.doHarvest(...args); }
  doFeedAll(...args: Parameters<DeckSystem['doFeedAll']>): ReturnType<DeckSystem['doFeedAll']> { return this.systems.deck.doFeedAll(...args); }
  doPet(...args: Parameters<DeckSystem['doPet']>): ReturnType<DeckSystem['doPet']> { return this.systems.deck.doPet(...args); }
  fedFx(...args: Parameters<DeckSystem['fedFx']>): ReturnType<DeckSystem['fedFx']> { return this.systems.deck.fedFx(...args); }
  checkCanGrow(...args: Parameters<StorySystem['checkCanGrow']>): ReturnType<StorySystem['checkCanGrow']> { return this.systems.story.checkCanGrow(...args); }
  doBrush(...args: Parameters<DeckSystem['doBrush']>): ReturnType<DeckSystem['doBrush']> { return this.systems.deck.doBrush(...args); }
  doGrow(...args: Parameters<DeckSystem['doGrow']>): ReturnType<DeckSystem['doGrow']> { return this.systems.deck.doGrow(...args); }
  doMine(...args: Parameters<IsleSystem['doMine']>): ReturnType<IsleSystem['doMine']> { return this.systems.isle.doMine(...args); }
  doWild(...args: Parameters<IsleSystem['doWild']>): ReturnType<IsleSystem['doWild']> { return this.systems.isle.doWild(...args); }
  doRest(...args: Parameters<HouseSystem['doRest']>): ReturnType<HouseSystem['doRest']> { return this.systems.house.doRest(...args); }
  doBath(...args: Parameters<HouseSystem['doBath']>): ReturnType<HouseSystem['doBath']> { return this.systems.house.doBath(...args); }
  quickEat(...args: Parameters<StorySystem['quickEat']>): ReturnType<StorySystem['quickEat']> { return this.systems.story.quickEat(...args); }
  talk(...args: Parameters<StorySystem['talk']>): ReturnType<StorySystem['talk']> { return this.systems.story.talk(...args); }
  sail(...args: Parameters<StorySystem['sail']>): ReturnType<StorySystem['sail']> { return this.systems.story.sail(...args); }
  scene_(...args: Parameters<StorySystem['scene_']>): ReturnType<StorySystem['scene_']> { return this.systems.story.scene_(...args); }
  openPanel(...args: Parameters<InteractSystem['openPanel']>): ReturnType<InteractSystem['openPanel']> { return this.systems.interact.openPanel(...args); }
  wakeUp(...args: Parameters<StorySystem['wakeUp']>): ReturnType<StorySystem['wakeUp']> { return this.systems.story.wakeUp(...args); }

  // ----------------------------------------------------------------- loop
  start() { this.renderer.setAnimationLoop(() => { const now = performance.now(); const dt = (now - (this.lastFrame || now)) / 1000; this.lastFrame = now; this.loop.advance(dt); }); }

  lastFrame = 0;
  setZoom(...args: Parameters<CameraSystem['setZoom']>): ReturnType<CameraSystem['setZoom']> { return this.systems.camera.setZoom(...args); }

  /** Test hook: run `seconds` of game steps without rendering each one (fights, voyages, raids). */
  simulate(seconds: number) { for (let i = 0;i < seconds * 60;i++) this.step(1 / 60); }

  where(): Where { if (this.mode === 'drone') return 'deck'; return this.mode === 'isle' ? 'isle' : this.mode === 'house' ? 'house' : this.mode === 'skiff' || this.mode === 'ride' ? 'skiff' : 'deck'; }

  step(dt: number) {
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
    if (this.mode === 'drone') this.systems.drone.update(dt, kx || kz ? { x: kx, z: kz } : this.hud.stick);
    else this.keeper.update(dt, stick);
    this.fx.stepGame(dt);
    this.combat.update(dt);
    if (combatOn) this.hive?.update(dt);
    this.systems.raid.update(dt);
    this.systems.ship.update(dt);
    this.systems.isle.update(dt);
    this.updateHelpers(dt);
    this.systems.deck.update(dt);
    if (this.mode === 'drone') { this.updateDew(dt); this.updateSparks(dt); }
    this.systems.skiff.update(dt);
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
  arrive(...args: Parameters<StorySystem['arrive']>): ReturnType<StorySystem['arrive']> { return this.systems.story.arrive(...args); }

  // ---------------------------------------------------------------- render
  render(realDt: number) {
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
    this.systems.interact.update(realDt);
    if (this.mode === 'house') this.systems.house.update(realDt);
    this.systems.camera.update(realDt);
    this.sky.update(realDt, this.camera);
    this.fx.update(realDt, this.camera, this.canvas.clientWidth, this.canvas.clientHeight);
    this.governor.sample(realDt, !this.paused);
    this.renderer.render(this.scene, this.camera);
    this.hudT += realDt;
    if (this.hudT > .05) { this.hudT = 0; this.updateHud(); }
  }
  applyLook(...args: Parameters<CameraSystem['applyLook']>): ReturnType<CameraSystem['applyLook']> { return this.systems.camera.applyLook(...args); }

  lastLook: Look | null = null;

  frozenLook: Look | null = null;

  /** A far, slow camera for the prologue and the ending. */
  cinematic: { dist: number; pitch: number; spin: number } | null = null;
  updateHud(...args: Parameters<StorySystem['updateHud']>): ReturnType<StorySystem['updateHud']> { return this.systems.story.updateHud(...args); }
  syncDeck(...args: Parameters<DeckSystem['syncDeck']>): ReturnType<DeckSystem['syncDeck']> { return this.systems.deck.syncDeck(...args); }

  crewPlaced = false;

  syncT = 0;

  interactT = 0;

  cabin = new CottageView();
  snapCamera(...args: Parameters<CameraSystem['snapCamera']>): ReturnType<CameraSystem['snapCamera']> { return this.systems.camera.snapCamera(...args); }
  resize(...args: Parameters<CameraSystem['resize']>): ReturnType<CameraSystem['resize']> { return this.systems.camera.resize(...args); }

  /** Set while the page reloads into another save (Start over, Load code): nothing may save the old game then. */
  reloading = false;

  save() { if (!this.reloading) saveGame(this.state); }
  sleepingPod(...args: Parameters<StorySystem['sleepingPod']>): ReturnType<StorySystem['sleepingPod']> { return this.systems.story.sleepingPod(...args); }

  /** After the ending the pod drifts across the sky around Bao (STORY §11), Grand Hana the biggest. */
  ambientPod = new T.Group();
  updateAmbientPod(...args: Parameters<StorySystem['updateAmbientPod']>): ReturnType<StorySystem['updateAmbientPod']> { return this.systems.story.updateAmbientPod(...args); }
  ending(...args: Parameters<StorySystem['ending']>): ReturnType<StorySystem['ending']> { return this.systems.story.ending(...args); }
  api(...args: Parameters<StorySystem['api']>): ReturnType<StorySystem['api']> { return this.systems.story.api(...args); }

  /** Plain-data summary for tests and the test hook. */
  summary() {
    const s = this.state;
    return { mode: this.mode, place: s.place, voyage: s.voyage ? { to: s.voyage.to, k: s.voyage.elapsed / s.voyage.duration, raid: s.voyage.raidState } : null, stage: s.whale.stage, hunger: s.whale.hunger, mood: s.whale.mood, whaleXp: s.whale.xp, level: s.hero.level, hp: s.hero.hp, glimmer: s.glimmer, notes: s.notes, crew: s.crew, rescued: s.rescued, rooms: s.rooms, skills: s.skills, forms: this.combat.aliveCount(), hive: this.hive ? { id: this.hive.id, hp: this.hive.hp, shielded: this.hive.shielded, broken: this.hive.broken, status: this.hive.status() } : null, nearby: this.nearby?.id ?? null, fishing: this.fishing.state, reel: this.fishingView().reel, raid: !!this.raid, goal: goal(s, this.where()).text, items: s.items, gloom: GLOOM.value, keeper: { x: this.keeper.pos.x, y: this.keeper.pos.y, z: this.keeper.pos.z }, helpers: this.helpers.map(h => h.id), families: this.families.length };
  }
}
export { NIGHT, addXp };
