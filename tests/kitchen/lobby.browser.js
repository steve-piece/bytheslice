// tests/kitchen/lobby.browser.js
// The lobby page in Chrome: four badges in priority order, the spinner and reduced motion, polling, offline, click-through and 390 px.
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const html = fs.readFileSync(path.join(__dirname, '../../skills/open-kitchen/lobby.html'));
const chrome = process.env.CHROME_EXECUTABLE || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SHOTS = (process.argv.find(value => value.startsWith('--shots=')) || '').slice(8);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

const ALPHA = `/fixture/alpha-${'deeply-nested-folder/'.repeat(6)}project`;
const XSS = '<img src=x onerror="window.__xss=1">Mid';
let kitchenUrl = '';
const row = (key, name, state, extra) => ({ key, root: key, path: key, name, state, sessions: 0, active: null,
  activePie: null, activeSlice: null, kitchenUrl: null, ...extra });
// Deliberately out of priority order: the page sorts.
const fixture = () => [
  row('/fixture/zeta', 'Zeta', 'done', { pies: { done: 2, total: 2 }, slices: { done: 5, total: 5 }, kitchenUrl: 'http://evil.test/' }),
  row(ALPHA, 'Alpha', 'inactive', { pies: { done: 1, total: 4 }, slices: { done: 3, total: 12 }, activePie: { number: 2, name: 'Second pie' } }),
  row('/fixture/mid', XSS, 'active', { pies: { done: 6, total: 9 }, slices: { done: 20, total: 31 },
    activePie: { number: 7, name: 'Lobby' }, activeSlice: { number: '7.4', name: 'Lobby page' }, kitchenUrl }),
  row('/fixture/help', 'Help', 'needs-you', { pies: { done: 0, total: 3 }, slices: { done: 1, total: 8 },
    activePie: { number: 1, name: 'Prep' }, activeSlice: { number: '1.2', name: 'Tokens' } }),
];
let projects = [];
let stateDown = false;
const opens = [], kitchenVisits = [];

function readBody(request) {
  return new Promise(resolve => { let text = ''; request.setEncoding('utf8'); request.on('data', chunk => { text += chunk; }); request.on('end', () => resolve(text)); });
}

const hexToRgb = hex => {
  const value = hex.trim().replace('#', '');
  return `rgb(${[0, 2, 4].map(at => parseInt(value.slice(at, at + 2), 16)).join(', ')})`;
};

