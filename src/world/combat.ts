import * as T from 'three';
import { ATTACKS, FORMS, KEEPER, POST, RAID, RESCUE, SPIRE, type FormId } from '../rules/content.ts';
import { formStats, spireStats } from '../rules/isle.ts';
import { findChild, part, standIn } from './assets.ts';
import { blobShadow } from './actors.ts';
import { makeToon } from './look.ts';
import type { Fx } from './fx.ts';
import type { Blocker } from './isle-view.ts';
import { makeRng } from '../core/rng.ts';

/** What the fight needs from the Keeper (the controller owns mercy frames, knockback and fainting). */
export interface KeeperLink { pos: T.Vector3; alive(): boolean; hurt(raw: number, from: T.Vector3): void }
export interface Ground { height(x: number, z: number): number; clamp(p: T.Vector3): void; blockers: Blocker[] }
export interface CombatEvents {
  freed(form: FormId, at: T.Vector3, group: number, raid: boolean, reward: boolean): void;
  spire(index: number, at: T.Vector3): void;
  cage(index: number, at: T.Vector3): void;
  crust(plot: number): void;
  sound(name: string, at?: T.Vector3): void;
  freeze(seconds: number): void;
}

type FormState = 'idle' | 'chase' | 'windup' | 'act' | 'recover' | 'return' | 'crust' | 'freed';
export class Form {
  kind: FormId; pos = new T.Vector3(); home = new T.Vector3(); vel = new T.Vector3();
  hp: number; max: number; damage: number; tier: number;
  state: FormState = 'idle'; t = 0; cd = 1; alert = false;
  group: number; spire: number; raid: boolean;
  view: T.Group; body: T.Object3D; native: T.Object3D | null = null;
  aim = new T.Vector3(); dir = new T.Vector3(); charged = 0; hitDone = false;
  wander = 0; plot = -1; crustT = 0; flash = 0; hover = 0; orbit = 0;
  /** False for Gloomlings a Spire or Hive woke (they were only napping: no reward). */
  reward = true;
  /** Seconds left of a Chime Post slow. */
  slow = 0;
  private mats: T.MeshToonMaterial[] = [];
  static made = 0;
  constructor(kind: FormId, tier: number, scale: number, group: number, spire: number, raid: boolean) {
    const st = formStats(kind, tier, scale);
    this.kind = kind; this.tier = tier; this.hp = this.max = st.hp; this.damage = st.damage;
    this.group = group; this.spire = spire; this.raid = raid;
    this.view = new T.Group();
    this.body = part('gloom', kind, { shadows: false }) ?? standIn('blob', '#8c86a8', kind === 'brute' ? 1.8 : kind === 'flyer' ? .9 : 1);
    this.body.traverse(o => { const m = o as T.Mesh; if (m.isMesh) { const own = (m.material as T.MeshToonMaterial).clone(); m.material = own; this.mats.push(own); } });
    this.view.add(this.body, blobShadow(FORMS[kind].radius * 1.1));
    this.orbit = (Form.made++ * 2.39996) % (Math.PI * 2);
  }
  get radius() { return FORMS[this.kind].radius; }
  get dead() { return this.state === 'freed'; }
  hitFlash() { this.flash = .09; for (const m of this.mats) m.emissive.setScalar(.85); }
  updateFlash(dt: number) {
    if (this.flash <= 0) return;
    this.flash -= dt;
    if (this.flash <= 0) for (const m of this.mats) m.emissive.setScalar(0);
  }
}

export class Spire {
  pos: T.Vector3; hp: number; max: number; view: T.Object3D; index: number; wakeT = 0; awake = 0; broken = false; flash = 0;
  constructor(index: number, at: T.Vector3, tier: number) {
    const st = spireStats(tier);
    this.index = index; this.pos = at.clone(); this.hp = this.max = st.hp;
    this.view = part('gloom', 'spire', { shadows: true }) ?? standIn('pillar', '#8c86a8', 1);
    this.view.position.copy(at);
  }
}

