// tests/kitchen/kitchen-build-out.browser.js
// Runs three physical build-out mesh cases in isolated headless system Chrome with optional readiness smoke.
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const html = fs.readFileSync(path.join(__dirname, '../../skills/open-kitchen/kitchen.html'));
const names = ['walls', 'menu', 'tickets', 'case', 'safe', 'oven', 'alarm', 'locks'];
const chrome = process.env.CHROME_EXECUTABLE || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const pieces = present => Object.fromEntries(names.map(name => [name, { present, applicable: true, source: 'fixture' }]));
let state = { project: { root: '/fixture/build-out', name: 'Build-out fixture', setup: 'partial', pieces: pieces(false) },
  active: [], skills: [], recent: [], pies: [], cursor: 1 };

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
    page.on('pageerror', error => errors.push(error.stack || String(error)));
    await page.goto(`http://127.0.0.1:${state.port}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__kitchenScene?.pieces.length === 8 && !!document.querySelector('#stage canvas'), null, { timeout: 45000 });
    if (process.argv.includes('--smoke')) {
      assert.deepEqual(errors, []);
      console.log('PASS build-out readiness: scene canvas and eight physical piece hooks initialized');
      return;
    }
    async function feed(nextPieces) {
      state = { ...state, project: { ...state.project, pieces: nextPieces } };
      await page.evaluate(next => window.__kitchenFeed(next), state);
    }
    const gutted = await page.evaluate(() => window.__kitchenScene.pieces);
    assert.equal(gutted.length, 8);
    for (const piece of gutted) {
      assert.equal(piece.state, 'gutted'); assert.equal(piece.finishedVisible, false);
      assert.ok(piece.guttedVisible && piece.guttedMeshes > 0, `${piece.name} needs actual visible gutted meshes`);
      assert.equal(piece.finishedMeshes, 0);
    }
    console.log('PASS all missing: all eight physical gutted meshes render');

    await feed({ ...pieces(false), oven: { present: true, applicable: true, source: 'fixture' } });
    const installing = await page.evaluate(() => window.__kitchenScene.pieces.find(piece => piece.name === 'oven'));
    assert.equal(installing.state, 'installing'); assert.equal(installing.installs, 1);
    assert.ok(installing.finishedVisible && installing.finishedMeshes > 0);
    assert.ok(installing.finishedScale[1] < 1 || installing.finishedPosition[1] < 0);
    await page.waitForFunction(() => window.__kitchenScene.pieces.find(piece => piece.name === 'oven').state === 'finished');
    const oven = await page.evaluate(() => window.__kitchenScene.pieces.find(piece => piece.name === 'oven'));
    assert.ok(oven.finishedVisible && oven.finishedMeshes > 0); assert.equal(oven.guttedMeshes, 0);
    assert.equal(oven.guttedVisible, false); assert.deepEqual(oven.finishedScale, [1, 1, 1]);
    console.log('PASS oven install: short mesh animation leaves the finished oven');

    await feed(pieces(true));
    await page.waitForFunction(() => window.__kitchenScene.pieces.every(piece => piece.state === 'finished'));
    const built = await page.evaluate(() => window.__kitchenScene.pieces);
    assert.ok(built.every(piece => piece.finishedVisible && piece.finishedMeshes > 0 && !piece.guttedVisible && piece.guttedMeshes === 0));
    assert.deepEqual(errors, []);
    console.log('PASS all built: no visible gutted mesh remains');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error.stack || String(error)); process.exitCode = 1; });
