import { CREW, HIVES, HIVE_OF, ISLE_IDS, ISLE_MAPS, ITEMS, LANDS, PLACES, RAID, ROOMS, STAGES, TIERS, TREES, isShip, seedOf, type FormId, type IsleId, type LandId, type NoteIsle } from './content.ts';
import { count, give, type GameState } from './state.ts';
import { growNeeds } from './whale.ts';
import { ownsTreeOrSeed } from './garden.ts';
import { freedLands } from './voyage.ts';

export type Where = 'deck' | 'isle' | 'house' | 'skiff';
export type GoalTarget = 'ladder' | 'plot' | 'ripe' | 'feed' | 'crate' | 'repair' | 'stove' | 'lift' | 'cast' | 'workbench' | 'maptable' | 'ropepost' | 'plank' | 'grow'
  | 'cage' | 'spire' | 'hive' | 'group' | 'captive' | 'rope' | 'raid' | null;
export interface Goal { text: string; vars?: Record<string, string | number>; target: GoalTarget; index?: number }

/** The Spire a cage stands beside (the nearest one), or -1 when the isle has none. */
export function nearestSpire(isle: IsleId, cage: number) {
  const map = ISLE_MAPS[isle], at = map.cages[cage].at;
  let best = -1, bd = Infinity;
  map.spires.forEach((sp, i) => { const d = Math.hypot(sp[0] - at[0], sp[1] - at[1]); if (d < bd) { bd = d; best = i; } });
  return best;
}

/** The next place of the story (the first land or ship not yet freed), or null after the ending. */
export const storyIsle = (s: GameState): IsleId | null => ISLE_IDS.find(id => !s.isles[id].freed) ?? null;

/** The one next step, shown on the goal card. `where` is where the Captain stands. */
export function goal(s: GameState, where: Where): Goal {
  if (s.voyage) {
    if (s.voyage.raidState === 'active') return { text: 'Knock the raiders overboard and keep them off the hatch!', target: 'raid' };
    return { text: 'Bao is flying to {place}…', vars: { place: PLACES[s.voyage.to].name }, target: null };
  }
  const f = s.story.flags;
  // Chapter 1: wake up, Captain.
  if (!f.onDeck) return { text: 'Climb the ladder up to the deck', target: 'ladder' };
  if (!f.petted) return { text: 'Give Bao a pat at the bow', target: 'feed' };
  // Chapter 2: the ship's economy, one step at a time.
  if (!f.planted) return { text: 'Plant a seed in a planter box', target: 'plot' };
  if (!f.harvested) return { text: 'Wait for fruit, then pick it', target: 'ripe' };
  if (!f.fed) return { text: 'Feed Bao at the bow', target: 'feed' };
  if (!f.shipped) return { text: 'Put something spare in the shipping crate', target: 'crate' };
  if (!s.rooms.kitchen) {
    const r = ROOMS.kitchen, fibre = r.cost.fibre ?? 0;
    if (count(s, 'fibre') < fibre) return { text: 'Grow Ropevine for Fibre ({n}/{all})', vars: { n: count(s, 'fibre'), all: fibre }, target: 'ripe' };
    if (s.glimmer < r.glimmer) return { text: 'Ship goods in the crate for glimmer ({n}/{all})', vars: { n: s.glimmer, all: r.glimmer }, target: 'crate' };
    return { text: 'Repair the kitchen below deck', target: 'repair' };
  }
  // The first Pear Tart (skipped if Nana's lunch was eaten or sold: it is a lesson, never a lock).
  if (!f.cooked && count(s, 'cloudpear') >= 2) return { text: 'Cook a Pear Tart at the kitchen stove', target: 'stove' };
  if (!f.fished) return where === 'skiff' ? { text: 'Cast your line, then reel in a fish', target: 'cast' } : { text: 'Take the lift down to the skiff and catch a fish', target: 'lift' };
  if (!s.gear.rope) {
    if (where === 'skiff') return { text: 'Pull the rope to go back up to Bao', target: 'lift' };
    if (count(s, 'fibre') < 3) return { text: 'Grow Ropevine for Fibre ({n}/{all})', vars: { n: count(s, 'fibre'), all: 3 }, target: 'ripe' };
    return { text: 'Make a Climbing Rope at the Workbench', target: 'workbench' };
  }
  // Standing on a land or ship that is already free: the next step is always back to Bao (logic review 6).
  if (where === 'isle' && s.place !== 'dawnreach' && s.isles[s.place].freed && !s.isles[s.place].leftover) {
    return isShip(s.place) ? { text: 'Walk back over the plank to Bao', target: 'rope' } : { text: 'Climb the rope or blow the conch to go back up to Bao', target: 'rope' };
  }
  const isle = storyIsle(s);
  if (!isle) {
    const leftover = LANDS.find(id => s.isles[id].leftover);
    if (leftover) return { text: 'Leftover Gloom on {place}', vars: { place: PLACES[leftover].name }, target: s.place === leftover ? (where === 'isle' ? null : 'ropepost') : 'maptable' };
    return { text: 'Free play: tend the garden, fish and trade', target: null };
  }
  const place = PLACES[isle];
  if (s.whale.stage < place.needStage) {
    const need = growNeeds(s);
    if (need && need.xp > 0) return { text: 'Feed Bao to grow ({xp} growth left)', vars: { xp: need.xp }, target: 'feed' };
    return { text: 'Bao can grow! Tap Grow on Bao’s card', target: 'grow' };
  }
  if (s.place !== isle) return { text: 'Sail to {place} from the map table', vars: { place: place.name }, target: 'maptable' };
  const progress = s.isles[isle], map = ISLE_MAPS[isle];
  if (isShip(isle)) {
    if (where !== 'isle') return { text: 'Board {place} over the plank', vars: { place: place.name }, target: 'plank' };
    const left = progress.groups.filter(b => !b).length;
    if (left) return { text: 'Knock the raiders overboard ({done}/{all})', vars: { done: progress.groups.length - left, all: progress.groups.length }, target: 'group', index: progress.groups.findIndex(b => !b) };
    const caged = progress.captives.filter(b => !b).length;
    if (caged) return { text: 'Free the families in the hold ({done}/{all})', vars: { done: progress.captives.length - caged, all: progress.captives.length }, target: 'captive', index: progress.captives.findIndex(b => !b) };
    return { text: 'Beat {hive}!', vars: { hive: HIVES[HIVE_OF[isle]].name }, target: 'hive' };
  }
  if (where !== 'isle') return { text: 'Slide down the rope to {place}', vars: { place: place.name }, target: 'ropepost' };
  const free = (i: number): Goal => ({ text: 'Free {who} from the crystal cage', vars: { who: CREW[map.cages[i].who].name }, target: 'cage', index: i });
  // The camp person by the landing first; then each Spire in turn, and right after it the cage that stands by it
  // (logic review 20: no walking back for Pip or Tam after the far Spire; Juno's workshop opens with its Spire).
  if (!progress.cages[0] && map.cages.length) return free(0);
  const spiresLeft = progress.spires.filter(b => !b).length;
  for (let i = 1; i < map.cages.length; i++) if (!progress.cages[i] && progress.spires[nearestSpire(isle, i)]) return free(i);
  if (spiresLeft > 0) {
    const index = progress.spires.findIndex(b => !b);
    return { text: 'Break the Spires ({done}/{all})', vars: { done: progress.spires.length - spiresLeft, all: progress.spires.length }, target: 'spire', index };
  }
  const cage = progress.cages.findIndex(c => !c);
  if (cage >= 0) return free(cage);
  return { text: 'Break the {hive}!', vars: { hive: HIVES[HIVE_OF[isle]].name }, target: 'hive' };
}

