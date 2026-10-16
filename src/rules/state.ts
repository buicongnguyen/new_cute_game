import { CREW, FISHING, ISLE_IDS, plotCount, ISLE_MAPS, PLACE_IDS, ROOM_IDS, SKILL_IDS, STAGES, WHALE, type CrewId, type HelperId, type IsleId, type ItemId, type NoteIsle, type PlaceId, type RecipeId, type RoomId, type SkillId, type Stage, type TreeId } from './content.ts';

/** One planter box on Bao's deck. `progress` counts seconds of growth toward `need`. */
export interface Plot {
  tree: TreeId | null;
  /** 'growing' until the first fruit, then 'ripe' (fruit waiting) or 'regrow' (after a harvest). */
  phase: 'empty' | 'growing' | 'ripe' | 'regrow';
  progress: number;
  /** Rings still needed to clean a raid crust (0: clean). A crusted tree does not grow. */
  crust: number;
}

export interface IsleProgress {
  spires: boolean[];
  cages: boolean[];
  /** Groups cleared (every form in them freed). */
  groups: boolean[];
  /** Ships: families freed from the hold. */
  captives: boolean[];
  freed: boolean;
  /** Play-seconds at which each ore rock / wild plant is back. */
  oreAt: number[];
  wildAt: number[];
  visited: boolean;
  /** A leftover-Gloom group waiting on this freed land (after the ending). */
  leftover: boolean;
  /** Times the Captain fainted at this isle's boss (each makes it 10% weaker, up to 3). */
  cracks: number;
}

export interface Voyage {
  from: PlaceId; to: PlaceId;
  elapsed: number; duration: number;
  hungry: boolean;
  /** Seconds into the voyage when a raid starts, or null. */
  raidAt: number | null;
  raidState: 'none' | 'pending' | 'active' | 'done';
  /** A scripted raid follows a song (two waves); a random one is small (one wave). */
  scripted: boolean;
  treasure: boolean;
  dewTimer: number;
}

export interface GameState {
  version: number;
  seed: string;
  /** Wall clock (ms) up to which the garden has been grown. */
  clock: number;
  /** Seconds of active play (gameplay timers use this, never the wall clock). */
  playSeconds: number;
  place: PlaceId;
  voyage: Voyage | null;
  whale: { hunger: number; mood: number; xp: number; stage: Stage; petAt: number; specks: number; speckTimer: number; moodTimer: number; songs: number };
  notes: NoteIsle[];
  plots: Plot[];
  items: Partial<Record<ItemId, number>>;
  glimmer: number;
  /** `freshUntil`: the bath's buff (separate from meal buffs, so both can be on). */
  hero: { level: number; xp: number; hp: number; buff: 'power' | 'guard' | null; buffUntil: number; freshUntil: number };
  /** `deck`: deck extensions built (0–3). */
  gear: { mallet: number; coat: number; rope: boolean; line: boolean; bait: boolean; deck: number };
  /** Rooms of Nana's cottage that have been repaired (chapter 2). */
  rooms: Record<RoomId, boolean>;
  /** Life-skill XP. */
  skills: Record<SkillId, number>;
  /** Fractions toward the next bonus fruit and second portion (skill perks pay out exactly, without dice). */
  bank: { fruit: number; portion: number };
  /** Chime Post spot indices that hold a post. */
  posts: number[];
  /** Keepsakes made at the Workbench (they only decorate). */
  keepsakes: string[];
  /** Bites left in each place's sky-fish school, and their refill timers (logic review 24: one school per place). */
  schools: Record<PlaceId, { left: number; t: number }>;
  /** Everyone rescued (crew and camp people). */
  rescued: CrewId[];
  /** Crew living on Bao (Nana from the start). */
  crew: CrewId[];
  /** The two crew mates picked for boarding missions. */
  boarders: HelperId[];
  isles: Record<IsleId, IsleProgress>;
  /** Lands whose scripted raid (the first voyage after freeing them) has not happened yet. */
  raidsOwed: IsleId[];
  story: { prologueSeen: boolean; ended: boolean; endingSeen: boolean; flags: Record<string, boolean>; nanaGifts: number };
  /** Play-time timers (seconds). */
  timers: { gardener: number; leftover: number; nana: number; mina: number };
  stats: { freed: number; fish: number; harvested: number; voyages: number; raidsWon: number; faints: number; shipped: number; cooked: number; families: number };
}

