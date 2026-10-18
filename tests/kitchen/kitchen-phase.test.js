// tests/kitchen/kitchen-phase.test.js
// Verifies morning prep phase transitions, confirmed merge scoping, and SessionStart checklist count parity.
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const vm = require('node:vm');
const { checklist } = require('../fixtures/kitchen/data.js');
const { foldActivity, buildSnapshot, readKitchenState, shopStatus } = require('../../mcp/kitchen-state.js');
const { recordKitchenMerge } = require('../../skills/box-it-up/record-kitchen-merge.js');
const session = { t: 1000, sid: 'morning', ev: 'SessionStart', pie: 4 };
const start = (type, aid = type, t = 1100) => ({ t, sid: 'morning', ev: 'SubagentStart', agent: `bytheslice:${type}`, aid, pie: 4 });
const merge = { v: 1, pie: 4, pr: 123, mergedAt: 1500 };

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kitchen-phase-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const dir = path.join(root, '.claude/.bytheslice-state/kitchen');
  await fs.mkdir(dir, { recursive: true });
  await fs.mkdir(path.join(root, 'docs/plans'), { recursive: true });
  await fs.writeFile(path.join(root, 'docs/plans/00_master_checklist.md'), checklist);
  await fs.writeFile(path.join(dir, 'activity.jsonl'), `${JSON.stringify(session)}\n${JSON.stringify(start('implementer'))}\n`);
  return { root, dir };
}

test('session and skill starts stay at dawn through all three prep agents', () => {
  const skills = [{ t: 1050, sid: 'morning', ev: 'PreToolUse', skill: 'bytheslice:sell-pie', pie: 4 }];
  for (const rows of [[session], skills, [session, ...skills],
    [session, ...skills, ...['rules-loader', 'checklist-curator', 'discovery'].map(type => start(type))]]) {
    assert.equal(foldActivity(rows, 2000).phase, 'dawn');
  }
});

test('first cook or line worker opens the session and completion does not return it to dawn', () => {
  for (const type of ['implementer', 'plater', 'fix-attempter', 'debug-instrumenter', 'state-illustrator',
    'block-composer', 'component-crafter', 'layout-architect', 'slice-tester', 'slice-verifier']) {
    const rows = [session, start(type)];
    assert.equal(foldActivity(rows, 2000).phase, 'open', type);
    assert.equal(foldActivity([...rows, { t: 1200, sid: 'morning', ev: 'SubagentStop', aid: type }], 2000).phase, 'open', type);
  }
});

test('new SessionStart resets open and ignores late actors and skills from the old session', () => {
  const rows = [session, start('implementer'), { t: 2000, sid: 'tomorrow', ev: 'SessionStart', pie: 5 },
    start('plater', 'late', 2100), { t: 2200, sid: 'morning', ev: 'PreToolUse', skill: 'bytheslice:sell-pie', pie: 4 }];
  const state = foldActivity(rows, 3000, { mergedPie: merge });
  assert.equal(state.phase, 'dawn'); assert.deepEqual(state.active, []);
  assert.deepEqual(state.session, { id: 'tomorrow', startedAt: 2000, pie: 5 });
});

test('box-it-up skill finish and Stop alone never claim an immediate PR merge', () => {
  const rows = [session, start('implementer'), { t: 1200, sid: 'morning', ev: 'SubagentStop', aid: 'implementer' },
    { t: 1300, sid: 'morning', ev: 'PreToolUse', skill: 'bytheslice:box-it-up', pie: 4 },
    { t: 1400, sid: 'morning', ev: 'Stop', pie: 4 }];
  assert.equal(foldActivity(rows, 2000).phase, 'open');
  assert.equal(foldActivity(rows, 601400).phase, 'open');
  assert.equal(foldActivity(rows, 601401).phase, 'after-hours');
  assert.equal(foldActivity([...rows, start('discovery', 'background', 1500)], 601401).phase, 'open');
});

test('only a confirmed merge of this session active pie closes immediately', () => {
  const rows = [session, start('implementer')];
  assert.equal(foldActivity(rows, 2000, { mergedPie: merge }).phase, 'after-hours');
  for (const evidence of [null, {}, { ...merge, v: 2 }, { ...merge, pr: 0 }, { ...merge, pie: 5 },
    { ...merge, mergedAt: 999 }, { ...merge, mergedAt: 2001 }, { ...merge, mergedAt: '1500' }]) {
    assert.equal(foldActivity(rows, 2000, { mergedPie: evidence }).phase, 'open');
  }
  assert.equal(foldActivity([start('implementer')], 2000, { mergedPie: merge }).phase, 'open');
  assert.equal(foldActivity([...rows, { t: 1600, sid: 'morning', ev: 'PreToolUse', skill: 'sell-pie', pie: 5 }], 2000, { mergedPie: merge }).phase, 'open');
});

