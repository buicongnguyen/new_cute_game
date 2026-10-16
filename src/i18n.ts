/**
 * English is the source language: UI code writes t('English text {n}', { n }). The Vietnamese pack (src/vi.ts) maps
 * each English string to its translation; tests/i18n.test.ts fails when a string in the code has no translation.
 */
import { VI } from './vi.ts';

export type Lang = 'en' | 'vi';
const LANG_KEY = 'cloudback:lang';
let lang: Lang = 'en';
const listeners = new Set<() => void>();

export function initLanguage() {
  let stored: string | null = null;
  try { stored = localStorage.getItem(LANG_KEY); } catch { /* private mode */ }
  const browser = typeof navigator !== 'undefined' && /^vi\b/i.test(navigator.language ?? '');
  lang = stored === 'vi' || stored === 'en' ? stored : browser ? 'vi' : 'en';
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
}
export const language = () => lang;
export function setLanguage(next: Lang) {
  lang = next;
  try { localStorage.setItem(LANG_KEY, next); } catch { /* session only */ }
  if (typeof document !== 'undefined') document.documentElement.lang = next;
  listeners.forEach(f => f());
}
export const onLanguage = (f: () => void) => { listeners.add(f); return () => listeners.delete(f); };

export function t(text: string, vars?: Record<string, string | number>) {
  let out = lang === 'vi' ? (VI[text] ?? text) : text;
  if (vars) for (const [k, v] of Object.entries(vars)) out = out.split(`{${k}}`).join(lang === 'vi' && typeof v === 'string' ? (VI[v] ?? v) : String(v));
  return out;
}
/** Translate a content name (item, place, character) that is already an English source string. */
export const tn = (name: string) => t(name);
