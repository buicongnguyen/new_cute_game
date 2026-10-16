/**
 * Fixed-step simulation with interpolated rendering (Gaffer on Games, "Fix Your Timestep").
 *
 * - The simulation always advances in equal steps (default 1/60 s), so physics, timers and
 *   tests behave the same at 30, 60 or 144 Hz.
 * - Hit-stop and slow motion scale only GAME time; the camera, tweens, HUD and audio keep
 *   real time (pass `realDt` to them from `render`).
 * - Frame time is clamped (0.25 s) and substeps are capped, so a hidden tab or a long hitch
 *   doesn't make the game "catch up" in one burst.
 *
 * Measure real frame time with `THREE.Timer` (core since r179; `Clock` is deprecated from
 * r183) and call `timer.connect(document)` so hidden tabs don't return a giant delta:
 *
 *   const timer = new THREE.Timer(); timer.connect(document);
 *   renderer.setAnimationLoop(t => { timer.update(t); loop.advance(timer.getDelta()); });
 */
export interface LoopHooks {
  /** Advance the simulation by exactly `dt` seconds of game time. */
  step(dt: number): void;
  /** Draw; `alpha` (0–1) interpolates between the last two simulation states. */
  render(alpha: number, realDt: number): void;
}

export class GameLoop {
  readonly stepSeconds: number;
  /** Slow motion: 1 = normal, 0.3 = a slow-motion finisher. Affects game time only. */
  timeScale = 1;
  /** Seconds of game time still frozen by hit-stop. */
  hitStop = 0;
  gameTime = 0;
  realTime = 0;
  maxSubsteps = 5;
  private accumulator = 0;
  private hooks: LoopHooks;

  constructor(hooks: LoopHooks, hz = 60) {
    this.hooks = hooks;
    this.stepSeconds = 1 / hz;
  }

  /** Freeze game time for `seconds` (hit-stop). Overlapping calls keep the longest. */
  freeze(seconds: number) {
    this.hitStop = Math.max(this.hitStop, seconds);
  }

  /** Advance by one real frame (seconds). */
  advance(realDt: number) {
    const dt = Math.min(Math.max(realDt, 0), 0.25);
    this.realTime += dt;
    let gameDt = dt * this.timeScale;
    if (this.hitStop > 0) {
      const frozen = Math.min(this.hitStop, dt);
      this.hitStop -= frozen;
      gameDt = Math.max(0, (dt - frozen) * this.timeScale);
    }
    this.accumulator += gameDt;
    let steps = 0;
    while (this.accumulator >= this.stepSeconds && steps < this.maxSubsteps) {
      this.hooks.step(this.stepSeconds);
      this.gameTime += this.stepSeconds;
      this.accumulator -= this.stepSeconds;
      steps++;
    }
    // Too far behind: drop the backlog instead of spiralling.
    if (steps === this.maxSubsteps) this.accumulator = Math.min(this.accumulator, this.stepSeconds);
    this.hooks.render(this.accumulator / this.stepSeconds, dt);
  }
}
