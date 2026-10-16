import { emitState } from '../core/events.ts';
import { CRATE, ITEMS, ROOMS, SKILL_GAIN, SKILL_IDS, SKILL_MAX, SKILL_PERK, SKILL_XP, type ItemId, type RoomId, type SkillId } from './content.ts';
import { count, take, type GameState } from './state.ts';
import type { Result } from './garden.ts';

const no = (why: string) => ({ ok: false as const, why });

// ------------------------------------------------------------------ skills
/** A life skill's level (1..10) from its XP. */
export function skillLevel(s: GameState, id: SkillId) {
  const xp = s.skills[id] ?? 0;
  let level = 1;
  while (level < SKILL_MAX && xp >= SKILL_XP[level - 1]) level++;
  return level;
}
/** XP for the next level, or null at the top. */
export const skillNext = (level: number) => level < SKILL_MAX ? SKILL_XP[level - 1] : null;
/** Adds skill XP; returns the new level when it went up, else 0. */
export function train(s: GameState, id: SkillId, n: number) {
  const before = skillLevel(s, id);
  s.skills[id] = (s.skills[id] ?? 0) + n;
  const after = skillLevel(s, id);
  return after > before ? after : 0;
}
const above = (s: GameState, id: SkillId) => skillLevel(s, id) - 1;
/** Perk sizes at the current levels. */
export const perks = (s: GameState) => ({
  growth: 1 + SKILL_PERK.garden.speed * above(s, 'garden'),
  bonusFruit: SKILL_PERK.garden.bonus * above(s, 'garden'),
  biteWindow: SKILL_PERK.fish.window * above(s, 'fish'),
  rare: 1 + SKILL_PERK.fish.rare * above(s, 'fish'),
  mealHeal: 1 + SKILL_PERK.cook.heal * above(s, 'cook'),
  portion: SKILL_PERK.cook.extra * above(s, 'cook'),
  craftCost: 1 - SKILL_PERK.craft.discount * above(s, 'craft'),
});
/** Banks a fraction (a perk's chance) and pays out whole bonuses exactly, without dice (tests and the sim stay exact). */
export function payout(s: GameState, key: keyof GameState['bank'], chance: number) {
  s.bank[key] += chance;
  if (s.bank[key] < 1) return 0;
  const n = Math.floor(s.bank[key]); s.bank[key] -= n;
  return n;
}
export { SKILL_IDS, SKILL_GAIN };

// ---------------------------------------------------------- shipping crate
export const cratePrice = (item: ItemId) => ITEMS[item].sell > 0 ? Math.max(1, Math.floor(ITEMS[item].sell * CRATE.share)) : 0;
/** Sky-post finches carry `n` of an item away and bring back glimmer at the basic price. */
export function shipCrate(s: GameState, item: ItemId, n = 1): Result<{ glimmer: number }> {
  const price = cratePrice(item);
  if (price <= 0) return no('The finches only carry things that sell');
  const k = Math.min(n, count(s, item));
  if (k <= 0) return no('You have none');
  take(s, item, k);
  s.glimmer += price * k;
  s.stats.shipped += k;
  s.story.flags.shipped = true;
  emitState(s, 'sold', { item, count: k, glimmer: price * k, via: 'crate' });
  return { ok: true, glimmer: price * k };
}

// ------------------------------------------------------------ home repairs
export type RepairState = 'done' | 'ready' | 'missing';
export function repairState(s: GameState, room: RoomId): RepairState {
  if (s.rooms[room]) return 'done';
  const r = ROOMS[room];
  const enough = Object.entries(r.cost).every(([item, n]) => count(s, item as ItemId) >= (n ?? 0)) && s.glimmer >= r.glimmer;
  return enough ? 'ready' : 'missing';
}
export function repairRoom(s: GameState, room: RoomId): Result<{ level: number }> {
  const st = repairState(s, room);
  if (st === 'done') return no('This room is already fixed up');
  if (st === 'missing') return no('Missing materials');
  const r = ROOMS[room];
  for (const [item, n] of Object.entries(r.cost)) take(s, item as ItemId, n ?? 0);
  s.glimmer -= r.glimmer;
  s.rooms[room] = true;
  s.story.flags[`room_${room}`] = true;
  const level = train(s, 'craft', SKILL_GAIN.repair);
  emitState(s, 'built', { kind: 'room', id: room });
  return { ok: true, level };
}
