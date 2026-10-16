import * as T from 'three';
import { t } from '../i18n.ts';
import {
  DECK,
  POST, RAID
} from '../rules/content.ts';
import { maxHp, ringDamage } from '../rules/keeper.ts';
import { hasCrew } from '../rules/state.ts';
import { raidPlan } from '../rules/story.ts';
import { endRaid } from '../rules/voyage.ts';
import { play } from '../sfx.ts';
import { findChild, part } from '../world/assets.ts';
import { flat } from '../world/combat.ts';
import { addGloom, makeToon } from '../world/look.ts';
import { RAIDER_GLOOM, makeGloomCloud } from './shared.ts';
import { GameSystem } from './system.ts';

/** Raid behavior extracted without changing the original update order. */
export class RaidSystem extends GameSystem {
  update(dt: number) { this.updateRaid(dt); }

  // ---------------------------------------------------------------- raids
  /**
   * A raid is a ship battle (the owner, 2026-10-16): battle stations sink the garden and fittings below the deck (they
   * are not drawn during the fight), two gongs rise, and Gloom ships come alongside from different sides. Raiders walk
   * over the planks and head for the hatch; ring them, Spin them or blast them with a gong until they fall overboard.
   */
  startRaid() {
    // The Gloom comes aboard: whoever is in the cottage or the skiff comes up to defend Bao.
    if (this.game.mode === 'house') { this.game.cabin.group.visible = false; this.game.enterDeck(false, 'hatch'); }
    if (this.game.mode === 'skiff' || this.game.mode === 'ride') { this.game.stopFishing(); this.game.enterDeck(false, 'lift'); }
    if (this.game.mode === 'drone') this.game.landDrone(true);
    const small = !this.game.state.voyage?.scripted;
    const plan = raidPlan(this.game.state, small);
    if (!plan) { if (this.game.state.voyage) this.game.state.voyage.raidState = 'done'; return; }
    const warn = hasCrew(this.game.state, 'ria') ? RAID.warnLookout : RAID.warn;
    this.game.stopFishing();
    this.game.bao.battle(true);
    play('slam');
    this.enter();
    this.game.raid = { plan, wave: -1, t: 0, warn, total: 0, postT: [], ships: this.game.makeShips(small ? 1 : RAID.ships), queue: [], gongCd: DECK.gongs.map(() => 0) };
    this.game.combat.raidTarget = this.game.bao.at(DECK.hatch);
    this.game.cannonT = 3;
    play('raid');
    this.game.hud.toast(hasCrew(this.game.state, 'ria') ? t('Ria: “Gloom ships off the side! Battle stations!”') : t('Gloom ships! Battle stations: the garden goes below!'), 'warn');
    this.game.panels.close();
    if (!this.game.state.story.flags.scene_raid_first) this.game.scene_('raid_first');
    this.game.syncDeck();
  }

