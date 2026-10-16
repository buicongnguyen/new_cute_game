// Vietnamese UI screenshots (dev aid): title, deck, the Bao panel and the map, on a phone and a PC.
import { chromium } from 'playwright';
const b = await chromium.launch({ args: ['--use-angle=d3d11'] });
for (const [w, h, tag] of [[390, 844, 'vi-phone'], [1280, 800, 'vi-pc']]) {
  const p = await b.newPage({ viewport: { width: w, height: h }, hasTouch: w < 500, isMobile: w < 500 });
  const errors = []; p.on('pageerror', e => errors.push(e.message));
  await p.addInitScript(() => { try { localStorage.clear(); localStorage.setItem('cloudback:lang', 'vi'); } catch {} });
  await p.goto(process.env.CLOUD_URL ?? 'http://127.0.0.1:5361/');
  await p.waitForSelector('.screen.title');
  await p.screenshot({ path: `shots/${tag}-title.png` });
  await p.evaluate(() => window.__cloud.setState('reef+rich'));
  for (let i = 0; i < 10 && await p.isVisible('#speech'); i++) await p.click('#speech');
  await p.screenshot({ path: `shots/${tag}-deck.png` });
  await p.evaluate(() => window.__game.openPanel('bao'));
  await p.waitForTimeout(150);
  await p.screenshot({ path: `shots/${tag}-bao.png` });
  await p.evaluate(() => { window.__game.panels.close(); window.__game.openPanel('workbench'); });
  await p.waitForTimeout(150);
  await p.screenshot({ path: `shots/${tag}-workbench.png` });
  console.log(tag, errors.join(' | ') || 'no errors');
  await p.close();
}
await b.close();
