// tests/kitchen/kitchen-traffic-soak.browser.js
// Soaks the town's traffic for simulated minutes and fails on any frozen car, frozen walker or car and person overlap.
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const html = fs.readFileSync(process.env.KITCHEN_HTML || path.join(__dirname, '../../skills/open-kitchen/kitchen.html'));
const chrome = process.env.CHROME_EXECUTABLE || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const arg = (name, fallback) => { const hit = process.argv.find(value => value.startsWith(`--${name}=`)); return hit ? hit.split('=')[1] : fallback; };
const SECONDS = Number(arg('seconds', 600));
const SHOTS = arg('shots', '');
const pieceNames = ['walls', 'menu', 'tickets', 'case', 'safe', 'oven', 'alarm', 'locks'];
const pieces = Object.fromEntries(pieceNames.map(name => [name, { present: true, applicable: true, source: 'fixture' }]));
const liveState = { project: { root: '/fixture/traffic', name: 'Traffic fixture', setup: 'built', pieces },
  session: { id: 'traffic', startedAt: 1000, pie: 2 }, phase: 'open', active: [], skills: [], recent: [], cursor: 1,
  pies: [{ id: 'pie-2', pie: 2, title: 'Traffic', status: 'active', single: false,
    slices: [{ id: 'slice-2.1', number: '2.1', title: 'Soak', status: 'active' }, { id: 'slice-2.2', number: '2.2', title: 'Report', status: 'open' }] }] };

// Runs inside the page: steps the world with the frame loop paused and samples the street every half second.
async function soak({ seconds, dt }) {
  const scene = window.__kitchenScene; scene.pause(true);
  // frozen means still for longer than any honest wait: a car through a whole red, a walker through a whole 48 second light cycle
  const SAMPLE = .5, CAR_FROZEN = 40, WALK_FROZEN = 50;
  const carStill = new Map(), walkStill = new Map(), frozen = new Map();
  let overlaps = 0, samples = 0, maxCarStill = 0, maxWalkStill = 0, nextSample = 0; const hits = [];
  const t0 = scene.traffic.simT;
  for (let elapsed = 0; elapsed < seconds; elapsed += dt) {
    scene.step(dt);
    for (let k = 0; k < 4; k++) await null;
    if (elapsed < nextSample) continue;
    nextSample += SAMPLE; samples++;
    const view = scene.traffic, now = view.simT - t0;
    for (const car of view.cars) {
      if (!car.active || car.v > .05) { carStill.delete(car.i); continue; }
      const since = carStill.get(car.i) ?? now; carStill.set(car.i, since);
      const still = now - since; maxCarStill = Math.max(maxCarStill, still);
      if (still > CAR_FROZEN) frozen.set(`car ${car.key} #${car.i}`, { at: Math.round(now), still: Math.round(still), pos: +car.pos.toFixed(2) });
    }
    // someone who went indoors and came back out starts a fresh clock
    const seen = new Set(view.people.map(person => `${person.name} #${person.i}`));
    for (const id of walkStill.keys()) if (!seen.has(id)) walkStill.delete(id);
    for (const person of view.people) {
      const id = `${person.name} #${person.i}`;
      if (person.mode !== 'walk' || !person.path) { walkStill.delete(id); continue; }
      const last = walkStill.get(id);
      if (!last || Math.hypot(person.x - last.x, person.z - last.z) > .05) { walkStill.set(id, { x: person.x, z: person.z, since: now, why: new Set() }); continue; }
      if (person.why) last.why.add(`${person.why} @${person.light}`);
      const still = now - last.since; maxWalkStill = Math.max(maxWalkStill, still);
      if (still > WALK_FROZEN) frozen.set(`walker ${id}`, { at: Math.round(now), still: Math.round(still), x: +person.x.toFixed(2), z: +person.z.toFixed(2), curb: person.curb, why: [...last.why].slice(-12), task: person.task, next: person.next });
    }
    // a car body is 1.9 by 0.92; a person counts as hit when they stand inside it (with a small body radius)
    for (const car of view.cars) {
      if (!car.active) continue;
      for (const person of view.people) {
        const along = (car.axis === 'x' ? person.x : person.z) - car.pos, side = (car.axis === 'x' ? person.z : person.x) - car.lane;
        if (Math.abs(along) < 1.05 && Math.abs(side) < .58) { overlaps++; if (hits.length < 6) hits.push({ at: Math.round(now), car: car.key, carPos: +car.pos.toFixed(2), v: +car.v.toFixed(2), freed: car.freed, person: person.name, x: +person.x.toFixed(2), z: +person.z.toFixed(2), pass: person.pass, light: person.light }); }
      }
    }
  }
  return { simulated: Math.round(scene.traffic.simT - t0), samples, overlaps, hits, frozen: [...frozen].map(([who, info]) => ({ who, ...info })),
    maxCarStill: Math.round(maxCarStill), maxWalkStill: Math.round(maxWalkStill) };
}

async function main() {
  let live = false;
  const server = http.createServer((request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    if (request.url === '/state' && live) { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(liveState)); }
    else if (request.url === '/') { response.setHeader('Content-Type', 'text/html'); response.end(html); }
    else { response.writeHead(404); response.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  liveState.port = server.address().port;
  const browser = await chromium.launch({ executablePath: chrome, headless: true, args: ['--enable-unsafe-swiftshader', '--disable-dev-shm-usage'] });
  const errors = [];
  try {
    for (const mode of ['demo', 'live']) {
      live = mode === 'live';
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      page.on('pageerror', error => errors.push(error.stack || String(error)));
      await page.goto(`http://127.0.0.1:${liveState.port}/`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(want => window.__kitchenScene?.mode === want && !!document.querySelector('#stage canvas'), mode, { timeout: 45000 });
      if (mode === 'demo') await page.click('#bDay');
      await page.waitForFunction(() => window.__kitchenScene.traffic.tod === 'day', null, { timeout: 10000 });
      const result = await page.evaluate(soak, { seconds: SECONDS, dt: .1 });
      console.log(`${mode}: ${JSON.stringify(result)}`);
      if (SHOTS) {
        // frame Main and Oak, then let a few frames render without advancing the town
        await page.evaluate(() => { const v = window.__kitchenScene; v.look(9.6, 8.7, 1.25); });
        await page.waitForTimeout(600);
        await page.screenshot({ path: `${SHOTS}-${mode}.png` });
      }
      assert.equal(result.simulated >= SECONDS - 1, true, 'the soak covered the requested simulated time');
      assert.deepEqual(result.frozen, [], `${mode}: no car or walker stays frozen`);
      assert.equal(result.overlaps, 0, `${mode}: no person stands inside a car`);
      console.log(`PASS traffic soak ${mode}: ${result.simulated}s simulated, ${result.samples} samples, 0 frozen, 0 overlaps (longest car stop ${result.maxCarStill}s, longest walker wait ${result.maxWalkStill}s)`);
      await page.close();
    }
    assert.deepEqual(errors, []);
  } finally {
    await browser.close(); server.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
