import * as T from 'three';
import { BARNACLE, CLAM, HEART, HIVES, HIVE_MOVES, HIVE_OF, HIVE_PACE, HIVE_PATTERNS, HUSH, ISLE_MAPS, PLACES, TIERS, WYRM, type HiveId, type HiveMove, type IsleId } from '../rules/content.ts';
import { findChild, part, standIn } from './assets.ts';
import { makeToon } from './look.ts';
import type { Fx } from './fx.ts';
import { t } from '../i18n.ts';
import { flat, type Combat, type KeeperLink } from './combat.ts';

export interface HiveEvents { broken(at: T.Vector3): void; song(): void; sound(name: string): void; freeze(s: number): void }

/** Bosses drawn bigger than their model (the ship captains stand on a deck already × 1.6). */
const MODEL_SCALE: Partial<Record<HiveId, number>> = { barnacle: 1.25, coilwyrm: 1.25 };
interface Echo { pos: T.Vector3; view: T.Object3D; bell: T.Object3D | null; rung: boolean; wobble: number }
interface Knot { node: T.Object3D | null; pos: T.Vector3; rings: number }
interface Dome { pos: T.Vector3; r: number; t: number; mesh: T.Mesh }

/**
 * A land's boss (a Hive) or a ship's captain. Shielded while its guards stand (a land's Spires, a ship's raider
 * groups): blows glance off with a bell sound. Every HIVE_PACE seconds it winds up one move from its pattern,
 * telegraphed on the ground (≥ 0.6 s), then the blow lands. Each boss has its own trick (design §8):
 * - the Clamhive takes 15% while shut and gapes for 1.9 s after each move;
 * - the Hush Bell takes nothing while silent: ring its three echo bells to crack the silence for 8 s; its domes of
 *   silence stop the mallet of anyone standing inside;
 * - Captain Barnacle's shell takes 40%; its anchor sticks after each throw and holds it for 3.5 s (×1.5);
 * - the Coilwyrm is untouchable while coiled up on the deck: ring the three knots on its coils and it flops down, dizzy, for 7 s;
 * - the Grey Heart takes 40% except for 5 s after each of Bao's songs (every 20 s), when it takes 140%.
 */
export class HiveFight {
  id: HiveId; isle: IsleId; pos: T.Vector3; hp: number; max: number; tier: number;
  view: T.Object3D; private shieldMesh: T.Mesh;
  shielded = true; broken = false; awake = false;
  private t = 0; private moveT = 1.5; private moveIdx = 0; private pending: { move: HiveMove; at: number; target: T.Vector3; dir: number } | null = null;
  private openT = 0; private songT = 0; songWindow = 0; private flash = 0; private mats: T.MeshToonMaterial[] = [];
  /** The Hush Bell. */
  echoes: Echo[] = []; crackT = 0; private domes: Dome[] = [];
  /** Captain Barnacle. */
  stuckT = 0; private anchor: T.Object3D | null = null; private chain: T.Line | null = null;
  /** The Coilwyrm. */
  knots: Knot[] = []; dizzyT = 0;
  constructor(isle: IsleId, at: T.Vector3, private combat: Combat, private fx: Fx, private keeper: KeeperLink, private events: HiveEvents, maxHp?: number) {
    this.isle = isle; this.id = HIVE_OF[isle]; this.pos = at.clone();
    const def = HIVES[this.id];
    this.hp = this.max = maxHp ?? def.hp; this.tier = PLACES[isle].tier;
    this.view = part('hives', def.model, { shadows: true }) ?? standIn('pillar', '#8c86a8', 1.7);
    this.view.scale.setScalar(MODEL_SCALE[this.id] ?? 1);
    this.view.position.copy(at);
    if (this.id === 'barnacle') this.view.rotation.y = 0; // it faces the bow, where the Captain comes from
    this.view.traverse(o => { const m = o as T.Mesh; if (m.isMesh) { const own = (m.material as T.MeshToonMaterial).clone(); m.material = own; this.mats.push(own); } });
    this.shieldMesh = new T.Mesh(new T.SphereGeometry(def.radius + 2.6, 32, 16), new T.MeshBasicMaterial({ color: '#b26bff', transparent: true, opacity: .22, depthWrite: false }));
    this.shieldMesh.position.copy(at).setY(at.y + 1.6);
    combat.group.add(this.view, this.shieldMesh);
    if (this.id === 'hushbell') {
      for (const [x, z] of ISLE_MAPS[isle].echo) {
        const v = part('hives', 'echo_bell', { shadows: true }) ?? standIn('pillar', '#d9a441', .6);
        v.position.set(x, at.y, z); v.rotation.y = Math.atan2(at.x - x, at.z - z);
        combat.group.add(v);
        this.echoes.push({ pos: new T.Vector3(x, at.y, z), view: v, bell: findChild(v, 'bell'), rung: false, wobble: 0 });
      }
    }
    if (this.id === 'coilwyrm') {
      this.view.updateMatrixWorld(true);
      for (let i = 0; i < 3; i++) {
        const node = findChild(this.view, `knot_${i}`), p = new T.Vector3();
        if (node) node.getWorldPosition(p); else p.set(at.x + Math.cos(i * 2.1) * 1.9, 2 + i, at.z + Math.sin(i * 2.1) * 1.9);
        this.knots.push({ node, pos: p, rings: WYRM.knotRings });
      }
    }
  }
  get radius() { return HIVES[this.id].radius; }
  /** Inside this distance the rings cannot reach you: a step outside the boss's own body (logic review 7). */
  get safe() { return this.radius + 1.15; }

