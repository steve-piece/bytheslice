// tests/kitchen/kitchen-order-line.browser.js
// Exercises four snapshot-driven order-line cases in isolated Chrome with actual rendered scene observations.
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const html = fs.readFileSync(path.join(__dirname, '../../skills/open-kitchen/kitchen.html'));
const chrome = process.env.CHROME_EXECUTABLE || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const pieceNames = ['walls', 'menu', 'tickets', 'case', 'safe', 'oven', 'alarm', 'locks'];
const pieces = Object.fromEntries(pieceNames.map(name => [name, { present: true, applicable: true, source: 'fixture' }]));
const order = n => ({ id: `pie-${n}`, pie: n, title: `Delivery ${n}`, status: 'open', single: false,
  slices: [1, 2].map(i => ({ id: `slice-${n}.${i}`, number: `${n}.${i}`, title: `Work ${i}`, status: 'open' })) });
let state = { project: { root: '/fixture/order-line', name: 'Order line fixture', setup: 'built', pieces },
  session: { id: 'orders', startedAt: 1000, pie: null }, phase: 'open', active: [], skills: [], recent: [],
  pies: [order(4), order(7), order(5)], cursor: 1 };
let scenario = 'initialization', page;
const errors = [];
const inspect = () => page.evaluate(() => window.__kitchenScene.orders);
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
    page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.on('pageerror', error => errors.push(error.stack || String(error)));
    await page.goto(`http://127.0.0.1:${state.port}/#fast`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__kitchenScene?.orders.ready && !!document.querySelector('#stage canvas'), null, { timeout: 45000 });
    if (process.argv.includes('--smoke')) {
      assert.deepEqual(errors, []);
      console.log('PASS order-line readiness: canvas and snapshot queue hooks initialized');
      return;
    }
    async function feed(change) {
      state = { ...state, ...change, cursor: state.cursor + 1 };
      await page.evaluate(next => window.__kitchenFeed(next), state);
    }
    async function screenshot(name) {
      if (!process.argv.includes('--screenshots')) return;
      const dir = path.join(__dirname, '../../docs/plans/evidence/slice46'); fs.mkdirSync(dir, { recursive: true });
      await page.screenshot({ path: path.join(dir, `order-line-${name}-${Date.now()}.png`) });
    }

    scenario = 'three open pies form a line in plan order';
    let view = await inspect();
    assert.deepEqual(view.queue.map(customer => customer.label), ['Pie 4', 'Pie 7', 'Pie 5']);
    assert.equal(view.queue.length, 3); assert.ok(view.queue.every(customer => !customer.hidden));
    assert.deepEqual(view.tickets.map(ticket => ticket.label), ['Pie 4', 'Pie 7', 'Pie 5']);
    assert.equal(await page.evaluate(() => window.__kitchenScene.demoCustomers), 0);
    await screenshot('three-pies');
    console.log('PASS order-line 1: three open pies create three customers in plan order');

    scenario = 'second active pie swaps to the window with the gold ring';
    const previous = view.queue[1].position;
    await feed({ active: [{ aid: 'cook', sid: 'orders', type: 'bytheslice:implementer', label: 'P7 S7.1 build', pie: 7, slice: '7.1', startedAt: 1100 }] });
    view = await inspect();
    assert.deepEqual(view.queue.map(customer => customer.label), ['Pie 7', 'Pie 4', 'Pie 5']);
    assert.equal(view.queue[0].mode, 'walk');
    assert.ok(view.queue[0].path.length >= 2, 'active customer walks the existing sidewalk rush route');
    assert.ok(Math.hypot(view.queue[0].position[0] - previous[0], view.queue[0].position[1] - previous[1]) < .5, 'customer stays at its starting spot when swapped');
    assert.equal(view.ring.visible, true); assert.equal(view.queue[0].tagClass, 'tag active');
    const during = view.queue[0].position;
    await page.waitForTimeout(150);
    view = await inspect();
    assert.notDeepEqual(view.queue[0].position, during, 'render loop advances the actor');
    await page.waitForFunction(() => {
      const line = window.__kitchenScene.orders, customer = line.queue[0];
      return Math.hypot(customer.position[0] - customer.target[0], customer.position[1] - customer.target[1]) < .4;
    }, null, { timeout: 20000 });
    await feed({});
    view = await inspect();
    assert.equal(view.events.filter(event => event.type === 'chime' && event.key === 'pie-7').length, 1);
    assert.equal(view.events.filter(event => event.type === 'new-order' && event.key === 'pie-7').length, 1);
    assert.equal(view.events.filter(event => event.type === 'swap').length, 1);
    await screenshot('active-swap');
    console.log('PASS order-line 2: second active pie animates to the window with ring and one order announcement');

    scenario = 'later pie joins the back with its plain planned ticket';
    await feed({ pies: [...state.pies, order(9)] });
    view = await inspect();
    assert.deepEqual(view.queue.map(customer => customer.label), ['Pie 7', 'Pie 4', 'Pie 5', 'Pie 9']);
    assert.equal(view.queue.at(-1).tag, 'Added to the plan: Pie 9');
    assert.equal(view.queue.at(-1).tagClass, 'tag');
    assert.equal(view.queue.at(-1).added, true); assert.equal(view.queue.at(-1).mode, 'walk');
    assert.equal(view.events.filter(event => event.type === 'chime').length, 1);
    await feed({}); assert.equal((await inspect()).queue.length, 4);
    await screenshot('planned-back');
    console.log('PASS order-line 3: a later pie joins the back with a plain Added to the plan ticket');

    scenario = 'zero open pies leaves waiting crew and the exact all-served note';
    await feed({ active: [], session: { ...state.session, pie: null }, pies: state.pies.map(pie => ({ ...pie, status: 'done', slices: pie.slices.map(slice => ({ ...slice, status: 'done' })) })) });
    view = await inspect();
    assert.equal(view.queue.length, 0); assert.equal(view.active, null); assert.equal(view.ring.visible, false);
    assert.equal(view.tickets.length, 0); assert.equal(view.servedCount, 4); assert.equal(view.shelfCount, 4);
    assert.equal(view.allServedNote, 'All orders served. Close this window, or run `/special-order` to add a pie or a slice.');
    assert.equal(await page.locator('#tkTitle').textContent(), 'All orders served');
    await page.waitForTimeout(9000);
    assert.equal((await inspect()).allServedNote, view.allServedNote, 'all-served guidance survives ordinary callout expiration');
    await screenshot('all-served');
    assert.deepEqual(errors, []);
    console.log('PASS order-line 4: zero open pies shows all-served guidance, empty rail and completed pie shelf');
  } catch (error) {
    let scene;
    try { scene = await inspect(); } catch (inspectionError) { scene = inspectionError.stack || String(inspectionError); }
    console.error(`SCENE ${JSON.stringify(scene)}\nPAGE ERRORS ${JSON.stringify(errors)}`);
    throw error;
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(`FAIL scenario: ${scenario}\n${error.stack || String(error)}`); process.exitCode = 1; });
