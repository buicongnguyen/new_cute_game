import * as T from 'three';
import { t } from '../i18n.ts';
import {
  BEAST,
  CONCH,
  CREW, DECK,
  ISLE_MAPS, ITEMS,
  MARKETS, PLACES,
  isLand, isShip,
  type CrewId,
  type IsleId,
  type LandId
} from '../rules/content.ts';
import { ringCrust } from '../rules/garden.ts';
import { LEFTOVER_FORMS, cageLocked, formFreed, groupCleared, hiveBroken, hiveMaxHp, hiveShielded, mineOre, pickWild, rescue, faint as rulesFaint, spireBroken, tierOf } from '../rules/isle.ts';
import { maxHp } from '../rules/keeper.ts';
import { play, setMusic } from '../sfx.ts';
import { Actor, walkTo } from '../world/actors.ts';
import { BeastShipView } from '../world/beast-ship.ts';
import { flat, type Ground } from '../world/combat.ts';
import { HiveFight, noteView } from '../world/hive.ts';
import { IsleView, type Blocker } from '../world/isle-view.ts';
import { GLOOM } from '../world/look.ts';
import { ISLE_BELOW, PlaceView } from './shared.ts';
import { GameSystem } from './system.ts';

/** Isle behavior extracted without changing the original update order. */
export class IsleSystem extends GameSystem {
  update(dt: number) { this.updateFollowers(dt); }

  isleGround(isle: PlaceView): Ground {
    const extra = (): Blocker[] => [
      ...this.game.combat.spires.filter(sp => !sp.broken).map(sp => ({ x: sp.pos.x, z: sp.pos.z, r: .75 })),
      ...this.game.combat.cages.filter(c => !c.open).map(c => ({ x: c.pos.x, z: c.pos.z, r: .8 })),
      ...(this.game.hive && !this.game.hive.broken ? [{ x: this.game.hive.pos.x, z: this.game.hive.pos.z, r: this.game.hive.radius }, ...this.game.hive.blockers()] : []),
    ];
    const memo = () => this.game.memoBlockers('isle', () => [...isle.blockers, ...extra()]);
    if (isle.kind === 'ship') return { height: () => 0, clamp: p => isle.clampInside(p), outside: p => isle.outside(p), formClamp: (p, k) => isle.formClamp(p, k), get blockers() { return memo(); } } as Ground;
    return { height: (x, z) => isle.height(x, z), clamp: p => isle.clampInside(p), get blockers() { return memo(); } } as Ground;
  }

  /** While Bao hovers over a land, the land floats below it; at a Gloom ship, the ship floats off the starboard rail. */
  showIsleBelow() {
    for (const [, v] of this.game.isles) v.group.visible = false;
    this.game.sky.hole = null;
    this.game.bao.plankOut = false;
    if (this.game.state.voyage || this.game.state.place === 'dawnreach') { this.game.isle = null; return; }
    const id = this.game.state.place as IsleId, v = this.game.isleView(id);
    v.group.visible = true; v.setFar(true);
    if (v.kind === 'ship') {
      const rail = this.game.bao.half()[0] * .93;
      v.group.position.set(rail + 3.2 + BEAST.half[0], 0, this.game.bao.plankCalf()[1] * this.game.bao.scale);
      v.setFreed(this.game.state.isles[id].freed, true);
      this.game.bao.plankOut = !this.game.state.isles[id].freed;
      this.game.gloomTarget = 0; GLOOM.value = 0;
    } else {
      v.group.position.copy(ISLE_BELOW); v.rope.visible = false; v.group.scale.setScalar(1);
      this.game.sky.hole = { x: ISLE_BELOW.x, z: ISLE_BELOW.z, r: v.radius + 4 };
      this.game.gloomTarget = this.game.state.isles[id].freed ? 0 : 1; GLOOM.value = this.game.gloomTarget;
    }
    this.game.isle = v;
  }

  isleView(id: IsleId): PlaceView {
    let v = this.game.isles.get(id);
    if (!v) { v = isShip(id) ? new BeastShipView(id) : new IsleView(id as LandId); this.game.isles.set(id, v); this.game.scene.add(v.group); }
    return v;
  }

