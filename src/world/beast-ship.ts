import * as T from 'three';
import { BEAST, type ShipId } from '../rules/content.ts';
import { findChild, part } from './assets.ts';
import { addGloom, makeToon } from './look.ts';
import type { Blocker } from './isle-view.ts';

/**
 * A ship of the Gloom fleet (chapter 5). Like Bao, it is a sky creature with a flat deck on its back (the owner,
 * 2026-10-16: no masts, nothing tall in the middle), but the Gloom has crusted it over: gloom.glb `gloom_beast` × 1.6.
 * The deck is flat at y = 0 with the head toward +z; rails run along both sides with three gaps per side (BEAST.gaps)
 * where a knocked raider falls overboard, and the hold hatch sits on the centre line. Its own Gloom tint greys the
 * creature while it is crusted; beating its captain shatters the `crust` and the colour pours back over about 3 s.
 * It has the same surface the game uses for a land (height, clamp, blockers), so the fight code runs unchanged.
 */
export class BeastShipView {
  group = new T.Group();
  /** The deck, which lists (tilts) on the Grey Star: everything on it is drawn inside this group. */
  deck = new T.Group();
  readonly kind = 'ship' as const;
  readonly isle: ShipId;
  readonly radius = 15;
  blockers: Blocker[] = [];
  /** Same names as an IsleView so the game can treat both alike. */
  ore: T.Object3D[] = []; wild: T.Object3D[] = []; market: T.Object3D | null = null;
  /** Unused on a ship (Bao's own plank reaches the landing gap); kept so the game can treat ships and lands alike. */
  rope = new T.Group();
  private model: T.Object3D;
  private crust: T.Object3D | null;
  private tail: T.Object3D | null; private finL: T.Object3D | null; private finR: T.Object3D | null;
  private eyes: T.Object3D[] = [];
  /** This creature's own Gloom tint (1 crusted, 0 free). */
  private gloom = { value: 1 };
  private gloomTarget = 1;
  private t = 0;
  private blinkAt = 3;
  /** −1..1: which rail the deck tilts toward (the Grey Star's list). */
  tilt = 0;
  freed = false;

  constructor(ship: ShipId) {
    this.isle = ship;
    this.model = part('gloom', 'gloom_beast', { shadows: true }) ?? fallbackBeast();
    this.model.scale.setScalar(BEAST.scale);
    this.crust = findChild(this.model, 'crust');
    this.tail = findChild(this.model, 'tail'); this.finL = findChild(this.model, 'fin_l'); this.finR = findChild(this.model, 'fin_r');
    for (const n of ['eye_l', 'eye_r']) { const e = findChild(this.model, n); if (e) this.eyes.push(e); }
    // Own materials with this creature's Gloom tint (the crystal keeps its own look).
    this.model.traverse(o => {
      const m = o as T.Mesh; if (!m.isMesh) return;
      m.receiveShadow = true;
      if (this.crust && isInside(m, this.crust)) return;
      m.material = addGloom((m.material as T.Material).clone(), this.gloom);
    });
    this.deck.add(this.model);
    this.group.add(this.deck);
  }

  height() { return 0; }
  /** Inside the deck (the Captain never falls overboard: the rails hold, the gaps too). */
  inside(x: number, z: number, margin = .6) { const [hx, hz] = BEAST.half; return Math.abs(x) < hx - margin && Math.abs(z) < hz - margin; }
  clampInside(p: T.Vector3) {
    const [hx, hz] = BEAST.half;
    p.x = Math.max(-(hx - .6), Math.min(hx - .6, p.x));
    p.z = Math.max(-(hz - .8), Math.min(hz - .8, p.z));
  }
  /** In front of one of the rail gaps? */
  inGap(z: number) { return BEAST.gaps.some(g => Math.abs(z - g) < BEAST.gapHalf); }
  /** A form past the rail line through a gap is overboard. */
  outside(p: T.Vector3) { return Math.abs(p.x) > BEAST.half[0] - .1 && this.inGap(p.z); }
  /**
   * Forms stay on deck while they walk; a knocked one slides on, and through a gap it goes over the side (the rails
   * stop it everywhere else).
   */
  formClamp(p: T.Vector3, knocked: boolean) {
    const [hx, hz] = BEAST.half;
    const edge = knocked && this.inGap(p.z) ? hx + 1 : hx - .5;
    p.x = Math.max(-edge, Math.min(edge, p.x));
    p.z = Math.max(-(hz - .6), Math.min(hz - .6, p.z));
  }

  /** The crust shatters and the creature's colours come back (`instant` when a freed beast is shown again). */
  setFreed(on: boolean, instant = false) {
    this.freed = on;
    this.gloomTarget = on ? 0 : 1;
    if (instant) this.gloom.value = this.gloomTarget;
    if (this.crust) this.crust.visible = !on;
  }

