/**
 * A scripted player that plays the whole story with the real rules (logic check 3, design §13).
 * Fights are not animated: their length and the damage taken are estimated from the real numbers
 * (damage formula, enemy health and damage, wind-ups dodged most of the time), so the run checks that
 * the economy, the gates and the pacing hold together. Used by tests/progression.test.ts.
 */
import { makeRng } from '../src/core/rng.ts';
import { ATTACKS, FISH, FORMS, HEART, HELPER, HELPERS, HIVES, RECIPES, HIVE_MOVES, HIVE_OF, HIVE_PACE, HIVE_PATTERNS, ISLE_MAPS, KEEPER, MARKETS, PLACES, RECIPE_IDS, ROOMS, ROOM_IDS, SPIRE, TIERS, isShip, type FormId, type IsleId, type ItemId, type LandId, type TreeId } from '../src/rules/content.ts';
import { count, newGame, type GameState } from '../src/rules/state.ts';
import { tickRules } from '../src/rules/tick.ts';
import { harvestAll, plant, plantedCount, uproot } from '../src/rules/garden.ts';
import { brush, canGrow, feed, feedAll, grow, pet } from '../src/rules/whale.ts';
import { startVoyage, endRaid } from '../src/rules/voyage.ts';
import { maxHp, quickEat, ringDamage, hurt } from '../src/rules/keeper.ts';
import { faint, formFreed, formStats, freeCaptive, groupCleared, hiveBroken, hiveMaxHp, mineOre, pickWild, rescue, spireBroken, spireStats } from '../src/rules/isle.ts';
import { repairRoom, repairState, shipCrate } from '../src/rules/home.ts';
import { buy, cook, craft, marketOpen, recipeState, sell } from '../src/rules/trade.ts';
import { goal, raidPlan, storyIsle } from '../src/rules/story.ts';
import { biteWait, castFor, landFish, rollFish, takeBite } from '../src/rules/fishing.ts';

export interface SimReport {
  ended: boolean; minutes: number; faints: number; nanaGifts: number; raids: number;
  arrivals: { isle: IsleId; minute: number; level: number; recommended: number; mallet: number; coat: number }[];
  freedAt: Partial<Record<IsleId, number>>;
  /** Minutes Bao waited for growth XP after its Note was in hand. */
  growWaits: number[];
  log: string[];
}

/**
 * Two kinds of player. `attentive` tends the garden every second and dodges most wind-ups; `casual` checks the
 * garden every half minute, explores slowly and gets hit more. Real players sit between the two.
 */
export const PROFILES = {
  attentive: { hitRate: .25, uptime: .6, walk: 18, choreEvery: 1, fishes: true, isleSlow: 1 },
  casual: { hitRate: .4, uptime: .45, walk: 30, choreEvery: 30, fishes: false, isleSlow: 1.6 },
} as const;
export type Profile = keyof typeof PROFILES;

