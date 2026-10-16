import * as T from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { makeToon, toonOf } from './look.ts';

/**
 * Models from Blender (docs/ART-CONTRACT.md). Every file is loaded once at start; `part(file, root)` clones a root.
 * When a file or a root is missing, callers get null and draw their own simple shape, so a missing model never
 * breaks the game.
 */
/** `house` is Zoo Garden's furniture kit (the same owner's), meshopt-compressed. */
export const MODEL_FILES = ['whale', 'keeper', 'crew', 'gloom', 'hives', 'trees', 'props', 'nature', 'fish', 'house'] as const;
export type ModelFile = typeof MODEL_FILES[number];

const roots = new Map<ModelFile, Map<string, T.Object3D>>();
const scenes = new Map<ModelFile, T.Object3D>();
const base = import.meta.env?.BASE_URL ?? '/';

export async function loadModels(onProgress?: (done: number, all: number) => void) {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  let done = 0;
  await Promise.all(MODEL_FILES.map(async file => {
    try {
      const gltf = await loader.loadAsync(`${base}assets/models/${file}.glb`);
      bakeColors(gltf.scene);
      const map = new Map<string, T.Object3D>();
      for (const child of gltf.scene.children) map.set(child.name, child);
      roots.set(file, map);
      scenes.set(file, gltf.scene);
    } catch (err) {
      console.warn(`[models] ${file}.glb did not load; simple shapes stand in`, err);
    }
    onProgress?.(++done, MODEL_FILES.length);
  }));
}

/** Roots whose colours the game changes at run time keep their separate materials. */
const KEEP_MATERIALS = new Set(['cloud_puff', 'market']);
const BAKED_MATERIAL = new T.MeshStandardMaterial({ name: 'baked', color: '#ffffff', vertexColors: true });
/** Nodes the code moves, toggles or finds by name: they keep their own mesh (code review 7). */
const KEEP_NODE = /^(fruits|wing_[lr]|shard_\d+|core|shell|shell_top|shell_bottom|pearl|arm_[lr]|leg_[lr]|head|body|tail|tailtip|fin_[lr]|eye_[lr]|eye|blades|door|disc|mallet|soil|note_\d|sail|balloon|crown_\d|tip|mouth|blowhole|hat|claw_[lr]|anchor|knot_\d|coil|bell|clapper|ice|arch|post|cap|platform|rope|lid|barrel|crust)$/;
const keepNode = (o: T.Object3D) => KEEP_NODE.test(String(o.userData?.name ?? o.name));
const plain = (m: T.Material) => {
  const s = m as T.MeshStandardMaterial;
  return !m.name.startsWith('glow_') && !m.transparent && (!s.emissive || s.emissive.getHex() === 0 || (s.emissiveIntensity ?? 1) === 0);
};

/**
 * Smooth-dense-scenes "merge same-look parts with baked colours": every node whose flat-coloured primitives come
 * as several meshes (one per material) is merged into ONE mesh with the colours baked into vertex colours, so a
 * whale body is one draw call instead of 15. Glowing and see-through parts stay separate (they need their own
 * material), and so do nodes that animate (they are separate nodes in the contract, so they are never merged).
 */
