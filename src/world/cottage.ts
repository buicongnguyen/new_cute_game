import * as T from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { FURNITURE, FRIEND_SPOTS, HOUSE, ROOMS, WALL, WALLS, roomAt, walkable, footprintCircles, spreadActivity, type Placement } from './house-plan.ts';
import { kitParts } from './assets.ts';
import { makeToon } from './look.ts';
import { noteView } from './hive.ts';
import { Actor } from './actors.ts';
import type { Blocker } from './isle-view.ts';
import { CREW, type CrewId, type NoteIsle } from '../rules/content.ts';

/**
 * Nana's cottage below Bao's hatch: Zoo Garden's house (the owner's own plan, furniture kit and merging view, ported
 * from cute_game/src/house-view.ts). Walls, floors and every furniture piece are merged into ONE vertex-coloured toon
 * mesh plus one glowing mesh. Unlike Zoo Garden, it floats in the open sky on a wooden hull with green weed along the
 * walls (the owner: "around the house is not black background but blue sky with cloud"), and a ladder at the front
 * door climbs back up to the deck.
 */
const EXTERIOR = '#e9c39a', TRIM = '#a8683f', HULL = '#b06a38', HULL_DARK = '#7a4424', WEED = ['#5fcb45', '#3e9e36', '#9be36a'];
const color = new T.Color();

/** A non-indexed piece with only position, normal and a colour: its own vertex colours if it has them, else `hex`. */
function baked(geometry: T.BufferGeometry, hex: string | T.Color, matrix?: T.Matrix4) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  const out = new T.BufferGeometry(), n = g.getAttribute('position').count;
  for (const key of ['position', 'normal'] as const) {
    const a = g.getAttribute(key) as T.BufferAttribute | undefined; if (!a) continue;
    const arr = new Float32Array(n * 3); for (let i = 0; i < n; i++) arr.set([a.getX(i), a.getY(i), a.getZ(i)], i * 3);
    out.setAttribute(key, new T.BufferAttribute(arr, 3));
  }
  if (!out.getAttribute('normal')) out.computeVertexNormals();
  const own = g.getAttribute('color') as T.BufferAttribute | undefined, colors = new Float32Array(n * 3);
  const c = typeof hex === 'string' ? color.set(hex) : hex;
  for (let i = 0; i < n; i++) colors.set(own ? [own.getX(i), own.getY(i), own.getZ(i)] : [c.r, c.g, c.b], i * 3);
  out.setAttribute('color', new T.BufferAttribute(colors, 3));
  if (matrix) out.applyMatrix4(matrix);
  return out;
}
function slab(w: number, h: number, d: number, x: number, y: number, z: number, hex: string) {
  const box = new T.BoxGeometry(w, h, d); box.translate(x, y, z); const g = baked(box, hex); box.dispose(); return g;
}
const placementMatrix = (p: Placement) => new T.Matrix4().compose(new T.Vector3(p.x, p.y ?? 0, p.z), new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), p.rot ?? 0), new T.Vector3().setScalar(p.scale ?? 1));
const glowing = (m: T.Material) => m.name.startsWith('glow_') || ((m as T.MeshToonMaterial).emissive?.getHex() > 0 && ((m as T.MeshToonMaterial).emissiveIntensity ?? 0) > 0);