async function main() {
  const kitchen = http.createServer((request, response) => {
    if (request.url !== '/favicon.ico') kitchenVisits.push(request.url);
    response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><title>Kitchen</title><p>Fake kitchen</p>');
  });
  await new Promise(resolve => kitchen.listen(0, '127.0.0.1', resolve));
  kitchenUrl = `http://127.0.0.1:${kitchen.address().port}/`;
  projects = fixture();

  const lobby = http.createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    if (request.method === 'GET' && request.url === '/') { response.setHeader('Content-Type', 'text/html; charset=utf-8'); response.end(html); }
    else if (request.method === 'GET' && request.url === '/state') {
      if (stateDown) { response.writeHead(503); response.end('Lobby state unavailable'); return; }
      response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ v: 1, generatedAt: Date.now(), projects }));
    } else if (request.method === 'POST' && request.url === '/open') {
      const body = JSON.parse(await readBody(request));
      opens.push({ type: request.headers['content-type'], body });
      await delay(500);
      if (body.root === '/fixture/zeta') { response.writeHead(502); response.end('Kitchen could not be opened'); return; }
      response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ url: kitchenUrl }));
    } else { response.writeHead(404); response.end(); }
  });
  await new Promise(resolve => lobby.listen(0, '127.0.0.1', resolve));
  const port = lobby.address().port, home = `http://127.0.0.1:${port}/`;

  const browser = await chromium.launch({ executablePath: chrome, headless: true, args: ['--disable-dev-shm-usage'] });
  const errors = [];
  const watch = page => { page.on('pageerror', error => errors.push(error.stack || String(error))); return page; };
  const ready = page => page.waitForFunction(count => window.__lobby?.polls > 0 && document.querySelectorAll('#cards .card').length === count,
    projects.length, { timeout: 10000 });
  const card = key => `#cards .card[data-key="${key}"]`;
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = watch(await context.newPage());
    await page.goto(home, { waitUntil: 'domcontentloaded' });
    await ready(page);

    // 1. Four badges, one per state, in priority order, with their tones and text labels.
    const tokens = await page.evaluate(() => Object.fromEntries(['bad', 'sage', 'dusty', 'ink-soft', 'accent']
      .map(name => [name, getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim()])));
    const view = await page.$$eval('#cards .card', els => els.map(el => {
      const badge = el.querySelector('.badge'), shown = [...badge.querySelectorAll('svg')].filter(svg => getComputedStyle(svg).display !== 'none');
      const bar = el.querySelector('[role="progressbar"]');
      return { key: el.dataset.key, state: el.dataset.state, badge: badge.dataset.state, label: el.querySelector('.badge-text').textContent,
        icons: shown.length, tone: shown[0] && getComputedStyle(shown[0]).color, name: el.querySelector('.open').textContent,
        button: el.querySelector('.open').tagName, where: el.querySelector('.where').textContent, what: el.querySelector('.what').textContent,
        bar: { now: bar.getAttribute('aria-valuenow'), min: bar.getAttribute('aria-valuemin'), max: bar.getAttribute('aria-valuemax'), label: bar.getAttribute('aria-label') },
        slices: el.querySelector('.n-slices').textContent, pies: el.querySelector('.n-pies').textContent, hint: el.querySelector('.hint').textContent };
    }));
    assert.deepEqual(view.map(card => card.badge), ['needs-you', 'active', 'done', 'inactive']);
    assert.deepEqual(view.map(card => card.state), ['needs-you', 'active', 'done', 'inactive']);
    assert.deepEqual(view.map(card => card.label), ['Needs you', 'Active', 'Done', 'Inactive']);
    assert.deepEqual(view.map(card => card.key), ['/fixture/help', '/fixture/mid', '/fixture/zeta', ALPHA]);
    assert.deepEqual(view.map(card => card.icons), [1, 1, 1, 1], 'one icon beside each text label');
    assert.deepEqual(view.map(card => card.tone), ['bad', 'sage', 'dusty', 'ink-soft'].map(name => hexToRgb(tokens[name])));
    assert.deepEqual(view.map(card => card.where), ['Pie 1, Slice 1.2', 'Pie 7, Slice 7.4', 'Nothing in progress', 'Pie 2']);
    assert.deepEqual(view.map(card => card.what), ['Tokens', 'Lobby page', '', 'Second pie']);
    assert.ok(view.every(card => card.button === 'BUTTON'), 'each card opens from a real button');
    assert.deepEqual(view[1].bar, { now: '20', min: '0', max: '31', label: `${XSS}: slices done` });
    assert.deepEqual([view[1].slices, view[1].pies], ['20/31', '6/9']);
    assert.deepEqual(view.map(card => card.hint), ['Kitchen not running', 'Kitchen running', 'Kitchen not running', 'Kitchen not running'],
      'a kitchenUrl off 127.0.0.1 counts as not running');
    assert.equal(view[1].name, XSS, 'names render as text');
    assert.equal(await page.evaluate(() => [document.querySelectorAll('#cards img').length, window.__xss]).then(([images, flag]) => images + (flag ? 1 : 0)), 0);
    assert.equal(await page.textContent('#summary'), '4 projects, 1 needs you, 1 active');
    assert.equal(await page.evaluate(() => document.compatMode), 'CSS1Compat');
    assert.equal(await page.evaluate(() => { window.__lobby = null; window.__lobby.projects.length = 0; return window.__lobby.projects.length; }), 4,
      'window.__lobby is read-only and hands out copies');
    if (SHOTS) await page.screenshot({ path: `${SHOTS}-lobby-1280.png` });
    console.log('PASS badges: four cards in priority order Needs you, Active, Done, Inactive with token tones, text labels and textContent names');

    // 2. The Active spinner, and reduced motion.
    const spin = target => target.$eval('.badge[data-state="active"] svg.spin', el => ({ name: getComputedStyle(el).animationName, display: getComputedStyle(el).display }));
    assert.deepEqual(await spin(page), { name: 'lobby-spin', display: 'block' });
    const calm = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
    const still = watch(await calm.newPage());
    await still.goto(home, { waitUntil: 'domcontentloaded' }); await ready(still);
    assert.deepEqual(await spin(still), { name: 'none', display: 'block' });
    await calm.close();
    console.log('PASS reduced motion: the Active arrows spin, and with prefers-reduced-motion their animation is none');

    // 3. A state change in the feed shows within 4 s, and keyboard focus survives the reorder.
    await page.focus(`${card('/fixture/zeta')} .open`);
    const pollsBefore = await page.evaluate(() => window.__lobby.polls);
    projects = projects.map(item => item.key === '/fixture/zeta' ? { ...item, state: 'needs-you' } : item);
    const changedAt = Date.now();
    await page.waitForFunction(() => document.querySelector('#cards .card[data-key="/fixture/zeta"] .badge').dataset.state === 'needs-you', null, { timeout: 4000 });
    const took = Date.now() - changedAt;
    assert.deepEqual(await page.$$eval('#cards .card', els => els.map(el => el.dataset.key)), ['/fixture/help', '/fixture/zeta', '/fixture/mid', ALPHA]);
    assert.equal(await page.evaluate(() => document.activeElement.closest('.card')?.dataset.key), '/fixture/zeta', 'focus stays on the moved card');
    assert.ok(await page.evaluate(before => window.__lobby.polls > before, pollsBefore));
    projects = fixture();
    await page.waitForFunction(() => document.querySelector('#cards .card[data-key="/fixture/zeta"] .badge').dataset.state === 'done', null, { timeout: 4000 });
    console.log(`PASS polling: a fixture state change reached the card in ${took} ms (under 4 s) and focus stayed put`);

    // 4. Offline: keep the last good list and show the strip, then clear it.
    stateDown = true;
    await page.waitForFunction(() => document.querySelector('#offline')?.textContent.includes('Lobby offline, retrying'), null, { timeout: 4000 });
    assert.equal(await page.getAttribute('#offline', 'role'), 'status');
    assert.equal(await page.$$eval('#cards .card', els => els.length), 4, 'the last good list stays');
    if (SHOTS) await page.screenshot({ path: `${SHOTS}-lobby-offline.png` });
    stateDown = false;
    await page.waitForFunction(() => document.querySelector('#offline').textContent === '', null, { timeout: 4000 });
    console.log('PASS offline: a failed poll keeps the cards and shows "Lobby offline, retrying" in a status region, cleared on recovery');

    // 5. Keyboard: Tab reaches the first card, which draws a visible focus ring around the whole card.
    await page.mouse.click(5, 5);
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.closest('.card')?.dataset.key), '/fixture/help');
    const ring = await page.evaluate(() => { const style = getComputedStyle(document.activeElement, '::after'); return { style: style.outlineStyle, width: style.outlineWidth, color: style.outlineColor, position: style.position }; });
    assert.deepEqual(ring, { style: 'solid', width: '3px', color: hexToRgb(tokens.accent), position: 'absolute' });
    console.log('PASS keyboard: Tab focuses the first card and its focus ring outlines the whole card in --accent');

    // 6. A failed start shows an inline error and never navigates; a kitchenUrl off 127.0.0.1 is never followed.
    await page.focus(`${card('/fixture/zeta')} .open`);
    await page.keyboard.press('Space');
    await page.waitForFunction(() => document.querySelector('#cards .card[data-key="/fixture/zeta"]').getAttribute('aria-busy') === 'true', null, { timeout: 2000 });
    assert.equal(await page.textContent(`${card('/fixture/zeta')} .msg`), 'Starting kitchen...');
    assert.equal(await page.$eval(`${card('/fixture/zeta')} .open`, el => el.disabled), true);
    await page.waitForFunction(() => document.querySelector('#cards .card[data-key="/fixture/zeta"] .msg').textContent === 'Could not start the kitchen. Try again.', null, { timeout: 5000 });
    assert.equal(await page.$eval(`${card('/fixture/zeta')} .open`, el => el.disabled), false);
    assert.equal(await page.evaluate(() => document.activeElement.closest('.card')?.dataset.key), '/fixture/zeta', 'focus returns to the card');
    assert.equal(page.url(), home);
    assert.deepEqual(opens.splice(0), [{ type: 'application/json', body: { root: '/fixture/zeta' } }]);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}-lobby-error.png` });
    console.log('PASS click-through error: Space on a card whose kitchen fails shows "Starting kitchen..." then an inline error, and stays on the lobby');

    // 7. An empty registry.
    projects = [];
    await page.waitForFunction(() => !document.querySelector('#empty').hidden, null, { timeout: 4000 });
    assert.match(await page.textContent('#empty'), /No projects yet/);
    assert.equal(await page.textContent('#summary'), 'No projects yet');
    assert.equal(await page.$$eval('#cards .card', els => els.length), 0);
    projects = fixture();
    await ready(page);
    console.log('PASS empty: no registered projects shows the "No projects yet" notice');

    // 8. 390 px: one column, no horizontal scroll.
    const phone = watch(await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage());
    await phone.goto(home, { waitUntil: 'domcontentloaded' }); await ready(phone);
    const fit = await phone.evaluate(() => {
      const boxes = [...document.querySelectorAll('#cards .card')].map(el => el.getBoundingClientRect());
      return { scroll: document.documentElement.scrollWidth, inner: innerWidth, lefts: new Set(boxes.map(box => Math.round(box.left))).size,
        inside: boxes.every(box => box.left >= 0 && box.right <= innerWidth) };
    });
    assert.ok(fit.scroll <= fit.inner, `no horizontal scroll (${fit.scroll} > ${fit.inner})`);
    assert.equal(fit.lefts, 1, 'one column'); assert.ok(fit.inside, 'every card fits the width');
    if (SHOTS) await phone.screenshot({ path: `${SHOTS}-lobby-390.png`, fullPage: true });
    console.log(`PASS 390 px: one column of cards, scrollWidth ${fit.scroll} <= innerWidth ${fit.inner}`);

    // 9. Click-through, kitchen running: anywhere on the card goes straight to its kitchen with ?lobby=<port>.
    const mid = await page.$(card('/fixture/mid'));
    const box = await mid.boundingBox();
    await page.mouse.click(box.x + box.width - 30, box.y + box.height - 50);
    await page.waitForURL(`${kitchenUrl}?lobby=${port}`, { timeout: 5000 });
    assert.deepEqual(opens, [], 'a running kitchen needs no POST /open');
    assert.deepEqual(kitchenVisits.splice(0), [`/?lobby=${port}`]);
    console.log('PASS click-through (running): a click anywhere on an Active card opens its kitchenUrl with ?lobby=<port>');

    // 10. Click-through, kitchen not running: Enter posts { root }, shows Starting kitchen..., then opens the URL with idle=1.
    await page.goto(home, { waitUntil: 'domcontentloaded' }); await ready(page);
    await page.focus(`${card(ALPHA)} .open`);
    await page.keyboard.press('Enter');
    await page.waitForFunction(key => document.querySelector(`#cards .card[data-key="${key}"] .msg`).textContent === 'Starting kitchen...', ALPHA, { timeout: 2000 });
    await page.waitForURL(`${kitchenUrl}?lobby=${port}&idle=1`, { timeout: 5000 });
    assert.deepEqual(opens.splice(0), [{ type: 'application/json', body: { root: ALPHA } }]);
    assert.deepEqual(kitchenVisits.splice(0), [`/?lobby=${port}&idle=1`]);
    console.log('PASS click-through (not running): Enter sends POST /open with { root }, shows "Starting kitchen...", then opens the returned URL with ?lobby=<port>&idle=1');

    assert.deepEqual(errors, []);
    console.log('PASS no page errors across every lobby page');
  } finally {
    await browser.close(); lobby.close(); kitchen.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
