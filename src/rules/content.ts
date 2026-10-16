/**
 * Every number in the game, as data. docs/DESIGN.md is the human-readable copy of this file; keep both in step.
 * Names are English source strings: the UI passes them through t() (src/i18n.ts), which looks up the Vietnamese pack.
 */

export type PlaceId = 'dawnreach' | 'clover' | 'reef' | 'ember' | 'star';
export type IsleId = Exclude<PlaceId, 'dawnreach'>;
/** The three isles that hold a Note (the Star holds the Heart). */
export type NoteIsle = 'clover' | 'reef' | 'ember';
export const NOTE_ISLES: readonly NoteIsle[] = ['clover', 'reef', 'ember'];
export type Stage = 0 | 1 | 2 | 3;
export type TreeId = 'puffberry' | 'ropevine' | 'cloudpear' | 'chimewood' | 'honeybun' | 'glowplum' | 'starfig' | 'golden';
export type FishId = 'puff_minnow' | 'sun_carp' | 'star_ray' | 'cloud_koi';
export type MealId = 'pear_tart' | 'fish_bun' | 'sky_stew';
export type ProduceId = 'puffberry' | 'glowplum' | 'starfig' | 'cloudpear' | 'honeybun' | 'fibre' | 'chimewood' | 'ore';
export type SeedId = `seed_${TreeId}`;
export type ItemId = ProduceId | FishId | MealId | SeedId;
export type ItemKind = 'whale' | 'people' | 'craft' | 'fish' | 'meal' | 'seed';
export type CrewId = 'nana' | 'pip' | 'olla' | 'kai' | 'mina' | 'coal' | 'tam' | 'ria';
export type FormId = 'gloomling' | 'spitter' | 'brute' | 'flyer';
export type HiveId = 'thornhive' | 'clamhive' | 'forgehive' | 'greyheart';

// ------------------------------------------------------------------ whale
export const STAGES = [
  { name: 'Calf', xp: 0, note: null, plots: 4, scale: 1 },
  { name: 'Young', xp: 120, note: 'clover', plots: 6, scale: 1.18 },
  { name: 'Adult', xp: 380, note: 'reef', plots: 8, scale: 1.34 },
  { name: 'Great', xp: 760, note: 'ember', plots: 10, scale: 1.5 },
] as const satisfies readonly { name: string; xp: number; note: NoteIsle | null; plots: number; scale: number }[];

export const WHALE = {
  start: { hunger: 70, mood: 70 },
  maxHunger: 100, maxMood: 100,
  petCooldown: 60, petMood: 5,
  brushMood: 4, brushGlimmer: 2,
  songMood: 20, hungryVoyageMood: -10, lostRaidMood: -12,
  /** Every this many seconds of play mood moves 1 point toward `driftTo`, and each speck costs 1 more. */
  moodTick: 60, driftTo: 50,
  /** Specks: [seconds between, most at once] at a crusted isle, and anywhere else. */
  specksCrusted: [40, 5], specksCalm: [180, 2],
  /** While the Keeper is away from Bao, Nana brushes all but this many specks. */
  specksAway: 2,
} as const;

/** Mood → tree growth speed. */
export function moodFactor(mood: number) {
  return mood >= 80 ? 1.25 : mood >= 50 ? 1 : mood >= 25 ? .85 : .7;
}
export function moodLabel(mood: number) {
  return mood >= 80 ? 'Joyful' : mood >= 50 ? 'Content' : mood >= 25 ? 'Grumpy' : 'Sad';
}