export const SAVE_VERSION = 2;

export function newIsle(isle: IsleId): IsleProgress {
  const map = ISLE_MAPS[isle];
  return {
    spires: map.spires.map(() => false), cages: map.cages.map(() => false), groups: map.groups.map(() => false), captives: map.captives.map(() => false),
    freed: false, oreAt: map.ore.map(() => 0), wildAt: map.wild.map(() => 0), visited: false, leftover: false, cracks: 0,
  };
}

export const emptyPlot = (): Plot => ({ tree: null, phase: 'empty', progress: 0, crust: 0 });
const all = <K extends string, V>(keys: readonly K[], v: V) => Object.fromEntries(keys.map(k => [k, v])) as Record<K, V>;

export function newGame(seed = 'cloudback', now = Date.now()): GameState {
  const isles = Object.fromEntries(ISLE_IDS.map(id => [id, newIsle(id)])) as Record<IsleId, IsleProgress>;
  return {
    version: SAVE_VERSION, seed, clock: now, playSeconds: 0, place: 'dawnreach', voyage: null,
    whale: { hunger: WHALE.start.hunger, mood: WHALE.start.mood, xp: 0, stage: 0, petAt: 0, specks: 0, speckTimer: 0, moodTimer: 0, songs: 0 },
    notes: [],
    plots: Array.from({ length: STAGES[0].plots }, emptyPlot),
    // Two of each seed for the four planter boxes, and Nana's packed lunch: three Cloudpears (two make the first Pear Tart).
    // Two Sprout Beans for quick coin and the first deck, two of each tree, and Nana's lunch (three Cloudpears).
    items: { seed_sproutbean: 2, seed_puffberry: 2, seed_ropevine: 2, cloudpear: 3 },
    glimmer: 20,
    hero: { level: 1, xp: 0, hp: 100, buff: null, buffUntil: 0, freshUntil: 0 },
    gear: { mallet: 1, coat: 1, rope: false, line: false, bait: false, deck: 0 },
    rooms: all(ROOM_IDS, false),
    skills: all(SKILL_IDS, 0),
    bank: { fruit: 0, portion: 0 },
    posts: [],
    keepsakes: [],
    schools: Object.fromEntries(PLACE_IDS.map(p => [p, { left: FISHING.school, t: 0 }])) as Record<PlaceId, { left: number; t: number }>,
    rescued: [],
    crew: ['nana'],
    boarders: [],
    isles,
    raidsOwed: [],
    story: { prologueSeen: false, ended: false, endingSeen: false, flags: {}, nanaGifts: 0 },
    timers: { gardener: 0, leftover: 0, nana: 0, mina: 0 },
    stats: { freed: 0, fish: 0, harvested: 0, voyages: 0, raidsWon: 0, faints: 0, shipped: 0, cooked: 0, families: 0 },
  };
}

// ------------------------------------------------------------ inventory
export const count = (s: GameState, item: ItemId) => s.items[item] ?? 0;
export function give(s: GameState, item: ItemId, n = 1) { s.items[item] = count(s, item) + n; }
export function take(s: GameState, item: ItemId, n = 1) {
  const have = count(s, item);
  if (have < n) return false;
  if (have === n) delete s.items[item]; else s.items[item] = have - n;
  return true;
}
export const hasCrew = (s: GameState, who: CrewId) => s.crew.includes(who);
export const isRescued = (s: GameState, who: CrewId) => s.rescued.includes(who) || (who === 'nana');
export const crewOf = (isle: IsleId) => (Object.keys(CREW) as CrewId[]).filter(id => CREW[id].isle === isle);
export type { RecipeId };

/**
 * Version 1 → 2 (story v2, 2026-10-16): the cottage rooms, life skills, a fourth land and the Gloom fleet. A run that
 * had already made the rope is past chapters 1 and 2, so it keeps a working kitchen; the old Grey Star isle is now the
 * flagship of the fleet, so an unfinished one starts fresh (a finished story stays finished).
 */
