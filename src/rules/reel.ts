/**
 * The fishing game from Zoo Garden (cute_game/src/fishing.ts, the same owner's design and code, itself a port of the
 * reference's rules), trimmed for the skiff: no pond geometry, no line-seed proofs, no mystery shadows.
 *
 * Phases: cast (0.5 s) → wait → approach (a fish swims to the bobber) → nibble (1–4 dips) → bite (a window to hook it)
 * → hooked (hold Reel against the line's tension) → caught | escaped. Pure and seedable: the view only draws it.
 */
import type { FishId } from './content.ts';

export type ReelPhase = 'cast' | 'wait' | 'approach' | 'nibble' | 'bite' | 'hooked' | 'caught' | 'escaped';
export interface ReelPick { id: FishId; power: number }
export interface ReelOptions {
  /** Rod quality, 0..1: the plain line 0.3, the Good Line 0.6, plus a little per Fishing level. */
  quality: number;
  /** Kai's bait pot: fish come sooner and rarer ones come more often. */
  bait: boolean;
  /** Picks the fish that comes, given the rare-fish bonus (null: the school is out of bites). */
  choose: (bonus: number) => ReelPick | null;
  random: () => number;
}

/** How hard each fish fights (Zoo Garden's `power`): a Minnow barely tugs, a Koi surges. */
export const FISH_POWER: Record<FishId, number> = { puff_minnow: .15, sun_carp: .3, star_ray: .5, cloud_koi: .75 };
/** The line snaps on a strain with this chance (Zoo Garden's bamboo and golden rods); it warns first above 0.8. */
export const LINE = { snap: .45, goodSnap: .25, warn: .8, relief: .7, slip: .08 } as const;
export const CAST_FLIGHT = .5;

export class ReelSim {
  phase: ReelPhase = 'cast'; tension = 0; progress = 0; surge = 0;
  pick: ReelPick | null = null;
  /** Distance of the coming fish from the bobber, and the nibble dart (0.3 s → 0) the view draws. */
  fishDistance = 0; dart = 0;
  nibbles = 0; reason = ''; holding = false;
  private t = 0; private waitT: number; private nibblesLeft = 0; private nibT = 0; private touched = false;
  private biteT = 0; private slack = 0; private surgeCd = 0; private power = .2; private lastHeld = false;
  private readonly snapChance: number;
  constructor(private o: ReelOptions) {
    this.waitT = this.nextWait();
    this.snapChance = o.quality >= .6 ? LINE.goodSnap : LINE.snap;
  }
  private between(a: number, b: number) { return a + this.o.random() * (b - a); }
  get finished() { return this.phase === 'caught' || this.phase === 'escaped'; }
  /** The tension bar is near full: the next strain may snap the line ("Let go!"). */
  get strained() { return this.phase === 'hooked' && this.tension >= LINE.warn; }
  /** 2–5.5 s, ÷ 1.7 with bait, ÷ (1 + quality / 2). */
  nextWait() { return this.between(2, 5.5) / (this.o.bait ? 1.7 : 1) / (1 + this.o.quality * .5); }
  get biteWindow() { return 1.4 + this.o.quality * .6; }
  private toWait(extra = 0) { this.phase = 'wait'; this.t = 0; this.waitT = this.nextWait() + extra; this.pick = null; this.fishDistance = 0; this.dart = 0; }

  /** A press: hooks a biting fish; too early, it scares the fish off. */
  press() {
    this.holding = true;
    if (this.phase === 'bite') {
      this.phase = 'hooked'; this.t = 0; this.tension = .25; this.progress = .05; this.surge = 0; this.surgeCd = this.between(.5, 1.5); this.slack = 0;
      this.power = this.pick?.power ?? .2; return true;
    }
    if (this.phase === 'wait' || this.phase === 'approach' || this.phase === 'nibble') { this.toWait(1.5); this.reason = 'Too early: the bobber jerked and the fish swam off.'; }
    return false;
  }
  release() { this.holding = false; }