  /** Gloom ships on different sides of Bao, each with a boarding plank to the deck's edge. */
  makeShips(n: number) {
    const [a, b] = this.game.bao.half(), rng = this.game.rng.stream('raid');
    const sides = (['left', 'right', 'front', 'back'] as const).map(s => ({ s, k: rng.next() })).sort((x, y) => x.k - y.k).slice(0, n).map(x => x.s);
    return sides.map(side => {
      const out = side === 'left' ? new T.Vector3(-1, 0, 0) : side === 'right' ? new T.Vector3(1, 0, 0) : side === 'front' ? new T.Vector3(0, 0, -1) : new T.Vector3(0, 0, 1);
      const along = (rng.next() - .5) * .5;
      const rim = side === 'left' || side === 'right' ? new T.Vector3(out.x * a * .96, 0, along * b) : new T.Vector3(along * a, 0, out.z * b * .96);
      const centre = rim.clone().addScaledVector(out, 5.6), dock = rim.clone().addScaledVector(out, 3.6);
      // A small crusted sky creature with a plank platform on its back (the owner: no sailing ships).
      const ship = part('gloom', 'gloom_raider', { shadows: false }) ?? makeGloomCloud(true);
      ship.traverse(o => { const m = o as T.Mesh; if (m.isMesh && !(m.material as T.Material).name.startsWith('gloom') && !(m.material as T.Material).name.startsWith('glow')) m.material = addGloom((m.material as T.Material).clone(), RAIDER_GLOOM); });
      // Head toward Bao's stern, so it swims alongside.
      ship.rotation.y = side === 'left' || side === 'right' ? 0 : Math.PI / 2;
      const plank = part('gloom', 'plank') ?? (() => { const m = new T.Mesh(new T.BoxGeometry(.8, .1, 3.2).translate(0, -.05, 1.6), makeToon('#8c86a8')); const g = new T.Group(); g.add(m); return g; })();
      plank.position.copy(dock); plank.rotation.y = Math.atan2(-out.x, -out.z);
      plank.scale.set(1, 1, Math.max(.5, dock.distanceTo(rim) / 3.2));
      plank.visible = false;
      this.game.scene.add(ship, plank);
      ship.position.copy(centre).addScaledVector(out, 40); ship.position.y = -8;
      return { ship, plank, out, rim, dock, centre, k: 0, leaving: false };
    });
  }

  updateRaid(dt: number) {
    const r = this.game.raid; if (!r) return;
    r.t += dt;
    for (let i = 0;i < r.gongCd.length;i++) r.gongCd[i] = Math.max(0, r.gongCd[i] - dt);
    if (r.wave < 0) { if (r.t >= r.warn) { r.wave = 0; this.game.queueWave(); } return; }
    r.total += dt;
    // Chime Posts ring Gloom forms near them.
    this.game.state.posts.forEach((spot, i) => {
      r.postT[i] = (r.postT[i] ?? 0) + dt;
      if (r.postT[i] < POST.every) return;
      const at = this.game.bao.at(DECK.posts[spot]);
      if (!this.game.combat.forms.some(f => !f.dead && !f.boarding && flat(f.pos, at) < POST.radius)) return;
      r.postT[i] = 0;
      this.game.fx.ring(at, '#ffe28a', .4, POST.radius, .35, .6);
      this.game.combat.strike(at, 0, POST.radius, ringDamage(this.game.state) * POST.share * (hasCrew(this.game.state, 'tam') ? POST.tamBonus : 1), true, { quiet: true, slow: true, cages: false });
    });
    // Raiders board one after another from each ship.
    for (const q of r.queue) {
      q.t -= dt;
      if (q.t > 0) continue;
      const ship = r.ships[q.ship], f = this.game.combat.spawn(q.kind, ship.dock, r.plan.tier, { scale: r.plan.scale, raid: true });
      const to = ship.rim.clone().addScaledVector(ship.out, -.9);
      f.boarding = { from: ship.dock.clone(), to, t: 0, len: ship.dock.distanceTo(to) };
      this.game.fx.burst(ship.dock.clone().setY(.6), '#9a8cc8', 6, { speed: 2, up: 2 });
    }
    r.queue = r.queue.filter(q => q.t > 0);
    if (this.game.combat.aliveCount() === 0 && !r.queue.length) {
      if (r.wave + 1 < r.plan.waves.length) { r.wave++; this.game.queueWave(); }
      else this.game.finishRaid(true);
      return;
    }
    if (r.total >= RAID.timeout) this.game.finishRaid(false);
  }

  queueWave() {
    const r = this.game.raid!, wave = r.plan.waves[r.wave];
    wave.forEach((kind, i) => { const ship = i % r.ships.length; r.queue.push({ kind, ship, t: .3 + Math.floor(i / r.ships.length) * RAID.boardEvery }); });
    for (const s of r.ships) s.plank.visible = true;
    this.game.hud.toast(t('Wave {n} of {all}! Knock them overboard!', { n: r.wave + 1, all: r.plan.waves.length }), 'warn');
  }

