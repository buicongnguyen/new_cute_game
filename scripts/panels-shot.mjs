// Screenshots of the story-v2 panels at phone size (dev aid): crate, repair, boarding, journal skills, the sky map with
// the fleet, Kai's market upgrade. env LANG=vi for Vietnamese, VP=390x844.
import { chromium } from 'playwright';
const URL = process.env.CLOUD_URL ?? 'http://127.0.0.1:5361/';
const vp = (process.env.VP ?? '390x844').split('x').map(Number);
const lang = process.env.LANG_UI ?? 'en';
const browser = await chromium.launch({ args: ['--use-angle=d3d11'] });
const page = await browser.newPage({ viewport: { width: vp[0], height: vp[1] }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.addInitScript(l => { try { localStorage.clear(); localStorage.setItem('cloudback:lang', l); } catch {} }, lang);
await page.goto(URL);
await page.waitForSelector('.screen.title');
const quiet = async () => { for (let i = 0; i < 20 && await page.isVisible('#speech'); i++) await page.click('#speech'); };
const shot = async n => { await page.waitForTimeout(300); await page.screenshot({ path: `shots/panel-${lang}-${n}.png` }); };
await page.evaluate(() => window.__cloud.setState('sloop+rich')); await quiet();
const open = (k, a) => page.evaluate(([k, a]) => window.__game.openPanel(k, a), [k, a]);
const close = () => page.evaluate(() => window.__game.panels.close());
await open('crate'); await shot('crate'); await close();
await page.evaluate(() => { window.__game.state.rooms.study = false; });
await open('repair', 'study'); await shot('repair'); await close();
await open('board'); await shot('board'); await close();
await open('journal'); await shot('journal'); await page.evaluate(() => { document.querySelector('.sheet .body').scrollTop = 400; }); await shot('journal-2'); await close();
await open('map'); await shot('map'); await close();
await page.evaluate(() => { const g = window.__game; g.state.place = 'reef'; }); await open('market', 'reef'); await page.click('.sheet .tabs .act:nth-child(2)'); await page.evaluate(() => { document.querySelector('.sheet .body').scrollTop = 900; }); await shot('market'); await close();
await open('kitchen'); await shot('kitchen'); await close();
console.log('errors', errors.length ? errors.join(' | ') : 'none');
await browser.close();
