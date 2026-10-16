import * as T from 'three';
import { findChild, part, standIn } from './assets.ts';
import { damp } from '../core/feel.ts';

/** A soft round shadow under every character and creature: cheaper and more readable than shadow-mapped feet. */
const BLOB_TEX = (() => {
  const size = 64, data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const d = Math.hypot(x - size / 2 + .5, y - size / 2 + .5) / (size / 2);
    const a = Math.max(0, 1 - d) ** 1.6;
    data.set([20, 24, 48, Math.round(a * 150)], (y * size + x) * 4);
  }
  const tex = new T.DataTexture(data, size, size); tex.needsUpdate = true; tex.magFilter = T.LinearFilter; tex.minFilter = T.LinearFilter;
  return tex;
})();
const BLOB_GEO = new T.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
const BLOB_MAT = new T.MeshBasicMaterial({ map: BLOB_TEX, transparent: true, depthWrite: false, fog: true });
export function blobShadow(radius: number) {
  const m = new T.Mesh(BLOB_GEO, BLOB_MAT);
  m.scale.setScalar(radius * 2); m.position.y = .03; m.renderOrder = 1;
  return m;
}

type Limb = 'body' | 'head' | 'arm_l' | 'arm_r' | 'leg_l' | 'leg_r';
export type ActorAction = 'none' | 'swing' | 'spin' | 'hop' | 'cheer' | 'climb' | 'cast' | 'hurt' | 'faint';

/** A person (the Keeper or crew): root → model with limbs animated by code (no skeletons, design §16). */
export class Actor {
  root = new T.Group();
  model: T.Object3D;
  limbs: Partial<Record<Limb, T.Object3D>> = {};
  rest = new Map<T.Object3D, T.Euler>();
  mallet: T.Object3D | null = null;
  /** Planar speed this frame (m/s), set by whoever moves the actor. */
  speed = 0;
  facing = 0;
  private turn = 0;
  private phase = 0;
  action: ActorAction = 'none';
  actionT = 0;
  actionLen = .2;
  flash = 0;
  private flashMats: T.MeshToonMaterial[] = [];
  readonly height: number;

  constructor(file: 'keeper' | 'crew', name: string, color = '#16a9a0') {
    const model = part(file, name);
    this.model = model ?? standIn('person', color);
    this.height = model ? new T.Box3().setFromObject(model).getSize(new T.Vector3()).y : 1.1;
    for (const limb of ['body', 'head', 'arm_l', 'arm_r', 'leg_l', 'leg_r'] as Limb[]) {
      const o = findChild(this.model, limb);
      if (o) { this.limbs[limb] = o; this.rest.set(o, o.rotation.clone()); }
    }
    this.mallet = findChild(this.model, 'mallet');
    this.root.add(this.model, blobShadow(.42));
    // Own copies of the materials so a hit flash lights only this actor.
    this.model.traverse(o => {
      const mesh = o as T.Mesh;
      if (!mesh.isMesh) return;
      const own = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map(m => (m as T.MeshToonMaterial).clone());
      mesh.material = own.length === 1 ? own[0] : own;
      this.flashMats.push(...own);
    });
  }

  play(action: ActorAction, seconds: number) { this.action = action; this.actionT = 0; this.actionLen = seconds; }
  lookAt(x: number, z: number) { this.facing = Math.atan2(x - this.root.position.x, z - this.root.position.z); }

  private rot(limb: Limb, x = 0, y = 0, z = 0) {
    const o = this.limbs[limb]; if (!o) return;
    const r = this.rest.get(o)!;
    o.rotation.set(r.x + x, r.y + y, r.z + z);
  }

  update(dt: number) {
    // Turn toward the facing angle by the shortest way.
    let d = this.facing - this.turn; d = Math.atan2(Math.sin(d), Math.cos(d));
    this.turn += d * (1 - Math.exp(-16 * dt));
    this.root.rotation.y = this.turn;
    const moving = Math.min(1, this.speed / 4);
    this.phase += dt * (4 + this.speed * 2.2);
    const swing = Math.sin(this.phase) * .75 * moving;
    let armR = -swing * .8, armL = swing * .8, armRz = 0, armLz = 0, bob = Math.abs(Math.sin(this.phase)) * .05 * moving, spin = 0, squash = 1;
    const breath = Math.sin(this.phase * .35) * .015 * (1 - moving);
    if (this.action !== 'none') {
      this.actionT += dt;
      const k = Math.min(1, this.actionT / this.actionLen);
      switch (this.action) {
        case 'swing': armR = k < .35 ? -2.6 * (k / .35) : -2.6 + 3.4 * ((k - .35) / .65); break;
        case 'spin': spin = k * Math.PI * 2; armRz = -1.35; armLz = 1.35; armR = armL = 0; break;
        case 'hop': squash = k < .2 ? 1 - k * 1.2 : 1 + Math.sin((k - .2) / .8 * Math.PI) * .12; break;
        case 'cheer': armR = armL = -2.7 + Math.sin(this.actionT * 14) * .25; bob = Math.abs(Math.sin(this.actionT * 9)) * .12; break;
        case 'climb': armR = -2.6 + Math.sin(this.actionT * 10) * .4; armL = -2.6 - Math.sin(this.actionT * 10) * .4; break;
        case 'cast': armR = k < .4 ? -2.4 * (k / .4) : -2.4 + 2.0 * Math.min(1, (k - .4) / .3); break;
        case 'hurt': bob = -.04; squash = .92 + k * .08; break;
        case 'faint': spin = 0; squash = 1 - k * .4; break;
      }
      if (k >= 1 && this.action !== 'climb' && this.action !== 'faint') this.action = 'none';
    }
    this.rot('leg_l', swing, 0, 0); this.rot('leg_r', -swing, 0, 0);
    this.rot('arm_l', armL, 0, armLz); this.rot('arm_r', armR, 0, armRz);
    this.rot('head', 0, Math.sin(this.phase * .5) * .06 * (1 - moving), 0);
    this.model.position.y = bob + breath;
    this.model.rotation.y = spin;
    this.model.scale.set(1 / Math.sqrt(squash), squash, 1 / Math.sqrt(squash));
    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dt);
      const v = this.flash > 0 ? .9 : 0;
      for (const m of this.flashMats) m.emissive.setScalar(v);
    }
  }
  hit() { this.flash = .08; for (const m of this.flashMats) m.emissive.setScalar(.9); }
}

/** Smoothly moves an actor toward a point (crew wandering, followers). Returns true when there. */
export function walkTo(a: Actor, x: number, z: number, speed: number, dt: number, stop = .15) {
  const p = a.root.position, dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz);
  if (d <= stop) { a.speed = damp(a.speed, 0, 12, dt); return true; }
  const step = Math.min(d, speed * dt);
  p.x += dx / d * step; p.z += dz / d * step;
  a.speed = speed; a.facing = Math.atan2(dx, dz);
  return false;
}