/** Floors, walls (coloured per room on each face), skirting and caps: Zoo Garden's shellPieces. */
function shellPieces(): T.BufferGeometry[] {
  const out: T.BufferGeometry[] = [], b = HOUSE.bounds;
  for (const room of ROOMS) {
    const r = room.rect, w = r.x1 - r.x0, d = r.z1 - r.z0;
    if (room.pattern === 'planks') { const n = Math.round(d / .5); for (let i = 0; i < n; i++) out.push(slab(w, .08, d / n, (r.x0 + r.x1) / 2, -.04, r.z0 + (i + .5) * d / n, room.floor[i % 2])); }
    else { const nx = Math.round(w / .7), nz = Math.round(d / .7); for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) out.push(slab(w / nx, .08, d / nz, r.x0 + (i + .5) * w / nx, -.04, r.z0 + (j + .5) * d / nz, room.floor[(i + j) % 2])); }
  }
  const half = WALL.thick / 2;
  for (const wall of WALLS) {
    const cuts = [...wall.gaps].sort((a, c) => a[0] - c[0]), spans: Array<[number, number]> = [];
    let at = wall.from; for (const [a, c] of cuts) { if (a > at) spans.push([at, a]); at = Math.max(at, c); } if (at < wall.to) spans.push([at, wall.to]);
    for (const [a, c] of spans) {
      const mid = (a + c) / 2, len = c - a, h = wall.height;
      for (const side of [-1, 1]) {
        const probe = wall.axis === 'x' ? { x: mid, z: wall.at + side * .4 } : { x: wall.at + side * .4, z: mid }, hex = roomAt(probe)?.wall ?? EXTERIOR;
        out.push(wall.axis === 'x' ? slab(len, h, half, mid, h / 2, wall.at + side * half / 2, hex) : slab(half, h, len, wall.at + side * half / 2, h / 2, mid, hex));
        const skirt = '#' + new T.Color(hex).multiplyScalar(.78).getHexString();
        out.push(wall.axis === 'x' ? slab(len, .14, .03, mid, .07, wall.at + side * (half + .015), skirt) : slab(.03, .14, len, wall.at + side * (half + .015), .07, mid, skirt));
      }
      out.push(wall.axis === 'x' ? slab(len + .04, .08, WALL.thick + .08, mid, h + .04, wall.at, TRIM) : slab(WALL.thick + .08, .08, len + .04, wall.at, h + .04, mid, TRIM));
    }
  }
  // Cloudback: a wooden hull under the floor (the cottage hangs in the sky like a little airship gondola)…
  const w = b.x1 - b.x0, d = b.z1 - b.z0, cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
  const tiers: [number, number, number, string][] = [[1, .5, -.33, HULL], [.97, .7, -.93, HULL_DARK], [.86, .8, -1.68, HULL], [.66, .7, -2.43, HULL_DARK], [.4, .5, -3.03, HULL]];
  for (const [k, h, y, hex] of tiers) out.push(slab(w * k + .6, h, d * k + .6, cx, y, cz, hex));
  // …and a little green weed along the tops of the OUTER walls only, as on Bao's deck, hanging over the outside.
  let seed = 3;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const outer = WALLS.filter(w => w.height >= WALL.full && (w.axis === 'x' ? Math.abs(w.at - b.z0) < .01 : Math.abs(Math.abs(w.at) - b.x1) < .01));
  for (const wall of outer) {
    const len = wall.to - wall.from, n = Math.floor(len / .7), outward = wall.axis === 'x' ? -1 : Math.sign(wall.at);
    for (let i = 0; i < n; i++) {
      if (rnd() < .25) continue; // gaps, so the trim shows through
      const t = wall.from + (i + .5) * len / n, r = .1 + rnd() * .09;
      const g = new T.IcosahedronGeometry(r, 0); g.scale(1.5, .7, 1.1);
      const off = WALL.thick / 2 + r * .4;
      const x = wall.axis === 'x' ? t : wall.at + outward * off, z = wall.axis === 'x' ? wall.at + outward * off : t;
      g.translate(x, wall.height + .02 - rnd() * .25, z);
      out.push(baked(g, WEED[i % 3])); g.dispose();
    }
  }
  // A wooden ladder at the front door, up to the hatch.
  const lx = 0, lz = b.z1 - .35;
  for (const side of [-1, 1]) out.push(slab(.08, 4.2, .08, lx + side * .32, 2.1, lz, '#8a4b25'));
  for (let i = 0; i < 9; i++) out.push(slab(.64, .06, .07, lx, .35 + i * .45, lz, '#c77a3a'));
  return out;
}

