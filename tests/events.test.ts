import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventBus, eventsFor } from '../src/core/events.ts';
import { newGame } from '../src/rules/state.ts';
import { plant, harvest, growGarden } from '../src/rules/garden.ts';
import { simulateOpening } from './sim.ts';

test('event bus is ordered, isolated and unsubscribable, including during emission', () => {
  const bus = new EventBus<{ tick: number }>(), seen: string[] = [];
  let removeSecond = () => {};
  bus.on('tick', n => { seen.push('a' + n); removeSecond(); });
  removeSecond = bus.on('tick', n => seen.push('b' + n));
  bus.emit('tick', 1); bus.emit('tick', 2);
  assert.deepEqual(seen, ['a1', 'a2']);
  const a = newGame('a', 0), b = newGame('b', 0);
  assert.notEqual(eventsFor(a), eventsFor(b)); assert.equal(eventsFor(a), eventsFor(a));
});
test('simulated first chapter emits the real ordered story and pet events once', () => {
  const s = newGame('opening', 0), bus = eventsFor(s), sequence: string[] = [];
  bus.on('chapter', e => sequence.push('chapter:' + e.chapter));
  bus.on('goal', e => sequence.push('goal:' + e.target));
  bus.on('pet', e => sequence.push('pet:' + e.id));
  simulateOpening(s);
  assert.deepEqual(sequence, ['chapter:1', 'goal:ladder', 'goal:feed', 'pet:bao', 'chapter:2', 'goal:plot']);
});
test('successful rules emit once, failed actions emit nothing, and saves contain no bus', () => {
  const s = newGame('events', 0), bus = eventsFor(s), seen: unknown[] = [];
  bus.on('planted', e => seen.push(e)); bus.on('harvested', e => seen.push(e));
  plant(s, 0, 'puffberry'); plant(s, 0, 'puffberry'); harvest(s, 0);
  growGarden(s, 100); harvest(s, 0); harvest(s, 0);
  assert.deepEqual(seen, [{ plot: 0, tree: 'puffberry' }, { plot: 0, item: 'puffberry', count: 3 }]);
  assert.ok(!JSON.stringify(s).includes('listeners'));
});

test('repeated unsubscribe cannot remove a newer subscription', () => {
  const bus = new EventBus(); let calls = 0;
  const off = bus.on('chapter', () => {}); off();
  bus.on('chapter', () => calls++); off();
  bus.emit('chapter', { chapter: 1 }); assert.equal(calls, 1);
});
