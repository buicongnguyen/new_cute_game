import * as T from 'three';
import { CLAM, HEART, HIVES, HIVE_MOVES, HIVE_OF, HIVE_PACE, HIVE_PATTERNS, PLACES, TIERS, type HiveId, type HiveMove, type IsleId } from '../rules/content.ts';
import { findChild, part, standIn } from './assets.ts';
import { makeToon } from './look.ts';
import type { Fx } from './fx.ts';
import { flat, type Combat, type KeeperLink } from './combat.ts';

export interface HiveEvents { broken(at: T.Vector3): void; song(): void; sound(name: string): void; freeze(s: number): void }

/**
 * An isle's boss. Shielded while any Spire stands (blows glance off with a bell sound). Every HIVE_PACE seconds it
 * winds up one move from its pattern, telegraphed on the ground (≥ 0.6 s), then the blow lands.
 * Clamhive takes 15% while closed and opens for 4 s after each move; the Grey Heart takes 40% except for 5 s after
 * each of Bao's songs (every 20 s), when it takes 140% and the song heals the Keeper.
 */
export class HiveFight {
  id: HiveId; isle: IsleId; pos: T.Vector3; hp: number; max: number; tier: number;
  view: T.Object3D; private shieldMesh: T.Mesh;
  shielded = true; broken = false; awake = false;
  private t = 0; private moveT = 1.5; private moveIdx = 0; private pending: { move: HiveMove; at: number; target: T.Vector3; dir: number } | null = null;
  private openT = 0; private songT = 0; songWindow = 0; private flash = 0; private mats: T.MeshToonMaterial[] = [];
  constructor(isle: IsleId, at: T.Vector3, private combat: Combat, private fx: Fx, private keeper: KeeperLink, private events: HiveEvents, maxHp?: number) {
    this.isle = isle; this.id = HIVE_OF[isle]; this.pos = at.clone();
    const def = HIVES[this.id];
    this.hp = this.max = maxHp ?? def.hp; this.tier = PLACES[isle].tier;
    this.view = part('hives', this.id, { shadows: true }) ?? standIn('pillar', '#8c86a8', 1.7);
    this.view.position.copy(at);
    this.view.traverse(o => { const m = o as T.Mesh; if (m.isMesh) { const own = (m.material as T.MeshToonMaterial).clone(); m.material = own; this.mats.push(own); } });
    this.shieldMesh = new T.Mesh(new T.SphereGeometry(def.radius + 2.6, 32, 16), new T.MeshBasicMaterial({ color: '#b26bff', transparent: true, opacity: .22, depthWrite: false }));
    this.shieldMesh.position.copy(at).setY(at.y + 1.6);
    combat.group.add(this.view, this.shieldMesh);
  }
  get radius() { return HIVES[this.id].radius; }

  setShield(on: boolean) {
    if (this.shielded && !on) { this.fx.burst(this.shieldMesh.position, '#c9b8ff', 30, { speed: 6, up: 4, size: .15, life: .9 }); this.fx.ring(this.pos, '#b26bff', 1, 9, .8); this.events.sound('shield'); }
    this.shielded = on; this.shieldMesh.visible = on;
  }

  /** How much of a blow lands now. */
  factor() {
    if (this.id === 'clamhive') return this.openT > 0 ? 1 : CLAM.closedTaken;
    if (this.id === 'greyheart') return this.songWindow > 0 ? HEART.songTaken : HEART.shieldTaken;
    return 1;
  }

  /** A ring from the Keeper; returns the damage dealt (0 when out of reach or shielded). */
  hit(origin: T.Vector3, facing: number, reach: number, damage: number, spin: boolean) {
    if (this.broken) return 0;
    const dx = this.pos.x - origin.x, dz = this.pos.z - origin.z, d = Math.hypot(dx, dz);
    if (d > reach + this.radius) return 0;
    if (!spin && d > .8 && (dx * Math.sin(facing) + dz * Math.cos(facing)) / d < .2) return 0;
    if (this.shielded) { this.fx.ring(this.pos, '#c9b8ff', 2, 4.5, .3, .6); this.events.sound('glance'); this.fx.text(this.pos.clone().setY(3), 'Shielded', 'info'); return 0; }
    this.awake = true;
    const dmg = Math.max(1, Math.round(damage * this.factor()));
    this.hp -= dmg; this.flash = .08;
    for (const m of this.mats) m.emissive.setScalar(.6);
    this.fx.text(this.pos.clone().setY(this.pos.y + 3), String(dmg), this.factor() > 1 ? 'crit' : 'hit');
    this.fx.burst(this.pos.clone().setY(this.pos.y + 1.6), '#c9b8ff', 6, { speed: 4, up: 3, size: .14, life: .5 });
    if (this.hp <= 0) this.break();
    return dmg;
  }

