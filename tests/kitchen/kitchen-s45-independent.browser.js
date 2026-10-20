// tests/kitchen/kitchen-s45-independent.browser.js
// Independently checks slice 4.5 hook, API, scene, status, and confirmed merge behavior with owned fixtures.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { readKitchenState } = require('../../mcp/kitchen-state.js');
const { recordKitchenMerge } = require('../../skills/box-it-up/record-kitchen-merge.js');
const base = path.resolve(__dirname, '../..'), output = path.join(base, 'docs/plans/evidence/slice45');
const started = Date.now(), stamp = new Date().toLocaleString('en-US', { timeZone: 'America/Phoenix', hour12: true });
const report = { startedMST: stamp, checks: [], evidence: [], cleanup: false, residue: null };
let root, browser, server, page, port, scenario = 'initialization', rows = [], snapshots = {};
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const file = name => path.join(root, name);
const checklistA = '<!-- docs/plans/00_master_checklist.md -->\n<!-- Isolated checklist fixture for status round trips. -->\n## Prep\n- [x] ready\n- [ ] approval\n## Pie 3 [x]\n### Slice 3.1 [x]\n## Pie 4\n### Slice 4.5\n### Slice 4.6\n';
const checklistB = checklistA.replace('- [ ] approval', '- [x] approval').replace('### Slice 4.5\n', '### Slice 4.5 [x]\n');
async function check(name, body) { scenario = name; const t = Date.now(); try { await body(); report.checks.push({ name, result: 'pass', elapsedMs: Date.now() - t }); console.log(`PASS ${name} (${Date.now() - t}ms)`); } catch (e) { report.checks.push({ name, result: 'fail', elapsedMs: Date.now() - t, stack: e.stack || String(e) }); console.error(`FAIL scenario: ${name}\n${e.stack || String(e)}\nelapsedMs=${Date.now() - t}`); } }
async function log(event) { const proc = spawnSync('bash', [path.join(base, 'hooks/kitchen-log.sh')], { cwd: root, env: { ...process.env, CLAUDE_PROJECT_DIR: root, BTS_HOOKS_DISABLED: '0' }, input: JSON.stringify({ session_id: 's45-a', cwd: root, ...event }), encoding: 'utf8' }); assert.equal(proc.status, 0, proc.stderr); assert.equal(proc.stdout, ''); }
async function writeRows(next) { rows = next; await fs.writeFile(file('.claude/.bytheslice-state/kitchen/activity.jsonl'), rows.map(r => JSON.stringify(r)).join('\n') + '\n'); }
async function api() { const r = await fetch(`http://127.0.0.1:${port}/state`); assert.equal(r.status, 200); return r.json(); }
async function snapshot(key) { const s = await api(); snapshots[key] = s; return s; }
const scene = () => page.evaluate(() => { const s = window.__kitchenScene; return { mode: s.mode, phase: s.phase, chef: s.chef, actors: s.actors, lighting: s.lighting, sign: s.sign, review: s.review, status: s.statusBoard, pieces: s.pieces, construction: s.constructionCrew, shopper: s.shopper }; });
async function feed(s) { await page.evaluate(next => window.__kitchenFeed(next), { ...s, port }); }
async function shot(name) { const target = path.join(output, `s45-independent-${name}.png`); await page.screenshot({ path: target, fullPage: true }); report.evidence.push(target); }
async function main() {
  await fs.mkdir(output, { recursive: true });
  root = await fs.mkdtemp(path.join(output, '.s45-owned-'));
  await fs.mkdir(file('docs/plans'), { recursive: true }); await fs.mkdir(file('.claude/.bytheslice-state/kitchen'), { recursive: true });
  await fs.writeFile(file('docs/plans/00_master_checklist.md'), checklistA);
  await fs.writeFile(file('bytheslice.config.json'), '{}');
  server = spawn(process.execPath, [path.join(base, 'mcp/kitchen-server.js'), '--project', root, '--serve-only'], { cwd: root, env: { ...process.env, BTS_KITCHEN_PORT: '49231' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let serverErrors = ''; server.stderr.on('data', c => { serverErrors += c; });
  for (let i = 0; i < 60; i++) { try { port = Number(await fs.readFile(file('.claude/.bytheslice-state/kitchen/port'), 'utf8')); break; } catch { await wait(50); } }
  assert.ok(port, serverErrors);
  await check('real SessionStart and prep hooks expose dawn through /state', async () => {
    await log({ hook_event_name: 'SessionStart' });
    await log({ hook_event_name: 'UserPromptExpansion', command_name: 'bytheslice:sell-pie', command_source: 'fixture' });
    for (const type of ['rules-loader', 'checklist-curator', 'discovery']) {
      await log({ hook_event_name: 'PreToolUse', tool_name: 'Agent', tool_input: { subagent_type: `bytheslice:${type}`, description: `P4 S4.5 ${type}` } });
      await log({ hook_event_name: 'SubagentStart', agent_type: `bytheslice:${type}`, agent_id: type });
    }
    const s = await snapshot('prep'); assert.equal(s.phase, 'dawn'); assert.equal(s.session.id, 's45-a'); assert.equal(s.active.length, 3);
  });
  await check('real first implementer hook opens API; Stop keeps running background agent', async () => {
    await log({ hook_event_name: 'PreToolUse', tool_name: 'Agent', tool_input: { subagent_type: 'bytheslice:implementer', description: 'P4 S4.5 first line cook' } });
    await log({ hook_event_name: 'SubagentStart', agent_type: 'bytheslice:implementer', agent_id: 'cook' });
    const s = await snapshot('open'); assert.equal(s.phase, 'open');
    await log({ hook_event_name: 'Stop' });
    const afterStop = await api(); assert.equal(afterStop.phase, 'open'); assert.ok(afterStop.active.some(a => a.aid === 'cook'));
    rows = (await fs.readFile(file('.claude/.bytheslice-state/kitchen/activity.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
    assert.equal((await readKitchenState(root, { now: Date.now() + 600001 })).phase, 'open');
  });
  await check('idle Stop boundary exact 10 minutes and both active-work guards', async () => {
    const t = 1700000000000;
    const start = { t, sid: 'idle', ev: 'SessionStart', pie: 4 };
    const stop = { t: t + 200, sid: 'idle', ev: 'Stop' };
    const cook = { t: t + 100, sid: 'idle', ev: 'SubagentStart', agent: 'bytheslice:implementer', aid: 'idle-cook', pie: 4 };
    const off = { t: t + 150, sid: 'idle', ev: 'SubagentStop', aid: 'idle-cook' };
    await writeRows([start, cook, off, stop]);
    assert.equal((await readKitchenState(root, { now: stop.t + 600000 })).phase, 'open');
    assert.equal((await readKitchenState(root, { now: stop.t + 600001 })).phase, 'after-hours');
    snapshots.after = await api(); assert.equal(snapshots.after.phase, 'after-hours');
    await writeRows([start, cook, stop]); assert.equal((await readKitchenState(root, { now: stop.t + 600001 })).phase, 'open');
    await writeRows([start, cook, off, stop, { t: t + 210, sid: 'idle', ev: 'PreToolUse', skill: 'bytheslice:close-shop' }]);
    assert.equal((await readKitchenState(root, { now: stop.t + 600001 })).phase, 'open');
    await writeRows([start, stop]); assert.equal((await readKitchenState(root, { now: stop.t + 600001 })).phase, 'after-hours');
  });
  await check('box-it-up finish alone does not close; scoped confirmed merge does', async () => {
    const t = Date.now() - 3000;
    await writeRows([{ t, sid: 'merge', ev: 'SessionStart', pie: 4 }, { t: t + 100, sid: 'merge', ev: 'SubagentStart', agent: 'bytheslice:implementer', aid: 'm', pie: 4 }, { t: t + 200, sid: 'merge', ev: 'SubagentStop', aid: 'm' }, { t: t + 300, sid: 'merge', ev: 'PreToolUse', skill: 'bytheslice:box-it-up' }, { t: t + 400, sid: 'merge', ev: 'Stop' }]);
    assert.equal((await api()).phase, 'open');
    const confirmation = { state: 'MERGED', number: 456, mergedAt: new Date(t + 500).toISOString(), secret: 'excluded-fixture' };
    const record = await recordKitchenMerge({ root, mode: 'pie', pie: 4, confirmation });
    assert.deepEqual(Object.keys(record).sort(), ['mergedAt', 'pie', 'pr', 'v']);
    const target = file('.claude/.bytheslice-state/kitchen/merged-pie.json'); assert.deepEqual(JSON.parse(await fs.readFile(target, 'utf8')), record);
    assert.equal((await api()).phase, 'after-hours'); snapshots.merged = await api();
    await recordKitchenMerge({ root, mode: 'pie', pie: 3, confirmation }); assert.equal((await api()).phase, 'open');
    await recordKitchenMerge({ root, mode: 'pie', pie: 4, confirmation: { ...confirmation, mergedAt: new Date(t - 100).toISOString() } }); assert.equal((await api()).phase, 'open');
    await recordKitchenMerge({ root, mode: 'pie', pie: 4, confirmation });
    await log({ hook_event_name: 'SessionStart', session_id: 's45-b' }); snapshots.newSession = await api(); assert.equal(snapshots.newSession.phase, 'dawn'); assert.equal(snapshots.newSession.active.length, 0);
    await fs.writeFile(target, JSON.stringify({ ...record, mergedAt: Date.now() + 600000 })); assert.equal((await api()).phase, 'dawn');
    await fs.rm(target);
  });
  await check('merge writer rejects invalid confirmations and modes without replacing evidence', async () => {
    const confirmation = { state: 'MERGED', number: 456, mergedAt: new Date(Date.now() - 1000).toISOString() };
    await recordKitchenMerge({ root, mode: 'pie', pie: 4, confirmation });
    const target = file('.claude/.bytheslice-state/kitchen/merged-pie.json'), before = await fs.readFile(target, 'utf8');
    for (const change of [{ mode: 'slice' }, { mode: 'universal' }, { pie: 0 }, { pie: 1.5 }, { confirmation: { ...confirmation, state: 'OPEN' } }, { confirmation: { ...confirmation, number: 0 } }, { confirmation: { ...confirmation, mergedAt: 'invalid' } }, { confirmation: { ...confirmation, mergedAt: new Date(Date.now() + 60000).toISOString() } }]) {
      await assert.rejects(recordKitchenMerge({ root, mode: 'pie', pie: 4, confirmation, ...change })); assert.equal(await fs.readFile(target, 'utf8'), before);
    }
    assert.equal((await fs.readdir(path.dirname(target))).filter(n => n.endsWith('.tmp')).length, 0);
    for (const mode of ['explicit', 'env', 'cwd']) {
      const owned = file(`writer-${mode}`); await fs.mkdir(owned); await fs.writeFile(path.join(owned, 'sentinel'), 'untouched');
      const args = [path.join(base, 'skills/box-it-up/record-kitchen-merge.js'), '--mode', 'pie', '--pie', '4']; if (mode === 'explicit') args.push('--project', owned);
      const env = { ...process.env }; delete env.CLAUDE_PROJECT_DIR; if (mode === 'env') env.CLAUDE_PROJECT_DIR = owned;
      const p = spawnSync(process.execPath, args, { cwd: owned, env, input: JSON.stringify(confirmation), encoding: 'utf8' }); assert.equal(p.status, 0, p.stderr);
      assert.equal(JSON.parse(await fs.readFile(path.join(owned, '.claude/.bytheslice-state/kitchen/merged-pie.json'), 'utf8')).pie, 4); assert.equal(await fs.readFile(path.join(owned, 'sentinel'), 'utf8'), 'untouched');
    }
    await fs.rm(target);
  });
  browser = await chromium.launch({ executablePath: process.env.CHROME_EXECUTABLE || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--enable-unsafe-swiftshader', '--disable-dev-shm-usage'] });
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = []; page.on('pageerror', e => errors.push(e.stack || String(e)));
  await page.goto(`http://127.0.0.1:${port}/#fast`); await page.waitForFunction(() => window.__kitchenScene && document.querySelector('#stage canvas'), null, { timeout: 45000 });
  // Prevent subsequent polling from overwriting explicitly controlled cross-surface replay snapshots.
  await page.route('**/state', route => route.abort());
  await check('prep roles reach binder/tickets/stations and Nico reads dawn status board', async () => {
    await feed(snapshots.prep);
    await page.waitForFunction(() => window.__kitchenScene.actors.filter(a => a.active).every(a => a.mode === 'work') && window.__kitchenScene.chef.mode === 'inspect', null, { timeout: 20000 });
    const s = await scene(); assert.equal(s.phase, 'dawn'); assert.match(s.chef.task, /shop status/); assert.ok(Math.hypot(s.chef.position[0] + 4.25, s.chef.position[1] - 2.75) < .15);
    for (const name of ['Bea', 'Ezra', 'Pip']) { const a = s.actors.find(a => a.name === name && a.active); assert.ok(a); assert.equal(a.hidden, false); assert.ok(Math.hypot(a.position[0] - a.station[0], a.position[1] - a.station[1]) < .15); }
    await shot('prep-role-stations');
  });
  await check('lighting controls disabled live and available in standalone demo', async () => {
    assert.equal(await page.locator('[aria-label="Lighting"] button:disabled').count(), 4);
    const demo = await browser.newPage({ viewport: { width: 1000, height: 750 } });
    try { await demo.route('**/state', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...snapshots.prep, project: { ...snapshots.prep.project, setup: 'none', pieces: {} }, active: [], skills: [] }) })); await demo.goto(`http://127.0.0.1:${port}/#fast`); await demo.waitForFunction(() => window.__kitchenScene?.mode === 'demo', null, { timeout: 45000 }); assert.equal(await demo.locator('[aria-label="Lighting"] button:disabled').count(), 0); await demo.locator('#bNight').click(); assert.equal(await demo.evaluate(() => window.__kitchenScene.lighting.time), 'night'); await demo.locator('#bDay').click(); assert.equal(await demo.evaluate(() => window.__kitchenScene.lighting.time), 'day'); } finally { await demo.close(); }
  });
  await check('open and after-hours reset to dawn on new session across API/page/scene', async () => {
    for (const prior of [snapshots.open, snapshots.after]) { await feed(prior); assert.equal((await scene()).phase, prior.phase); await feed(snapshots.newSession); await page.waitForFunction(() => window.__kitchenScene.phase === 'dawn' && window.__kitchenScene.lighting.dawn > .95); const s = await scene(); assert.equal(s.sign.on, false); assert.equal(s.lighting.time, 'dawn'); assert.equal(await page.evaluate(() => window.kitchenLive.snapshot.session.id), 's45-b'); }
    await shot('new-session-dawn');
  });
  await check('review inactive to active close-shop and back hides board plus ledger', async () => {
    const s = { ...snapshots.after, skills: [{ name: 'bytheslice:close-shop', status: 'active', sid: 'idle', startedAt: Date.now() }] };
    await feed(s); await page.waitForFunction(() => window.__kitchenScene.review.active && window.__kitchenScene.review.ledgerVisible && window.__kitchenScene.review.members.every(m => !m.hidden)); await shot('review-active');
    await feed(snapshots.after); const view = await scene(); assert.equal(view.review.active, false); assert.equal(view.review.ledgerVisible, false); assert.ok(view.review.members.every(m => m.hidden)); await shot('review-inactive');
  });
  await check('checklist totals round trip hook/API/chalkboard/status card/inspector', async () => {
    for (const [index, text] of [checklistA, checklistB, checklistA].entries()) {
      await fs.writeFile(file('docs/plans/00_master_checklist.md'), text);
      const hook = spawnSync('bash', [path.join(base, 'hooks/shop-status.sh')], { cwd: root, env: { ...process.env, CLAUDE_PROJECT_DIR: root, BTS_HOOKS_DISABLED: '0' }, encoding: 'utf8' }); assert.equal(hook.status, 0, hook.stderr);
      const s = await api(); await feed(s); const view = await scene(), c = s.shopStatus;
      assert.deepEqual(view.status.counts, c); assert.deepEqual(await page.evaluate(() => window.kitchenLive.snapshot.shopStatus), c);
      for (const line of [`Prep: ${c.prep.done}/${c.prep.total} boxes checked`, `pies: ${c.pies.total} total, ${c.pies.done} completed / ${c.pies.open} open`, `slices: ${c.slices.total} total, ${c.slices.done} completed / ${c.slices.open} open`]) assert.ok(hook.stdout.includes(line), hook.stdout);
      assert.ok(view.status.card.includes(`${c.prep.done}/${c.prep.total} boxes checked`)); assert.ok(view.status.card.includes(`${c.slices.total} total, ${c.slices.done} completed / ${c.slices.open} open`));
      await page.mouse.click(276, 280); const tip = page.locator('#tip'); assert.equal(await tip.isVisible(), true); assert.match(await tip.innerText(), /Shop status/); assert.ok((await tip.innerText()).includes(`${c.prep.done}/${c.prep.total} boxes checked`)); await shot(`counts-${index}`);
    }
  });
  await check('phase changes preserve active cast and existing pieces', async () => {
    const anchor = snapshots.open; await feed(anchor); const before = await scene(); const pieces = before.pieces.map(p => [p.name, p.state, p.finishedVisible]);
    for (const phase of ['after-hours', 'dawn', 'open']) { await feed({ ...anchor, phase }); const s = await scene(); assert.deepEqual(s.actors.filter(a => a.active).map(a => [a.aid, a.character, a.station]), before.actors.filter(a => a.active).map(a => [a.aid, a.character, a.station])); assert.deepEqual(s.pieces.map(p => [p.name, p.state, p.finishedVisible]), pieces); assert.ok(s.actors.filter(a => a.active).every(a => !a.hidden)); }
  });
  await check('phase changes preserve construction and shopper ownership at affected boundary', async () => {
    const s = { ...snapshots.prep, active: [], skills: [{ name: 'bytheslice:create-menu', sid: 'build', status: 'active', startedAt: 100 }, { name: 'bytheslice:inspect-display', sid: 'shopper', status: 'active', startedAt: 101 }] };
    await feed(s); const before = await scene(); assert.ok(before.construction.length > 0); assert.equal(before.shopper.active, true);
    for (const phase of ['open', 'after-hours', 'dawn']) { await feed({ ...s, phase }); const after = await scene(); assert.deepEqual(after.construction.map(c => [c.character, c.piece, c.hidden]), before.construction.map(c => [c.character, c.piece, c.hidden])); assert.equal(after.shopper.active, true); assert.ok(after.shopper.station); }
  });
  await check('browser has no page errors', async () => assert.deepEqual(errors, []));
}
main().catch(e => { report.checks.push({ name: scenario, result: 'fail', stack: e.stack || String(e) }); console.error(`FAIL scenario: ${scenario}\n${e.stack || String(e)}\nelapsedMs=${Date.now() - started}`); }).finally(async () => {
  if (browser) await browser.close();
  if (server) { server.kill('SIGTERM'); await Promise.race([new Promise(r => server.once('exit', r)), wait(2500)]); if (server.exitCode === null) server.kill('SIGKILL'); }
  if (root) { await fs.rm(root, { recursive: true, force: true }); report.residue = await fs.stat(root).then(() => 1, () => 0); }
  report.cleanup = true; report.elapsedMs = Date.now() - started; report.finishedMST = new Date().toLocaleString('en-US', { timeZone: 'America/Phoenix', hour12: true });
  const target = path.join(output, 's45-independent-results.md'); await fs.writeFile(target, '<!-- docs/plans/evidence/slice45/s45-independent-results.md -->\n<!-- Independent slice 4.5 behavioral evidence, full error stacks, and fixture cleanup. -->\n```json\n' + JSON.stringify(report, null, 2) + '\n```\n');
  console.log(`REPORT ${target}\ncleanup=${report.cleanup} residue=${report.residue} elapsedMs=${report.elapsedMs}`); if (report.checks.some(c => c.result === 'fail')) process.exitCode = 1;
});
