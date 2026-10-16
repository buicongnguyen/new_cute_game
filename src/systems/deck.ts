import * as T from 'three';
import { t } from '../i18n.ts';
import {
  CREW, DECK,
  ITEMS,
  VOYAGE,
  type CrewId,
  type ItemId
} from '../rules/content.ts';
import { harvest } from '../rules/garden.ts';
import { maxHp } from '../rules/keeper.ts';
import { count, hasCrew } from '../rules/state.ts';
import { collectDew, collectTreasure } from '../rules/voyage.ts';
import { brush, feedAll, grow, pet } from '../rules/whale.ts';
import { play } from '../sfx.ts';
import { Actor, walkTo } from '../world/actors.ts';
import { flat, type Ground } from '../world/combat.ts';
import { type Blocker } from '../world/isle-view.ts';
import { GOLD } from './shared.ts';
import { GameSystem } from './system.ts';

/** Deck behavior extracted without changing the original update order. */
export class DeckSystem extends GameSystem {
  update(dt: number) { if (this.game.mode === 'deck') { this.updateCrew(dt); this.updateDew(dt); } }

  // ------------------------------------------------------------- grounds
  deckGround(): Ground {
    const blockers: Blocker[] = [];
    const k = (p: T.Vector3) => { const [a, b] = this.game.bao.half(); return (p.x / a) ** 2 + (p.z / b) ** 2; };
    return {
      height: () => 0,
      // Past the gunwale (raiders only; the Captain is held by clamp).
      outside: p => k(p) > 1,
      // Raiders walk on the deck; a knocked one slides on past the gunwale and goes overboard.
      formClamp: (p, knocked) => { const kk = k(p), most = knocked ? 1.4 : .94; if (kk > most) { const s = Math.sqrt(most / kk); p.x *= s; p.z *= s; } },
      clamp: p => {
        const [a, b] = this.game.bao.half(), ax = a - .55, bz = b - .7;
        const kk = (p.x / ax) ** 2 + (p.z / bz) ** 2;
        if (kk > 1) { const s = 1 / Math.sqrt(kk); p.x *= s; p.z *= s; }
      },
      get blockers() {
        return blockers;
      },
    } as Ground & { blockers: Blocker[] };
  }

  /** Deck obstacles: the hatch, fittings, posts and grown trees; at battle stations only the hatch, posts, gongs and cannon. */
  deckBlockers() {
    const s = this.game.state, list: Blocker[] = [];
    const add = (p: readonly [number, number], r: number) => { const v = this.game.bao.at(p); list.push({ x: v.x, z: v.z, r: r * this.game.bao.scale }); };
    add(DECK.hatch, .85);
    s.posts.forEach(i => add(DECK.posts[i], .3));
    if (hasCrew(s, 'juno')) add(DECK.cannon, .55);
    if (this.game.raid) { DECK.gongs.forEach(g => add(g, .55)); return list; }
    add(DECK.workbench, .65); add(DECK.maptable, .55); add(DECK.pantry, .5); add(DECK.ropepost, .3); add(DECK.crate, .55); add(this.game.bao.liftCalf(), .35);
    s.plots.forEach((p, i) => { if (p.tree && p.phase !== 'empty') add(DECK.plots[i], .32); });
    return list;
  }

  enterDeck(first = false, from: 'rope' | 'hatch' | 'lift' | 'plank' = 'rope') {
    this.game.hideSparks();
    this.game.cabin.group.visible = false;
    this.game.skiff.visible = false; this.game.ride = null; this.game.bao.setLift(0);
    this.game.setMode('deck');
    this.game.clearIsle();
    this.game.bao.root.position.set(0, 0, 0);
    this.game.bao.root.visible = true;
    const g = this.game.deckGround();
    Object.defineProperty(g, 'blockers', { get: () => this.game.memoBlockers('deck', () => this.game.deckBlockers()) });
    this.game.keeper.bounds = g; this.game.combat.ground = g;
    const post = this.game.bao.at(DECK.ropepost), hatch = this.game.bao.at(DECK.hatch), lift = this.game.bao.at(this.game.bao.liftCalf()), plank = this.game.bao.at(this.game.bao.plankCalf());
    if (first) this.game.keeper.place(0, 1.5);
    else if (from === 'hatch') { this.game.keeper.place(hatch.x + 1.2, hatch.z + .3); this.game.bao.openHatch(.9); }
    else if (from === 'lift') this.game.keeper.place(lift.x - 1, lift.z);
    else if (from === 'plank') this.game.keeper.place(plank.x - 1.2, plank.z);
    else this.game.keeper.place(post.x - 1.1, post.z + .4);
    this.game.keeper.fainted = false; this.game.keeper.actor.action = 'none';
    if (this.game.state.hero.hp <= 0) this.game.state.hero.hp = maxHp(this.game.state);
    // Chapter 1: the first time up the ladder.
    if (!first && from === 'hatch' && !this.game.state.story.flags.onDeck) { this.game.state.story.flags.onDeck = true; this.game.scene_('deck_first'); this.game.save(); }
    this.game.checkCanGrow();
    this.game.showIsleBelow();
    this.game.snapCamera();
    this.game.applyLook();
    this.game.syncDeck();
  }

