import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../src/core/rng.ts';
import { CRATE, ITEMS, MINA, ROOMS, STAGES, TREES, WHALE } from '../src/rules/content.ts';
import { count, fromV1, newGame, repair, type GameState } from '../src/rules/state.ts';
import { cratePrice, repairRoom, shipCrate, skillLevel, train, perks } from '../src/rules/home.ts';
import { tickRules } from '../src/rules/tick.ts';
import { harvest, plant, growGarden, uproot, crustTree, crustStored, ringCrust, tickGardener, treeStage } from '../src/rules/garden.ts';
import { brush, canGrow, feed, grow, pet, tickWhale } from '../src/rules/whale.ts';
import { canSail, endRaid, startVoyage, tickVoyage, voyagePlan } from '../src/rules/voyage.ts';
import { takeBite, tickSchool } from '../src/rules/fishing.ts';
import { addXp, eat, levelFor, maxHp, ringDamage, quickEat } from '../src/rules/keeper.ts';
import { cageLocked, freeCaptive, groupCleared, hiveBroken, hiveMaxHp, hiveShielded, rescue, spireBroken } from '../src/rules/isle.ts';
import { buy, craft, marketOpen, recipeGlimmer, recipeState, sell, sellPrice, cook } from '../src/rules/trade.ts';
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

/** A run past chapters 1 and 2 (the rope made, the kitchen fixed). */
function chapter3(seed = 't'): GameState {
  const s = newGame(seed, 0);
  Object.assign(s.story.flags, { onDeck: true, petted: true, planted: true, harvested: true, fed: true, shipped: true, cooked: true, fished: true });
  s.gear.rope = true; s.rooms.kitchen = true; s.gear.deck = 1;
  return s;
}

