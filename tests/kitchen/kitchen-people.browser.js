// tests/kitchen/kitchen-people.browser.js
// The people sheet: Crew and Town tabs (underline, keyboard, full town list) and person profiles, a screen inside the sheet, from every entry point.
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

    // profiles: entry point 1, a name in the Crew list
    const profile = () => page.evaluate(() => window.__kitchenScene.profile);
    await page.click('#panel-crew [data-person="crew:implementer"]');
    let card = await profile(); assert.equal(card.name, 'Ren');
    let text = await page.textContent('#shBody .pf');
    assert.match(text, /Line cook, builds code/); assert.match(text, /bytheslice:implementer/); assert.match(text, /The line crew flat, Upstairs on Main Street/);
    assert.match(text, /Family.*Chef Nico.*Dom/s); assert.match(text, /Loves.*Lunch at the diner/s); assert.match(text, /Now/);
    assert.ok(await page.evaluate(() => document.activeElement.matches('[data-pback]')), 'focus lands on the back button');
    assert.equal(await page.textContent('#shTitle'), 'Ren', 'the sheet title is the person');
    assert.equal(await page.$('#shBody .pf h4'), null, 'no second name under the portrait');
    assert.ok(await page.evaluate(() => window.__kitchenScene.view.moving), 'a list name pans the camera to them');
    assert.ok(await page.evaluate(() => { const c = document.getElementById('pfCanvas'), x = c.getContext('webgl2') || c.getContext('webgl'); const px = new Uint8Array(4); x.readPixels(300, 300, 1, 1, x.RGBA, x.UNSIGNED_BYTE, px); return px[3] > 0; }), 'the portrait renders the character');
    if (SHOTS) await page.screenshot({ path: `${SHOTS}-profile-crew.png` });
    await page.click('[data-pback]'); assert.equal(await profile(), null);
    assert.equal(await page.textContent('#shTitle'), 'People', 'Go Back restores the list title');
    assert.deepEqual(await shown(), ['panel-crew'], 'back returns to the Crew list');
    assert.equal(await page.evaluate(() => document.activeElement.dataset.person), 'crew:implementer', 'focus returns to the name that opened it');
    console.log('PASS profiles: a Crew list name opens the profile screen in the sheet (role, agent, family, home, loves, now) and Back returns to the list');

    // entry point 2, a name in the Town list, and a family link to another profile
    await page.click('#tab-town'); await page.click('#panel-town [data-person="town:Tess"]');
    card = await profile(); assert.equal(card.name, 'Tess'); assert.equal(card.pose, 'Selling lemonade');
    assert.match(await page.textContent('#shBody .pf'), /Runs the lemonade stand/);
    await page.click('#shBody .pf [data-person="town:Lena"]');
    card = await profile(); assert.equal(card.name, 'Lena'); assert.equal(card.pose, 'Out for a run');
    assert.match(await page.textContent('#shBody .pf'), /The Okafor home, Elm Street/);
    await page.keyboard.press('Escape'); assert.equal(await profile(), null);
    assert.deepEqual(await shown(), ['panel-town'], 'Escape returns to the Town list');
    await page.click('#panel-town [data-person="town:Hank"]'); assert.equal((await profile()).pose, 'Mowing'); await page.keyboard.press('Escape');
    console.log('PASS profiles: a Town list name opens a fitting pose, a family link opens that profile, Escape goes back to the list');

    // entry point 3, a person in the 3D scene
    await page.click('#shClose');
    await page.evaluate(() => { window.__kitchenScene.pause(true); window.__kitchenScene.look(.2, .4, 2.2); });
    await page.waitForTimeout(300);
    let spot = await page.evaluate(() => window.__kitchenScene.screenOf('Chef Nico'));
    await page.mouse.click(spot.x, spot.y);
    await page.waitForSelector('#tip:not([hidden]) .more');
    assert.equal(await profile(), null, 'a scene tap shows the popover, not the profile');
    assert.match(await page.textContent('#tip h5'), /Chef Nico/);
    assert.equal(await page.evaluate(() => window.__kitchenScene.menu), 'tip');
    await page.click('#tip .more');
    card = await profile(); assert.ok(card, 'See more opens the profile'); assert.equal(card.name, 'Chef Nico');
    assert.match(await page.textContent('#shBody .pf'), /Head chef, leads the session/);
    assert.equal(await page.evaluate(() => window.__kitchenScene.menu), 'sheet:crew', 'the popover closes when the sheet opens');
    assert.ok(await page.evaluate(({ x, y }) => !!document.elementFromPoint(x, y)?.closest('#stage'), spot), 'the scene stays clickable while a profile shows');
    await page.mouse.click(spot.x, spot.y); await page.waitForSelector('#tip:not([hidden]) .more');
    assert.equal(await page.evaluate(() => window.__kitchenScene.menu), 'tip', 'a new popover closes the sheet');
    await page.keyboard.press('Escape'); assert.equal(await page.evaluate(() => window.__kitchenScene.menu), null, 'Escape closes the popover');
    console.log('PASS profiles: tapping Chef Nico shows his popover, See more opens his profile, and only one menu is open at a time');

    // entry point 4, an avatar head in a house card's popover
    await page.evaluate(() => window.__kitchenScene.look(2, -13.5, 1.6)); await page.waitForTimeout(300);
    spot = await page.evaluate(() => window.__kitchenScene.screenOf('house:4'));
    await page.mouse.click(spot.x, spot.y);
    await page.waitForSelector('#tip:not([hidden]) .fam [data-person]');
    await page.click('#tip .fam .hav >> nth=0');
    card = await profile(); assert.ok(['Lena', 'Tess', 'Ricky'].includes(card.name), `the avatar opens a household member (${card.name})`);
    await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => window.__kitchenScene.menu), null, 'Escape steps back to the list, then closes the sheet');
    console.log(`PASS profiles: an avatar head in the Okafor house card opens ${card.name}'s profile`);

    // phone width: the card fits and still closes
    await page.setViewportSize({ width: 375, height: 812 });
    await page.evaluate(() => window.__kitchenScene.pause(false));
    await page.click('#bCrew'); await page.click('#panel-town [data-person="town:Carl"]');
    const box = await page.$eval('#sheet', el => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, scroll: document.documentElement.scrollWidth }; });
    assert.ok(box.left >= 0 && box.right <= 375 && box.top >= 0 && box.bottom <= 812 && box.scroll <= 375, `fits a phone (${JSON.stringify(box)})`);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}-profile-phone.png` });
    await page.click('[data-pback]'); assert.equal(await profile(), null);
    console.log('PASS profiles: the profile screen fits a 375 px phone viewport');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close(); server.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