  // ---------------------------------------------------------------- crew
  makeCrew() {
    for (const id of Object.keys(CREW) as CrewId[]) {
      if (!CREW[id].joins) continue;
      const a = new Actor('crew', id, CREW[id].color);
      a.root.visible = false;
      this.game.bao.crew.set(id, a);
      this.game.bao.deck.add(a.root);
    }
  }

  placeCrew() {
    for (const [id, a] of this.game.bao.crew) { const p = this.game.bao.at(DECK.crewSpots[id]); a.root.position.copy(p); a.facing = Math.PI * (id === 'nana' ? .2 : 1); }
  }

  updateCrew(dt: number) {
    const raid = !!this.game.raid;
    for (const [id, a] of this.game.bao.crew) {
      if (!this.game.state.crew.includes(id)) continue;
      const home = this.game.bao.at(DECK.crewSpots[id]);
      if (raid) {
        // Down the hatch, banging pots below (hiding is fine; keeping still is not).
        if (!a.root.visible) continue;
        const h = this.game.bao.at(DECK.hatch);
        if (walkTo(a, h.x, h.z, 3.4, dt, .35)) { a.root.visible = false; this.game.bao.openHatch(.8); play('chime', .3); }
        continue;
      }
      let w = this.game.crewWander.get(id);
      if (!w) { w = { at: home.clone(), t: 2 + id.length }; this.game.crewWander.set(id, w); }
      w.t -= dt;
      if (w.t <= 0) { const r = this.game.rng.stream('crew'); w.t = 3 + r.next() * 5; w.at.set(home.x + (r.next() - .5) * 1.6, 0, home.z + (r.next() - .5) * 1.6); }
      if (walkTo(a, w.at.x, w.at.z, 1.1, dt)) { const k = this.game.keeper.pos; if (flat(k, a.root.position) < 2.5) a.lookAt(k.x, k.z); }
    }
  }

  // ---------------------------------------------------------------- dew
  spawnDew(treasure = false) {
    const d = this.game.dews.find(x => !x.alive); if (!d) return;
    const side = this.game.rng.stream('dew').next() < .5 ? -1 : 1, [a] = this.game.bao.half();
    d.alive = true; d.treasure = treasure; d.o.visible = true;
    d.o.position.set(side * (a + 1.6), 1 + this.game.rng.stream('dew').next() * 1.2, -34);
    d.o.scale.setScalar(treasure ? 1.7 : 1);
  }

  updateDew(dt: number) {
    for (const d of this.game.dews) {
      if (!d.alive) continue;
      d.o.position.z += this.game.sky.speed * .75 * dt;
      d.o.rotation.y += dt;
      d.o.position.y += Math.sin(this.game.loop.gameTime * 2 + d.o.position.x) * .004;
      if (d.o.position.z > 26 || this.game.mode !== 'deck') { d.alive = false; d.o.visible = false; }
    }
  }

  catchDew(d: { o: T.Object3D; treasure: boolean; alive: boolean }) {
    if (!d.alive) return;
    d.alive = false; d.o.visible = false;
    if (d.treasure) { if (collectTreasure(this.game.state)) { this.game.hud.toast(t('Treasure cloud! +{g} glimmer', { g: VOYAGE.treasure }), 'good'); this.game.fx.sparkle(d.o.position, '#ffe28a', 20); } }
    else { collectDew(this.game.state); this.game.fx.sparkle(d.o.position, '#8fdbff', 10); this.game.fx.text(d.o.position, '+1✦', 'gain'); }
    play('dew');
  }

