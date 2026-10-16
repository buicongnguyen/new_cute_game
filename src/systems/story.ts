import * as T from 'three';
import { RngStreams } from '../core/rng.ts';
import { CHATTER, SCENES, type Line } from '../dialogue.ts';
import { t } from '../i18n.ts';
import {
  DECK,
  HIVES,
  ITEMS, KEEPER,
  PLACES,
  RAID, RECIPES, ROOMS, SKILL_NAMES, UPGRADES,
  isShip,
  type CrewId,
  type HelperId, type IsleId, type ItemId,
  type MealId, type PlaceId, type RecipeId, type RoomId,
  type SkillId, type TreeId, type UpgradeId
} from '../rules/content.ts';
import { plant, uproot } from '../rules/garden.ts';
import { repairRoom, shipCrate } from '../rules/home.ts';
import { eat, maxHp, quickEat, quickEatItem } from '../rules/keeper.ts';
import { hasCrew, newGame } from '../rules/state.ts';
import { syncStoryEvents } from '../rules/story.ts';
import { buy, buyUpgrade, cook, craft, sell } from '../rules/trade.ts';
import { startVoyage } from '../rules/voyage.ts';
import { canGrow, feed } from '../rules/whale.ts';
import { exportCode, importCode, saveGame, saves } from '../save-game.ts';
import { play, setMusic } from '../sfx.ts';
import { type HudView } from '../ui/hud.ts';
import { type GameApi } from '../ui/panels.ts';
import { whole } from '../world/assets.ts';
import { flat } from '../world/combat.ts';
import { ROOM_DOORS } from '../world/cottage.ts';
import { GLOOM } from '../world/look.ts';
import { GameSystem } from './system.ts';

/** Story behavior extracted without changing the original update order. */
export class StorySystem extends GameSystem {
  update(dt: number) { void dt; }

  levelUp() { play('level'); this.game.hud.toast(t('Level {n}! You feel stronger.', { n: this.game.state.hero.level }), 'good'); this.game.fx.ring(this.game.keeper.pos, '#ffe28a', .5, 3, .6); }

  skillUp(id: SkillId, level: number) { if (!level) return; play('level', .6); this.game.hud.toast(t('{skill} level {n}!', { skill: t(SKILL_NAMES[id]), n: level }), 'good'); }

  /** Nana's 'Bao can grow!' line, the first time the badge lights up (logic review 5). */
  checkCanGrow() { if (!this.game.state.story.flags.scene_can_grow && canGrow(this.game.state) && !this.game.state.voyage) this.game.scene_('can_grow'); }

  quickEat() {
    const r = quickEat(this.game.state);
    if (!r.ok) { this.game.hud.toast(t('No food in your bag'), 'info'); return; }
    this.game.fx.text(this.game.keeper.pos, `+${r.heal}`, 'heal'); play('feed');
  }

  talk(id: CrewId) {
    const lines = CHATTER[id], n = this.game.chatter.get(id) ?? 0;
    this.game.chatter.set(id, n + 1);
    this.game.hud.say([{ who: id, text: lines[n % lines.length] }]);
  }

  sail(to: PlaceId) {
    const r = startVoyage(this.game.state, to, this.game.rng.stream('voyage'));
    if (!r.ok) { this.game.hud.toast(t(r.why), 'warn'); return; }
    this.game.stopFishing();
    play('sail');
    this.game.hud.toast(r.hungry ? t('Bao is hungry: a slow flight…') : t('Bao flies to {place}!', { place: PLACES[to].name }), r.hungry ? 'warn' : 'good');
    this.game.showIsleBelow();
    this.game.save();
  }

  /** Play a story scene once (flags in the save). */
  scene_(key: string, always = false) {
    const lines: Line[] | undefined = SCENES[key];
    if (!lines) return;
    const flag = `scene_${key}`;
    if (!always && this.game.state.story.flags[flag]) return;
    this.game.state.story.flags[flag] = true;
    this.game.hud.say(lines);
  }

  /** Chapter 1: a new captain wakes up in the cottage's patchwork bed. */
  wakeUp() { this.game.enterHouse('bed'); this.game.scene_('wake'); }

  arrive() {
    const s = this.game.state;
    play('arrive');
    if (this.game.mode === 'deck') this.game.showIsleBelow();
    if (s.place !== 'dawnreach') setTimeout(() => this.game.scene_(`arrive_${s.place}`), 900);
    this.game.checkCanGrow();
    this.game.dews.forEach(d => { d.alive = false; d.o.visible = false; });
    this.game.hud.toast(t('Bao is over {place}.', { place: PLACES[s.place].name }), 'good');
    // Alongside a Gloom ship, Juno's cannon softens its crust.
    if (isShip(s.place) && !s.isles[s.place].freed && hasCrew(s, 'juno')) {
      setTimeout(() => { const v = this.game.isle; if (v?.kind !== 'ship') return; this.game.bao.fireCannon(v.group.position); play('gong'); this.game.fx.ring(v.group.position.clone().setY(1), '#ffe28a', 1, 8, .7); this.game.hud.toast(t('Juno’s cannon softens its crust!'), 'good'); }, 1600);
    }
    if (s.place !== 'dawnreach' && !s.isles[s.place as IsleId].freed) setMusic(s.place === 'star' ? 'night' : 'gloom'); else setMusic('calm');
    this.game.rng = new RngStreams(s.seed + ':' + s.stats.voyages);
    this.game.save();
  }

