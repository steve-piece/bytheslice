// tests/kitchen/kitchen-cast.browser.js
// Runs the real cast fixture harness in system Chrome against the approved Three.js kitchen scene.
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const html = fs.readFileSync(path.join(__dirname, '../../skills/open-kitchen/kitchen.html'));
const chrome = process.env.CHROME_EXECUTABLE || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const fixture = (active = [], extra = {}) => ({ project: { root: '/fixture/project', name: 'Fixture project', setup: 'built' },
  active, skills: [], recent: [], pies: [], cursor: 1, ...extra });
let state = fixture();

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
    browser = await chromium.launch({ executablePath: chrome, headless: true,
      args: ['--enable-unsafe-swiftshader', '--disable-dev-shm-usage'] });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${state.port}/#fast`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__kitchenScene && !!document.querySelector('#stage canvas'), null, { timeout: 45000 });
    if (process.argv.includes('--smoke')) {
      assert.deepEqual(errors, []);
      console.log('PASS scene readiness: approved kitchen canvas and cast hooks initialized');
      return;
    }
    async function feed(snapshot) {
      state = { ...snapshot, port: server.address().port };
      await page.evaluate(next => window.__kitchenFeed(next), state);
    }
    const implementer = { aid: 'cook', sid: 'fixture-session', type: 'bytheslice:implementer', label: 'P4 S4.3 build: Real Cast', startedAt: 100 };
    const pies = [{ id: 'pie-4', pie: 4, title: 'Live Kitchen', status: 'active', slices: [{ id: 'slice-4.3', number: '4.3', title: 'Real cast', status: 'active' }] }];
    await feed(fixture([implementer], { pies }));
    await page.waitForFunction(() => {
      const actor = window.__kitchenScene.actors.find(item => item.aid === 'cook');
      return actor && actor.name === 'Ren' && actor.mode === 'work' && !actor.hidden &&
        Math.hypot(actor.position[0] - actor.station[0], actor.position[1] - actor.station[1]) < .08 &&
        Math.hypot(actor.renderedPosition[0] - actor.station[0], actor.renderedPosition[1] - actor.station[1]) < .08;
    }, null, { timeout: 30000 });
    assert.equal(await page.evaluate(() => window.__kitchenScene.actors.find(item => item.aid === 'cook').task), implementer.label);
    console.log('PASS implementer is at its station after agentOn');

    await feed(fixture([], { pies, recent: [{ aid: 'cook', sid: 'fixture-session', ev: 'PostToolUse', ok: true }] }));
    const stopped = await page.evaluate(() => window.__kitchenScene.actors.find(item => item.aid === 'cook'));
    assert.equal(stopped.mode, 'idle'); assert.equal(stopped.active, false); assert.equal(stopped.hidden, false);
    assert.equal(stopped.task, 'Done');
    console.log('PASS implementer is idle after agentOff');

    await page.click('#bLog');
    const log = await page.$$eval('#shBody .lrow span', rows => rows.map(row => row.textContent));
    assert.deepEqual(log.slice(0, 2), ['Ren (line cook, builds code) finished building slice 4.3: real cast',
      'Ren (line cook, builds code) started building slice 4.3: real cast']);
    assert.equal(log.some(line => /: Done$/.test(line)), false);
    await page.click('#bLog');
    console.log('PASS log lines say who, their role, the step and the slice');

    await feed(fixture([], { project: { root: '/fixture/project', setup: 'none' } }));
    await page.waitForFunction(() => [...document.querySelectorAll('.co.note')].some(node => node.textContent ===
      'This is a sample shop. Ask your agent to run /setup-shop to open your own.'));
    const demo = await page.evaluate(() => ({ mode: window.__kitchenScene.mode, customers: window.__kitchenScene.demoCustomers }));
    assert.equal(demo.mode, 'demo'); assert.ok(demo.customers > 0);
    console.log('PASS setup none shows the sample shop note');

    await feed(fixture([implementer]));
    await page.waitForTimeout(2500);
    const live = await page.evaluate(() => ({ mode: window.__kitchenScene.mode, customers: window.__kitchenScene.demoCustomers,
      pies: window.__kitchenScene.demoPies, chef: window.__kitchenScene.chef }));
    assert.equal(live.mode, 'live'); assert.equal(live.customers, 0); assert.equal(live.pies, 0);
    assert.equal(live.chef.name, 'Chef Nico'); assert.equal(live.chef.hidden, false);
    assert.deepEqual(errors, []);
    console.log('PASS demo customers and pies are absent with a project');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
