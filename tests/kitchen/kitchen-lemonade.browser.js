// tests/kitchen/kitchen-lemonade.browser.js
// Tess sells lemonade from behind her counter: on the house side, clear of the stand, facing the sidewalk.
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const html = fs.readFileSync(process.env.KITCHEN_HTML || path.join(__dirname, '../../skills/open-kitchen/kitchen.html'));
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
    const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
    page.on('pageerror', error => errors.push(error.stack || String(error)));
    await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__kitchenScene?.mode === 'demo' && !!document.querySelector('#stage canvas'), null, { timeout: 45000 });
    await page.click('#bDay');
    // run the town until Tess has walked out to her stand
    await page.evaluate(async () => { const scene = window.__kitchenScene; scene.pause(true);
      for (let t = 0; t < 240 && (t < 15 || scene.lemonade.tess.mode === 'walk'); t += .1) { scene.step(.1); for (let k = 0; k < 4; k++) await null; }
      for (let t = 0; t < 3; t += .1) { scene.step(.1); for (let k = 0; k < 4; k++) await null; } });
    const { counter, sidewalkZ, tess } = await page.evaluate(() => window.__kitchenScene.lemonade);
    assert.equal(tess.task, 'Selling lemonade, 50 cents'); assert.equal(tess.hidden, false);
    assert.ok(tess.x > counter.x[0] && tess.x < counter.x[1], 'she is centered behind the counter');
    const sidewalkSide = Math.sign(sidewalkZ - (counter.z[0] + counter.z[1]) / 2);
    const gap = sidewalkSide > 0 ? counter.z[0] - tess.z : tess.z - counter.z[1];
    assert.ok(gap > .25, `she stands clear of the counter on the house side (gap ${gap.toFixed(2)})`);
    assert.ok(Math.abs(Math.atan2(Math.sin(tess.yaw - (sidewalkSide > 0 ? 0 : Math.PI)), Math.cos(tess.yaw - (sidewalkSide > 0 ? 0 : Math.PI)))) < .2, 'she faces the sidewalk');
    if (SHOTS) { await page.evaluate(({ x, z }) => window.__kitchenScene.look(x, z, 3.2), tess); await page.waitForTimeout(500); await page.screenshot({ path: `${SHOTS}.png` }); }
    console.log(`PASS lemonade stand: Tess stands ${gap.toFixed(2)} behind the counter on the house side, facing the sidewalk`);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close(); server.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
