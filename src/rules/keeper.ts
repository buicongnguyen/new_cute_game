import { BUFF, COAT, ITEMS, KEEPER, LEVEL_XP, MALLET, MAX_LEVEL, type ItemId } from './content.ts';
import { count, take, type GameState } from './state.ts';
import type { Result } from './garden.ts';

const no = (why: string) => ({ ok: false as const, why });

/** Level for a total XP. */
export function levelFor(xp: number) {
  let level = 1;
  while (level < MAX_LEVEL && xp >= LEVEL_XP[level - 1]) level++;
  return level;
}
/** XP needed for the next level (null at the top). */
export const nextLevelXp = (level: number) => level < MAX_LEVEL ? LEVEL_XP[level - 1] : null;
export const prevLevelXp = (level: number) => level <= 1 ? 0 : LEVEL_XP[level - 2];

export const maxHp = (s: GameState) => KEEPER.baseHp + KEEPER.hpPerLevel * (s.hero.level - 1) + COAT[s.gear.coat - 1];
export const buffOn = (s: GameState, kind: 'power' | 'guard') => s.hero.buff === kind && s.playSeconds < s.hero.buffUntil;
/** Damage of one basic ring. */
export const ringDamage = (s: GameState) => (KEEPER.baseDamage + KEEPER.damagePerLevel * (s.hero.level - 1)) * MALLET[s.gear.mallet - 1] * (buffOn(s, 'power') ? BUFF.power : 1);
/** Damage the Keeper takes from a blow of `raw`. */
export const damageTaken = (s: GameState, raw: number) => Math.max(1, Math.round(raw * (buffOn(s, 'guard') ? BUFF.guard : 1)));

/** Adds XP; returns the number of levels gained (health is topped up by the gain). */
export function addXp(s: GameState, n: number) {
  const before = s.hero.level, hpBefore = maxHp(s);
  s.hero.xp += Math.round(n);
  s.hero.level = levelFor(s.hero.xp);
  const gained = s.hero.level - before;
  if (gained > 0) s.hero.hp = Math.min(maxHp(s), s.hero.hp + (maxHp(s) - hpBefore));
  return gained;
}

export function hurt(s: GameState, raw: number) {
  const taken = damageTaken(s, raw);
  s.hero.hp = Math.max(0, s.hero.hp - taken);
  return taken;
}
export const heal = (s: GameState, n: number) => { s.hero.hp = Math.min(maxHp(s), s.hero.hp + n); };

export function eat(s: GameState, item: ItemId): Result<{ heal: number }> {
  const e = ITEMS[item].eat;
  if (!e) return no('You cannot eat that');
  if (!take(s, item)) return no('You have none');
  const before = s.hero.hp;
  heal(s, e.heal);
  if (e.buff) { s.hero.buff = e.buff; s.hero.buffUntil = s.playSeconds + BUFF.seconds; }
  return { ok: true, heal: s.hero.hp - before };
}

/** Quick Eat picks the smallest food that covers the missing health (so a buff meal is not wasted on a scratch), else the biggest. */
export const QUICK_EAT: ItemId[] = ['cloudpear', 'honeybun', 'sky_stew', 'fish_bun', 'pear_tart'];
export function quickEatItem(s: GameState) {
  const have = QUICK_EAT.filter(id => count(s, id) > 0).sort((a, b) => ITEMS[a].eat!.heal - ITEMS[b].eat!.heal);
  if (!have.length) return null;
  const missing = maxHp(s) - s.hero.hp;
  return have.find(id => ITEMS[id].eat!.heal >= missing) ?? have[have.length - 1];
}
export function quickEat(s: GameState) {
  const item = quickEatItem(s);
  return item ? { item, ...eat(s, item) } : { item: null, ok: false as const, why: 'No food in your bag' };
}
