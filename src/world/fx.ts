import * as T from 'three';
import { Trauma } from '../core/feel.ts';
import { makeRng } from '../core/rng.ts';

/**
 * Effects, pooled so nothing is created during play:
 * - bits: small instanced chunks (shell shards, sparkles, leaves, splashes), one draw call;
 * - rings: expanding rings for hits, songs and landings;
 * - telegraphs: ground shapes that fill before a Gloom or Hive blow lands (wind-up ≥ 0.6 s, design §8);
 * - floating text (DOM) and camera shake (trauma², rotation only).
 * Effects use their own random stream, so adding a sparkle never changes gameplay.
 */
const MAX_BITS = 360;
interface Bit { alive: boolean; p: T.Vector3; v: T.Vector3; life: number; max: number; size: number; spin: number; gravity: number; color: T.Color }

export class Fx {
  group = new T.Group();
  trauma = new Trauma(1.1, 20);
  private rng = makeRng('fx');
  private bits: Bit[] = [];
  private bitMesh: T.InstancedMesh;
  private dummy = new T.Object3D();
  private rings: { mesh: T.Mesh<T.RingGeometry, T.MeshBasicMaterial>; life: number; max: number; from: number; to: number; alive: boolean }[] = [];
  private teles: Telegraph[] = [];
  private texts: { el: HTMLDivElement; p: T.Vector3; life: number; alive: boolean }[] = [];
  /** 0 disables shake (settings, reduced motion). */
  shakeScale = 1;