  updateHud() {
    const s = this.game.state, where = this.game.where(), g = syncStoryEvents(s, where);
    const hive = this.game.mode === 'isle' && this.game.hive && !this.game.hive.broken && (this.game.hive.awake || flat(this.game.keeper.pos, this.game.hive.pos) < 18) ? this.game.hive : null;
    const view: HudView = {
      mode: where, combat: this.game.mode === 'isle' || !!this.game.raid,
      context: this.game.nearby ? this.game.nearby.label : null, contextIcon: this.game.nearby?.icon ?? '✋',
      fishing: this.game.fishing.state, ...this.game.fishingView(), cooldowns: { spin: this.game.keeper.spinCd / KEEPER.spin.cooldown, hop: this.game.keeper.hopCd / KEEPER.hop.cooldown },
      eat: quickEatItem(s), place: PLACES[s.place].name,
      raid: this.game.raid ? (this.game.raid.wave < 0 ? t('Gloom ships in {n}…', { n: Math.ceil(this.game.raid.warn - this.game.raid.t) }) : t('Ship battle! {n}s', { n: Math.max(0, Math.ceil(RAID.timeout - this.game.raid.total)) })) : null,
      conch: this.game.mode === 'isle' && !!s.story.flags.conch,
      pull: this.game.mode === 'skiff' || this.game.mode === 'drone', pullLabel: this.game.mode === 'drone' ? 'Land' : 'Pull the rope',
    };
    if (hive) { view.boss = hive.hp / hive.max; view.bossName = HIVES[hive.id].name; view.bossShield = hive.shielded; view.bossStatus = hive.status(); }
    this.game.hud.update(s, g, view);
    this.game.panels.refresh();
  }

  // ----------------------------------------------------------------- ending
  /**
   * The pod asleep in the Deep Mist under the Grey Star: Grand Hana behind the flagship and two more whales at the
   * sides, crusted grey-violet. When the Heart breaks the crust's colour pours out of them and they rise.
   */
  sleepingPod(freed: boolean) {
    for (const w of this.game.pod) this.game.scene.remove(w);
    this.game.pod = [];
    const spots: [number, number, number, number, number][] = [[0, -18, -50, 0, 2.1], [-40, -16, -18, 1.25, 1.35], [40, -16, -24, -1.3, 1.35]];
    for (const [x, y, z, rot, scale] of spots) {
      const w = whole('whale', { gloom: true }) ?? new T.Group();
      w.position.set(x, freed ? 6 + scale * 3 : y, z); w.rotation.y = rot; w.scale.setScalar(scale);
      w.userData.toY = 6 + scale * 3;
      this.game.scene.add(w); this.game.pod.push(w);
    }
    GLOOM.value = freed ? 0 : 1; this.game.gloomTarget = GLOOM.value;
  }

  updateAmbientPod(dt: number) {
    const show = this.game.state.story.ended && this.game.state.story.endingSeen && this.game.mode === 'deck';
    if (show && !this.game.ambientPod.children.length) {
      ([[2.2, 70, 0], [1.4, 52, 2.1], [1.3, 60, 4.2]] as [number, number, number][]).forEach(([scale, r, a]) => {
        const w = whole('whale') ?? new T.Group(); w.scale.setScalar(scale); w.userData.orbit = { r, a }; this.game.ambientPod.add(w);
      });
    }
    this.game.ambientPod.visible = show;
    if (!show) return;
    for (const w of this.game.ambientPod.children) {
      const o = w.userData.orbit as { r: number; a: number };
      o.a += dt * .03;
      w.position.set(Math.cos(o.a) * o.r, -10 + Math.sin(o.a * 3) * 2, Math.sin(o.a) * o.r - 20);
      w.rotation.y = -o.a + Math.PI;
    }
  }

  ending() {
    const s = this.game.state;
    // The pod wakes: the crust's colour is already fading (the shared Gloom tint), and the whales rise.
    for (const w of this.game.pod) w.userData.rising = true;
    this.game.gloomTarget = 0;
    play('song'); setTimeout(() => play('grow'), 1200);
    this.game.scene_('ending');
    if (!s.items.seed_golden) { s.items.seed_golden = 1; }
    this.game.save();
    setTimeout(() => this.game.onEnding?.(), 5200);
  }