export class Cage {
  pos: T.Vector3; rings = RESCUE.rings; view: T.Object3D; index: number; open = false; shake = 0;
  constructor(index: number, at: T.Vector3) {
    this.index = index; this.pos = at.clone();
    this.view = part('gloom', 'cage') ?? (() => { const m = new T.Mesh(new T.CylinderGeometry(.75, .75, 2, 8, 1, true), makeToon('#8c86a8', { transparent: true, opacity: .55 })); m.position.y = 1; const g = new T.Group(); g.add(m); return g; })();
    this.view.position.copy(at);
  }
}

interface Shot { mesh: T.Mesh; vel: T.Vector3; life: number; damage: number; alive: boolean }

/** Gloom forms, Spires, cages and shards on one isle (or on Bao during a raid). The Hive lives in hive.ts. */
export class Combat {
  group = new T.Group();
  forms: Form[] = [];
  spires: Spire[] = [];
  cages: Cage[] = [];
  private shots: Shot[] = [];
  private natives: { o: T.Object3D; v: T.Vector3; t: number }[] = [];
  private rng = makeRng('combat');
  /** Plots a raid can crust: position, and whether something grows there and is still clean. */
  plots: { pos: T.Vector3; ok: boolean }[] = [];
  constructor(public fx: Fx, public keeper: KeeperLink, public ground: Ground, public events: CombatEvents) {
    const shardGeo = new T.OctahedronGeometry(.18, 0), shardMat = makeToon('#b26bff', { emissive: '#6a2dbf' });
    for (let i = 0; i < 24; i++) { const mesh = new T.Mesh(shardGeo, shardMat); mesh.scale.set(1, 1, 2.2); mesh.visible = false; this.group.add(mesh); this.shots.push({ mesh, vel: new T.Vector3(), life: 0, damage: 0, alive: false }); }
  }

  spawn(kind: FormId, at: T.Vector3, tier: number, opts: { scale?: number; group?: number; spire?: number; raid?: boolean; alert?: boolean; reward?: boolean } = {}) {
    const f = new Form(kind, tier, opts.scale ?? 1, opts.group ?? -1, opts.spire ?? -1, !!opts.raid);
    f.reward = opts.reward ?? true;
    f.pos.copy(at); f.home.copy(at); f.alert = !!opts.alert; f.cd = .6 + this.rng.next();
    f.pos.y = this.ground.height(at.x, at.z);
    f.view.position.copy(f.pos);
    this.forms.push(f); this.group.add(f.view);
    return f;
  }
  addSpire(index: number, at: T.Vector3, tier: number) { const s = new Spire(index, at, tier); s.pos.y = this.ground.height(at.x, at.z); s.view.position.copy(s.pos); this.spires.push(s); this.group.add(s.view); return s; }
  addCage(index: number, at: T.Vector3) { const c = new Cage(index, at); c.pos.y = this.ground.height(at.x, at.z); c.view.position.copy(c.pos); this.cages.push(c); this.group.add(c.view); return c; }

  clear() {
    for (const f of this.forms) this.group.remove(f.view);
    for (const s of this.spires) this.group.remove(s.view);
    for (const c of this.cages) this.group.remove(c.view);
    for (const n of this.natives) this.group.remove(n.o);
    this.forms = []; this.spires = []; this.cages = []; this.natives = [];
    for (const s of this.shots) { s.alive = false; s.mesh.visible = false; }
  }
  /** Forms of a group that are still crusted. */
  groupAlive(group: number) { return this.forms.some(f => f.group === group && !f.dead); }
  removeGroup(group: number) {
    this.forms = this.forms.filter(f => { if (f.group === group && !f.dead) { this.group.remove(f.view); return false; } return true; });
  }
  aliveCount() { return this.forms.filter(f => !f.dead).length; }

  /** The nearest thing worth ringing within `range` (auto-attack and tap targets). */
  nearest(p: T.Vector3, range: number): { pos: T.Vector3; kind: 'form' | 'spire' } | null {
    let best: { pos: T.Vector3; kind: 'form' | 'spire' } | null = null, bd = range;
    for (const f of this.forms) { if (f.dead) continue; const d = flat(p, f.pos) - f.radius; if (d < bd) { bd = d; best = { pos: f.pos, kind: 'form' }; } }
    for (const s of this.spires) { if (s.broken) continue; const d = flat(p, s.pos) - .6; if (d < bd) { bd = d; best = { pos: s.pos, kind: 'spire' }; } }
    return best;
  }

