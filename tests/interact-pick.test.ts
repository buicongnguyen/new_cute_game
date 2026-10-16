import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickInteractable, type PickTarget } from '../src/rules/interact-pick.ts';
const target = (id: string, x: number, z: number, radius = 2): PickTarget => ({ id, pos: { x, z }, radius });
test('facing the hatch beside a closer plot selects the hatch', () => {
  const hatch = target('hatch', 0, 1), plot = target('plot0', .45, .45);
  assert.equal(pickInteractable([plot, hatch], 0, 0, 0), hatch);
  assert.equal(pickInteractable([hatch, plot], 0, 0, Math.PI / 2), plot);
});
test('distance and facing apply to every kind, and nearby crew do not steal an object', () => {
  for (const id of ['crate', 'workbench', 'cage0', 'rope', 'plot0']) {
    const ahead = target(id, 0, 1), behind = target('crew-nana', 0, -.7);
    assert.equal(pickInteractable([behind, ahead], 0, 0, 0), ahead);
  }
});
test('out-of-reach and non-interactive targets are never chosen, ties stay stable', () => {
  assert.equal(pickInteractable([target('hatch', 0, 3), target('dew', 0, 0, 0)], 0, 0, 0), null);
  const a = target('crate', 0, 1), b = target('rope', 0, 1);
  assert.equal(pickInteractable([a, b], 0, 0, 0), a);
  assert.equal(pickInteractable([target('rope', 0, -1)], 0, 0, 0)?.id, 'rope');
});
