// End-to-end playtest through the real game: tutorial → sail → Clover Rise (cage, groups, Spires, Hive) → back up →
// grow → raid on the way to the reef → fishing. Uses the test hooks (window.__game, __warp) and real key presses.
// Usage: node scripts/playtest.mjs   (dev server on CLOUD_URL, default http://127.0.0.1:5361/)
import { chromium } from 'playwright';
const URL = process.env.CLOUD_URL ?? 'http://127.0.0.1:5361/';
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
await page.addInitScript(() => { try { localStorage.clear(); } catch { /* ignore */ } });
await page.goto(URL);
await page.waitForSelector('.screen.title', { timeout: 30000 });
await page.click('.screen.title .act.primary');
await page.click('.prologue-card .act:not(.primary)');
await page.waitForTimeout(300);

let failures = 0;
const ok = (cond, label, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'} ${label}${extra ? ` (${extra})` : ''}`); if (!cond) failures++; };
const st = () => page.evaluate(() => window.__cloud.state());
const ev = (fn, arg) => page.evaluate(fn, arg);
const sim = s => ev(sec => window.__game.simulate(sec), s);
async function quiet() { for (let i = 0; i < 30 && await page.isVisible('#speech'); i++) await page.click('#speech'); }
async function press(code) { await page.keyboard.press(code); await sim(.05); }
async function shot(name) { await page.waitForTimeout(120); await page.screenshot({ path: `shots/play-${name}.png` }); }
/** Put the Keeper next to a deck or isle position. */
const goto = (x, z) => ev(([x, z]) => window.__game.keeper.place(x, z), [x, z]);
const plotPos = i => ev(i => { const p = window.__game.bao.plots[i].group.position; return [p.x, p.z]; }, i);

await quiet();
// 1. Plant the four moss patches through the plot panel.
for (let i = 0; i < 4; i++) {
  const [x, z] = await plotPos(i);
  await goto(x + .6, z);
  await press('KeyF');
  ok(await page.isVisible('.sheet'), `plot ${i} panel opens with F`);
  await page.click('.sheet .row .act');
  await quiet();
}
let s = await st();
ok(Object.keys(s.items).filter(k => k.startsWith('seed_')).length === 0, 'all four seeds planted', JSON.stringify(s.items));
await shot('planted');

// 2. Grow, harvest and feed.
await ev(() => window.__warp(60));
for (let i = 0; i < 4; i++) { const [x, z] = await plotPos(i); await goto(x + .6, z); await press('KeyF'); await quiet(); if (await page.isVisible('.sheet')) await page.click('.sheet .x'); }
s = await st();
ok((s.items.puffberry ?? 0) >= 6 && (s.items.fibre ?? 0) >= 4, 'harvested berries and fibre', JSON.stringify(s.items));
const feedAt = await ev(() => { const p = window.__game.bao.feedSpot(); return [p.x, p.z]; });
await goto(feedAt[0], feedAt[1] + .5); await press('KeyF'); await quiet();
s = await st();
ok(s.whaleXp > 0 && !s.items.puffberry, 'Bao ate the berries', `xp ${s.whaleXp}`);

// 3. Make the rope at the workbench.
const wb = await ev(() => { const p = window.__game.bao.props.workbench.position; return [p.x, p.z]; });
await goto(wb[0] - 1.1, wb[1]); await press('KeyF');
ok(await page.isVisible('.sheet'), 'workbench opens');
await page.click('.sheet .row:first-child .act');
s = await ev(() => window.__game.state.gear);
ok(s.rope, 'Climbing Rope made');
await page.click('.sheet .x'); await quiet();

// 4. Sail to Clover Rise from the map table.
const mt = await ev(() => { const p = window.__game.bao.props.maptable.position; return [p.x, p.z]; });
await goto(mt[0] - 1, mt[1] + .4); await press('KeyF');
ok(await page.isVisible('.skymap'), 'sky map opens at the map table');
await page.click('.skymap .place:nth-of-type(2)');
await page.click('.map-info .act.primary');
await quiet();
s = await st();
ok(!!s.voyage && s.voyage.to === 'clover', 'voyage to Clover Rise started');
await shot('voyage');
await sim(45); await quiet();
s = await st();
ok(s.place === 'clover' && !s.voyage, 'arrived over Clover Rise');
await shot('over-clover');

// 5. Down the rope. Make the Keeper strong so the playtest checks the flow, not the balance.
await ev(() => { const g = window.__game; g.state.hero.level = 15; g.state.hero.xp = 4000; g.state.gear.mallet = 3; g.state.gear.coat = 3; g.state.hero.hp = 400; });
const rp = await ev(() => { const p = window.__game.bao.props.ropepost.position; return [p.x, p.z]; });
await goto(rp[0] - .9, rp[1]); await press('KeyF');
await page.waitForTimeout(700); await quiet();
s = await st();
ok(s.mode === 'isle' && s.forms > 0, 'down on Clover Rise', `forms ${s.forms}`);
await shot('clover-landing');

// 6. Free Mayor Olla (three rings at the cage).
await goto(4.5, 21.1);
for (let i = 0; i < 3; i++) { await press('Space'); await sim(.6); }
await sim(1); await quiet();
s = await st();
ok(s.rescued.includes('olla'), 'Mayor Olla rescued');
await sim(6); await quiet();
ok(await ev(() => window.__game.isle.market.visible), 'Clover Market stall opened');

// 7. Clear the groups (auto-attack does the ringing) and break the Spires.
const map = [[-7, 11], [-12, 1], [11, -4]];
const spires = [[-15, -1], [14, -7]];
for (let gi = 0; gi < map.length; gi++) {
  for (let t = 0; t < 40; t++) {
    const target = await ev(([gx, gz]) => { const g = window.__game; const f = g.combat.forms.filter(f => !f.dead).sort((a, b) => Math.hypot(a.pos.x - gx, a.pos.z - gz) - Math.hypot(b.pos.x - gx, b.pos.z - gz))[0]; return f && Math.hypot(f.pos.x - gx, f.pos.z - gz) < 16 ? [f.pos.x, f.pos.z] : null; }, map[gi]);
    if (!target) break;
    await goto(target[0] + .9, target[1]); await sim(.8);
    await ev(() => { window.__game.state.hero.hp = 400; });
  }
  await quiet();
}
for (const [x, z] of spires) { await goto(x + 1.2, z); for (let t = 0; t < 30; t++) { await press('Space'); await sim(.6); } await quiet(); }
// Pip's cage by the first Spire.
await goto(-18 + 1.3, -4); for (let i = 0; i < 4; i++) { await press('Space'); await sim(.6); }
await sim(8); await quiet();
s = await st();
ok(s.hive && !s.hive.shielded, 'both Spires down, the Hive shield fell', JSON.stringify(s.hive));
ok(s.rescued.includes('pip') && s.crew.includes('pip'), 'Pip rescued and aboard');
await shot('spires-down');

// 8. Break the Thornhive.
for (let t = 0; t < 60; t++) {
  await goto(0, -21 + 3); await press('Space'); await sim(.6);
  await ev(() => { window.__game.state.hero.hp = 400; });
  s = await st(); if (s.hive?.broken) break;
}
await sim(3); await quiet();
s = await st();
ok(s.notes.includes('clover'), 'Thornhive broken: the Note of Dawn');
await sim(3); await quiet();
s = await st();
ok(s.gloom < .2, 'colour returned to Clover Rise', `gloom ${s.gloom.toFixed(2)}`);
await shot('clover-free');

// 9. Climb up, grow Bao, sail to the reef: the first raid.
await goto(1.2, 23.4 + .8); await press('KeyF'); await page.waitForTimeout(700); await quiet();
s = await st();
ok(s.mode === 'deck', 'back on Bao');
await ev(() => { const g = window.__game; g.state.items.glowplum = 40; });
await goto(feedAt[0], feedAt[1] + .5); await press('KeyF'); await quiet();
await page.click('#h-grow').catch(() => {});
await page.waitForTimeout(400); await quiet();
s = await st();
ok(s.stage === 1, 'Bao grew to Young');
await sim(2);
await ev(() => window.__sail('reef')); await quiet();
let raided = false;
for (let t = 0; t < 120; t++) {
  await sim(1);
  s = await st();
  if (s.raid) { raided = true; const f = await ev(() => { const x = window.__game.combat.forms.find(f => !f.dead); return x ? [x.pos.x, x.pos.z] : null; }); if (f) await goto(f[0] + .8, f[1]); await ev(() => { window.__game.state.hero.hp = 400; }); }
  await quiet();
  if (s.place === 'reef' && !s.voyage) break;
}
await quiet();
s = await st();
ok(raided, 'the scripted raid came on the first voyage after the song');
ok(s.place === 'reef', 'arrived over Lantern Reef after the raid');
await shot('over-reef');

// 10. Cloud fishing at the tail.
const fs = await ev(() => { const p = window.__game.bao.props.fishspot.position; return [p.x, p.z]; });
await goto(fs[0], fs[1] - .8); await press('KeyF');
let caught = 0;
for (let t = 0; t < 400 && caught < 1; t++) {
  await sim(.05);
  s = await st();
  if (t % 20 === 0) await quiet();
  if (s.fishing === 'bite') { await press('KeyF'); caught = await ev(() => window.__game.state.stats.fish); }
}
ok(caught >= 1, 'caught a sky fish');
await shot('fishing');

// 11. Down the hatch into Nana's cottage (the owner's Zoo Garden house), nap in the bed, climb back up.
const ht = await ev(() => { const p = window.__game.bao.props.hatch.position; return [p.x, p.z]; });
await quiet();
await goto(ht[0] + 1.1, ht[1]); await press('KeyF');
await page.waitForTimeout(700); await quiet();
s = await st();
ok(s.mode === 'house', 'went down the hatch into the cottage', `nearby ${s.nearby}, mode ${s.mode}`);
const spot = id => ev(id => { const g = window.__game; g.buildInteractables(); const i = g.interactables.find(x => x.id === id); return i ? [i.pos.x, i.pos.z] : null; }, id);
await ev(() => { window.__game.state.hero.hp = 20; });
const bed = await spot('bed');
await goto(bed[0] + 1.1, bed[1] + 1.2); await press('KeyF');
await page.waitForTimeout(900);
s = await st();
ok(s.hp > 300, 'rested to full health in the bed', `hp ${Math.round(s.hp)}`);
await shot('cabin');
const ladder = await spot('ladder');
await goto(ladder[0], ladder[1] - .4); await press('KeyF');
await page.waitForTimeout(700); await quiet();
s = await st();
ok(s.mode === 'deck', 'climbed the ladder back up on deck');

console.log(`\n${failures ? `${failures} FAILED` : 'ALL PASSED'}; page errors: ${errors.length ? errors.join(' | ') : 'none'}`);
await browser.close();
process.exit(failures || errors.length ? 1 : 0);
