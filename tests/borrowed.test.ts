import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { BORROWED, loadBorrowed } from '../src/world/borrowed.ts';

test('borrowed model roles and asset inventory match in both directions', () => {
  const rows = readFileSync(new URL('../docs/BORROWED-ASSETS.md', import.meta.url), 'utf8').split('\n')
    .filter(line => /^\|/.test(line)).slice(2).map(line => line.split('|').slice(1, -1).map(cell => cell.trim()));
  const roles = rows.map(row => row[0]);
  assert.equal(new Set(roles).size, roles.length, 'duplicate inventory role');
  assert.deepEqual(roles.sort(), Object.keys(BORROWED).sort());
  for (const [role, asset] of Object.entries(BORROWED)) {
    assert.match(asset.file, /^[a-zA-Z0-9_-]+\.glb$/);
    assert.ok(asset.node, role + ' has a named node');
    assert.ok(existsSync(new URL('../public/assets/models/borrowed/' + asset.file, import.meta.url)), role + ' has a file');
    const row = rows.find(row => row[0] === role)!;
    assert.ok(row[1].endsWith(asset.file)); assert.equal(row[2], asset.node);
    assert.ok(row[3]); assert.ok(Number(row[4]) >= 0);
    assert.ok(['borrowed', 'placeholder', 'replaced'].includes(row[5]));
  }
});
test('unknown borrowed roles fail before loading a model', async () => {
  await assert.rejects(loadBorrowed('unknown_role'), /Unknown borrowed role/);
  await assert.rejects(loadBorrowed('toString'), /Unknown borrowed role/);
});