  constructor(textLayer: HTMLElement | null) {
    const geo = new T.IcosahedronGeometry(.5, 0);
    this.bitMesh = new T.InstancedMesh(geo, new T.MeshBasicMaterial({ color: '#ffffff', fog: true }), MAX_BITS);
    this.bitMesh.instanceColor = new T.InstancedBufferAttribute(new Float32Array(MAX_BITS * 3), 3);
    this.bitMesh.frustumCulled = false;
    this.bitMesh.count = 0;
    for (let i = 0; i < MAX_BITS; i++) this.bits.push({ alive: false, p: new T.Vector3(), v: new T.Vector3(), life: 0, max: 1, size: .1, spin: 0, gravity: 9, color: new T.Color() });
    this.group.add(this.bitMesh);
    for (let i = 0; i < 14; i++) {
      const mesh = new T.Mesh(new T.RingGeometry(.86, 1, 48).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ color: '#ffffff', transparent: true, depthWrite: false, side: T.DoubleSide }));
      mesh.visible = false; mesh.renderOrder = 2;
      this.rings.push({ mesh, life: 0, max: 1, from: 1, to: 2, alive: false });
      this.group.add(mesh);
    }
    for (let i = 0; i < 18; i++) { const t = new Telegraph(); this.teles.push(t); this.group.add(t.group); }
    if (textLayer) for (let i = 0; i < 28; i++) {
      const el = document.createElement('div'); el.className = 'float-text'; el.style.visibility = 'hidden'; textLayer.append(el);
      this.texts.push({ el, p: new T.Vector3(), life: 0, alive: false });
    }
  }

  /** A burst of `n` bits at `at`. */
  burst(at: T.Vector3, color: string | T.Color, n = 10, { speed = 4, up = 4, size = .12, life = .7, gravity = 12 } = {}) {
    const c = color instanceof T.Color ? color : new T.Color(color);
    for (let i = 0; i < n; i++) {
      const b = this.bits.find(x => !x.alive); if (!b) return;
      const a = this.rng.next() * Math.PI * 2, s = speed * (.4 + this.rng.next() * .6);
      b.alive = true; b.p.copy(at); b.v.set(Math.cos(a) * s, up * (.5 + this.rng.next() * .7), Math.sin(a) * s);
      b.life = 0; b.max = life * (.7 + this.rng.next() * .6); b.size = size * (.6 + this.rng.next() * .8); b.spin = this.rng.next() * 6; b.gravity = gravity;
      b.color.copy(c).offsetHSL(0, 0, (this.rng.next() - .5) * .12);
    }
  }
  /** Bits that rise and float (sparkles, notes, glimmer). */
  sparkle(at: T.Vector3, color: string, n = 8, life = 1.1) { this.burst(at, color, n, { speed: 1.2, up: 2.2, size: .09, life, gravity: -.4 }); }

  ring(at: T.Vector3, color: string, from = .4, to = 2.4, life = .45, opacity = .85) {
    const r = this.rings.find(x => !x.alive) ?? this.rings[0];
    r.alive = true; r.life = 0; r.max = life; r.from = from; r.to = to;
    r.mesh.position.copy(at); r.mesh.position.y += .05;
    r.mesh.material.color.set(color); r.mesh.material.opacity = opacity; r.mesh.visible = true;
    r.mesh.userData.opacity = opacity;
  }

  text(at: T.Vector3, label: string, kind: 'hit' | 'crit' | 'gain' | 'heal' | 'info' = 'hit') {
    const t = this.texts.find(x => !x.alive); if (!t) return;
    t.alive = true; t.life = 0; t.p.copy(at); t.el.textContent = label;
    const cls = `float-text ${kind}`; if (t.el.className !== cls) t.el.className = cls;
    t.el.style.visibility = 'visible';
  }

  telegraph(shape: 'ring' | 'disc' | 'line', at: T.Vector3, opts: { radius?: number; inner?: number; length?: number; width?: number; angle?: number; seconds: number; color?: string }) {
    const t = this.teles.find(x => !x.alive) ?? this.teles[0];
    t.show(shape, at, opts);
    return t;
  }

  /** Telegraphs run on game time (hit-stop and pauses hold them), so a wind-up never ends early on screen. */
  stepGame(dt: number) { for (const t of this.teles) t.update(dt); }

  shake(amount: number) { if (this.shakeScale > 0) this.trauma.add(amount * this.shakeScale); }

  update(dt: number, camera: T.Camera, width: number, height: number) {
    let n = 0;
    for (const b of this.bits) {
      if (!b.alive) continue;
      b.life += dt;
      if (b.life >= b.max) { b.alive = false; continue; }
      b.v.y -= b.gravity * dt; b.p.addScaledVector(b.v, dt);
      if (b.gravity > 0 && b.p.y < 0 && b.v.y < 0) { b.p.y = 0; b.v.multiplyScalar(.35); b.v.y = -b.v.y * .3; }
      const k = 1 - b.life / b.max;
      this.dummy.position.copy(b.p); this.dummy.rotation.set(b.spin * b.life, b.spin * b.life * .7, 0);
      this.dummy.scale.setScalar(b.size * (.4 + .6 * k)); this.dummy.updateMatrix();
      this.bitMesh.setMatrixAt(n, this.dummy.matrix); this.bitMesh.setColorAt(n, b.color); n++;
    }
    this.bitMesh.count = n;
    this.bitMesh.instanceMatrix.needsUpdate = true;
    if (this.bitMesh.instanceColor) this.bitMesh.instanceColor.needsUpdate = true;
    for (const r of this.rings) {
      if (!r.alive) continue;
      r.life += dt; const k = r.life / r.max;
      if (k >= 1) { r.alive = false; r.mesh.visible = false; continue; }
      const e = 1 - (1 - k) ** 3;
      r.mesh.scale.setScalar(r.from + (r.to - r.from) * e);
      r.mesh.material.opacity = (r.mesh.userData.opacity as number) * (1 - k);
    }
    const v = new T.Vector3();
    for (const t of this.texts) {
      if (!t.alive) continue;
      t.life += dt;
      if (t.life > .95) { t.alive = false; t.el.style.visibility = 'hidden'; continue; }
      v.copy(t.p); v.y += .8 + t.life * 1.3; v.project(camera);
      if (v.z > 1) { t.el.style.visibility = 'hidden'; continue; }
      if (t.el.style.visibility !== 'visible') t.el.style.visibility = 'visible';
      const x = (v.x * .5 + .5) * width, y = (-v.y * .5 + .5) * height;
      t.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%) scale(${(1 + Math.max(0, .25 - t.life) * 1.6).toFixed(3)})`;
      t.el.style.opacity = String(Math.min(1, (1 - t.life) * 2.5));
    }
    this.trauma.update(dt);
  }
}

const TELE_RED = '#ff5a3c';
/** Telegraph shapes by size, built once (code review 17). */
const SHAPES = new Map<string, T.BufferGeometry>();
const shapeOf = (key: string, make: () => T.BufferGeometry) => { let g = SHAPES.get(key); if (!g) { g = make(); SHAPES.set(key, g); } return g; };
export class Telegraph {
  group = new T.Group();
  alive = false;
  t = 0;
  seconds = 1;
  private edge: T.Mesh<T.BufferGeometry, T.MeshBasicMaterial>;
  private fill: T.Mesh<T.BufferGeometry, T.MeshBasicMaterial>;
  shape: 'ring' | 'disc' | 'line' = 'disc';
  constructor() {
    const mat = () => new T.MeshBasicMaterial({ color: TELE_RED, transparent: true, depthWrite: false, opacity: .5, side: T.DoubleSide });
    this.edge = new T.Mesh(new T.BufferGeometry(), mat());
    this.fill = new T.Mesh(new T.BufferGeometry(), mat());
    this.edge.renderOrder = this.fill.renderOrder = 3;
    this.group.add(this.edge, this.fill); this.group.visible = false;
  }
  show(shape: 'ring' | 'disc' | 'line', at: T.Vector3, o: { radius?: number; inner?: number; length?: number; width?: number; angle?: number; seconds: number; color?: string }) {
    this.alive = true; this.t = 0; this.seconds = o.seconds; this.shape = shape;
    this.group.position.set(at.x, at.y + .06, at.z); this.group.rotation.set(0, o.angle ?? 0, 0); this.group.visible = true;
    if (shape === 'line') {
      const L = o.length ?? 6, W = o.width ?? 1.2;
      this.edge.geometry = shapeOf(`l${W}:${L}`, () => new T.PlaneGeometry(W, L).rotateX(-Math.PI / 2).translate(0, 0, L / 2));
      this.fill.geometry = this.edge.geometry;
    } else if (shape === 'ring') {
      const R = o.radius ?? 6, r = o.inner ?? R * .5;
      this.edge.geometry = shapeOf(`r${r}:${R}`, () => new T.RingGeometry(r, R, 56).rotateX(-Math.PI / 2));
      this.fill.geometry = this.edge.geometry;
    } else {
      const R = o.radius ?? 1.6;
      this.edge.geometry = shapeOf(`e${R}`, () => new T.RingGeometry(R * .9, R, 40).rotateX(-Math.PI / 2));
      this.fill.geometry = shapeOf(`d${R}`, () => new T.CircleGeometry(R, 40).rotateX(-Math.PI / 2));
    }
    this.edge.material.color.set(o.color ?? TELE_RED); this.fill.material.color.set(o.color ?? TELE_RED);
    this.update(0);
  }
  update(dt: number) {
    if (!this.alive) return;
    this.t += dt;
    const k = Math.min(1, this.t / this.seconds);
    this.edge.material.opacity = .55 + .35 * Math.sin(this.t * 18) * (k > .7 ? 1 : .3);
    this.fill.material.opacity = .14 + .32 * k;
    if (this.shape === 'line') this.fill.scale.set(1, 1, Math.max(.01, k));
    else this.fill.scale.setScalar(this.shape === 'disc' ? Math.max(.01, k) : 1);
    if (this.t >= this.seconds + .12) this.hide();
  }
  hide() { this.alive = false; this.group.visible = false; }
}
