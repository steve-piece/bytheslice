// tests/kitchen/kitchen-ledger-progress.browser.js
// Exercises the Progress sheet: the header button toggles it, one block per ledger pie with a row per slice and an inline SVG step line, the empty state, and a dock that still fits a phone.
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const summary = require('../../scripts/ledger-summary.js');

const html = fs.readFileSync(process.env.KITCHEN_HTML || path.join(__dirname, '../../skills/open-kitchen/kitchen.html'));
const chrome = process.env.CHROME_EXECUTABLE || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SHOTS = (process.argv.find(value => value.startsWith('--shots=')) || '').slice(8);
const ledger = fs.readFileSync(path.join(__dirname, '../fixtures/pass/ledger.jsonl'), 'utf8');
const names = summary.namesFromText('## Pie 4 - Live Kitchen [x]\n### Slice 4.7 - Docs and release [x]\n## Pie 5 - The Pass [ ]\n### Slice 5.1 - Pass pane and band [x]\n### Slice 5.2 - Ledger and status tool [x]\n### Slice 5.3 - Pass checks [ ]\n');
const progress = summary.summarize(summary.parseRows(ledger), { names });
const pieceNames = ['walls', 'menu', 'tickets', 'case', 'safe', 'oven', 'alarm', 'locks'];
const pieces = Object.fromEntries(pieceNames.map(name => [name, { present: true, applicable: true, source: 'fixture' }]));
const slice = (number, title, status) => ({ id: `slice-${number}`, number, title, status });
const state = { project: { root: '/fixture/progress', name: 'Progress fixture', setup: 'built', pieces },
  session: { id: 'progress', startedAt: 1000, pie: 5 }, phase: 'open', skills: [], recent: [], cursor: 1, active: [],
  pies: [
    { id: 'pie-4', pie: 4, title: 'Live Kitchen', status: 'done', single: false, slices: [slice('4.7', 'Docs and release', 'done')] },
    { id: 'pie-5', pie: 5, title: 'The Pass', status: 'active', single: false,
      slices: [slice('5.1', 'Pass pane and band', 'done'), slice('5.2', 'Ledger and status tool', 'done'), slice('5.3', 'Pass checks', 'open')] },
  ],
  progress };

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
    await page.waitForFunction(() => window.kitchenLive?.snapshot?.progress, null, { timeout: 45000 });

    await page.click('#bProgress');
    assert.equal(await page.textContent('#shTitle'), 'Progress');
    assert.equal(await page.$eval('#bProgress', el => el.classList.contains('on')), true);
    const blocks = await page.$$eval('#shBody section.pg', items => items.map(item => item.dataset.pie));
    assert.deepEqual(blocks, ['5', '4'], 'one block per pie, newest first');
    const rows = await page.$$eval('#shBody tr[data-slice]', items => items.map(item => item.dataset.slice));
    for (const id of ['4.7', '5.1', '5.2', '5.3']) assert.ok(rows.includes(id), `a row for slice ${id}`);
    const row52 = await page.$$eval('#shBody tr[data-slice="5.2"] td', cells => cells.map(cell => cell.textContent));
    assert.equal(row52[0], '5.2');
    assert.equal(row52[3], '29m', 'duration');
    assert.equal(row52[4], '1', 'fix loops');
    assert.equal(row52[5], 'pass', 'verifier verdict');
    assert.equal(row52[6], '$0.75', 'cost');
    const label = await page.$eval('#shBody section.pg[data-pie="5"] svg.step', el => el.getAttribute('aria-label'));
    assert.equal(label, 'Slices done over time: 2 of 3');
    assert.equal(await page.$$eval('#shBody section.pg[data-pie="5"] svg.step circle.dot', dots => dots.length), 2);
    assert.match(await page.textContent('#shBody section.pg[data-pie="5"] .facts'), /^2 of 3 slices done · started .+ · \$1\.50$/);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}-progress.png` });
    console.log('PASS progress sheet: one block per pie, a row per slice, a step line of slices done');

    await page.click('#bProgress');
    assert.equal(await page.$eval('#sheet', el => el.hidden), true, 'the button toggles the sheet closed');

    await page.evaluate(next => window.__kitchenFeed(next), { ...state, cursor: 2, progress: { pies: [] } });
    await page.click('#bProgress');
    assert.equal((await page.textContent('#shBody')).trim(), 'No ledger yet. Bake a pie with the Pass mod loaded.');
    await page.evaluate(next => window.__kitchenFeed(next), { ...state, cursor: 3 });
    assert.equal(await page.$$eval('#shBody section.pg', items => items.length), 2, 'a poll redraws the open sheet');
    console.log('PASS progress sheet: empty state without a ledger, and a poll redraws it');

    await page.click('#shClose');
    await page.setViewportSize({ width: 375, height: 812 });
    for (const selector of ['nav.dock', '.hud.tr']) {
      const box = await page.$eval(selector, el => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right }; });
      assert.ok(box.left >= -0.5 && box.right <= 375.5, `${selector} fits a phone (${box.left} to ${box.right})`);
    }
    await page.click('#bProgress');
    assert.equal(await page.$eval('#sheet', el => el.hidden), false);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}-progress-phone.png` });
    console.log('PASS progress sheet: the header with Progress and the dock still fit a 375 px phone');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close(); server.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