export function simulate(seed = 'sim', limitMinutes = 300, profile: Profile = 'attentive'): SimReport {
  const P = PROFILES[profile];
  const HIT_RATE = P.hitRate, UPTIME = P.uptime;
  let choreTimer = 0;
  const s = newGame(seed, 0), rng = makeRng(seed);
  // Chapter 1: wake up in the cottage, climb to the deck (the pat comes with the first chores).
  s.story.flags.onDeck = true;
  const report: SimReport = { ended: false, minutes: 0, faints: 0, nanaGifts: 0, raids: 0, arrivals: [], freedAt: {}, growWaits: [], log: [] };
  let now = 0, fishTimer = 0, noteAt = -1;
  const minute = () => Math.round(s.playSeconds / 6) / 10;
  const log = (msg: string) => report.log.push(`${minute().toFixed(1)}m ${msg}`);

  function step(seconds: number, onDeck: boolean) {
    for (let t = 0; t < seconds; t++) {
      now += 1000;
      const ev = tickRules(s, 1, onDeck, now);
      if (ev.voyage === 'raid') resolveRaid(!s.voyage?.scripted);
      if (onDeck && ++choreTimer >= P.choreEvery) { choreTimer = 0; chores(); }
    }
  }

  function eatIfLow() { while (s.hero.hp < maxHp(s) * .45) { const r = quickEat(s); if (!r.ok) break; } }

  /** Fight `forms` at `tier` (×`scale`); returns false when the Keeper faints. */
  function fight(forms: FormId[], tier: number, scale = 1, extraHp = 0, help = 1) {
    const hp = forms.reduce((n, f) => n + formStats(f, tier, scale).hp, 0) + extraHp;
    const aoe = Math.min(2, 1 + .25 * (forms.length - 1));
    const seconds = P.isleSlow * hp / (ringDamage(s) / KEEPER.ringEvery * UPTIME * aoe * help);
    const incomingRate = forms.reduce((n, f) => n + formStats(f, tier, scale).damage / cooldownOf(f), 0) * HIT_RATE / 2;
    return endure(seconds, incomingRate);
  }
  function cooldownOf(f: FormId) { return f === 'gloomling' ? ATTACKS.bump.cooldown : f === 'spitter' ? ATTACKS.shard.cooldown : f === 'brute' ? ATTACKS.charge.cooldown : f === 'shellback' ? ATTACKS.bash.cooldown : f === 'puffcap' ? ATTACKS.puff.cooldown : ATTACKS.dive.cooldown; }
  /** Spend `seconds` in a fight taking `rate` damage per second; eat when low. */
  function endure(seconds: number, rate: number) {
    for (let t = 0; t < seconds; t++) {
      step(1, false);
      hurt(s, rate);
      eatIfLow();
      if (s.hero.hp <= 0) return false;
    }
    return true;
  }

  function onFaint(where: string, atHive: IsleId | null = null) {
    faint(s, atHive); report.faints++; s.hero.hp = maxHp(s);
    log(`fainted at ${where} (level ${s.hero.level}, mallet ${s.gear.mallet}, coat ${s.gear.coat})`);
  }

  function resolveRaid(small: boolean) {
    const plan = raidPlan(s, small);
    if (!plan) { endRaid(s, true, 0); return; }
    report.raids++;
    let won = true;
    for (const wave of plan.waves) {
      if (!fight(wave, plan.tier, plan.scale)) { won = false; s.hero.hp = maxHp(s); break; }
      for (const f of wave) formFreed(s, f, plan.tier);
    }
    endRaid(s, won, won ? plan.waves.length : 0);
    log(`raid from ${plan.from}: ${won ? 'won' : 'lost'}`);
  }

  // ------------------------------------------------------------- the deck
  const WANT: [TreeId, (s: GameState) => number][] = [
    ['sproutbean', g => g.gear.deck >= 1 ? 0 : 2],
    ['ropevine', g => g.gear.rope ? 1 : 2],
    ['puffberry', g => g.whale.stage >= 2 ? 1 : 2],
    ['chimewood', () => 1],
    ['glowplum', g => g.plots.length >= 8 ? 3 : 2],
    ['starfig', () => 3],
    ['cloudpear', () => 1],
    ['honeybun', () => 1],
    ['puffberry', () => 99],
  ];
  function garden() {
    s.plots.forEach((p, i) => {
      if (p.tree) return;
      const pick = WANT.find(([tree, n]) => count(s, `seed_${tree}` as ItemId) > 0 && plantedCount(s, tree) < n(s));
      if (pick) plant(s, i, pick[0]);
    });
    // Better trees replace spare Puffberries and the second Ropevine.
    for (const better of ['starfig', 'glowplum', 'chimewood', 'cloudpear'] as TreeId[]) {
      if (count(s, `seed_${better}` as ItemId) <= 0) continue;
      const spare = s.plots.findIndex(p => (p.tree === 'sproutbean' && s.gear.deck >= 1) || (p.tree === 'puffberry' && plantedCount(s, 'puffberry') > (s.whale.stage >= 2 ? 1 : 2)) || (p.tree === 'ropevine' && s.gear.rope && plantedCount(s, 'ropevine') > 1));
      if (spare >= 0) { uproot(s, spare); plant(s, spare, better); }
    }
  }
  /** Glimmer kept back for the next gear piece (rooms and seeds wait for it). */
  function gearReserve() {
    const nextGear = (['mallet2', 'coat2', 'mallet3', 'coat3'] as const).find(id => recipeState(s, id) !== 'owned' && recipeState(s, id) !== 'locked');
    return nextGear ? RECIPES[nextGear].glimmer : 0;
  }
  function chores() {
    harvestAll(s);
    garden();
    // Chapter 2: the crate, the kitchen, the first Pear Tart and the first fish.
    if (s.story.flags.fed && !s.story.flags.shipped) shipCrate(s, count(s, 'puffberry') ? 'puffberry' : 'cloudpear');
    if (!s.rooms.kitchen && count(s, 'fibre') >= 3 && s.glimmer < ROOMS.kitchen.glimmer && count(s, 'cloudpear') > 2) shipCrate(s, 'cloudpear');
    if (!s.rooms.kitchen) repairRoom(s, 'kitchen');
    if (s.rooms.kitchen && !s.story.flags.cooked && count(s, 'cloudpear') >= 2) cook(s, 'pear_tart');
    if (s.story.flags.shipped && !s.story.flags.fished && s.rooms.kitchen) { if (takeBite(s)) landFish(s, rollFish(rng, s.place, false)); }
    // Later rooms when there is glimmer to spare beyond the next gear piece.
    for (const room of ROOM_IDS) if (s.gear.rope && s.gear.mallet >= 2 && repairState(s, room) === 'ready' && s.glimmer - ROOMS[room].glimmer >= gearReserve()) repairRoom(s, room);
    feedAll(s);
    while (s.whale.specks > 0) brush(s);
    pet(s);
    if (canGrow(s)) {
      if (noteAt >= 0) { report.growWaits.push(Math.round((s.playSeconds - noteAt) / 6) / 10); noteAt = -1; }
      if (grow(s).ok) log(`Bao grew to stage ${s.whale.stage} (whale xp ${s.whale.xp})`);
    }
    for (const id of RECIPE_IDS) if (recipeState(s, id) === 'ready' && (id !== 'post' || s.posts.length < 2)) craft(s, id);
    if (s.rooms.kitchen) { while (s.crew.includes('mina') && count(s, 'fish_bun') < 3 && cook(s, 'fish_bun').ok); while (count(s, 'pear_tart') < 3 && cook(s, 'pear_tart').ok); }
    // Fish while waiting: a cast every few seconds, most bites landed.
    fishTimer -= P.choreEvery;
    if (P.fishes && fishTimer <= 0 && s.story.flags.fished) {
      const c = castFor(s);
      fishTimer = biteWait(rng, c.bait) + 3;
      if (rng.chance(.75) && takeBite(s)) { const f = rollFish(rng, s.place, c.line, c.rare); landFish(s, f); if (s.whale.mood < 80) feed(s, f); }
    }
  }
  function shop(isle: IsleId) {
    if (!marketOpen(s, isle)) return;
    for (const f of FISH) if (count(s, f) > 2) sell(s, isle, f, count(s, f) - 2);
    for (const p of ['cloudpear', 'honeybun'] as ItemId[]) if (count(s, p) > 6) sell(s, isle, p, count(s, p) - 6);
    // The whale-food ladder: Glowplum seeds at Clover, Starfig seeds on the reef (logic check 3, 3.4).
    const wants: [ItemId, number][] = isle === 'clover' ? [['seed_chimewood', 1], ['seed_glowplum', 2], ['seed_cloudpear', 1]]
      : isle === 'reef' ? [['seed_starfig', 3], ['seed_honeybun', 1]] : [];
    // Gear first: keep enough glimmer for the next mallet or coat; sell spare whale food when short (Nana's faint tip).
    const reserve = gearReserve();
    if (s.glimmer < reserve) for (const food of ['starfig', 'glowplum', 'puffberry'] as ItemId[]) { const spare = count(s, food) - 4; if (spare > 0) sell(s, isle, food, spare); }
    for (const [item, n] of wants) {
      const tree = item.slice(5) as TreeId;
      while (count(s, item) + plantedCount(s, tree) < n && s.glimmer - (MARKETS[isle as LandId]!.sells[item] ?? 0) >= reserve && buy(s, isle, item).ok);
    }
    if (isle === 'ember') {
      const oreWant = (recipeState(s, 'mallet3') !== 'owned' ? 6 : 0) + (recipeState(s, 'coat3') !== 'owned' ? 6 : 0);
      while (count(s, 'ore') < oreWant && s.glimmer > (MARKETS.ember!.sells.ore ?? 99) + 60 && buy(s, 'ember', 'ore').ok);
    }
  }

  // --------------------------------------------------------------- isles
  /** Plays an isle in the order of the goal card; false when the Keeper fainted. */
  function playIsle(isle: IsleId) {
    const map = ISLE_MAPS[isle], progress = s.isles[isle], tier = PLACES[isle].tier;
    // On a ship two crew mates fight beside the Captain (and knock raiders overboard).
    const boarders = Object.values(HELPERS).slice(0, 2), help = isShip(isle) ? 1 + boarders.reduce((n, h) => n + h.damage * KEEPER.ringEvery / HELPER.every, 0) : 1;
    const walk = () => step(P.walk, false);
    if (!report.arrivals.some(a => a.isle === isle)) log(`arrive ${isle}: hero xp ${s.hero.xp} level ${s.hero.level}`), report.arrivals.push({ isle, minute: minute(), level: s.hero.level, recommended: TIERS[tier].level, mallet: s.gear.mallet, coat: s.gear.coat });
    map.ore.forEach((_, i) => mineOre(s, isle, i));
    map.wild.forEach((_, i) => pickWild(s, isle, i));
    for (let g = 0; g < map.groups.length; g++) {
      if (progress.groups[g]) continue;
      walk();
      const group = map.groups[g];
      // A group beside a Spire fights with the Spire waking Gloomlings until it falls.
      let extra = 0;
      if (group.spire !== undefined && !progress.spires[group.spire]) {
        const sp = spireStats(tier), spireSeconds = sp.hp / (ringDamage(s) / KEEPER.ringEvery * UPTIME);
        extra = sp.hp + Math.min(SPIRE.maxAwake, Math.floor(spireSeconds / SPIRE.wakeEvery)) * formStats('gloomling', tier).hp;
      }
      if (!fight(group.forms, tier, 1, extra, help)) { onFaint(`${isle} group ${g}`); return false; }
      for (const f of group.forms) formFreed(s, f, tier);
      groupCleared(s, isle, g);
      if (group.spire !== undefined) spireBroken(s, isle, group.spire);
      map.cages.forEach((c, i) => { if (!progress.cages[i]) { step(3, false); const r = rescue(s, isle, i); if (r.ok) log(`rescued ${c.who}`); } });
      map.captives.forEach((_, i) => { if (!progress.captives[i] && progress.groups.every(Boolean)) { step(3, false); freeCaptive(s, isle, i); } });
      shop(isle);
    }
    progress.spires.forEach((b, i) => { if (!b) spireBroken(s, isle, i); });
    walk();
    const hive = HIVES[HIVE_OF[isle]];
    // Clamhive: open 1.9 s of a ~4.3 s cycle (×1) and shut the rest (×0.15); the Heart: 5 s at ×1.4, 15 s at ×0.4.
    // The Hush Bell: ~10 s ringing echo bells, then 8 s at ×1.25; Barnacle: stuck 3.5 s of ~13 s at ×1.5, else ×0.4;
    // the Coilwyrm: ~6 s ringing knots, then 7 s dizzy at ×1.4.
    const factor = ({ reef: .53, frost: .55, sloop: .7, warship: .75, star: .65 } as Partial<Record<IsleId, number>>)[isle] ?? 1;
    const seconds = P.isleSlow * hiveMaxHp(s, isle) / (ringDamage(s) / KEEPER.ringEvery * UPTIME * factor * help);
    const moves = HIVE_PATTERNS[HIVE_OF[isle]].map(m => (HIVE_MOVES[m] as { damage?: number }).damage ?? 0).filter(d => d > 0);
    const pattern = HIVE_PATTERNS[HIVE_OF[isle]];
    // Hives that wake Gloomlings or call Flyers fight with a helper or two beside them.
    // Helpers are freed quickly, so on average about half of them are swinging.
    const adds = .5 * (pattern.includes('wake') ? FORMS.gloomling.damage / ATTACKS.bump.cooldown : pattern.includes('callFlyers') ? FORMS.flyer.damage / ATTACKS.dive.cooldown : 0);
    const rate = (moves.reduce((a, b) => a + b, 0) / moves.length / HIVE_PACE + adds) * TIERS[tier].damage * HIT_RATE;
    const songHeal = isle === 'star' ? HEART.songHeal / HEART.songEvery : 0;
    if (!endure(seconds, Math.max(0, rate - songHeal))) { onFaint(`${isle} ${hive.name}`, isle); return false; }
    hiveBroken(s, isle);
    report.freedAt[isle] = minute();
    if (!isShip(isle)) noteAt = s.playSeconds;
    log(`freed ${isle} (level ${s.hero.level}, hero xp ${s.hero.xp}, whale xp ${s.whale.xp}, mallet ${s.gear.mallet}, coat ${s.gear.coat}, glimmer ${s.glimmer})`);
    shop(isle);
    return true;
  }

  // ------------------------------------------------------------ main loop
  while (!s.story.ended && s.playSeconds < limitMinutes * 60) {
    const g = goal(s, 'deck');
    if (s.voyage) { step(1, true); continue; }
    if (g.target === 'grow') { chores(); step(1, true); continue; }
    if (g.target === 'maptable') {
      const to = storyIsle(s)!;
      const r = startVoyage(s, to, rng);
      if (r.ok) log(`sail to ${to}${r.hungry ? ' (hungry)' : ''}`); else { log(`cannot sail: ${r.why}`); step(5, true); }
      continue;
    }
    if (g.target === 'ropepost' || g.target === 'plank') {
      const isle = s.place as IsleId;
      const ok = playIsle(isle);
      step(5, true);
      if (!ok) {
        // Back up on Bao: heal, harvest and upgrade (the goal card suggests it), then try again.
        const gear = s.gear.mallet + s.gear.coat;
        for (let t = 0; t < 240 && (t < 60 || s.gear.mallet + s.gear.coat === gear); t++) step(1, true);
      }
      continue;
    }
    step(1, true);
  }
  report.ended = s.story.ended;
  report.minutes = minute();
  report.nanaGifts = s.story.nanaGifts;
  void FORMS;
  return report;
}
