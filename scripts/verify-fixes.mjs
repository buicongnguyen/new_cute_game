// Browser checks for the review fixes (dev aid): save code, panel scrolling, Start over, overboard and the gong.
import { chromium } from 'playwright';
const URL = process.env.CLOUD_URL ?? 'http://127.0.0.1:5361/';
const b = await chromium.launch({ args: ['--use-angle=d3d11'] });
const p = await b.newPage({ viewport: { width: 844, height: 390 } });
const errors = []; p.on('pageerror', e => errors.push(e.message));
let fails = 0; const ok = (c, l, x = '') => { console.log(`${c ? 'PASS' : 'FAIL'} ${l}${x ? ` (${x})` : ''}`); if (!c) fails++; };
await p.addInitScript(() => { if (!sessionStorage.getItem('kept')) { try { localStorage.clear(); } catch {} sessionStorage.setItem('kept', '1'); } });
await p.goto(URL);
await p.waitForSelector('.screen.title');
await p.evaluate(() => window.__cloud.setState('reef+rich'));
for (let i = 0; i < 10 && await p.isVisible('#speech'); i++) await p.click('#speech');

// Save code survives HUD ticks.
await p.evaluate(() => window.__game.openPanel('settings'));
await p.click('.sheet .act >> text=Make code');
await p.waitForTimeout(600);
const len = await p.evaluate(() => document.querySelector('.sheet textarea').value.length);
ok(len > 100, 'Make code shows a save code that stays', `${len} chars after 600 ms`);
// Scrolling a long panel stays put.
await p.evaluate(() => { window.__game.panels.close(); window.__game.openPanel('workbench'); });
await p.evaluate(() => { document.querySelector('.sheet .body').scrollTop = 200; });
await p.waitForTimeout(500);
const top = await p.evaluate(() => document.querySelector('.sheet .body').scrollTop);
ok(top > 150, 'a scrolled panel keeps its scroll position', `scrollTop ${top}`);
// A long press on a panel button still clicks.
await p.evaluate(() => window.__game.panels.close());

// Knock a raider overboard and ring a gong.
await p.evaluate(() => { const g = window.__game; g.state.place = 'clover'; g.state.raidsOwed = ['clover']; g.state.story.flags.scene_raid_first = true; g.sail('reef'); });
for (let i = 0; i < 60; i++) { await p.evaluate(() => window.__game.simulate(1)); for (let j = 0; j < 4 && await p.isVisible('#speech'); j++) await p.click('#speech'); if ((await p.evaluate(() => window.__cloud.state())).raid) break; }
await p.evaluate(() => window.__game.simulate(6));
const before = await p.evaluate(() => window.__game.state.stats.voyages);
const over = await p.evaluate(() => {
  const g = window.__game, f = g.combat.forms.find(x => !x.dead && !x.boarding);
  if (!f) return 'no raider on deck';
  // Stand inward of it and ring: the push sends it over the gunwale.
  const [a, bb] = g.bao.half(), k = Math.hypot(f.pos.x / a, f.pos.z / bb);
  f.pos.multiplyScalar(.98 / k);
  g.keeper.place(f.pos.x * .78, f.pos.z * .78); g.keeper.actor.lookAt(f.pos.x, f.pos.z);
  g.keeper.ringCd = 0; g.keeper.ring(false); g.simulate(1);
  return f.dead ? 'overboard' : `still aboard at k=${Math.hypot(f.pos.x / a, f.pos.z / bb).toFixed(2)}`;
});
ok(over === 'overboard', 'a ring at the rim sends a raider overboard', over);
const gong = await p.evaluate(() => { const g = window.__game; g.buildInteractables(); const i = g.interactables.find(x => x.id === 'gong0'); if (!i) return 'no gong'; g.keeper.place(i.pos.x + 1, i.pos.z); i.act(); return g.raid ? `cd ${g.raid.gongCd[0]}` : 'no raid'; });
ok(/cd 6/.test(gong), 'the gong rings and starts its 6 s hum', gong);
void before;

// Start over really starts over.
await p.evaluate(() => { window.__game.state.glimmer = 4242; window.__game.save(); });
await p.evaluate(() => { window.__game.panels.close(); window.__game.openPanel('settings'); });
p.once('dialog', d => d.accept());
await Promise.all([p.waitForNavigation(), p.click('.sheet .act.danger')]);
await p.waitForSelector('.screen.title');
const g2 = await p.evaluate(() => window.__game.state.glimmer);
ok(g2 === 20, 'Start over gives a fresh game', `glimmer ${g2}`);
console.log(`${fails ? `${fails} FAILED` : 'ALL PASSED'}; page errors: ${errors.length ? errors.join(' | ') : 'none'}`);
await b.close();
process.exit(fails ? 1 : 0);