export function bakeColors(scene: T.Object3D) {
  const groups: T.Object3D[] = [];
  scene.traverse(o => groups.push(o));
  const skip = new Set<T.Object3D>();
  for (const root of scene.children) if (KEEP_MATERIALS.has(root.name)) root.traverse(o => skip.add(o));
  for (const node of groups) {
    if (skip.has(node)) continue;
    const prims = node.children.filter(c => (c as T.Mesh).isMesh && c.children.length === 0 && !keepNode(c) && plain((c as T.Mesh).material as T.Material)) as T.Mesh[];
    const self = (node as T.Mesh).isMesh && plain((node as T.Mesh).material as T.Material) ? node as T.Mesh : null;
    if (prims.length + (self ? 1 : 0) < 2) continue;
    const parts: T.BufferGeometry[] = [];
    const add = (mesh: T.Mesh, local: T.Matrix4 | null) => {
      const g = flatGeometry(mesh.geometry);
      if (local) g.applyMatrix4(local);
      const c = ((mesh.material as T.MeshStandardMaterial).color ?? new T.Color('#ffffff'));
      const n = g.attributes.position.count, col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
      g.setAttribute('color', new T.BufferAttribute(col, 3));
      parts.push(g);
    };
    for (const p of prims) { p.updateMatrix(); add(p, p.matrix); }
    if (self) add(self, null);
    const merged = mergeGeometries(parts);
    if (!merged) continue;
    merged.computeBoundingSphere(); merged.computeBoundingBox();
    for (const p of prims) node.remove(p);
    if (self) { self.geometry = merged; self.material = BAKED_MATERIAL; }
    else {
      const mesh = new T.Mesh(merged, BAKED_MATERIAL);
      mesh.name = `${node.name}_baked`; mesh.userData.name = `${node.userData?.name ?? node.name}_baked`;
      node.add(mesh);
    }
  }
}
/** Position and normal as plain float arrays, without an index (quantized files mix types otherwise). */
function flatGeometry(src: T.BufferGeometry) {
  const g = src.index ? src.toNonIndexed() : src.clone();
  const out = new T.BufferGeometry();
  for (const key of ['position', 'normal'] as const) {
    const a = g.getAttribute(key) as T.BufferAttribute | undefined;
    if (!a) continue;
    const arr = new Float32Array(a.count * 3);
    for (let i = 0; i < a.count; i++) arr.set([a.getX(i), a.getY(i), a.getZ(i)], i * 3);
    out.setAttribute(key, new T.BufferAttribute(arr, 3));
  }
  if (!out.getAttribute('normal')) out.computeVertexNormals();
  return out;
}

export const hasModel = (file: ModelFile, name: string) => !!roots.get(file)?.has(name);
export const rootNames = (file: ModelFile) => [...(roots.get(file)?.keys() ?? [])];

/** A fresh copy of a root (geometry shared, materials swapped for the shared toon twins). */
export function part(file: ModelFile, name: string, opts: { gloom?: boolean; shadows?: boolean } = {}): T.Object3D | null {
  const src = roots.get(file)?.get(name);
  if (!src) return null;
  const copy = src.clone(true);
  copy.position.set(0, 0, 0); copy.rotation.set(0, 0, 0); copy.scale.set(1, 1, 1);
  copy.traverse(o => {
    const mesh = o as T.Mesh;
    if (!mesh.isMesh) return;
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(m => toonOf(m, opts.gloom)) : toonOf(mesh.material, opts.gloom);
    mesh.castShadow = !!opts.shadows; mesh.receiveShadow = false;
  });
  return copy;
}

/** The whole file as authored (every root, transforms kept), with toon materials. */
export function whole(file: ModelFile, opts: { gloom?: boolean; shadows?: boolean } = {}): T.Object3D | null {
  const src = scenes.get(file);
  if (!src) return null;
  const copy = src.clone(true);
  copy.traverse(o => {
    const mesh = o as T.Mesh;
    if (!mesh.isMesh) return;
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(m => toonOf(m, opts.gloom)) : toonOf(mesh.material, opts.gloom);
    mesh.castShadow = !!opts.shadows;
  });
  return copy;
}

/** Every mesh of a root with its matrix relative to the root (to merge pieces into one batch). */
export function kitParts(file: ModelFile, name: string) {
  const src = roots.get(file)?.get(name);
  if (!src) return null;
  src.updateMatrixWorld(true);
  const inv = new T.Matrix4().copy(src.matrixWorld).invert(), out: { geometry: T.BufferGeometry; matrix: T.Matrix4; material: T.Material }[] = [];
  src.traverse(o => {
    const mesh = o as T.Mesh;
    if (!mesh.isMesh) return;
    out.push({ geometry: mesh.geometry, matrix: new T.Matrix4().multiplyMatrices(inv, mesh.matrixWorld), material: Array.isArray(mesh.material) ? mesh.material[0] : mesh.material });
  });
  return out;
}

export function findChild(root: T.Object3D, name: string): T.Object3D | null {
  let hit: T.Object3D | null = null;
  // three.js renames repeated names (fruits_1, tail_2…); the authored glTF name stays in userData.name.
  root.traverse(o => { if (!hit && (o.name === name || o.userData?.name === name)) hit = o; });
  return hit;
}

