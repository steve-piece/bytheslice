// tests/kitchen/kitchen-town-crew.browser.js
// Off-duty crew live in town in live mode, sprint to their station when their agent starts, and head back out when done.
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const html = fs.readFileSync(path.join(__dirname, '../../skills/open-kitchen/kitchen.html'));
const chrome = process.env.CHROME_EXECUTABLE || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SHOTS = (process.argv.find(value => value.startsWith('--shots=')) || '').slice(8);
const pieces = Object.fromEntries(['walls', 'menu', 'tickets', 'case', 'safe', 'oven', 'alarm', 'locks'].map(name => [name, { present: true, applicable: true }]));
const state = { project: { root: '/fixture/town', name: 'Town fixture', setup: 'built', pieces }, session: { id: 'town', startedAt: 1, pie: 5 },
  phase: 'open', skills: [], recent: [], active: [], cursor: 1,
  pies: [{ id: 'pie-5', pie: 5, title: 'The Pass', status: 'active', slices: [{ id: 's', number: '5.2', title: 'Ledger', status: 'active' }] }] };
const ren = { aid: 'ren', sid: 'town', type: 'bytheslice:implementer', label: 'P5 S5.2 build: ledger', pie: 5, slice: '5.2', startedAt: 10 };

async function main() {
  const server = http.createServer((request, response) => {
    if (request.url === '/state') { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(state)); }
    else if (request.url === '/') { response.setHeader('Content-Type', 'text/html'); response.end(html); }
    else { response.writeHead(404); response.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  state.port = server.address().port;
  const browser = await chromium.launch({ executablePath: chrome, headless: true, args: ['--enable-unsafe-swiftshader', '--disable-dev-shm-usage'] });
  const errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.on('pageerror', error => errors.push(error.stack || String(error)));
    await page.goto(`http://127.0.0.1:${state.port}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__kitchenScene?.mode === 'live' && window.__kitchenScene.phase === 'open', null, { timeout: 45000 });
    const feed = async change => { Object.assign(state, change, { cursor: state.cursor + 1 }); await page.evaluate(next => window.__kitchenFeed(next), state); };
    // advance the world with the frame loop paused until a condition holds (or the time runs out)
    const run = (seconds, until) => page.evaluate(async ({ seconds, until }) => {
      const scene = window.__kitchenScene, test = new Function('scene', `return (${until})`); scene.pause(true);
      let t = 0; for (; t < seconds && !test(scene); t += .1) { scene.step(.1); for (let k = 0; k < 4; k++) await null; }
      return Math.round(t);
    }, { seconds, until });
    const crew = () => page.evaluate(() => Object.fromEntries(window.__kitchenScene.townCrew.map(member => [member.name, member])));

    await run(60, `scene.townCrew.every(m => m.inTown && !m.hidden && !m.inKitchen)`);
    let view = await crew();
    for (const member of Object.values(view)) { assert.equal(member.inTown, true, `${member.name} is off duty in town`); assert.equal(member.inKitchen, false); }
    const base = await page.evaluate(() => window.__kitchenScene.baseCrew);
    assert.ok(base.every(member => member.ambient && !member.hidden), 'the base crew stays on duty in the kitchen');
    if (SHOTS) { await page.evaluate(() => window.__kitchenScene.look(-6, 8, 1.0)); await page.waitForTimeout(500); await page.screenshot({ path: `${SHOTS}-town.png` }); }
    console.log(`PASS town crew: all ${Object.keys(view).length} off-duty crew leave their flats and live in town while the base crew stays on duty`);

    await feed({ active: [ren] });
    view = await crew();
    assert.equal(view.Ren.inTown, false); assert.ok(view.Ren.speed > 3, 'Ren sprints'); assert.equal(view.Ren.saying, 'On my way!');
    const took = await run(150, `scene.actors.some(e => e.name === 'Ren' && e.active && e.mode === 'work' && Math.hypot(e.position[0] - e.station[0], e.position[1] - e.station[1]) < .1)`);
    const actor = (await page.evaluate(() => window.__kitchenScene.actors)).find(entry => entry.name === 'Ren');
    assert.equal(actor.mode, 'work', `Ren reached his station (took ${took}s)`);
    assert.equal(actor.tag, 'Ren · Building 5.2');
    console.log(`PASS town crew: Ren sprints from town to his station when his agent starts (${took}s simulated, through the crosswalks)`);

    await feed({ active: [], recent: [{ aid: 'ren', sid: 'town', ok: true }] });
    await page.evaluate(() => window.__kitchenScene.pause(false));
    await page.waitForFunction(() => window.__kitchenScene.townCrew.find(m => m.name === 'Ren').inTown, null, { timeout: 30000 });
    await run(60, `!scene.townCrew.find(m => m.name === 'Ren').inKitchen`);
    view = await crew(); assert.equal(view.Ren.inTown, true); assert.equal(view.Ren.inKitchen, false);
    console.log('PASS town crew: after finishing and a short idle, Ren walks back out into town');

    await feed({ phase: 'after-hours' });
    await run(240, `scene.townCrew.every(m => m.hidden)`);
    view = await crew();
    assert.ok(Object.values(view).every(member => member.hidden), 'at night the crew go home');
    console.log('PASS town crew: at night every off-duty crew member goes home');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close(); server.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
