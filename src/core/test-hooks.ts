/**
 * One test-hook object per game, the contract every browser script and bot relies on
 * (references/testing-and-shipping.md; the same idea as `render_game_to_text` and
 * `advanceTime` in published game skills).
 *
 * Install only in development or test builds (`import.meta.env.DEV`, or `?test` when the
 * production build itself is under test). Every method must really work: a hook that
 * silently does nothing makes tests pass for the wrong reason, so `installTestHooks` rejects
 * missing methods and `setState` throws on unknown names.
 *
 *   installTestHooks({
 *     state: () => ({ level: state.level, hp: state.hp, planet: state.planet, enemies: world.enemies.length }),
 *     step: ms => { for (let t = 0; t < ms; t += 1000 / 60) loop.advance(1 / 60); },
 *     seed: s => { rng = new RngStreams(s); },
 *     setState: name => { const make = STATES[name]; if (!make) throw new Error(`unknown state ${name}`); applyState(make()); },
 *     freeze: on => { paused = on; },
 *     reducedMotion: on => { trauma.scale = on ? 0 : 1; },
 *     hideUi: on => { document.body.classList.toggle('hide-ui', on); },
 *   }, { enabled: import.meta.env.DEV });
 *
 * In Playwright: `await page.evaluate(() => __game.setState('boss-fight'))`, then
 * `__game.freeze(true)` before screenshots so the two-identical-shots check can pass.
 */
export interface GameTestHooks {
  /** Plain-data summary of what matters (no renderer objects), for assertions and bots. */
  state(): unknown;
  /** Advance game time by `ms` deterministically (fixed steps), whatever the frame rate. */
  step(ms: number): void;
  seed(seed: number | string): void;
  /** Jump to a named situation ("new-game", "shop-open", "boss-fight"); throws on unknown names. */
  setState(name: string): void;
  /** Stop all animation, including shader time, for screenshots. */
  freeze(on: boolean): void;
  reducedMotion(on: boolean): void;
  hideUi(on: boolean): void;
}

const REQUIRED: (keyof GameTestHooks)[] = ['state', 'step', 'seed', 'setState', 'freeze', 'reducedMotion', 'hideUi'];

export function installTestHooks(hooks: GameTestHooks, { enabled, name = '__game', target = globalThis as Record<string, unknown> } = {} as { enabled: boolean; name?: string; target?: Record<string, unknown> }) {
  if (!enabled) return false;
  const missing = REQUIRED.filter(key => typeof hooks[key] !== 'function');
  if (missing.length) throw new Error(`installTestHooks: missing ${missing.join(', ')}`);
  target[name] = Object.freeze({ ...hooks, version: 1 });
  return true;
}