  update(dt: number, held: boolean) {
    if (this.finished) return;
    if (held && !this.lastHeld) this.press(); else if (!held && this.lastHeld) this.release();
    this.lastHeld = held;
    this.t += dt;
    switch (this.phase) {
      case 'cast': if (this.t >= CAST_FLIGHT) { this.phase = 'wait'; this.t = 0; } return;
      case 'wait': this.waitT -= dt; if (this.waitT <= 0) this.attract(); return;
      case 'approach':
        // It swims at 1.1 m/s, slowing to 0.45 m/s within 2 m, and nibbles once there and 0.8 s have passed.
        if (this.fishDistance > .55) this.fishDistance = Math.max(.55, this.fishDistance - dt * (this.fishDistance > 2 ? 1.1 : .45));
        else if (this.t > .8) { this.phase = 'nibble'; this.t = 0; this.nibT = this.between(.4, 1.2); this.dart = 0; }
        return;
      case 'nibble':
        this.nibT -= dt;
        if (this.nibT <= 0 && this.dart <= 0) { this.dart = .3; this.touched = false; }
        if (this.dart > 0) {
          this.dart -= dt;
          if (this.dart < .15 && !this.touched) { this.touched = true; this.nibbles++; }
          if (this.dart <= 0) {
            this.dart = 0;
            if (--this.nibblesLeft > 0) this.nibT = this.between(.5, 1.6);
            else if (this.o.random() < .95) { this.phase = 'bite'; this.t = 0; this.biteT = this.biteWindow; }
            else { this.toWait(); this.reason = 'The fish lost interest.'; }
          }
        }
        return;
      case 'bite':
        this.biteT -= dt;
        if (this.biteT <= 0) { this.toWait(); this.reason = 'The bite was missed. Wait for the next fish.'; }
        return;
      case 'hooked': this.reel(dt); return;
    }
  }

  private attract() {
    const bonus = (this.o.bait ? .8 : 0) + this.o.quality - .3;
    const pick = this.o.choose(bonus);
    if (!pick) { this.phase = 'escaped'; this.reason = 'The fish are hiding. Try again in a little while.'; return; }
    this.pick = pick; this.phase = 'approach'; this.t = 0;
    this.fishDistance = 2.5 + pick.power * 2;
    this.nibblesLeft = 1 + Math.floor(this.o.random() * 4); this.dart = 0;
  }

  /** Hold to gain line; a full tension bar strains (and may snap) the line; seven seconds of slack loses the fish. */
  private reel(dt: number) {
    const q = this.o.quality, p = this.power;
    this.surgeCd -= dt;
    if (this.surge > 0) this.surge -= dt; else if (this.surgeCd <= 0) { this.surge = this.between(.4, .8 + p); this.surgeCd = this.between(.8, 2.2) * (1.2 - p * .5); }
    const surging = this.surge > 0;
    if (this.holding) {
      this.progress += dt * .3 * (1.15 - p * .45) * (surging ? .4 : 1);
      this.tension += dt * (1.2 - q * .45) * (.08 + (surging ? .6 * p + .12 : .02));
      this.slack = 0;
    } else { this.tension -= dt * .9; this.progress -= dt * .05 * p * (surging ? 2.5 : 1); this.slack += dt; }
    this.tension = Math.max(0, this.tension); this.progress = Math.max(0, this.progress);
    if (this.tension >= 1) {
      if (this.o.random() < this.snapChance) { this.phase = 'escaped'; this.reason = 'The line snapped. Let go of Reel when the fish surges.'; return; }
      this.tension = LINE.relief; this.progress = Math.max(0, this.progress - LINE.slip);
    }
    if (this.slack > 7) { this.phase = 'escaped'; this.reason = 'The line went slack and the fish slipped away.'; return; }
    if (this.progress >= 1) { this.progress = 1; this.phase = 'caught'; this.reason = 'A lovely catch!'; }
  }
}
