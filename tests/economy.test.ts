import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FISH, ISLE_MAPS, ITEMS, MARKETS, MEALS, PLACES, RECIPES, STAGES, TREES, TREE_IDS, seedOf, type ItemId } from '../src/rules/content.ts';
import { WILD_YIELD } from '../src/rules/isle.ts';
import { newGame } from '../src/rules/state.ts';
import { sellPrice } from '../src/rules/trade.ts';

const ids = Object.keys(ITEMS) as ItemId[];

/** Where each item can come from (design §5). */
function sources() {
  const from = new Map<ItemId, string[]>();
  const add = (id: ItemId, why: string) => from.set(id, [...(from.get(id) ?? []), why]);
  for (const id of TREE_IDS) { const y = TREES[id].yield; if (y) add(y[0], `${id} tree`); }
  for (const [isle, m] of Object.entries(MARKETS)) for (const id of Object.keys(m!.sells) as ItemId[]) add(id, `${isle} market`);
  for (const f of FISH) add(f, 'fishing');
  for (const m of Object.keys(MEALS) as ItemId[]) add(m, 'kitchen');
  for (const [isle, y] of Object.entries(WILD_YIELD)) add(y![0], `${isle} wild`);
  if (Object.values(ISLE_MAPS).some(m => m.ore.length)) add('ore', 'ore rocks');
  for (const id of Object.keys(newGame().items) as ItemId[]) add(id, 'start');
  add('seed_golden', 'Grand Hana');
  return from;
}

/** What each item is for. */
function uses() {
  const used = new Map<ItemId, string[]>();
  const add = (id: ItemId, why: string) => used.set(id, [...(used.get(id) ?? []), why]);
  for (const id of ids) {
    const d = ITEMS[id];
    if (d.feed) add(id, 'feed Bao');
    if (d.eat) add(id, 'eat');
    if (d.kind === 'seed') add(id, 'plant');
    if (Object.keys(MARKETS).some(isle => sellPrice(isle as never, id) > 0)) add(id, 'sell');
  }
  for (const r of Object.values(RECIPES)) for (const id of Object.keys(r.cost) as ItemId[]) add(id, 'workbench');
  for (const m of Object.values(MEALS)) for (const id of Object.keys(m.cost)) {
    if (id === 'fish') FISH.forEach(f => add(f, 'cooking')); else add(id as ItemId, 'cooking');
  }
  return used;
}

test('every item has a source and a use', () => {
  const from = sources(), used = uses();
  for (const id of ids) {
    assert.ok(from.get(id)?.length, `${id} has no source`);
    assert.ok(used.get(id)?.length, `${id} has no use`);
  }
});

test('every tree can be planted: its seed is sold somewhere, given at the start, or given by the story', () => {
  const from = sources();
  for (const id of TREE_IDS) assert.ok(from.get(seedOf(id))?.length, `no way to get a ${id} seed`);
});

test('the three food kinds stay apart (whale food only for Bao, people food only for people)', () => {
  for (const id of ids) {
    const d = ITEMS[id];
    if (d.kind === 'whale') assert.ok(d.feed && !d.eat, id);
    if (d.kind === 'people' || d.kind === 'meal') assert.ok(d.eat && !d.feed, id);
    if (d.kind === 'craft') assert.ok(!d.eat && !d.feed, id);
  }
});

test('stage gates come in story order: each Note comes from an isle the stage before can reach', () => {
  for (let stage = 1; stage < STAGES.length; stage++) {
    const note = STAGES[stage].note!;
    assert.ok(PLACES[note].needStage < stage, `${STAGES[stage].name} needs the ${note} Note, which needs stage ${PLACES[note].needStage}`);
  }
  assert.equal(PLACES.star.needNotes, 4);
  assert.equal(PLACES.frost.needStage, 3, 'Frostfall needs a Great whale, which needs the Note of Ember');
});

test('recipes only need materials that exist before the recipe is needed', () => {
  // Tam's recipes need ore; ore is on the reef and the ember isle, both reachable before or with Tam.
  for (const [id, r] of Object.entries(RECIPES)) {
    // The Grand deck needs ore too: it comes after the reef, whose rocks give ore.
    if (r.cost.ore) assert.ok(r.needsTam || id === 'deck3', `${id} needs ore before ore rocks or Tam exist`);
  }
  assert.ok(ISLE_MAPS.reef.ore.length > 0, 'ore reachable before the Ember isle');
});

test('no market sells anything for less than a market buys it (no buy-and-sell loop)', () => {
  for (const [isle, m] of Object.entries(MARKETS)) {
    for (const [id, price] of Object.entries(m!.sells) as [ItemId, number][]) {
      const best = Math.max(...Object.keys(MARKETS).map(other => sellPrice(other as never, id)));
      assert.ok(price > best, `${isle} sells ${id} at ${price} but a market buys it at ${best}`);
    }
  }
});

test('better whale food is better per moss patch (growth XP per tree per minute)', () => {
  const rate = (tree: 'puffberry' | 'glowplum' | 'starfig') => TREES[tree].yield![1] * ITEMS[tree].feed!.xp * 60 / TREES[tree].regrow;
  assert.ok(rate('puffberry') < rate('glowplum') && rate('glowplum') < rate('starfig'));
});