  clearIsle() {
    this.game.combat.clear();
    this.game.combat.onShip = false;
    for (const w of this.game.pod) this.game.scene.remove(w);
    this.game.pod = [];
    if (this.game.hive) { this.game.hive.dispose(); this.game.hive = null; }
    for (const f of this.game.followers) this.game.scene.remove(f.actor.root);
    this.game.followers = [];
    for (const h of this.game.helpers) this.game.scene.remove(h.actor.root);
    this.game.helpers = [];
    for (const f of this.game.families) for (const a of f.actors) this.game.scene.remove(a.root);
    this.game.families = [];
    for (const s of this.game.shells) this.game.scene.remove(s.mesh);
    this.game.shells = [];
    if (this.game.campNpc) { this.game.scene.remove(this.game.campNpc.root); this.game.campNpc = null; }
  }

  /** Slide down the rope: build the land's fight from the save (uncleared groups, standing Spires, closed cages). */
  descend() {
    const s = this.game.state, id = s.place as IsleId;
    if (s.voyage || s.place === 'dawnreach') { this.game.hud.toast(t('Only clouds below. Sail to a land first.'), 'warn'); return; }
    if (isShip(id)) { this.game.board(); return; }
    if (!s.gear.rope) { this.game.hud.toast(t('You need a Climbing Rope (Workbench, 3 Fibre).'), 'warn'); return; }
    this.game.cut(() => {
      this.game.setMode('isle');
      const v = this.game.isleView(id) as IsleView, map = ISLE_MAPS[id], prog = s.isles[id], tier = tierOf(id);
      for (const [, o] of this.game.isles) o.group.visible = false;
      v.group.visible = true; v.group.position.set(0, 0, 0); v.rope.visible = true; v.setFar(false); this.game.sky.hole = null;
      this.game.isle = v;
      this.game.clearIsle();
      const g = this.game.isleGround(v);
      this.game.keeper.bounds = g; this.game.combat.ground = g; this.game.combat.formsTier = tier; this.game.combat.raidTarget = null;
      if (!prog.freed) {
        map.groups.forEach((grp, gi) => {
          if (prog.groups[gi]) return;
          grp.forms.forEach((f, i) => { const a = i / grp.forms.length * Math.PI * 2; this.game.combat.spawn(f, new T.Vector3(grp.at[0] + Math.cos(a) * 2, 0, grp.at[1] + Math.sin(a) * 2), tier, { group: gi }); });
        });
        map.spires.forEach((sp, i) => { if (!prog.spires[i]) this.game.combat.addSpire(i, new T.Vector3(sp[0], 0, sp[1]), tier); });
        this.game.makeHive(id, new T.Vector3(map.hive[0], v.height(map.hive[0], map.hive[1]), map.hive[1]));
      } else if (prog.leftover) {
        LEFTOVER_FORMS.forEach((f, i) => this.game.combat.spawn(f, new T.Vector3(map.groups[0].at[0] + i, 0, map.groups[0].at[1]), tier, { group: 99 }));
      }
      map.cages.forEach((c, i) => { if (!prog.cages[i]) { const cage = this.game.combat.addCage(i, new T.Vector3(c.at[0], 0, c.at[1])); cage.locked = cageLocked(s, id, i); this.game.caged(c.who, c.at); } });
      this.game.showCamp();
      this.game.keeper.place(map.landing[0], map.landing[1] - 1.5);
      this.game.keeper.fainted = false;
      this.game.bao.root.position.set(map.landing[0] + 4, 30, map.landing[1] - 14);
      this.game.gloomTarget = prog.freed ? 0 : 1; GLOOM.value = this.game.gloomTarget;
      prog.visited = true;
      this.game.snapCamera(); this.game.applyLook();
      this.game.hud.toast(t(PLACES[id].name), 'good');
      setMusic(prog.freed ? 'calm' : 'gloom');
      if (!s.story.flags.conch) { s.story.flags.conch = true; this.game.scene_('conch'); }
    });
  }

