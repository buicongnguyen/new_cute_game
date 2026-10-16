import { CREW, FORMS, HIVE_CRACK, HIVES, HIVE_OF, ISLE_MAPS, LEFTOVER, ORE, PLACES, RESCUE, SPIRE, TIERS, WHALE, WILD, type CrewId, type FormId, type IsleId, type NoteIsle, type ProduceId } from './content.ts';
import { give, type GameState } from './state.ts';
import { addXp } from './keeper.ts';
import type { Result } from './garden.ts';

const no = (why: string) => ({ ok: false as const, why });
export const tierOf = (isle: IsleId) => PLACES[isle].tier;

/** A Gloom form's numbers on an isle tier (raids pass their own scale). */
export function formStats(form: FormId, tier: number, scale = 1) {
  const f = FORMS[form], t = TIERS[tier];
  return { hp: Math.round(f.hp * t.hp * scale), damage: Math.round(f.damage * t.damage * scale), xp: Math.round(f.xp * t.reward), glimmer: Math.round(f.glimmer * t.reward) };
}
export const spireStats = (tier: number) => ({ hp: Math.round(SPIRE.hp * TIERS[tier].hp), xp: Math.round(SPIRE.xp * TIERS[tier].reward), glimmer: Math.round(SPIRE.glimmer * TIERS[tier].reward) });
export const hiveOf = (isle: IsleId) => HIVES[HIVE_OF[isle]];

/** A Gloom form was freed: XP and glimmer (none for Gloomlings a Spire or Hive woke: they were only napping). */
export function formFreed(s: GameState, form: FormId, tier: number, reward = true) {
  if (!reward) return { levels: 0, xp: 0, glimmer: 0 };
  const st = formStats(form, tier);
  s.glimmer += st.glimmer;
  return { levels: addXp(s, st.xp), xp: st.xp, glimmer: st.glimmer };
}
export function groupCleared(s: GameState, isle: IsleId, group: number) {
  if (group >= 0 && group < s.isles[isle].groups.length) s.isles[isle].groups[group] = true;
}
export function spireBroken(s: GameState, isle: IsleId, index: number) {
  const progress = s.isles[isle];
  if (progress.spires[index]) return null;
  progress.spires[index] = true;
  const st = spireStats(tierOf(isle));
  s.glimmer += st.glimmer;
  return { levels: addXp(s, st.xp), xp: st.xp, glimmer: st.glimmer };
}
/** The Hive is shielded until every Spire on its isle is broken. */
export const hiveShielded = (s: GameState, isle: IsleId) => s.isles[isle].spires.some(b => !b);

/** A cage rang open. Crew climb aboard (the scene walks them to the rope); camp people open their market. */
export function rescue(s: GameState, isle: IsleId, index: number): Result<{ who: typeof ISLE_MAPS[IsleId]['cages'][number]['who']; joins: boolean; levels: number }> {
  const cage = ISLE_MAPS[isle].cages[index];
  if (!cage) return no('No cage there');
  if (s.isles[isle].cages[index]) return no('Already free');
  s.isles[isle].cages[index] = true;
  if (!s.rescued.includes(cage.who)) s.rescued.push(cage.who);
  const joins = CREW[cage.who].joins;
  if (joins && !s.crew.includes(cage.who)) s.crew.push(cage.who);
  const tier = TIERS[tierOf(isle)];
  s.glimmer += Math.round(RESCUE.glimmer * tier.reward);
  const levels = addXp(s, RESCUE.xp * tier.reward);
  return { ok: true, who: cage.who, joins, levels };
}

