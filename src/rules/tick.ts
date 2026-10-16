import { KEEPER } from './content.ts';
import type { GameState } from './state.ts';
import { growGarden, tickGardener } from './garden.ts';
import { tickWhale } from './whale.ts';
import { tickVoyage, type VoyageEvent } from './voyage.ts';
import { tickLeftover } from './isle.ts';
import { nanaGift } from './story.ts';
import { heal } from './keeper.ts';
import { tickSchool } from './fishing.ts';

export interface TickEvents { ripened: number[]; picked: ReturnType<typeof tickGardener>; speck: boolean; voyage: VoyageEvent; leftover: string | null; gifts: string[] }

/**
 * One step of everything that runs on play time. `onDeck`: the Keeper is on Bao (Pip harvests, specks land, Nana
 * waits); `calm`: no raid is on (health comes back on Bao only when calm).
 */
export function tickRules(s: GameState, dt: number, onDeck: boolean, nowMs: number, calm = true): TickEvents {
  s.playSeconds += dt;
  // The garden follows the wall clock, so the time spent closed (catchUp) and the time played add up exactly once.
  const wall = Math.max(0, Math.min(5, (nowMs - s.clock) / 1000));
  s.clock = nowMs;
  const ripened = growGarden(s, wall);
  const picked = tickGardener(s, dt, onDeck);
  const speck = tickWhale(s, dt, onDeck);
  tickSchool(s, dt);
  const voyage = tickVoyage(s, dt);
  const leftover = tickLeftover(s, dt);
  if (onDeck && calm && s.hero.hp > 0) heal(s, KEEPER.deckRegen * dt);
  s.timers.nana += dt;
  let gifts: string[] = [];
  if (s.timers.nana >= 5) { s.timers.nana = 0; gifts = nanaGift(s); }
  return { ripened, picked, speck, voyage, leftover, gifts };
}

/** On load: trees grow for the time the game was closed (at most a week). Mood and hunger do not change. */
export function catchUp(s: GameState, nowMs: number) {
  const away = Math.max(0, Math.min(7 * 24 * 3600, (nowMs - s.clock) / 1000));
  s.clock = nowMs;
  return { away, ripened: growGarden(s, away) };
}
