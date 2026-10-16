// Ad-hoc browser probe: evaluates a snippet on the title screen (dev aid, not part of the tests).
import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.addInitScript(() => { try { localStorage.clear(); } catch { /* ignore */ } });
await page.goto(process.env.CLOUD_URL ?? 'http://127.0.0.1:5361/');
await page.waitForSelector('.screen.title');
const out = await page.evaluate(() => {
  const b = document.querySelector('.screen.title .act.primary');
  const rules = [...document.styleSheets].flatMap(s => { try { return [...s.cssRules]; } catch { return []; } })
    .filter(r => r.selectorText && b.matches(r.selectorText)).map(r => `${r.selectorText} { ${r.style.cssText.slice(0, 90)} }`);
  return { rules, width: getComputedStyle(b).width, parent: getComputedStyle(b.parentElement).display };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
