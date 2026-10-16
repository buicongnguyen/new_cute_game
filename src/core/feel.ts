/**
 * Feel helpers with the numbers from the research (references/feel.md):
 *
 * - `damp`: frame-rate-independent "move toward". Never `x += (t - x) * k` per frame; at
 *   60 fps a per-frame k of 0.01 / 0.1 / 0.5 equals λ ≈ 0.6 / 6.3 / 42 per second.
 * - `Trauma`: screen shake = trauma² × smooth noise, trauma decays linearly (~0.8–1 per s).
 *   Add +0.2 for small hits, +0.5 for big ones. In 3D shake rotation only (≈2° yaw/pitch,
 *   4° roll max), as an additive layer after the camera rig. Offer a 0–1 slider; at 0, and with
 *   prefers-reduced-motion, there must be no camera motion.
 * - `hitStopSeconds`: freezes attacker AND victim, grows with damage, is capped. A starting point
 *   for action games is 40–120 ms, and 150–250 ms for kills (fighting games use 9–15 frames).
 * - `squashScale`: volume-preserving squash and stretch (1/√s, s, 1/√s), on a feet-pivot child.
 * - `iframeVisible`: mercy invulnerability ≈ 1 s after a hit, blinking every 0.1 s.
 */
export const damp = (current: number, target: number, lambda: number, dt: number) =>
  target + (current - target) * Math.exp(-lambda * dt);

/** Per-frame lerp factor at 60 fps → equivalent λ per second, for porting old code. */
export const lambdaFromPerFrame = (k: number, fps = 60) => -Math.log(1 - k) * fps;

/** Smooth 1D value noise in [-1, 1]. */
function noise1(x: number, seed: number) {
  const hash = (n: number) => { const s = Math.sin(n * 127.1 + seed * 311.7) * 43758.5453; return (s - Math.floor(s)) * 2 - 1; };
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  return hash(i) * (1 - u) + hash(i + 1) * u;
}

export class Trauma {
  value = 0;
  /** 0 disables shake (settings slider, reduced motion). */
  scale = 1;
  decayPerSecond: number;
  frequency: number;
  constructor(decayPerSecond = 1, frequency = 18) { this.decayPerSecond = decayPerSecond; this.frequency = frequency; }
  add(amount: number) { this.value = Math.min(1, this.value + amount); }
  update(dt: number) { this.value = Math.max(0, this.value - this.decayPerSecond * dt); }
  /** Rotation offsets in degrees to add after the camera rig; uses REAL time so hit-stop doesn't freeze the shake. */
  offset(realTime: number, maxYaw = 2, maxPitch = 2, maxRoll = 4) {
    const shake = this.value * this.value * this.scale, t = realTime * this.frequency;
    return { yaw: maxYaw * shake * noise1(t, 1), pitch: maxPitch * shake * noise1(t, 2), roll: maxRoll * shake * noise1(t, 3) };
  }
}

/** Hit-stop length in seconds; scales with damage relative to max health, capped. */
export function hitStopSeconds(damageFraction: number, { base = .04, extra = .08, kill = false, cap = .25 } = {}) {
  return Math.min(cap, kill ? Math.max(.15, base + extra) : base + extra * Math.min(1, Math.max(0, damageFraction)));
}

/** Volume-preserving squash/stretch: scale.y = s, x and z = 1/√s. */
export const squashScale = (s: number): [number, number, number] => [1 / Math.sqrt(s), s, 1 / Math.sqrt(s)];

/** Landing squash: 0.75 at impact back to 1 over `duration` (120–180 ms), ease-out. */
export const landingSquash = (since: number, duration = .15, depth = .75) => {
  if (since >= duration) return 1;
  const k = 1 - (1 - since / duration) ** 3;
  return depth + (1 - depth) * k;
};

/** Mercy invulnerability: visible/hidden blink every `period` while `remaining` > 0. */
export const iframeVisible = (remaining: number, period = .1) => remaining <= 0 || Math.floor(remaining / period) % 2 === 0;

/** Pick a sound or animation variant without repeating the previous one. */
export function pickVariant(count: number, previous: number, random: () => number) {
  if (count <= 1) return 0;
  const n = Math.floor(random() * (count - 1));
  return n >= previous ? n + 1 : n;
}