/**
 * Nana's safety net (design §13): a run can never be stuck without seeds. She gives one free seed when you have
 * neither the tree, nor its seed, nor the glimmer to buy one; for Ropevine only while the rope or the kitchen needs Fibre.
 */
export function nanaGift(s: GameState) {
  const gifts: string[] = [];
  // No whale-food tree, no whale-food seed and not enough glimmer for a Puffberry seed: a Puffberry seed.
  const whaleFood = (['puffberry', 'glowplum', 'starfig'] as const).some(id => ownsTreeOrSeed(s, id));
  if (!whaleFood && s.glimmer < TREES.puffberry.seedPrice) { give(s, seedOf('puffberry')); gifts.push('puffberry'); }
  if ((!s.gear.rope || !s.rooms.kitchen) && count(s, 'fibre') < 3 && !ownsTreeOrSeed(s, 'ropevine') && s.glimmer < TREES.ropevine.seedPrice) { give(s, seedOf('ropevine')); gifts.push('ropevine'); }
  s.story.nanaGifts += gifts.length;
  return gifts;
}

// -------------------------------------------------------------------- raids
export interface RaidPlan { waves: FormId[][]; tier: number; scale: number; from: IsleId }
/**
 * Raid waves: forms already met on the newest freed land, at that land's tier × 0.8. A scripted raid (after a song)
 * has two waves; a random one has one small wave.
 */
export function raidPlan(s: GameState, small = false): RaidPlan | null {
  const freed = freedLands(s);
  if (!freed.length) return null;
  const from = freed[freed.length - 1];
  const kinds = [...new Set(ISLE_MAPS[from].groups.flatMap(g => g.forms))];
  const size = Math.min(RAID.most, (small ? RAID.smallBase : RAID.base) + RAID.perIsle * freed.length);
  const waves = Array.from({ length: small ? 1 : RAID.waves }, (_, w) => Array.from({ length: size }, (_, i) => kinds[(i + w) % kinds.length]));
  return { waves, tier: PLACES[from].tier, scale: RAID.tierFactor, from };
}

export const NOTE_NAMES: Record<LandId, string> = { clover: 'Note of Dawn', reef: 'Note of Tide', ember: 'Note of Ember', frost: 'Note of Frost' };
export const noteName = (n: NoteIsle) => NOTE_NAMES[n];
export const stageName = (s: GameState) => STAGES[s.whale.stage].name;
export const recommendedLevel = (isle: IsleId) => TIERS[PLACES[isle].tier].level;
export const itemName = (id: keyof typeof ITEMS) => ITEMS[id].name;
