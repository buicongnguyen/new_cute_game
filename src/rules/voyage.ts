import type { Rng } from '../core/rng.ts';
import { ISLE_IDS, PLACES, VOYAGE, WHALE, type IsleId, type PlaceId } from './content.ts';
import { hasCrew, type GameState } from './state.ts';
import type { Result } from './garden.ts';

const no = (why: string) => ({ ok: false as const, why });

/** Why a gate stops Bao (fixed sentences, so they can be translated). */
export const GATE_WHY: Record<number, string> = {
  1: 'Bao must be a Young whale to pass the Wind Wall',
  2: 'Bao must be an Adult whale to pass the Storm Belt',
  3: 'Bao must be a Great whale to dive through the Deep Mist',
};

export function distance(a: PlaceId, b: PlaceId) {
  const [ax, ay] = PLACES[a].pos, [bx, by] = PLACES[b].pos;
  return Math.hypot(ax - bx, ay - by);
}

/** Can Bao sail to `to` now? The reason names the missing gate. */
export function canSail(s: GameState, to: PlaceId): Result {
  if (s.voyage) return no('Bao is already flying');
  if (to === s.place) return no('Bao is already here');
  if (to === 'dawnreach') return no('There is nothing left at Dawnreach');
  const place = PLACES[to];
  if (s.whale.stage < place.needStage) return no(GATE_WHY[place.needStage] ?? 'Bao must grow first');
  if (s.notes.length < place.needNotes) return no('Bao needs all three Notes to sing the Deep Song');
  return { ok: true };
}

export function voyagePlan(s: GameState, to: PlaceId) {
  const d = distance(s.place, to), cost = Math.round(d * VOYAGE.costPerLeague);
  const hungry = s.whale.hunger < cost;
  const duration = Math.min(VOYAGE.max, VOYAGE.base + VOYAGE.perLeague * d) * (hungry ? VOYAGE.hungrySlow : 1);
  return { distance: d, cost, hungry, duration };
}

export const freedIsles = (s: GameState) => ISLE_IDS.filter(id => s.isles[id].freed);
export const anyGrey = (s: GameState) => ISLE_IDS.some(id => !s.isles[id].freed);

export function startVoyage(s: GameState, to: PlaceId, rng: Rng): Result<{ hungry: boolean; duration: number }> {
  const check = canSail(s, to);
  if (!check.ok) return check;
  const plan = voyagePlan(s, to);
  if (plan.hungry) { s.whale.hunger = 0; s.whale.mood = Math.max(0, s.whale.mood + WHALE.hungryVoyageMood); }
  else s.whale.hunger -= plan.cost;
  const scripted = s.raidsOwed.length > 0;
  // Small random raids only after the Gloom has heard a song, while something is still grey, and never on the Deep Song dive.
  const random = !scripted && to !== 'star' && freedIsles(s).length > 0 && anyGrey(s) && rng.chance(VOYAGE.randomRaid);
  s.voyage = {
    from: s.place, to, elapsed: 0, duration: plan.duration, hungry: plan.hungry,
    raidAt: scripted || random ? plan.duration * VOYAGE.raidAt : null,
    raidState: scripted || random ? 'pending' : 'none', scripted,
    treasure: hasCrew(s, 'ria'), dewTimer: 0,
  };
  return { ok: true, hungry: plan.hungry, duration: plan.duration };
}

export type VoyageEvent = 'raid' | 'arrive' | 'dew' | null;
/** Advances the voyage. It waits while a raid is on. */
export function tickVoyage(s: GameState, dt: number): VoyageEvent {
  const v = s.voyage;
  if (!v) return null;
  if (v.raidState === 'active') return null;
  if (v.raidState === 'pending' && v.raidAt !== null && v.elapsed >= v.raidAt) {
    v.raidState = 'active';
    return 'raid';
  }
  v.elapsed += dt;
  if (v.elapsed >= v.duration) {
    s.place = v.to; s.voyage = null; s.stats.voyages++;
    if (s.place !== 'dawnreach') s.isles[s.place as IsleId].visited = true;
    return 'arrive';
  }
  v.dewTimer += dt;
  if (v.dewTimer >= VOYAGE.dewEvery) { v.dewTimer -= VOYAGE.dewEvery; return 'dew'; }
  return null;
}

/** A tapped sky-dew cloud. */
export function collectDew(s: GameState) {
  s.whale.hunger = Math.min(WHALE.maxHunger, s.whale.hunger + VOYAGE.dew.hunger);
  s.whale.mood = Math.min(WHALE.maxMood, s.whale.mood + VOYAGE.dew.mood);
  s.glimmer += VOYAGE.dew.glimmer;
}
export function collectTreasure(s: GameState) {
  if (!s.voyage?.treasure) return false;
  s.voyage.treasure = false; s.glimmer += VOYAGE.treasure;
  return true;
}

/** Ends the raid of the current voyage. */
export function endRaid(s: GameState, won: boolean, waves: number) {
  // The scripted raid is paid off only when it is over (a raid cut off by a reload comes back).
  if (s.voyage?.scripted && s.voyage.raidState === 'active') s.raidsOwed.shift();
  if (s.voyage) s.voyage.raidState = 'done';
  if (won) { s.glimmer += waves * 25; s.stats.raidsWon++; }
  else s.whale.mood = Math.max(0, s.whale.mood + WHALE.lostRaidMood);
}
