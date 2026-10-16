/**
 * Every number in the game, as data. docs/DESIGN.md is the human-readable copy of this file; keep both in step.
 * Names are English source strings: the UI passes them through t() (src/i18n.ts), which looks up the Vietnamese pack.
 */

/** Story v2 (the owner's five chapters): four lands with a Note each, then the Gloom's three ships. */
export type LandId = 'clover' | 'reef' | 'ember' | 'frost';
export type ShipId = 'sloop' | 'warship' | 'star';
export type IsleId = LandId | ShipId;
export type PlaceId = 'dawnreach' | IsleId;
/** The four lands that hold a Note. */
export type NoteIsle = LandId;
export const NOTE_ISLES: readonly NoteIsle[] = ['clover', 'reef', 'ember', 'frost'];
export const LANDS: readonly LandId[] = NOTE_ISLES;
export const SHIPS: readonly ShipId[] = ['sloop', 'warship', 'star'];
export const isShip = (id: string): id is ShipId => (SHIPS as readonly string[]).includes(id);
export const isLand = (id: string): id is LandId => (LANDS as readonly string[]).includes(id);
export type Stage = 0 | 1 | 2 | 3;
export type TreeId = 'sproutbean' | 'puffberry' | 'ropevine' | 'cloudpear' | 'chimewood' | 'honeybun' | 'glowplum' | 'starfig' | 'golden';
export type FishId = 'puff_minnow' | 'sun_carp' | 'star_ray' | 'cloud_koi';
export type MealId = 'pear_tart' | 'fish_bun' | 'sky_stew';
export type ProduceId = 'spark' | 'bean' | 'puffberry' | 'glowplum' | 'starfig' | 'cloudpear' | 'honeybun' | 'fibre' | 'chimewood' | 'ore';
export type SeedId = `seed_${TreeId}`;
export type ItemId = ProduceId | FishId | MealId | SeedId | 'cocoa';
export type ItemKind = 'whale' | 'people' | 'craft' | 'fish' | 'meal' | 'seed';
export type CrewId = 'nana' | 'pip' | 'olla' | 'kai' | 'mina' | 'coal' | 'tam' | 'ria' | 'bram' | 'juno';
export type FormId = 'gloomling' | 'spitter' | 'brute' | 'flyer' | 'shellback' | 'puffcap';
export type HiveId = 'thornhive' | 'clamhive' | 'forgehive' | 'hushbell' | 'barnacle' | 'coilwyrm' | 'greyheart';

// ------------------------------------------------------------------ whale
export const STAGES = [
  { name: 'Calf', xp: 0, note: null, plots: 4, scale: 1 },
  { name: 'Young', xp: 120, note: 'clover', plots: 6, scale: 1.3 },
  { name: 'Adult', xp: 380, note: 'reef', plots: 8, scale: 1.55 },
  { name: 'Great', xp: 760, note: 'ember', plots: 10, scale: 1.8 },
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
  /** While the Captain is away from Bao, Nana brushes all but this many specks. */
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
  cocoa: { name: 'Warm Cocoa', kind: 'people', sell: 6, eat: { heal: 70 } },
  /** The quick early crop: no food, only coin (the crate, the markets) and the first deck extension. */
  bean: { name: 'Sprout Bean', kind: 'craft', sell: 3 },
  /** Glowing bits that drop now and then at a harvest and float in the sky round Bao: they build the Sky Scooter. */
  spark: { name: 'Sky Spark', kind: 'craft', sell: 4 },
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
  seed_sproutbean: { name: 'Sprout Bean seed', kind: 'seed', sell: 0 },
};
export const FISH: readonly FishId[] = ['puff_minnow', 'sun_carp', 'star_ray', 'cloud_koi'];
export const seedOf = (tree: TreeId) => `seed_${tree}` as SeedId;

