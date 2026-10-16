import { h } from './dom.ts';
import { t } from '../i18n.ts';
import { tabCues } from './tab-cues.ts';

const FOCUS = 'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex="0"]';
let nextId = 0;
/** Shared sheet lifecycle; content stays owned by its panel. */
export class Panel {
  readonly sheet = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', tabindex: '-1' });
  readonly root: HTMLElement;
  private readonly id = 'cloudback-panel-' + ++nextId;
  private previous: HTMLElement | null = null;
  private disposeCues: () => void = () => {};
  private ghost: HTMLElement | null = null;
  private animation: Animation | null = null;
  private frameId = 0;
  private pendingBack = false;
  private lastPad = '';
  private repeatAt = 0;
  constructor(parent: HTMLElement, private requestClose: () => void) {
    this.root = h('div', { class: 'panel-backdrop', hidden: true, onclick: (e: Event) => { if (e.target === this.root) this.requestClose(); } }, this.sheet);
    parent.append(this.root);
    this.sheet.setAttribute('aria-labelledby', this.id);
    window.addEventListener('keydown', this.keydown, true);
    window.addEventListener('popstate', this.popstate);
  }
  private get reduced() { return matchMedia('(prefers-reduced-motion: reduce)').matches; }
  private controls() { return [...this.sheet.querySelectorAll<HTMLElement>(FOCUS)].filter(el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden'); }
  private move(delta: number) {
    const controls = this.controls(); if (!controls.length) return this.sheet.focus();
    const i = controls.indexOf(document.activeElement as HTMLElement);
    controls[(i + delta + controls.length) % controls.length].focus();
  }
  private activate() { const el = document.activeElement; if (el && this.sheet.contains(el)) el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }
  private keydown = (e: KeyboardEvent) => {
    if (this.root.hidden) return;
    const editing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as Element).tagName);
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); this.requestClose(); }
    else if (e.key === 'Tab') { e.preventDefault(); e.stopImmediatePropagation(); this.move(e.shiftKey ? -1 : 1); }
    else if (!editing && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) { e.preventDefault(); e.stopImmediatePropagation(); this.move(e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1); }
    else if (!editing && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); e.stopImmediatePropagation(); this.activate(); }
  };
  private popstate = () => {
    if (this.pendingBack) { this.pendingBack = false; if (!this.root.hidden) this.pushHistory(); return; }
    if (!this.root.hidden && history.state?.cloudbackPanel !== this.id) this.requestClose();
  };
  private pushHistory() { history.pushState({ ...history.state, cloudbackPanel: this.id }, ''); }
  private padAction() {
    const pad = navigator.getGamepads?.().find(p => p?.connected); if (!pad) return '';
    if (pad.buttons[1]?.pressed) return 'close';
    if (pad.buttons[0]?.pressed) return 'activate';
    if (pad.buttons[12]?.pressed || pad.buttons[14]?.pressed || pad.axes[0] < -.5 || pad.axes[1] < -.5) return 'previous';
    if (pad.buttons[13]?.pressed || pad.buttons[15]?.pressed || pad.axes[0] > .5 || pad.axes[1] > .5) return 'next';
    return '';
  }
  private pollPad = (now: number) => {
    if (this.root.hidden) return;
    const action = this.padAction(), changed = action !== this.lastPad;
    if (action && (changed || ((action === 'next' || action === 'previous') && now >= this.repeatAt))) {
      if (action === 'close') this.requestClose(); else if (action === 'activate') this.activate(); else this.move(action === 'next' ? 1 : -1);
      this.repeatAt = now + (changed ? 350 : 120);
    }
    this.lastPad = action;
    if (!this.root.hidden) this.frameId = requestAnimationFrame(this.pollPad);
  };
  open() {
    this.ghost?.remove(); this.ghost = null;
    if (!this.root.hidden) return;
    this.previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.root.hidden = false;
    if (!this.pendingBack) this.pushHistory();
    this.animation?.cancel();
    if (!this.reduced) this.animation = this.sheet.animate([{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'none' }], { duration: 180 });
    this.lastPad = this.padAction(); this.repeatAt = performance.now() + 350;
    this.frameId = requestAnimationFrame(this.pollPad);
  }
  close() {
    if (this.root.hidden) return;
    this.animation?.cancel(); this.disposeCues(); cancelAnimationFrame(this.frameId);
    if (!this.reduced) {
      const ghost = this.root.cloneNode(true) as HTMLElement;
      ghost.inert = true; ghost.setAttribute('aria-hidden', 'true'); ghost.style.pointerEvents = 'none';
      ghost.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
      const sheet = ghost.querySelector<HTMLElement>('.sheet')!; sheet.className = 'panel-exit-sheet';
      this.root.after(ghost); this.ghost = ghost;
      const body = ghost.querySelector('.body'); if (body) body.scrollTop = this.sheet.querySelector('.body')?.scrollTop ?? 0;
      sheet.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(12px)' }], { duration: 180, fill: 'forwards' }).finished.then(() => ghost.remove());
    }
    this.root.hidden = true; this.sheet.replaceChildren();
    this.previous?.focus({ preventScroll: true });
    if (history.state?.cloudbackPanel === this.id) { this.pendingBack = true; history.back(); }
  }
  render(kind: string, title: string, children: (Node | null)[]) {
    const same = this.sheet.dataset.kind === kind, scroll = same ? this.sheet.querySelector('.body')?.scrollTop ?? 0 : 0;
    const focused = same ? this.controls().indexOf(document.activeElement as HTMLElement) : -1;
    this.disposeCues();
    const body = h('div', { class: 'body' }, ...children);
    this.sheet.replaceChildren(h('header', {}, h('h2', { id: this.id }, title), h('button', { class: 'x', 'aria-label': t('Close'), onclick: this.requestClose }, '✕')), body);
    this.sheet.dataset.kind = kind; body.scrollTop = scroll; this.disposeCues = tabCues(this.sheet);
    const controls = this.controls(); (controls[Math.max(0, focused)] ?? controls[0] ?? this.sheet).focus({ preventScroll: true });
  }
  destroy() { this.close(); window.removeEventListener('keydown', this.keydown, true); window.removeEventListener('popstate', this.popstate); this.ghost?.remove(); this.root.remove(); }
}
