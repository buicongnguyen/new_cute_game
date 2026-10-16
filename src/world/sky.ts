import * as T from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { bakedParts } from './assets.ts';
import { makeToon, type Look } from './look.ts';
import { makeRng } from '../core/rng.ts';

/**
 * The sky around Bao: a gradient dome, a cloud-sea floor that melts into the fog, and instanced cloud puffs that
 * stream past (slowly while hovering, fast while flying). Two materials for every puff (sunlit top, cool underside),
 * so the whole cloud field is two draw calls.
 */
const PUFFS = 150, HIGH = 26;
const SPAN = { x: 95, zMin: -150, zMax: 70 };

export class Sky {
  group = new T.Group();
  private dome: T.Mesh<T.SphereGeometry, T.ShaderMaterial>;
  private floor: T.Mesh<T.PlaneGeometry, T.MeshBasicMaterial>;
  private stars: T.Points;
  private puffMeshes: T.InstancedMesh[] = [];
  private puffs: { x: number; y: number; z: number; s: number; r: number; drift: number }[] = [];
  private dummy = new T.Object3D();
  /** A clear column (an isle floating below Bao shows through it). */
  hole: { x: number; z: number; r: number } | null = null;
  /** Metres per second the clouds stream toward +z. */
  speed = .8;
  target = .8;
  private materials: { mat: T.MeshLambertMaterial; shade: boolean }[] = [];

