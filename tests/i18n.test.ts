import { test } from 'node:test';
import assert from 'node:assert/strict';
import { visibleStrings } from './strings.ts';
import { VI } from '../src/vi.ts';

test('every visible English string has a Vietnamese translation', () => {
  const missing = visibleStrings().filter(s => !(s in VI));
  assert.deepEqual(missing, [], `${missing.length} strings have no Vietnamese yet`);
});

test('translations keep every {placeholder}', () => {
  for (const [en, vi] of Object.entries(VI)) {
    const want = [...en.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort();
    const got = [...vi.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort();
    assert.deepEqual(got, want, `"${en}" → "${vi}"`);
  }
});