  /**
   * A ring of the bell mallet: every form, Spire and cage within `reach` in front (or all around for a spin)
   * takes `damage`. Returns how many things were hit.
   */
  strike(origin: T.Vector3, facing: number, reach: number, damage: number, spin = false, post = false) {
    let hits = 0, freedAny = false;
    const fx = Math.sin(facing), fz = Math.cos(facing);
    const inArc = (p: T.Vector3, r: number) => {
      const dx = p.x - origin.x, dz = p.z - origin.z, d = Math.hypot(dx, dz);
      if (d > reach + r) return false;
      if (spin || d < .6) return true;
      return (dx * fx + dz * fz) / d > .25;
    };
    for (const f of this.forms) {
      if (f.dead || !inArc(f.pos, f.radius)) continue;
      hits++;
      const dmg = Math.round(damage * (.92 + this.rng.next() * .16));
      f.hp -= dmg; f.hitFlash(); f.alert = true;
      if (post) f.slow = POST.slowFor;
      this.fx.text(f.pos, String(dmg), 'hit');
      this.fx.burst(f.pos.clone().setY(f.pos.y + .6), '#c9b8ff', 6, { speed: 3, up: 3, size: .1, life: .45 });
      const push = f.kind === 'brute' ? .15 : .55;
      const d = flat(origin, f.pos) || 1;
      f.pos.x += (f.pos.x - origin.x) / d * push; f.pos.z += (f.pos.z - origin.z) / d * push;
      if (f.state === 'windup' && f.kind !== 'brute') { f.state = 'recover'; f.t = 0; this.fx.text(f.pos, '!', 'info'); }
      if (f.hp <= 0) { this.free(f); freedAny = true; }
    }
    for (const s of this.spires) {
      if (s.broken || !inArc(s.pos, .7)) continue;
      hits++;
      const dmg = Math.round(damage);
      s.hp -= dmg; s.flash = .09;
      this.fx.text(s.pos.clone().setY(s.pos.y + 1.5), String(dmg), 'hit');
      this.fx.burst(s.pos.clone().setY(s.pos.y + 1.2), '#b26bff', 5, { speed: 3, up: 3, size: .12, life: .5 });
      if (s.hp <= 0) this.breakSpire(s);
    }
    for (const c of this.cages) {
      if (post || c.open || !inArc(c.pos, .8)) continue;
      hits++;
      c.rings--; c.shake = .25;
      this.fx.ring(c.pos, '#ffe28a', .5, 1.8, .35);
      this.events.sound('chime', c.pos);
      if (c.rings <= 0) { c.open = true; c.view.visible = false; this.fx.burst(c.pos.clone().setY(1), '#c9b8ff', 22, { speed: 5, up: 5, size: .16 }); this.fx.sparkle(c.pos.clone().setY(1.2), '#ffe28a', 14); this.events.cage(c.index, c.pos); }
    }
    if (hits && !post) { this.events.freeze(freedAny ? .12 : .05); this.events.sound(freedAny ? 'free' : 'ring', origin); this.fx.shake(freedAny ? .3 : .14); }
    else if (hits) this.events.sound(freedAny ? 'free' : 'chime', origin);
    return hits;
  }

  /** Bao's song (or the sunlight after a lost raid) frees every shell still standing: animals hop out, no rewards. */
  freeAll() { for (const f of this.forms) if (!f.dead) { f.reward = false; this.free(f); } }