// ------------------------------------------------------------------- items
export interface ItemDef {
  name: string; kind: ItemKind; sell: number;
  feed?: { hunger: number; xp: number; mood: number };
  eat?: { heal: number; buff?: 'power' | 'guard' };
}
// Whale food fills Bao and grows it; mood comes from care: fish treats, pats, brushing and songs (logic check 3, 6.2).
const fishFeed = { hunger: 5, xp: 4, mood: 6 };
export const ITEMS: Record<ItemId, ItemDef> = {
  puffberry: { name: 'Puffberry', kind: 'whale', sell: 1, feed: { hunger: 12, xp: 3, mood: 0 } },
  glowplum: { name: 'Glowplum', kind: 'whale', sell: 10, feed: { hunger: 22, xp: 15, mood: 0 } },
  starfig: { name: 'Starfig', kind: 'whale', sell: 24, feed: { hunger: 35, xp: 45, mood: 0 } },
  cloudpear: { name: 'Cloudpear', kind: 'people', sell: 4, eat: { heal: 25 } },
  honeybun: { name: 'Honeybun', kind: 'people', sell: 8, eat: { heal: 45 } },
  fibre: { name: 'Fibre', kind: 'craft', sell: 3 },
  chimewood: { name: 'Chimewood', kind: 'craft', sell: 6 },
  ore: { name: 'Ore', kind: 'craft', sell: 6 },
  puff_minnow: { name: 'Puff Minnow', kind: 'fish', sell: 2, feed: fishFeed },
  sun_carp: { name: 'Sun Carp', kind: 'fish', sell: 5, feed: fishFeed },
  star_ray: { name: 'Star Ray', kind: 'fish', sell: 10, feed: fishFeed },
  cloud_koi: { name: 'Cloud Koi', kind: 'fish', sell: 25, feed: { hunger: 5, xp: 15, mood: 20 } },
  pear_tart: { name: 'Pear Tart', kind: 'meal', sell: 0, eat: { heal: 90 } },
  fish_bun: { name: 'Fish Bun', kind: 'meal', sell: 0, eat: { heal: 70, buff: 'power' } },
  sky_stew: { name: 'Sky Stew', kind: 'meal', sell: 0, eat: { heal: 50, buff: 'guard' } },
  seed_puffberry: { name: 'Puffberry seed', kind: 'seed', sell: 0 },
  seed_ropevine: { name: 'Ropevine seed', kind: 'seed', sell: 0 },
  seed_cloudpear: { name: 'Cloudpear seed', kind: 'seed', sell: 0 },
  seed_chimewood: { name: 'Chimewood seed', kind: 'seed', sell: 0 },
  seed_honeybun: { name: 'Honeybun seed', kind: 'seed', sell: 0 },
  seed_glowplum: { name: 'Glowplum seed', kind: 'seed', sell: 0 },
  seed_starfig: { name: 'Starfig seed', kind: 'seed', sell: 0 },
  seed_golden: { name: 'Golden seed', kind: 'seed', sell: 0 },
};
export const FISH: readonly FishId[] = ['puff_minnow', 'sun_carp', 'star_ray', 'cloud_koi'];
export const seedOf = (tree: TreeId) => `seed_${tree}` as SeedId;

// ------------------------------------------------------------------- trees
export interface TreeDef { name: string; kind: 'whale' | 'people' | 'craft' | 'decor'; grow: number; regrow: number; yield: [ProduceId, number] | null; seedPrice: number }
export const TREES: Record<TreeId, TreeDef> = {
  puffberry: { name: 'Puffberry', kind: 'whale', grow: 40, regrow: 35, yield: ['puffberry', 3], seedPrice: 5 },
  ropevine: { name: 'Ropevine', kind: 'craft', grow: 50, regrow: 45, yield: ['fibre', 2], seedPrice: 6 },
  cloudpear: { name: 'Cloudpear', kind: 'people', grow: 80, regrow: 60, yield: ['cloudpear', 2], seedPrice: 10 },
  chimewood: { name: 'Chimewood', kind: 'craft', grow: 100, regrow: 80, yield: ['chimewood', 2], seedPrice: 14 },
  honeybun: { name: 'Honeybun', kind: 'people', grow: 130, regrow: 100, yield: ['honeybun', 2], seedPrice: 18 },
  glowplum: { name: 'Glowplum', kind: 'whale', grow: 120, regrow: 90, yield: ['glowplum', 2], seedPrice: 28 },
  starfig: { name: 'Starfig', kind: 'whale', grow: 200, regrow: 150, yield: ['starfig', 2], seedPrice: 55 },
  golden: { name: 'Golden tree', kind: 'decor', grow: 600, regrow: 0, yield: null, seedPrice: 0 },
};
export const TREE_IDS = Object.keys(TREES) as TreeId[];
export const GARDENER_SPEED = 1.2;
export const GARDENER_EVERY = 8;
/** Rings needed to clean a tree crusted in a raid. */
export const CRUST_RINGS = 3;