  makeHive(id: IsleId, at: T.Vector3) {
    const s = this.game.state;
    this.game.hive = new HiveFight(id, at, this.game.combat, this.game.fx, this.game.keeper, {
      broken: p => this.game.onHive(p), song: () => this.game.heartSong(), sound: n => play(n), freeze: x => this.game.loop.freeze(x),
    }, hiveMaxHp(s, id));
    this.game.hive.setShield(hiveShielded(s, id), true);
  }

  ascend() {
    const ship = this.game.isle?.kind === 'ship';
    this.game.cut(() => {
      // Followers who were still walking climb up anyway: nobody is lost (design §9).
      for (const f of [...this.game.followers]) { const climbing = CREW[f.who].joins && this.game.state.crew.includes(f.who); this.game.boardFollower(f.who); if (climbing) setTimeout(() => this.game.scene_(`board_${f.who}`), 800); }
      this.game.enterDeck(false, ship ? 'plank' : 'rope');
      setMusic('calm');
    });
  }

  /** Nana's conch: Bao lowers the rope where you stand, except near a boss (its hush swallows the sound). */
  blowConch() {
    if (this.game.mode !== 'isle') return;
    const h = this.game.hive;
    play('hum');
    this.game.fx.ring(this.game.keeper.pos, '#ffe6f0', .3, 3, .5);
    if (h && !h.broken && flat(this.game.keeper.pos, h.pos) - h.radius < CONCH.arena) { this.game.hud.toast(t('The hush swallows the conch. Step away from the boss first.'), 'warn'); this.game.scene_('conch_hush'); return; }
    if (this.game.isle?.kind === 'land') { this.game.isle.rope.position.set(this.game.keeper.pos.x + .6, 30, this.game.keeper.pos.z); this.game.isle.rope.visible = true; }
    this.game.hud.toast(t('Bao heard the conch and lowers the rope!'), 'good');
    setTimeout(() => { if (this.game.mode === 'isle') this.game.ascend(); }, 700);
  }

  /** A person in a cage: shown frozen inside the crystal until rescued. */
  caged(who: CrewId, at: [number, number]) {
    const a = new Actor('crew', who, CREW[who].color);
    a.root.position.set(at[0], this.game.isle!.height(at[0], at[1]), at[1]);
    a.facing = Math.atan2(-at[0], ISLE_MAPS[this.game.state.place as IsleId].landing[1] - at[1]);
    this.game.scene.add(a.root);
    this.game.followers.push({ who, actor: a, boarding: false, t: -1 });
  }

  showCamp() {
    const id = this.game.state.place as IsleId, m = MARKETS[id as LandId], v = this.game.isle;
    if (!v || !v.market) return;
    const open = !!m && this.game.state.rescued.includes(m.owner);
    v.market.visible = open;
    if (open && m && !this.game.campNpc) {
      const pos = ISLE_MAPS[id].market!;
      const a = new Actor('crew', m.owner, CREW[m.owner].color);
      a.root.position.set(pos[0] + .2, v.height(pos[0], pos[1]), pos[1] + 1.3);
      a.facing = Math.atan2(-pos[0], 6);
      this.game.campNpc = a; this.game.scene.add(a.root);
    }
  }

  boardFollower(who: CrewId) {
    const i = this.game.followers.findIndex(f => f.who === who);
    if (i >= 0) { this.game.scene.remove(this.game.followers[i].actor.root); this.game.followers.splice(i, 1); }
  }

