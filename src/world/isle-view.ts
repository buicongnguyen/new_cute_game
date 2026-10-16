import * as T from 'three';
import { ISLE_MAPS, type IsleId } from '../rules/content.ts';
import { bakedParts, findChild, part, standIn } from './assets.ts';
import { addGloom, makeToon } from './look.ts';
import { blobShadow } from './actors.ts';
import { makeRng, type Rng } from '../core/rng.ts';

/**
 * A floating isle: a ground disc with a wavy rim, cliffs and a hanging rock underside (vertex colours, one draw call
 * each), seeded instanced scenery, and the isle's landmarks. Every scenery material shares the Gloom uniform, so the
 * grey fades to colour in one animated value when the isle is freed (design §15).
 */
interface Theme { grass: string[]; path: string; cliff: string; under: string; scatter: [string, number, number, number][]; awning: string }
// scatter: [nature root, count, min scale, max scale]
const THEMES: Record<IsleId, Theme> = {
  clover: { grass: ['#6fd24a', '#86e05a', '#5fc23e', '#9be36a'], path: '#e8c27a', cliff: '#c98a4a', under: '#8a5a34', awning: '#ffc83a',
    scatter: [['tree_round', 34, .9, 1.5], ['bush_a', 24, .8, 1.3], ['bush_b', 18, .8, 1.3], ['flower_a', 70, .8, 1.3], ['flower_b', 60, .8, 1.3], ['flower_c', 50, .8, 1.2], ['grass_tuft', 160, .8, 1.4], ['rock_a', 14, .7, 1.3], ['fence', 10, 1, 1], ['mushroom', 16, .8, 1.3]] },
  reef: { grass: ['#f6d58c', '#ffe3a3', '#ecc77a', '#7fe0c8'], path: '#fff1c8', cliff: '#ff9f8f', under: '#c25f73', awning: '#2fd0c8',
    scatter: [['palm', 22, .9, 1.4], ['coral_a', 40, .7, 1.4], ['coral_b', 34, .7, 1.4], ['rock_b', 18, .7, 1.3], ['flower_b', 50, .8, 1.2], ['grass_tuft', 80, .8, 1.2], ['bush_a', 12, .8, 1.2]] },
  ember: { grass: ['#d0543a', '#e26a40', '#b8452f', '#f08a4a'], path: '#ffc27a', cliff: '#8a3a2f', under: '#4a1f24', awning: '#ff6a2a',
    scatter: [['lava_rock_a', 34, .8, 1.5], ['lava_rock_b', 30, .8, 1.5], ['tree_pine', 22, .9, 1.4], ['rock_c', 24, .7, 1.4], ['mushroom', 26, .8, 1.3], ['grass_tuft', 70, .8, 1.2], ['flower_c', 30, .8, 1.2]] },
  star: { grass: ['#2a2f5e', '#343a72', '#23284f', '#3d3480'], path: '#5a63b0', cliff: '#1d2148', under: '#0d0f26', awning: '#7a5cff',
    scatter: [['rock_c', 40, .8, 1.8], ['rock_a', 30, .8, 1.6], ['mushroom', 30, .8, 1.4], ['grass_tuft', 40, .8, 1.1]] },
};
export const awningColor = (isle: IsleId) => THEMES[isle].awning;

export interface Blocker { x: number; z: number; r: number }

export class IsleView {
  group = new T.Group();
  readonly isle: IsleId;
  readonly radius: number;
  private seed: number[];
  blockers: Blocker[] = [];
  rope: T.Mesh;
  ore: T.Object3D[] = [];
  wild: T.Object3D[] = [];
  market: T.Object3D | null = null;
  shadow: T.Mesh;
  private windmills: T.Object3D[] = [];
  /** Small scenery (flowers, grass, mushrooms) and shadow casters, switched off when the isle is only a backdrop. */
  private small: T.InstancedMesh[] = [];
  private t = 0;

  constructor(isle: IsleId) {
    this.isle = isle;
    const map = ISLE_MAPS[isle];
    this.radius = map.radius;
    const rng = makeRng(`isle-${isle}`);
    this.seed = [rng.next() * 6, rng.next() * 6, rng.next() * 6];
    this.buildGround(rng);
    this.buildScatter(rng);
    this.buildLandmarks();
    // The rope hangs from Bao high above the landing.
    this.rope = new T.Mesh(new T.CylinderGeometry(.05, .05, 60, 6), makeToon('#c98a4a'));
    this.rope.position.set(map.landing[0] + 1.2, 30, map.landing[1] - .6);
    this.group.add(this.rope);
    // Bao's shadow drifting over the meadow.
    this.shadow = blobShadow(1);
    this.shadow.scale.set(26, 1, 12);
    const shade = (this.shadow.material as T.MeshBasicMaterial).clone();
    shade.opacity = .28; this.shadow.material = shade;
    this.group.add(this.shadow);
  }

