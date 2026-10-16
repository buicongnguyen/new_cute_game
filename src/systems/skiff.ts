import * as T from 'three';
import { t } from '../i18n.ts';
import {
  ITEMS,
  LIFT
} from '../rules/content.ts';
import { castFor, landFish, rollFish, takeBite } from '../rules/fishing.ts';
import { FISH_POWER, ReelSim } from '../rules/reel.ts';
import { hasCrew } from '../rules/state.ts';
import { play } from '../sfx.ts';
import { part } from '../world/assets.ts';
import { type Ground } from '../world/combat.ts';
import { makeToon } from '../world/look.ts';
import { FISH_IDS, PUFF } from './shared.ts';
import { GameSystem } from './system.ts';

/** Skiff behavior extracted without changing the original update order. */
export class SkiffSystem extends GameSystem {
  update(dt: number) { this.updateFishing(dt); }

  // ------------------------------------------------------------ fishing trip
  /**
   * The skiff on the sea far below the clouds (the owner: fishing goes down to the sea): a blue sea with a few rocks
   * and buoys, cloud banks overhead, and sky fish swimming just under the surface.
   */
  buildSkiff() {
    const boat = part('props', 'skiff', { shadows: true }) ?? (() => { const m = new T.Mesh(new T.BoxGeometry(1.4, .4, 3.2).translate(0, -.2, 0), makeToon('#c98a4a')); const g = new T.Group(); g.add(m); return g; })();
    boat.name = 'skiff-boat'; boat.rotation.y = Math.PI / 2;
    const sea = new T.Mesh(new T.CircleGeometry(90, 48).rotateX(-Math.PI / 2), new T.MeshLambertMaterial({ color: '#2f9be0', emissive: '#0d4f8a', emissiveIntensity: .35, transparent: true, opacity: .82, depthWrite: false, fog: true }));
    sea.name = 'sea'; sea.position.y = -.12; sea.renderOrder = 2;
    const deep = new T.Mesh(new T.CircleGeometry(90, 48).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ color: '#0b3d73', fog: true }));
    deep.position.y = -2.2;
    this.game.skiff.add(boat, sea, deep);
    const rng = this.game.rng.stream('skiff');
    // Rocks and buoys around, and cloud banks high overhead (Bao is up above them).
    for (let i = 0;i < 7;i++) {
      const o = part('props', i % 2 ? 'sea_buoy' : 'sea_rock') ?? new T.Mesh(new T.IcosahedronGeometry(.8, 0), makeToon('#8c95a5'));
      const a = i / 7 * Math.PI * 2 + rng.next() * .5, r = 8 + rng.next() * 16;
      o.position.set(Math.cos(a) * r, 0, Math.sin(a) * r); o.rotation.y = rng.next() * 6; o.scale.setScalar(i % 2 ? 1 : 1.4 + rng.next());
      this.game.skiff.add(o);
    }
    for (let i = 0;i < 12;i++) {
      const puff = part('nature', 'cloud_puff') ?? new T.Mesh(new T.IcosahedronGeometry(2, 1), PUFF);
      puff.traverse(o => { const m = o as T.Mesh; if (m.isMesh) m.material = PUFF; });
      const a = i / 12 * Math.PI * 2 + rng.next() * .4, r = 22 + rng.next() * 30;
      puff.position.set(Math.cos(a) * (r + 10), 1 + rng.next() * 3, Math.sin(a) * (r + 10)); puff.scale.setScalar(2.4 + rng.next() * 2); puff.rotation.y = rng.next() * 6;
      this.game.skiff.add(puff);
    }
    // The school: a few fish swimming in loops under the surface; one of them comes to the bobber.
    for (let i = 0;i < 7;i++) {
      const id = FISH_IDS[i % FISH_IDS.length], o = part('fish', id) ?? new T.Mesh(new T.SphereGeometry(.25, 8, 6), makeToon('#7cc8ff'));
      o.scale.setScalar(1.6);
      this.game.skiff.add(o);
      this.game.swimmers.push({ o, id, a: rng.next() * 6, r: 3 + rng.next() * 6, speed: .3 + rng.next() * .4, y: -.45 - rng.next() * .4 });
    }
    this.game.skiff.visible = false;
  }

  skiffAt() { const p = this.game.bao.at(this.game.bao.liftCalf()); return new T.Vector3(p.x + 1.6, -this.game.bao.liftDrop, p.z); }

  skiffGround(): Ground {
    const c = this.game.skiffAt();
    return { height: () => c.y, clamp: p => { const dx = (p.x - c.x) / 1.15, dz = (p.z - c.z) / .42, k = dx * dx + dz * dz; if (k > 1) { const s = 1 / Math.sqrt(k); p.x = c.x + (p.x - c.x) * s; p.z = c.z + (p.z - c.z) * s; } }, blockers: [] } as Ground;
  }

  /** Down the lift to the skiff (chapter 2): the sky fish swim deep in the cloud layer. */
  goFishing() {
    if (this.game.raid) { this.game.hud.toast(t('Not now: the Gloom is aboard!'), 'warn'); return; }
    if (this.game.mode !== 'deck') return;
    this.game.skiff.position.copy(this.game.skiffAt()).setY(0); this.game.skiff.visible = true;
    this.game.skiff.position.y = -this.game.bao.liftDrop;
    this.game.ride = { t: 0, dur: LIFT.seconds * (hasCrew(this.game.state, 'juno') ? LIFT.juno : 1), up: false };
    this.game.setMode('ride'); this.game.nearby = null;
    // Clear the cloud layer round the skiff, so Bao and the rope show overhead.
    { const c = this.game.skiffAt(); this.game.sky.hole = { x: c.x, z: c.z, r: 34 }; }
    this.game.keeper.place(this.game.bao.liftSpot().x, this.game.bao.liftSpot().z);
    play('sail');
  }

  /** Pull the rope: the lift hauls you back up to the deck. */
  pullRope() {
    if (this.game.mode !== 'skiff') return;
    this.game.stopFishing();
    this.game.ride = { t: 0, dur: LIFT.seconds * (hasCrew(this.game.state, 'juno') ? LIFT.juno : 1), up: true };
    this.game.setMode('ride'); this.game.nearby = null;
    play('hop');
  }

  updateRide(dt: number) {
    const r = this.game.ride; if (!r) return;
    r.t += dt;
    const k = Math.min(1, r.t / r.dur), e = k * k * (3 - 2 * k);
    this.game.bao.setLift(r.up ? 1 - e : e);
    const at = this.game.bao.liftSpot();
    this.game.keeper.pos.set(at.x, at.y, at.z); this.game.keeper.actor.speed = 0; this.game.keeper.actor.facing = Math.PI / 2;
    this.game.keeper.actor.update(dt);
    if (k < 1) return;
    this.game.ride = null;
    if (r.up) { this.game.enterDeck(false, 'lift'); return; }
    this.game.setMode('skiff');
    const g = this.game.skiffGround(), c = this.game.skiffAt();
    this.game.keeper.bounds = g; this.game.combat.ground = g;
    this.game.keeper.place(c.x - .3, c.z); this.game.keeper.actor.facing = Math.PI / 2;
    this.game.scene_('skiff_first');
  }

  // --------------------------------------------------------------- fishing
  makeFishing() {
    const bobber = new T.Group();
    const ball = new T.Mesh(new T.SphereGeometry(.16, 12, 8), makeToon('#ff5c5c')); bobber.add(ball);
    const top = new T.Mesh(new T.SphereGeometry(.1, 10, 6), makeToon('#ffffff')); top.position.y = .12; bobber.add(top);
    bobber.visible = false;
    const line = new T.Line(new T.BufferGeometry().setFromPoints([new T.Vector3(), new T.Vector3()]), new T.LineBasicMaterial({ color: '#ffffff' }));
    line.visible = false; line.frustumCulled = false;
    this.game.scene.add(bobber, line);
    return { state: 'off' as 'off' | 'wait' | 'bite', sim: null as ReelSim | null, pause: 0, bobber, line, at: new T.Vector3() };
  }

  /** Where the bobber lands: off the skiff's bow. */
  bobberSpot() { const c = this.game.skiffAt(); return new T.Vector3(c.x + 4.2, c.y, c.z + .3); }

  /**
   * A cast (Zoo Garden's fishing game, rules/reel.ts): a fish swims up, nibbles, bites; hook it, then hold Reel and let
   * go when it surges, or the line strains and may snap.
   */
  startFishing() {
    const f = this.game.fishing;
    if (this.game.mode !== 'skiff') return;
    if ((this.game.state.schools[this.game.state.place]?.left ?? 0) <= 0) { this.game.hud.toast(t('The fish are hiding. Try again in a little while.'), 'info'); return; }
    const s = this.game.state, c = castFor(s), rng = this.game.rng.stream('fish');
    f.sim = new ReelSim({
      quality: Math.min(1, .3 + (c.line ? .3 : 0) + c.window), bait: c.bait, random: () => rng.next(),
      choose: bonus => { if (!takeBite(s)) return null; const id = rollFish(rng, s.place, c.line, c.rare * (1 + bonus * .4)); return { id, power: FISH_POWER[id] }; },
    });
    f.state = 'wait'; f.pause = 0;
    f.at.copy(this.game.bobberSpot()); f.bobber.position.copy(this.game.keeper.pos).setY(this.game.keeper.pos.y + 1.4);
    f.bobber.visible = f.line.visible = true;
    this.game.keeper.actor.lookAt(f.at.x, f.at.z);
    this.game.keeper.actor.play('cast', .5);
    play('splash');
  }

  stopFishing() { const f = this.game.fishing; f.state = 'off'; f.sim = null; f.bobber.visible = f.line.visible = false; }

  reel(held = true) { if (this.game.mode === 'skiff' && !this.game.fishing.sim && held) { this.game.startFishing(); return; } this.game.reelHeld = held; }

  updateFishing(dt: number) {
    const f = this.game.fishing;
    // The swimmers circle under the surface whatever happens.
    const t0 = this.game.loop.gameTime, sim = f.sim, coming = sim && (sim.phase === 'approach' || sim.phase === 'nibble' || sim.phase === 'bite' || sim.phase === 'hooked') ? sim.pick?.id ?? null : null;
    let comer = coming ? this.game.swimmers.find(w => w.id === coming) ?? this.game.swimmers[0] : null;
    for (const w of this.game.swimmers) {
      if (w === comer) continue;
      w.a += dt * w.speed;
      const c = this.game.skiffAt();
      w.o.position.set(c.x + 3 + Math.cos(w.a) * w.r, c.y + w.y, c.z + Math.sin(w.a) * w.r * .7);
      w.o.rotation.y = -w.a;
    }
    if (f.state === 'off' || !sim) return;
    if (this.game.mode !== 'skiff' || this.game.raid) { this.game.stopFishing(); return; }
    if (f.pause > 0) { f.pause -= dt; if (f.pause <= 0) this.game.startFishing(); return; }
    const held = this.game.reelHeld || this.game.keys.isDown('interact');
    const before = sim.phase;
    sim.update(dt, held);
    // The bobber: a short arc out, a bob on the swell, dips for nibbles, pulled under on the bite, dragged in as you reel.
    const surface = this.game.skiffAt().y;
    if (sim.phase === 'cast') { const k = Math.min(1, (this.game.loop.gameTime % 10) * 0 + .2); void k; f.bobber.position.lerp(f.at, Math.min(1, dt * 6)); f.bobber.position.y = surface + .6; }
    else {
      const pulled = sim.phase === 'hooked' ? f.at.clone().lerp(this.game.keeper.pos, sim.progress * .8) : f.at;
      const dip = sim.phase === 'bite' ? -.32 + Math.sin(t0 * 40) * .05 : sim.dart > 0 ? -.18 : sim.phase === 'hooked' ? -.15 + Math.sin(t0 * 25) * .08 * (sim.surge > 0 ? 2 : 1) : Math.sin(t0 * 2.4) * .05;
      f.bobber.position.set(pulled.x, surface + dip, pulled.z);
    }
    const hand = this.game.keeper.pos.clone().add(new T.Vector3(Math.sin(this.game.keeper.actor.facing) * .5, 1.5, Math.cos(this.game.keeper.actor.facing) * .5));
    (f.line.geometry as T.BufferGeometry).setFromPoints([hand, f.bobber.position]);
    (f.line.material as T.LineBasicMaterial).color.set(sim.strained ? '#ff5c5c' : '#ffffff');
    // The coming fish swims to the bobber, darts at it, and thrashes on the line.
    if (comer) {
      const bp = f.bobber.position, d = sim.phase === 'approach' ? sim.fishDistance : .45;
      const ang = Math.atan2(comer.o.position.z - bp.z, comer.o.position.x - bp.x) || 0;
      comer.o.position.set(bp.x + Math.cos(ang) * d, surface - .35 + (sim.phase === 'hooked' ? Math.abs(Math.sin(t0 * 9)) * .3 : 0), bp.z + Math.sin(ang) * d);
      comer.o.rotation.y = Math.PI / 2 - ang + (sim.phase === 'hooked' ? Math.sin(t0 * 14) * .5 : 0);
    }
    f.state = sim.phase === 'bite' || sim.phase === 'hooked' ? 'bite' : 'wait';
    if (before !== sim.phase) {
      if (sim.phase === 'nibble') play('bite', .4);
      if (sim.phase === 'bite') { play('bite'); this.game.fx.burst(f.bobber.position.clone(), '#ffffff', 8, { speed: 2, up: 2, size: .08, life: .4 }); this.game.hud.toast(t('A bite! Reel!'), 'good'); }
      if (sim.phase === 'hooked') { play('splash'); this.game.keeper.actor.play('cast', .4); }
      if (sim.phase === 'wait' && sim.reason) { this.game.hud.toast(t(sim.reason), 'info'); sim.reason = ''; if (before !== 'cast') play('miss'); }
      if (sim.phase === 'caught' && sim.pick) {
        const id = sim.pick.id, level = landFish(this.game.state, id);
        play('catch'); this.game.fx.sparkle(f.bobber.position.clone().setY(surface + .5), '#8fdbff', 14);
        this.game.hud.toast(t('You caught a {fish}!', { fish: ITEMS[id].name }), 'good');
        this.game.keeper.actor.play('cheer', .9);
        this.game.skillUp('fish', level);
        this.game.scene_('fished');
        f.pause = 1.2; f.bobber.visible = false;
      }
      if (sim.phase === 'escaped') { this.game.hud.toast(t(sim.reason), 'warn'); play(sim.reason.includes('snapped') ? 'shield' : 'miss'); if (sim.reason.includes('hiding')) { this.game.stopFishing(); return; } f.pause = 1.2; }
    }
  }

  /** What the HUD shows of a cast. */
  fishingView() {
    const sim = this.game.fishing.sim;
    if (!sim) return { reel: null };
    return { reel: { phase: sim.phase, tension: sim.tension, progress: sim.progress, strained: sim.strained } };
  }
}