  // ----------------------------------------------------------------- actions
  doHarvest(i: number) {
    const r = harvest(this.game.state, i);
    if (!r.ok) { this.game.hud.toast(t(r.why), 'info'); return; }
    const at = this.game.bao.at(DECK.plots[i]).setY(1.2);
    this.game.fx.sparkle(at, '#ffe28a', 8); this.game.fx.text(at, `+${r.n} ${t(ITEMS[r.item].name)}`, 'gain');
    play('harvest');
    if (r.sparks) { this.game.fx.text(at.clone().setY(at.y + .6), `+1 ${t('Sky Spark')}`, 'crit'); this.game.fx.sparkle(at, '#fff3a0', 16); play('dew'); this.game.scene_('spark_first'); }
    this.game.skillUp('garden', r.skill);
    if (ITEMS[r.item].kind === 'whale') this.game.scene_('harvested');
    this.game.syncDeck();
  }

  doFeedAll() {
    const s = this.game.state;
    const whaleFood = (['starfig', 'glowplum', 'puffberry'] as ItemId[]).some(id => count(s, id) > 0);
    if (!whaleFood) { this.game.openPanel('bao'); return; }
    const r = feedAll(s);
    this.game.fedFx(r.pieces, r.xp);
    this.game.scene_('fed');
  }

  /** A pat at the bow (chapter 1: "Meet Bao": Bao opens one huge eye and hums). */
  doPet() {
    const first = !this.game.state.story.flags.petted, r = pet(this.game.state);
    if (!r.ok) { this.game.hud.toast(t(r.why), 'info'); return; }
    this.game.bao.happy(); play('hum');
    const at = this.game.bao.feedSpot().setY(.8);
    this.game.fx.sparkle(at, '#ffb0d8', 14); this.game.fx.text(at, `+${r.mood} ${t('mood')}`, 'gain');
    if (first) this.game.scene_('met_bao'); else this.game.hud.toast(t('Bao hums happily.'), 'good');
  }

  fedFx(pieces: number, xp: number) {
    const at = this.game.bao.feedSpot().setY(.6);
    this.game.fx.burst(at, '#ff7fa8', Math.min(24, 4 + pieces * 2), { speed: 3, up: 4, size: .14 });
    this.game.fx.text(at, `+${xp} ${t('growth')}`, 'gain');
    this.game.bao.happy(); play('feed'); setTimeout(() => play('hum'), 300);
    this.game.checkCanGrow();
  }

  doBrush(i: number) {
    if (!brush(this.game.state).ok) return;
    const sp = this.game.bao.specks[Math.min(i, this.game.bao.specks.length - 1)];
    this.game.fx.burst(sp.position.clone().setY(.4), '#9a8cc8', 10, { speed: 2, up: 3 }); this.game.fx.text(sp.position, '+2✦', 'gain');
    play('brush'); this.game.bao.happy();
    this.game.syncDeck();
  }

  doGrow() {
    const r = grow(this.game.state);
    if (!r.ok) { this.game.hud.toast(t(r.why), 'info'); return; }
    this.game.bao.setStage(r.stage);
    play('grow');
    this.game.fx.sparkle(new T.Vector3(0, 1.5, 0), '#ffe28a', 40, 2);
    this.game.fx.ring(new T.Vector3(0, 0, 0), '#ffffff', 2, 14, 1.4);
    this.game.hud.toast(t('Bao grew into a {stage} whale!', { stage: ['Calf', 'Young', 'Adult', 'Great'][r.stage] }), 'good');
    setTimeout(() => this.game.scene_(`grown_${r.stage}`), 1200);
    this.game.panels.close();
    this.game.syncDeck(); this.game.save();
  }

  syncDeck() {
    this.game.bao.setDeck(this.game.state.gear.deck);
    this.game.bao.sync(this.game.state, !!this.game.raid);
    // The golden-bell keepsake: the Captain's mallet shines gold.
    const gold = this.game.state.keepsakes.includes('goldbell');
    if (this.game.keeper.actor.mallet && this.game.keeper.actor.mallet.userData.gold !== gold) {
      this.game.keeper.actor.mallet.userData.gold = gold;
      this.game.keeper.actor.mallet.traverse(o => { const m = o as T.Mesh; if (!m.isMesh) return; m.userData.plain ??= m.material; m.material = gold ? GOLD : m.userData.plain; });
    } if (this.game.mode === 'deck' && !this.game.crewPlaced) { this.game.placeCrew(); this.game.crewPlaced = true; }
  }
}