  /** Rim radius at an angle (wavy, seeded). */
  rim(a: number) {
    const [s1, s2, s3] = this.seed;
    return this.radius * (1 + .07 * Math.sin(3 * a + s1) + .045 * Math.sin(5 * a + s2) + .025 * Math.sin(9 * a + s3));
  }
  /** Ground height: gentle rolls, flat around the landing and the arenas. */
  height(x: number, z: number) {
    const [s1, s2] = this.seed;
    return .22 * Math.sin(x * .21 + s1) * Math.cos(z * .17 + s2) + .12 * Math.sin((x + z) * .33);
  }
  /** Inside the walkable area (the rim minus a margin)? */
  inside(x: number, z: number, margin = 1.4) {
    const a = Math.atan2(z, x);
    return Math.hypot(x, z) < this.rim(a) - margin;
  }
  clampInside(p: T.Vector3, margin = 1.4) {
    const a = Math.atan2(p.z, p.x), r = Math.hypot(p.x, p.z), max = this.rim(a) - margin;
    if (r > max) { p.x *= max / r; p.z *= max / r; }
  }

  private pathDistance(x: number, z: number) {
    const map = ISLE_MAPS[this.isle];
    const pts: [number, number][] = [map.landing, ...map.groups.map(g => g.at), map.hive];
    let best = Infinity;
    for (let i = 0; i < pts.length - 1; i++) best = Math.min(best, segDist(x, z, pts[i], pts[i + 1]));
    for (const sp of map.spires) best = Math.min(best, segDist(x, z, map.landing, sp) + 4);
    return best;
  }