/** Stand-in boxes for furniture before the kit arrives (Zoo Garden's fallbackPiece). */
function fallbackPiece(p: Placement): { plain: T.BufferGeometry[]; glow: T.BufferGeometry[] } {
  const m = placementMatrix(p), hues: Record<string, string> = { sofa: '#24b3b0', armchair: '#ffc23a', bed: '#f2668e', fireplace: '#cf5b3e', bookshelf: '#c77a3a', wardrobe: '#a98bff', fridge: '#6ccbff', bathtub: '#f2f8ff' };
  if (p.kit === 'window') { const g = new T.BoxGeometry(1.1, 1.1, .1); g.translate(0, 1.5, -.05); return { plain: [], glow: [baked(g, '#ffe7a0', m)] }; }
  if (!p.block) return { plain: [], glow: [] };
  const h = p.kit === 'wardrobe' || p.kit === 'bookshelf' || p.kit === 'fridge' ? 1.9 : p.kit === 'fireplace' ? 1.2 : .7, g = new T.BoxGeometry(p.block[0], h, p.block[1]); g.translate(0, h / 2, 0);
  return { plain: [baked(g, hues[p.kit] ?? '#e8a862', m)], glow: [] };
}

/** Steam over the kettle, the stove's pot and the bath (Zoo Garden's PUFF_SOURCES), and the fire. */
const PUFF_SOURCES: Array<[number, number, number, number, number]> = ([[-9.5, 1.15, -.13, .7, .06], [-9.38, 1.12, 2.27, .8, .08], [-.75, .62, -6.4, .45, .55]] as Array<[number, number, number, number, number]>)
  .map(([x, y, z, rise, spread]) => { const at = spreadActivity({ x, z }); return [at.x, y, at.z, rise, spread]; });
const FLAME_AT = { ...spreadActivity({ x: -4.42, z: 1.7 }), y: .12 };
const PUFFS_EACH = 5;

/** Where each crew member spends time at home (the owner's friend spots, by job). */
const CREW_SPOTS: Partial<Record<CrewId, { x: number; z: number; facing: number }>> = {
  nana: { ...FRIEND_SPOTS[2] }, pip: { ...spreadActivity({ x: 3.8, z: 5.2 }), facing: -.6 }, mina: { ...spreadActivity({ x: -8.4, z: 2.4 }), facing: -Math.PI / 2 },
  tam: { ...spreadActivity({ x: 8.4, z: .4 }), facing: Math.PI / 2 }, ria: { ...spreadActivity({ x: 6.5, z: -4.9 }), facing: Math.PI },
};

export const placementOf = (kit: string) => FURNITURE.find(p => p.kit === kit) ?? null;

export class CottageView {
  group = new T.Group();
  blockers: Blocker[] = [];
  crew = new Map<CrewId, Actor>();
  private flame: T.Mesh; private puffs: T.InstancedMesh;
  private notes: T.Object3D[] = [];
  private noteSpots: T.Vector3[] = [];
  private last = new T.Vector3(HOUSE.spawn.x, 0, HOUSE.spawn.z);
  private t = 0;
  private m4 = new T.Matrix4(); private q = new T.Quaternion(); private v = new T.Vector3(); private sc = new T.Vector3();

