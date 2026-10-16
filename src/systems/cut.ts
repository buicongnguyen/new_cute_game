import { play } from '../sfx.ts';
import { GameSystem } from './system.ts';

/** Cut behavior extracted without changing the original update order. */
export class CutSystem extends GameSystem {
  update(dt: number) { void dt; }

  /** A quick white fade around a scene change. */
  cut(change: () => void) {
    if (this.game.mode === 'cut') return;
    const prev = this.game.mode;
    this.game.setMode('cut');
    const veil = this.game.uiRoot.querySelector('#veil') as HTMLElement;
    veil.classList.add('on');
    play('hop');
    setTimeout(() => { try { change(); } catch (e) { console.error(e); this.game.setMode(prev); } veil.classList.remove('on'); }, 380);
  }
}
