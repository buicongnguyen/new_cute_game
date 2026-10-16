// Screenshot of Nana's cabin (dev aid).
import { chromium } from 'playwright';
const b = await chromium.launch({ args: ['--use-angle=d3d11'] });
const [w, h] = (process.env.VP ?? '1280x800').split('x').map(Number);
const p = await b.newPage({ viewport: { width: w, height: h } });
const errors = []; p.on('pageerror', e => errors.push(e.message));
await p.addInitScript(() => { try { localStorage.clear(); } catch {} });
await p.goto(process.env.CLOUD_URL ?? 'http://127.0.0.1:5361/');
await p.waitForSelector('.screen.title');
await p.evaluate(() => window.__cloud.setState('reef'));
await p.evaluate(() => { const g = window.__game; g.state.notes = ['clover', 'reef']; });
await p.screenshot({ path: `shots/${process.env.TAG ?? 'h'}-deck.png` });
await p.evaluate(() => window.__game.enterHouse());
await p.waitForTimeout(1200);
for (let i = 0; i < 10 && await p.isVisible('#speech'); i++) await p.click('#speech');
await p.screenshot({ path: `shots/${process.env.TAG ?? 'h'}-house.png` });
console.log(JSON.stringify(await p.evaluate(() => { const s = window.__cloud.state(); const r = window.__game.renderer.info.render; return { mode: s.mode, nearby: s.nearby, calls: r.calls, tris: r.triangles }; })), errors.join(' | ') || 'no errors');
await b.close();
