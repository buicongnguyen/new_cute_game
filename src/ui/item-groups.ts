// Ported from cute_game/src/item-groups.ts; Cloudback uses food/material kinds, not equipment power.
import { ITEMS, type ItemId, type ItemKind } from '../rules/content.ts';
import { h } from './dom.ts';
import { t } from '../i18n.ts';
const ORDER: ItemKind[] = ['whale', 'people', 'meal', 'fish', 'craft', 'seed'];
const LABELS: Record<ItemKind, string> = { whale: 'Whale food', people: 'People food', meal: 'Meals', fish: 'Fish', craft: 'Craft', seed: 'Seeds' };
const KEY = 'cloudback:folded-groups';
export function groupedItems(panel: string, ids: ItemId[], render: (id: ItemId) => Node): HTMLElement[] {
  let folded: string[] = [];
  try { const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]'); if (Array.isArray(value)) folded = value.filter((v): v is string => typeof v === 'string'); } catch { /* Optional device preference. */ }
  return ORDER.flatMap(kind => {
    const entries = ids.filter(id => ITEMS[id].kind === kind); if (!entries.length) return [];
    const key = panel + ':' + kind, body = h('div', { class: 'grid', hidden: folded.includes(key) }, ...entries.map(render));
    const button = h('button', { class: 'act group-toggle', 'aria-expanded': String(!body.hidden), onclick: () => {
      body.hidden = !body.hidden; button.setAttribute('aria-expanded', String(!body.hidden));
      folded = folded.filter(v => v !== key); if (body.hidden) folded.push(key);
      try { localStorage.setItem(KEY, JSON.stringify(folded)); } catch { /* Optional device preference. */ }
    } }, t(LABELS[kind]) + ' · ' + entries.length);
    return [h('section', { class: 'item-group' }, h('h3', {}, button), body)];
  });
}