test('status board counts exactly match heading-based SessionStart hook, without activity overlays', async t => {
  const { root } = await fixture(t);
  const status = shopStatus(checklist);
  assert.deepEqual(status, { prep: { done: 3, total: 3 }, pies: { done: 1, total: 2, open: 1 }, slices: { done: 2, total: 4, open: 2 } });
  const result = spawnSync('bash', [path.join(__dirname, '../../hooks/shop-status.sh')], {
    env: { ...process.env, CLAUDE_PROJECT_DIR: root, BTS_HOOKS_DISABLED: '0' }, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Prep: 3\/3 boxes checked/);
  assert.match(result.stdout, /pies: 2 total, 1 completed \/ 1 open/);
  assert.match(result.stdout, /slices: 4 total, 2 completed \/ 2 open/);
  const state = buildSnapshot({ root, checklist, rows: [session, start('implementer')], now: 2000 });
  assert.deepEqual(state.shopStatus, status);
  const headingOnly = '## Prep\n- [ ] ready: n/a\n## Pie 2\nStatus: Completed\n### Slice 2.1\nStatus: Done\n';
  assert.equal(shopStatus(headingOnly).pies.done, 0);
  assert.equal(shopStatus(headingOnly).slices.done, 0);
  assert.equal(shopStatus(headingOnly).prep.done, 0);
});

test('confirmed merge writer keeps one allowlisted record and the reader remains local and read-only', async t => {
  const { root, dir } = await fixture(t);
  const confirmation = { state: 'MERGED', number: 123, mergedAt: new Date(1500).toISOString(), private: 'PRIVATE_SENTINEL' };
  await recordKitchenMerge({ root, mode: 'pie', pie: 4, confirmation, now: 2000 });
  const file = path.join(dir, 'merged-pie.json');
  assert.deepEqual(JSON.parse(await fs.readFile(file, 'utf8')), merge);
  const state = await readKitchenState(root, { now: 2000 });
  assert.equal(state.phase, 'after-hours');
  assert.equal(JSON.stringify(state).includes('PRIVATE_SENTINEL'), false);
  assert.deepEqual((await fs.readdir(dir)).sort(), ['activity.jsonl', 'merged-pie.json']);
  for (const mode of ['slice', 'universal']) await assert.rejects(recordKitchenMerge({ root, mode, pie: 4, confirmation }), /only written in pie mode/);
  for (const invalid of [{ ...confirmation, state: 'OPEN' }, { ...confirmation, number: 0 },
    { ...confirmation, mergedAt: null }, { ...confirmation, mergedAt: new Date(3000).toISOString() }]) {
    await assert.rejects(recordKitchenMerge({ root, mode: 'pie', pie: 4, confirmation: invalid, now: 2000 }), /confirmed MERGED PR/);
  }
  assert.deepEqual(JSON.parse(await fs.readFile(file, 'utf8')), merge);
  for (const bad of ['{bad', ' '.repeat(513), JSON.stringify({ ...merge, pie: 5 })]) {
    await fs.writeFile(file, bad); assert.equal((await readKitchenState(root, { now: 2000 })).phase, 'open');
  }
  await fs.rm(file); await fs.symlink(path.join(dir, 'activity.jsonl'), file);
  assert.equal((await readKitchenState(root, { now: 2000 })).phase, 'open');
});

// Execute the actual phase adapters with deferred actor arrivals, independent of WebGL.
async function phaseAdapters() {
  const html = await fs.readFile(path.join(__dirname, '../../skills/open-kitchen/kitchen.html'), 'utf8');
  const code = html.slice(html.indexOf('function phaseActor('), html.indexOf('const castDriver ='));
  const actor = id => ({ meta: { id }, task: '', mode: 'idle', hidden: true, arrivals: [],
    pos: { x: 0, z: 0 }, show(on) { this.hidden = !on; }, sync() {},
    doing(task, mode) { this.task = task; this.mode = mode; },
    walk() { this.mode = 'walk'; return new Promise(resolve => this.arrivals.push(resolve)); } });
  const chef = actor('orchestrator'), rhea = actor('retrospective-reviewer'), paz = actor('proposal-drafter');
  const calls = [], assignments = new Map(), phaseActors = new Map(), ledger = { visible: false };
  const context = vm.createContext({ sceneMode: 'live', livePhase: null, liveSessionKey: null, reviewActive: false,
    phaseActorGen: 0, chefGen: 0, liveShopStatus: null, A: { chef }, rhea, paz,
    liveAssignments: assignments, phaseActors, constructionWorkers: new Map(), shopper: { active: false }, ledger,
    F: { N: 0, W: 1 }, shortSkill: name => name.replace(/^bytheslice:/, ''),
    cancelActor(actor) { actor.mode = 'idle'; actor.task = 'Off duty'; },
    startAtDawn() { calls.push('dawn'); }, openShop() { calls.push('open'); }, closeShop() { calls.push('close'); },
    setTod(mode, fromSnapshot) { calls.push([mode, fromSnapshot]); }, setSign(on) { calls.push(on); }, chalkTex: { redraw() {} },
  });
  vm.runInContext(code, context);
  return { context, chef, rhea, paz, calls, assignments, phaseActors, ledger,
    sync: vm.runInContext('syncLivePhase', context) };
}
const phaseSnapshot = (phase, skills = [], id = 'morning') => ({ project: { root: '/fixture' }, phase,
  session: { id, startedAt: id === 'morning' ? 1000 : 2000 }, active: [], skills });

test('phase adapter ignores repeated polls and rejects arrivals from rapid reverse transitions', async () => {
  const scene = await phaseAdapters();
  scene.sync(phaseSnapshot('dawn'));
  const dawnArrival = scene.chef.arrivals.at(-1), calls = scene.calls.length;
  scene.sync(phaseSnapshot('dawn')); assert.equal(scene.calls.length, calls);
  scene.sync(phaseSnapshot('open'));
  const openArrival = scene.chef.arrivals.at(-1);
  scene.sync(phaseSnapshot('after-hours'));
  scene.sync(phaseSnapshot('dawn', [], 'tomorrow'));
  dawnArrival(); openArrival(); await Promise.resolve();
  assert.equal(scene.chef.task, 'Reading the shop status before opening');
  assert.equal(scene.chef.mode, 'walk');
  assert.ok(scene.rhea.hidden && scene.paz.hidden); assert.equal(scene.ledger.visible, false);
  assert.deepEqual(scene.calls.filter(value => typeof value === 'string'), ['dawn', 'open', 'close', 'dawn']);
});

test('only active close-shop creates review stand-ins and actual board agents retain ownership', async () => {
  const scene = await phaseAdapters();
  scene.sync(phaseSnapshot('after-hours'));
  assert.ok(scene.rhea.hidden && scene.paz.hidden); assert.equal(scene.ledger.visible, false);
  const skill = { name: 'bytheslice:close-shop', status: 'active' };
  scene.assignments.set('actual', { active: true, actor: scene.rhea });
  scene.rhea.task = 'Actual agent work'; scene.rhea.show(true);
  scene.sync(phaseSnapshot('after-hours', [skill]));
  const reviewArrival = scene.paz.arrivals.at(-1);
  assert.equal(scene.rhea.task, 'Actual agent work'); assert.equal(scene.phaseActors.has('retrospective-reviewer'), false);
  assert.equal(scene.ledger.visible, true); assert.equal(scene.paz.hidden, false);
  scene.sync(phaseSnapshot('after-hours'));
  reviewArrival(); await Promise.resolve();
  assert.equal(scene.paz.hidden, true); assert.equal(scene.ledger.visible, false);
  assert.equal(scene.rhea.hidden, false); assert.equal(scene.rhea.task, 'Actual agent work');
});

test('manual lighting calls cannot override a live snapshot or redirect its cast', async () => {
  const html = await fs.readFile(path.join(__dirname, '../../skills/open-kitchen/kitchen.html'), 'utf8');
  const source = html.slice(html.indexOf('function setTod('), html.indexOf("$('#bDawn').onclick"));
  const context = vm.createContext({ sceneMode: 'live', tod: 'dawn' });
  vm.runInContext(source, context);
  for (const mode of ['day', 'night', 'late']) vm.runInContext(`setTod('${mode}')`, context);
  assert.equal(context.tod, 'dawn');
  assert.match(html, /function startAtDawn\(\) \{\s+if \(sceneMode === 'live'\) \{ setTod\('dawn', true\); prepShop\(\); return; \}/);
  for (const name of ['prepShop', 'closeShop', 'openShop']) {
    assert.match(html, new RegExp(`function ${name}\\(\\) \\{\\s+if \\(sceneMode === 'live'\\) \\{[^\\n]*return; \\}`));
  }
});
