// tests/kitchen/kitchen-ballgame.browser.js
// After the final out no new game starts: every player and coach walks home, rests, then rejoins the town's brain routines.
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const html = fs.readFileSync(path.join(__dirname, '../../skills/open-kitchen/kitchen.html'));
const chrome = process.env.CHROME_EXECUTABLE || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

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
    const result = await page.evaluate(async () => {
      const scene = window.__kitchenScene; scene.pause(true);
      const step = async seconds => { for (let t = 0; t < seconds; t += .1) { scene.step(.1); for (let k = 0; k < 4; k++) await null; } };
      for (let t = 0; t < 400 && scene.ballgame.status !== 'live'; t += 1) await step(1);
      const started = scene.ballgame.status, game = scene.ballgame.game;
      scene.finishGame();
      const home = new Set(), back = new Set(), statuses = new Set(), games = new Set();
      let fieldStillEmpty = true;
      for (let t = 0; t < 420; t += 1) {
        await step(1);
        const view = scene.ballgame; statuses.add(view.status); games.add(view.game);
        for (const person of view.people) {
          if (person.homeAfterGame && person.hidden) home.add(person.name);
          if (home.has(person.name) && person.brain && !person.hidden) back.add(person.name);
          // the diamond and dugouts sit west of x = -36; nobody plays there again today
          if (home.has(person.name) && !person.hidden && person.x < -36 && /Playing|dugout/i.test(person.task)) fieldStillEmpty = false;
        }
      }
      const view = scene.ballgame;
      return { started, game, games: [...games], statuses: [...statuses], last: view.last, home: [...home], back: [...back], fieldStillEmpty,
        crew: view.people.filter(person => person.role !== 'fan').map(person => person.name), tasks: view.people.filter(person => back.has(person.name)).slice(0, 4).map(person => person.task) };
    });
    assert.equal(result.started, 'live', 'a game was under way before the final out');
    assert.deepEqual(result.games, [result.game], 'no new game started');
    assert.ok(!result.statuses.includes('pre') && !result.statuses.includes('live'), `the field stays empty (${result.statuses})`);
    assert.match(result.last, /That's the game for today/);
    for (const name of result.crew) assert.ok(result.home.includes(name), `${name} reached home after the game`);
    console.log(`PASS ballgame end: no new game, all ${result.crew.length} players, coaches and the umpire reached home`);
    for (const name of result.crew) assert.ok(result.back.includes(name), `${name} came back out on the town brain`);
    assert.equal(result.fieldStillEmpty, true);
    console.log(`PASS ballgame end: everyone rejoined town routines (for example: ${result.tasks.join('; ')})`);

    await page.click('#bNight'); await page.click('#bDay');
    const morning = await page.evaluate(() => window.__kitchenScene.ballgame);
    assert.equal(morning.status, 'pre'); assert.equal(morning.game, result.game + 1);
    assert.ok(morning.people.every(person => !person.brain), 'the next morning they are ballplayers again');
    console.log('PASS ballgame end: the next morning a new game is set up and the players head back to the field');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close(); server.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