  private buildGround(rng: Rng) {
    const theme = THEMES[this.isle];
    const RINGS = 26, SEG = 96;
    const pos: number[] = [], col: number[] = [], idx: number[] = [];
    const grass = theme.grass.map(c => new T.Color(c)), path = new T.Color(theme.path), cliff = new T.Color(theme.cliff), under = new T.Color(theme.under);
    const c = new T.Color();
    // Top: rings from the centre out to the rim.
    pos.push(0, this.height(0, 0), 0); c.copy(grass[0]); col.push(c.r, c.g, c.b);
    for (let r = 1; r <= RINGS; r++) {
      for (let s = 0; s < SEG; s++) {
        const a = s / SEG * Math.PI * 2, rr = this.rim(a) * (r / RINGS);
        const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
        const edge = r === RINGS ? -.15 : 0;
        pos.push(x, this.height(x, z) + edge, z);
        // Colour from world-space noise only (index-based variation drew rays from the centre).
        const n = Math.sin(x * .37 + z * .21) * .45 + Math.sin(x * .13 - z * .29 + 1.7) * .35 + Math.sin((x + z) * .71) * .2;
        const k = (n * .5 + .5) * (grass.length - 1), i0 = Math.floor(k);
        c.copy(grass[i0]).lerp(grass[Math.min(grass.length - 1, i0 + 1)], k - i0);
        const pd = this.pathDistance(x, z);
        if (pd < 1.7) c.lerp(path, pd < 1.1 ? .92 : .5);
        col.push(c.r, c.g, c.b);
      }
    }
    const ringStart = (r: number) => 1 + (r - 1) * SEG;
    for (let s = 0; s < SEG; s++) idx.push(0, ringStart(1) + (s + 1) % SEG, ringStart(1) + s);
    for (let r = 1; r < RINGS; r++) for (let s = 0; s < SEG; s++) {
      const a = ringStart(r) + s, b = ringStart(r) + (s + 1) % SEG, c2 = ringStart(r + 1) + s, d = ringStart(r + 1) + (s + 1) % SEG;
      idx.push(a, b, c2, b, d, c2);
    }
    // Cliffs: two bands down from the rim, then the hanging underside to a point.
    const bands = [[-1.2, 1], [-3.2, .97], [-5.5, .86], [-9, .62], [-13.5, .34], [-17, .1]];
    const rimStart = ringStart(RINGS);
    let prev = rimStart;
    bands.forEach(([y, k], bi) => {
      const start = pos.length / 3;
      for (let s = 0; s < SEG; s++) {
        const a = s / SEG * Math.PI * 2, wob = 1 + .05 * Math.sin(a * 7 + bi * 1.7 + this.seed[0]);
        const rr = this.rim(a) * k * wob;
        pos.push(Math.cos(a) * rr, y + Math.sin(a * 5 + bi) * .35, Math.sin(a) * rr);
        c.copy(bi < 2 ? cliff : under).lerp(bi < 2 ? under : new T.Color('#000000'), bi < 2 ? bi * .25 : (bi - 2) * .12);
        if (bi < 2 && s % 3 === 0) c.offsetHSL(0, 0, .04);
        col.push(c.r, c.g, c.b);
      }
      for (let s = 0; s < SEG; s++) {
        const a = prev + s, b = prev + (s + 1) % SEG, c2 = start + s, d = start + (s + 1) % SEG;
        idx.push(a, b, c2, b, d, c2);
      }
      prev = start;
    });
    const tip = pos.length / 3; pos.push(0, -21, 0); c.copy(under).multiplyScalar(.4); col.push(c.r, c.g, c.b);
    for (let s = 0; s < SEG; s++) idx.push(prev + s, prev + (s + 1) % SEG, tip);
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new T.Float32BufferAttribute(col, 3));
    geo.setIndex(idx); geo.computeVertexNormals();
    const ground = new T.Mesh(geo, addGloom(makeToon('#ffffff', { vertexColors: true })));
    ground.receiveShadow = true; ground.name = 'ground';
    this.group.add(ground);
  }

  /** Spots kept clear of scenery: landmarks, the path and the arenas. */
  private clear(x: number, z: number) {
    const map = ISLE_MAPS[this.isle];
    const near = (p: readonly number[], r: number) => Math.hypot(x - p[0], z - p[1]) < r;
    if (near(map.landing, 6) || near(map.hive, 12)) return false;
    if (map.market && near(map.market, 3.5)) return false;
    if (map.groups.some(g => near(g.at, 5.5)) || map.spires.some(sp => near(sp, 3.5)) || map.cages.some(cg => near(cg.at, 2.8))) return false;
    if (map.ore.some(o => near(o, 2)) || map.wild.some(w => near(w, 2)) || map.decor.some(d => near(d.at, 3.4))) return false;
    return this.pathDistance(x, z) > 2.4;
  }

  private buildScatter(rng: Rng) {
    const theme = THEMES[this.isle], dummy = new T.Object3D();
    for (const [kind, n, lo, hi] of theme.scatter) {
      const parts = bakedParts('nature', kind, true) ?? fallbackScatter(kind);
      const big = /tree|palm|pine|rock|coral|lava/.test(kind);
      const spots: T.Matrix4[] = [];
      for (let tries = 0; spots.length < n && tries < n * 30; tries++) {
        const a = rng.next() * Math.PI * 2;
        // Trees crowd the rim; small things go anywhere.
        const k = big && kind !== 'coral_a' && kind !== 'coral_b' ? .62 + rng.next() * .33 : Math.sqrt(rng.next()) * .95;
        const r = this.rim(a) * k, x = Math.cos(a) * r, z = Math.sin(a) * r;
        if (!this.clear(x, z) || !this.inside(x, z, 1.6)) continue;
        if (big && this.blockers.some(b => Math.hypot(b.x - x, b.z - z) < b.r + 1)) continue;
        const s = lo + rng.next() * (hi - lo);
        dummy.position.set(x, this.height(x, z), z); dummy.rotation.set(0, rng.next() * Math.PI * 2, 0); dummy.scale.setScalar(s); dummy.updateMatrix();
        spots.push(dummy.matrix.clone());
        if (big) this.blockers.push({ x, z, r: (/tree|palm|pine/.test(kind) ? .5 : .7) * s });
      }
      for (const p of parts) {
        const mesh = new T.InstancedMesh(p.geometry, p.material, spots.length);
        spots.forEach((m, i) => mesh.setMatrixAt(i, m));
        mesh.castShadow = big && /tree|palm|pine/.test(kind); mesh.receiveShadow = false;
        mesh.computeBoundingSphere();
        if (!big) this.small.push(mesh);
        this.group.add(mesh);
      }
    }
  }

  private buildLandmarks() {
    const map = ISLE_MAPS[this.isle];
    for (const d of map.decor) {
      const o = part('props', d.kind, { gloom: true, shadows: true }) ?? standIn('pillar', '#e3a05a', 1.2);
      o.position.set(d.at[0], this.height(d.at[0], d.at[1]), d.at[1]); o.rotation.y = d.rot ?? 0;
      this.group.add(o);
      if (d.kind === 'windmill') this.windmills.push(o);
      this.blockers.push({ x: d.at[0], z: d.at[1], r: d.kind === 'lantern' ? .4 : 1.4 });
    }
    for (const o of map.ore) {
      const rock = part('props', 'ore_rock', { gloom: true, shadows: true }) ?? standIn('box', '#8c95a5', 1.1);
      rock.position.set(o[0], this.height(o[0], o[1]), o[1]);
      this.group.add(rock); this.ore.push(rock); this.blockers.push({ x: o[0], z: o[1], r: .8 });
    }
    for (const w of map.wild) {
      const kind = this.isle === 'clover' ? 'puffberry_grown' : 'cloudpear_grown';
      const plant = part('trees', kind, { gloom: true, shadows: true }) ?? standIn('tree', '#4fbf3a', 1.1);
      plant.position.set(w[0], this.height(w[0], w[1]), w[1]);
      this.group.add(plant); this.wild.push(plant); this.blockers.push({ x: w[0], z: w[1], r: .5 });
    }
    if (map.market) {
      const stall = part('props', 'market', { shadows: true }) ?? standIn('box', THEMES[this.isle].awning, 1.6);
      stall.traverse(o => { const m = o as T.Mesh; if (m.isMesh && (m.material as T.Material).name === 'pal_awning') { m.material = (m.material as T.MeshToonMaterial).clone(); (m.material as T.MeshToonMaterial).color.set(THEMES[this.isle].awning); } });
      stall.position.set(map.market[0], this.height(map.market[0], map.market[1]), map.market[1]);
      stall.rotation.y = Math.atan2(-map.market[0], -map.market[1] + 6);
      stall.visible = false;
      this.market = stall; this.group.add(stall);
      this.blockers.push({ x: map.market[0], z: map.market[1], r: 1.2 });
    }
    const post = part('props', 'ropepost') ?? standIn('pillar', '#c77a3a', .4);
    post.position.set(map.landing[0] + 1.2, this.height(map.landing[0], map.landing[1]), map.landing[1] - .6);
    this.group.add(post);
  }

  /** Far mode: the isle seen from Bao's back draws only its ground, trees and rocks, and casts no shadows. */
  setFar(far: boolean) {
    for (const m of this.small) m.visible = !far;
    this.group.traverse(o => {
      const m = o as T.Mesh;
      if (!m.isMesh) return;
      if (far) { if (m.userData.cast === undefined) m.userData.cast = m.castShadow; m.castShadow = false; }
      else if (m.userData.cast !== undefined) m.castShadow = m.userData.cast;
    });
  }

  /** Whether an ore rock or wild plant is ready shows as full colour or greyed and small. */
  showReady(list: T.Object3D[], ready: boolean[]) {
    list.forEach((o, i) => { const s = ready[i] ? 1 : .82; o.scale.setScalar(s); });
  }

  update(dt: number) {
    this.t += dt;
    for (const w of this.windmills) { const b = (w.userData.blades ??= findChild(w, 'blades')) as T.Object3D | null; if (b) b.rotation.z += dt * .9; }
    // Bao's shadow slides gently around above the landing.
    const map = ISLE_MAPS[this.isle];
    this.shadow.position.set(map.landing[0] + Math.sin(this.t * .07) * 6, this.height(map.landing[0], map.landing[1] - 8) + .05, map.landing[1] - 8 + Math.cos(this.t * .05) * 4);
  }
}