test('the goal card: free isles send you back up; a cage follows its own Spire', () => {
  const s = chapter3(); s.place = 'clover';
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
  assert.equal(levelFor(0), 1); assert.equal(levelFor(50), 2); assert.equal(levelFor(99999), 20);
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

test('the kitchen: the Pear Tart once it is repaired, Mina\'s meals with Mina, and the cheapest fish go first', () => {
  const s = newGame('t', 0);
  s.items.cloudpear = 3; s.items.cloud_koi = 1; s.items.puff_minnow = 2;
  assert.equal(cook(s, 'pear_tart').ok, false, 'the kitchen is boarded up');
  s.rooms.kitchen = true;
  assert.equal(cook(s, 'pear_tart').ok, true);
  assert.equal(cook(s, 'sky_stew').ok, false, 'Mina teaches the stew');
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

test('the goal card walks through chapters 1 and 2', () => {
  const s = newGame('t', 0);
  assert.equal(goal(s, 'house').target, 'ladder', 'chapter 1: wake up below deck');
  s.story.flags.onDeck = true; assert.equal(goal(s, 'deck').target, 'feed', 'meet Bao');
  pet(s); assert.equal(goal(s, 'deck').target, 'plot');
  plant(s, 0, 'puffberry'); plant(s, 1, 'ropevine'); plant(s, 2, 'sproutbean'); assert.equal(goal(s, 'deck').target, 'ripe');
  growGarden(s, 100); harvest(s, 0); harvest(s, 1); harvest(s, 2);
  assert.equal(goal(s, 'deck').text, 'Grow Sprout Beans for the side decks ({n}/{all})', 'build out the ship first');
  s.items.bean = 6; assert.equal(goal(s, 'deck').target, 'workbench');
  assert.equal(craft(s, 'deck1').ok, true); assert.equal(s.plots.length, 6, 'two more planter boxes');
  s.glimmer += 20;
  assert.equal(goal(s, 'deck').target, 'feed');
  feed(s, 'puffberry'); assert.equal(goal(s, 'deck').target, 'crate');
  shipCrate(s, 'puffberry'); assert.equal(goal(s, 'deck').target, 'ripe', 'Fibre for the kitchen (2/3)');
  s.items.fibre = 3; assert.equal(goal(s, 'deck').target, 'repair');
  repairRoom(s, 'kitchen'); assert.equal(goal(s, 'house').target, 'stove');
  cook(s, 'pear_tart'); assert.equal(goal(s, 'deck').target, 'lift');
  assert.equal(goal(s, 'skiff').target, 'cast');
  s.story.flags.fished = true; assert.equal(goal(s, 'skiff').target, 'lift', 'pull the rope back up');
  s.items.fibre = 3; assert.equal(goal(s, 'deck').target, 'workbench');
  craft(s, 'rope'); assert.equal(goal(s, 'deck').target, 'maptable');
  s.place = 'clover'; assert.equal(goal(s, 'deck').target, 'ropepost');
  assert.equal(goal(s, 'isle').target, 'cage');
});

test('the first Pear Tart is a lesson, not a lock: no pears, no step', () => {
  const s = chapter3(); s.story.flags.cooked = false; delete s.items.cloudpear;
  assert.notEqual(goal(s, 'deck').target, 'stove');
});

test('the shipping crate pays the basic price; markets pay more for what they like', () => {
  const s = newGame('t', 0);
  assert.equal(cratePrice('star_ray'), Math.floor(ITEMS.star_ray.sell * CRATE.share));
  assert.equal(cratePrice('puffberry'), 1, 'at least 1');
  assert.equal(cratePrice('seed_puffberry'), 0, 'seeds do not sell');
  s.items.star_ray = 2; const g = s.glimmer;
  assert.equal(shipCrate(s, 'star_ray', 2).ok, true);
  assert.equal(s.glimmer, g + 2 * cratePrice('star_ray'));
  assert.ok(cratePrice('sun_carp') < sellPrice('clover', 'sun_carp'));
});

test('home repairs: each room costs materials and glimmer and opens its job', () => {
  const s = chapter3(); s.rooms.kitchen = false;
  s.glimmer = 1000; s.items.fibre = 20; s.items.chimewood = 20; s.items.ore = 5;
  assert.equal(repairRoom(s, 'kitchen').ok, true);
  assert.equal(repairRoom(s, 'kitchen').ok, false, 'only once');
  assert.equal(s.glimmer, 1000 - ROOMS.kitchen.glimmer);
  // The craft room: 20% off workbench glimmer, and the Good Line.
  assert.equal(recipeState(s, 'line'), 'locked');
  const before = recipeGlimmer(s, 'mallet2');
  repairRoom(s, 'craft');
  assert.ok(recipeGlimmer(s, 'mallet2') < before);
  assert.notEqual(recipeState(s, 'line'), 'locked');
  // The study: voyages cost 15% less fullness.
  const cost = voyagePlan(s, 'clover').cost;
  repairRoom(s, 'study');
  assert.ok(voyagePlan(s, 'clover').cost < cost);
  // The bathroom's Fresh buff adds damage.
  repairRoom(s, 'bath');
  const dmg = ringDamage(s); s.hero.freshUntil = s.playSeconds + 10;
  assert.ok(ringDamage(s) > dmg);
});

test('life skills level up from doing, and their perks pay out exactly', () => {
  const s = chapter3();
  assert.equal(skillLevel(s, 'garden'), 1);
  assert.equal(train(s, 'garden', 10), 2, 'level 2 at 10 XP');
  for (let i = 0; i < 400; i++) train(s, 'garden', 2);
  assert.equal(skillLevel(s, 'garden'), 10);
  assert.ok(perks(s).growth > 1.15 && perks(s).bonusFruit > .3);
  // Bonus fruit: at 36% a bonus every few harvests, never by dice.
  plant(s, 0, 'puffberry'); let fruit = 0;
  for (let i = 0; i < 25; i++) { growGarden(s, 1000); const h = harvest(s, 0); if (h.ok) fruit += h.n; }
  assert.ok(fruit >= 25 * 3 + 8 && fruit <= 25 * 3 + 9, `${fruit} fruit`);
  // Cooking: meals heal more.
  for (let i = 0; i < 100; i++) train(s, 'cook', 5);
  s.hero.hp = 1; s.items.pear_tart = 1; eat(s, 'pear_tart');
  assert.ok(s.hero.hp > 1 + ITEMS.pear_tart.eat!.heal);
});

test('Mina leaves a meal every day of play', () => {
  const s = chapter3(); s.crew.push('mina');
  let meals = 0;
  for (let t = 0; t < MINA.every * 2; t++) if (tickRules(s, 1, true, 0).meal) meals++;
  assert.equal(meals, 2);
});

test('Frostfall: Juno is locked in her workshop until its Spire breaks', () => {
  const s = chapter3();
  assert.equal(cageLocked(s, 'frost', 1), true);
  assert.equal(rescue(s, 'frost', 1).ok, false);
  spireBroken(s, 'frost', 0);
  assert.equal(cageLocked(s, 'frost', 1), false);
  const r = rescue(s, 'frost', 1);
  assert.ok(r.ok && r.who === 'juno' && s.crew.includes('juno'));
  const g = goal(chapter3(), 'isle');
  void g;
});

test('the Gloom fleet: hidden until the fourth Note, then one ship after another', () => {
  const s = chapter3();
  s.whale.stage = 3; s.notes = ['clover', 'reef', 'ember'];
  assert.equal(canSail(s, 'frost').ok, true);
  assert.equal(canSail(s, 'sloop').ok, false, 'the fleet has not shown itself');
  s.notes.push('frost');
  assert.equal(canSail(s, 'sloop').ok, true);
  assert.equal(canSail(s, 'warship').ok, false, 'the Scout Sloop first');
  s.isles.sloop.freed = true;
  assert.equal(canSail(s, 'warship').ok, true);
  assert.equal(canSail(s, 'star').ok, false, 'the Warship first');
});

test('a Gloom ship: raiders guard the captain, families give gifts, the captain frees the rest', () => {
  const s = chapter3(); s.place = 'sloop'; s.whale.stage = 3; s.notes = ['clover', 'reef', 'ember', 'frost'];
  for (const id of ['clover', 'reef', 'ember', 'frost'] as const) s.isles[id].freed = true;
  assert.equal(goal(s, 'deck').target, 'plank');
  assert.equal(goal(s, 'isle').target, 'group');
  assert.equal(hiveShielded(s, 'sloop'), true);
  groupCleared(s, 'sloop', 0); groupCleared(s, 'sloop', 1);
  assert.equal(hiveShielded(s, 'sloop'), false);
  assert.equal(goal(s, 'isle').target, 'captive');
  const r = freeCaptive(s, 'sloop', 0);
  assert.ok(r.ok && count(s, r.gift[0]) >= r.gift[1]);
  assert.equal(goal(s, 'isle').text, 'Free the families in the hold ({done}/{all})', 'one family still in the hold');
  assert.ok(hiveMaxHp(s, 'sloop') < 2800, 'the chime cannon softens its crust');
  const b = hiveBroken(s, 'sloop');
  assert.ok(b && b.note === null && b.families === 1 && s.isles.sloop.captives.every(Boolean));
  assert.deepEqual(s.raidsOwed, [], 'ships owe no raid');
  assert.equal(s.story.ended, false);
});

test('a version 1 save (the old three-isle story) loads into chapter 3 with a working kitchen', () => {
  const old = JSON.parse(JSON.stringify(newGame('t', 0))) as Record<string, unknown> & GameState;
  delete (old as Partial<GameState>).rooms; delete (old as Partial<GameState>).skills;
  old.gear.rope = true; old.story.flags = { planted: true, harvested: true, fed: true };
  const loaded = repair(fromV1(old) as GameState);
  assert.equal(loaded.rooms.kitchen, true);
  assert.equal(goal(loaded, 'deck').target, 'maptable');
  assert.equal(loaded.skills.garden, 0);
});