  private free(f: Form) {
    f.state = 'freed'; f.hp = 0; f.t = 0;
    f.body.visible = false;
    const at = f.pos.clone().setY(f.pos.y + .5);
    this.fx.burst(at, '#9a8cc8', 16, { speed: 5, up: 5, size: .16, life: .8 });
    this.fx.sparkle(at, '#ffe28a', 8);
    this.fx.ring(f.pos, '#ffffff', .3, 2.2, .4, .7);
    const native = part('gloom', FORMS[f.kind].native) ?? standIn('blob', '#ffb0c8', .6);
    native.traverse(o => { const m = o as T.Mesh; if (m.isMesh && /eye|glow_gloom/.test((m.material as T.Material).name)) m.visible = false; });
    native.position.copy(f.pos);
    const away = new T.Vector3(f.pos.x - this.keeper.pos.x, 0, f.pos.z - this.keeper.pos.z).normalize().multiplyScalar(3.2);
    if (!Number.isFinite(away.x)) away.set(3, 0, 0);
    this.natives.push({ o: native, v: away, t: 0 });
    this.group.add(native);
    this.events.freed(f.kind, f.pos, f.group, f.raid, f.reward);
  }
  private breakSpire(s: Spire) {
    s.broken = true; s.view.visible = false;
    const at = s.pos.clone().setY(s.pos.y + 1.4);
    this.fx.burst(at, '#9a8cc8', 30, { speed: 7, up: 7, size: .22, life: 1 });
    this.fx.ring(s.pos, '#b26bff', .5, 6, .7);
    this.fx.shake(.45);
    this.events.freeze(.15);
    this.events.spire(s.index, s.pos);
  }

  private shoot(from: T.Vector3, to: T.Vector3, speed: number, damage: number, range: number) {
    const s = this.shots.find(x => !x.alive); if (!s) return;
    s.alive = true; s.damage = damage; s.life = range / speed;
    s.mesh.position.set(from.x, from.y + .7, from.z);
    s.vel.set(to.x - from.x, 0, to.z - from.z).normalize().multiplyScalar(speed);
    s.mesh.lookAt(s.mesh.position.clone().add(s.vel));
    s.mesh.visible = true;
  }
  /** A Hive's pearl volley uses the same shards. */
  volley(from: T.Vector3, to: T.Vector3, count: number, spread: number, speed: number, damage: number) {
    const base = Math.atan2(to.x - from.x, to.z - from.z);
    for (let i = 0; i < count; i++) {
      const a = base + (i - (count - 1) / 2) * spread / Math.max(1, count - 1);
      this.shoot(from, new T.Vector3(from.x + Math.sin(a), 0, from.z + Math.cos(a)), speed, damage, 16);
    }
  }

  update(dt: number) {
    const k = this.keeper.pos, alive = this.keeper.alive();
    for (const f of this.forms) this.think(f, dt, k, alive);
    // Keep forms apart, out of rocks and on the isle.
    for (let i = 0; i < this.forms.length; i++) {
      const a = this.forms[i]; if (a.dead) continue;
      for (let j = i + 1; j < this.forms.length; j++) {
        const b = this.forms[j]; if (b.dead) continue;
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, d = Math.hypot(dx, dz), min = a.radius + b.radius;
        if (d > 0 && d < min) { const push = (min - d) / 2 / d; a.pos.x -= dx * push; a.pos.z -= dz * push; b.pos.x += dx * push; b.pos.z += dz * push; }
      }
      for (const bl of this.ground.blockers) {
        const dx = a.pos.x - bl.x, dz = a.pos.z - bl.z, d = Math.hypot(dx, dz), min = bl.r + a.radius;
        if (d > 0 && d < min) { a.pos.x = bl.x + dx / d * min; a.pos.z = bl.z + dz / d * min; }
      }
      this.ground.clamp(a.pos);
    }
    for (const f of this.forms) this.draw(f, dt);
    for (const s of this.spires) this.tickSpire(s, dt, k, alive);
    for (const c of this.cages) if (c.shake > 0) { c.shake -= dt; c.view.rotation.z = Math.sin(c.shake * 60) * .06 * (c.shake / .25); }
    for (const s of this.shots) {
      if (!s.alive) continue;
      s.life -= dt; s.mesh.position.addScaledVector(s.vel, dt);
      if (alive && Math.hypot(s.mesh.position.x - k.x, s.mesh.position.z - k.z) < .55) { this.keeper.hurt(s.damage, s.mesh.position); s.life = 0; this.fx.burst(s.mesh.position, '#b26bff', 6); }
      if (s.life <= 0) { s.alive = false; s.mesh.visible = false; }
    }
    for (let i = this.natives.length - 1; i >= 0; i--) {
      const n = this.natives[i]; n.t += dt;
      n.o.position.addScaledVector(n.v, dt * Math.max(0, 1 - n.t / 2.6));
      n.o.position.y = this.ground.height(n.o.position.x, n.o.position.z) + Math.abs(Math.sin(n.t * 9)) * .35;
      n.o.rotation.y = Math.atan2(n.v.x, n.v.z);
      const s = n.t < .2 ? n.t / .2 * 1.15 : n.t > 2.4 ? Math.max(0, 1 - (n.t - 2.4) / .5) : 1;
      n.o.scale.setScalar(Math.max(.001, s));
      if (n.t > 2.9) { this.group.remove(n.o); this.natives.splice(i, 1); }
    }
    this.forms = this.forms.filter(f => { if (f.dead && f.t > 3) { this.group.remove(f.view); return false; } return true; });
  }

