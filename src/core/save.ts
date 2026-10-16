/**
 * Versioned saves with chained migrations (references/saves-and-online.md).
 *
 * - Every key starts with the game's id: all project sites of one GitHub Pages account
 *   (user.github.io/game-a, /game-b) share ONE origin and one localStorage.
 * - The envelope carries an integer `version` from day one. `migrations[n]` turns version n
 *   into n + 1; keep them forever and test them with old saves kept as fixtures.
 * - A save from a NEWER build is refused (and kept untouched), never half-read.
 * - Write on `visibilitychange` → hidden (and on important events), not only on unload.
 * - Safari deletes site storage after 7 days without a visit: offer an export code.
 * - Big saves belong in IndexedDB (e.g. idb-keyval); the same envelope works there.
 *
 *   const saves = new SaveStore<State>({ game: 'zoo-garden', version: 3, migrations: { 1: v1to2, 2: v2to3 } });
 *   const state = saves.load() ?? newGame();
 *   document.addEventListener('visibilitychange', () => { if (document.hidden) saves.save(state); });
 */
export interface StorageLike { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void }
export interface SaveEnvelope<T> { game: string; version: number; savedAt: number; data: T }
type Migration = (data: any) => any;

export class SaveStore<T> {
  readonly key: string;
  /** Why the last load returned null: 'empty', 'newer', 'corrupt', 'other-game'. */
  lastProblem: string | null = null;
  private options: { game: string; version: number; migrations?: Record<number, Migration>; storage?: StorageLike; slot?: string };
  constructor(options: { game: string; version: number; migrations?: Record<number, Migration>; storage?: StorageLike; slot?: string }) {
    this.options = options;
    if (!/^[a-z0-9][a-z0-9-]{2,}$/.test(options.game)) throw new Error('SaveStore: game id must be a lower-case name like "zoo-garden"');
    this.key = `${options.game}:save:${options.slot ?? 'main'}`;
  }
  private get storage(): StorageLike { return this.options.storage ?? globalThis.localStorage; }

  /** Brings any older envelope up to the current version; throws if a step is missing. */
  migrate(envelope: SaveEnvelope<unknown>): SaveEnvelope<T> {
    let { version, data } = envelope;
    while (version < this.options.version) {
      const step = this.options.migrations?.[version];
      if (!step) throw new Error(`SaveStore: no migration from version ${version}`);
      data = step(structuredClone(data)); version++;
    }
    return { ...envelope, version, data: data as T };
  }

  load(): T | null {
    let raw: string | null;
    try { raw = this.storage.getItem(this.key); } catch { this.lastProblem = 'blocked'; return null; }
    if (!raw) { this.lastProblem = 'empty'; return null; }
    return this.read(raw);
  }

  private read(raw: string): T | null {
    let envelope: SaveEnvelope<unknown>;
    try { envelope = JSON.parse(raw); } catch { this.lastProblem = 'corrupt'; return null; }
    if (envelope?.game !== this.options.game) { this.lastProblem = 'other-game'; return null; }
    if (!Number.isInteger(envelope.version)) { this.lastProblem = 'corrupt'; return null; }
    if (envelope.version > this.options.version) { this.lastProblem = 'newer'; return null; }
    this.lastProblem = null;
    return this.migrate(envelope).data;
  }

  save(data: T) {
    const envelope: SaveEnvelope<T> = { game: this.options.game, version: this.options.version, savedAt: Date.now(), data };
    try { this.storage.setItem(this.key, JSON.stringify(envelope)); return true; } catch { return false; }
  }

  /** A text code the player can keep and paste back (survives storage eviction and devices). */
  exportCode(data: T) {
    const json = JSON.stringify({ game: this.options.game, version: this.options.version, savedAt: Date.now(), data });
    return btoa(String.fromCharCode(...new TextEncoder().encode(json)));
  }
  importCode(code: string): T | null {
    try { return this.read(new TextDecoder().decode(Uint8Array.from(atob(code.trim()), c => c.charCodeAt(0)))); }
    catch { this.lastProblem = 'corrupt'; return null; }
  }
}