  // ---------------------------------------------------------------- api
  api(): GameApi {
    const g = this.game;
    return {
      state: () => g.state,
      onDeck: () => g.mode === 'deck' || g.mode === 'house' || g.mode === 'skiff',
      plant: (i, tree: TreeId) => { const r = plant(g.state, i, tree); if (!r.ok) g.hud.toast(t(r.why), 'warn'); else { play('harvest'); g.fx.sparkle(g.bao.at(DECK.plots[i]).setY(.5), '#9be36a', 10); g.syncDeck(); } },
      uproot: i => { uproot(g.state, i); g.syncDeck(); },
      harvest: i => g.doHarvest(i),
      feed: item => { const r = feed(g.state, item); if (!r.ok) g.hud.toast(t(r.why), 'warn'); else { g.fedFx(1, r.xp); g.scene_('fed'); } },
      feedAll: () => g.doFeedAll(),
      pet: () => g.doPet(),
      grow: () => g.doGrow(),
      sail: to => g.sail(to),
      craft: (id: RecipeId) => {
        const before = maxHp(g.state), r = craft(g.state, id);
        if (!r.ok) { g.hud.toast(t(r.why), 'warn'); return; }
        play('chime'); g.hud.toast(t('Made: {thing}', { thing: RECIPES[id].name }), 'good');
        g.skillUp('craft', r.skill);
        // A new coat adds its health straight away.
        g.state.hero.hp = Math.min(maxHp(g.state), g.state.hero.hp + Math.max(0, maxHp(g.state) - before));
        g.syncDeck(); g.save();
      },
      cook: (id: MealId) => {
        const r = cook(g.state, id);
        if (!r.ok) { g.hud.toast(t(r.why), 'warn'); return; }
        play('harvest'); g.hud.toast(r.portions > 1 ? t('You cooked two {meal}s!', { meal: ITEMS[id].name }) : t('You cooked a {meal}!', { meal: ITEMS[id].name }), 'good');
        g.skillUp('cook', r.skill);
        g.scene_('cooked');
      },
      ship: (item: ItemId, n: number) => {
        const r = shipCrate(g.state, item, n);
        if (!r.ok) { g.hud.toast(t(r.why), 'warn'); return; }
        play('coin'); g.bao.openCrate();
        const at = g.bao.at(DECK.crate).setY(1.2); g.fx.sparkle(at, '#ffe28a', 10); g.fx.text(at, `+${r.glimmer}✦`, 'gain');
        g.scene_('shipped');
      },
      repair: (room: RoomId) => {
        const r = repairRoom(g.state, room);
        if (!r.ok) { g.hud.toast(t(r.why), 'warn'); return; }
        play('grow'); g.panels.close();
        g.syncCabin();
        const o = ROOM_DOORS[room].door; g.fx.sparkle(new T.Vector3(o.x, 1, o.z), '#ffe28a', 30, 1.6); g.fx.ring(new T.Vector3(o.x, 0, o.z), '#ffffff', .5, 4, .8);
        g.hud.toast(t('The {room} is fixed up!', { room: ROOMS[room].name }), 'good');
        g.skillUp('craft', r.level);
        g.scene_(room === 'craft' ? (hasCrew(g.state, 'tam') ? 'room_craft' : 'room_craft_nana') : `room_${room}`);
        g.save();
      },
      board: (picked: HelperId[]) => g.boardNow(picked),
      sell: (isle, item, n) => { const r = sell(g.state, isle, item, n); if (r.ok) play('coin'); else g.hud.toast(t(r.why), 'warn'); },
      buy: (isle, item) => { const r = buy(g.state, isle, item); if (r.ok) play('coin'); else g.hud.toast(t(r.why), 'warn'); },
      upgrade: (isle, id: UpgradeId) => { const r = buyUpgrade(g.state, isle, id); if (r.ok) { play('coin'); g.hud.toast(t('Bought: {thing}', { thing: UPGRADES[id].name }), 'good'); } else g.hud.toast(t(r.why), 'warn'); },
      eat: item => { const r = eat(g.state, item); if (r.ok) { g.fx.text(g.keeper.pos, `+${r.heal}`, 'heal'); play('feed'); } else g.hud.toast(t(r.why), 'warn'); },
      exportSave: () => exportCode(g.state),
      // The old game must not be saved over the new one while the page unloads (logic review 3).
      importSave: code => { const s = importCode(code); if (!s) return false; g.reloading = true; saveGame(s); location.reload(); return true; },
      reset: () => { g.reloading = true; try { localStorage.removeItem(saves.key); } catch { /* ignore */ } saveGame(newGame(`cb-${Date.now() % 1e9}`)); location.reload(); },
      replayPrologue: () => { g.state.story.prologueSeen = false; g.save(); location.reload(); },
      settings: {
        get shake() { return g.settings.shake; },
        get graphics() { return g.governor.setting; },
        setShake: v => { g.settings.shake = v; g.fx.shakeScale = v ? 1 : 0; try { localStorage.setItem('cloudback:shake', v ? 'on' : 'off'); } catch { /* ignore */ } },
        setGraphics: v => { g.governor.choose(v as never); g.resize(); },
      },
    };
  }
}