  private think(f: Form, dt: number, k: T.Vector3, alive: boolean) {
    f.t += dt; f.cd -= dt; f.updateFlash(dt);
    if (f.dead) return;
    f.slow = Math.max(0, f.slow - dt);
    const slowK = f.slow > 0 ? POST.slow : 1;
    const d = flat(f.pos, k);
    const toward = (x: number, z: number, speed: number) => { const dx = x - f.pos.x, dz = z - f.pos.z, L = Math.hypot(dx, dz); if (L > .05) { const s = Math.min(L, speed * slowK * dt); f.pos.x += dx / L * s; f.pos.z += dz / L * s; f.dir.set(dx / L, 0, dz / L); } };
    const aggro = f.kind === 'spitter' ? RAID.spitterAggro : RAID.aggro;
    const def = FORMS[f.kind];
    // Waking up: the whole group joins once one of them notices the Keeper.
    if (!f.alert && alive && (d < 8.5 || f.raid && d < aggro)) { f.alert = true; this.alertGroup(f.group); this.fx.text(f.pos, '!', 'info'); this.events.sound('notice', f.pos); }
    if (f.state === 'idle' || f.state === 'return') {
      if (f.raid) { this.raidThink(f, dt, k, d, alive, toward, aggro); return; }
      if (f.alert && alive) { f.state = 'chase'; f.t = 0; return; }
      if (flat(f.pos, f.home) > .5 && f.state === 'return') { toward(f.home.x, f.home.z, def.speed); if (flat(f.pos, f.home) <= .6) { f.state = 'idle'; f.hp = f.max; } return; }
      f.wander -= dt;
      if (f.wander <= 0) { f.wander = 2 + this.rng.next() * 3; f.aim.set(f.home.x + (this.rng.next() - .5) * 4, 0, f.home.z + (this.rng.next() - .5) * 4); }
      toward(f.aim.x, f.aim.z, def.speed * .3);
      return;
    }
    if (!alive || (!f.raid && flat(k, f.home) > 24)) { f.state = 'return'; f.alert = false; return; }
    if (f.raid && d > aggro + 2 && f.state === 'chase') { f.state = 'idle'; return; }
    switch (f.kind) {
      case 'gloomling': {
        const A = ATTACKS.bump;
        if (f.state === 'chase') { if (d > A.reach) toward(k.x, k.z, def.speed); else if (f.cd <= 0) { f.state = 'windup'; f.t = 0; } }
        else if (f.state === 'windup' && f.t >= A.windup) { f.state = 'act'; f.t = 0; if (d < A.reach + .45) this.keeper.hurt(f.damage, f.pos); this.events.sound('bump', f.pos); }
        else if (f.state === 'act' && f.t >= .15) { f.state = 'recover'; f.t = 0; f.cd = A.cooldown; }
        else if (f.state === 'recover' && f.t >= .4) { f.state = 'chase'; f.t = 0; }
        break;
      }
      case 'spitter': {
        const A = ATTACKS.shard;
        if (f.state === 'chase') {
          if (d > 6.5) toward(k.x, k.z, def.speed); else if (d < 4) toward(f.pos.x * 2 - k.x, f.pos.z * 2 - k.z, def.speed * .8);
          if (f.cd <= 0 && d < A.range) { f.state = 'windup'; f.t = 0; f.aim.copy(k); this.fx.telegraph('line', f.pos, { length: Math.min(A.range, d + 1.5), width: .7, angle: Math.atan2(k.x - f.pos.x, k.z - f.pos.z), seconds: A.windup }); }
        } else if (f.state === 'windup') { f.dir.set(f.aim.x - f.pos.x, 0, f.aim.z - f.pos.z).normalize(); if (f.t >= A.windup) { this.shoot(f.pos, f.aim, A.speed, f.damage, A.range + 1); this.events.sound('spit', f.pos); f.state = 'recover'; f.t = 0; f.cd = A.cooldown; } }
        else if (f.state === 'recover' && f.t >= .5) { f.state = 'chase'; f.t = 0; }
        break;
      }
      case 'brute': {
        const A = ATTACKS.charge;
        if (f.state === 'chase') {
          if (d > 6) toward(k.x, k.z, def.speed);
          if (f.cd <= 0 && d > 2 && d < A.length) { f.state = 'windup'; f.t = 0; f.dir.set(k.x - f.pos.x, 0, k.z - f.pos.z).normalize(); this.fx.telegraph('line', f.pos, { length: A.length + .5, width: 1.6, angle: Math.atan2(f.dir.x, f.dir.z), seconds: A.windup }); }
          else if (d <= 2 && f.cd <= 0) { f.state = 'windup'; f.t = 0; f.dir.set(k.x - f.pos.x, 0, k.z - f.pos.z).normalize(); this.fx.telegraph('line', f.pos, { length: 4, width: 1.6, angle: Math.atan2(f.dir.x, f.dir.z), seconds: A.windup }); }
        } else if (f.state === 'windup' && f.t >= A.windup) { f.state = 'act'; f.t = 0; f.charged = 0; f.hitDone = false; this.events.sound('charge', f.pos); }
        else if (f.state === 'act') {
          const step = A.speed * dt; f.pos.addScaledVector(f.dir, step); f.charged += step;
          if (!f.hitDone && flat(f.pos, k) < 1.15) { f.hitDone = true; this.keeper.hurt(f.damage, f.pos); }
          if (f.charged >= A.length) { f.state = 'recover'; f.t = 0; f.cd = A.cooldown; this.fx.burst(f.pos, '#c9a07a', 8, { speed: 2, up: 2 }); }
        } else if (f.state === 'recover' && f.t >= 1) { f.state = 'chase'; f.t = 0; }
        break;
      }
      case 'flyer': {
        const A = ATTACKS.dive;
        if (f.state === 'chase') {
          f.orbit += dt * .9;
          toward(k.x + Math.cos(f.orbit) * 4, k.z + Math.sin(f.orbit) * 4, def.speed);
          f.hover = Math.min(2.2, f.hover + dt * 3);
          if (f.cd <= 0 && d < 7) { f.state = 'windup'; f.t = 0; f.aim.copy(k); this.fx.telegraph('disc', new T.Vector3(k.x, this.ground.height(k.x, k.z), k.z), { radius: A.radius, seconds: A.windup }); }
        } else if (f.state === 'windup' && f.t >= A.windup) { f.state = 'act'; f.t = 0; f.dir.copy(f.pos); this.events.sound('dive', f.pos); }
        else if (f.state === 'act') {
          const k2 = Math.min(1, f.t / .25);
          f.pos.lerpVectors(f.dir, f.aim, k2); f.hover = 2.2 * (1 - k2);
          if (k2 >= 1) { if (flat(f.aim, k) < A.radius) this.keeper.hurt(f.damage, f.aim); this.fx.ring(f.aim, '#ffffff', .4, 2, .3); f.state = 'recover'; f.t = 0; f.cd = A.cooldown; }
        } else if (f.state === 'recover') { f.hover = Math.min(2.2, f.hover + dt * 2.5); if (f.t >= .9) { f.state = 'chase'; f.t = 0; } }
        break;
      }
    }
  }

