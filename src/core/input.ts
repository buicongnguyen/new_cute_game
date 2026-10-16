/**
 * One input action map. Keyboard, pointer, touch buttons, gamepad and bots all produce the
 * same named actions, which the simulation reads once per step ("intents"). This gives
 * replays, bots and netcode for free, and one place to fix stuck keys.
 *
 * - Keys bind by `KeyboardEvent.code` (layout-independent: "KeyW" is W on QWERTY and Z on AZERTY).
 * - Everything releases on blur, visibility change and pointercancel, so nothing sticks.
 * - `blocked` (menus open) releases and ignores gameplay input, so a click on a dialog
 *   never also swings the sword or turns the camera.
 * - `buffer`: an action pressed slightly early still fires when it becomes possible (jump ≈
 *   67 ms; attack chains 150–250 ms). Consume it once.
 *
 *   const input = new ActionMap({ left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'], attack: ['Space'] });
 *   const detach = input.attach(window);
 *   attackButton.onpointerdown = () => input.press('attack'); attackButton.onpointerup = () => input.release('attack');
 *   // in the fixed step:  if (input.consumeBuffered('attack', loop.gameTime, .2)) startAttack(); input.endStep();
 */
export class ActionMap<A extends string> {
  /** True while a menu or dialog owns input. */
  private _blocked = false;
  private down = new Set<A>();
  private pressedStep = new Set<A>();
  private lastPress = new Map<A, number>();
  private byCode = new Map<string, A>();
  /** Game time, so presses can be buffered; set by the game each step (or use `now`). */
  now = 0;

  constructor(bindings: Record<A, string[]>) {
    for (const [action, codes] of Object.entries(bindings) as [A, string[]][]) for (const code of codes) this.byCode.set(code, action);
  }

  get blocked() { return this._blocked; }
  set blocked(value: boolean) { if (value) this.releaseAll(); this._blocked = value; }

  press(action: A) {
    if (this._blocked) return;
    if (!this.down.has(action)) { this.pressedStep.add(action); this.lastPress.set(action, this.now); }
    this.down.add(action);
  }
  release(action: A) { this.down.delete(action); }
  releaseAll() { this.down.clear(); }

  isDown(action: A) { return this.down.has(action); }
  /** Pressed since the last `endStep` (edge, not hold). */
  pressed(action: A) { return this.pressedStep.has(action); }
  /** True once if `action` was pressed within `window` seconds before `now`; then forgotten. */
  consumeBuffered(action: A, now: number, window: number) {
    const at = this.lastPress.get(action);
    if (at === undefined || now - at > window) return false;
    this.lastPress.delete(action); return true;
  }
  /** Call at the end of every simulation step. */
  endStep() { this.pressedStep.clear(); }

  /** Wire keyboard and focus events; returns a function that removes them. */
  attach(target: Pick<Window, 'addEventListener' | 'removeEventListener'> & { document?: Document }) {
    const onKey = (e: KeyboardEvent) => {
      const action = this.byCode.get(e.code); if (!action) return;
      // A focused field keeps every key (typing a save code); a focused button keeps only the keys that press it
      // (Enter/Space on Play), so the game's other keys still work after a HUD button was clicked.
      const el = (e.target as Element | null);
      if (el && typeof el.closest === 'function' && el.closest('input, textarea, select, [contenteditable]')) return;
      if (el && typeof el.closest === 'function' && el.closest('button') && (e.code === 'Enter' || e.code === 'Space' || e.code === 'NumpadEnter')) return;
      if (e.type === 'keydown') { if (!e.repeat) this.press(action); if (!this._blocked) e.preventDefault(); }
      else this.release(action);
    };
    const onLost = () => this.releaseAll();
    const onVisibility = () => { if (typeof document !== 'undefined' && document.hidden) this.releaseAll(); };
    target.addEventListener('keydown', onKey as EventListener); target.addEventListener('keyup', onKey as EventListener);
    target.addEventListener('blur', onLost); target.addEventListener('pointercancel', onLost);
    target.addEventListener('visibilitychange', onVisibility);
    return () => {
      target.removeEventListener('keydown', onKey as EventListener); target.removeEventListener('keyup', onKey as EventListener);
      target.removeEventListener('blur', onLost); target.removeEventListener('pointercancel', onLost);
      target.removeEventListener('visibilitychange', onVisibility);
    };
  }
}

/** Scaled radial dead zone for sticks: 0.2–0.25 for gamepads, ~0.05 for touch sticks. */
export function deadZone(x: number, y: number, inner = .2, outer = .95) {
  const length = Math.hypot(x, y);
  if (length < inner) return { x: 0, y: 0, magnitude: 0 };
  const magnitude = Math.min(1, (length - inner) / (outer - inner));
  return { x: x / length * magnitude, y: y / length * magnitude, magnitude };
}
