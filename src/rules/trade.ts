import { FISH, ITEMS, LIKED_BONUS, MARKETS, MEALS, POST, RECIPES, type FishId, type IsleId, type ItemId, type MealId, type RecipeId } from './content.ts';
import { count, give, hasCrew, isRescued, take, type GameState } from './state.ts';
import type { Result } from './garden.ts';

const no = (why: string) => ({ ok: false as const, why });

// ----------------------------------------------------------------- markets
/** A market opens as soon as its keeper is rescued, even while the isle is still grey. */
export const marketOpen = (s: GameState, isle: IsleId) => { const m = MARKETS[isle]; return !!m && isRescued(s, m.owner); };
export function sellPrice(isle: IsleId, item: ItemId) {
  const def = ITEMS[item], m = MARKETS[isle];
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
  const price = MARKETS[isle]!.sells[item];
  if (!price) return no('Not sold here');
  if (s.glimmer < price * n) return no('Not enough glimmer');
  s.glimmer -= price * n;
  give(s, item, n);
  return { ok: true };
}

// --------------------------------------------------------------- workbench
const TRACK: Partial<Record<RecipeId, ['mallet' | 'coat', number]>> = { mallet2: ['mallet', 2], mallet3: ['mallet', 3], coat2: ['coat', 2], coat3: ['coat', 3] };
export type RecipeState = 'owned' | 'ready' | 'missing' | 'locked' | 'full';
export function recipeState(s: GameState, id: RecipeId): RecipeState {
  const r = RECIPES[id], track = TRACK[id];
  if (id === 'rope' && s.gear.rope) return 'owned';
  if (id === 'line' && s.gear.line) return 'owned';
  if (r.keepsake && s.keepsakes.includes(id)) return 'owned';
  // Fibre goes to the rope first (logic check 3, 4.5).
  if (r.needsRope && !s.gear.rope) return 'locked';
  if (track) {
    const [slot, tier] = track;
    if (s.gear[slot] >= tier) return 'owned';
    if (s.gear[slot] < tier - 1) return 'locked';
  }
  if (id === 'post' && s.posts.length >= POST.spots) return 'full';
  if (r.needsTam && !hasCrew(s, 'tam')) return 'locked';
  const enough = Object.entries(r.cost).every(([item, n]) => count(s, item as ItemId) >= (n ?? 0)) && s.glimmer >= r.glimmer;
  return enough ? 'ready' : 'missing';
}
export function craft(s: GameState, id: RecipeId, spot?: number): Result {
  const state = recipeState(s, id);
  if (state === 'owned') return no('Already made');
  if (state === 'locked') return no(lockReason(s, id));
  if (state === 'full') return no('Every post spot is taken');
  if (state === 'missing') return no('Missing materials');
  const r = RECIPES[id];
  for (const [item, n] of Object.entries(r.cost)) take(s, item as ItemId, n ?? 0);
  s.glimmer -= r.glimmer;
  const track = TRACK[id];
  if (track) s.gear[track[0]] = track[1];
  else if (id === 'rope') s.gear.rope = true;
  else if (id === 'line') s.gear.line = true;
  else if (r.keepsake) s.keepsakes.push(id);
  else if (id === 'post') {
    const free = [...Array(POST.spots).keys()].filter(i => !s.posts.includes(i));
    s.posts.push(spot !== undefined && free.includes(spot) ? spot : free[0]);
  }
  return { ok: true };
}

export function lockReason(s: GameState, id: RecipeId) {
  const r = RECIPES[id];
  if (r.needsRope && !s.gear.rope) return 'Make the Climbing Rope first';
  if (r.needsTam && !hasCrew(s, 'tam')) return 'Only Tam the Smith can make this';
  return 'Make the tier before it first';
}

// ------------------------------------------------------------------ kitchen
export const fishCount = (s: GameState) => FISH.reduce((n, f) => n + count(s, f), 0);
/** Cheapest fish first, so a Cloud Koi is the last to go into a stew. */
const fishByValue = () => [...FISH].sort((a, b) => ITEMS[a].sell - ITEMS[b].sell) as FishId[];
export function canCook(s: GameState, meal: MealId) {
  if (!hasCrew(s, 'mina')) return false;
  return Object.entries(MEALS[meal].cost).every(([item, n]) => item === 'fish' ? fishCount(s) >= (n ?? 0) : count(s, item as ItemId) >= (n ?? 0));
}
export function cook(s: GameState, meal: MealId): Result {
  if (!hasCrew(s, 'mina')) return no('Mina cooks once she is aboard');
  if (!canCook(s, meal)) return no('Missing ingredients');
  for (const [item, n] of Object.entries(MEALS[meal].cost)) {
    if (item !== 'fish') { take(s, item as ItemId, n ?? 0); continue; }
    let left = n ?? 0;
    for (const f of fishByValue()) { while (left > 0 && take(s, f)) left--; }
  }
  give(s, meal);
  return { ok: true };
}
