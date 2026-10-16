import * as T from 'three';
import { KEEPER } from '../rules/content.ts';
import type { GameState } from '../rules/state.ts';
import { hurt as rulesHurt, ringDamage } from '../rules/keeper.ts';
import { Actor } from './actors.ts';
import type { Fx } from './fx.ts';
import type { KeeperLink } from './combat.ts';
import type { Blocker } from './isle-view.ts';
import { damp } from '../core/feel.ts';

export interface Bounds { height(x: number, z: number): number; clamp(p: T.Vector3): void; blockers: Blocker[] }
export interface KeeperHooks {
  /** A ring of the mallet: hit what is in reach; returns the number of hits. */
  strike(origin: T.Vector3, facing: number, reach: number, damage: number, spin: boolean): number;
  /** Something worth ringing within `range` (for auto-attack), or null. */
  target(p: T.Vector3, range: number): T.Vector3 | null;
  /** What a ring pressed on purpose should face: Gloom forms first, then cages and crusted trees. */
  aim(p: T.Vector3, range: number): T.Vector3 | null;
  hurt(taken: number): void;
  faint(): void;
  sound(name: string): void;
}

/**
 * The Keeper: move by stick, keys or tap-to-walk; rings by itself when a Gloom form is close (design §7),
 * Chime Spin and Hop on buttons, mercy frames after a hit. Responds on the frame the input is read.
 */
export class Keeper implements KeeperLink {
  actor: Actor;
  pos: T.Vector3;
  vel = new T.Vector3();
  walkTarget: T.Vector3 | null = null;
  /** Called when a tap-to-walk reaches its target (to interact on arrival). */
  onArrive: (() => void) | null = null;
  arriveRange = .3;
  mercy = 0; ringCd = 0; spinCd = 0; hopCd = 0; hopT = 0; private hopDir = new T.Vector3();
  /** Invulnerable while hopping (KEEPER.hop.invuln, logic review 16). */
  private invuln = 0;
  frozen = false;
  fainted = false;
  /** Bounds of the place the Keeper stands on (Bao's deck or an isle). */
  bounds: Bounds;
  autoAttack = true;

  constructor(private state: GameState, private fx: Fx, private hooks: KeeperHooks, bounds: Bounds) {
    this.actor = new Actor('keeper', 'keeper');
    this.pos = this.actor.root.position;
    this.bounds = bounds;
  }

  alive() { return !this.fainted && this.state.hero.hp > 0; }
  place(x: number, z: number) { this.pos.set(x, this.bounds.height(x, z), z); this.vel.set(0, 0, 0); this.walkTarget = null; this.onArrive = null; this.actor.action = 'none'; this.actor.actionT = 0; }
  walkTo(x: number, z: number, onArrive: (() => void) | null = null, range = .3) {
    this.walkTarget = new T.Vector3(x, 0, z); this.onArrive = onArrive; this.arriveRange = range;
  }

  hurt(raw: number, from: T.Vector3) {
    if (!this.alive() || this.mercy > 0 || this.invuln > 0) return;
    const taken = rulesHurt(this.state, raw);
    this.mercy = KEEPER.mercy;
    this.actor.hit(); this.actor.play('hurt', .25);
    const dx = this.pos.x - from.x, dz = this.pos.z - from.z, d = Math.hypot(dx, dz) || 1;
    this.vel.x += dx / d * 5; this.vel.z += dz / d * 5;
    this.fx.text(this.pos, `-${taken}`, 'heal');
    this.fx.burst(this.pos.clone().setY(this.pos.y + .7), '#ff8a8a', 6, { speed: 3, up: 3, size: .09, life: .4 });
    this.fx.shake(.25);
    this.hooks.hurt(taken);
    if (this.state.hero.hp <= 0) { this.fainted = true; this.actor.play('faint', .6); this.hooks.faint(); }
  }

  ring(spin = false) {
    if (!this.alive() || this.frozen) return false;
    if (spin) {
      if (this.spinCd > 0) return false;
      this.spinCd = KEEPER.spin.cooldown;
      this.actor.play('spin', .4);
      this.fx.ring(this.pos, '#ffe28a', .6, KEEPER.spin.radius + .4, .4);
      this.hooks.sound('spin');
      this.hooks.strike(this.pos, this.actor.facing, KEEPER.spin.radius, ringDamage(this.state) * KEEPER.spin.mult, true);
      return true;
    }
    if (this.ringCd > 0) return false;
    this.ringCd = KEEPER.ringEvery;
    const t = this.hooks.aim(this.pos, KEEPER.autoRange + .6);
    if (t) this.actor.lookAt(t.x, t.z);
    this.actor.play('swing', .24);
    this.hooks.sound('swing');
    this.hooks.strike(this.pos, this.actor.facing, KEEPER.ringReach, ringDamage(this.state), false);
    return true;
  }