  /** A gong: one blast that throws every raider near it toward the edge. */
  ringGong(i: number) {
    const r = this.game.raid; if (!r) return;
    if (r.gongCd[i] > 0) { this.game.hud.toast(t('The gong is still humming…'), 'info'); return; }
    r.gongCd[i] = RAID.gong.cooldown;
    const at = this.game.bao.at(DECK.gongs[i]);
    this.game.keeper.actor.lookAt(at.x, at.z); this.game.keeper.actor.play('swing', .24);
    this.game.bao.ringGong(i);
    play('gong');
    this.game.fx.ring(at, '#ffe28a', .6, RAID.gong.radius, .6); this.game.fx.ring(at, '#ffffff', .3, RAID.gong.radius * .7, .45, .6);
    this.game.fx.shake(.35);
    this.game.combat.blast(at, RAID.gong.radius, RAID.gong.push, ringDamage(this.game.state) * RAID.gong.damage);
  }

  finishRaid(won: boolean) {
    const r = this.game.raid; if (!r) return;
    endRaid(this.game.state, won, won ? r.plan.waves.length : 0);
    // Raiders that give up pop in the sunlight and float off as animals; the ships sail away.
    this.game.combat.freeAll();
    for (const s of r.ships) { s.leaving = true; s.plank.visible = false; }
    this.game.leavingShips.push(...r.ships);
    this.game.combat.raidTarget = null;
    this.game.raid = null;
    this.exit();
    this.game.bao.battle(false);
    if (won) { play('arrive'); this.game.hud.toast(t('Raid beaten! +{g} glimmer', { g: r.plan.waves.length * RAID.winPerWave }), 'good'); this.game.scene_('raid_won'); }
    else { this.game.hud.toast(t('The Gloom left… some trees below deck are crusted.'), 'warn'); this.game.scene_('raid_lost'); }
    if (this.game.keeper.fainted) { this.game.state.hero.hp = maxHp(this.game.state); this.game.keeper.fainted = false; this.game.keeper.actor.action = 'none'; }
    this.game.syncDeck();
    this.game.save();
  }

  /** Ships come in from far away during the warning, then sail off when the raid is over. */
  updateShips(dt: number) {
    const live = this.game.raid?.ships ?? [];
    for (const s of [...live, ...this.game.leavingShips]) {
      s.k = s.leaving ? Math.max(0, s.k - dt / 2.4) : Math.min(1, s.k + dt / Math.max(1.5, this.game.raid?.warn ?? 3));
      const e = 1 - (1 - s.k) ** 3;
      s.ship.position.copy(s.centre).addScaledVector(s.out, 40 * (1 - e));
      s.ship.position.y = -8 * (1 - e) + Math.sin(this.game.loop.realTime * 1.3 + s.centre.x) * .25;
      s.ship.rotation.z = Math.sin(this.game.loop.realTime * .9 + s.centre.z) * .04;
      const t2 = this.game.loop.realTime + s.centre.x;
      const finL = findChild(s.ship, 'fin_l'), finR = findChild(s.ship, 'fin_r'), tail = findChild(s.ship, 'tail');
      if (finL) finL.rotation.z = Math.sin(t2 * 1.6) * .3; if (finR) finR.rotation.z = -Math.sin(t2 * 1.6) * .3; if (tail) tail.rotation.x = Math.sin(t2 * 1.2) * .25;
    }
    this.game.leavingShips = this.game.leavingShips.filter(s => {
      if (s.k > 0) return true;
      this.game.scene.remove(s.ship, s.plank);
      // The raid creature's tinted materials were its own copies.
      s.ship.traverse(o => { const m = o as T.Mesh; if (m.isMesh && (m.material as T.Material).customProgramCacheKey?.() === 'gloom') (m.material as T.Material).dispose(); });
      return false;
    });
  }
}
