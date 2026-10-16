import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../src/core/rng.ts';
import { STAGES, TREES, WHALE } from '../src/rules/content.ts';
import { count, newGame, repair } from '../src/rules/state.ts';
import { harvest, plant, growGarden, uproot, crustTree, crustStored, ringCrust, tickGardener, treeStage } from '../src/rules/garden.ts';
import { brush, canGrow, feed, grow, pet, tickWhale } from '../src/rules/whale.ts';
import { canSail, endRaid, startVoyage, tickVoyage, voyagePlan } from '../src/rules/voyage.ts';
import { takeBite, tickSchool } from '../src/rules/fishing.ts';
import { addXp, levelFor, maxHp, ringDamage, quickEat } from '../src/rules/keeper.ts';
import { hiveBroken, hiveShielded, rescue, spireBroken } from '../src/rules/isle.ts';
import { buy, craft, marketOpen, recipeState, sell, sellPrice, cook } from '../src/rules/trade.ts';
import { goal, nanaGift, raidPlan } from '../src/rules/story.ts';

test('a planted tree grows, ripens and regrows; uprooting returns the seed', () => {
  const s = newGame('t', 0);
  assert.equal(plant(s, 0, 'puffberry').ok, true);
  assert.equal(count(s, 'seed_puffberry'), 1);
  assert.equal(treeStage(s.plots[0]), 'sprout');
  growGarden(s, TREES.puffberry.grow - 1);
  assert.equal(s.plots[0].phase, 'growing');
  growGarden(s, 1);
  assert.equal(s.plots[0].phase, 'ripe');
  const h = harvest(s, 0);
  assert.ok(h.ok && h.n === 3 && count(s, 'puffberry') === 3);
  assert.equal(s.plots[0].phase, 'regrow');
  growGarden(s, TREES.puffberry.regrow);
  assert.equal(s.plots[0].phase, 'ripe');
  assert.equal(uproot(s, 0).ok, true);
  assert.equal(count(s, 'seed_puffberry'), 2);
});

test('mood changes growth speed and crusted trees stop', () => {
  const s = newGame('t', 0);
  plant(s, 0, 'puffberry'); plant(s, 1, 'puffberry');
  s.whale.mood = 90; // ×1.25
  growGarden(s, TREES.puffberry.grow / 1.25);
  assert.equal(s.plots[0].phase, 'ripe');
  const t = newGame('t', 0); plant(t, 0, 'puffberry'); crustTree(t, 0);
  growGarden(t, 1000);
  assert.equal(t.plots[0].phase, 'growing');
  ringCrust(t, 0); ringCrust(t, 0); assert.equal(ringCrust(t, 0), true);
  growGarden(t, 1000);
  assert.equal(t.plots[0].phase, 'ripe');
});

test('Pip harvests only during play, every 8 s', () => {
  const s = newGame('t', 0);
  plant(s, 0, 'puffberry'); growGarden(s, 100);
  assert.equal(tickGardener(s, 8), null); // no Pip yet
  s.crew.push('pip');
  assert.deepEqual(tickGardener(s, 8), { puffberry: 3 });
});

test('feeding, petting, brushing and the stage gate (XP and Note)', () => {
  const s = newGame('t', 0);
  const n = Math.ceil(STAGES[1].xp / 2);
  s.items.puffberry = n;
  for (let i = 0; i < n; i++) feed(s, 'puffberry');
  assert.equal(s.whale.hunger, WHALE.maxHunger);
  assert.ok(s.whale.xp >= STAGES[1].xp);
  assert.equal(canGrow(s), false, 'needs the Note of Dawn too');
  s.notes.push('clover');
  assert.equal(canGrow(s), true);
  assert.equal(grow(s).ok, true);
  assert.equal(s.plots.length, STAGES[1].plots);
  const mood = s.whale.mood;
  s.whale.mood = 50; assert.equal(pet(s).ok, true); assert.equal(pet(s).ok, false);
  s.whale.specks = 1; s.whale.mood = mood; const g = s.glimmer; assert.equal(brush(s).ok, true); assert.equal(s.glimmer, g + 2);
});

test('mood drifts toward 50 and specks pull it down; specks land faster at a crusted isle', () => {
  const s = newGame('t', 0);
  s.whale.mood = 70;
  tickWhale(s, 60);
  assert.equal(s.whale.mood, 69);
  s.place = 'clover';
  let landed = 0;
  for (let i = 0; i < 400; i++) if (tickWhale(s, 1)) landed++;
  assert.equal(landed, 5, 'at most 5 at a crusted isle');
});

