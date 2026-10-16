// Browser walk through the five chapters (dev aid): wake up, the deck, the skiff, the cottage rooms, Frostfall and
// the three Gloom ships. Screenshots go to shots/ (env TAG, VP); prints state and page errors.
import { chromium } from 'playwright';
const URL = process.env.CLOUD_URL ?? 'http://127.0.0.1:5361/';
const vp = (process.env.VP ?? '1280x800').split('x').map(Number);
const tag = process.env.TAG ?? 'ch';
const only = (process.env.ONLY ?? '').split(',').filter(Boolean);
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: vp[0], height: vp[1] }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(`${m.type()}: ${m.text()}`); });
page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
await page.addInitScript(() => { if (!sessionStorage.getItem('kept')) { try { localStorage.clear(); } catch {} sessionStorage.setItem('kept', '1'); } });
await page.goto(URL);
await page.waitForSelector('.screen.title', { timeout: 30000 });
const quiet = async () => { for (let i = 0; i < 12 && await page.isVisible('#speech'); i++) await page.click('#speech'); };
const shot = async name => { await page.waitForTimeout(500); await page.screenshot({ path: `shots/${tag}-${name}.png` }); };
const state = async label => { const s = await page.evaluate(() => window.__cloud.state()); console.log(label, JSON.stringify({ mode: s.mode, place: s.place, goal: s.goal, nearby: s.nearby, hive: s.hive, forms: s.forms, helpers: s.helpers, keeper: s.keeper })); return s; };
const want = name => !only.length || only.includes(name);

if (want('wake')) {
  await page.click('.screen.title .act.primary');
  await page.waitForTimeout(600);
  await page.click('.prologue-card .act:not(.primary)');
  await page.waitForTimeout(900);
  await shot('1-wake');
  await state('wake');
  await quiet();
  await page.evaluate(() => { const g = window.__game; g.keeper.place(0, 6.6); });
  await page.waitForTimeout(300);
  await page.keyboard.press('KeyF');
  await page.waitForTimeout(1200);
  await shot('2-deck');
  await state('deck');
  await quiet();
  await page.evaluate(() => { const g = window.__game, b = g.bao.at([0, -6.9]); g.keeper.place(b.x, b.z + 1); });
  await page.keyboard.press('KeyF');
  await page.waitForTimeout(700);
  await shot('3-pat');
  await quiet();
  await state('after pat');
}
if (want('skiff')) {
  await page.evaluate(() => window.__cloud.setState('rope'));
  await quiet();
  await page.evaluate(() => window.__game.goFishing());
  await page.waitForTimeout(1200);
  await shot('4-ride');
  await page.waitForTimeout(1800);
  await quiet();
  await shot('5-skiff');
  await state('skiff');
  await page.keyboard.press('KeyF');
  await page.waitForTimeout(500);
  await shot('6-cast');
  await page.evaluate(() => window.__game.pullRope());
  await page.waitForTimeout(3200);
  await state('back up');
}
if (want('cottage')) {
  await page.evaluate(() => window.__cloud.setState('deck'));
  await page.evaluate(() => window.__game.enterHouse());
  await page.waitForTimeout(900);
  await quiet();
  await page.evaluate(() => window.__game.keeper.place(-4.8, 5.4));
  await page.waitForTimeout(400);
  await shot('7-cottage');
  await state('cottage');
  await page.evaluate(() => { const g = window.__game; g.state.items.fibre = 5; g.state.glimmer = 100; });
  await page.keyboard.press('KeyF');
  await page.waitForTimeout(500);
  await shot('8-repair');
  await page.click('.sheet .act.primary').catch(() => {});
  await page.waitForTimeout(900);
  await quiet();
  await shot('9-repaired');
}
for (const place of ['frost', 'sloop', 'warship', 'star']) {
  if (!want(place)) continue;
  await page.evaluate(n => window.__cloud.setState(n), place);
  await quiet();
  await page.waitForTimeout(600);
  await shot(`${place}-deck`);
  await state(`${place} deck`);
  if (place === 'frost') await page.evaluate(() => window.__descend());
  else { await page.evaluate(() => window.__game.board()); await page.waitForTimeout(300); await shot(`${place}-board-panel`); await page.click('.sheet .act.primary'); }
  await page.waitForTimeout(1500);
  await quiet();
  await shot(`${place}-down`);
  await state(`${place} down`);
  // Walk up to the boss with its guards cleared, to see its trick.
  await page.evaluate(() => { const g = window.__game, s = g.state, id = s.place; s.isles[id].groups = s.isles[id].groups.map(() => true); s.isles[id].spires = s.isles[id].spires.map(() => true); g.combat.forms.forEach(f => { f.reward = false; }); g.combat.freeAll(); g.combat.spires.forEach(sp => { sp.broken = true; sp.view.visible = false; }); g.hive?.setShield(false); const h = g.hive; if (h) g.keeper.place(h.pos.x + 1.5, h.pos.z + 6); });
  await page.waitForTimeout(400);
  await page.evaluate(() => window.__game.simulate(4));
  await quiet();
  await shot(`${place}-boss`);
  await state(`${place} boss`);
}
const info = await page.evaluate(() => { const r = window.__game.renderer.info; return { calls: r.render.calls, tris: r.render.triangles, geos: r.memory.geometries }; });
console.log('render', JSON.stringify(info));
console.log('errors', errors.length ? errors.slice(0, 15).join('\n') : 'none');
await browser.close();
