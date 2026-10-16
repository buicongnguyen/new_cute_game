// DESIGN §16: sample live renderer counters, with no hidden geometry or quality overrides.
// Pause gameplay while arranging the scene so combat cannot knock the Captain back to Bao during measurement.
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
export const LIMITS = { deck: { calls: 140, triangles: 120000 }, land: { calls: 200, triangles: 160000 }, ship: { calls: 200, triangles: 160000 } };
const SCENES = [
  { name: 'Bao', state: 'deck', kind: 'deck' },
  { name: 'Clover', state: 'clover', kind: 'land' },
  { name: 'Scout Sloop', state: 'sloop', kind: 'ship' },
];
export function budgetFailures(rows) {
  return rows.flatMap(row => ['calls', 'triangles'].filter(key => !Number.isFinite(row[key]) || row[key] <= 0 || row[key] > LIMITS[row.kind][key]).map(key => row.viewport + ' ' + row.scene + ': ' + key + ' ' + row[key] + ' exceeds valid range 1–' + LIMITS[row.kind][key]));
}
export async function probeBudgets(browser, url = process.env.CLOUD_URL ?? 'http://127.0.0.1:5361/') {
  const target = new URL(url); target.searchParams.set('test', '');
  const rows = [];
  for (const viewport of [{ width: 360, height: 740 }, { width: 1440, height: 900 }]) {
    for (const scene of SCENES) {
      const page = await browser.newPage({ viewport, hasTouch: viewport.width < 600, isMobile: viewport.width < 600 });
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      try {
        await page.addInitScript(() => localStorage.clear());
        await page.goto(target.href); await page.waitForSelector('.screen.title');
        await page.evaluate(state => { window.__cloud.setState(state); window.__cloud.freeze(true); }, scene.state);
        const quiet = async () => { for (let i = 0; i < 30 && await page.isVisible('#speech'); i++) await page.click('#speech'); };
        await quiet();
        if (scene.kind === 'ship') await page.evaluate(() => window.__game.boardNow(['pip', 'tam']));
        else if (scene.kind === 'land') await page.evaluate(() => window.__descend());
        await page.waitForTimeout(900); await quiet();
        try { await page.waitForFunction(mode => window.__game.mode === mode, scene.kind === 'deck' ? 'deck' : 'isle', { timeout: 5000 }); }
        catch { throw new Error(scene.name + ' ' + viewport.width + ' did not enter its scene: ' + JSON.stringify(await page.evaluate(() => ({ mode: window.__game.mode, panel: window.__game.panels.kind, summary: window.__cloud.state() })))); }
        await page.waitForTimeout(900);
        const stats = await page.evaluate(async () => {
          const g = window.__game; g.frozen = true;
          let calls = 0, triangles = 0;
          for (let i = 0; i < 60; i++) { await new Promise(requestAnimationFrame); calls = Math.max(calls, g.renderer.info.render.calls); triangles = Math.max(triangles, g.renderer.info.render.triangles); }
          return { calls, triangles };
        });
        if (errors.length) throw new Error(errors.join(' | '));
        rows.push({ viewport: viewport.width + '×' + viewport.height, scene: scene.name, kind: scene.kind, ...stats, callsLimit: LIMITS[scene.kind].calls, trianglesLimit: LIMITS[scene.kind].triangles });
      } finally { await page.close(); }
    }
  }
  console.table(rows);
  const failures = budgetFailures(rows);
  if (failures.length) throw new Error('Render budget failed:\n' + failures.join('\n'));
  return rows;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
  try { await probeBudgets(browser); } finally { await browser.close(); }
}
