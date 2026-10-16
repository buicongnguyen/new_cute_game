import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulate } from './sim.ts';

// Logic check 3 in code: a scripted player plays the whole story with the real rules (see tests/sim.ts).
for (const profile of ['attentive', 'casual'] as const) {
  test(`a ${profile} player finishes the story without getting stuck`, () => {
    const r = simulate('progression', 300, profile);
    assert.equal(r.ended, true, r.log.join('\n'));
    const [low, high] = profile === 'attentive' ? [15, 40] : [25, 70];
    assert.ok(r.minutes >= low && r.minutes <= high, `story took ${r.minutes} min`);
    assert.equal(r.nanaGifts, 0, 'normal play never needs Nana’s safety net');
    assert.equal(r.raids, 3, 'one scripted raid after each Note isle');
    // The casual profile is a worst case (hit 40% of the time, 1.6× slower); Hive cracks guarantee it gets through.
    assert.ok(r.faints <= (profile === 'attentive' ? 1 : 7), `${r.faints} faints:\n${r.log.join('\n')}`);
    for (const a of r.arrivals) assert.ok(a.level >= a.recommended, `${a.isle}: level ${a.level} < recommended ${a.recommended}`);
    for (const wait of r.growWaits) assert.ok(wait <= 5, `Bao waited ${wait} min for growth after its Note`);
    assert.deepEqual(r.arrivals.map(a => a.isle), ['clover', 'reef', 'ember', 'star']);
  });
}