  /** Removes the boss, its shield and its props from the scene (code review 5: the dome was left behind). */
  dispose() {
    this.combat.group.remove(this.view, this.shieldMesh);
    this.shieldMesh.geometry.dispose(); (this.shieldMesh.material as T.Material).dispose();
    for (const e of this.echoes) this.combat.group.remove(e.view);
    for (const d of this.domes) { this.combat.group.remove(d.mesh); d.mesh.geometry.dispose(); }
    this.domes = [];
    this.dropAnchor();
  }
  /** `quiet`: the state on landing, without the shattering show (code review 19). */
  setShield(on: boolean, quiet = false) {
    if (this.shielded && !on && !quiet) { this.fx.burst(this.shieldMesh.position, '#c9b8ff', 30, { speed: 6, up: 4, size: .15, life: .9 }); this.fx.ring(this.pos, '#b26bff', 1, 9, .8); this.events.sound('shield'); }
    this.shielded = on; this.shieldMesh.visible = on;
  }

  /** How much of a blow lands now. */
  factor() {
    switch (this.id) {
      case 'clamhive': return this.openT > 0 ? 1 : CLAM.closedTaken;
      case 'greyheart': return this.songWindow > 0 ? HEART.songTaken : HEART.shieldTaken;
      case 'hushbell': return this.crackT > 0 ? HUSH.crackTaken : 0;
      case 'barnacle': return this.stuckT > 0 ? BARNACLE.stuckTaken : BARNACLE.taken;
      case 'coilwyrm': return this.dizzyT > 0 ? WYRM.dizzyTaken : 0;
      default: return 1;
    }
  }
  /** The boss's state, for the HUD bar. */
  status() {
    if (this.shielded) return 'Shielded';
    if (this.id === 'hushbell') return this.crackT > 0 ? 'Cracked! Strike!' : 'Silent: ring the echo bells';
    if (this.id === 'coilwyrm') return this.dizzyT > 0 ? 'Dizzy! Strike!' : 'Ring its glowing knots';
    if (this.id === 'barnacle') return this.stuckT > 0 ? 'Stuck! Strike!' : null;
    if (this.id === 'greyheart') return this.songWindow > 0 ? 'Bao sings! Strike!' : null;
    if (this.id === 'clamhive') return this.openT > 0 ? 'Open! Strike!' : null;
    return null;
  }
  /** Is `p` under a dome of silence (the Captain's mallet makes no sound there)? */
  hushes(p: T.Vector3) { return this.domes.some(d => flat(p, d.pos) < d.r); }
  /** Things worth ringing besides the boss: echo bells not yet rung, knots not yet broken. */
  targets(): T.Vector3[] {
    if (this.broken || this.shielded) return [];
    if (this.id === 'hushbell' && this.crackT <= 0) return this.echoes.filter(e => !e.rung).map(e => e.pos);
    if (this.id === 'coilwyrm' && this.dizzyT <= 0) return this.knots.filter(k => k.rings > 0).map(k => k.pos);
    return [];
  }
  /** Echo bells stand in the way like posts. */
  blockers() { return this.echoes.map(e => ({ x: e.pos.x, z: e.pos.z, r: .45 })); }

