import type * as T from 'three';

/**
 * Adaptive quality (after Zoo Garden's governor): on phones the cost is pixels and the shadow pass, so the governor
 * first lowers the pixel ratio, then the shadow map, and steps back up after a run of good seconds. The choice is
 * stored per device, never in the save.
 */
export type Quality = 'auto' | 'high' | 'medium' | 'low';
const PROFILES = { high: { ratio: 2, shadow: 2048 }, medium: { ratio: 1.25, shadow: 1024 }, low: { ratio: .9, shadow: 0 } } as const;
const KEY = 'cloudback:graphics';
const mobile = typeof matchMedia === 'function' && (matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad/i.test(navigator.userAgent));

export class Governor {
  setting: Quality = 'auto';
  ratio = 1;
  private level: 'high' | 'medium' | 'low' = mobile ? 'medium' : 'high';
  private sun: T.DirectionalLight | null = null;
  private frames = 0; private elapsed = 0; private slow = 0; private good = 0; private settle = 4;
  fps = 60;
  constructor(private renderer: T.WebGLRenderer, private lights: { setShadowSize(n: number): void }) {
    try { const v = localStorage.getItem(KEY); if (v === 'auto' || v === 'high' || v === 'medium' || v === 'low') this.setting = v; } catch { /* default */ }
    if (this.setting !== 'auto') this.level = this.setting;
    this.ratio = this.targetRatio();
  }
  private targetRatio() { return Math.min(typeof devicePixelRatio === 'number' ? devicePixelRatio : 1, PROFILES[this.level].ratio, mobile && this.setting === 'auto' ? 1.5 : 9); }
  attach(sun: T.DirectionalLight) { this.sun = sun; this.apply(); }
  private apply() {
    const shadow = PROFILES[this.level].shadow;
    this.renderer.shadowMap.enabled = shadow > 0;
    if (this.sun) { this.sun.castShadow = shadow > 0; if (shadow) this.lights.setShadowSize(shadow); }
    this.renderer.setPixelRatio(this.ratio);
  }
  choose(q: Quality) {
    this.setting = q;
    try { localStorage.setItem(KEY, q); } catch { /* session */ }
    this.level = q === 'auto' ? (mobile ? 'medium' : 'high') : q;
    this.ratio = this.targetRatio(); this.settle = 3; this.apply();
  }
  /** Feed every frame; once a second it may step quality down (3 slow seconds) or up (12 good seconds). */
  sample(dt: number, playing: boolean) {
    if (!playing || dt <= 0 || dt > .5) { this.frames = this.elapsed = 0; return; }
    this.frames++; this.elapsed += dt;
    if (this.elapsed < 1) return;
    this.fps = this.frames / this.elapsed; this.frames = this.elapsed = 0;
    if (this.settle > 0) { this.settle--; return; }
    if (this.setting !== 'auto') return;
    if (this.fps < 40) {
      this.good = 0;
      if (++this.slow < 3) return;
      this.slow = 0;
      if (this.ratio > 1) { this.ratio = Math.max(1, this.ratio - .25); this.apply(); return; }
      if (this.level !== 'low') { this.level = this.level === 'high' ? 'medium' : 'low'; this.ratio = Math.min(this.ratio, this.targetRatio()); this.apply(); this.settle = 2; }
      return;
    }
    this.slow = 0;
    if (this.fps > 57 && ++this.good >= 12) {
      this.good = 0;
      const target = this.targetRatio();
      if (this.ratio < target) { this.ratio = Math.min(target, this.ratio + .25); this.apply(); }
    }
  }
}
