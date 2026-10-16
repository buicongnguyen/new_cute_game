// Screenshot a raid on Bao's deck (dev aid).
import { chromium } from 'playwright';
const b = await chromium.launch({ args: ['--use-angle=d3d11'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const errors = []; p.on('pageerror', e => errors.push(e.message));
await p.addInitScript(() => { try { localStorage.clear(); } catch {} });
await p.goto(process.env.CLOUD_URL ?? 'http://127.0.0.1:5361/');
await p.waitForSelector('.screen.title');
await p.evaluate(() => { window.__cloud.setState('reef'); const g = window.__game; g.state.place = 'clover'; g.state.raidsOwed = ['clover']; g.state.story.flags.scene_raid_first = true; g.state.plots.forEach((pl, i) => Object.assign(pl, { tree: 'puffberry', phase: 'growing', progress: 10, crust: 0 })); g.syncDeck(); g.sail('reef'); });
const quiet = async () => { for (let i = 0; i < 10 && await p.isVisible('#speech'); i++) await p.click('#speech'); };
for (let i = 0; i < 40; i++) { await p.evaluate(() => window.__game.simulate(1)); await quiet(); if ((await p.evaluate(() => window.__cloud.state())).raid) break; }
await p.evaluate(() => window.__game.simulate(3.4)); await p.waitForTimeout(200);
await p.screenshot({ path: 'shots/raid-drop.png' });
await p.evaluate(() => window.__game.simulate(1.5)); await p.waitForTimeout(200);
await p.screenshot({ path: 'shots/raid-on.png' });
console.log(JSON.stringify(await p.evaluate(() => { const s = window.__cloud.state(); return { raid: s.raid, forms: s.forms, calls: window.__game.renderer.info.render.calls }; })), errors.join(' | ') || 'no errors');
await b.close();