// ------------------------------------------------------------------ places
export interface PlaceDef { name: string; pos: [number, number]; needStage: Stage; needNotes: number; tier: number; gate: string | null; hue: string }
export const PLACES: Record<PlaceId, PlaceDef> = {
  dawnreach: { name: 'Dawnreach', pos: [0, 0], needStage: 0, needNotes: 0, tier: 0, gate: null, hue: '#7cc8ff' },
  clover: { name: 'Clover Rise', pos: [13, -9], needStage: 0, needNotes: 0, tier: 0, gate: null, hue: '#7bd54a' },
  reef: { name: 'Lantern Reef', pos: [-14, -28], needStage: 1, needNotes: 0, tier: 1, gate: 'Wind Wall', hue: '#2fd0c8' },
  ember: { name: 'Ember Peaks', pos: [16, -46], needStage: 2, needNotes: 0, tier: 2, gate: 'Storm Belt', hue: '#ff6a2a' },
  star: { name: 'The Grey Star', pos: [0, -66], needStage: 3, needNotes: 3, tier: 3, gate: 'Deep Mist', hue: '#7a5cff' },
};
export const PLACE_IDS = Object.keys(PLACES) as PlaceId[];
export const ISLE_IDS: readonly IsleId[] = ['clover', 'reef', 'ember', 'star'];
/** Fullness spent per league; a hungry flight is twice as slow. Random raids never come on the Deep Song dive. */
export const VOYAGE = { base: 24, perLeague: .9, max: 75, costPerLeague: 2, hungrySlow: 2, raidAt: .4, randomRaid: .2, dewEvery: 6, dew: { hunger: 1, mood: 1, glimmer: 1 }, treasure: 15 } as const;

// ------------------------------------------------------------------- keeper
/** Cumulative XP for levels 2..15 (index 0 = level 2). */
export const LEVEL_XP = [40, 100, 190, 300, 440, 600, 800, 1040, 1320, 1650, 2080, 2600, 3200, 3900] as const;
export const MAX_LEVEL = LEVEL_XP.length + 1;
export const KEEPER = {
  baseHp: 100, hpPerLevel: 15, baseDamage: 10, damagePerLevel: 2,
  // Auto-ring fires only when the blow can land (logic review 17).
  ringEvery: .55, ringReach: 2.0, autoRange: 1.95,
  spin: { radius: 2.8, mult: 1.6, cooldown: 6 },
  hop: { distance: 4.5, invuln: .3, cooldown: 3.5 },
  mercy: .8, deckRegen: 2, speed: 5.2,
} as const;
export const MALLET = [1, 1.4, 2.2] as const;
export const COAT = [0, 40, 120] as const;
export const BUFF = { seconds: 150, power: 1.2, guard: .75 } as const;

// -------------------------------------------------------------- workbench
export type RecipeId = 'rope' | 'mallet2' | 'mallet3' | 'coat2' | 'coat3' | 'line' | 'post' | 'lanterns' | 'crown' | 'goldbell';
export interface RecipeDef { name: string; cost: Partial<Record<ItemId, number>>; glimmer: number; needsTam: boolean; effect: string; needsRope?: boolean; keepsake?: boolean }
export const RECIPES: Record<RecipeId, RecipeDef> = {
  rope: { name: 'Climbing Rope', cost: { fibre: 3 }, glimmer: 0, needsTam: false, effect: 'Go down to isles' },
  mallet2: { name: 'Mallet II', cost: { chimewood: 4 }, glimmer: 30, needsTam: false, effect: 'Damage ×1.4' },
  mallet3: { name: 'Mallet III', cost: { chimewood: 6, ore: 6 }, glimmer: 150, needsTam: true, effect: 'Damage ×2.2' },
  coat2: { name: 'Coat II', cost: { fibre: 6 }, glimmer: 30, needsTam: false, effect: '+40 max HP', needsRope: true },
  coat3: { name: 'Coat III', cost: { fibre: 10, ore: 6 }, glimmer: 150, needsTam: true, effect: '+120 max HP' },
  line: { name: 'Good Line', cost: { fibre: 4 }, glimmer: 20, needsTam: false, effect: 'Longer bites, rarer fish', needsRope: true },
  post: { name: 'Chime Post', cost: { chimewood: 3 }, glimmer: 15, needsTam: false, effect: 'A raid tower on a post spot' },
  // Keepsakes only look lovely: a glimmer sink for the late game and after the ending.
  lanterns: { name: 'Lantern string', cost: { fibre: 4 }, glimmer: 80, needsTam: false, effect: 'Paper lanterns around Bao’s back', keepsake: true, needsRope: true },
  crown: { name: 'Flower crown for Bao', cost: { cloudpear: 2 }, glimmer: 150, needsTam: false, effect: 'Bao wears flowers', keepsake: true },
  goldbell: { name: 'Golden bell', cost: { ore: 4, chimewood: 4 }, glimmer: 300, needsTam: true, effect: 'Your mallet shines gold', keepsake: true },
};
export const RECIPE_IDS = Object.keys(RECIPES) as RecipeId[];
/** A post's ring deals this share of the Keeper's ring damage and slows Gloom forms (×1.5 with Tam). */
export const POST = { spots: 4, share: .5, every: 1.2, radius: 3.5, tamBonus: 1.5, slow: .6, slowFor: 1 } as const;

