import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { SaveStore, type SaveEnvelope } from '../src/core/save.ts';
import { newGame, repair, SAVE_VERSION, SAVE_MIGRATIONS, type GameState } from '../src/rules/state.ts';
import { ISLE_IDS, ISLE_MAPS, plotCount } from '../src/rules/content.ts';
const directory = new URL('./saves/', import.meta.url);
for (const file of readdirSync(directory).filter(file => file.endsWith('.json'))) {
  test(file + ' migrates through the production chain without losing progress', () => {
    const envelope = JSON.parse(readFileSync(new URL(file, directory), 'utf8')) as SaveEnvelope<GameState>;
    const before = structuredClone(envelope);
    const store = new SaveStore<GameState>({ game: 'cloudback', version: SAVE_VERSION, migrations: SAVE_MIGRATIONS });
    const current = store.migrate(envelope), state = repair(current.data);
    assert.equal(current.version, SAVE_VERSION); assert.equal(state.version, SAVE_VERSION);
    assert.deepEqual(envelope, before, 'migration does not mutate the stored fixture');
    assert.equal(state.glimmer, 123); assert.equal(state.items.fibre, 9);
    assert.deepEqual(state.notes, ['clover']); assert.ok(state.isles.clover.freed);
    assert.ok(state.crew.includes('pip')); assert.ok(state.rooms.kitchen);
    assert.equal(state.plots.length, plotCount(state.whale.stage, state.gear.deck));
    for (const id of ISLE_IDS) {
      assert.equal(state.isles[id].cages.length, ISLE_MAPS[id].cages.length);
      assert.equal(state.isles[id].groups.length, ISLE_MAPS[id].groups.length);
      assert.ok(state.schools[id]);
    }
    if (envelope.version === 2) assert.equal(state.voyage?.raidState, 'pending');
    assert.deepEqual(repair(store.importCode(store.exportCode(state))!), state);
  });
}
test('migration chain executes each step in order and rejects missing steps', () => {
  const order: number[] = [];
  const store = new SaveStore({ game: 'cloudback', version: 3, migrations: {
    1: data => { order.push(1); return { ...data, a: 1 }; },
    2: data => { order.push(2); return { ...data, b: 2 }; }
  }});
  assert.deepEqual(store.migrate({ game: 'cloudback', version: 1, savedAt: 0, data: {} }).data, { a: 1, b: 2 });
  assert.deepEqual(order, [1, 2]);
  const missing = new SaveStore({ game: 'cloudback', version: 3 });
  assert.throws(() => missing.migrate({ game: 'cloudback', version: 1, savedAt: 0, data: {} }), /no migration/);
});
test('newer and malformed saves are refused and remain untouched in storage', () => {
  let raw = JSON.stringify({ game: 'cloudback', version: SAVE_VERSION + 1, data: newGame('future', 0) });
  const storage = { getItem: () => raw, setItem: () => assert.fail('must not overwrite'), removeItem: () => assert.fail('must not remove') };
  const store = new SaveStore({ game: 'cloudback', version: SAVE_VERSION, migrations: SAVE_MIGRATIONS, storage });
  assert.equal(store.load(), null); assert.equal(store.lastProblem, 'newer');
  raw = JSON.stringify({ game: 'cloudback', version: 2, data: null });
  assert.equal(store.load(), null); assert.equal(store.lastProblem, 'corrupt');
  raw = JSON.stringify({ game: 'cloudback', version: 0, data: {} });
  assert.equal(store.load(), null); assert.equal(store.lastProblem, 'corrupt');
});
