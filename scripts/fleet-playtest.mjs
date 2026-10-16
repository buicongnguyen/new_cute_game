import { probeBudgets } from './budget.mjs';
// Browser checks for chapters 3–5's new mechanics (the owner's story v2): Juno's locked workshop, the conch, the Hush
// Bell's silence and echo bells, Shellback shields, Puffcap bursts, boarding with crew mates, Captain Barnacle's
// anchor, the Coilwyrm's knots, the Grey Star's list and the ending. Usage: node scripts/fleet-playtest.mjs
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
let failures = 0;
const ok = (cond, label, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'} ${label}${extra ? ` (${extra})` : ''}`); if (!cond) failures++; };
const ev = (fn, arg) => page.evaluate(fn, arg);
const st = () => ev(() => window.__cloud.state());
async function quiet() { for (let i = 0; i < 30 && await page.isVisible('#speech'); i++) await page.click('#speech'); }
const shot = async name => { await page.waitForTimeout(150); await page.screenshot({ path: `shots/fleet-${name}.png` }); };
/** Strong Captain (the checks are about the tricks, not the balance), full health, freeze nothing. */
const strong = () => ev(() => { const g = window.__game; g.state.hero.level = 20; g.state.hero.xp = 10400; g.state.gear.mallet = 3; g.state.gear.coat = 3; g.state.hero.hp = 600; });
/** Clears a place's guards: every group freed, every Spire broken. */
const clearGuards = () => ev(() => { const g = window.__game, s = g.state, id = s.place; g.combat.forms.forEach(f => { f.reward = false; }); g.combat.freeAll(); s.isles[id].groups = s.isles[id].groups.map(() => true); g.combat.spires.forEach(sp => { if (!sp.broken) { sp.hp = 0; sp.broken = true; sp.view.visible = false; g['onSpire'](sp.index, sp.pos); } }); if (g.hive && g.hive.shielded) g.hive.setShield(false); });

// ---------------------------------------------------------- Frostfall
await ev(() => window.__cloud.setState('frost')); await quiet(); await strong();
await ev(() => window.__descend()); await page.waitForTimeout(900); await quiet();
let s = await st();
ok(s.mode === 'isle' && s.place === 'frost' && s.hive?.id === 'hushbell', 'down on Frostfall, the Hush Bell waits', JSON.stringify(s.hive));
const juno = await ev(() => { const g = window.__game, c = g.combat.cages.find(c => c.index === 1); g.keeper.place(c.pos.x + 1.2, c.pos.z); for (let i = 0; i < 4; i++) { g.keeper.ringCd = 0; g.keeper.ring(false); g.simulate(.6); } return { locked: c.locked, open: c.open }; });
ok(juno.locked && !juno.open, 'Juno’s workshop cage is locked while its Spire stands');
await quiet();
await ev(() => { const g = window.__game, sp = g.combat.spires.find(x => x.index === 0); g.keeper.place(sp.pos.x + 1.2, sp.pos.z); for (let i = 0; i < 8 && !sp.broken; i++) { g.keeper.ringCd = 0; g.keeper.ring(false); g.simulate(.6); } });
await quiet();
const junoFree = await ev(() => { const g = window.__game, c = g.combat.cages.find(c => c.index === 1); g.keeper.place(c.pos.x + 1.2, c.pos.z); for (let i = 0; i < 5 && !c.open; i++) { g.keeper.ringCd = 0; g.keeper.ring(false); g.simulate(.6); } return { locked: c.locked, open: c.open, crew: g.state.crew }; });
ok(!junoFree.locked && junoFree.open && junoFree.crew.includes('juno'), 'its Spire broken, Juno is free and joins the crew', JSON.stringify(junoFree));
await quiet();
// The conch: away from the bell it calls Bao; near the Hush Bell its hush swallows the sound.
await clearGuards(); await quiet();
const hushed = await ev(() => { const g = window.__game; g.keeper.place(g.hive.pos.x + 4, g.hive.pos.z + 4); g.blowConch(); g.simulate(1); return g.mode; });
await quiet();
ok(hushed === 'isle', 'near the Hush Bell the conch is swallowed (still on the land)');
// Silence: the bell takes nothing until the three echo bells ring; a dome stops the mallet.
const silent = await ev(() => { const g = window.__game, h = g.hive, hp = h.hp; g.keeper.place(h.pos.x, h.pos.z + h.radius + 1.2); g.keeper.actor.facing = Math.PI; g.keeper.ringCd = 0; g.keeper.ring(false); g.simulate(.3); return { before: hp, after: h.hp, status: h.status() }; });
ok(silent.after === silent.before && /Silent/.test(silent.status), 'the silent Hush Bell takes no damage', JSON.stringify(silent));
const cracked = await ev(() => { const g = window.__game, h = g.hive; for (const e of h.echoes) { g.keeper.place(e.pos.x + .9, e.pos.z); g.keeper.ringCd = 0; g.keeper.ring(false); g.simulate(.2); } return { crack: h.crackT, status: h.status() }; });
ok(cracked.crack > 0, 'ringing the three echo bells cracks the silence', JSON.stringify(cracked));
await quiet();
const hit = await ev(() => { const g = window.__game, h = g.hive, hp = h.hp; g.keeper.place(h.pos.x, h.pos.z + h.radius + 1.2); g.keeper.ringCd = 0; g.keeper.ring(false); g.simulate(.2); return { before: hp, after: h.hp }; });
ok(hit.after < hit.before, 'the cracked bell takes damage', JSON.stringify(hit));
const dome = await ev(() => { const g = window.__game, h = g.hive; h['addDome'](g.keeper.pos.clone(), 3, 6); const hp = h.hp; g.keeper.ringCd = 0; g.keeper.ring(false); g.simulate(.2); return { before: hp, after: h.hp, hushes: h.hushes(g.keeper.pos) }; });
ok(dome.hushes && dome.after === dome.before, 'inside a dome of silence the mallet does nothing', JSON.stringify(dome));
await shot('hushbell');
// Shellback: its front shield takes a plain ring at 15%.
const shell = await ev(() => { const g = window.__game, T = g.keeper.pos.constructor; const f = g.combat.spawn('shellback', new T(g.keeper.pos.x, 0, g.keeper.pos.z - 1.4), 3, { alert: true, reward: false }); f.face = Math.atan2(g.keeper.pos.x - f.pos.x, g.keeper.pos.z - f.pos.z); const hp = f.hp; g.combat.strike(g.keeper.pos, Math.atan2(f.pos.x - g.keeper.pos.x, f.pos.z - g.keeper.pos.z), 2, 100, false); const front = hp - f.hp; f.face += Math.PI; const hp2 = f.hp; g.combat.strike(g.keeper.pos, Math.atan2(f.pos.x - g.keeper.pos.x, f.pos.z - g.keeper.pos.z), 2, 100, false); return { front, back: hp2 - f.hp }; });
ok(shell.front > 0 && shell.front < shell.back * .3, 'a Shellback shrugs off rings from the front, not from behind', JSON.stringify(shell));
// Beat the Hush Bell: the Note of Frost, and the Gloom fleet shows itself.
await ev(() => { const g = window.__game, h = g.hive; g.combat.forms.forEach(f => { f.reward = false; }); g.combat.freeAll(); h['domes'].forEach(d => { d.t = 0; }); g.simulate(.1); h.crackT = 30; h.hp = 1; g.keeper.place(h.pos.x, h.pos.z + h.radius + 1.2); g.keeper.ringCd = 0; g.keeper.ring(false); g.simulate(.5); });
await page.waitForTimeout(2200); await quiet();
s = await st();
ok(s.notes.length === 4 && s.notes.includes('frost'), 'the Hush Bell breaks: all four Notes', JSON.stringify(s.notes));
// Back up with the conch (now nothing hushes it).
await ev(() => { const g = window.__game; g.keeper.place(0, 15); g.blowConch(); }); await page.waitForTimeout(1400); await quiet();
s = await st();
ok(s.mode === 'deck', 'the conch called Bao: back on deck', s.mode);

// ---------------------------------------------------------- the Scout Sloop
await ev(() => window.__cloud.setState('sloop')); await quiet(); await strong();
s = await st();
ok(s.goal === 'Board {place} over the plank', 'at the Scout Sloop: board it', s.goal);
await ev(() => window.__game.board()); await page.waitForTimeout(200);
ok(await page.isVisible('.sheet'), 'the boarding panel asks for two crew mates');
await page.click('.sheet .act.primary'); await page.waitForTimeout(900); await quiet();
s = await st();
ok(s.mode === 'isle' && s.helpers.length === 2 && s.hive?.shielded, 'aboard with two crew mates; the raiders guard the captain', JSON.stringify({ helpers: s.helpers, hive: s.hive }));
// Overboard through a rail gap (and not through a solid rail).
const over = await ev(() => { const g = window.__game, f = g.combat.forms.find(f => !f.dead); const T = g.keeper.pos.constructor; f.pos.set(-5.3, 0, 0); f.vel.set(0, 0, 0); g.keeper.place(-3.5, 0); g.combat.knock(f, new T(-3.5, 0, 0), 2.5); g.simulate(.8); const gap = f.dead; const f2 = g.combat.forms.find(x => !x.dead); f2.pos.set(-5.3, 0, 4.5); g.combat.knock(f2, new T(-3.5, 0, 4.5), 2.5); g.simulate(.8); return { gap, rail: !f2.dead, x: f2.pos.x.toFixed(2) }; });
ok(over.gap && over.rail, 'a knock through a rail gap sends a raider overboard; a solid rail stops it', JSON.stringify(over));
// A Puffcap's burst throws other raiders.
const puff = await ev(() => { const g = window.__game, T = g.keeper.pos.constructor, p = g.combat.spawn('puffcap', new T(2, 0, 0), 3, { alert: true, reward: false }), o = g.combat.spawn('gloomling', new T(3, 0, 0), 3, { alert: true, reward: false }); g['combat']['burst'](p); const v = Math.hypot(o.vel.x, o.vel.z); return { v }; });
ok(puff.v > 5, 'a Puffcap’s burst knocks the raiders near it back', JSON.stringify(puff));
await clearGuards(); await quiet();
s = await st();
ok(s.hive && !s.hive.shielded, 'raiders gone: the captain’s crust opens');
// Families in the hold.
const fam = await ev(() => { const g = window.__game, c = g.combat.cages.find(c => c.captive && !c.open); g.keeper.place(c.pos.x + 1.3, c.pos.z); for (let i = 0; i < 4 && !c.open; i++) { g.keeper.ringCd = 0; g.keeper.ring(false); g.simulate(.6); } return { open: c.open, families: g.state.stats.families }; });
ok(fam.open && fam.families === 1, 'a family freed from the hold', JSON.stringify(fam));
await quiet();
// Barnacle: 40% normally, 150% while its anchor is stuck.
const anchor = await ev(() => { const g = window.__game, h = g.hive; g.keeper.place(h.pos.x, h.pos.z + h.radius + 1.2); h.awake = true; const d = g.keeper.pos; const a = h.hp; g.keeper.ringCd = 0; g.keeper.ring(false); g.simulate(.1); const loose = a - h.hp; h['land']({ move: 'anchorThrow', target: d.clone().setX(d.x + 4), dir: 0 }); const b = h.hp; g.keeper.ringCd = 0; g.keeper.ring(false); g.simulate(.1); return { loose, stuck: b - h.hp, stuckT: h.stuckT }; });
ok(anchor.stuck > anchor.loose * 3, 'Captain Barnacle is weak only while its anchor is stuck', JSON.stringify(anchor));
// The chain sweep: a hop's moment of invulnerability clears it.
const sweep = await ev(() => { const g = window.__game, h = g.hive; h.stuckT = 0; g.keeper.place(h.pos.x, h.pos.z + h.radius + 3); const hp = g.state.hero.hp; g.keeper.hop(0, 1); h['land']({ move: 'chainSweep', target: g.keeper.pos.clone(), dir: 0 }); const hopped = hp - g.state.hero.hp; g.simulate(1.2); g.keeper.mercy = 0; g.keeper.place(h.pos.x, h.pos.z + h.radius + 3); const hp2 = g.state.hero.hp; h['land']({ move: 'chainSweep', target: g.keeper.pos.clone(), dir: 0 }); return { hopped, stood: hp2 - g.state.hero.hp }; });
ok(sweep.hopped === 0 && sweep.stood > 0, 'hopping clears the chain sweep; standing still does not', JSON.stringify(sweep));
await shot('barnacle');
await ev(() => { const g = window.__game, h = g.hive; h.stuckT = 9; h.hp = 1; g.keeper.place(h.pos.x, h.pos.z + h.radius + 1.2); g.keeper.ringCd = 0; g.keeper.ring(false); g.simulate(.5); });
await page.waitForTimeout(2200); await quiet();
s = await st();
const sloop = await ev(() => window.__game.state.isles.sloop);
ok(sloop.freed && sloop.captives.every(Boolean), 'the Scout Sloop is free, and every family with it', JSON.stringify(sloop.captives));
await ev(() => { const g = window.__game; g.keeper.place(-4.4, 9.6); g.buildInteractables(); g.interactables.find(i => i.id === 'rope').act(); }); await page.waitForTimeout(900); await quiet();
s = await st();
ok(s.mode === 'deck', 'over the plank and back aboard Bao', s.mode);

// ---------------------------------------------------------- the Warship
await ev(() => window.__cloud.setState('warship')); await quiet(); await strong();
await ev(() => window.__game.boardNow(['mina', 'ria'])); await page.waitForTimeout(900); await quiet();
await clearGuards(); await quiet();
const wyrm = await ev(() => { const g = window.__game, h = g.hive; h.awake = true; g.keeper.place(h.pos.x + 1.8, h.pos.z + 1.8); const hp = h.hp; g.keeper.ringCd = 0; g.keeper.ring(false); g.simulate(.1); const coiled = hp - h.hp; for (const k of h.knots) for (let i = 0; i < 2; i++) { const T = g.keeper.pos.constructor, d = new T(k.pos.x - h.pos.x, 0, k.pos.z - h.pos.z).normalize(); g.keeper.place(k.pos.x + d.x * .9, k.pos.z + d.z * .9); g.keeper.actor.facing = Math.atan2(k.pos.x - g.keeper.pos.x, k.pos.z - g.keeper.pos.z); h.hit(g.keeper.pos, g.keeper.actor.facing, 2, 10, false); } const dizzy = h.dizzyT; const hp2 = h.hp; g.keeper.place(h.pos.x, h.pos.z + h.radius + 1.3); g.keeper.ringCd = 0; g.keeper.ring(false); g.simulate(.1); return { coiled, dizzy, hit: hp2 - h.hp }; });
ok(wyrm.coiled === 0 && wyrm.dizzy > 0 && wyrm.hit > 0, 'the Coilwyrm: untouchable coiled; three knots drop it, dizzy and open', JSON.stringify(wyrm));
const mina = await ev(() => { const g = window.__game; g.hive.dizzyT = 0; g.hive.awake = false; g.keeper.place(0, 12); g.state.hero.hp = 50; g.simulate(11); return g.state.hero.hp; });
ok(mina > 50, 'Mina heals the Captain on the deck', `hp ${mina}`);
await shot('coilwyrm');

// ---------------------------------------------------------- the Grey Star
await ev(() => window.__cloud.setState('star')); await quiet(); await strong();
await ev(() => window.__game.boardNow(['pip', 'tam'])); await page.waitForTimeout(900); await quiet();
await clearGuards(); await quiet();
const list = await ev(() => { const g = window.__game, x = g.keeper.pos.x; g.keeper.place(0, 3); g.simulate(2); return { moved: g.keeper.pos.x, tilt: g.isle.tilt }; });
ok(Math.abs(list.moved) > .8 && list.tilt !== 0, 'the Grey Star’s deck lists and slides the Captain toward a rail', JSON.stringify(list));
await shot('greystar');
await ev(() => { const g = window.__game, h = g.hive; h.songWindow = 5; h.hp = 1; h.awake = true; g.keeper.place(h.pos.x, h.pos.z + h.radius + 1.2); g.keeper.ringCd = 0; g.keeper.ring(false); g.simulate(.5); });
await page.waitForTimeout(3200); await quiet();
s = await st();
const ended = await ev(() => window.__game.state.story.ended);
ok(ended && (s.items.seed_golden ?? 0) >= 1, 'the Grey Heart shatters: the story ends with the Golden Seed');
await page.waitForSelector('.screen.ending', { timeout: 12000 }).catch(() => {});
ok(await page.isVisible('.screen.ending'), 'the ending card shows');
await shot('ending');

await page.close();
try { await probeBudgets(browser, URL); } catch (error) { failures++; console.error(error); }

console.log(`\n${failures ? `${failures} FAILED` : 'ALL PASSED'}; page errors: ${errors.length ? errors.join(' | ') : 'none'}`);
await browser.close();
process.exit(failures || errors.length ? 1 : 0);