export const MEALS: Record<MealId, { cost: Partial<Record<ItemId | 'fish', number>> }> = {
  pear_tart: { cost: { cloudpear: 2 } },
  fish_bun: { cost: { honeybun: 1, fish: 1 } },
  sky_stew: { cost: { cloudpear: 1, fish: 2 } },
};
export const MEAL_IDS = Object.keys(MEALS) as MealId[];

// ----------------------------------------------------------------- markets
export interface MarketDef { owner: CrewId; name: string; sells: Partial<Record<ItemId, number>>; likes: ItemKind }
export const MARKETS: Partial<Record<IsleId, MarketDef>> = {
  clover: { owner: 'olla', name: 'Clover Market', likes: 'fish', sells: { seed_puffberry: 5, seed_ropevine: 6, seed_cloudpear: 10, seed_chimewood: 14, seed_glowplum: 28 } },
  reef: { owner: 'kai', name: 'Reef Market', likes: 'people', sells: { seed_puffberry: 5, seed_ropevine: 6, seed_honeybun: 18, seed_starfig: 55 } },
  ember: { owner: 'coal', name: 'Ember Market', likes: 'whale', sells: { seed_puffberry: 5, seed_ropevine: 6, ore: 16, starfig: 45 } },
};
export const LIKED_BONUS = 1.5;

// -------------------------------------------------------------------- crew
export interface CrewDef { name: string; isle: IsleId | null; joins: boolean; job: string; color: string }
export const CREW: Record<CrewId, CrewDef> = {
  nana: { name: 'Nana Sumi', isle: null, joins: true, job: 'Mentor', color: '#c77dff' },
  pip: { name: 'Pip', isle: 'clover', joins: true, job: 'Gardener', color: '#7bd54a' },
  olla: { name: 'Mayor Olla', isle: 'clover', joins: false, job: 'Clover Market', color: '#ffc83a' },
  kai: { name: 'Old Kai', isle: 'reef', joins: false, job: 'Reef Market', color: '#35b6f2' },
  mina: { name: 'Mina', isle: 'reef', joins: true, job: 'Cook', color: '#ff7fa8' },
  coal: { name: 'Granny Coal', isle: 'ember', joins: false, job: 'Ember Market', color: '#8a8a9a' },
  tam: { name: 'Tam', isle: 'ember', joins: true, job: 'Smith', color: '#c77a3a' },
  ria: { name: 'Ria', isle: 'reef', joins: true, job: 'Lookout', color: '#ef3b3b' },
};