  updateFollowers(dt: number) {
    const id = this.game.state.place as IsleId;
    if (this.game.mode !== 'isle') return;
    const map = ISLE_MAPS[id];
    for (const f of [...this.game.followers]) {
      const cageIdx = map.cages.findIndex(c => c.who === f.who);
      if (!this.game.state.isles[id].cages[cageIdx]) { f.actor.speed = 0; f.actor.update(dt); continue; }
      f.t += dt;
      if (f.t < 1.4) { if (f.actor.action !== 'cheer') f.actor.play('cheer', 1.4); f.actor.update(dt); continue; }
      const joins = CREW[f.who].joins;
      if (!joins) {
        const mk = map.market!;
        if (walkTo(f.actor, mk[0] + .2, mk[1] + 1.3, 3, dt)) { this.game.boardFollower(f.who); this.game.showCamp(); }
      } else {
        // Crew walk back to the rope on their own and climb up to Bao (nobody is escorted, logic check 3, 1.4).
        const rope = new T.Vector3(map.landing[0] + 1.2, 0, map.landing[1] - .6);
        const near = walkTo(f.actor, rope.x, rope.z, 4.2, dt, .3);
        if (near) {
          if (f.actor.action !== 'climb') { f.actor.play('climb', 9); }
          f.actor.root.position.y += dt * 3.2;
          if (f.actor.root.position.y > 6) { this.game.boardFollower(f.who); this.game.hud.toast(t('{who} climbed up to Bao!', { who: CREW[f.who].name }), 'good'); this.game.scene_(`board_${f.who}`); }
        } else f.actor.root.position.y = this.game.isle!.height(f.actor.root.position.x, f.actor.root.position.z);
      }
      f.actor.update(dt);
    }
    // Freed families cheer, then walk to the landing gap and over the plank onto Bao.
    for (const fam of [...this.game.families]) {
      if (fam.t < 0) { for (const a of fam.actors) { a.speed = 0; a.update(dt); } continue; }
      fam.t += dt;
      if (fam.t < 1.4) { for (const a of fam.actors) { if (a.action !== 'cheer') a.play('cheer', 1.4); a.update(dt); } continue; }
      let gone = true;
      fam.actors.forEach((a, i) => {
        const p = a.root.position, target = p.x > -BEAST.half[0] + .4 ? new T.Vector3(-BEAST.half[0] + .2, 0, (i - .5) * .7) : new T.Vector3(-BEAST.half[0] - 4, 0, 0);
        walkTo(a, target.x, target.z, 3.2, dt, .2);
        a.update(dt);
        if (p.x > -BEAST.half[0] - 3.5) gone = false;
      });
      if (gone) { for (const a of fam.actors) this.game.scene.remove(a.root); this.game.families.splice(this.game.families.indexOf(fam), 1); }
    }
    this.game.campNpc?.update(dt);
  }

  // -------------------------------------------------------------- combat
  strike(origin: T.Vector3, facing: number, reach: number, damage: number, spin: boolean) {
    // Inside a dome of silence the mallet makes no sound and does nothing (the Hush Bell).
    if (this.game.hive?.hushes(origin)) { this.game.fx.text(origin.clone().setY(origin.y + 1.6), t('…silence…'), 'info'); return 0; }
    let hits = this.game.combat.strike(origin, facing, reach, damage, spin);
    if (this.game.hive) hits += this.game.hive.hit(origin, facing, reach, damage, spin) > 0 ? 1 : 0;
    if (this.game.mode === 'deck' && !this.game.raid) {
      // Ring the crust off raided trees.
      this.game.state.plots.forEach((p, i) => {
        if (p.crust <= 0) return;
        const at = this.game.bao.at(DECK.plots[i]);
        if (flat(origin, at) > reach + .7) return;
        hits++;
        const clean = ringCrust(this.game.state, i);
        this.game.fx.ring(at, '#ffe28a', .4, 1.6, .3); play('chime');
        if (clean) { this.game.fx.burst(at.clone().setY(.8), '#c9b8ff', 14); this.game.hud.toast(t('The tree is clean again!'), 'good'); }
        this.game.syncDeck();
      });
    }
    return hits;
  }

  target(p: T.Vector3, range: number) {
    const n = this.game.combat.nearest(p, range);
    if (n) return n.pos;
    const h = this.game.hive;
    if (h && !h.broken) {
      for (const tp of h.targets()) if (flat(p, tp) < range + .4) return tp;
      if (!h.shielded && h.factor() > 0 && flat(p, h.pos) - h.radius < range) return h.pos;
    }
    return null;
  }