  /** Far mode: no shadows from the creature while it only floats alongside. */
  setFar(far: boolean) { this.group.traverse(o => { const m = o as T.Mesh; if (m.isMesh) m.castShadow = !far; }); }

  update(dt: number) {
    this.t += dt;
    const t = this.t;
    // Its colour pours back over about 3 s once it is free.
    this.gloom.value += (this.gloomTarget - this.gloom.value) * (1 - Math.exp(-1.4 * dt));
    // A slow swim: tail, fins, a gentle bob; a sleepy blink while crusted, a bright one once free.
    if (this.tail) this.tail.rotation.x = Math.sin(t * .9) * .18;
    if (this.finL) this.finL.rotation.z = Math.sin(t * 1.1) * .2;
    if (this.finR) this.finR.rotation.z = -Math.sin(t * 1.1) * .2;
    if (t > this.blinkAt) this.blinkAt = t + 2.5 + Math.abs(Math.sin(t * 5.1)) * 3;
    const open = this.freed ? 1 : .55, blink = this.blinkAt - t < .14 ? .1 : open;
    for (const e of this.eyes) e.scale.y = blink;
    this.deck.position.y = Math.sin(t * 1.1) * .06;
    this.deck.rotation.z += (this.tilt * .1 - this.deck.rotation.z) * (1 - Math.exp(-1.5 * dt));
    this.deck.rotation.x = Math.sin(t * .8) * .01;
  }
}

const isInside = (o: T.Object3D, root: T.Object3D) => { for (let p: T.Object3D | null = o; p; p = p.parent) if (p === root) return true; return false; };

/** A plain sky creature with a planked deck (before gloom.glb has one): body, fins, tail, rails with gaps and a hatch. */
function fallbackBeast() {
  const g = new T.Group(), skin = makeToon('#ff7f8a'), belly = makeToon('#fff0d6'), wood = makeToon('#c98a4a'), rail = makeToon('#8a4b25'), crystal = makeToon('#9a8cc8', { emissive: '#2a1840' });
  const [hx, hz] = [BEAST.half[0] / BEAST.scale, BEAST.half[1] / BEAST.scale];
  const body = new T.Mesh(new T.SphereGeometry(1, 28, 16), skin); body.name = 'body'; body.scale.set(hx * 1.15, 2.6, hz * 1.15); body.position.y = -2.1; g.add(body);
  const under = new T.Mesh(new T.SphereGeometry(1, 24, 12), belly); under.scale.set(hx * .9, 1.6, hz * .95); under.position.y = -3.4; g.add(under);
  const deck = new T.Mesh(new T.BoxGeometry(hx * 2, .3, hz * 2), wood); deck.position.y = -.15; g.add(deck);
  const gaps = BEAST.gaps.map(z => z / BEAST.scale), gap = BEAST.gapHalf / BEAST.scale;
  for (const side of [-1, 1]) {
    let from = -hz;
    for (const z of [...gaps, hz + gap]) {
      const to = z - gap, len = to - from;
      if (len > .1) { const r = new T.Mesh(new T.BoxGeometry(.18, .45, len), rail); r.position.set(side * (hx - .1), .22, from + len / 2); g.add(r); }
      from = z + gap;
    }
    const fin = new T.Group(); fin.name = side < 0 ? 'fin_l' : 'fin_r'; fin.position.set(side * hx, -1.6, 2);
    const f = new T.Mesh(new T.SphereGeometry(1, 12, 8), skin); f.scale.set(3, .3, 1.6); f.position.x = side * 2.6; fin.add(f); g.add(fin);
    const eye = new T.Group(); eye.name = side < 0 ? 'eye_l' : 'eye_r'; eye.position.set(side * hx * .7, -1.2, hz * 1.02);
    eye.add(new T.Mesh(new T.SphereGeometry(.55, 12, 10), makeToon('#1a1d33'))); g.add(eye);
  }
  const tail = new T.Group(); tail.name = 'tail'; tail.position.set(0, -2, -hz * 1.05);
  const fluke = new T.Mesh(new T.ConeGeometry(2.4, 3.5, 4).rotateX(-Math.PI / 2), skin); fluke.scale.set(1.6, .25, 1); fluke.position.z = -1.6; tail.add(fluke); g.add(tail);
  const hatch = new T.Mesh(new T.BoxGeometry(1.6, .05, 1.6), makeToon('#3a3456')); hatch.position.set(0, .02, BEAST.hold[1] / BEAST.scale); g.add(hatch);
  const crust = new T.Group(); crust.name = 'crust';
  for (let i = 0; i < 8; i++) { const c = new T.Mesh(new T.OctahedronGeometry(.6, 0), crystal); c.position.set((i % 2 ? 1 : -1) * hx * 1.05, -1 - (i % 3) * .6, (i - 3.5) * 1.8); c.scale.y = 1.8; crust.add(c); }
  g.add(crust);
  return g;
}