  constructor() {
    const plain: T.BufferGeometry[] = shellPieces(), glow: T.BufferGeometry[] = [];
    for (const p of FURNITURE) {
      const parts = kitParts('house', p.kit);
      if (!parts) { const f = fallbackPiece(p); plain.push(...f.plain); glow.push(...f.glow); continue; }
      const m = placementMatrix(p);
      for (const part of parts) {
        const world = m.clone().multiply(part.matrix), mat = part.material as T.MeshToonMaterial;
        if (glowing(mat)) glow.push(baked(part.geometry, mat.emissive.clone().lerp(mat.color, .35), world));
        else plain.push(baked(part.geometry, mat.color ?? '#ffffff', world));
      }
    }
    const solid = mergeGeometries(plain, false); plain.forEach(g => g.dispose());
    if (solid) { const mesh = new T.Mesh(solid, makeToon('#ffffff', { vertexColors: true })); mesh.name = 'cottage-shell'; mesh.castShadow = mesh.receiveShadow = true; this.group.add(mesh); }
    const lit = glow.length ? mergeGeometries(glow, false) : null; glow.forEach(g => g.dispose());
    if (lit) { const mesh = new T.Mesh(lit, new T.MeshBasicMaterial({ vertexColors: true, fog: true })); mesh.name = 'cottage-glow'; this.group.add(mesh); }
    // The fire and the steam (one draw each).
    const fire = new T.ConeGeometry(.16, .42, 6); fire.translate(0, .21, 0); const core = new T.ConeGeometry(.09, .28, 5); core.translate(0, .14, .02);
    this.flame = new T.Mesh(mergeGeometries([baked(fire, '#ff8a2a'), baked(core, '#ffe36b')], false)!, new T.MeshBasicMaterial({ vertexColors: true }));
    fire.dispose(); core.dispose();
    this.flame.position.set(FLAME_AT.x, FLAME_AT.y, FLAME_AT.z);
    this.puffs = new T.InstancedMesh(new T.IcosahedronGeometry(.07, 0), new T.MeshBasicMaterial({ color: '#ffffff' }), PUFF_SOURCES.length * PUFFS_EACH);
    this.puffs.frustumCulled = false;
    this.group.add(this.flame, this.puffs);
    // The Notes Bao holds glow above the trophy shelf in the living room.
    const shelf = placementOf('trophy_shelf');
    for (let i = 0; i < 3; i++) {
      const at = new T.Vector3((shelf?.x ?? 2.6) + (i - 1) * .5, 1.55, (shelf?.z ?? -2.1) + .15);
      this.noteSpots.push(at);
      const n = noteView(); n.scale.setScalar(.5); n.position.copy(at); n.visible = false;
      this.group.add(n); this.notes.push(n);
    }
    for (const p of FURNITURE) for (const c of footprintCircles(p)) this.blockers.push({ x: c.x, z: c.z, r: c.r });
    for (const id of Object.keys(CREW_SPOTS) as CrewId[]) {
      const a = new Actor('crew', id, CREW[id].color), s = CREW_SPOTS[id]!;
      a.root.position.set(s.x, 0, s.z); a.facing = s.facing; a.root.visible = false;
      this.group.add(a.root); this.crew.set(id, a);
    }
    this.group.visible = false;
  }

  /** The Notes on the shelf and the crew at home. */
  sync(notes: NoteIsle[], crew: CrewId[]) {
    (['clover', 'reef', 'ember'] as NoteIsle[]).forEach((n, i) => { this.notes[i].visible = notes.includes(n); });
    for (const [id, a] of this.crew) a.root.visible = crew.includes(id);
  }
  spawn() { this.last.set(HOUSE.spawn.x, 0, HOUSE.spawn.z); return this.last; }

  /** Keeps a walker inside the rooms and doorways (house-plan walkable), sliding along walls. */
  clamp(p: T.Vector3) {
    if (walkable(p)) { this.last.copy(p); return; }
    if (walkable({ x: p.x, z: this.last.z })) { p.z = this.last.z; this.last.copy(p); return; }
    if (walkable({ x: this.last.x, z: p.z })) { p.x = this.last.x; this.last.copy(p); return; }
    p.x = this.last.x; p.z = this.last.z;
  }

  update(dt: number, keeper: T.Vector3) {
    this.t += dt; const time = this.t;
    const f = 1 + Math.sin(time * 13) * .08 + Math.sin(time * 7.3) * .06; this.flame.scale.set(1 + Math.sin(time * 9) * .05, f, 1);
    let k = 0;
    for (const src of PUFF_SOURCES) {
      const x = src[0], y = src[1], z = src[2], rise = src[3], spread = src[4], bath = spread > .3;
      for (let i = 0; i < PUFFS_EACH; i++) {
        const life = (time * .45 + i / PUFFS_EACH + x * .13) % 1, a = i * 2.4 + x, w = bath ? 1 : life;
        this.v.set(x + Math.cos(a) * spread * w, y + life * rise, z + Math.sin(a) * spread * w * (bath ? .5 : 1));
        const r = Math.sin(life * Math.PI) * (bath ? 1.1 : .9); this.sc.set(r, r, r);
        this.puffs.setMatrixAt(k++, this.m4.compose(this.v, this.q, this.sc));
      }
    }
    this.puffs.instanceMatrix.needsUpdate = true;
    this.notes.forEach((n, i) => { n.rotation.y = time * 1.2 + i; n.position.y = this.noteSpots[i].y + Math.sin(time * 2 + i) * .06; });
    for (const [, a] of this.crew) {
      if (!a.root.visible) continue;
      if (Math.hypot(keeper.x - a.root.position.x, keeper.z - a.root.position.z) < 2.6) a.lookAt(keeper.x, keeper.z);
      a.update(dt);
    }
  }
}
