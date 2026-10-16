import { CRUST_RINGS, DRONE, GARDENER_EVERY, GARDENER_SPEED, ITEMS, TREES, moodFactor, seedOf, type ProduceId, type TreeId } from './content.ts';
import { count, emptyPlot, give, hasCrew, take, type GameState, type Plot } from './state.ts';
import { payout, perks, train, SKILL_GAIN } from './home.ts';

export type Result<T = object> = ({ ok: true } & T) | { ok: false; why: string };
const no = (why: string) => ({ ok: false as const, why });

/** Growth speed of every tree right now: Bao's mood, times 1.2 with Pip the Gardener aboard, times the Gardening perk. */
export const gardenSpeed = (s: GameState) => moodFactor(s.whale.mood) * (hasCrew(s, 'pip') ? GARDENER_SPEED : 1) * perks(s).growth;

/** Seconds of growth a plot needs for its current phase. */
export function plotNeed(p: Plot) {
  if (!p.tree) return 0;
  const tree = TREES[p.tree];
  return p.phase === 'regrow' ? tree.regrow : tree.grow;
}
/** 0..1 toward the next fruit (1 when ripe). */
export const plotProgress = (p: Plot) => p.phase === 'ripe' ? 1 : p.tree ? Math.min(1, p.progress / Math.max(1, plotNeed(p))) : 0;
/** Seconds of real time until ripe at the current speed (0 when ripe or empty). */
export function plotSecondsLeft(s: GameState, p: Plot) {
  if (!p.tree || p.phase === 'ripe' || p.phase === 'empty') return 0;
  return Math.max(0, (plotNeed(p) - p.progress) / gardenSpeed(s));
}
/** The look a plot's tree shows: sprout for the first third of its first growth, young after, grown once it has fruited. */
export function treeStage(p: Plot): 'none' | 'sprout' | 'young' | 'grown' {
  if (!p.tree || p.phase === 'empty') return 'none';
  if (p.phase !== 'growing') return 'grown';
  const k = plotProgress(p);
  return k < .34 ? 'sprout' : k < 1 ? 'young' : 'grown';
}

export function plant(s: GameState, index: number, tree: TreeId): Result {
  const plot = s.plots[index];
  if (!plot) return no('No moss patch there');
  if (plot.tree) return no('Something already grows here');
  if (!take(s, seedOf(tree))) return no('You have no seed for that');
  Object.assign(plot, { tree, phase: 'growing', progress: 0, crust: 0 });
  s.story.flags.planted = true;
  return { ok: true };
}

/** Uprooting gives the seed back, so trying a new layout is free. */
export function uproot(s: GameState, index: number): Result {
  const plot = s.plots[index];
  if (!plot?.tree) return no('Nothing grows here');
  give(s, seedOf(plot.tree));
  s.plots[index] = emptyPlot();
  return { ok: true };
}

export function harvest(s: GameState, index: number): Result<{ item: ProduceId; n: number; sparks: number; skill: number }> {
  const plot = s.plots[index];
  if (!plot?.tree) return no('Nothing grows here');
  if (plot.crust > 0) return no('Ring the crust off first');
  if (plot.phase !== 'ripe') return no('Not ripe yet');
  const yields = TREES[plot.tree].yield;
  if (!yields) return no('This tree only decorates');
  const [item, base] = yields;
  // Gardening: now and then a bonus fruit (banked exactly, no dice).
  const n = base + payout(s, 'fruit', perks(s).bonusFruit);
  give(s, item, n);
  // Now and then a Sky Spark drifts out of the leaves (banked, so exactly one every four harvests).
  const sparks = payout(s, 'spark', DRONE.sparkChance);
  if (sparks) give(s, 'spark', sparks);
  plot.phase = 'regrow'; plot.progress = 0;
  s.stats.harvested += n;
  s.story.flags.harvested = true;
  if (ITEMS[item].kind === 'craft') s.story.flags.craftHarvest = true;
  return { ok: true, item, n, sparks, skill: train(s, 'garden', SKILL_GAIN.harvest) };
}

/** Harvests every ripe tree; returns what was picked. */
export function harvestAll(s: GameState) {
  const got: Partial<Record<ProduceId, number>> = {};
  s.plots.forEach((p, i) => {
    if (p.phase !== 'ripe' || p.crust > 0) return;
    const r = harvest(s, i);
    if (r.ok) got[r.item] = (got[r.item] ?? 0) + r.n;
  });
  return got;
}

/** Advances growth by `seconds` (also used for the time the game was closed: mood is frozen then). */
export function growGarden(s: GameState, seconds: number) {
  if (seconds <= 0) return [] as number[];
  const speed = gardenSpeed(s), ripened: number[] = [];
  s.plots.forEach((p, i) => {
    if (!p.tree || p.crust > 0 || (p.phase !== 'growing' && p.phase !== 'regrow')) return;
    p.progress += seconds * speed;
    if (p.progress >= plotNeed(p)) { p.progress = plotNeed(p); p.phase = 'ripe'; ripened.push(i); }
  });
  return ripened;
}

/**
 * Pip harvests ripe trees into the pantry every few seconds, but only while the Keeper is on Bao: while you are away
 * (down on an isle, or the game is closed) each tree ripens once and waits (logic check 3, 3.2).
 */
export function tickGardener(s: GameState, dt: number, onDeck = true) {
  if (!hasCrew(s, 'pip') || !onDeck) return null;
  s.timers.gardener += dt;
  if (s.timers.gardener < GARDENER_EVERY) return null;
  s.timers.gardener = 0;
  const got = harvestAll(s);
  return Object.keys(got).length ? got : null;
}

export function crustTree(s: GameState, index: number) {
  const plot = s.plots[index];
  if (!plot?.tree || plot.crust > 0) return false;
  plot.crust = CRUST_RINGS;
  // A crusted tree loses the fruit it was holding (logic check 3, 6.4).
  if (plot.phase === 'ripe') { plot.phase = 'regrow'; plot.progress = 0; }
  return true;
}
/** One ring on a crusted tree; true when it is clean again. */
export function ringCrust(s: GameState, index: number) {
  const plot = s.plots[index];
  if (!plot || plot.crust <= 0) return false;
  plot.crust--;
  return plot.crust === 0;
}

/** A raider stood on the hatch long enough: one tree stored below deck gets crusted (the first clean one). */
export function crustStored(s: GameState) {
  const i = s.plots.findIndex(p => p.tree && p.crust === 0);
  return i >= 0 && crustTree(s, i) ? i : -1;
}

export const plantedCount = (s: GameState, tree: TreeId) => s.plots.filter(p => p.tree === tree).length;
export const ownsTreeOrSeed = (s: GameState, tree: TreeId) => plantedCount(s, tree) > 0 || count(s, seedOf(tree)) > 0;
