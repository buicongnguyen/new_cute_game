/**
 * Every English string the player can see: t('…') calls in the UI, the reasons rules give (`no('…')`, shown with
 * t()), the goal card, the interaction labels, the content names and every story line. tests/i18n.test.ts checks
 * that the Vietnamese pack (src/vi.ts) has each one; scripts/strings.ts lists the missing ones.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { CREW, FORMS, HIVES, ITEMS, MARKETS, PLACES, RECIPES, STAGES, TREES, moodLabel } from '../src/rules/content.ts';
import { CHATTER, PROLOGUE, SCENES } from '../src/dialogue.ts';
import { noteName } from '../src/rules/story.ts';
import { GATE_WHY } from '../src/rules/voyage.ts';

const ROOT = new URL('../src/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
function files(dir: string): string[] {
  return readdirSync(dir).flatMap(f => { const p = join(dir, f); return statSync(p).isDirectory() ? files(p) : /\.ts$/.test(f) && f !== 'vi.ts' ? [p] : []; });
}
const unescape = (s: string) => s.replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\n/g, '\n');

export function visibleStrings() {
  const out = new Set<string>();
  const add = (s: string | null | undefined) => { if (s && /[A-Za-z]/.test(s)) out.add(s); };
  for (const file of files(ROOT)) {
    const src = readFileSync(file, 'utf8');
    // t('…'), t("…"), no('…'), and the goal card's { text: '…' }.
    for (const re of [/\bt\(\s*'((?:[^'\\]|\\.)*)'/g, /\bt\(\s*"((?:[^"\\]|\\.)*)"/g, /\bno\(\s*'((?:[^'\\]|\\.)*)'/g, /\bno\(\s*`([^`$]*)`/g, /\{ text: '((?:[^'\\]|\\.)*)'/g]) {
      for (const m of src.matchAll(re)) add(unescape(m[1]));
    }
    // Interaction labels: add('id', pos, radius, 'Label', 'icon', …).
    // The id can be 'quoted' or a `template`; the label may be a ternary of two strings.
    for (const m of src.matchAll(/add\(['`][^'`]+['`], [^,]+, [\d.]+, (?:[^?']+\? )?'([^']+)'(?: : '([^']+)')?, '[^']*'/g)) { add(m[1]); add(m[2]); }
    // Icon buttons and labels passed around as data.
    for (const m of src.matchAll(/iconButton\('[^']*', '([^']+)'/g)) add(m[1]);
    for (const m of src.matchAll(/label: '([^']+)'/g)) add(m[1]);
  }
  for (const d of Object.values(ITEMS)) add(d.name);
  for (const d of Object.values(TREES)) add(d.name);
  for (const d of Object.values(PLACES)) { add(d.name); add(d.gate); }
  for (const d of Object.values(CREW)) { add(d.name); add(d.job); }
  for (const d of Object.values(RECIPES)) { add(d.name); add(d.effect); }
  for (const d of STAGES) add(d.name);
  for (const d of Object.values(HIVES)) add(d.name);
  for (const d of Object.values(FORMS)) add(d.name);
  for (const d of Object.values(MARKETS)) add(d!.name);
  for (const m of [90, 60, 30, 10]) add(moodLabel(m));
  for (const n of ['clover', 'reef', 'ember'] as const) add(noteName(n));
  for (const kind of ['Whale food', 'People food', 'Craft', 'Fish', 'Meals', 'Seeds']) add(kind);
  for (const who of ['Bao', 'The Gloom', 'You']) add(who);
  for (const why of Object.values(GATE_WHY)) add(why);
  // Settings labels and reasons returned as plain strings.
  for (const s of ['Auto', 'Sharp', 'Balanced', 'Battery saver', 'Make the Climbing Rope first', 'Make the tier before it first', 'Only Tam the Smith can make this', 'any fish', 'Mallet I']) add(s);
  for (const l of PROLOGUE) add(l);
  for (const lines of Object.values(SCENES)) for (const l of lines) add(l.text);
  for (const lines of Object.values(CHATTER)) for (const l of lines) add(l);
  // Not words: the names that stay the same in both languages are allowed to be missing.
  for (const same of ['Bao', 'Pip', 'Mina', 'Tam', 'Ria', 'English', 'Tiếng Việt', 'Cloudback']) out.delete(same);
  return [...out].sort();
}