  private break() {
    this.broken = true; this.hp = 0; this.view.visible = false; this.shieldMesh.visible = false;
    this.pending = null;
    const at = this.pos.clone().setY(this.pos.y + 2);
    this.fx.burst(at, '#9a8cc8', 60, { speed: 9, up: 9, size: .25, life: 1.3 });
    this.fx.sparkle(at, '#ffe28a', 30, 1.8);
    this.fx.ring(this.pos, '#ffe28a', 1, 14, 1.2);
    this.fx.shake(.8);
    this.events.freeze(.25);
    this.events.broken(this.pos);
  }

  update(dt: number) {
    this.t += dt;
    if (this.broken) return;
    if (this.flash > 0) { this.flash -= dt; if (this.flash <= 0) for (const m of this.mats) m.emissive.setScalar(0); }
    const k = this.keeper.pos, d = flat(k, this.pos);
    if (!this.shielded && this.keeper.alive() && d < 15) this.awake = true;
    if (this.awake && (!this.keeper.alive() || d > 26)) { this.awake = false; this.pending = null; this.hp = this.max; }
    this.animate(dt);
    if (!this.awake || this.shielded) return;
    if (this.id === 'clamhive' && this.openT > 0) this.openT -= dt;
    if (this.id === 'greyheart') {
      this.songT += dt; this.songWindow = Math.max(0, this.songWindow - dt);
      if (this.songT >= HEART.songEvery) { this.songT = 0; this.songWindow = HEART.songSeconds; this.events.song(); this.fx.ring(this.pos, '#ffe28a', 2, 18, 1.4); }
    }
    if (this.pending) {
      if (this.t >= this.pending.at) this.land(this.pending);
      return;
    }
    this.moveT -= dt;
    if (this.moveT > 0) return;
    const pattern = HIVE_PATTERNS[this.id];
    const move = pattern[this.moveIdx++ % pattern.length];
    this.begin(move);
  }

  private begin(move: HiveMove) {
    const k = this.keeper.pos, m = HIVE_MOVES[move] as { windup?: number; radius?: number; safe?: number; length?: number; width?: number; count?: number };
    const windup = m.windup ?? .8, dir = Math.atan2(k.x - this.pos.x, k.z - this.pos.z);
    const target = k.clone();
    switch (move) {
      case 'thornRing': this.fx.telegraph('ring', this.pos, { radius: m.radius, inner: m.safe, seconds: windup }); break;
      case 'tideRing': this.fx.telegraph('ring', this.pos, { radius: m.radius, inner: 3.4, seconds: windup, color: '#3cc8ff' }); break;
      case 'spikeLines': for (let i = 0; i < (m.count ?? 3); i++) this.fx.telegraph('line', this.pos, { length: m.length, width: m.width, angle: dir + (i - 1) * .45, seconds: windup }); break;
      case 'crackLines': for (let i = 0; i < (m.count ?? 2); i++) this.fx.telegraph('line', this.pos, { length: m.length, width: m.width, angle: dir + (i === 0 ? -.18 : .18), seconds: windup, color: '#b26bff' }); break;
      case 'slam': this.fx.telegraph('disc', new T.Vector3(k.x, k.y, k.z), { radius: m.radius, seconds: windup }); break;
      case 'pearlVolley': this.fx.telegraph('line', this.pos, { length: 6, width: 2.4, angle: dir, seconds: windup, color: '#ffffff' }); break;
      case 'wake': case 'callFlyers': this.fx.ring(this.pos, '#b26bff', 1, 5, .6); break;
    }
    this.pending = { move, at: this.t + (move === 'wake' || move === 'callFlyers' ? .6 : windup), target, dir };
    this.events.sound('windup');
  }