  /** A ring from the Captain; returns the damage dealt (0 when out of reach, shielded or silent). */
  hit(origin: T.Vector3, facing: number, reach: number, damage: number, spin: boolean) {
    if (this.broken) return 0;
    const inArc = (p: T.Vector3, r: number) => {
      const dx = p.x - origin.x, dz = p.z - origin.z, d = Math.hypot(dx, dz);
      if (d > reach + r) return false;
      return spin || d < .8 || (dx * Math.sin(facing) + dz * Math.cos(facing)) / d >= .2;
    };
    let rang = 0;
    // The Hush Bell's echo bells: one ring each; all three crack the silence.
    if (!this.shielded && this.id === 'hushbell' && this.crackT <= 0) for (const e of this.echoes) {
      if (e.rung || !inArc(e.pos, .5)) continue;
      e.rung = true; e.wobble = 1; rang++;
      this.fx.ring(e.pos, '#ffe28a', .4, 3, .45); this.fx.sparkle(e.pos.clone().setY(1.6), '#ffe28a', 10); this.events.sound('chime');
      const left = this.echoes.filter(x => !x.rung).length;
      this.fx.text(e.pos.clone().setY(2.2), left ? t('{n} more echo bells', { n: left }) : t('The silence cracks!'), left ? 'info' : 'crit');
      if (!left) { this.crackT = HUSH.crackSeconds; this.fx.ring(this.pos, '#ffe28a', 1, 10, 1); this.events.sound('song'); this.domes.forEach(d => { d.t = Math.min(d.t, .4); }); }
    }
    // The Coilwyrm's knots: two rings each; all three and it flops down, dizzy.
    if (!this.shielded && this.id === 'coilwyrm' && this.dizzyT <= 0) for (const k of this.knots) {
      if (k.rings <= 0 || !inArc(k.pos, .6)) continue;
      k.rings--; rang++;
      this.fx.ring(k.pos.clone().setY(this.pos.y), '#ffe28a', .3, 1.6, .35); this.fx.burst(k.pos, '#c9b8ff', 8, { speed: 3, up: 2 }); this.events.sound('chime');
      if (k.rings <= 0) { if (k.node) k.node.visible = false; this.fx.burst(k.pos, '#ffe28a', 16, { speed: 5, up: 3 }); }
      if (this.knots.every(x => x.rings <= 0)) {
        this.dizzyT = WYRM.dizzy; this.pending = null;
        this.fx.text(this.pos.clone().setY(3), t('It falls! Strike its head!'), 'crit'); this.fx.shake(.5); this.events.sound('slam');
      }
    }
    const dx = this.pos.x - origin.x, dz = this.pos.z - origin.z, d = Math.hypot(dx, dz);
    if (d > reach + this.radius) return rang;
    if (!spin && d > .8 && (dx * Math.sin(facing) + dz * Math.cos(facing)) / d < .2) return rang;
    if (this.shielded) { this.fx.ring(this.pos, '#c9b8ff', 2, 4.5, .3, .6); this.events.sound('glance'); this.fx.text(this.pos.clone().setY(3), t('Shielded'), 'info'); return rang; }
    this.awake = true;
    const k = this.factor();
    if (k <= 0) {
      if (!rang) { this.events.sound('glance'); this.fx.text(this.pos.clone().setY(3), t(this.id === 'hushbell' ? 'Silent: ring the echo bells' : 'Ring its glowing knots'), 'info'); }
      return rang;
    }
    const dmg = Math.max(1, Math.round(damage * k));
    this.hp -= dmg; this.flash = .08;
    for (const m of this.mats) m.emissive.setScalar(.6);
    this.fx.text(this.pos.clone().setY(this.pos.y + 3), String(dmg), k > 1 ? 'crit' : 'hit');
    this.fx.burst(this.pos.clone().setY(this.pos.y + 1.6), '#c9b8ff', 6, { speed: 4, up: 3, size: .14, life: .5 });
    if (this.hp <= 0) this.break();
    return dmg + rang;
  }