  aim(p: T.Vector3, range: number) {
    const t = this.game.target(p, range);
    if (t) return t;
    let best: T.Vector3 | null = null, bd = range + .8;
    for (const c of this.game.combat.cages) if (!c.open) { const d = flat(p, c.pos); if (d < bd) { bd = d; best = c.pos; } }
    if (this.game.hive && !this.game.hive.broken && flat(p, this.game.hive.pos) - this.game.hive.radius < bd) best = this.game.hive.pos;
    if (this.game.mode === 'deck') this.game.state.plots.forEach((pl, i) => { if (pl.crust <= 0) return; const at = this.game.bao.at(DECK.plots[i]); const d = flat(p, at); if (d < bd) { bd = d; best = at; } });
    return best;
  }

  onFreed(form: string, at: T.Vector3, group: number, raid: boolean, reward: boolean) {
    const s = this.game.state, tier = raid && this.game.raid ? this.game.raid.plan.tier : this.game.mode === 'isle' ? tierOf(s.place as IsleId) : 0;
    const r = formFreed(s, form as never, tier, reward);
    if (r.glimmer) this.game.fx.text(at, `+${r.glimmer}✦`, 'gain');
    if (r.levels) this.game.levelUp();
    if (this.game.mode === 'isle' && group >= 0 && group !== 99 && !this.game.combat.groupAlive(group)) {
      const id = s.place as IsleId;
      groupCleared(s, id, group);
      this.game.hud.toast(t('Group freed!'), 'good');
      // On a ship, the captain's crust opens once its guards are gone.
      if (isShip(id) && this.game.hive?.shielded && !hiveShielded(s, id)) { this.game.hive.setShield(false); this.game.hud.toast(t('The raiders are gone: the captain’s crust is open!'), 'good'); this.game.scene_(id === 'sloop' ? 'barnacle_first' : id === 'warship' ? 'wyrm_first' : 'spires_down'); }
      this.game.save();
    }
    if (group === 99 && !this.game.combat.groupAlive(99)) { s.isles[s.place as IsleId].leftover = false; this.game.hud.toast(t('The leftover Gloom is gone.'), 'good'); }
  }

  onSpire(i: number, at: T.Vector3) {
    const s = this.game.state, id = s.place as IsleId;
    const r = spireBroken(s, id, i);
    if (r) { this.game.fx.text(at, `+${r.glimmer}✦`, 'gain'); if (r.levels) this.game.levelUp(); }
    play('shield');
    // A cage the Spire guarded opens up (Juno's workshop).
    for (const c of this.game.combat.cages) if (c.locked && !cageLocked(s, id, c.index)) { c.locked = false; this.game.fx.sparkle(c.pos.clone().setY(1.4), '#ffe28a', 16); this.game.hud.toast(t('The workshop door gives way!'), 'good'); }
    const left = s.isles[id].spires.filter(b => !b).length;
    this.game.hud.toast(left ? t('Spire broken! {n} left.', { n: left }) : t('Every Spire is down: the Hive’s dome falls!'), 'good');
    if (!left && this.game.hive) { this.game.hive.setShield(false); this.game.scene_(id === 'frost' ? 'hush_first' : 'spires_down'); }
    this.game.save();
  }

  onCage(i: number, at: T.Vector3) {
    const s = this.game.state, id = s.place as IsleId;
    const r = rescue(s, id, i);
    if (!r.ok) return;
    if (r.levels) this.game.levelUp();
    play('free'); this.game.fx.sparkle(at.clone().setY(1.4), '#ffffff', 16);
    const f = this.game.followers.find(x => x.who === r.who);
    if (f) f.t = 0;
    this.game.hud.toast(r.joins ? t('{who} is free and heads up to Bao!', { who: CREW[r.who].name }) : t('{who} is free and opens a market at the landing!', { who: CREW[r.who].name }), 'good');
    this.game.scene_(`rescue_${r.who}`);
    this.game.save();
  }

