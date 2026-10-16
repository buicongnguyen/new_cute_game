// Every panel at the required phone/desktop sizes. LANG_UI=vi checks Vietnamese too.
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { auditPanel } from './panel-audit.mjs';
const URL = process.env.CLOUD_URL ?? 'http://127.0.0.1:5361/';
const sizes = process.env.VP ? [process.env.VP] : ['360x740', '1440x900'];
const lang = process.env.LANG_UI ?? 'en';
const browser = await chromium.launch({ args: ['--use-angle=d3d11'] });
const failures = [];
await mkdir('shots', { recursive: true });
try {
  for (const size of sizes) {
    const [width, height] = size.split('x').map(Number);
    const page = await browser.newPage({ viewport: { width, height }, hasTouch: width < 600, isMobile: width < 600 });
    page.on('pageerror', e => failures.push(e.message));
    await page.addInitScript(l => { localStorage.clear(); localStorage.setItem('cloudback:lang', l); }, lang);
    await page.goto(URL); await page.waitForSelector('.screen.title');
    await page.evaluate(() => window.__cloud.setState('sloop+rich'));
    for (let i = 0; i < 20 && await page.isVisible('#speech'); i++) await page.click('#speech');
    await page.evaluate(() => { const g = window.__game; g.state.rooms.study = false; g.state.place = 'reef'; });
    for (const [kind, arg] of [['plot', 0], ['bao'], ['map'], ['workbench'], ['kitchen'], ['market', 'reef'], ['bag'], ['journal'], ['settings'], ['crate'], ['repair', 'study'], ['board']]) {
      await page.evaluate(([k, a]) => window.__game.openPanel(k, a), [kind, arg]);
      await page.waitForTimeout(220);
      const audit = await auditPanel(page); failures.push(...audit.map(s => size + ' ' + lang + ' ' + kind + ': ' + s));
      await page.screenshot({ path: 'shots/panel-' + lang + '-' + size + '-' + kind + '.png' });
      if (kind === 'market') { await page.click('.sheet .tabs .act:nth-child(2)'); failures.push(...(await auditPanel(page)).map(s => size + ' market-buy: ' + s)); await page.screenshot({ path: 'shots/panel-' + lang + '-' + size + '-market-buy.png' }); }
      await page.evaluate(() => window.__game.panels.close()); await page.waitForTimeout(200);
    }
    await page.close(); console.log('Audited all panels: ' + size + ' ' + lang);
  }
} finally { await browser.close(); }
console.log(failures.length ? failures.join('\n') : 'Panel audit passed: text ≥11px, targets ≥44px, no horizontal overflow.');
process.exitCode = failures.length ? 1 : 0;
