import type { Rng } from '../core/rng.ts';
import { FISH, FISHING, fishWaters, type FishId, type PlaceId } from './content.ts';
import { give, type GameState } from './state.ts';

/** Which fish bites, from the waters' weights (Star Ray and Cloud Koi ×1.5 with the Good Line). */
export function rollFish(rng: Rng, place: PlaceId, line: boolean): FishId {
  const weights = FISHING.weights[fishWaters(place)];
  const w = FISH.map(f => weights[f] * (line && (f === 'star_ray' || f === 'cloud_koi') ? FISHING.lineRare : 1));
  let roll = rng.next() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < FISH.length; i++) { roll -= w[i]; if (roll < 0) return FISH[i]; }
  return FISH[0];
}
export const biteWindow = (fish: FishId, line: boolean) => FISHING.window[fish] + (line ? FISHING.lineBonus : 0);
export const biteWait = (rng: Rng) => rng.range(FISHING.wait[0], FISHING.wait[1]);
/** Fish bite only while the school here has bites left; it refills one every 40 s of play (logic check 3, 3.3). */
export const schoolLeft = (s: GameState) => s.schools[s.place]?.left ?? 0;
export function takeBite(s: GameState) { const sc = s.schools[s.place]; if (!sc || sc.left <= 0) return false; sc.left--; return true; }
/** Every place's school refills while you play, wherever Bao is. */
export function tickSchool(s: GameState, dt: number) {
  for (const sc of Object.values(s.schools)) {
    if (sc.left >= FISHING.school) { sc.t = 0; continue; }
    sc.t += dt;
    if (sc.t >= FISHING.refill) { sc.t = 0; sc.left++; }
  }
}
export function landFish(s: GameState, fish: FishId) {
  give(s, fish);
  s.stats.fish++;
  s.story.flags.fished = true;
}