// ------------------------------------------------------------------- trees
export interface TreeDef { name: string; kind: 'whale' | 'people' | 'craft' | 'decor'; grow: number; regrow: number; yield: [ProduceId, number] | null; seedPrice: number }
export const TREES: Record<TreeId, TreeDef> = {
  sproutbean: { name: 'Sprout Bean', kind: 'craft', grow: 15, regrow: 12, yield: ['bean', 2], seedPrice: 3 },
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
/**
 * `after`: a ship of the Gloom fleet is reached only once the ship before it is beaten. The fleet shows itself (and
 * can be sailed to) once Bao knows all four Notes: the Deep Song.
 */
export interface PlaceDef { name: string; kind: 'start' | 'land' | 'ship'; pos: [number, number]; needStage: Stage; needNotes: number; tier: number; gate: string | null; hue: string; after?: ShipId }
export const PLACES: Record<PlaceId, PlaceDef> = {
  dawnreach: { name: 'Dawnreach', kind: 'start', pos: [0, 0], needStage: 0, needNotes: 0, tier: 0, gate: null, hue: '#7cc8ff' },
  clover: { name: 'Clover Rise', kind: 'land', pos: [13, -9], needStage: 0, needNotes: 0, tier: 0, gate: null, hue: '#7bd54a' },
  reef: { name: 'Lantern Reef', kind: 'land', pos: [-14, -28], needStage: 1, needNotes: 0, tier: 1, gate: 'Wind Wall', hue: '#2fd0c8' },
  ember: { name: 'Ember Peaks', kind: 'land', pos: [16, -46], needStage: 2, needNotes: 0, tier: 2, gate: 'Storm Belt', hue: '#ff6a2a' },
  frost: { name: 'Frostfall', kind: 'land', pos: [-15, -62], needStage: 3, needNotes: 0, tier: 3, gate: 'Frost Veil', hue: '#8fd8ff' },
  sloop: { name: 'The Scout Sloop', kind: 'ship', pos: [14, -74], needStage: 3, needNotes: 4, tier: 3, gate: null, hue: '#b26bff' },
  warship: { name: 'The Warship', kind: 'ship', pos: [-8, -80], needStage: 3, needNotes: 4, tier: 4, gate: null, hue: '#b26bff', after: 'sloop' },
  star: { name: 'The Grey Star', kind: 'ship', pos: [3, -98], needStage: 3, needNotes: 4, tier: 4, gate: 'Deep Mist', hue: '#7a5cff', after: 'warship' },
};
export const PLACE_IDS = Object.keys(PLACES) as PlaceId[];
/** What Bao flies over near each place (the owner): forest, sea, or high above the cloud tops. */
export const BELOW: Record<PlaceId, 'clouds' | 'forest' | 'sea'> = { dawnreach: 'clouds', clover: 'forest', reef: 'sea', ember: 'forest', frost: 'sea', sloop: 'clouds', warship: 'clouds', star: 'clouds' };
export const ISLE_IDS: readonly IsleId[] = ['clover', 'reef', 'ember', 'frost', 'sloop', 'warship', 'star'];
/** Fullness spent per league (×0.85 with the Study repaired); a hungry flight is twice as slow. */
export const VOYAGE = { base: 24, perLeague: .9, max: 75, costPerLeague: 2, hungrySlow: 2, raidAt: .4, randomRaid: .2, dewEvery: 6, dew: { hunger: 1, mood: 1, glimmer: 1 }, treasure: 15 } as const;

// ------------------------------------------------------------------- keeper
/** Cumulative XP for levels 2..20 (index 0 = level 2). */
export const LEVEL_XP = [40, 100, 190, 300, 440, 600, 800, 1040, 1320, 1650, 2080, 2600, 3200, 3900, 4800, 5900, 7200, 8700, 10400] as const;
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

// ------------------------------------------------------------ home repairs
/**
 * Nana's cottage below deck starts dusty: the kitchen, craft room, study and bathroom are boarded up (chapter 1).
 * Each repair costs materials and glimmer and opens a job (chapter 2: the ship's economy).
 */
export type RoomId = 'kitchen' | 'craft' | 'study' | 'bath';
export interface RoomDef { name: string; cost: Partial<Record<ItemId, number>>; glimmer: number; job: string }
export const ROOMS: Record<RoomId, RoomDef> = {
  kitchen: { name: 'Kitchen', cost: { fibre: 3 }, glimmer: 15, job: 'Cook meals at the stove' },
  craft: { name: 'Craft room', cost: { chimewood: 4 }, glimmer: 40, job: 'Workbench glimmer costs 20% less; the Good Line and keepsakes' },
  study: { name: 'Study', cost: { chimewood: 2, fibre: 4 }, glimmer: 60, job: 'Voyages cost 15% less fullness; the globe and the journal desk' },
  bath: { name: 'Bathroom', cost: { ore: 2 }, glimmer: 80, job: 'A bath after a nap makes you Fresh: +15% damage for 5 minutes' },
};
export const ROOM_IDS = Object.keys(ROOMS) as RoomId[];
export const HOME = { craftDiscount: .8, studyVoyage: .85, fresh: { power: 1.15, seconds: 300 } } as const;

// ---------------------------------------------------------------- skills
/**
 * Life skills (chapter 2): everything you do trains one, up to level 10, and every level gives a small perk.
 * Gardening from harvests, Fishing from catches, Cooking from meals, Crafting from making things and repairs.
 */
export type SkillId = 'garden' | 'fish' | 'cook' | 'craft';
export const SKILL_IDS: readonly SkillId[] = ['garden', 'fish', 'cook', 'craft'];
export const SKILL_NAMES: Record<SkillId, string> = { garden: 'Gardening', fish: 'Fishing', cook: 'Cooking', craft: 'Crafting' };
/** Cumulative skill XP for levels 2..10. */
export const SKILL_XP = [10, 25, 45, 70, 100, 140, 190, 250, 320] as const;
export const SKILL_MAX = SKILL_XP.length + 1;
export const SKILL_GAIN = { harvest: 2, catch: 4, cook: 5, craft: 6, repair: 10 } as const;
/** Per level above 1. */
export const SKILL_PERK = {
  garden: { speed: .02, bonus: .04 },
  fish: { window: .03, rare: .06 },
  cook: { heal: .04, extra: .05 },
  craft: { discount: .03 },
} as const;

// -------------------------------------------------------------- workbench
export type RecipeId = 'drone' | 'drone2' | 'deck1' | 'deck2' | 'deck3' | 'rope' | 'mallet2' | 'mallet3' | 'coat2' | 'coat3' | 'line' | 'post' | 'lanterns' | 'crown' | 'goldbell';
export interface RecipeDef { name: string; cost: Partial<Record<ItemId, number>>; glimmer: number; needsTam: boolean; effect: string; needsRope?: boolean; needsRoom?: RoomId; keepsake?: boolean }
export const RECIPES: Record<RecipeId, RecipeDef> = {
  // Building out the ship (the owner): wooden decks bolted round Bao's rim, more room and more planter boxes.
  deck1: { name: 'Side decks', cost: { bean: 6 }, glimmer: 20, needsTam: false, effect: 'Wider deck, +2 planter boxes' },
  deck2: { name: 'Bow and stern decks', cost: { chimewood: 4, fibre: 4 }, glimmer: 90, needsTam: false, effect: 'Longer deck, +2 planter boxes' },
  // The Sky Scooter (the owner): a little drone to fly freely round Bao, on a tether so never too far.
  drone: { name: 'Sky Scooter', cost: { spark: 5, fibre: 3 }, glimmer: 30, needsTam: false, effect: 'Fly around Bao (not too far)' },
  drone2: { name: 'Long-range Scooter', cost: { spark: 12, chimewood: 3 }, glimmer: 120, needsTam: false, effect: 'Fly twice as far from Bao' },
  deck3: { name: 'Grand deck', cost: { ore: 4, chimewood: 4 }, glimmer: 250, needsTam: false, effect: 'The biggest deck, +2 planter boxes' },
  rope: { name: 'Climbing Rope', cost: { fibre: 3 }, glimmer: 0, needsTam: false, effect: 'Go down to the lands' },
  mallet2: { name: 'Mallet II', cost: { chimewood: 4 }, glimmer: 30, needsTam: false, effect: 'Damage ×1.4' },
  mallet3: { name: 'Mallet III', cost: { chimewood: 6, ore: 6 }, glimmer: 150, needsTam: true, effect: 'Damage ×2.2' },
  coat2: { name: 'Coat II', cost: { fibre: 6 }, glimmer: 30, needsTam: false, effect: '+40 max HP', needsRope: true },
  coat3: { name: 'Coat III', cost: { fibre: 10, ore: 6 }, glimmer: 150, needsTam: true, effect: '+120 max HP' },
  line: { name: 'Good Line', cost: { fibre: 4 }, glimmer: 20, needsTam: false, effect: 'Longer bites, rarer fish', needsRope: true, needsRoom: 'craft' },
  post: { name: 'Chime Post', cost: { chimewood: 3 }, glimmer: 15, needsTam: false, effect: 'A raid tower on a post spot' },
  // Keepsakes only look lovely: a glimmer sink for the late game and after the ending.
  lanterns: { name: 'Lantern string', cost: { fibre: 4 }, glimmer: 80, needsTam: false, effect: 'Paper lanterns around Bao’s back', keepsake: true, needsRope: true, needsRoom: 'craft' },
  crown: { name: 'Flower crown for Bao', cost: { cloudpear: 2 }, glimmer: 150, needsTam: false, effect: 'Bao wears flowers', keepsake: true, needsRoom: 'craft' },
  goldbell: { name: 'Golden bell', cost: { ore: 4, chimewood: 4 }, glimmer: 300, needsTam: true, effect: 'Your mallet shines gold', keepsake: true },
};
export const RECIPE_IDS = Object.keys(RECIPES) as RecipeId[];
/** A post's ring deals this share of the Captain's ring damage and slows Gloom forms (×1.5 with Tam). */
export const POST = { spots: 4, share: .5, every: 1.2, radius: 3.5, tamBonus: 1.5, slow: .6, slowFor: 1 } as const;

/** The Pear Tart is cooked from the start (in the repaired kitchen); Mina teaches the other two. */
export const MEALS: Record<MealId, { cost: Partial<Record<ItemId | 'fish', number>>; mina: boolean }> = {
  pear_tart: { cost: { cloudpear: 2 }, mina: false },
  fish_bun: { cost: { honeybun: 1, fish: 1 }, mina: true },
  sky_stew: { cost: { cloudpear: 1, fish: 2 }, mina: true },
};
export const MEAL_IDS = Object.keys(MEALS) as MealId[];
/** Mina leaves a Fish Bun in your bag once every "day" of play (20 minutes). */
export const MINA = { every: 1200, meal: 'fish_bun' as MealId } as const;

// ------------------------------------------------------------ shipping crate
/** Sky-post finches carry crate goods away at the basic price: 75% of the sell price (at least 1). */
export const CRATE = { share: .75 } as const;

// ----------------------------------------------------------------- markets
/** Skiff upgrades sold at Old Kai's market. */
export type UpgradeId = 'bait';
export const UPGRADES: Record<UpgradeId, { name: string; effect: string }> = {
  bait: { name: 'Bait pot', effect: 'Fish bite sooner from the skiff' },
};
export const BAIT = { wait: .6 } as const;
export interface MarketDef { owner: CrewId; name: string; sells: Partial<Record<ItemId, number>>; likes: ItemKind; upgrades?: Partial<Record<UpgradeId, number>> }
export const MARKETS: Partial<Record<LandId, MarketDef>> = {
  clover: { owner: 'olla', name: 'Clover Market', likes: 'fish', sells: { seed_puffberry: 5, seed_ropevine: 6, seed_cloudpear: 10, seed_chimewood: 14, seed_glowplum: 28 } },
  reef: { owner: 'kai', name: 'Reef Market', likes: 'people', sells: { seed_puffberry: 5, seed_ropevine: 6, seed_honeybun: 18, seed_starfig: 55 }, upgrades: { bait: 60 } },
  ember: { owner: 'coal', name: 'Ember Market', likes: 'whale', sells: { seed_puffberry: 5, seed_ropevine: 6, ore: 16, starfig: 45 } },
  frost: { owner: 'bram', name: 'Frost Market', likes: 'craft', sells: { seed_puffberry: 5, seed_ropevine: 6, seed_chimewood: 14, cocoa: 15 } },
};
export const LIKED_BONUS = 1.5;

// -------------------------------------------------------------------- crew
export interface CrewDef { name: string; isle: LandId | null; joins: boolean; job: string; color: string }
export const CREW: Record<CrewId, CrewDef> = {
  nana: { name: 'Nana Sumi', isle: null, joins: true, job: 'First mate', color: '#c77dff' },
  pip: { name: 'Pip', isle: 'clover', joins: true, job: 'Gardener', color: '#7bd54a' },
  olla: { name: 'Mayor Olla', isle: 'clover', joins: false, job: 'Clover Market', color: '#ffc83a' },
  kai: { name: 'Old Kai', isle: 'reef', joins: false, job: 'Reef Market', color: '#35b6f2' },
  mina: { name: 'Mina', isle: 'reef', joins: true, job: 'Cook', color: '#ff7fa8' },
  coal: { name: 'Granny Coal', isle: 'ember', joins: false, job: 'Ember Market', color: '#8a8a9a' },
  tam: { name: 'Tam', isle: 'ember', joins: true, job: 'Smith', color: '#c77a3a' },
  ria: { name: 'Ria', isle: 'reef', joins: true, job: 'Lookout', color: '#ef3b3b' },
  bram: { name: 'Bram', isle: 'frost', joins: false, job: 'Frost Market', color: '#e8504a' },
  juno: { name: 'Juno', isle: 'frost', joins: true, job: 'Engineer', color: '#ff9a2a' },
};
/** Crew who can join a boarding mission (two at a time), and what each one does there. */
export type HelperId = 'pip' | 'mina' | 'tam' | 'ria';
export const HELPERS: Record<HelperId, { perk: string; damage: number; push: number; slow: boolean; heal: number }> = {
  pip: { perk: 'Shoves raiders toward the rails', damage: .35, push: 1.6, slow: false, heal: 0 },
  mina: { perk: 'Heals you a little every 10 s', damage: .3, push: 1, slow: false, heal: 10 },
  tam: { perk: 'Rings hard', damage: .6, push: 1, slow: false, heal: 0 },
  ria: { perk: 'Her rings slow raiders down', damage: .35, push: 1, slow: true, heal: 0 },
};
export const HELPER_IDS = Object.keys(HELPERS) as HelperId[];
export const HELPER = { every: 1.6, reach: 2.4, healEvery: 10, follow: 2.2, speed: 4.6 } as const;
/** Juno's chime cannon fires a ringing bell at the thickest crowd of Gloom forms (raids and boardings). */
export const CANNON = { every: 7, radius: 2.8, push: 2.6, damage: .8, soften: .1 } as const;
/** The lift down to the skiff (twice as fast with Juno). */
/** `drop`: metres under Bao's belly (the belly is 6.6 m × the stage scale below the deck). */
export const LIFT = { seconds: 2.4, juno: .5, drop: 4 } as const;
/** Nana's conch calls the rope down where you stand, except near a boss: its hush swallows the sound. */
export const CONCH = { arena: 13 } as const;

// ---------------------------------------------------------------- the Gloom
export interface FormDef { name: string; hp: number; damage: number; speed: number; xp: number; glimmer: number; radius: number; native: string }
export const FORMS: Record<FormId, FormDef> = {
  gloomling: { name: 'Gloomling', hp: 30, damage: 6, speed: 2.4, xp: 8, glimmer: 2, radius: .45, native: 'puffbun' },
  spitter: { name: 'Spitter', hp: 26, damage: 8, speed: 1.6, xp: 10, glimmer: 3, radius: .45, native: 'hopfrog' },
  brute: { name: 'Rammer', hp: 90, damage: 14, speed: 1.8, xp: 24, glimmer: 6, radius: .9, native: 'rockgoat' },
  flyer: { name: 'Flyer', hp: 40, damage: 10, speed: 3.2, xp: 14, glimmer: 4, radius: .5, native: 'skylark' },
  shellback: { name: 'Shellback', hp: 70, damage: 12, speed: 1.5, xp: 18, glimmer: 5, radius: .6, native: 'pebbleturtle' },
  puffcap: { name: 'Puffcap', hp: 40, damage: 10, speed: 2.0, xp: 14, glimmer: 4, radius: .5, native: 'mushpup' },
};
export const ATTACKS = {
  bump: { reach: 1.1, cooldown: 1.3, windup: .3 },
  shard: { windup: .6, speed: 9, range: 8, cooldown: 2.4 },
  charge: { windup: .8, length: 7, speed: 9, cooldown: 3.5 },
  dive: { windup: .7, radius: 1.6, cooldown: 3.2 },
  /** Shellback: a shield bash; its front shield takes 15% of a ring, and it turns slowly (rad/s), so step behind it. */
  bash: { reach: 1.3, windup: .45, cooldown: 1.8, front: .15, turn: 1.8 },
  /** Puffcap: swells when close, then bursts into a ring that knocks everything back (raiders too). */
  puff: { trigger: 2.2, windup: 1.2, radius: 2.6, push: 3.0, cooldown: 4.5 },
} as const;
export const SPIRE = { hp: 120, xp: 30, glimmer: 10, wakeEvery: 7, wakeRange: 13, maxAwake: 3 } as const;
export const TIERS = [
  { name: 'Clover', hp: 1, damage: .8, reward: 1, level: 1 },
  { name: 'Reef', hp: 1.9, damage: 1.5, reward: 1.6, level: 5 },
  { name: 'Ember', hp: 3, damage: 1.8, reward: 2.4, level: 9 },
  { name: 'Frost', hp: 3.7, damage: 2.1, reward: 2.8, level: 13 },
  { name: 'Fleet', hp: 4.4, damage: 2.4, reward: 3.2, level: 15 },
] as const;
export interface HiveDef { name: string; isle: IsleId; hp: number; xp: number; glimmer: number; radius: number; model: string }
export const HIVES: Record<HiveId, HiveDef> = {
  thornhive: { name: 'Thornhive', isle: 'clover', hp: 480, xp: 150, glimmer: 80, radius: 2.2, model: 'thornhive' },
  clamhive: { name: 'Clamhive', isle: 'reef', hp: 1500, xp: 300, glimmer: 160, radius: 2.6, model: 'clamhive' },
  forgehive: { name: 'Forgehive', isle: 'ember', hp: 3000, xp: 520, glimmer: 280, radius: 2.4, model: 'forgehive' },
  hushbell: { name: 'Hush Bell', isle: 'frost', hp: 3200, xp: 640, glimmer: 340, radius: 2.4, model: 'hushbell' },
  barnacle: { name: 'Captain Barnacle', isle: 'sloop', hp: 2800, xp: 560, glimmer: 360, radius: 1.8, model: 'captain_barnacle' },
  coilwyrm: { name: 'Coilwyrm', isle: 'warship', hp: 3400, xp: 700, glimmer: 420, radius: 2.4, model: 'coilwyrm' },
  greyheart: { name: 'Grey Heart', isle: 'star', hp: 5000, xp: 900, glimmer: 500, radius: 2.8, model: 'greyheart' },
};
export const HIVE_OF: Record<IsleId, HiveId> = { clover: 'thornhive', reef: 'clamhive', ember: 'forgehive', frost: 'hushbell', sloop: 'barnacle', warship: 'coilwyrm', star: 'greyheart' };
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
  /** The Hush Bell: a dome of silence over your spot (inside it the mallet makes no sound and does no damage). */
  hushDome: { windup: .9, radius: 3.2, seconds: 6 },
  frostRing: { damage: 16, windup: 1.0, radius: 8.5 },
  iceShards: { damage: 11, windup: .8, count: 6, speed: 9, spread: 1.3 },
  callPuffcaps: { count: 2 },
  /** Captain Barnacle: the anchor lands on a marked circle and sticks; the chain sweeps the deck (hop over it). */
  anchorThrow: { damage: 22, windup: 1.0, radius: 2.2 },
  chainSweep: { damage: 16, windup: 1.1, radius: 8.5 },
  callCrew: { count: 2 },
  /** The Coilwyrm: its head strikes a marked circle; it spits shards. */
  headStrike: { damage: 20, windup: .9, radius: 2.0 },
  spitShards: { damage: 12, windup: .7, count: 3, speed: 10, spread: .6 },
} as const;
export type HiveMove = keyof typeof HIVE_MOVES;
export const HIVE_PATTERNS: Record<HiveId, HiveMove[]> = {
  thornhive: ['thornRing', 'spikeLines', 'wake'],
  clamhive: ['pearlVolley', 'tideRing'],
  forgehive: ['slam', 'crackLines', 'callFlyers'],
  hushbell: ['hushDome', 'frostRing', 'iceShards', 'callPuffcaps'],
  barnacle: ['anchorThrow', 'chainSweep', 'anchorThrow', 'callCrew'],
  coilwyrm: ['headStrike', 'spitShards', 'headStrike', 'tideRing'],
  greyheart: ['thornRing', 'pearlVolley', 'slam', 'spikeLines', 'tideRing'],
};
/** Seconds between Hive moves. */
export const HIVE_PACE = 3.4;
/** The Clamhive gapes for 1.9 s after each move and shuts at the next wind-up (logic review 8: it was open 94% of the time). */
export const CLAM = { closedTaken: .15, openSeconds: 1.9 } as const;
/** The Hush Bell takes nothing while silent; ringing all three echo bells cracks the silence for 8 s (×1.25). */
export const HUSH = { crackSeconds: 8, crackTaken: 1.25 } as const;
/** Captain Barnacle's shell takes 40%; after an anchor throw it is stuck to its anchor for 3.5 s and takes 150%. */
export const BARNACLE = { taken: .4, stuckTaken: 1.5, stuck: 3.5 } as const;
/** The Coilwyrm is untouchable while coiled up; ringing the three knots on its coils (2 rings each) leaves it dizzy for 7 s (×1.4). */
export const WYRM = { knots: 3, knotRings: 2, dizzy: 7, dizzyTaken: 1.4 } as const;
/** The Grey Star's deck lists toward one rail and then the other, every 12 s, sliding everyone 0.9 m/s. */
export const LIST = { every: 12, drift: .9 } as const;
/** Each faint at a Hive cracks its crust a little (Bao hums from above): it comes back 10% weaker, at most 30%. */
export const HIVE_CRACK = { perFaint: .1, most: 3 } as const;
/** Bao sings every 20 s during the finale: the Heart's shield cracks for 5 s and the song heals the Captain. */
export const HEART = { shieldTaken: .4, songTaken: 1.4, songEvery: 20, songSeconds: 5, songHeal: 40 } as const;
export const RESCUE = { rings: 3, xp: 25, glimmer: 15 } as const;
/** A family freed from a Gloom ship's hold: XP and glimmer (× the tier's reward) and a thank-you gift. */
export const FAMILY = { xp: 30, glimmer: 30 } as const;
export const FAINT = { groupsReset: true } as const;
/**
 * Raids are ship battles (the owner, 2026-10-16): Gloom ships come alongside from different sides and raiders walk
 * over planks. Bao's battle stations sink every tree and fitting below the deck (fewer things to draw in a fight),
 * leaving only the tools: two gongs, any Chime Posts and Juno's cannon. Raiders head for the hatch; one standing on it
 * for `crustAfter` s crusts a tree stored below. Knocking a raider off the deck edge sends it overboard (it is freed
 * as it falls), the best way to win. Scripted raids: 2 waves of base + perIsle × lands freed; random raids: 1 wave of
 * smallBase + perIsle × lands freed.
 */
