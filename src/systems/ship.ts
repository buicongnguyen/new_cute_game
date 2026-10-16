import * as T from 'three';
import { damp } from '../core/feel.ts';
import { t } from '../i18n.ts';
import {
  BEAST,
  CANNON,
  CREW, DECK,
  HEART,
  HELPER, HELPERS,
  ISLE_MAPS, ITEMS,
  LIST,
  PLACES,
  isShip,
  type HelperId, type IsleId,
  type ShipId
} from '../rules/content.ts';
import { freeCaptive, tierOf } from '../rules/isle.ts';
import { heal, maxHp, ringDamage } from '../rules/keeper.ts';
import { hasCrew } from '../rules/state.ts';
import { play, setMusic } from '../sfx.ts';
import { Actor, walkTo } from '../world/actors.ts';
import { BeastShipView } from '../world/beast-ship.ts';
import { flat } from '../world/combat.ts';
import { GLOOM } from '../world/look.ts';
import { BELL_GEO, GOLD } from './shared.ts';
import { GameSystem } from './system.ts';

/** Ship behavior extracted without changing the original update order. */
export class ShipSystem extends GameSystem {
  update(dt: number) { this.updateCannon(dt); this.updateShells(dt); }

  /** Boarding a Gloom ship (chapter 5): Juno's plank, and two crew mates of your choice. */
  board() {
    const s = this.game.state, id = s.place as ShipId;
    if (!isShip(id)) return;
    if (s.isles[id].freed) { this.game.hud.toast(t('This ship is free. Nobody aboard needs help.'), 'info'); return; }
    if (!hasCrew(s, 'juno')) { this.game.hud.toast(t('Without Juno’s plank, Bao cannot board a ship.'), 'warn'); return; }
    this.game.openPanel('board');
  }

  /** Over the plank onto the enemy deck, with the picked crew mates. */
  boardNow(picked: HelperId[]) {
    const s = this.game.state, id = s.place as ShipId;
    s.boarders = picked.filter(h => hasCrew(s, h)).slice(0, 2);
    this.game.panels.close();
    this.game.cut(() => {
      this.game.setMode('isle');
      this.game.stopFishing();
      const v = this.game.isleView(id) as BeastShipView, map = ISLE_MAPS[id], prog = s.isles[id], tier = tierOf(id);
      for (const [, o] of this.game.isles) o.group.visible = false;
      v.group.visible = true; v.group.position.set(0, 0, 0); v.setFar(false); v.tilt = 0; v.setFreed(prog.freed, true); this.game.sky.hole = null;
      this.game.isle = v;
      this.game.clearIsle();
      const g = this.game.isleGround(v);
      this.game.keeper.bounds = g; this.game.combat.ground = g; this.game.combat.formsTier = tier; this.game.combat.raidTarget = null; this.game.combat.onShip = true;
      // Bao alongside, its plank laid across to the landing gap.
      const rail = this.game.bao.half()[0] * .93;
      this.game.bao.root.position.set(-(rail + 3.2 + BEAST.half[0]), 0, -this.game.bao.plankCalf()[1] * this.game.bao.scale);
      this.game.bao.plankOut = true; this.game.bao.sync(s, false);
      map.groups.forEach((grp, gi) => {
        if (prog.groups[gi]) return;
        grp.forms.forEach((f, i) => { const a = i / grp.forms.length * Math.PI * 2; this.game.combat.spawn(f, new T.Vector3(grp.at[0] + Math.cos(a) * 1.8, 0, grp.at[1] + Math.sin(a) * 1.8), tier, { group: gi }); });
      });
      map.captives.forEach((c, i) => { if (!prog.captives[i]) { this.game.combat.addCage(i, new T.Vector3(c.at[0], 0, c.at[1]), true); this.game.familyIn(i, c.at); } });
      this.game.makeHive(id, new T.Vector3(map.hive[0], 0, map.hive[1]));
      this.game.keeper.place(map.landing[0] + .8, map.landing[1] - .6);
      this.game.keeper.fainted = false;
      s.boarders.forEach((h, i) => { const a = new Actor('crew', h, CREW[h].color); a.root.position.set(map.landing[0] + .4, 0, map.landing[1] + .6 + i * .8); this.game.scene.add(a.root); this.game.helpers.push({ id: h, actor: a, t: i * .7, heal: 0, side: i ? 1 : -1 }); });
      this.game.cannonT = 2; this.game.listT = 0; this.game.listSide = 1;
      this.game.gloomTarget = 0; GLOOM.value = 0;
      // Under the Grey Star the pod sleeps in the Deep Mist, crusted (the shared Gloom tint).
      if (id === 'star') this.game.sleepingPod(prog.freed);
      prog.visited = true;
      this.game.snapCamera(); this.game.applyLook();
      this.game.hud.toast(t(PLACES[id].name), 'good');
      setMusic(id === 'star' ? 'night' : 'gloom');
      this.game.scene_('board_first');
    });
  }

