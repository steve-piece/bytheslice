// tests/kitchen/kitchen-orders.browser.js
// Exercises the live Orders sheet: measured slice progress with the current step.
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const html = fs.readFileSync(process.env.KITCHEN_HTML || path.join(__dirname, '../../skills/open-kitchen/kitchen.html'));
const chrome = process.env.CHROME_EXECUTABLE || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SHOTS = (process.argv.find(value => value.startsWith('--shots=')) || '').slice(8);
const pieceNames = ['walls', 'menu', 'tickets', 'case', 'safe', 'oven', 'alarm', 'locks'];
const pieces = Object.fromEntries(pieceNames.map(name => [name, { present: true, applicable: true, source: 'fixture' }]));
const slice = (number, title, status, extra = {}) => ({ id: `slice-${number}`, number, title, status, ...extra });
const state = { project: { root: '/fixture/orders', name: 'Orders fixture', setup: 'built', pieces },
  session: { id: 'orders', startedAt: 1000, pie: 5 }, phase: 'open', skills: [], recent: [], cursor: 1,
  active: [{ aid: 'cook', sid: 'orders', type: 'bytheslice:slice-verifier', label: 'P5 S5.2 verify: ledger', pie: 5, slice: '5.2', startedAt: 1100 }],
  pies: [
    { id: 'pie-3', pie: 3, title: 'Native Agent Registration', status: 'done', single: false, summary: 'register the roster as native plugin agents',
      commit: '8453de9', date: '2026-07-22', slices: [slice('3.1', 'Register agents', 'done', { summary: 'Agents array added to the manifest.', commit: '8453de9' }),
        slice('3.2', 'Normalize frontmatter', 'done', { summary: 'Every agent file moved to the supported field set.' })] },
    { id: 'pie-5', pie: 5, title: 'The Pass', status: 'active', single: false, summary: 'ship the Pass mod', date: '2026-10-20',
      slices: [slice('5.1', 'Pass pane and band', 'done', { commit: 'a212665..772170c' }),
        slice('5.2', 'Ledger and status tool', 'active', { step: 'verify', progress: { done: 2, total: 6 }, plan: 'stage_52_pass_ledger.md' }),
        slice('5.3', 'Pass checks as warnings', 'open', { progress: { done: 0, total: 5 } })] },
    { id: 'pie-6', pie: 6, title: 'Frontend Path', status: 'open', single: false, summary: 'make the frontend path verifiable',
      slices: [slice('6.1', 'Frontend build manifest', 'open'), slice('6.2', 'Frontend small fixes', 'open')] },
  ] };

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
    await page.goto(`http://127.0.0.1:${state.port}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__kitchenScene?.orders.ready && window.__kitchenScene.orders.active === 'pie-5', null, { timeout: 45000 });
    const feed = async change => { Object.assign(state, change, { cursor: state.cursor + 1 }); await page.evaluate(next => window.__kitchenFeed(next), state); };
    const shot = async name => { if (SHOTS) await page.screenshot({ path: `${SHOTS}-${name}.png` }); };

    await page.click('#bOrders');
    const chips = () => page.$$eval('#shBody .sh-now .slices li', items => items.map(item => ({ text: item.querySelector('.chip').textContent, note: item.querySelector('small')?.textContent || '' })));
    let rows = await chips();
    await shot('progress');
    assert.equal(rows[1].text, 'Verifying 33%', 'the active slice shows its step and tasks committed of the plan');
    assert.equal(rows[1].note, '2 of 6 tasks committed');
    assert.equal(await page.$eval('#shBody .sh-now .eyebrow', el => el.textContent), 'Now baking · Verifying');
    console.log('PASS orders progress: active slice reads Verifying 33% with 2 of 6 tasks committed');

    await feed({ pies: state.pies.map(pie => pie.pie !== 5 ? pie : { ...pie, slices: pie.slices.map(item => item.number === '5.2' ? { ...item, step: 'build', progress: undefined } : item) }),
      active: [{ ...state.active[0], type: 'bytheslice:implementer', label: 'P5 S5.2 build: ledger' }] });
    rows = await chips();
    assert.equal(rows[1].text, 'Building', 'without measured tasks the chip is a plain step, never a made-up percent');
    assert.equal(rows[1].note, '');
    assert.equal((await page.textContent('#shBody')).includes('0%'), false, 'no percent appears anywhere without evidence');
    console.log('PASS orders progress: no task evidence shows a plain Building step and no percent');

    assert.deepEqual(errors, []);
  } finally {
    await browser.close(); server.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
