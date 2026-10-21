// tests/kitchen/kitchen-time-lock.browser.js
// The time of day follows the real session in live mode: the buttons are disabled with a tooltip; the sample shop keeps them.
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
const live = { project: { root: '/fixture/time', name: 'Time fixture', setup: 'built', pieces }, session: { id: 'time', startedAt: 1, pie: null },
  phase: 'open', skills: [], recent: [], active: [], pies: [], cursor: 1 };
const IDS = ['#bDawn', '#bDay', '#bNight', '#bLate'];

async function main() {
  const server = http.createServer((request, response) => {
    if (request.url === '/state') { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(live)); }
    else if (request.url === '/') { response.setHeader('Content-Type', 'text/html'); response.end(html); }
    else { response.writeHead(404); response.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  live.port = server.address().port;
  const browser = await chromium.launch({ executablePath: chrome, headless: true, args: ['--enable-unsafe-swiftshader', '--disable-dev-shm-usage'] });
  const errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.on('pageerror', error => errors.push(error.stack || String(error)));
    await page.goto(`http://127.0.0.1:${live.port}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__kitchenScene?.mode === 'live' && window.__kitchenScene.lighting.time === 'day', null, { timeout: 45000 });
    for (const id of IDS) {
      const button = await page.$eval(id, el => ({ disabled: el.disabled, title: el.title, label: el.getAttribute('aria-label') }));
      assert.equal(button.disabled, true); assert.equal(button.title, 'Time follows the real session'); assert.match(button.label, /Time follows the real session$/);
    }
    assert.equal(await page.$eval('#todGroup', el => el.title), 'Time follows the real session');
    for (const id of ['#bNight', '#bLate', '#bDawn']) {
      await page.click(id, { force: true });
      await page.$eval(id, el => el.onclick && el.onclick());
    }
    assert.equal(await page.evaluate(() => window.__kitchenScene.lighting.time), 'day', 'clicks never change the time of a live session');
    if (SHOTS) await page.screenshot({ path: `${SHOTS}-live.png`, clip: { x: 980, y: 0, width: 300, height: 80 } });
    console.log('PASS time lock: live mode disables the time buttons with the tooltip and ignores clicks');

    await page.evaluate(() => window.__kitchenFeed({ ...window.kitchenLive.snapshot, project: { ...window.kitchenLive.snapshot.project, setup: 'none' }, cursor: 99 }));
    await page.waitForFunction(() => window.__kitchenScene.mode === 'demo');
    assert.deepEqual(await page.$$eval(IDS.join(','), els => els.map(el => [el.disabled, el.title])),
      [[false, 'Before opening'], [false, 'Open'], [false, 'Evening'], [false, 'After hours']]);
    assert.equal(await page.$eval('#todGroup', el => el.title), '');
    await page.click('#bNight');
    assert.equal(await page.evaluate(() => window.__kitchenScene.lighting.time), 'night');
    console.log('PASS time lock: the sample shop keeps working time buttons with their own labels');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close(); server.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
