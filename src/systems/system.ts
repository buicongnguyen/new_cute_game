import type { Game } from '../game.ts';
export interface System { enter(): void; update(dt: number): void; exit(): void }
/** Lifecycle belongs to the orchestrator; shared state stays on Game, never copied into systems. */
export abstract class GameSystem implements System {
  active = false;
  constructor(protected game: Game) { }
  enter() { this.active = true; }
  exit() { this.active = false; }
  abstract update(dt: number): void;
}
