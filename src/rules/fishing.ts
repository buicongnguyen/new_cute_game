import type { Rng } from '../core/rng.ts';
import { BAIT, FISH, FISHING, SKILL_GAIN, fishWaters, type FishId, type PlaceId } from './content.ts';
import { give, type GameState } from './state.ts';
import { perks, train } from './home.ts';

/** Which fish bites, from the waters' weights (Star Ray and Cloud Koi ×1.5 with the Good Line, and more with Fishing). */
export function rollFish(rng: Rng, place: PlaceId, line: boolean, rare = 1): FishId {
  const weights = FISHING.weights[fishWaters(place)];
  const w = FISH.map(f => weights[f] * (f === 'star_ray' || f === 'cloud_koi' ? (line ? FISHING.lineRare : 1) * rare : 1));
  let roll = rng.next() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < FISH.length; i++) { roll -= w[i]; if (roll < 0) return FISH[i]; }
  return FISH[0];
}
/** The Reel window: the fish's own, +0.35 s with the Good Line, + the Fishing perk. */
export const biteWindow = (fish: FishId, line: boolean, bonus = 0) => FISHING.window[fish] + (line ? FISHING.lineBonus : 0) + bonus;
/** Seconds until a bite (sooner with Kai's bait pot). */
export const biteWait = (rng: Rng, bait = false) => rng.range(FISHING.wait[0], FISHING.wait[1]) * (bait ? BAIT.wait : 1);
/** The Captain's own numbers for a cast. */
export const castFor = (s: GameState) => { const p = perks(s); return { line: s.gear.line, bait: s.gear.bait, window: p.biteWindow, rare: p.rare }; };
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
/** A landed fish; returns the new Fishing level when it went up, else 0. */
export function landFish(s: GameState, fish: FishId) {
  give(s, fish);
  s.stats.fish++;
  s.story.flags.fished = true;
  return train(s, 'fish', SKILL_GAIN.catch);
}
