import * as T from 'three';
import { findChild, part, standIn } from './assets.ts';
import { makeToon } from './look.ts';
import { noteView } from './hive.ts';
import type { Blocker } from './isle-view.ts';
import type { NoteIsle } from '../rules/content.ts';

/**
 * Nana's cabin, below the hatch in Bao's deck. A roofless round room seen from above, floating in the open sky with
 * the clouds drifting around it (the owner's wish: blue sky around the house, never a black void). Furniture comes
 * from props.glb (docs/ART-CONTRACT.md); simple shapes stand in when a root is missing.
 */
export const CABIN = {
  radius: 4.1,
  ladder: [0, -3.4] as [number, number],
  bed: [-2.3, -1.4] as [number, number],
  table: [1.8, .9] as [number, number],
  shelf: [2.4, -2.1] as [number, number],
  stove: [-2.5, 1.6] as [number, number],
  chest: [.2, 2.9] as [number, number],
  rug: [0, .2] as [number, number],
  lamp: [-.9, -2.9] as [number, number],
  plant: [3.1, 1.9] as [number, number],
};

export class CabinView {
  group = new T.Group();
  blockers: Blocker[] = [];
  private notes: T.Object3D[] = [];
  private noteSpots: T.Vector3[] = [];
  private t = 0;
  constructor() {
    const room = part('props', 'cabin_room', { shadows: false }) ?? fallbackRoom();
    room.traverse(o => { const m = o as T.Mesh; if (m.isMesh) m.receiveShadow = true; });
    this.group.add(room);
    const put = (name: string, at: [number, number], rot: number, r: number, fallback: () => T.Object3D) => {
      const o = part('props', name, { shadows: true }) ?? fallback();
      o.position.set(at[0], 0, at[1]); o.rotation.y = rot;
      this.group.add(o);
      if (r > 0) this.blockers.push({ x: at[0], z: at[1], r });
      return o;
    };
    put('rug', CABIN.rug, 0, 0, () => { const m = new T.Mesh(new T.CircleGeometry(1.6, 32).rotateX(-Math.PI / 2), makeToon('#ff7a59')); m.position.y = .02; const g = new T.Group(); g.add(m); return g; });
    put('bed', CABIN.bed, .5, 1, () => standIn('box', '#ff9cc8', 1.4));
    put('table', CABIN.table, 0, .8, () => standIn('box', '#c77a3a', 1));
    const shelf = put('shelf', CABIN.shelf, -2.3, .7, () => standIn('box', '#8a4b25', 1.1));
    put('stove', CABIN.stove, 1.9, .6, () => standIn('pillar', '#5b6477', .45));
    put('chest', CABIN.chest, Math.PI, .55, () => standIn('box', '#e3a05a', .8));
    put('lamp', CABIN.lamp, 0, .3, () => standIn('pillar', '#ffb13b', .4));
    put('plant_pot', CABIN.plant, 0, .4, () => standIn('tree', '#4fbf3a', .6));
    shelf.updateMatrixWorld(true);
    for (let i = 0; i < 3; i++) {
      const marker = findChild(shelf, `note_${i}`);
      const at = new T.Vector3();
      if (marker) marker.getWorldPosition(at);
      else at.set(CABIN.shelf[0] + (i - 1) * .45, 1.1, CABIN.shelf[1]);
      this.noteSpots.push(at);
      const n = noteView(); n.scale.setScalar(.55); n.position.copy(at); n.visible = false;
      this.group.add(n); this.notes.push(n);
    }
    if (!part('props', 'cabin_room')) {
      // Fallback ladder (the real one is part of cabin_room).
      const ladder = standIn('pillar', '#c77a3a', .35); ladder.position.set(CABIN.ladder[0], 0, CABIN.ladder[1] - .3); this.group.add(ladder);
    }
    this.group.visible = false;
  }

  /** The Notes Bao holds glow on the shelf. */
  sync(notes: NoteIsle[]) {
    (['clover', 'reef', 'ember'] as NoteIsle[]).forEach((n, i) => { this.notes[i].visible = notes.includes(n); });
  }
  notePos(i: number) { return this.noteSpots[i]; }

  clamp(p: T.Vector3) {
    const r = Math.hypot(p.x, p.z), max = CABIN.radius - .45;
    if (r > max) { p.x *= max / r; p.z *= max / r; }
  }

  update(dt: number) {
    this.t += dt;
    this.notes.forEach((n, i) => { n.rotation.y = this.t * 1.2 + i; n.position.y = this.noteSpots[i].y + Math.sin(this.t * 2 + i) * .05; });
  }
}

/** A round, roofless wooden room with low walls, window gaps and a weed fringe (before props.glb has one). */
function fallbackRoom() {
  const g = new T.Group();
  const floor = new T.Mesh(new T.CylinderGeometry(CABIN.radius + .3, CABIN.radius + .1, .3, 40), makeToon('#d9934f'));
  floor.position.y = -.15; g.add(floor);
  const underside = new T.Mesh(new T.ConeGeometry(CABIN.radius + .1, 2.4, 40), makeToon('#8a5a34'));
  underside.rotation.x = Math.PI; underside.position.y = -1.5; g.add(underside);
  const wallMat = makeToon('#c77a3a'), weed = makeToon('#5fcb45');
  const SEG = 16;
  for (let i = 0; i < SEG; i++) {
    if (i % 4 === 1) continue; // window gaps
    const a = (i + .5) / SEG * Math.PI * 2, r = CABIN.radius;
    const w = new T.Mesh(new T.BoxGeometry(1.55, 1.1, .22), wallMat);
    w.position.set(Math.cos(a) * r, .55, Math.sin(a) * r); w.rotation.y = -a + Math.PI / 2; g.add(w);
    const tuft = new T.Mesh(new T.SphereGeometry(.28, 8, 6), weed);
    tuft.position.set(Math.cos(a) * r, 1.15, Math.sin(a) * r); tuft.scale.set(2.2, .8, 1); tuft.rotation.y = -a; g.add(tuft);
  }
  return g;
}
