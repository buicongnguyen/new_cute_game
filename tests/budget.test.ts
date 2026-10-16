import { test } from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error The browser probe is deliberately runnable as a plain Node script.
import { budgetFailures } from '../scripts/budget.mjs';
test('render budget rejects excess, missing and non-finite counters', () => {
  const deck = { viewport: '360×740', scene: 'Bao', kind: 'deck', calls: 140, triangles: 120000 };
  assert.deepEqual(budgetFailures([deck]), []);
  for (const change of [{ calls: 141 }, { triangles: 120001 }, { calls: 0 }, { triangles: NaN }]) assert.equal(budgetFailures([{ ...deck, ...change }]).length, 1);
  assert.deepEqual(budgetFailures([{ ...deck, kind: 'ship', calls: 200, triangles: 160000 }]), []);
});
