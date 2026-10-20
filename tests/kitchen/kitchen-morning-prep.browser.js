// tests/kitchen/kitchen-morning-prep.browser.js
// Exercises dawn, first-cook opening, and after-hours sign and lighting in isolated system Chrome.
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const html = fs.readFileSync(path.join(__dirname, '../../skills/open-kitchen/kitchen.html'));
const chrome = process.env.CHROME_EXECUTABLE || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const shopStatus = { prep: { done: 3, total: 3 }, pies: { done: 2, total: 5, open: 3 }, slices: { done: 7, total: 15, open: 8 } };
const pieceNames = ['walls', 'menu', 'tickets', 'case', 'safe', 'oven', 'alarm', 'locks'];
const pieces = Object.fromEntries(pieceNames.map(name => [name, { present: true, applicable: true, source: 'fixture' }]));
const actor = type => ({ aid: type, sid: 'morning', type: `bytheslice:${type}`, label: `P4 S4.5 ${type}`, pie: 4, slice: '4.5', startedAt: 1100 });
let state = { project: { root: '/fixture/morning-prep', name: 'Morning prep fixture', setup: 'built', pieces },
  session: { id: 'morning', startedAt: 1000, pie: 4 }, phase: 'dawn', active: [], skills: [], recent: [], pies: [], shopStatus, cursor: 1 };
let scenario = 'initialization';

async function main() {
  const server = http.createServer((request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    if (request.url === '/state') { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(state)); }
    else if (request.url === '/') { response.setHeader('Content-Type', 'text/html'); response.end(html); }
    else { response.writeHead(404); response.end(); }
  });
  let browser;
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  state.port = server.address().port;
  try {
    // chromium.launch creates an isolated temporary profile; no personal browser state is opened.
    browser = await chromium.launch({ executablePath: chrome, headless: true,
      args: ['--enable-unsafe-swiftshader', '--disable-dev-shm-usage'] });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.stack || String(error)));
    await page.goto(`http://127.0.0.1:${state.port}/#fast`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__kitchenScene?.phase === 'dawn' && !!document.querySelector('#stage canvas'), null, { timeout: 45000 });
    if (process.argv.includes('--smoke')) {
      assert.deepEqual(errors, []);
      console.log('PASS morning-prep readiness: scene canvas and phase/sign/lighting hooks initialized');
      return;
    }
    const inspect = () => page.evaluate(() => ({ phase: window.__kitchenScene.phase, sign: window.__kitchenScene.sign,
      lighting: window.__kitchenScene.lighting, status: window.__kitchenScene.statusBoard,
      review: window.__kitchenScene.review, actors: window.__kitchenScene.actors,
      pies: window.__kitchenScene.demoPies, customers: window.__kitchenScene.demoCustomers }));
    async function feed(change) {
      state = { ...state, ...change, cursor: state.cursor + 1 };
      await page.evaluate(next => window.__kitchenFeed(next), state);
    }
    async function screenshot(name) {
      if (!process.argv.includes('--screenshots')) return;
      const dir = path.join(__dirname, '../../output/playwright'); fs.mkdirSync(dir, { recursive: true });
      await page.screenshot({ path: path.join(dir, `morning-prep-${name}-${Date.now()}.png`) });
    }

    scenario = 'dawn snapshot leaves sign off during prep';
    await feed({ active: ['rules-loader', 'checklist-curator', 'discovery'].map(actor),
      skills: [{ name: 'bytheslice:sell-pie', sid: 'morning', status: 'active', startedAt: 1050 }] });
    await page.waitForFunction(() => window.__kitchenScene.sign.glow < .01 && window.__kitchenScene.lighting.dawn > .95);
    let view = await inspect();
    assert.equal(view.phase, 'dawn'); assert.equal(view.sign.on, false); assert.equal(view.lighting.time, 'dawn');
    assert.equal(view.review.active, false); assert.ok(view.review.members.every(member => member.hidden));
    assert.deepEqual(view.status.counts, shopStatus);
    assert.match(view.status.card, /5 total, 2 completed \/ 3 open/);
    assert.match(view.status.card, /15 total, 7 completed \/ 8 open/);
    assert.deepEqual(view.actors.filter(item => item.active).map(item => item.name).sort(), ['Bea', 'Ezra', 'Pip']);
    assert.equal(view.pies, 0); assert.equal(view.customers, 0);
    await screenshot('dawn');
    console.log('PASS dawn: sign off, dawn light, actual prep crew and hook-matching status counts');

    scenario = 'implementer agentOn turns sign on with opening flicker';
    await feed({ phase: 'open', active: [actor('implementer')] });
    view = await inspect();
    assert.equal(view.sign.on, true); assert.ok(view.sign.flicker < .91, 'opening starts the existing flicker');
    await page.waitForFunction(() => window.__kitchenScene.sign.glow > 1.8 && window.__kitchenScene.lighting.dawn < .05, null, { timeout: 15000 });
    view = await inspect();
    assert.equal(view.phase, 'open'); assert.equal(view.lighting.time, 'day');
    assert.ok(view.actors.some(item => item.active && item.name === 'Ren' && !item.hidden));
    assert.ok(view.review.members.every(member => member.hidden));
    await screenshot('open');
    console.log('PASS first cook: agentOn opens the sign with flicker and day lighting');

    scenario = 'after-hours snapshot switches sign off and dims lights';
    await feed({ phase: 'after-hours', active: [], skills: [] });
    await page.waitForFunction(() => !window.__kitchenScene.sign.on && window.__kitchenScene.sign.glow < .01 &&
      window.__kitchenScene.lighting.night > .95 && window.__kitchenScene.lighting.sun < .7, null, { timeout: 15000 });
    view = await inspect();
    assert.equal(view.phase, 'after-hours'); assert.equal(view.lighting.time, 'night');
    assert.equal(view.review.active, false); assert.equal(view.review.ledgerVisible, false);
    assert.ok(view.review.members.every(member => member.hidden));
    assert.equal(view.pies, 0); assert.equal(view.customers, 0);
    assert.deepEqual(errors, []);
    await screenshot('after-hours');
    console.log('PASS after-hours: sign off, lights dimmed, no invented review or demo work');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(`FAIL scenario: ${scenario}\n${error.stack || String(error)}`); process.exitCode = 1; });