  constructor() {
    this.dome = new T.Mesh(new T.SphereGeometry(420, 32, 16), new T.ShaderMaterial({
      side: T.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new T.Color('#1f74ff') }, horizon: { value: new T.Color('#9fd8ff') }, sunDir: { value: new T.Vector3(.4, .55, -.7).normalize() }, sunColor: { value: new T.Color('#fff2cc') } },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 sunDir; uniform vec3 sunColor; varying vec3 vDir;
        void main(){ float h = clamp(vDir.y * 1.6 + .25, 0., 1.); vec3 c = mix(horizon, top, pow(h, .8));
          float sun = max(dot(normalize(vDir), sunDir), 0.); c += sunColor * (pow(sun, 60.) * .9 + pow(sun, 6.) * .18);
          gl_FragColor = vec4(c, 1.);
          #include <colorspace_fragment>
        }`,
    }));
    this.dome.renderOrder = -10; this.dome.frustumCulled = false;
    this.floor = new T.Mesh(new T.PlaneGeometry(900, 900), new T.MeshBasicMaterial({ color: '#b9c6f2' }));
    this.floor.rotation.x = -Math.PI / 2; this.floor.position.y = -42;
    const starGeo = new T.BufferGeometry(), pts: number[] = [], rng = makeRng('stars');
    for (let i = 0; i < 420; i++) {
      const a = rng.next() * Math.PI * 2, y = .08 + rng.next() * .92, r = Math.sqrt(1 - y * y);
      pts.push(Math.cos(a) * r * 400, y * 400, Math.sin(a) * r * 400);
    }
    starGeo.setAttribute('position', new T.Float32BufferAttribute(pts, 3));
    this.stars = new T.Points(starGeo, new T.PointsMaterial({ color: '#dfe8ff', size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: .9 }));
    this.stars.visible = false;
    this.group.add(this.dome, this.floor, this.stars);
    this.buildPuffs();
  }

  private buildPuffs() {
    const baked = bakedParts('nature', 'cloud_puff');
    const parts = baked ?? fallbackPuff();
    const rng = makeRng('clouds');
    for (let i = 0; i < PUFFS + HIGH; i++) {
      const high = i >= PUFFS;
      this.puffs.push({
        x: (rng.next() * 2 - 1) * SPAN.x, z: SPAN.zMin + rng.next() * (SPAN.zMax - SPAN.zMin),
        y: high ? 14 + rng.next() * 22 : -9 - rng.next() * 24, s: high ? 2.5 + rng.next() * 4 : 1.6 + rng.next() * 4.4,
        r: rng.next() * Math.PI * 2, drift: .6 + rng.next() * .8,
      });
    }
    for (const p of parts) {
      // Clouds use smooth Lambert shading: the toon bands made their facets read as paper plates.
      const src = p.material as T.MeshToonMaterial;
      const mat = new T.MeshLambertMaterial({ color: src.color.clone(), emissive: new T.Color('#ffffff'), emissiveIntensity: .22, fog: true });
      mat.name = src.name;
      // Weld the baked (non-indexed) triangles so the normals come out smooth.
      const geometry = mergeVertices(p.geometry, .02); geometry.computeVertexNormals();
      this.materials.push({ mat, shade: /shade/.test(p.material.name) || (!baked && this.materials.length === 1) });
      const mesh = new T.InstancedMesh(geometry, mat, this.puffs.length);
      mesh.frustumCulled = false;
      this.puffMeshes.push(mesh);
      this.group.add(mesh);
    }
    // Keep a hole under the deck so the whale never sits inside a cloud.
    for (const p of this.puffs) if (Math.abs(p.x) < 9 && p.z > -14 && p.z < 14 && p.y > -16) p.x += p.x < 0 ? -12 : 12;
    this.writePuffs();
  }

  private writePuffs() {
    for (let i = 0; i < this.puffs.length; i++) {
      const p = this.puffs[i];
      this.dummy.position.set(p.x, p.y, p.z);
      this.dummy.rotation.set(0, p.r, 0);
      const hidden = this.hole && p.y < -6 && Math.hypot(p.x - this.hole.x, p.z - this.hole.z) < this.hole.r + p.s * 2;
      this.dummy.scale.set(hidden ? 0 : p.s, hidden ? 0 : p.s * .78, hidden ? 0 : p.s * .9);
      this.dummy.updateMatrix();
      for (const m of this.puffMeshes) m.setMatrixAt(i, this.dummy.matrix);
    }
    for (const m of this.puffMeshes) m.instanceMatrix.needsUpdate = true;
  }

  /**
   * What lies far below the clouds (the owner): a green forest canopy, the sea, or only cloud tops when Bao flies high.
   * One plane with a small painted texture that scrolls past while Bao flies: no extra draw calls.
   */
  below: 'clouds' | 'forest' | 'sea' = 'clouds';
  private belowTex: Partial<Record<'forest' | 'sea', T.CanvasTexture>> = {};
  private look: Look | null = null;
  setBelow(kind: 'clouds' | 'forest' | 'sea') {
    if (kind === this.below) return;
    this.below = kind;
    const m = this.floor.material;
    m.map = kind === 'clouds' ? null : (this.belowTex[kind] ??= paintBelow(kind));
    m.needsUpdate = true;
    if (this.look) this.apply(this.look);
  }
  apply(look: Look) {
    this.look = look;
    this.dome.material.uniforms.top.value.set(look.skyTop);
    this.dome.material.uniforms.horizon.value.set(look.skyHorizon);
    this.dome.material.uniforms.sunColor.value.set(look.night ? '#6f86ff' : look.sun);
    if (this.below === 'clouds') this.floor.material.color.set(look.cloudShade).lerp(new T.Color(look.fog), .35);
    else this.floor.material.color.set('#ffffff').lerp(new T.Color(look.fog), look.night ? .7 : .15);
    this.stars.visible = look.night;
    for (const m of this.materials) m.mat.color.set(m.shade ? look.cloudShade : look.cloud);
  }

  /** `dt` real seconds; clouds stream toward +z (Bao flies toward −z). */
  update(dt: number, camera: T.Camera) {
    this.speed += (this.target - this.speed) * (1 - Math.exp(-1.2 * dt));
    for (const p of this.puffs) {
      p.z += this.speed * p.drift * dt;
      if (p.z > SPAN.zMax) { p.z -= SPAN.zMax - SPAN.zMin; }
    }
    this.writePuffs();
    this.dome.position.copy(camera.position);
    this.stars.position.copy(camera.position);
    this.floor.position.x = camera.position.x; this.floor.position.z = camera.position.z;
    const map = this.floor.material.map; if (map) map.offset.y -= this.speed * dt * .35 / 900 * map.repeat.y;
  }
}

/** A lumpy cloud from a few spheres: white on top, shade underneath (used before nature.glb loads). */
function fallbackPuff() {
  const top: T.BufferGeometry[] = [], under: T.BufferGeometry[] = [];
  const lumps: [number, number, number, number][] = [[0, .2, 0, 1], [.9, 0, .2, .7], [-.85, .05, -.1, .75], [.2, .1, .8, .6], [-.3, 0, -.7, .65]];
  for (const [x, y, z, r] of lumps) {
    const g = new T.IcosahedronGeometry(r, 1); g.translate(x, y, z); top.push(g);
    const u = new T.CylinderGeometry(r * .95, r * .8, .35, 10); u.translate(x, y - r * .55, z); under.push(u);
  }
  const merge = (list: T.BufferGeometry[]) => { const m = list.map(g => g.toNonIndexed()); let n = 0; m.forEach(g => n += g.attributes.position.count); const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3); let o = 0; for (const g of m) { pos.set(g.attributes.position.array as Float32Array, o * 3); nor.set(g.attributes.normal.array as Float32Array, o * 3); o += g.attributes.position.count; } const out = new T.BufferGeometry(); out.setAttribute('position', new T.BufferAttribute(pos, 3)); out.setAttribute('normal', new T.BufferAttribute(nor, 3)); return out; };
  return [{ geometry: merge(top), material: makeToon('#ffffff') as T.Material }, { geometry: merge(under), material: makeToon('#b9c6f2') as T.Material }];
}

/** A small painted tile for the ground far below: treetops in greens, or sea blue with whitecaps. */
function paintBelow(kind: 'forest' | 'sea') {
  const size = 256, c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d')!, rng = makeRng(`below-${kind}`);
  if (kind === 'forest') {
    g.fillStyle = '#3f9a3a'; g.fillRect(0, 0, size, size);
    const greens = ['#2f7f33', '#4fb143', '#6cc24a', '#2a6b2e', '#5aa83e'];
    for (let i = 0; i < 420; i++) { const x = rng.next() * size, y = rng.next() * size, r = 5 + rng.next() * 11; g.fillStyle = greens[i % greens.length]; for (const [dx, dy] of [[0, 0], [size, 0], [-size, 0], [0, size], [0, -size]]) { g.beginPath(); g.arc(x + dx, y + dy, r, 0, Math.PI * 2); g.fill(); } }
    for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(120, 190, 255, .7)'; g.beginPath(); g.ellipse(rng.next() * size, rng.next() * size, 10 + rng.next() * 16, 6 + rng.next() * 8, rng.next() * 3, 0, Math.PI * 2); g.fill(); }
  } else {
    g.fillStyle = '#2f8ed8'; g.fillRect(0, 0, size, size);
    for (let i = 0; i < 60; i++) { g.fillStyle = i % 3 ? 'rgba(80, 170, 235, .8)' : 'rgba(20, 100, 180, .6)'; g.beginPath(); g.ellipse(rng.next() * size, rng.next() * size, 18 + rng.next() * 30, 6 + rng.next() * 10, 0, 0, Math.PI * 2); g.fill(); }
    g.strokeStyle = 'rgba(255, 255, 255, .85)'; g.lineWidth = 2;
    for (let i = 0; i < 70; i++) { const x = rng.next() * size, y = rng.next() * size, w = 4 + rng.next() * 9; g.beginPath(); g.moveTo(x - w, y); g.quadraticCurveTo(x, y - 3, x + w, y); g.stroke(); }
  }
  const tex = new T.CanvasTexture(c);
  tex.wrapS = tex.wrapT = T.RepeatWrapping; tex.repeat.set(14, 14); tex.colorSpace = T.SRGBColorSpace; tex.anisotropy = 4;
  return tex;
}
