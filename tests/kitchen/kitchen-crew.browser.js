// tests/kitchen/kitchen-crew.browser.js
// Exercises the live base crew: regulars on ambient duty while a pie is open, Ollie at the oven during verify, real agents in gold.
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const html = fs.readFileSync(process.env.KITCHEN_HTML || path.join(__dirname, '../../skills/open-kitchen/kitchen.html'));
const chrome = process.env.CHROME_EXECUTABLE || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SHOTS = (process.argv.find(value => value.startsWith('--shots=')) || '').slice(8);
const pieces = Object.fromEntries(['walls', 'menu', 'tickets', 'case', 'safe', 'oven', 'alarm', 'locks'].map(name => [name, { present: true, applicable: true }]));
const state = { project: { root: '/fixture/crew', name: 'Crew fixture', setup: 'built', pieces }, session: { id: 'crew', startedAt: 1000, pie: 5 },
  phase: 'open', skills: [], recent: [], active: [], cursor: 1,
  pies: [{ id: 'pie-5', pie: 5, title: 'The Pass', status: 'active', slices: [{ id: 's-5.2', number: '5.2', title: 'Ledger', status: 'active' }] }] };
const agent = (aid, type, label) => ({ aid, sid: 'crew', type: `bytheslice:${type}`, label, pie: 5, slice: '5.2', startedAt: 1100 });

async function main() {
  const server = http.createServer((request, response) => {
    response.setHeader('Cache-Control', 'no-store');
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
    await page.goto(`http://127.0.0.1:${state.port}/#fast`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__kitchenScene?.mode === 'live' && window.__kitchenScene.phase === 'open', null, { timeout: 45000 });
    const feed = async change => { Object.assign(state, change, { cursor: state.cursor + 1 }); await page.evaluate(next => window.__kitchenFeed(next), state); };
    const crew = () => page.evaluate(() => Object.fromEntries(window.__kitchenScene.baseCrew.map(member => [member.name, member])));
    const settle = predicate => page.waitForFunction(predicate, null, { timeout: 30000 });
    const shot = async name => { if (!SHOTS) return; await page.evaluate(() => window.__kitchenScene.look(.6, -.6, 2.1)); await page.waitForTimeout(500); await page.screenshot({ path: `${SHOTS}-${name}.png` }); };

    await settle(() => window.__kitchenScene.baseCrew.every(member => member.ambient && !member.hidden && member.mode === 'inspect'));
    let view = await crew();
    for (const name of ['Dom', 'Ollie', 'Sal']) { assert.equal(view[name].tag, null, `${name} carries no gold work tag`); assert.notEqual(view[name].mode, 'work'); }
    assert.equal(view.Ollie.task, 'Keeping the oven hot');
    assert.equal((await page.evaluate(() => window.__kitchenScene.oven)).on, false);
    assert.equal((await page.evaluate(() => window.__kitchenScene.chef)).hidden, false);
    await shot('open-idle');
    console.log('PASS base crew: Dom at the line, Ollie at the oven and Sal at the window are on ambient duty with no agent running');

    await feed({ active: [agent('verify', 'slice-verifier', 'P5 S5.2 verify: ledger')] });
    await settle(() => { const ollie = window.__kitchenScene.baseCrew.find(member => member.name === 'Ollie'); return ollie.mode === 'work' && /full suite/.test(ollie.task); });
    await settle(() => window.__kitchenScene.actors.some(entry => entry.name === 'Inez' && entry.active && Math.hypot(entry.position[0] - entry.station[0], entry.position[1] - entry.station[1]) < .1));
    const inez = (await page.evaluate(() => window.__kitchenScene.actors)).find(entry => entry.name === 'Inez');
    assert.equal(inez.tag, 'Inez · Verifying 5.2'); assert.equal(inez.mode, 'work');
    assert.deepEqual(inez.station.slice(0, 2), [2.2, -.75], 'the verifier works at the pass');
    assert.equal((await page.evaluate(() => window.__kitchenScene.oven)).on, true);
    view = await crew(); assert.equal(view.Ollie.tag, null, 'Ollie runs the oven as a regular, not as a running agent');
    await shot('verify');
    console.log('PASS step places: verify puts Inez at the pass in gold and Ollie at a lit oven');

    await feed({ active: [agent('one', 'implementer', 'P5 S5.2 build: ledger'), agent('two', 'implementer', 'P5 S5.2 build: ledger')] });
    await settle(() => { const dom = window.__kitchenScene.baseCrew.find(member => member.name === 'Dom'); return !dom.ambient && dom.tag === 'Dom · Building 5.2'; });
    await settle(() => window.__kitchenScene.baseCrew.find(member => member.name === 'Ollie').task === 'Keeping the oven hot');
    console.log('PASS real agents win: the second implementer takes Dom off ambient duty and gives him the gold tag');

    await feed({ active: [], recent: [{ aid: 'one', sid: 'crew', ok: true }, { aid: 'two', sid: 'crew', ok: true }] });
    await settle(() => window.__kitchenScene.baseCrew.every(member => member.ambient && !member.hidden && member.tag === null));
    assert.equal((await page.evaluate(() => window.__kitchenScene.oven)).on, false);
    console.log('PASS after the agents finish, the regulars go back to ambient duty');

    await feed({ phase: 'after-hours' });
    await settle(() => window.__kitchenScene.baseCrew.every(member => member.hidden && !member.ambient));
    console.log('PASS after hours: the regulars go home');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close(); server.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
