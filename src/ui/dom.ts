/** Tiny DOM helpers (no framework). */
type Child = Node | string | number | null | undefined | false;
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, unknown> = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = String(v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (k === 'html') el.innerHTML = String(v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c instanceof Node ? c : String(c));
  return el;
}
export const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T | null;
/** Set text only when it changed (HUD fields update every frame). */
export function setText(el: Element | null, text: string) { if (el && el.textContent !== text) el.textContent = text; }
export function setWidth(el: HTMLElement | null, k: number) { if (!el) return; const v = `${Math.round(Math.max(0, Math.min(1, k)) * 1000) / 10}%`; if (el.style.width !== v) el.style.width = v; }
export function toggle(el: Element | null, on: boolean) { if (el && (el as HTMLElement).hidden === on) (el as HTMLElement).hidden = !on; }
