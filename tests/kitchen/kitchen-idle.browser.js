// tests/kitchen/kitchen-idle.browser.js
// Kitchen idle mode from the lobby (?idle=1&lobby=<port>): the notice, working time buttons, no customers, the Lobby link, and the re-lock.
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
const order = n => ({ id: `pie-${n}`, pie: n, title: `Delivery ${n}`, status: 'open', single: false,
  slices: [1, 2].map(i => ({ id: `slice-${n}.${i}`, number: `${n}.${i}`, title: `Work ${i}`, status: 'open' })) });
const quiet = { project: { root: '/fixture/idle', name: 'Idle fixture', setup: 'built', pieces }, session: { id: 'idle', startedAt: 1, pie: null },
  phase: 'open', skills: [], recent: [], active: [], pies: [order(2), order(3)], cursor: 1 };
const working = () => ({ ...quiet, cursor: 2, active: [{ aid: 'agent-1', type: 'bytheslice:implementer', label: 'P2 S2.1 build: Work 1',
  pie: 2, slice: '2.1', startedAt: Date.now(), sid: 'idle' }] });
const IDS = ['#bDawn', '#bDay', '#bNight', '#bLate'];
const LOCK = 'Time follows the real session';
let state = quiet;

async function main() {
  const server = http.createServer((request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    // Like mcp/kitchen-server.js: the page alone accepts a query string.
    if (request.url === '/state') { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ ...state, port: server.address().port })); }
    else if (request.url === '/' || request.url.startsWith('/?')) { response.setHeader('Content-Type', 'text/html'); response.end(html); }
    else { response.writeHead(404); response.end(); }
  });
  const lobby = http.createServer((request, response) => { response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><title>Lobby</title><p>Fake lobby</p>'); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  await new Promise(resolve => lobby.listen(0, '127.0.0.1', resolve));
  const port = server.address().port, lobbyPort = lobby.address().port;
  const at = query => `http://127.0.0.1:${port}/${query}`;
  const browser = await chromium.launch({ executablePath: chrome, headless: true, args: ['--enable-unsafe-swiftshader', '--disable-dev-shm-usage'] });
  const errors = [];
  const open = async query => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.on('pageerror', error => errors.push(error.stack || String(error)));
    await page.goto(at(query), { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__kitchenScene?.mode === 'live', null, { timeout: 45000 });
    return page;
  };
  const buttons = page => page.$$eval(IDS.join(','), els => els.map(el => ({ disabled: el.disabled, title: el.title })));
  try {
    // 1. Idle: the notice, no customers, working time buttons, the Lobby link.
    let page = await open(`?idle=1&lobby=${lobbyPort}`);
    await page.waitForFunction(() => window.__kitchenScene.idle === true, null, { timeout: 10000 });
    const note = await page.$eval('#idleNote', el => ({ hidden: el.hidden, text: el.textContent, role: el.getAttribute('role'), shown: el.getBoundingClientRect().height > 0 }));
    assert.deepEqual(note, { hidden: false, text: 'Nothing is in progress in this project', role: 'status', shown: true });
    await page.waitForTimeout(1500);
    const orders = await page.evaluate(() => window.__kitchenScene.orders);
    assert.equal(orders.queue.length, 0, 'no customers line up while idle'); assert.equal(orders.ready, false);
    assert.equal(await page.evaluate(() => window.__kitchenScene.demoCustomers), 0);
    assert.ok(await page.evaluate(() => window.__kitchenScene.traffic.people.length > 0), 'townspeople are still out and about');
    if (SHOTS) await page.screenshot({ path: `${SHOTS}-kitchen-idle.png` });
    console.log('PASS idle notice: "Nothing is in progress in this project" shows and no customers spawn for the open pies');

    assert.deepEqual(await buttons(page), [{ disabled: false, title: 'Before opening' }, { disabled: false, title: 'Open' },
      { disabled: false, title: 'Evening' }, { disabled: false, title: 'After hours' }]);
    assert.equal(await page.$eval('#todGroup', el => el.title), '');
    await page.click('#bNight');
    assert.equal(await page.evaluate(() => window.__kitchenScene.lighting.time), 'night');
    await page.click('#bDay');
    assert.equal(await page.evaluate(() => window.__kitchenScene.lighting.time), 'day');
    await page.click('#bLate');
    assert.equal(await page.evaluate(() => window.__kitchenScene.lighting.time), 'late');
    console.log('PASS enabled time buttons: #bDawn #bDay #bNight #bLate are enabled while idle and change the time of day');

    const link = await page.$eval('#bLobby', el => ({ tag: el.tagName, hidden: el.hidden, href: el.getAttribute('href'), label: el.getAttribute('aria-label'),
      box: (({ left, right, top, bottom }) => ({ left, right, top, bottom }))(el.getBoundingClientRect()),
      top: [...document.querySelectorAll('.hud.top > *')].map(item => item.getBoundingClientRect()).map(({ left, right, top, bottom }) => ({ left, right, top, bottom })) }));
    assert.equal(link.tag, 'A'); assert.equal(link.hidden, false);
    assert.equal(link.href, `http://127.0.0.1:${lobbyPort}/`); assert.equal(link.label, 'Back to the lobby');
    assert.ok(link.box.right <= 1280 && link.box.top >= 0, 'the link sits on screen');
    assert.ok(link.top.every(item => item.right <= link.box.left || item.bottom <= link.box.top || item.top >= link.box.bottom), 'the link overlaps nothing in the top bar');
    console.log(`PASS Lobby link: #bLobby shows in the top right and points at http://127.0.0.1:${lobbyPort}/`);

    // 2. An active snapshot ends idle: the notice goes, the clock locks and follows the phase, customers line up.
    state = working();
    await page.waitForFunction(() => window.__kitchenScene.idle === false, null, { timeout: 8000 });
    assert.equal(await page.$eval('#idleNote', el => el.hidden), true);
    assert.deepEqual((await buttons(page)).map(button => [button.disabled, button.title]), IDS.map(() => [true, LOCK]));
    await page.waitForFunction(() => window.__kitchenScene.lighting.time === 'day', null, { timeout: 5000 });
    await page.waitForFunction(() => window.__kitchenScene.orders.queue.length === 2, null, { timeout: 5000 });
    console.log('PASS re-lock: an active snapshot drops idle, hides the notice, locks time back to the session and lines up customers');

    await page.click('#bLobby');
    await page.waitForURL(`http://127.0.0.1:${lobbyPort}/`, { timeout: 5000 });
    console.log('PASS Lobby link: clicking it returns to the lobby');
    await page.close();

    // 3. Without idle, live mode is unchanged: locked time, no notice; the link still shows with a lobby port.
    state = quiet;
    page = await open(`?lobby=${lobbyPort}`);
    await page.waitForFunction(() => window.__kitchenScene.orders.ready, null, { timeout: 10000 });
    assert.equal(await page.evaluate(() => window.__kitchenScene.idle), false);
    assert.equal(await page.$eval('#idleNote', el => el.hidden), true);
    assert.deepEqual((await buttons(page)).map(button => button.disabled), [true, true, true, true]);
    assert.equal(await page.$eval('#bLobby', el => el.hidden), false);
    await page.close();
    // idle=1 when work is already running opens the live kitchen as usual.
    state = working();
    page = await open('?idle=1');
    await page.waitForFunction(() => window.__kitchenScene.orders.ready, null, { timeout: 10000 });
    assert.equal(await page.evaluate(() => window.__kitchenScene.idle), false);
    assert.deepEqual((await buttons(page)).map(button => button.disabled), [true, true, true, true]);
    assert.equal(await page.$eval('#bLobby', el => el.hidden), true, 'no lobby port, no link');
    await page.close();
    console.log('PASS live mode: without idle (or with work running) time stays locked and no notice shows');

    // 4. Only a valid port 1 to 65535 shows the link.
    state = quiet;
    for (const value of ['0', '65536', 'abc', '04466', '4466x', '-1']) {
      page = await open(`?lobby=${encodeURIComponent(value)}`);
      assert.equal(await page.$eval('#bLobby', el => el.hidden), true, `lobby=${value} hides the link`);
      await page.close();
    }
    console.log('PASS Lobby link: invalid lobby values (0, 65536, abc, 04466, 4466x, -1) keep it hidden');

    assert.deepEqual(errors, []);
    console.log('PASS no page errors');
  } finally {
    await browser.close(); server.close(); lobby.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