test('voyages: gates, hunger cost, hungry voyages are slow but never stuck', () => {
  const s = newGame('t', 0), rng = makeRng('v');
  assert.equal(canSail(s, 'reef').ok, false);
  assert.equal(canSail(s, 'clover').ok, true);
  const plan = voyagePlan(s, 'clover');
  assert.equal(plan.hungry, false);
  startVoyage(s, 'clover', rng);
  assert.equal(s.whale.hunger, 70 - plan.cost);
  let arrived = false;
  for (let t = 0; t < 200 && !arrived; t++) arrived = tickVoyage(s, 1) === 'arrive';
  assert.ok(arrived);
  assert.equal(s.place, 'clover');
  const h = newGame('t', 0); h.whale.hunger = 0;
  const p2 = voyagePlan(h, 'clover');
  assert.ok(p2.hungry && p2.duration > plan.duration);
});

test('a raid pauses the voyage until it ends', () => {
  const s = newGame('t', 0), rng = makeRng('r');
  s.raidsOwed.push('clover'); s.isles.clover.freed = true; s.whale.stage = 1; s.place = 'clover';
  startVoyage(s, 'reef', rng);
  let ev = null; let t = 0;
  while (ev !== 'raid' && t < 300) { ev = tickVoyage(s, 1); t++; }
  assert.equal(ev, 'raid');
  const at = s.voyage!.elapsed;
  tickVoyage(s, 10);
  assert.equal(s.voyage!.elapsed, at);
  assert.equal(s.raidsOwed.length, 1, 'the scripted raid is paid off only when it ends');
  endRaid(s, true, 2);
  assert.equal(s.raidsOwed.length, 0);
});

test('a save made mid-raid loads with the raid starting again (not stuck)', () => {
  const s = newGame('t', 0), rng = makeRng('r');
  s.raidsOwed.push('clover'); s.isles.clover.freed = true; s.whale.stage = 1; s.place = 'clover';
  startVoyage(s, 'reef', rng);
  while (tickVoyage(s, 1) !== 'raid');
  const loaded = repair(JSON.parse(JSON.stringify(s)));
  assert.equal(loaded.voyage!.raidState, 'pending');
  assert.equal(tickVoyage(loaded, .1), 'raid', 'the raid starts again on the next tick');
  assert.deepEqual(loaded.raidsOwed, ['clover']);
});

test('each place has its own fish school, refilling during play', () => {
  const s = newGame('t', 0);
  s.place = 'clover';
  for (let i = 0; i < 6; i++) assert.equal(takeBite(s), true);
  assert.equal(takeBite(s), false, 'the Clover school is empty');
  s.place = 'reef';
  assert.equal(takeBite(s), true, 'the reef has its own school');
  s.place = 'clover';
  tickSchool(s, 40);
  assert.equal(takeBite(s), true, 'one bite back after 40 s');
});

test('the Grey Heart gives the Golden Seed at once; a raider on the hatch crusts a stored tree', () => {
  const s = newGame('t', 0);
  hiveBroken(s, 'star');
  assert.equal(s.story.ended, true);
  assert.equal(count(s, 'seed_golden'), 1);
  plant(s, 0, 'puffberry');
  assert.equal(crustStored(s), 0);
  assert.equal(s.plots[0].crust > 0, true);
});

test('the goal card: free isles send you back up; a cage follows its own Spire', () => {
  const s = newGame('t', 0);
  Object.assign(s.story.flags, { planted: true, harvested: true, fed: true }); s.gear.rope = true; s.place = 'clover';
  assert.equal(goal(s, 'isle').text, 'Free {who} from the crystal cage');
  s.isles.clover.cages[0] = true;
  assert.equal(goal(s, 'isle').target, 'spire');
  s.isles.clover.spires[0] = true;
  const g = goal(s, 'isle');
  assert.ok(g.target === 'cage' && g.index === 1, 'Pip, by the first Spire, comes right after it');
  s.isles.clover.freed = true;
  assert.equal(goal(s, 'isle').target, 'rope');
});

