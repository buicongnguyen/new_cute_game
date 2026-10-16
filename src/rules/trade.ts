import { FISH, HOME, ITEMS, plotCount, LIKED_BONUS, MARKETS, MEALS, POST, RECIPES, SKILL_GAIN, UPGRADES, type FishId, type IsleId, type ItemId, type LandId, type MarketDef, type MealId, type RecipeId, type UpgradeId } from './content.ts';
import { count, emptyPlot, give, hasCrew, isRescued, take, type GameState } from './state.ts';
import { payout, perks, train } from './home.ts';
import type { Result } from './garden.ts';

const no = (why: string) => ({ ok: false as const, why });
const market = (isle: IsleId): MarketDef | undefined => MARKETS[isle as LandId];

// ----------------------------------------------------------------- markets
/** A market opens as soon as its keeper is rescued, even while the land is still grey. */
export const marketOpen = (s: GameState, isle: IsleId) => { const m = market(isle); return !!m && isRescued(s, m.owner); };
export function sellPrice(isle: IsleId, item: ItemId) {
  const def = ITEMS[item], m = market(isle);
  if (!m || def.sell <= 0) return 0;
  return Math.round(def.sell * (def.kind === m.likes ? LIKED_BONUS : 1));
}
export function sell(s: GameState, isle: IsleId, item: ItemId, n = 1): Result<{ glimmer: number }> {
  if (!marketOpen(s, isle)) return no('The market is closed');
  const price = sellPrice(isle, item);
  if (price <= 0) return no('Nobody buys that');
  const k = Math.min(n, count(s, item));
  if (k <= 0) return no('You have none');
  take(s, item, k);
  s.glimmer += price * k;
  return { ok: true, glimmer: price * k };
}
export function buy(s: GameState, isle: IsleId, item: ItemId, n = 1): Result {
  if (!marketOpen(s, isle)) return no('The market is closed');
  const price = market(isle)!.sells[item];
  if (!price) return no('Not sold here');
  if (s.glimmer < price * n) return no('Not enough glimmer');
  s.glimmer -= price * n;
  give(s, item, n);
  return { ok: true };
}
/** Skiff upgrades (Old Kai's market). */
export const hasUpgrade = (s: GameState, id: UpgradeId) => !!s.gear[id];
export function buyUpgrade(s: GameState, isle: IsleId, id: UpgradeId): Result {
  if (!marketOpen(s, isle)) return no('The market is closed');
  const price = market(isle)?.upgrades?.[id];
  if (!price) return no('Not sold here');
  if (hasUpgrade(s, id)) return no('Already made');
  if (s.glimmer < price) return no('Not enough glimmer');
  s.glimmer -= price; s.gear[id] = true;
  void UPGRADES;
  return { ok: true };
}