  private land(p: { move: HiveMove; target: T.Vector3; dir: number }) {
    this.pending = null;
    this.moveT = HIVE_PACE;
    const k = this.keeper.pos, d = flat(k, this.pos), m = HIVE_MOVES[p.move] as { damage?: number; radius?: number; safe?: number; length?: number; width?: number; count?: number; speed?: number; spread?: number };
    const dmg = Math.round((m.damage ?? 0) * TIERS[this.tier].damage);
    const onLine = (angle: number) => {
      const fx = Math.sin(angle), fz = Math.cos(angle), dx = k.x - this.pos.x, dz = k.z - this.pos.z;
      const along = dx * fx + dz * fz, across = Math.abs(dx * fz - dz * fx);
      return along > 0 && along < (m.length ?? 10) && across < (m.width ?? 1.2) / 2 + .3;
    };
    switch (p.move) {
      case 'thornRing': if (d > (m.safe ?? 2) && d < (m.radius ?? 7)) this.keeper.hurt(dmg, this.pos); this.fx.ring(this.pos, '#b26bff', m.safe, m.radius, .5); break;
      case 'tideRing': if (d > 3.4 && d < (m.radius ?? 9)) this.keeper.hurt(dmg, this.pos); this.fx.ring(this.pos, '#3cc8ff', 3.4, m.radius, .5); break;
      case 'spikeLines': if ([-1, 0, 1].some(i => onLine(p.dir + i * .45))) this.keeper.hurt(dmg, this.pos); this.fx.burst(this.pos, '#9a8cc8', 14, { speed: 9, up: 2 }); break;
      case 'crackLines': if ([-.18, .18].some(a => onLine(p.dir + a))) this.keeper.hurt(dmg, this.pos); this.fx.burst(this.pos, '#b26bff', 16, { speed: 9, up: 2 }); break;
      case 'slam': if (flat(k, p.target) < (m.radius ?? 3)) this.keeper.hurt(dmg, p.target); this.fx.ring(p.target, '#ffffff', .5, (m.radius ?? 3) * 1.4, .4); this.fx.shake(.35); break;
      case 'pearlVolley': this.combat.volley(this.pos, k, m.count ?? 5, m.spread ?? .9, m.speed ?? 10, dmg); break;
      case 'wake': for (let i = 0; i < (m.count ?? 2); i++) this.summon('gloomling', i); break;
      case 'callFlyers': for (let i = 0; i < (m.count ?? 2); i++) this.summon('flyer', i); break;
    }
    if (this.id === 'clamhive') this.openT = CLAM.openSeconds;
    this.events.sound(p.move === 'slam' ? 'slam' : 'blast');
  }

  private summon(kind: 'gloomling' | 'flyer', i: number) {
    if (this.combat.aliveCount() > 8) return;
    const a = this.t * 1.7 + i * 2.4, at = new T.Vector3(this.pos.x + Math.cos(a) * (this.radius + 1.5), 0, this.pos.z + Math.sin(a) * (this.radius + 1.5));
    this.combat.spawn(kind, at, this.tier, { alert: true, reward: false });
  }

  private animate(dt: number) {
    const v = this.view, t = this.t, winding = !!this.pending;
    if (this.id === 'thornhive') { v.rotation.y += dt * (winding ? 1.6 : .25); v.scale.setScalar(1 + (winding ? Math.sin(t * 20) * .02 : 0)); }
    if (this.id === 'clamhive') { const top = findChild(v, 'shell_top'); if (top) top.rotation.x += ((this.openT > 0 ? -.75 : -.08) - top.rotation.x) * (1 - Math.exp(-8 * dt)); }
    if (this.id === 'forgehive') { for (const n of ['arm_l', 'arm_r']) { const a = findChild(v, n); if (a) a.rotation.x = winding ? -2.2 : Math.sin(t * 1.4) * .15; } v.position.y = this.pos.y + Math.sin(t * 1.2) * .05; }
    if (this.id === 'greyheart') {
      for (let i = 0; i < 6; i++) { const s = findChild(v, `shard_${i}`); if (s) { const a = t * .6 + i * Math.PI / 3; s.position.set(Math.cos(a) * 4, 2.6 + Math.sin(t * 1.3 + i) * .5, Math.sin(a) * 4); } }
      const core = findChild(v, 'core'); if (core) core.scale.setScalar(1 + Math.sin(t * 4) * .06 + (this.songWindow > 0 ? .2 : 0));
    }
  }
}

/** The glowing Note that flies up to Bao when a Hive breaks. */
export function noteView() {
  return part('hives', 'note') ?? (() => { const m = new T.Mesh(new T.OctahedronGeometry(.4, 0), makeToon('#ffd23a', { emissive: '#ffb000' })); const g = new T.Group(); g.add(m); return g; })();
}