  private raidThink(f: Form, dt: number, k: T.Vector3, d: number, alive: boolean, toward: (x: number, z: number, s: number) => void, aggro: number) {
    if (alive && d < aggro) { f.state = 'chase'; f.t = 0; return; }
    if (f.plot < 0 || !this.plots[f.plot]?.ok) {
      let best = -1, bd = Infinity;
      this.plots.forEach((p, i) => { if (!p.ok) return; const dd = flat(f.pos, p.pos); if (dd < bd) { bd = dd; best = i; } });
      f.plot = best; f.crustT = 0;
    }
    if (f.plot < 0) { toward(k.x, k.z, FORMS[f.kind].speed); return; }
    const p = this.plots[f.plot].pos;
    if (flat(f.pos, p) > .95) { toward(p.x, p.z, FORMS[f.kind].speed); return; }
    f.crustT += dt;
    if (Math.floor(f.crustT * 4) !== Math.floor((f.crustT - dt) * 4)) this.fx.burst(p.clone().setY(.6), '#9a8cc8', 2, { speed: 1, up: 1.5, size: .08, life: .4 });
    if (f.crustT >= RAID.crustAfter) { this.plots[f.plot].ok = false; this.events.crust(f.plot); f.plot = -1; f.crustT = 0; }
  }