function segDist(x: number, z: number, a: readonly number[], b: readonly number[]) {
  const dx = b[0] - a[0], dz = b[1] - a[1], L = dx * dx + dz * dz;
  const t = L ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L)) : 0;
  return Math.hypot(x - (a[0] + t * dx), z - (a[1] + t * dz));
}

/** Simple scenery shapes (before nature.glb loads). */
function fallbackScatter(kind: string): { geometry: T.BufferGeometry; material: T.Material }[] {
  const tint = (c: string) => addGloom(makeToon(c));
  if (/tree|palm|pine/.test(kind)) {
    const crown = new T.IcosahedronGeometry(1.1, 1).translate(0, 2.2, 0), trunk = new T.CylinderGeometry(.15, .22, 1.6, 7).translate(0, .8, 0);
    return [{ geometry: crown, material: tint(kind === 'palm' ? '#3fbf6a' : kind === 'tree_pine' ? '#2f8a4a' : '#4fbf3a') }, { geometry: trunk, material: tint('#8e5634') }];
  }
  if (/rock|lava/.test(kind)) return [{ geometry: new T.DodecahedronGeometry(.6, 0).translate(0, .35, 0), material: tint(kind.startsWith('lava') ? '#5a2a2a' : '#b9c0cc') }];
  if (/coral/.test(kind)) return [{ geometry: new T.ConeGeometry(.35, 1.2, 6).translate(0, .6, 0), material: tint(kind === 'coral_a' ? '#ff7f7f' : '#ff9cc8') }];
  if (/flower/.test(kind)) return [{ geometry: new T.SphereGeometry(.18, 6, 4).translate(0, .25, 0), material: tint(kind === 'flower_a' ? '#ff5c8a' : kind === 'flower_b' ? '#ffc83a' : '#9b6bff') }];
  if (kind === 'mushroom') return [{ geometry: new T.SphereGeometry(.3, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, .35, 0), material: tint('#ef3b3b') }];
  if (kind === 'fence') return [{ geometry: new T.BoxGeometry(1.6, .5, .12).translate(0, .35, 0), material: tint('#c77a3a') }];
  return [{ geometry: new T.ConeGeometry(.2, .45, 5).translate(0, .22, 0), material: tint('#5fc23e') }];
}