  /** A backfolk family (a grown-up and a child) in a cage in a Gloom ship's hold. */
  familyIn(cage: number, at: [number, number]) {
    const actors = (['folk_a', 'folk_b'] as const).map((name, i) => { const a = new Actor('crew', name, i ? '#7bd54a' : '#7cc8ff'); a.root.position.set(at[0] + (i ? .28 : -.22), 0, at[1] + (i ? .1 : -.05)); a.facing = Math.PI * .5; this.game.scene.add(a.root); return a; });
    this.game.families.push({ actors, cage, t: -1 });
  }

  /** Crew mates on a boarding: follow the Captain and ring raiders near them. */
  updateHelpers(dt: number) {
    if (this.game.mode !== 'isle' || !this.game.helpers.length) return;
    const k = this.game.keeper.pos;
    for (const h of this.game.helpers) {
      const def = HELPERS[h.id], a = h.actor, p = a.root.position;
      h.t -= dt; h.heal += dt;
      const foe = this.game.combat.forms.filter(f => !f.dead && !f.boarding).sort((x, y) => flat(x.pos, p) - flat(y.pos, p))[0];
      const near = foe && flat(foe.pos, p) < 5 && flat(foe.pos, k) < 9;
      if (near) {
        if (flat(foe.pos, p) > HELPER.reach - .4) walkTo(a, foe.pos.x, foe.pos.z, HELPER.speed, dt, HELPER.reach - .5);
        else { a.speed = damp(a.speed, 0, 10, dt); a.lookAt(foe.pos.x, foe.pos.z); }
        if (h.t <= 0 && flat(foe.pos, p) < HELPER.reach + foe.radius) {
          h.t = HELPER.every; a.lookAt(foe.pos.x, foe.pos.z); a.play('swing', .24);
          this.game.combat.strike(p.clone(), a.facing, HELPER.reach, ringDamage(this.game.state) * def.damage, false, { quiet: true, slow: def.slow, push: def.push, cages: false });
          this.game.fx.ring(p, CREW[h.id].color, .3, 1.4, .3, .6);
        }
      } else {
        // Keep beside the Captain, a little behind.
        const side = new T.Vector3(Math.cos(this.game.keeper.actor.facing) * h.side, 0, -Math.sin(this.game.keeper.actor.facing) * h.side).multiplyScalar(1.3);
        const back = new T.Vector3(Math.sin(this.game.keeper.actor.facing), 0, Math.cos(this.game.keeper.actor.facing)).multiplyScalar(-1.2);
        const want = k.clone().add(side).add(back);
        this.game.keeper.bounds.clamp(want);
        if (walkTo(a, want.x, want.z, HELPER.speed, dt, .4)) a.lookAt(k.x + Math.sin(this.game.keeper.actor.facing) * 3, k.z + Math.cos(this.game.keeper.actor.facing) * 3);
      }
      this.game.keeper.bounds.clamp(p);
      if (def.heal && h.heal >= HELPER.healEvery && this.game.state.hero.hp < maxHp(this.game.state) && this.game.keeper.alive()) {
        h.heal = 0; heal(this.game.state, def.heal);
        this.game.fx.text(k, `+${def.heal}`, 'heal'); this.game.fx.sparkle(k.clone().setY(1), CREW.mina.color, 8);
      }
      a.update(dt);
    }
  }

