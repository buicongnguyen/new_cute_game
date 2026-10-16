// Browser smoke: load, Play, look around Bao, then jump to an isle. Screenshots go to shots/.
import { chromium } from 'playwright';
const URL = process.env.CLOUD_URL ?? 'http://127.0.0.1:5361/';
const vp = (process.env.VP ?? '1280x800').split('x').map(Number);
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: vp[0], height: vp[1] }, deviceScaleFactor: 1, hasTouch: !!process.env.TOUCH, isMobile: !!process.env.TOUCH });
const errors = [];
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`); });
page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
await page.addInitScript(() => { try { localStorage.clear(); } catch {} });
await page.goto(URL);
await page.waitForSelector('.screen.title', { timeout: 30000 });
const tag = process.env.TAG ?? 'a';
await page.screenshot({ path: `shots/${tag}-title.png` });
await page.click('.screen.title .act.primary');
await page.waitForTimeout(800);
await page.screenshot({ path: `shots/${tag}-prologue.png` });
await page.click('.prologue-card .act:not(.primary)');
await page.waitForTimeout(1500);
await page.screenshot({ path: `shots/${tag}-deck.png` });
const s1 = await page.evaluate(() => window.__cloud.state());
console.log('deck state', JSON.stringify({ mode: s1.mode, goal: s1.goal, nearby: s1.nearby, keeper: s1.keeper }));
const steps = (process.env.STEPS ?? '').split(',').filter(Boolean);
for (const st of steps) {
  await page.evaluate(n => window.__cloud.setState(n), st);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `shots/${tag}-${st.replace(/\+/g, '_')}.png` });
}
if (process.env.DESCEND) {
  await page.evaluate(() => window.__descend());
  await page.waitForTimeout(1600);
  await page.screenshot({ path: `shots/${tag}-isle.png` });
  console.log('isle state', JSON.stringify(await page.evaluate(() => { const s = window.__cloud.state(); return { mode: s.mode, forms: s.forms, hive: s.hive, goal: s.goal }; })));
}
const info = await page.evaluate(() => { const r = window.__game.renderer.info; return { calls: r.render.calls, tris: r.render.triangles, geos: r.memory.geometries }; });
console.log('render', JSON.stringify(info));
console.log('errors', errors.length ? errors.slice(0, 15).join('\n') : 'none');
await browser.close();
