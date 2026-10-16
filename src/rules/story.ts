import { CREW, HIVES, HIVE_OF, ISLE_IDS, ISLE_MAPS, ITEMS, PLACES, RAID, STAGES, TIERS, TREES, seedOf, type FormId, type IsleId, type NoteIsle } from './content.ts';
import { count, give, type GameState } from './state.ts';
import { growNeeds } from './whale.ts';
import { ownsTreeOrSeed } from './garden.ts';
import { freedIsles } from './voyage.ts';

export type Where = 'deck' | 'isle';
export type GoalTarget = 'plot' | 'ripe' | 'feed' | 'workbench' | 'maptable' | 'ropepost' | 'grow' | 'cage' | 'spire' | 'hive' | 'rope' | 'raid' | null;
export interface Goal { text: string; vars?: Record<string, string | number>; target: GoalTarget; index?: number }

/** The next isle of the story (the first one not yet freed), or null after the ending. */
export const storyIsle = (s: GameState): IsleId | null => ISLE_IDS.find(id => !s.isles[id].freed) ?? null;

/** The one next step, shown on the goal card. `where` is where the Keeper stands. */
export function goal(s: GameState, where: Where): Goal {
  if (s.voyage) {
    if (s.voyage.raidState === 'active') return { text: 'Defend Bao’s trees from the Gloom!', target: 'raid' };
    return { text: 'Bao is flying to {place}…', vars: { place: PLACES[s.voyage.to].name }, target: null };
  }
  if (!s.story.flags.planted) return { text: 'Plant a seed on a glowing moss patch', target: 'plot' };
  if (!s.story.flags.harvested) return { text: 'Wait for fruit, then pick it', target: 'ripe' };
  if (!s.story.flags.fed) return { text: 'Feed Bao at its head', target: 'feed' };
  if (!s.gear.rope) {
    if (count(s, 'fibre') < 3) return { text: 'Grow Ropevine for Fibre ({n}/3)', vars: { n: count(s, 'fibre') }, target: 'ripe' };
    return { text: 'Make a Climbing Rope at the Workbench', target: 'workbench' };
  }
  const isle = storyIsle(s);
  if (!isle) {
    const leftover = (['clover', 'reef', 'ember'] as IsleId[]).find(id => s.isles[id].leftover);
    if (leftover) return { text: 'Leftover Gloom on {place}', vars: { place: PLACES[leftover].name }, target: s.place === leftover ? (where === 'deck' ? 'ropepost' : null) : 'maptable' };
    return { text: 'Free play: tend the garden, fish and trade', target: null };
  }
  const place = PLACES[isle];
  if (s.whale.stage < place.needStage) {
    const need = growNeeds(s);
    if (need && need.xp > 0) return { text: 'Feed Bao to grow ({xp} growth left)', vars: { xp: need.xp }, target: 'feed' };
    return { text: 'Bao can grow! Tap Grow on Bao’s card', target: 'grow' };
  }
  if (s.place !== isle) return { text: 'Sail to {place} from the map table', vars: { place: place.name }, target: 'maptable' };
  if (where === 'deck') return { text: 'Slide down the rope to {place}', vars: { place: place.name }, target: 'ropepost' };
  const progress = s.isles[isle], map = ISLE_MAPS[isle];
  const cage = progress.cages.findIndex(c => !c);
  if (cage >= 0 && cage === 0) return { text: 'Free {who} from the crystal cage', vars: { who: CREW[map.cages[cage].who].name }, target: 'cage', index: cage };
  const spiresLeft = progress.spires.filter(b => !b).length;
  if (spiresLeft > 0) {
    const index = progress.spires.findIndex(b => !b);
    return { text: 'Break the Spires ({done}/{all})', vars: { done: progress.spires.length - spiresLeft, all: progress.spires.length }, target: 'spire', index };
  }
  if (cage >= 0) return { text: 'Free {who} from the crystal cage', vars: { who: CREW[map.cages[cage].who].name }, target: 'cage', index: cage };
  return { text: 'Break the {hive}!', vars: { hive: HIVES[HIVE_OF[isle]].name }, target: 'hive' };
}

/**
 * Nana's safety net (design §13): a run can never be stuck without seeds. She gives one free seed when you have
 * neither the tree, nor its seed, nor the glimmer to buy one; for Ropevine only while the rope is not made.
 */
export function nanaGift(s: GameState) {
  const gifts: string[] = [];
  // No whale-food tree, no whale-food seed and not enough glimmer for a Puffberry seed: a Puffberry seed.
  const whaleFood = (['puffberry', 'glowplum', 'starfig'] as const).some(id => ownsTreeOrSeed(s, id));
  if (!whaleFood && s.glimmer < TREES.puffberry.seedPrice) { give(s, seedOf('puffberry')); gifts.push('puffberry'); }
  if (!s.gear.rope && count(s, 'fibre') < 3 && !ownsTreeOrSeed(s, 'ropevine') && s.glimmer < TREES.ropevine.seedPrice) { give(s, seedOf('ropevine')); gifts.push('ropevine'); }
  s.story.nanaGifts += gifts.length;
  return gifts;
}

// -------------------------------------------------------------------- raids
export interface RaidPlan { waves: FormId[][]; tier: number; scale: number; from: IsleId }
/**
 * Raid waves: forms already met on the newest freed isle, at that isle's tier × 0.8. A scripted raid (after a song)
 * has two waves; a random one has one small wave.
 */
export function raidPlan(s: GameState, small = false): RaidPlan | null {
  const freed = freedIsles(s).filter(id => id !== 'star');
  if (!freed.length) return null;
  const from = freed[freed.length - 1];
  const kinds = [...new Set(ISLE_MAPS[from].groups.flatMap(g => g.forms))];
  const size = (small ? RAID.smallBase : RAID.base) + RAID.perIsle * freed.length;
  const waves = Array.from({ length: small ? 1 : RAID.waves }, (_, w) => Array.from({ length: size }, (_, i) => kinds[(i + w) % kinds.length]));
  return { waves, tier: PLACES[from].tier, scale: RAID.tierFactor, from };
}

export const noteName = (n: NoteIsle) => ({ clover: 'Note of Dawn', reef: 'Note of Tide', ember: 'Note of Ember' })[n];
export const stageName = (s: GameState) => STAGES[s.whale.stage].name;
export const recommendedLevel = (isle: IsleId) => TIERS[PLACES[isle].tier].level;
export const itemName = (id: keyof typeof ITEMS) => ITEMS[id].name;