export function fromV1(data: unknown): unknown {
  const s = data as Partial<GameState> & { story?: GameState['story'] };
  if (s.gear?.rope) {
    s.rooms = { kitchen: true, craft: false, study: false, bath: false };
    if (s.gear) (s.gear as GameState['gear']).deck = 1;
    s.story = { ...(s.story as GameState['story']), flags: { ...(s.story?.flags ?? {}), onDeck: true, petted: true, shipped: true, cooked: true, fished: true } };
  }
  if (s.isles && !s.isles.star?.freed) delete (s.isles as Partial<Record<IsleId, IsleProgress>>).star;
  return s;
}

/** Basic checks a loaded save must pass; anything else is repaired to defaults. */
export function repair(s: GameState): GameState {
  const fresh = newGame(s.seed ?? 'cloudback', s.clock ?? Date.now());
  const out = { ...fresh, ...s } as GameState;
  out.version = SAVE_VERSION;
  out.whale = { ...fresh.whale, ...(s.whale ?? {}) };
  out.hero = { ...fresh.hero, ...(s.hero ?? {}) };
  out.gear = { ...fresh.gear, ...(s.gear ?? {}) };
  out.rooms = { ...fresh.rooms, ...(s.rooms ?? {}) };
  out.skills = { ...fresh.skills, ...(s.skills ?? {}) };
  out.bank = { ...fresh.bank, ...(s.bank ?? {}) };
  out.story = { ...fresh.story, ...(s.story ?? {}), flags: { ...(s.story?.flags ?? {}) } };
  out.stats = { ...fresh.stats, ...(s.stats ?? {}) };
  out.timers = { ...fresh.timers, ...(s.timers ?? {}) };
  const oldSchool = (s as unknown as { school?: { left: number; t: number } }).school;
  out.schools = { ...fresh.schools, ...(s.schools ?? {}) };
  if (oldSchool && !s.schools) out.schools[out.place] = { ...oldSchool };
  delete (out as unknown as { school?: unknown }).school;
  // A save made mid-raid: the raid lives only in the scene, so it starts again on load (logic review 2).
  if (out.voyage?.raidState === 'active') out.voyage = { ...out.voyage, raidState: 'pending', raidAt: out.voyage.elapsed };
  if (out.voyage && !(out.voyage.to in out.schools)) out.voyage = null;
  if (!(out.place in out.schools)) out.place = 'dawnreach';
  out.keepsakes = [...(s.keepsakes ?? [])];
  out.boarders = [...(s.boarders ?? [])].filter(id => ['pip', 'mina', 'tam', 'ria'].includes(id)).slice(0, 2) as HelperId[];
  out.items = { ...(s.items ?? {}) };
  out.isles = { ...fresh.isles };
  for (const id of ISLE_IDS) {
    const base = newIsle(id), have = s.isles?.[id];
    out.isles[id] = have ? {
      ...base, ...have,
      spires: base.spires.map((_, i) => !!have.spires?.[i]), cages: base.cages.map((_, i) => !!have.cages?.[i]), groups: base.groups.map((_, i) => !!have.groups?.[i]),
      captives: base.captives.map((_, i) => !!have.captives?.[i]), oreAt: base.oreAt.map((_, i) => have.oreAt?.[i] ?? 0), wildAt: base.wildAt.map((_, i) => have.wildAt?.[i] ?? 0),
    } : base;
  }
  out.gear.deck = Math.max(0, Math.min(3, Math.round(out.gear.deck) || 0));
  const plots = plotCount(out.whale.stage, out.gear.deck);
  out.plots = Array.from({ length: plots }, (_, i) => ({ ...emptyPlot(), ...(s.plots?.[i] ?? {}) }));
  if (!out.crew.includes('nana')) out.crew = ['nana', ...out.crew];
  // Numbers a hand-edited or damaged save could break (code review 26).
  out.gear.mallet = Math.max(1, Math.min(3, Math.round(out.gear.mallet) || 1));
  out.gear.coat = Math.max(1, Math.min(3, Math.round(out.gear.coat) || 1));
  out.whale.stage = Math.max(0, Math.min(3, Math.round(out.whale.stage) || 0)) as Stage;
  out.whale.specks = Math.max(0, Math.min(WHALE.specksCrusted[1], Math.round(out.whale.specks) || 0));
  out.hero.level = Math.max(1, Math.round(out.hero.level) || 1);
  for (const k of SKILL_IDS) out.skills[k] = Math.max(0, Number(out.skills[k]) || 0);
  return out;
}