  hop(dirX: number, dirZ: number) {
    if (!this.alive() || this.hopCd > 0 || this.frozen) return false;
    const L = Math.hypot(dirX, dirZ);
    if (L < .1) { dirX = Math.sin(this.actor.facing); dirZ = Math.cos(this.actor.facing); } else { dirX /= L; dirZ /= L; }
    this.hopDir.set(dirX, 0, dirZ);
    this.hopT = .22; this.hopCd = KEEPER.hop.cooldown; this.invuln = KEEPER.hop.invuln;
    this.actor.facing = Math.atan2(dirX, dirZ);
    this.actor.play('hop', .3);
    this.fx.burst(this.pos.clone().setY(this.pos.y + .1), '#ffffff', 6, { speed: 2, up: 1.5, size: .1, life: .35 });
    this.hooks.sound('hop');
    return true;
  }

  /** One fixed step. `stick` is the move intent (−1..1 on x and z, z toward the camera). */
  update(dt: number, stick: { x: number; z: number }) {
    this.mercy = Math.max(0, this.mercy - dt); this.ringCd = Math.max(0, this.ringCd - dt);
    this.spinCd = Math.max(0, this.spinCd - dt); this.hopCd = Math.max(0, this.hopCd - dt); this.invuln = Math.max(0, this.invuln - dt);
    if (this.mercy > 0) this.actor.root.visible = Math.floor(this.mercy / .1) % 2 === 0; else this.actor.root.visible = true;
    let wantX = 0, wantZ = 0;
    if (this.alive() && !this.frozen) {
      if (Math.hypot(stick.x, stick.z) > .05) { wantX = stick.x; wantZ = stick.z; this.walkTarget = null; this.onArrive = null; }
      else if (this.walkTarget) {
        const dx = this.walkTarget.x - this.pos.x, dz = this.walkTarget.z - this.pos.z, d = Math.hypot(dx, dz);
        if (d <= this.arriveRange) { this.walkTarget = null; const f = this.onArrive; this.onArrive = null; f?.(); }
        else { const k = Math.min(1, d / .6); wantX = dx / d * k; wantZ = dz / d * k; }
      }
    }
    const L = Math.hypot(wantX, wantZ);
    if (L > 1) { wantX /= L; wantZ /= L; }
    // Reach top speed in about 0.09 s and stop as fast (web-game-craft feel numbers).
    const tx = wantX * KEEPER.speed, tz = wantZ * KEEPER.speed;
    this.vel.x = damp(this.vel.x, tx, 24, dt); this.vel.z = damp(this.vel.z, tz, 24, dt);
    if (this.hopT > 0) { this.hopT -= dt; const s = KEEPER.hop.distance / .22; this.pos.x += this.hopDir.x * s * dt; this.pos.z += this.hopDir.z * s * dt; }
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
    for (const b of this.bounds.blockers) {
      const dx = this.pos.x - b.x, dz = this.pos.z - b.z, d = Math.hypot(dx, dz), min = b.r + .32;
      if (d > 0 && d < min) { this.pos.x = b.x + dx / d * min; this.pos.z = b.z + dz / d * min; }
    }
    // A walk aimed at something solid (a prop's centre) arrives once the Keeper is pressed against it (code review 6).
    if (this.walkTarget) for (const b of this.bounds.blockers) {
      if (Math.hypot(this.walkTarget.x - b.x, this.walkTarget.z - b.z) < b.r + .32 && Math.hypot(this.pos.x - b.x, this.pos.z - b.z) <= b.r + .36) {
        const f = this.onArrive; this.walkTarget = null; this.onArrive = null; f?.(); break;
      }
    }
    this.bounds.clamp(this.pos);
    this.pos.y = this.bounds.height(this.pos.x, this.pos.z);
    const speed = Math.hypot(this.vel.x, this.vel.z);
    this.actor.speed = speed;
    if (speed > .3 && this.actor.action !== 'swing') this.actor.facing = Math.atan2(this.vel.x, this.vel.z);
    // Ring by itself when a Gloom form is close (and the Keeper is not walking somewhere on purpose).
    if (this.autoAttack && this.alive() && !this.frozen && this.ringCd <= 0 && this.hooks.target(this.pos, KEEPER.autoRange)) this.ring(false);
    this.actor.update(dt);
  }
}