// ---------------------------------------------------------------- the Gloom
export interface FormDef { name: string; hp: number; damage: number; speed: number; xp: number; glimmer: number; radius: number; native: string }
export const FORMS: Record<FormId, FormDef> = {
  gloomling: { name: 'Gloomling', hp: 30, damage: 6, speed: 2.4, xp: 8, glimmer: 2, radius: .45, native: 'puffbun' },
  spitter: { name: 'Spitter', hp: 26, damage: 8, speed: 1.6, xp: 10, glimmer: 3, radius: .45, native: 'hopfrog' },
  brute: { name: 'Rammer', hp: 90, damage: 14, speed: 1.8, xp: 24, glimmer: 6, radius: .9, native: 'rockgoat' },
  flyer: { name: 'Flyer', hp: 40, damage: 10, speed: 3.2, xp: 14, glimmer: 4, radius: .5, native: 'skylark' },
};
export const ATTACKS = {
  bump: { reach: 1.1, cooldown: 1.3, windup: .3 },
  shard: { windup: .6, speed: 9, range: 8, cooldown: 2.4 },
  charge: { windup: .8, length: 7, speed: 9, cooldown: 3.5 },
  dive: { windup: .7, radius: 1.6, cooldown: 3.2 },
} as const;
export const SPIRE = { hp: 120, xp: 30, glimmer: 10, wakeEvery: 7, wakeRange: 13, maxAwake: 3 } as const;
export const TIERS = [
  { name: 'Clover', hp: 1, damage: .8, reward: 1, level: 1 },
  { name: 'Reef', hp: 1.9, damage: 1.5, reward: 1.6, level: 5 },
  { name: 'Ember', hp: 3, damage: 1.8, reward: 2.4, level: 9 },
  { name: 'Star', hp: 4.4, damage: 2.4, reward: 3.2, level: 13 },
] as const;
export interface HiveDef { name: string; isle: IsleId; hp: number; xp: number; glimmer: number; radius: number }
export const HIVES: Record<HiveId, HiveDef> = {
  thornhive: { name: 'Thornhive', isle: 'clover', hp: 480, xp: 150, glimmer: 80, radius: 2.2 },
  clamhive: { name: 'Clamhive', isle: 'reef', hp: 1500, xp: 300, glimmer: 160, radius: 2.6 },
  forgehive: { name: 'Forgehive', isle: 'ember', hp: 3000, xp: 520, glimmer: 280, radius: 2.4 },
  greyheart: { name: 'Grey Heart', isle: 'star', hp: 5000, xp: 900, glimmer: 500, radius: 2.8 },
};
export const HIVE_OF: Record<IsleId, HiveId> = { clover: 'thornhive', reef: 'clamhive', ember: 'forgehive', star: 'greyheart' };
/** Hive moves. Damage is multiplied by the isle tier's damage factor; every move has a wind-up of at least 0.6 s. */
export const HIVE_MOVES = {
  thornRing: { damage: 14, windup: 1.0, radius: 7.5, safe: 2.4 },
  spikeLines: { damage: 12, windup: .8, length: 15, width: 1.3, count: 3 },
  wake: { count: 2 },
  pearlVolley: { damage: 10, windup: .7, count: 5, speed: 10, spread: .9 },
  tideRing: { damage: 16, windup: 1.0, radius: 9 },
  slam: { damage: 20, windup: 1.0, radius: 3.4 },
  crackLines: { damage: 18, windup: .9, length: 17, width: 1.5, count: 2 },
  callFlyers: { count: 2 },
} as const;
export type HiveMove = keyof typeof HIVE_MOVES;
export const HIVE_PATTERNS: Record<HiveId, HiveMove[]> = {
  thornhive: ['thornRing', 'spikeLines', 'wake'],
  clamhive: ['pearlVolley', 'tideRing'],
  forgehive: ['slam', 'crackLines', 'callFlyers'],
  greyheart: ['thornRing', 'pearlVolley', 'slam', 'spikeLines', 'tideRing'],
};
/** Seconds between Hive moves. */
export const HIVE_PACE = 3.4;
/** The Clamhive gapes for 1.9 s after each move and shuts at the next wind-up (logic review 8: it was open 94% of the time). */
export const CLAM = { closedTaken: .15, openSeconds: 1.9 } as const;
/** Each faint at a Hive cracks its crust a little (Bao hums from above): it comes back 10% weaker, at most 30%. */
export const HIVE_CRACK = { perFaint: .1, most: 3 } as const;
/** Bao sings every 20 s during the finale: the Heart's shield cracks for 5 s and the song heals the Keeper. */
export const HEART = { shieldTaken: .4, songTaken: 1.4, songEvery: 20, songSeconds: 5, songHeal: 40 } as const;
export const RESCUE = { rings: 3, xp: 25, glimmer: 15 } as const;
export const FAINT = { groupsReset: true } as const;
/** Forms per raid wave: base + perIsle × isles freed; tier factor of the newest freed isle. */
/**
 * Raids are ship battles (the owner, 2026-10-16): Gloom ships come alongside from different sides and raiders walk
 * over planks. Bao's battle stations sink every tree and fitting below the deck (fewer things to draw in a fight),
 * leaving only the tools: two gongs and any Chime Posts. Raiders head for the hatch; one standing on it for
 * `crustAfter` s crusts a tree stored below. Knocking a raider off the deck edge sends it overboard (it is freed as it
 * falls), the best way to win. Scripted raids: 2 waves of base + perIsle × isles freed; random raids: 1 wave of
 * smallBase + perIsle × isles freed.
 */