/**
 * One root as plain geometry + materials for instancing: every mesh under it baked into the root's space, grouped by
 * material, so a scatter kind draws in one call per material.
 */
export function bakedParts(file: ModelFile, name: string, gloom = false): { geometry: T.BufferGeometry; material: T.Material }[] | null {
  const src = roots.get(file)?.get(name);
  if (!src) return null;
  src.updateMatrixWorld(true);
  const inv = new T.Matrix4().copy(src.matrixWorld).invert();
  const groups = new Map<T.Material, T.BufferGeometry[]>();
  src.traverse(o => {
    const mesh = o as T.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const m = new T.Matrix4().multiplyMatrices(inv, mesh.matrixWorld);
    if (mats.length === 1) {
      const g = mesh.geometry.clone().applyMatrix4(m);
      keepCommon(g);
      const key = toonOf(mats[0], gloom);
      groups.set(key, [...(groups.get(key) ?? []), g]);
    } else {
      for (const grp of mesh.geometry.groups) {
        const g = extractGroup(mesh.geometry, grp).applyMatrix4(m);
        keepCommon(g);
        const key = toonOf(mats[grp.materialIndex ?? 0], gloom);
        groups.set(key, [...(groups.get(key) ?? []), g]);
      }
    }
  });
  return [...groups].map(([material, list]) => ({ geometry: mergeGeometries(list) ?? list[0], material }));
}
function keepCommon(g: T.BufferGeometry) {
  for (const key of Object.keys(g.attributes)) if (key !== 'position' && key !== 'normal' && key !== 'color') g.deleteAttribute(key);
  if (g.index) { const ng = g.toNonIndexed(); g.copy(ng); }
}
function extractGroup(src: T.BufferGeometry, grp: { start: number; count: number }) {
  const g = src.index ? src.toNonIndexed() : src.clone();
  const out = new T.BufferGeometry();
  for (const key of ['position', 'normal', 'color']) {
    const a = g.getAttribute(key) as T.BufferAttribute;
    if (!a) continue;
    out.setAttribute(key, new T.BufferAttribute(a.array.slice(grp.start * a.itemSize, (grp.start + grp.count) * a.itemSize) as Float32Array, a.itemSize));
  }
  return out;
}

// --------------------------------------------------------- simple shapes
/** A rounded stand-in: a capsule body (and a head sphere for people). */
export function standIn(kind: 'person' | 'blob' | 'tree' | 'box' | 'pillar', color: string, size = 1): T.Group {
  const g = new T.Group();
  const mat = makeToon(color);
  if (kind === 'person') {
    const body = new T.Mesh(new T.CapsuleGeometry(.24 * size, .3 * size, 4, 10), mat); body.position.y = .42 * size; body.name = 'body';
    const head = new T.Mesh(new T.SphereGeometry(.26 * size, 14, 10), makeToon('#ffd2ae')); head.position.y = .9 * size; head.name = 'head';
    g.add(body, head);
  } else if (kind === 'blob') {
    const b = new T.Mesh(new T.SphereGeometry(.42 * size, 14, 10), mat); b.position.y = .4 * size; b.scale.y = .85; g.add(b);
    const eye = new T.Mesh(new T.SphereGeometry(.13 * size, 10, 8), makeToon('#b26bff', { emissive: '#8a3dff' })); eye.position.set(0, .48 * size, .34 * size); g.add(eye);
  } else if (kind === 'tree') {
    const trunk = new T.Mesh(new T.CylinderGeometry(.08 * size, .12 * size, .7 * size, 8), makeToon('#8e5634')); trunk.position.y = .35 * size;
    const crown = new T.Mesh(new T.IcosahedronGeometry(.55 * size, 1), mat); crown.position.y = .95 * size;
    g.add(trunk, crown);
  } else if (kind === 'pillar') {
    const p = new T.Mesh(new T.CylinderGeometry(.35 * size, .55 * size, 3 * size, 6), mat); p.position.y = 1.5 * size; g.add(p);
  } else {
    const b = new T.Mesh(new T.BoxGeometry(size, size * .8, size), mat); b.position.y = size * .4; g.add(b);
  }
  return g;
}