export const RAID = { waves: 2, base: 4, perIsle: 2, smallBase: 2, most: 10, tierFactor: .8, warn: 3, warnLookout: 10, ships: 2, boardEvery: .9, crustAfter: 5, aggro: 3, spitterAggro: 7, timeout: 100, winPerWave: 25,
  /** Knockback on a deck (metres per ring), Spin, and a rung gong's blast. */
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
export const fishWaters = (place: PlaceId) => place === 'reef' ? 'reef' : place === 'dawnreach' || place === 'clover' ? 'calm' : 'deep';

// --------------------------------------------------------------- isle maps
/** A group of Gloom forms standing around a point; `spire` names the Spire it guards (index), if any. */
export interface GroupDef { at: [number, number]; forms: FormId[]; spire?: number }
/** `locked`: the cage stands inside a place a Spire guards (Juno's workshop): it opens only once that Spire is broken. */
export interface CageDef { who: CrewId; at: [number, number]; locked?: number }
export interface CaptiveDef { at: [number, number]; gift: [ItemId, number] }
export interface IsleMap {
  radius: number; landing: [number, number]; market: [number, number] | null;
  groups: GroupDef[]; spires: [number, number][]; cages: CageDef[];
  hive: [number, number]; ore: [number, number][]; wild: [number, number][]; decor: { kind: string; at: [number, number]; rot?: number }[];
  /** Ships: families in crystal cages by the hold hatch. */
  captives: CaptiveDef[];
  /** The Hush Bell's three echo bells. */
  echo: [number, number][];
}
const G = (n: number, f: FormId) => Array<FormId>(n).fill(f);
/**
 * A Gloom ship (gloom.glb `gloom_beast` × 1.6): like Bao, a sky creature with a flat deck on its back (the owner: no
 * masts, nothing tall in the middle), crusted over by the Gloom. Its head points to +z; an oval deck (the owner) with a
 * rail all round and six gaps in it (angles from the bow toward starboard), where raiders can be knocked overboard.
 */
export const BEAST = { scale: 1.6, half: [10.9, 16] as const, gaps: [40, 90, 140, -40, -90, -140] as const, gapHalf: .12, hold: [0, 8] as [number, number] };
const ship = (groups: GroupDef[], hive: [number, number], gifts: [ItemId, number][]): IsleMap => ({
  radius: 18, landing: [-9.4, 0], market: null, groups, spires: [], cages: [], hive, ore: [], wild: [], decor: [], echo: [],
  captives: [{ at: [2.6, 8.4], gift: gifts[0] }, { at: [-2.6, 7.4], gift: gifts[1] }],
});
const land = (m: Omit<IsleMap, 'captives' | 'echo'> & { echo?: [number, number][] }): IsleMap => ({ captives: [], echo: [], ...m });
export const ISLE_MAPS: Record<IsleId, IsleMap> = {
  clover: land({
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
  }),
  reef: land({
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
  }),
  ember: land({
    radius: 36, landing: [0, 25], market: [-5.5, 22.5],
    groups: [
      { at: [-6, 12], forms: [...G(2, 'flyer'), ...G(3, 'gloomling')] },
      { at: [-14, 5], forms: ['brute', ...G(2, 'spitter'), 'flyer'], spire: 0 },
      { at: [14, 3], forms: [...G(2, 'brute'), 'shellback', 'flyer'], spire: 1 },
      { at: [2, -8], forms: [...G(2, 'spitter'), 'shellback', ...G(2, 'flyer'), 'brute'], spire: 2 },
    ],
    spires: [[-17, 2], [17, 0], [-2, -11]],
    cages: [{ who: 'coal', at: [5, 21] }, { who: 'tam', at: [-20, 9] }],
    hive: [0, -25], ore: [[-22, -6], [22, -8], [10, 14], [-10, -17]], wild: [],
    decor: [{ kind: 'forge', at: [-22, 11] }, { kind: 'forge', at: [18, 12], rot: 2 }],
  }),
  frost: land({
    radius: 36, landing: [0, 25], market: [5.5, 22.5],
    groups: [
      { at: [7, 13], forms: [...G(2, 'puffcap'), ...G(3, 'gloomling')] },
      { at: [-13, 6], forms: ['shellback', ...G(2, 'spitter'), 'puffcap'], spire: 0 },
      { at: [14, 2], forms: [...G(2, 'shellback'), ...G(2, 'flyer')], spire: 1 },
      { at: [-3, -9], forms: [...G(2, 'puffcap'), 'shellback', 'brute', 'spitter'], spire: 2 },
    ],
    spires: [[-16, 2], [17, -2], [-6, -12]],
    // Juno is locked in her workshop (the ice hut) behind the first Spire.
    cages: [{ who: 'bram', at: [-5, 21] }, { who: 'juno', at: [-19, -1.5], locked: 0 }],
    hive: [0, -25], ore: [[-23, -8], [22, -10]], wild: [],
    decor: [{ kind: 'ice_hut', at: [-21.5, -4.5], rot: .9 }, { kind: 'snow_lantern', at: [-6, 16] }, { kind: 'snow_lantern', at: [9, 7] }, { kind: 'snow_lantern', at: [-10, -4] }, { kind: 'snow_lantern', at: [10, -15] }],
    echo: [[-8.5, -21], [8.5, -21], [0, -34]],
  }),
  // The Gloom fleet (chapter 5): the deck is a fight across from the plank to the captain.
  sloop: ship([
    { at: [1.8, 3.2], forms: [...G(3, 'gloomling'), ...G(2, 'spitter')] },
    { at: [2.6, -6.5], forms: ['shellback', ...G(2, 'puffcap'), 'gloomling'] },
  ], [0, -10.8], [['seed_starfig', 1], ['ore', 3]]),
  warship: ship([
    { at: [2.2, 3.4], forms: [...G(2, 'spitter'), 'shellback', ...G(2, 'gloomling')] },
    { at: [-2.4, -10.2], forms: ['brute', ...G(2, 'flyer'), 'puffcap'] },
  ], [0, -3.2], [['cocoa', 2], ['seed_glowplum', 1]]),
  star: ship([
    { at: [2.0, 3.2], forms: [...G(3, 'gloomling'), ...G(2, 'puffcap')] },
    { at: [-2.4, -2.0], forms: [...G(2, 'brute'), 'flyer', 'shellback'] },
  ], [0, -9.8], [['cloud_koi', 1], ['seed_honeybun', 1]]),
};

// ------------------------------------------------------------ deck extensions
/**
 * Each extension widens the walkable oval (calf metres, added to DECK.half) and adds planter boxes. Like a growing
 * body, each one costs much more than the last and adds less room (the owner: growth by volume). A Great whale with
 * every extension has a deck of 2 × (13.7 × 18) m: it ends at the size of Zoo Garden's safe area (radius 18 m).
 */
export const EXTENSIONS = [
  { half: [0, 0], plots: 0 },
  { half: [1.6, 0], plots: 2 },
  { half: [2.6, 1.2], plots: 4 },
  { half: [3.2, 2.0], plots: 6 },
] as const;
export const SAFE_AREA = 18;

// ------------------------------------------------------------- the Sky Scooter
/**
 * A harvest drops a Sky Spark now and then (banked: one every 4 harvests). Sky Sparks also float in the sky round Bao,
 * where only the scooter reaches them. The tether keeps it within `range` metres of Bao (by scooter tier).
 */
export const DRONE = { speed: 9, height: 3, range: [0, 30, 55] as const, sparks: 10, respawn: 25, catch: 1.5, sparkChance: .25 } as const;
export const plotCount = (stage: Stage, deck: number) => STAGES[stage].plots + EXTENSIONS[Math.max(0, Math.min(3, deck))].plots;

// ------------------------------------------------------------- Bao's deck
/** Deck positions at calf size, metres; the head is toward −z. They spread out with the stage scale. */
export const DECK = {
  half: [4.4, 8.0] as const,
  /** Ten boxes for Bao's stages, then two on each deck extension (side wings, bow and stern, the grand deck). */
  plots: [[-1, -4.2], [1, -4.2], [-1, -2.4], [1, -2.4], [-1, 1.4], [1, 1.4], [-1, 3.2], [1, 3.2], [-1, -.6], [1, -.6], [-4.9, -1.2], [4.9, 1.8], [-1, 8.9], [1, 8.9], [-5.3, 3.8], [-1.6, -9.4]] as [number, number][],
  maptable: [2.1, -5.9] as [number, number],
  feed: [0, -6.9] as [number, number],
  /** The hatch down to Nana's cottage (it replaced the hut: the owner's wooden-ship deck, 2026-10-16). */
  hatch: [-2.6, .6] as [number, number],
  workbench: [2.75, .2] as [number, number],
  /** The shipping crate, where sky-post finches collect goods. */
  crate: [2.75, 2.4] as [number, number],
  pantry: [-2.6, 3.0] as [number, number],
  ropepost: [3.3, -2.9] as [number, number],
  /** The fishing lift on the starboard rail, down to the skiff. */
  lift: [3.75, 4.6] as [number, number],
  /** The Sky Scooter's landing pad on the port bow. */
  dronePad: [-2.4, -5.6] as [number, number],
  /** Juno's chime cannon at the stern. */
  cannon: [0, 6.5] as [number, number],
  /** Where Bao's boarding plank leaves the starboard rail when a Gloom ship is alongside. */
  plank: [4.0, -1.0] as [number, number],
  posts: [[-2.8, -3.9], [-3.1, -1.6], [2.0, 4.9], [-1.9, 5.3]] as [number, number][],
  /** Battle stations: two gongs rise from the deck in a raid (ring one to blast raiders toward the edge). */
  gongs: [[-1.9, -2.6], [1.9, 2.4]] as [number, number][],
  crewSpots: { nana: [-1.3, 4.6], pip: [0, -1.5], mina: [0, 4.9], tam: [1.9, 1.2], ria: [1.4, -5.2], juno: [-1.2, 6.1], olla: [0, 0], kai: [0, 0], coal: [0, 0], bram: [0, 0] } as Record<CrewId, [number, number]>,
};