export const RAID = { waves: 2, base: 4, perIsle: 2, smallBase: 2, tierFactor: .8, warn: 3, warnLookout: 10, ships: 2, boardEvery: .9, crustAfter: 5, aggro: 3, spitterAggro: 7, timeout: 100, winPerWave: 25,
  /** Knockback on the deck in a raid (metres per ring), Spin, and a rung gong's blast. */
  push: 1.15, spinPush: 2.1, gong: { radius: 4.8, push: 3.4, damage: .6, cooldown: 6 } } as const;
export const LEFTOVER = { every: 1800 } as const;
export const ORE = { perRock: 2, back: 600 } as const;
export const WILD = { back: 300 } as const;

// ------------------------------------------------------------------ fishing
export const FISHING = {
  wait: [2, 6] as const,
  window: { puff_minnow: .9, sun_carp: .8, star_ray: .65, cloud_koi: .5 } as Record<FishId, number>,
  lineBonus: .35, lineRare: 1.5,
  /** Each place has a school of bites that refills one bite every `refill` seconds of play. */
  school: 6, refill: 40,
  weights: {
    calm: { puff_minnow: 60, sun_carp: 30, star_ray: 9, cloud_koi: 1 },
    reef: { puff_minnow: 40, sun_carp: 35, star_ray: 20, cloud_koi: 5 },
    deep: { puff_minnow: 30, sun_carp: 35, star_ray: 25, cloud_koi: 10 },
  } as Record<'calm' | 'reef' | 'deep', Record<FishId, number>>,
};
export const fishWaters = (place: PlaceId) => place === 'reef' ? 'reef' : place === 'ember' || place === 'star' ? 'deep' : 'calm';