  onHive(at: T.Vector3) {
    const s = this.game.state, id = s.place as IsleId;
    const r = hiveBroken(s, id);
    if (!r) return;
    if (r.levels) this.game.levelUp();
    this.game.fx.text(at.clone().setY(3), `+${r.glimmer}✦`, 'gain');
    play('song');
    this.game.gloomTarget = 0;
    // The song shatters every shell still standing and opens every cage (logic check 3, 2.3 and 2.4).
    this.game.combat.freeAll();
    for (const c of this.game.combat.cages) if (!c.open) { c.open = true; c.view.visible = false; this.game.fx.sparkle(c.pos.clone().setY(1.2), '#ffe28a', 12); }
    for (const fam of this.game.families) if (fam.t < 0) fam.t = 0;
    if (isLand(id)) {
      // The Note flies up to Bao, Bao sings, and colour pours back over the land.
      const n = noteView(); n.position.copy(at).setY(at.y + 2); this.game.scene.add(n); this.game.note = { o: n, t: 0 };
      for (const who of r.opened) {
        const f = this.game.followers.find(x => x.who === who); if (f) f.t = 0;
        setTimeout(() => this.game.scene_(`rescue_${who}`), 3400);
      }
    } else {
      // A captain beaten: the crust shatters off the creature it rode, and its colours pour back.
      const v = this.game.isle; if (v?.kind === 'ship') { v.setFreed(true); v.tilt = 0; }
      this.game.fx.burst(new T.Vector3(0, 2, 0), '#c9b8ff', 60, { speed: 10, up: 8, size: .25, life: 1.4 });
    }
    setMusic('calm');
    this.game.hud.toast(id === 'star' ? t('The Grey Heart shatters!') : t('{isle} is free!', { isle: PLACES[id].name }), 'good');
    this.game.save();
    if (id === 'star') setTimeout(() => this.game.ending(), 2600);
    else setTimeout(() => { this.game.scene_(`freed_${id}`); if (id === 'frost') this.game.scene_('fleet'); }, 1600);
  }

  onFaint() {
    const s = this.game.state;
    rulesFaint(s, null);
    play('faint');
    if (this.game.raid) { this.game.finishRaid(false); return; }
    if (this.game.mode !== 'isle') { setTimeout(() => { s.hero.hp = maxHp(s); this.game.keeper.fainted = false; }, 1500); return; }
    const atHive = this.game.hive && this.game.hive.awake && !this.game.hive.broken ? s.place as IsleId : null;
    const cracked = !!atHive && s.isles[atHive].cracks < 3;
    rulesFaint(s, atHive); s.stats.faints--; // counted once, above
    setTimeout(() => {
      this.game.cut(() => {
        s.hero.hp = maxHp(s);
        const id = s.place as IsleId;
        for (const f of [...this.game.followers]) if (s.isles[id].cages[ISLE_MAPS[id].cages.findIndex(c => c.who === f.who)]) this.game.boardFollower(f.who);
        this.game.enterDeck(false, isShip(id) ? 'plank' : 'rope');
        this.game.scene_(cracked ? 'faint_hive' : 'faint', true);
      });
    }, 1100);
  }

  doMine(i: number) {
    const v = this.game.isle; if (v?.kind !== 'land') return;
    const r = mineOre(this.game.state, this.game.state.place as IsleId, i);
    if (!r.ok) return;
    const o = v.ore[i];
    this.game.keeper.actor.lookAt(o.position.x, o.position.z); this.game.keeper.actor.play('swing', .24);
    this.game.fx.burst(o.position.clone().setY(.8), '#ffb03a', 12); this.game.fx.text(o.position, `+${r.n} ${t('Ore')}`, 'gain'); play('chime');
  }

  doWild(i: number) {
    const v = this.game.isle; if (v?.kind !== 'land') return;
    const r = pickWild(this.game.state, this.game.state.place as IsleId, i);
    if (!r.ok) return;
    const o = v.wild[i];
    this.game.fx.sparkle(o.position.clone().setY(1), '#ffe28a', 8); this.game.fx.text(o.position, `+${r.n} ${t(ITEMS[r.item].name)}`, 'gain'); play('harvest');
  }
}