  onCaptive(i: number, at: T.Vector3) {
    const s = this.game.state, id = s.place as IsleId;
    const r = freeCaptive(s, id, i);
    if (!r.ok) return;
    if (r.levels) this.game.levelUp();
    play('free'); this.game.fx.sparkle(at.clone().setY(1.4), '#ffffff', 16);
    const fam = this.game.families.find(x => x.cage === i); if (fam) fam.t = 0;
    this.game.fx.text(at.clone().setY(2), `+${r.glimmer}✦`, 'gain');
    this.game.hud.toast(t('A family is free! They give you {n} {item}.', { n: r.gift[1], item: ITEMS[r.gift[0]].name }), 'good');
    this.game.scene_('family');
    this.game.save();
  }

  heartSong() {
    heal(this.game.state, HEART.songHeal);
    this.game.fx.text(this.game.keeper.pos, `+${HEART.songHeal}`, 'heal');
    this.game.fx.sparkle(this.game.keeper.pos.clone().setY(1), '#ffe28a', 12);
    play('song'); this.game.hud.toast(t('Bao sings! The Heart’s shield cracks.'), 'good');
    this.game.scene_('heart_song');
  }

  // ---------------------------------------------------------- chime cannon
  /**
   * Juno's chime cannon fires a ringing bell at the thickest crowd of Gloom forms: on Bao's deck during a raid, and
   * onto the enemy deck during a boarding (it fires from Bao, alongside).
   */
  updateCannon(dt: number) {
    if (!hasCrew(this.game.state, 'juno')) return;
    const onDeck = this.game.mode === 'deck' && !!this.game.raid && this.game.raid.wave >= 0, boarding = this.game.mode === 'isle' && this.game.isle?.kind === 'ship';
    if (!onDeck && !boarding) return;
    this.game.cannonT -= dt;
    if (this.game.cannonT > 0) return;
    const forms = this.game.combat.forms.filter(f => !f.dead && !f.boarding);
    if (!forms.length) return;
    const best = forms.map(f => ({ f, n: forms.filter(o => flat(o.pos, f.pos) < CANNON.radius).length })).sort((a, b) => b.n - a.n)[0].f;
    this.game.cannonT = CANNON.every;
    const muzzle = this.game.bao.at(DECK.cannon).add(this.game.bao.root.position).setY(1.2);
    this.game.bao.fireCannon(best.pos.clone().sub(this.game.bao.root.position));
    const bell = new T.Mesh(BELL_GEO, GOLD);
    bell.position.copy(muzzle);
    this.game.scene.add(bell);
    this.game.shells.push({ mesh: bell, from: muzzle, to: best.pos.clone(), t: 0, deck: onDeck });
    play('gong', .5);
  }

  updateShells(dt: number) {
    for (const s of [...this.game.shells]) {
      s.t += dt / .7;
      const k = Math.min(1, s.t);
      s.mesh.position.lerpVectors(s.from, s.to, k); s.mesh.position.y += Math.sin(k * Math.PI) * 4; s.mesh.rotation.x += dt * 9;
      if (k < 1) continue;
      this.game.scene.remove(s.mesh); this.game.shells.splice(this.game.shells.indexOf(s), 1);
      this.game.fx.ring(s.to, '#ffe28a', .5, CANNON.radius, .5); this.game.fx.burst(s.to.clone().setY(.8), '#ffe28a', 14, { speed: 5, up: 4 });
      this.game.fx.shake(.25); play('gong');
      this.game.combat.blast(s.to, CANNON.radius, CANNON.push, ringDamage(this.game.state) * CANNON.damage);
    }
  }

  /** The Grey Star's deck lists toward one rail, then the other: everyone slides, and raiders near a gap fall. */
  updateList(dt: number) {
    const v = this.game.isle;
    if (this.game.mode !== 'isle' || v?.kind !== 'ship' || v.isle !== 'star' || v.freed || !this.game.hive || this.game.hive.shielded) { if (v?.kind === 'ship') v.tilt = 0; return; }
    this.game.listT += dt;
    if (this.game.listT >= LIST.every) { this.game.listT = 0; this.game.listSide = -this.game.listSide; this.game.hud.toast(t('The deck lists the other way!'), 'warn'); play('slam', .5); }
    v.tilt = this.game.listSide;
    const push = this.game.listSide * LIST.drift * dt;
    if (this.game.keeper.alive()) { this.game.keeper.pos.x += push; this.game.keeper.bounds.clamp(this.game.keeper.pos); }
    for (const f of this.game.combat.forms) if (!f.dead && !f.boarding) f.pos.x += push * 1.2;
  }
}