// --------------------------------------------------------------- isle maps
/** A group of Gloom forms standing around a point; `spire` names the Spire it guards (index), if any. */
export interface GroupDef { at: [number, number]; forms: FormId[]; spire?: number }
export interface IsleMap {
  radius: number; landing: [number, number]; market: [number, number] | null;
  groups: GroupDef[]; spires: [number, number][]; cages: { who: CrewId; at: [number, number] }[];
  hive: [number, number]; ore: [number, number][]; wild: [number, number][]; decor: { kind: string; at: [number, number]; rot?: number }[];
}
const G = (n: number, f: FormId) => Array<FormId>(n).fill(f);
export const ISLE_MAPS: Record<IsleId, IsleMap> = {
  clover: {
    radius: 34, landing: [0, 24], market: [-5.5, 22],
    groups: [
      { at: [-7, 11], forms: G(4, 'gloomling') },
      { at: [-12, 1], forms: [...G(3, 'gloomling'), ...G(2, 'spitter')], spire: 0 },
      { at: [11, -4], forms: [...G(3, 'spitter'), ...G(2, 'gloomling')], spire: 1 },
    ],
    spires: [[-15, -1], [14, -7]],
    cages: [{ who: 'olla', at: [4.5, 19.5] }, { who: 'pip', at: [-18, -4] }],
    hive: [0, -21], ore: [], wild: [[7, 13], [-4, -9]],
    decor: [{ kind: 'windmill', at: [19, 13] }, { kind: 'windmill', at: [-21, 15], rot: 1 }, { kind: 'windmill', at: [22, -14], rot: 2 }],
  },
  reef: {
    radius: 35, landing: [0, 25], market: [5.5, 22.5],
    groups: [
      { at: [7, 12], forms: [...G(3, 'gloomling'), ...G(2, 'spitter')] },
      { at: [-10, 7], forms: ['brute', ...G(3, 'gloomling')] },
      { at: [-13, -3], forms: [...G(2, 'spitter'), 'brute'], spire: 0 },
      { at: [13, -6], forms: [...G(2, 'brute'), ...G(2, 'spitter')], spire: 1 },
    ],
    spires: [[-17, -6], [16, -10]],
    cages: [{ who: 'kai', at: [-6, 21] }, { who: 'ria', at: [12.5, 16] }, { who: 'mina', at: [19, -13] }],
    hive: [0, -23], ore: [[-21, 10], [21, 4]], wild: [[10, 18], [-4, -11]],
    decor: [{ kind: 'coral_arch', at: [-3, 15] }, { kind: 'coral_arch', at: [4, -14], rot: 1.2 }, { kind: 'lantern', at: [-8, 18] }, { kind: 'lantern', at: [9, 6] }, { kind: 'lantern', at: [-14, -12] }, { kind: 'lantern', at: [12, -18] }],
  },
  ember: {
    radius: 36, landing: [0, 25], market: [-5.5, 22.5],
    groups: [
      { at: [-6, 12], forms: [...G(2, 'flyer'), ...G(3, 'gloomling')] },
      { at: [-14, 5], forms: ['brute', ...G(2, 'spitter'), 'flyer'], spire: 0 },
      { at: [14, 3], forms: [...G(2, 'brute'), ...G(2, 'flyer')], spire: 1 },
      { at: [2, -8], forms: [...G(3, 'spitter'), ...G(2, 'flyer'), 'brute'], spire: 2 },
    ],
    spires: [[-17, 2], [17, 0], [-2, -11]],
    cages: [{ who: 'coal', at: [5, 21] }, { who: 'tam', at: [-20, 9] }],
    hive: [0, -25], ore: [[-22, -6], [22, -8], [10, 14], [-10, -17]], wild: [],
    decor: [{ kind: 'forge', at: [-22, 11] }, { kind: 'forge', at: [18, 12], rot: 2 }],
  },
  star: {
    radius: 32, landing: [0, 24], market: null,
    groups: [
      { at: [0, 11], forms: [...G(4, 'gloomling'), ...G(2, 'spitter')] },
      { at: [0, -3], forms: [...G(2, 'brute'), ...G(2, 'flyer')] },
    ],
    spires: [], cages: [], hive: [0, -19], ore: [], wild: [], decor: [],
  },
};

// ------------------------------------------------------------- Bao's deck
/** Deck positions at calf size, metres; the head is toward −z. They spread out with the stage scale. */
export const DECK = {
  half: [4.4, 8.0] as const,
  plots: [[-1, -4.2], [1, -4.2], [-1, -2.4], [1, -2.4], [-1, 1.4], [1, 1.4], [-1, 3.2], [1, 3.2], [-1, -.6], [1, -.6]] as [number, number][],
  maptable: [2.1, -5.9] as [number, number],
  feed: [0, -6.9] as [number, number],
  /** The hatch down to Nana's cabin (it replaced the hut: the owner's wooden-ship deck, 2026-10-16). */
  hatch: [-2.6, .6] as [number, number],
  workbench: [2.75, .2] as [number, number],
  kitchen: [2.75, 2.4] as [number, number],
  pantry: [-2.6, 3.0] as [number, number],
  ropepost: [3.3, -2.9] as [number, number],
  fishspot: [0, 7.0] as [number, number],
  posts: [[-2.8, -3.9], [-3.1, -1.6], [2.1, 4.6], [-1.9, 5.3]] as [number, number][],
  /** Battle stations: two gongs rise from the deck in a raid (ring one to blast raiders toward the edge). */
  gongs: [[-1.9, -2.6], [1.9, 2.4]] as [number, number][],
  crewSpots: { nana: [-1.3, 4.6], pip: [0, -1.5], mina: [2.1, 3.3], tam: [1.9, 1.2], ria: [1.4, -5.2], olla: [0, 0], kai: [0, 0], coal: [0, 0] } as Record<CrewId, [number, number]>,
};