/** The Hive broke: the isle is free. Returns the Note (if any) and rewards. */
export function hiveBroken(s: GameState, isle: IsleId) {
  const progress = s.isles[isle];
  if (progress.freed) return null;
  progress.freed = true;
  progress.groups = progress.groups.map(() => true);
  progress.spires = progress.spires.map(() => true);
  // The song opens every cage still standing (logic check 3, 2.4).
  const opened: CrewId[] = [];
  ISLE_MAPS[isle].cages.forEach((c, i) => {
    if (progress.cages[i]) return;
    progress.cages[i] = true; opened.push(c.who);
    if (!s.rescued.includes(c.who)) s.rescued.push(c.who);
    if (CREW[c.who].joins && !s.crew.includes(c.who)) s.crew.push(c.who);
  });
  const hive = hiveOf(isle);
  s.glimmer += hive.glimmer;
  const levels = addXp(s, hive.xp);
  let note: NoteIsle | null = null;
  if (isle !== 'star') {
    note = isle;
    if (!s.notes.includes(note)) s.notes.push(note);
    if (!s.raidsOwed.includes(isle)) s.raidsOwed.push(isle);
  } else {
    s.story.ended = true;
    // The Golden Seed drifts down from Hana's moss right away, so a reload during the ending cannot lose it.
    if (!s.items.seed_golden && !s.plots.some(p => p.tree === 'golden')) give(s, 'seed_golden');
  }
  s.whale.mood = Math.min(WHALE.maxMood, s.whale.mood + WHALE.songMood);
  s.whale.songs++;
  s.stats.freed++;
  if (isle !== 'star' && s.place === isle) s.whale.specks = 0;
  return { note, levels, xp: hive.xp, glimmer: hive.glimmer, opened };
}

export const oreReady = (s: GameState, isle: IsleId, index: number) => s.playSeconds >= (s.isles[isle].oreAt[index] ?? Infinity);
export function mineOre(s: GameState, isle: IsleId, index: number): Result<{ n: number }> {
  if (!oreReady(s, isle, index)) return no('The rock is bare for now');
  s.isles[isle].oreAt[index] = s.playSeconds + ORE.back;
  give(s, 'ore', ORE.perRock);
  return { ok: true, n: ORE.perRock };
}
/** Wild plants: Puffberry bushes on Clover, Cloudpear trees on the reef. */
export const WILD_YIELD: Partial<Record<IsleId, [ProduceId, number]>> = { clover: ['puffberry', 3], reef: ['cloudpear', 2] };
export const wildReady = (s: GameState, isle: IsleId, index: number) => s.playSeconds >= (s.isles[isle].wildAt[index] ?? Infinity);
export function pickWild(s: GameState, isle: IsleId, index: number): Result<{ item: ProduceId; n: number }> {
  const y = WILD_YIELD[isle];
  if (!y || !wildReady(s, isle, index)) return no('Nothing ripe here yet');
  s.isles[isle].wildAt[index] = s.playSeconds + WILD.back;
  give(s, y[0], y[1]);
  return { ok: true, item: y[0], n: y[1] };
}

/**
 * The Keeper fainted: nothing is lost; the scene resets uncleared groups and heals the Hive. A faint in a Hive fight
 * cracks its crust, so nobody is stuck for good (logic check 3: the casual player's Forgehive wall).
 */
export function faint(s: GameState, atHive: IsleId | null = null) {
  s.stats.faints++;
  if (atHive && !s.isles[atHive].freed) s.isles[atHive].cracks = Math.min(HIVE_CRACK.most, s.isles[atHive].cracks + 1);
}
/** The Hive's health now (cracks taken off). */
export const hiveMaxHp = (s: GameState, isle: IsleId) => Math.round(hiveOf(isle).hp * (1 - HIVE_CRACK.perFaint * s.isles[isle].cracks));

/** After the ending, a small leftover group returns to one freed isle every 30 minutes of play. */
export function tickLeftover(s: GameState, dt: number) {
  if (!s.story.ended) return null;
  s.timers.leftover += dt;
  if (s.timers.leftover < LEFTOVER.every) return null;
  s.timers.leftover = 0;
  const target = (['clover', 'reef', 'ember'] as IsleId[]).find(id => s.isles[id].freed && !s.isles[id].leftover);
  if (target) s.isles[target].leftover = true;
  return target ?? null;
}
export const LEFTOVER_FORMS: FormId[] = ['gloomling', 'gloomling', 'gloomling', 'spitter'];