// --------------------------------------------------------------- workbench
const TRACK: Partial<Record<RecipeId, ['mallet' | 'coat' | 'deck' | 'drone', number]>> = { mallet2: ['mallet', 2], mallet3: ['mallet', 3], coat2: ['coat', 2], coat3: ['coat', 3], deck1: ['deck', 1], deck2: ['deck', 2], deck3: ['deck', 3], drone: ['drone', 1], drone2: ['drone', 2] };
/** Glimmer a recipe costs now: the craft room takes 20% off, and every Crafting level 3% more. */
export const recipeGlimmer = (s: GameState, id: RecipeId) => Math.round(RECIPES[id].glimmer * (s.rooms.craft ? HOME.craftDiscount : 1) * perks(s).craftCost);
export type RecipeState = 'owned' | 'ready' | 'missing' | 'locked' | 'full';
export function recipeState(s: GameState, id: RecipeId): RecipeState {
  const r = RECIPES[id], track = TRACK[id];
  if (id === 'rope' && s.gear.rope) return 'owned';
  if (id === 'line' && s.gear.line) return 'owned';
  if (r.keepsake && s.keepsakes.includes(id)) return 'owned';
  // Fibre goes to the rope first (logic check 3, 4.5).
  if (r.needsRope && !s.gear.rope) return 'locked';
  if (r.needsRoom && !s.rooms[r.needsRoom]) return 'locked';
  if (track) {
    const [slot, tier] = track;
    if (s.gear[slot] >= tier) return 'owned';
    if (s.gear[slot] < tier - 1) return 'locked';
  }
  if (id === 'post' && s.posts.length >= POST.spots) return 'full';
  if (r.needsTam && !hasCrew(s, 'tam')) return 'locked';
  const enough = Object.entries(r.cost).every(([item, n]) => count(s, item as ItemId) >= (n ?? 0)) && s.glimmer >= recipeGlimmer(s, id);
  return enough ? 'ready' : 'missing';
}
export function craft(s: GameState, id: RecipeId, spot?: number): Result<{ skill: number }> {
  const state = recipeState(s, id);
  if (state === 'owned') return no('Already made');
  if (state === 'locked') return no(lockReason(s, id));
  if (state === 'full') return no('Every post spot is taken');
  if (state === 'missing') return no('Missing materials');
  const r = RECIPES[id];
  for (const [item, n] of Object.entries(r.cost)) take(s, item as ItemId, n ?? 0);
  s.glimmer -= recipeGlimmer(s, id);
  const track = TRACK[id];
  if (track) { s.gear[track[0]] = track[1]; if (track[0] === 'deck') { while (s.plots.length < plotCount(s.whale.stage, s.gear.deck)) s.plots.push(emptyPlot()); } }
  else if (id === 'rope') s.gear.rope = true;
  else if (id === 'line') s.gear.line = true;
  else if (r.keepsake) s.keepsakes.push(id);
  else if (id === 'post') {
    const free = [...Array(POST.spots).keys()].filter(i => !s.posts.includes(i));
    s.posts.push(spot !== undefined && free.includes(spot) ? spot : free[0]);
  }
  return { ok: true, skill: train(s, 'craft', SKILL_GAIN.craft) };
}

export function lockReason(s: GameState, id: RecipeId) {
  const r = RECIPES[id];
  if (r.needsRope && !s.gear.rope) return 'Make the Climbing Rope first';
  if (r.needsRoom && !s.rooms[r.needsRoom]) return 'Repair the craft room first';
  if (r.needsTam && !hasCrew(s, 'tam')) return 'Only Tam the Smith can make this';
  return 'Make the tier before it first';
}

// ------------------------------------------------------------------ kitchen
export const fishCount = (s: GameState) => FISH.reduce((n, f) => n + count(s, f), 0);
/** Cheapest fish first, so a Cloud Koi is the last to go into a stew. */
const fishByValue = () => [...FISH].sort((a, b) => ITEMS[a].sell - ITEMS[b].sell) as FishId[];
/** Why a meal cannot be cooked (null when it can be). The repaired kitchen cooks the Pear Tart; Mina teaches the rest. */
export function cookBlock(s: GameState, meal: MealId) {
  if (!s.rooms.kitchen) return 'Repair the kitchen first';
  if (MEALS[meal].mina && !hasCrew(s, 'mina')) return 'Mina will teach you this one';
  const enough = Object.entries(MEALS[meal].cost).every(([item, n]) => item === 'fish' ? fishCount(s) >= (n ?? 0) : count(s, item as ItemId) >= (n ?? 0));
  return enough ? null : 'Missing ingredients';
}
export const canCook = (s: GameState, meal: MealId) => cookBlock(s, meal) === null;
export function cook(s: GameState, meal: MealId): Result<{ portions: number; skill: number }> {
  const why = cookBlock(s, meal);
  if (why) return no(why);
  for (const [item, n] of Object.entries(MEALS[meal].cost)) {
    if (item !== 'fish') { take(s, item as ItemId, n ?? 0); continue; }
    let left = n ?? 0;
    for (const f of fishByValue()) { while (left > 0 && take(s, f)) left--; }
  }
  // Cooking: now and then a second portion.
  const portions = 1 + payout(s, 'portion', perks(s).portion);
  give(s, meal, portions);
  s.stats.cooked++;
  s.story.flags.cooked = true;
  return { ok: true, portions, skill: train(s, 'cook', SKILL_GAIN.cook) };
}