  private break() {
    this.broken = true; this.hp = 0; this.view.visible = false; this.shieldMesh.visible = false;
    this.pending = null; this.dropAnchor();
    for (const d of this.domes) d.t = Math.min(d.t, .3);
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
    this.updateDomes(dt);
    if (this.broken) return;
    if (this.flash > 0) { this.flash -= dt; if (this.flash <= 0) for (const m of this.mats) m.emissive.setScalar(0); }
    const k = this.keeper.pos, d = flat(k, this.pos);
    if (!this.shielded && this.keeper.alive() && d < 15) this.awake = true;
    if (this.awake && (!this.keeper.alive() || d > 26)) { this.awake = false; this.pending = null; this.hp = this.max; this.resetTricks(); }
    this.animate(dt);
    if (!this.awake || this.shielded) return;
    if (this.id === 'clamhive' && this.openT > 0) this.openT -= dt;
    if (this.id === 'greyheart') {
      this.songT += dt; this.songWindow = Math.max(0, this.songWindow - dt);
      if (this.songT >= HEART.songEvery) { this.songT = 0; this.songWindow = HEART.songSeconds; this.events.song(); this.fx.ring(this.pos, '#ffe28a', 2, 18, 1.4); }
    }
    if (this.id === 'hushbell' && this.crackT > 0) { this.crackT -= dt; if (this.crackT <= 0) { this.crackT = 0; this.echoes.forEach(e => { e.rung = false; }); this.fx.text(this.pos.clone().setY(3.5), t('The silence closes again…'), 'info'); } }
    // The anchor holds the captain; the dizzy wyrm lies on the deck: no moves until it is over.
    if (this.stuckT > 0) { this.stuckT -= dt; if (this.stuckT <= 0) { this.stuckT = 0; this.dropAnchor(); this.moveT = 1; } return; }
    if (this.dizzyT > 0) { this.dizzyT -= dt; if (this.dizzyT <= 0) { this.dizzyT = 0; this.resetTricks(); this.fx.text(this.pos.clone().setY(3.5), t('It coils up again!'), 'info'); this.moveT = 1.2; } return; }
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
  /** Knots grow back and echo bells go quiet (after a dizzy spell, or when the Captain leaves the arena). */
  private resetTricks() {
    for (const kn of this.knots) { kn.rings = WYRM.knotRings; if (kn.node) kn.node.visible = true; }
    for (const e of this.echoes) e.rung = false;
    this.crackT = 0; this.dizzyT = 0; this.stuckT = 0; this.dropAnchor();
  }

  private begin(move: HiveMove) {
    const k = this.keeper.pos, m = HIVE_MOVES[move] as { windup?: number; radius?: number; safe?: number; length?: number; width?: number; count?: number };
    const windup = m.windup ?? .8, dir = Math.atan2(k.x - this.pos.x, k.z - this.pos.z);
    const target = k.clone();
    switch (move) {
      case 'thornRing': this.fx.telegraph('ring', this.pos, { radius: m.radius, inner: this.safe, seconds: windup }); break;
      case 'tideRing': this.fx.telegraph('ring', this.pos, { radius: m.radius, inner: this.safe, seconds: windup, color: '#3cc8ff' }); break;
      case 'frostRing': this.fx.telegraph('ring', this.pos, { radius: m.radius, inner: this.safe, seconds: windup, color: '#bfe8ff' }); break;
      case 'chainSweep': this.fx.telegraph('ring', this.pos, { radius: m.radius, inner: this.radius + .6, seconds: windup, color: '#ffd27a' }); this.fx.text(k.clone().setY(k.y + 1.8), t('Hop!'), 'crit'); break;
      case 'spikeLines': for (let i = 0; i < (m.count ?? 3); i++) this.fx.telegraph('line', this.pos, { length: m.length, width: m.width, angle: dir + (i - 1) * .45, seconds: windup }); break;
      case 'crackLines': for (let i = 0; i < (m.count ?? 2); i++) this.fx.telegraph('line', this.pos, { length: m.length, width: m.width, angle: dir + (i === 0 ? -.18 : .18), seconds: windup, color: '#b26bff' }); break;
      case 'slam': case 'headStrike': this.fx.telegraph('disc', new T.Vector3(k.x, k.y, k.z), { radius: m.radius, seconds: windup }); break;
      case 'anchorThrow': this.fx.telegraph('disc', new T.Vector3(k.x, k.y, k.z), { radius: m.radius, seconds: windup, color: '#ffd27a' }); break;
      case 'hushDome': this.fx.telegraph('disc', new T.Vector3(k.x, k.y, k.z), { radius: m.radius, seconds: windup, color: '#9ad8ff' }); break;
      case 'pearlVolley': case 'iceShards': case 'spitShards': this.fx.telegraph('line', this.pos, { length: 6, width: 2.4, angle: dir, seconds: windup, color: '#ffffff' }); break;
      case 'wake': case 'callFlyers': case 'callPuffcaps': case 'callCrew': this.fx.ring(this.pos, '#b26bff', 1, 5, .6); break;
    }
    // The Clamhive shuts as it winds up, and gapes only after the blow (logic review 8).
    if (this.id === 'clamhive') this.openT = 0;
    const summon = move === 'wake' || move === 'callFlyers' || move === 'callPuffcaps' || move === 'callCrew';
    this.pending = { move, at: this.t + (summon ? .6 : windup), target, dir };
    this.events.sound('windup');
  }

  private land(p: { move: HiveMove; target: T.Vector3; dir: number }) {
    this.pending = null;
    this.moveT = HIVE_PACE;
    const k = this.keeper.pos, d = flat(k, this.pos), m = HIVE_MOVES[p.move] as { damage?: number; radius?: number; safe?: number; length?: number; width?: number; count?: number; speed?: number; spread?: number; seconds?: number };
    const dmg = Math.round((m.damage ?? 0) * TIERS[this.tier].damage);
    const onLine = (angle: number) => {
      const fx = Math.sin(angle), fz = Math.cos(angle), dx = k.x - this.pos.x, dz = k.z - this.pos.z;
      const along = dx * fx + dz * fz, across = Math.abs(dx * fz - dz * fx);
      return along > 0 && along < (m.length ?? 10) && across < (m.width ?? 1.2) / 2 + .3;
    };
    const ring = (color: string, inner = this.safe) => { if (d > inner && d < (m.radius ?? 9)) this.keeper.hurt(dmg, this.pos); this.fx.ring(this.pos, color, inner, m.radius, .5); };
    const mouth = this.pos.clone().setY(this.pos.y + (this.id === 'coilwyrm' ? 3 : 0));
    switch (p.move) {
      case 'thornRing': ring('#b26bff'); break;
      case 'tideRing': ring('#3cc8ff'); break;
      case 'frostRing': ring('#bfe8ff'); this.fx.burst(this.pos, '#ffffff', 16, { speed: 8, up: 2 }); break;
      // The chain sweeps the deck at shin height: a hop (its moment of invulnerability) clears it.
      case 'chainSweep': ring('#ffd27a', this.radius + .6); break;
      case 'spikeLines': if ([-1, 0, 1].some(i => onLine(p.dir + i * .45))) this.keeper.hurt(dmg, this.pos); this.fx.burst(this.pos, '#9a8cc8', 14, { speed: 9, up: 2 }); break;
      case 'crackLines': if ([-.18, .18].some(a => onLine(p.dir + a))) this.keeper.hurt(dmg, this.pos); this.fx.burst(this.pos, '#b26bff', 16, { speed: 9, up: 2 }); break;
      case 'slam': case 'headStrike': if (flat(k, p.target) < (m.radius ?? 3)) this.keeper.hurt(dmg, p.target); this.fx.ring(p.target, '#ffffff', .5, (m.radius ?? 3) * 1.4, .4); this.fx.shake(.35); break;
      case 'anchorThrow': {
        if (flat(k, p.target) < (m.radius ?? 2)) this.keeper.hurt(dmg, p.target);
        this.fx.ring(p.target, '#ffd27a', .5, (m.radius ?? 2) * 1.4, .4); this.fx.shake(.4);
        // The anchor bites into the deck and holds the captain fast: strike now.
        this.stuckT = BARNACLE.stuck; this.throwAnchor(p.target);
        this.fx.text(this.pos.clone().setY(3.2), t('Stuck! Strike!'), 'crit');
        break;
      }
      case 'hushDome': this.addDome(p.target, m.radius ?? 3, m.seconds ?? 6); break;
      // Volleys fly where the wind-up pointed, so dodging the white line works (logic review 21).
      case 'pearlVolley': case 'iceShards': case 'spitShards': this.combat.volley(mouth, p.target, m.count ?? 5, m.spread ?? .9, m.speed ?? 10, dmg); break;
      case 'wake': case 'callCrew': for (let i = 0; i < (m.count ?? 2); i++) this.summon('gloomling', i); break;
      case 'callFlyers': for (let i = 0; i < (m.count ?? 2); i++) this.summon('flyer', i); break;
      case 'callPuffcaps': for (let i = 0; i < (m.count ?? 2); i++) this.summon('puffcap', i); break;
    }
    if (this.id === 'clamhive') this.openT = CLAM.openSeconds;
    this.events.sound(p.move === 'slam' || p.move === 'headStrike' || p.move === 'anchorThrow' ? 'slam' : p.move === 'hushDome' ? 'shield' : 'blast');
  }

  private summon(kind: 'gloomling' | 'flyer' | 'puffcap', i: number) {
    if (this.combat.aliveCount() > 8) return;
    const a = this.t * 1.7 + i * 2.4, at = new T.Vector3(this.pos.x + Math.cos(a) * (this.radius + 1.5), 0, this.pos.z + Math.sin(a) * (this.radius + 1.5));
    this.combat.ground.clamp(at);
    this.combat.spawn(kind, at, this.tier, { alert: true, reward: false });
  }

  // ------------------------------------------------------------ the tricks
  private addDome(at: T.Vector3, r: number, seconds: number) {
    const mesh = new T.Mesh(new T.SphereGeometry(r, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), new T.MeshBasicMaterial({ color: '#bfe2ff', transparent: true, opacity: 0, depthWrite: false, side: T.DoubleSide }));
    mesh.position.set(at.x, at.y, at.z);
    this.combat.group.add(mesh);
    this.domes.push({ pos: at.clone(), r, t: seconds, mesh });
    this.fx.text(at.clone().setY(at.y + 2), t('Silence!'), 'info');
  }
  private updateDomes(dt: number) {
    for (const d of this.domes) {
      d.t -= dt;
      const mat = d.mesh.material as T.MeshBasicMaterial;
      mat.opacity = Math.max(0, Math.min(.32, d.t * .6, (6 - d.t) * 1.2));
      d.mesh.scale.y = .9 + Math.sin(this.t * 2) * .03;
    }
    this.domes = this.domes.filter(d => { if (d.t > 0) return true; this.combat.group.remove(d.mesh); d.mesh.geometry.dispose(); (d.mesh.material as T.Material).dispose(); return false; });
  }
  private throwAnchor(at: T.Vector3) {
    this.dropAnchor();
    const held = findChild(this.view, 'anchor');
    const a = held ? held.clone() : standIn('box', '#8c86a8', .8);
    if (held) held.visible = false;
    a.position.set(at.x, at.y, at.z); a.rotation.set(0, Math.atan2(at.x - this.pos.x, at.z - this.pos.z), .4);
    a.scale.setScalar(MODEL_SCALE[this.id] ?? 1);
    this.combat.group.add(a); this.anchor = a;
    const line = new T.Line(new T.BufferGeometry().setFromPoints([this.pos.clone().setY(this.pos.y + 1.8), at.clone().setY(at.y + .4)]), new T.LineBasicMaterial({ color: '#d6cfee' }));
    line.frustumCulled = false; this.combat.group.add(line); this.chain = line;
  }
  private dropAnchor() {
    if (this.anchor) { this.combat.group.remove(this.anchor); this.anchor = null; const held = findChild(this.view, 'anchor'); if (held) held.visible = true; }
    if (this.chain) { this.combat.group.remove(this.chain); this.chain.geometry.dispose(); this.chain = null; }
  }

  /** Animated parts, found once (code review 15). */
  private parts = new Map<string, T.Object3D | null>();
  private node(name: string) { if (!this.parts.has(name)) this.parts.set(name, findChild(this.view, name)); return this.parts.get(name) ?? null; }
  private animate(dt: number) {
    const v = this.view, t = this.t, winding = !!this.pending;
    if (this.id === 'thornhive') { v.rotation.y += dt * (winding ? 1.6 : .25); v.scale.setScalar(1 + (winding ? Math.sin(t * 20) * .02 : 0)); }
    if (this.id === 'clamhive') { const top = this.node('shell_top'); if (top) top.rotation.x += ((this.openT > 0 ? -.75 : -.08) - top.rotation.x) * (1 - Math.exp(-8 * dt)); }
    if (this.id === 'forgehive') { for (const n of ['arm_l', 'arm_r']) { const a = this.node(n); if (a) a.rotation.x = winding ? -2.2 : Math.sin(t * 1.4) * .15; } v.position.y = this.pos.y + Math.sin(t * 1.2) * .05; }
    if (this.id === 'greyheart') {
      for (let i = 0; i < 6; i++) { const s = this.node(`shard_${i}`); if (s) { const a = t * .6 + i * Math.PI / 3; s.position.set(Math.cos(a) * 4, 2.6 + Math.sin(t * 1.3 + i) * .5, Math.sin(a) * 4); } }
      const core = this.node('core'); if (core) core.scale.setScalar(1 + Math.sin(t * 4) * .06 + (this.songWindow > 0 ? .2 : 0));
    }
    if (this.id === 'hushbell') {
      const bell = this.node('bell'), ice = this.node('ice');
      if (bell) bell.rotation.z = Math.sin(t * (this.crackT > 0 ? 3 : 1.1)) * (this.crackT > 0 ? .16 : .03) + (winding ? Math.sin(t * 25) * .02 : 0);
      if (ice) ice.visible = this.crackT <= 0;
      for (const e of this.echoes) { e.wobble = Math.max(0, e.wobble - dt * 1.5); if (e.bell) e.bell.rotation.x = Math.sin(e.wobble * 26) * .3 * e.wobble + (e.rung ? .12 : 0); }
    }
    if (this.id === 'barnacle') {
      const l = this.node('claw_l'), r = this.node('claw_r'), body = this.node('body');
      if (l) l.rotation.x = winding ? -.9 + Math.sin(t * 22) * .1 : Math.sin(t * 1.6) * .12;
      if (r) r.rotation.x = this.stuckT > 0 ? -.6 : winding ? -1.4 : Math.sin(t * 1.6 + 1) * .12;
      if (body) body.position.y = 1.62 + Math.abs(Math.sin(t * 3)) * (this.stuckT > 0 ? 0 : .04);
      // It turns to face the Captain, but not while its anchor holds it fast.
      if (this.stuckT <= 0) { const want = Math.atan2(this.keeper.pos.x - this.pos.x, this.keeper.pos.z - this.pos.z), dd = Math.atan2(Math.sin(want - v.rotation.y), Math.cos(want - v.rotation.y)); v.rotation.y += dd * (1 - Math.exp(-2.5 * dt)); }
    }
    if (this.id === 'coilwyrm') {
      // It sways with its head up and rears back to strike; dizzy, the coils sag and the head lolls onto the deck.
      const head = this.node('head'), down = this.dizzyT > 0 ? 1 : 0;
      v.scale.y += ((MODEL_SCALE.coilwyrm! * (1 - .18 * down)) - v.scale.y) * (1 - Math.exp(-5 * dt));
      if (head) { head.rotation.x = down ? 1.1 + Math.sin(t * 2) * .08 : winding ? -.55 : Math.sin(t * 1.1) * .12; head.rotation.z = down ? .5 : Math.sin(t * 1.3) * .15; }
      for (const k of this.knots) if (k.node && k.rings > 0) k.node.scale.setScalar(1 + Math.sin(t * 5) * .08);
    }
  }
}

/** The glowing Note that flies up to Bao when a Hive breaks. */
export function noteView() {
  return part('hives', 'note') ?? (() => { const m = new T.Mesh(new T.OctahedronGeometry(.4, 0), makeToon('#ffd23a', { emissive: '#ffb000' })); const g = new T.Group(); g.add(m); return g; })();
}