test('levels, health and damage', () => {
  const s = newGame('t', 0);
  assert.equal(levelFor(0), 1); assert.equal(levelFor(50), 2); assert.equal(levelFor(99999), 15);
  assert.equal(addXp(s, 120), 2);
  assert.equal(maxHp(s), 130);
  assert.equal(ringDamage(s), 14);
  s.gear.mallet = 2; assert.equal(Math.round(ringDamage(s) * 10) / 10, 19.6);
  s.items.cloudpear = 1; s.hero.hp = 10;
  assert.equal(quickEat(s).item, 'cloudpear'); assert.equal(s.hero.hp, 35);
});

test('isles: Spires shield the Hive, cages rescue, freeing gives the Note and owes a raid', () => {
  const s = newGame('t', 0);
  assert.equal(hiveShielded(s, 'clover'), true);
  spireBroken(s, 'clover', 0); spireBroken(s, 'clover', 1);
  assert.equal(hiveShielded(s, 'clover'), false);
  const olla = rescue(s, 'clover', 0);
  assert.ok(olla.ok && olla.who === 'olla' && !olla.joins);
  assert.equal(marketOpen(s, 'clover'), true);
  const pip = rescue(s, 'clover', 1);
  assert.ok(pip.ok && pip.joins && s.crew.includes('pip'));
  const r = hiveBroken(s, 'clover');
  assert.equal(r?.note, 'clover');
  assert.deepEqual(s.raidsOwed, ['clover']);
  assert.ok(raidPlan(s)!.waves[0].length === 6);
});

test('markets and the workbench', () => {
  const s = newGame('t', 0);
  assert.equal(marketOpen(s, 'clover'), false);
  s.rescued.push('olla');
  assert.equal(sellPrice('clover', 'sun_carp'), 8, 'Clover likes fish (×1.5, rounded)');
  s.glimmer = 0; s.items.honeybun = 2;
  assert.equal(sell(s, 'clover', 'honeybun', 2).ok, true); assert.equal(s.glimmer, 16);
  assert.equal(buy(s, 'clover', 'seed_cloudpear').ok, true); assert.equal(s.glimmer, 6);
  assert.equal(buy(s, 'clover', 'seed_starfig').ok, false, 'not sold at Clover');
  assert.equal(recipeState(s, 'coat2'), 'locked', 'fibre goes to the rope first');
  assert.equal(recipeState(s, 'rope'), 'missing');
  s.items.fibre = 3; assert.equal(craft(s, 'rope').ok, true); assert.equal(s.gear.rope, true);
  assert.equal(recipeState(s, 'mallet3'), 'locked');
  s.gear.mallet = 2; s.items.chimewood = 6; s.items.ore = 6; s.glimmer = 200;
  assert.equal(recipeState(s, 'mallet3'), 'locked', 'needs Tam');
  s.crew.push('tam'); assert.equal(craft(s, 'mallet3').ok, true); assert.equal(s.gear.mallet, 3);
});

test('the kitchen needs Mina and takes the cheapest fish', () => {
  const s = newGame('t', 0);
  s.items.cloudpear = 1; s.items.cloud_koi = 1; s.items.puff_minnow = 2;
  assert.equal(cook(s, 'sky_stew').ok, false);
  s.crew.push('mina');
  assert.equal(cook(s, 'sky_stew').ok, true);
  assert.equal(count(s, 'cloud_koi'), 1);
  assert.equal(count(s, 'sky_stew'), 1);
});

test('Nana never lets a run get stuck without seeds', () => {
  const s = newGame('t', 0);
  delete s.items.seed_puffberry; delete s.items.seed_ropevine; s.glimmer = 0;
  assert.deepEqual(nanaGift(s), ['puffberry', 'ropevine']);
  assert.deepEqual(nanaGift(s), []);
});

test('the goal card walks through the tutorial', () => {
  const s = newGame('t', 0);
  assert.equal(goal(s, 'deck').target, 'plot');
  plant(s, 0, 'puffberry'); assert.equal(goal(s, 'deck').target, 'ripe');
  growGarden(s, 100); harvest(s, 0); assert.equal(goal(s, 'deck').target, 'feed');
  feed(s, 'puffberry'); assert.equal(goal(s, 'deck').target, 'ripe');
  s.items.fibre = 3; assert.equal(goal(s, 'deck').target, 'workbench');
  craft(s, 'rope'); assert.equal(goal(s, 'deck').target, 'maptable');
  s.place = 'clover'; assert.equal(goal(s, 'deck').target, 'ropepost');
  assert.equal(goal(s, 'isle').target, 'cage');
});