  private alertGroup(group: number) { if (group < 0) return; for (const f of this.forms) if (f.group === group) f.alert = true; }

  private draw(f: Form, dt: number) {
    const y = this.ground.height(f.pos.x, f.pos.z);
    f.view.position.set(f.pos.x, y, f.pos.z);
    if (f.dead) return;
    const face = f.state === 'chase' || f.state === 'windup' ? Math.atan2(this.keeper.pos.x - f.pos.x, this.keeper.pos.z - f.pos.z) : Math.atan2(f.dir.x, f.dir.z);
    if (Number.isFinite(face)) f.view.rotation.y = face;
    let sy = 1, lift = 0;
    const hop = Math.abs(Math.sin(f.t * 8));
    if (f.kind === 'gloomling') { lift = f.state === 'chase' ? hop * .25 : 0; sy = f.state === 'windup' ? .75 : 1 + hop * .05; }
    if (f.kind === 'spitter') sy = f.state === 'windup' ? 1 + Math.sin(f.t * 30) * .06 + f.t * .2 : 1;
    if (f.kind === 'brute') sy = f.state === 'windup' ? .9 : 1;
    if (f.kind === 'flyer') { lift = f.hover + Math.sin(f.t * 5) * .15; const wl = findChild(f.body, 'wing_l'), wr = findChild(f.body, 'wing_r'); const flap = Math.sin(f.t * 16) * .7; if (wl) wl.rotation.z = flap; if (wr) wr.rotation.z = -flap; }
    f.body.position.y = lift;
    f.body.scale.set(1 / Math.sqrt(sy), sy, 1 / Math.sqrt(sy));
    void dt;
  }

  private tickSpire(s: Spire, dt: number, k: T.Vector3, alive: boolean) {
    if (s.broken) return;
    s.view.rotation.y += dt * .3;
    if (s.flash > 0) s.flash -= dt;
    if (!alive || flat(s.pos, k) > SPIRE.wakeRange) return;
    s.wakeT += dt;
    s.awake = this.forms.filter(f => f.spire === s.index && !f.dead).length;
    if (s.wakeT >= SPIRE.wakeEvery && s.awake < SPIRE.maxAwake) {
      s.wakeT = 0;
      const a = this.rng.next() * Math.PI * 2;
      const at = new T.Vector3(s.pos.x + Math.cos(a) * 1.6, 0, s.pos.z + Math.sin(a) * 1.6);
      const tier = this.formsTier;
      this.spawn('gloomling', at, tier, { spire: s.index, alert: true, reward: false });
      this.fx.burst(at.clone().setY(.5), '#9a8cc8', 8, { speed: 2, up: 3 });
    }
  }
  /** The isle tier, for forms woken by Spires. */
  formsTier = 0;
}

export const flat = (a: T.Vector3, b: T.Vector3) => Math.hypot(a.x - b.x, a.z - b.z);
export { KEEPER };
