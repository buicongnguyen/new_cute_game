import { SaveStore } from './core/save.ts';
import { SAVE_VERSION, fromV1, newGame, repair, type GameState } from './rules/state.ts';
import { catchUp } from './rules/tick.ts';

/** `cloudback:save:main`. Migrations are chained by version and kept forever (design §17). */
export const saves = new SaveStore<GameState>({ game: 'cloudback', version: SAVE_VERSION, migrations: { 1: fromV1 } });

export function loadGame(now = Date.now()) {
  const loaded = saves.load();
  if (!loaded) {
    // A save from a newer build or a damaged one is kept aside, never silently overwritten (DESIGN §13).
    if (saves.lastProblem === 'newer' || saves.lastProblem === 'corrupt') {
      try { const raw = localStorage.getItem(saves.key); if (raw) localStorage.setItem(`${saves.key}:backup-${now}`, raw); } catch { /* storage blocked */ }
    }
    return { state: newGame(`cb-${Math.floor(now % 1e9)}`, now), fresh: true, problem: saves.lastProblem, away: 0 };
  }
  const state = repair(loaded);
  // A save made on an isle or mid-voyage loads on Bao (design §13.7): a voyage carries on, and a raid it was in starts again.
  const { away } = catchUp(state, now);
  return { state, fresh: false, problem: null, away };
}

export const saveGame = (s: GameState) => saves.save(s);
export function exportCode(s: GameState) { return saves.exportCode(s); }
export function importCode(code: string) { const s = saves.importCode(code); return s ? repair(s) : null; }
