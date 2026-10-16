import * as T from 'three';
import { damp } from '../core/feel.ts';
import { t } from '../i18n.ts';
import {
  DECK,
  DRONE
} from '../rules/content.ts';
import { give } from '../rules/state.ts';
import { play } from '../sfx.ts';
import { findChild, part } from '../world/assets.ts';
import { makeToon } from '../world/look.ts';
import { GameSystem } from './system.ts';

/** Drone behavior extracted without changing the original update order. */
export class DroneSystem extends GameSystem {
  update(dt: number, stick: { x: number; z: number } = this.game.hud.stick) { this.updateDrone(dt, stick); }

  startDrone() {
    const s = this.game.state;
    if (s.gear.drone <= 0 || this.game.raid || this.game.mode !== 'deck') return;
    const obj = part('props', 'drone', { shadows: true }) ?? (() => { const m = new T.Mesh(new T.CylinderGeometry(.7, .8, .35, 16), makeToon('#2fb0a8')); const g = new T.Group(); g.add(m); return g; })();
    const rotors = [0, 1, 2, 3].map(i => findChild(obj, `rotor_${i}`)).filter((r): r is T.Object3D => !!r);
    const tether = new T.Line(new T.BufferGeometry().setFromPoints([new T.Vector3(), new T.Vector3()]), new T.LineBasicMaterial({ color: '#fff3d6' }));
    tether.frustumCulled = false;
    this.game.scene.add(obj, tether);
    const pad = this.game.bao.at(DECK.dronePad);
    obj.position.set(pad.x, .12, pad.z);
    this.game.drone = { obj, vel: new T.Vector3(), rotors, tether };
    this.game.bao.droneOut = true; this.game.syncDeck();
    this.game.setMode('drone'); this.game.nearby = null;
    if (!this.game.sparks.length) this.game.makeSparks();
    play('sail');
    this.game.scene_('drone_first');
  }

  droneRange() { return DRONE.range[Math.min(2, this.game.state.gear.drone)] + this.game.bao.half()[1] * .5; }

  updateDrone(dt: number, stick: { x: number; z: number }) {
    const d = this.game.drone; if (!d) return;
    const want = new T.Vector3(stick.x, 0, stick.z).multiplyScalar(DRONE.speed);
    d.vel.x = damp(d.vel.x, want.x, 4, dt); d.vel.z = damp(d.vel.z, want.z, 4, dt);
    const p = d.obj.position;
    p.x += d.vel.x * dt; p.z += d.vel.z * dt;
    // The tether: it stops at its length, and the scooter leans back against it.
    const r = Math.hypot(p.x, p.z), max = this.game.droneRange();
    if (r > max) { p.x *= max / r; p.z *= max / r; if (!this.game.tetherWarned) { this.game.tetherWarned = true; this.game.hud.toast(t('The tether is at its end: this is as far as the scooter goes.'), 'info'); } } else if (r < max - 4) this.game.tetherWarned = false;
    p.y = damp(p.y, DRONE.height + Math.sin(this.game.loop.gameTime * 1.6) * .25, 3, dt);
    const speed = Math.hypot(d.vel.x, d.vel.z);
    if (speed > .4) d.obj.rotation.y = Math.atan2(d.vel.x, d.vel.z);
    d.obj.rotation.x = d.vel.z / DRONE.speed * .2; d.obj.rotation.z = -d.vel.x / DRONE.speed * .2;
    for (const rot of d.rotors) rot.rotation.y += dt * 40;
    // The Captain sits in the saddle.
    this.game.keeper.pos.set(p.x, p.y + .5, p.z); this.game.keeper.actor.facing = d.obj.rotation.y; this.game.keeper.actor.speed = 0; this.game.keeper.actor.update(dt);
    const pad = this.game.bao.at(DECK.dronePad);
    (d.tether.geometry as T.BufferGeometry).setFromPoints([pad.setY(.2), p.clone().setY(p.y - .1)]);
    // Sky dew and treasure clouds can be caught on the wing.
    for (const dw of this.game.dews) if (dw.alive && dw.o.position.distanceTo(p) < 2) this.game.catchDew(dw);
  }

  /** Back to the pad (at once in a raid). */
  landDrone(now = false) {
    const d = this.game.drone; if (!d) return;
    const finish = () => { this.game.scene.remove(d.obj, d.tether); this.game.drone = null; this.game.bao.droneOut = false; const pad = this.game.bao.at(DECK.dronePad); this.game.setMode('deck'); this.game.keeper.place(pad.x + 1.3, pad.z); this.game.syncDeck(); play('hop'); };
    if (now) { finish(); return; }
    this.game.cut(finish);
  }

  makeSparks() {
    const rng = this.game.rng.stream('sparks');
    for (let i = 0;i < DRONE.sparks;i++) {
      const o = part('props', 'sky_spark') ?? new T.Mesh(new T.OctahedronGeometry(.25, 0), makeToon('#ffd23a', { emissive: '#ffb000' }));
      this.game.scene.add(o);
      const s = { o, alive: false, t: rng.next() * 3, phase: rng.next() * 6 };
      this.game.sparks.push(s);
    }
  }

  /** Sparks float round Bao (only while the scooter flies); a caught one comes back somewhere else later. */
  updateSparks(dt: number) {
    const d = this.game.drone, rng = this.game.rng.stream('sparks'), max = this.game.droneRange();
    for (const sp of this.game.sparks) {
      if (!sp.alive) {
        sp.t -= dt; sp.o.visible = false;
        if (sp.t > 0) continue;
        const a = rng.next() * Math.PI * 2, r = this.game.bao.half()[1] * .9 + rng.next() * (max - this.game.bao.half()[1] * .9);
        sp.o.position.set(Math.cos(a) * r, 1.5 + rng.next() * 4, Math.sin(a) * r); sp.alive = true; sp.o.visible = true;
      }
      sp.phase += dt; sp.o.rotation.y += dt * 2; sp.o.position.y += Math.sin(sp.phase * 2) * dt * .3;
      if (d && sp.o.position.distanceTo(d.obj.position) < DRONE.catch + .5) {
        sp.alive = false; sp.t = DRONE.respawn; sp.o.visible = false;
        give(this.game.state, 'spark');
        this.game.fx.sparkle(sp.o.position.clone(), '#ffe28a', 14); this.game.fx.text(sp.o.position, `+1 ${t('Sky Spark')}`, 'gain'); play('dew');
      }
    }
  }

  hideSparks() { for (const sp of this.game.sparks) sp.o.visible = false; }
}
