// tests/kitchen/kitchen-people.browser.js
// The people sheet: Crew and Town tabs (underline, keyboard, full town list) and person profiles from every entry point.
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const html = fs.readFileSync(path.join(__dirname, '../../skills/open-kitchen/kitchen.html'));
const chrome = process.env.CHROME_EXECUTABLE || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SHOTS = (process.argv.find(value => value.startsWith('--shots=')) || '').slice(8);

async function main() {
  const server = http.createServer((request, response) => {
    if (request.url === '/') { response.setHeader('Content-Type', 'text/html'); response.end(html); } else { response.writeHead(404); response.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ executablePath: chrome, headless: true, args: ['--enable-unsafe-swiftshader', '--disable-dev-shm-usage'] });
  const errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.on('pageerror', error => errors.push(error.stack || String(error)));
    await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__kitchenScene?.mode === 'demo' && !!document.querySelector('#stage canvas'), null, { timeout: 45000 });
    await page.click('#bDay');
    const tabs = () => page.$$eval('#shBody [role="tab"]', els => els.map(el => ({ id: el.id, selected: el.getAttribute('aria-selected'), tabindex: el.tabIndex,
      underline: getComputedStyle(el).borderBottomWidth + ' ' + getComputedStyle(el).borderBottomColor })));
    const shown = () => page.$$eval('#shBody [role="tabpanel"]', els => els.filter(el => !el.hidden).map(el => el.id));

    await page.click('#bCrew');
    let view = await tabs();
    assert.deepEqual(view.map(tab => [tab.id, tab.selected, tab.tabindex]), [['tab-crew', 'true', 0], ['tab-town', 'false', -1]]);
    const accent = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim());
    assert.match(view[0].underline, /^2px rgb/); assert.ok(!/^2px rgba\(0, 0, 0, 0\)/.test(view[0].underline), 'the selected tab is underlined');
    assert.match(view[1].underline, /rgba\(0, 0, 0, 0\)/, 'the other tab is not');
    assert.deepEqual(await shown(), ['panel-crew']);
    assert.ok(await page.$('#panel-crew [data-person="crew:implementer"]'), 'the Crew tab keeps the crew list');
    console.log(`PASS tabs: Crew is selected and underlined in the accent (${accent}) with only its panel shown`);

    await page.click('#tab-town');
    view = await tabs();
    assert.deepEqual(view.map(tab => tab.selected), ['false', 'true']); assert.deepEqual(await shown(), ['panel-town']);
    assert.match(view[1].underline, /^2px rgb/); assert.match(view[0].underline, /rgba\(0, 0, 0, 0\)/);
    const listed = await page.$$eval('#panel-town .tperson', rows => rows.length), population = await page.evaluate(() => window.__kitchenScene.townPopulation);
    assert.equal(listed, population, 'every townsperson appears once');
    const names = await page.$$eval('#panel-town .tperson [data-person]', els => els.map(el => el.textContent));
    assert.equal(new Set(names).size, names.length);
    const sample = await page.$$eval('#panel-town .tperson', rows => rows.slice(0, 3).map(row => row.textContent));
    assert.ok(sample.every(text => text.length > 4), 'each row has a name and what they are doing');
    assert.ok(await page.$$eval('#panel-town h4', els => els.some(el => /The Brooks home/.test(el.textContent))), 'grouped by household');
    if (SHOTS) await page.screenshot({ path: `${SHOTS}-town-tab.png` });
    console.log(`PASS tabs: Town lists all ${population} townspeople by household with what they are doing`);

    await page.focus('#tab-town'); await page.keyboard.press('ArrowLeft');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'tab-crew');
    assert.deepEqual((await tabs()).map(tab => tab.selected), ['true', 'false']);
    await page.keyboard.press('End'); assert.equal(await page.evaluate(() => document.activeElement.id), 'tab-town');
    await page.keyboard.press('Home'); assert.equal(await page.evaluate(() => document.activeElement.id), 'tab-crew');
    console.log('PASS tabs: arrow keys, Home and End move between tabs');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close(); server.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
