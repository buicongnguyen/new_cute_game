/**
 * Seeded random-number streams. Route ALL gameplay randomness through a named stream
 * (spawns, loot, AI choices, scenery placement) so a seed reproduces a run, tests are
 * deterministic, and online players agree. Cosmetic effects get their own stream, so adding
 * a particle never changes where the loot drops. Never use Math.random or Date.now in
 * gameplay or effect timing; use game time.
 *
 *   const rng = new RngStreams('world-42');
 *   const loot = rng.stream('loot'); if (loot.chance(.08)) dropShard();
 */
export interface Rng {
  /** 0 ≤ n < 1 */
  next(): number;
  range(min: number, max: number): number;
  /** Integer in [min, maxExclusive). */
  int(min: number, maxExclusive: number): number;
  pick<T>(list: readonly T[]): T;
  chance(probability: number): boolean;
}

/** Four 32-bit seeds from any string (xmur3). */
export function seedFrom(text: string): [number, number, number, number] {
  let h = 1779033703 ^ text.length;
  for (let i = 0; i < text.length; i++) { h = Math.imul(h ^ text.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  const next = () => { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return (h ^= h >>> 16) >>> 0; };
  return [next(), next(), next(), next()];
}

/** sfc32: small, fast, good statistical quality. */
export function sfc32(a: number, b: number, c: number, d: number): () => number {
  return () => {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    const t = (a + b | 0) + d | 0;
    d = d + 1 | 0; a = b ^ (b >>> 9); b = c + (c << 3) | 0; c = (c << 21) | (c >>> 11); c = c + t | 0;
    return (t >>> 0) / 4294967296;
  };
}

export function makeRng(seed: string): Rng {
  const next = sfc32(...seedFrom(seed));
  for (let i = 0; i < 12; i++) next(); // warm up
  return {
    next,
    range: (min, max) => min + next() * (max - min),
    int: (min, maxExclusive) => min + Math.floor(next() * (maxExclusive - min)),
    pick: list => list[Math.floor(next() * list.length)],
    chance: probability => next() < probability,
  };
}

export class RngStreams {
  private streams = new Map<string, Rng>();
  readonly seed: string | number;
  constructor(seed: string | number) { this.seed = seed; }
  /** The same name always gives the same sequence for the same seed. */
  stream(name: string): Rng {
    let rng = this.streams.get(name);
    if (!rng) { rng = makeRng(`${this.seed}:${name}`); this.streams.set(name, rng); }
    return rng;
  }
}
