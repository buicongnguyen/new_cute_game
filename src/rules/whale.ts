import { ITEMS, STAGES, WHALE, type ItemId, type Stage } from './content.ts';
import { count, emptyPlot, take, type GameState } from './state.ts';
import type { Result } from './garden.ts';

const no = (why: string) => ({ ok: false as const, why });
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export const canFeed = (item: ItemId) => !!ITEMS[item].feed && (ITEMS[item].kind === 'whale' || ITEMS[item].kind === 'fish');

/** Bao always eats: hunger stops at 100, but growth XP and mood still count. */
export function feed(s: GameState, item: ItemId): Result<{ hunger: number; xp: number; mood: number }> {
  const f = ITEMS[item].feed;
  if (!f || !canFeed(item)) return no('Bao cannot eat that');
  if (!take(s, item)) return no('You have none');
  const before = s.whale.hunger;
  s.whale.hunger = clamp(s.whale.hunger + f.hunger, 0, WHALE.maxHunger);
  s.whale.xp += f.xp;
  s.whale.mood = clamp(s.whale.mood + f.mood, 0, WHALE.maxMood);
  s.story.flags.fed = true;
  return { ok: true, hunger: s.whale.hunger - before, xp: f.xp, mood: f.mood };
}

/** Feeds every piece of whale food carried (fish are kept for treats and cooking). */
export function feedAll(s: GameState) {
  let pieces = 0, xp = 0;
  for (const item of ['starfig', 'glowplum', 'puffberry'] as ItemId[]) {
    while (count(s, item) > 0) { const r = feed(s, item); if (!r.ok) break; pieces++; xp += r.xp; }
  }
  return { pieces, xp };
}

export function pet(s: GameState): Result<{ mood: number }> {
  if (s.playSeconds < s.whale.petAt) return no('Bao is still glowing from the last pat');
  s.whale.petAt = s.playSeconds + WHALE.petCooldown;
  s.whale.mood = clamp(s.whale.mood + WHALE.petMood, 0, WHALE.maxMood);
  s.story.flags.petted = true;
  return { ok: true, mood: WHALE.petMood };
}

export function brush(s: GameState): Result {
  if (s.whale.specks <= 0) return no('No specks to brush');
  s.whale.specks--;
  s.whale.mood = clamp(s.whale.mood + WHALE.brushMood, 0, WHALE.maxMood);
  s.glimmer += WHALE.brushGlimmer;
  s.story.flags.brushed = true;
  return { ok: true };
}

export const nextStage = (s: GameState) => s.whale.stage < 3 ? STAGES[s.whale.stage + 1] : null;
/** What Bao still needs to grow: growth XP and/or the stage's Note (null when it can grow, or is Great). */
export function growNeeds(s: GameState) {
  const next = nextStage(s);
  if (!next) return null;
  return { xp: Math.max(0, next.xp - s.whale.xp), note: next.note && !s.notes.includes(next.note) ? next.note : null };
}
export function canGrow(s: GameState) {
  const need = growNeeds(s);
  return !!need && need.xp === 0 && !need.note;
}
export function grow(s: GameState): Result<{ stage: Stage }> {
  if (!canGrow(s)) return no('Bao is not ready to grow');
  if (s.voyage) return no('Wait until Bao stops flying');
  s.whale.stage = (s.whale.stage + 1) as Stage;
  const plots = STAGES[s.whale.stage].plots;
  while (s.plots.length < plots) s.plots.push(emptyPlot());
  return { ok: true, stage: s.whale.stage };
}

/** Is Bao hanging over an isle the Gloom still holds? (Specks land fastest there.) */
export function atCrustedIsle(s: GameState) {
  return !s.voyage && s.place !== 'dawnreach' && !s.isles[s.place].freed;
}

/** Mood drift and specks during play. Returns true when a new speck landed. Nana brushes Bao while the Keeper is away. */
export function tickWhale(s: GameState, dt: number, onDeck = true) {
  const w = s.whale;
  if (!onDeck && w.specks > WHALE.specksAway) w.specks = WHALE.specksAway;
  w.moodTimer += dt;
  while (w.moodTimer >= WHALE.moodTick) {
    w.moodTimer -= WHALE.moodTick;
    const drift = w.mood > WHALE.driftTo ? -1 : w.mood < WHALE.driftTo ? 1 : 0;
    w.mood = clamp(w.mood + drift - w.specks, 0, WHALE.maxMood);
  }
  const [every, crusted] = atCrustedIsle(s) ? WHALE.specksCrusted : WHALE.specksCalm;
  const most = onDeck ? crusted : Math.min(crusted, WHALE.specksAway);
  if (w.specks >= most) { w.speckTimer = 0; return false; }
  w.speckTimer += dt;
  if (w.speckTimer < every) return false;
  w.speckTimer = 0; w.specks++;
  return true;
}
