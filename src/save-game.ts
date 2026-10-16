import { SaveStore } from './core/save.ts';
import { SAVE_VERSION, newGame, repair, type GameState } from './rules/state.ts';
import { catchUp } from './rules/tick.ts';

/** `cloudback:save:main`. Migrations are chained by version and kept forever (design §17). */
export const saves = new SaveStore<GameState>({ game: 'cloudback', version: SAVE_VERSION, migrations: {} });

export function loadGame(now = Date.now()) {
  const loaded = saves.load();
  if (!loaded) return { state: newGame(`cb-${Math.floor(now % 1e9)}`, now), fresh: true, problem: saves.lastProblem, away: 0 };
  const state = repair(loaded);
  // A save made on an isle or mid-voyage loads on Bao (design §13.7): mid-voyage the trip simply finishes.
  const { away } = catchUp(state, now);
  return { state, fresh: false, problem: null, away };
}

export const saveGame = (s: GameState) => saves.save(s);
export function exportCode(s: GameState) { return saves.exportCode(s); }
export function importCode(code: string) { const s = saves.importCode(code); return s ? repair(s) : null; }
