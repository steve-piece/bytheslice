// tests/kitchen/kitchen-build-out.test.js
// Tests actual setup-piece evidence, existing-project exceptions, library routes, and install diffs.
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const { buildSnapshot, readKitchenState } = require('../../mcp/kitchen-state.js');
const names = ['walls', 'menu', 'tickets', 'case', 'safe', 'oven', 'alarm', 'locks'];

async function scratch(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kitchen-build-out-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}
async function write(root, file, text = '') {
  await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true });
  await fs.writeFile(path.join(root, file), text);
}

test('empty roots have eight actually absent applicable pieces; config appears on the next read', async t => {
  const root = await scratch(t);
  const empty = await readKitchenState(root);
  assert.equal(empty.project.setup, 'none');
  assert.deepEqual(Object.keys(empty.project.pieces), names);
  for (const piece of Object.values(empty.project.pieces)) assert.deepEqual(piece, { present: false, applicable: true, source: 'missing' });
  await write(root, 'bytheslice.config.json', '{}');
  const next = await readKitchenState(root);
  assert.equal(next.project.setup, 'partial');
  assert.deepEqual(next.project.pieces.walls, { present: true, applicable: true, source: 'config' });
  assert.equal(next.project.pieces.oven.present, false);
});

test('each piece derives from its own on-disk marker and never includes env contents', async t => {
  const root = await scratch(t);
  for (const file of ['bytheslice.config.json', 'docs/prd-kitchen.md', 'docs/plans/00_master_checklist.md',
    'docs/design-system.md', '.claude/.bytheslice-state/env-check-passed', '.github/workflows/build.yml',
    '.husky/pre-push', 'scripts/setup-branch-protection.sh']) await write(root, file, 'pass\n');
  await write(root, '.env.local', 'SECRET=PRIVATE_SENTINEL');
  const state = await readKitchenState(root);
  assert.equal(state.project.setup, 'built');
  assert.ok(Object.values(state.project.pieces).every(piece => piece.present && piece.applicable));
  assert.equal(JSON.stringify(state).includes('PRIVATE_SENTINEL'), false);
  await fs.unlink(path.join(root, '.claude/.bytheslice-state/env-check-passed'));
  assert.equal((await readKitchenState(root)).project.pieces.safe.present, false);
});

test('actual library route filenames satisfy the case without source reads or following symlinks', async t => {
  const root = await scratch(t);
  await write(root, 'apps/web/src/app/(operator)/library/page.tsx', 'PRIVATE_SENTINEL');
  assert.deepEqual((await readKitchenState(root)).project.pieces.case, { present: true, applicable: true, source: 'library' });
  await fs.rm(path.join(root, 'apps'), { recursive: true });
  await write(root, 'src/components/library/index.tsx');
  await write(root, 'docs/prd-directory.md/placeholder');
  assert.equal((await readKitchenState(root)).project.pieces.case.present, false);
  assert.equal((await readKitchenState(root)).project.pieces.menu.present, false);
  await fs.symlink('/tmp', path.join(root, 'src/app'));
  assert.equal((await readKitchenState(root)).project.pieces.case.present, false);
});

test('a completed display-case exception does not suppress unrelated missing pieces', () => {
  for (const checklist of ['## Prep\n[x] Ready\n', '## Prep\n[ ] Display case: n/a\n']) {
    assert.equal(buildSnapshot({ root: '/fixture', checklist }).project.pieces.case.applicable, true);
  }
  const checklist = '## Prep\n[x] Display case: n/a because no frontend\n[x] Configuration complete\n';
  const state = buildSnapshot({ root: '/fixture', checklist, markers: { config: true, checklist: true } });
  assert.equal(state.project.setup, 'built');
  assert.equal(state.project.pieces.case.applicable, false);
  assert.equal(state.project.pieces.case.present, false);
  for (const name of ['menu', 'safe', 'oven', 'alarm', 'locks']) {
    assert.deepEqual(state.project.pieces[name], { present: false, applicable: true, source: 'missing' });
  }
  assert.deepEqual(state.project.pieces.tickets, { present: true, applicable: true, source: 'checklist' });
});

test('completed Prep scopes explicit piece exemptions and retains their evidence', () => {
  const metadata = '<!-- kitchen-piece-exemption: walls, menu | Existing CLI scaffold and approved roadmap. -->\n' +
    '<!-- kitchen-piece-exemption: oven, alarm, locks | Local hooks and plugin validation replace hosted app gates. -->\n';
  const checklist = '## Prep\n[x] Display case: n/a for no app UI\n[x] Shop open: n/a for no external credentials\n' +
    '## Pie 4\n' + metadata;
  const state = buildSnapshot({ root: '/fixture', checklist, markers: { checklist: true } });
  assert.equal(state.project.setup, 'built');
  for (const name of names.filter(name => name !== 'tickets')) {
    assert.equal(state.project.pieces[name].present, false);
    assert.equal(state.project.pieces[name].applicable, false, name);
    assert.equal(state.project.pieces[name].source, 'completed-prep');
    assert.ok(state.project.pieces[name].evidence.length > 0);
  }
  const unfinished = buildSnapshot({ root: '/fixture', checklist: '## Prep\n[ ] Ready\n' + metadata });
  assert.ok(Object.values(unfinished.project.pieces).every(piece => piece.applicable));
  const present = buildSnapshot({ root: '/fixture', checklist, markers: { prd: true } });
  assert.deepEqual(present.project.pieces.menu, { present: true, applicable: true, source: 'prd' });
});

test('build driver installs once on a presence edge, resets roots, and handles removal and n/a', async () => {
  const html = await fs.readFile(path.join(__dirname, '../../skills/open-kitchen/kitchen.html'), 'utf8');
  const context = { window: {} }; vm.createContext(context);
  new vm.Script(html.match(/<script id="kitchen-build-out">([\s\S]*?)<\/script>/)[1]).runInContext(context);
  const events = [];
  const driver = context.window.createKitchenBuildDriver({ render: (...event) => events.push(event) });
  const snapshot = (root, pieces) => ({ project: { root, setup: 'partial', pieces } });
  const missing = Object.fromEntries(names.map(name => [name, false]));
  driver.apply(snapshot('/one', missing));
  assert.equal(events.length, 8); assert.ok(events.every(([, state, animation]) => state === 'gutted' && !animation));
  driver.apply(snapshot('/one', { ...missing, oven: true }));
  assert.deepEqual(events.at(-1), ['oven', 'finished', true]);
  driver.apply(snapshot('/one', { ...missing, oven: true })); assert.equal(events.length, 9);
  driver.apply(snapshot('/one', missing)); assert.deepEqual(events.at(-1), ['oven', 'gutted', false]);
  driver.apply(snapshot('/other', { ...missing, oven: true })); assert.deepEqual(events.at(-3), ['oven', 'finished', false]);
  driver.apply(snapshot('/other', { ...missing, oven: { present: false, applicable: false } }));
  assert.deepEqual(events.at(-1), ['oven', 'not-applicable', false]);
});

// Run the actual scene adapters with deferred actor arrivals, without loading the town renderer.
async function sceneAdapters() {
  const html = await fs.readFile(path.join(__dirname, '../../skills/open-kitchen/kitchen.html'), 'utf8');
  const code = html.slice(html.indexOf('const liveAssignments ='), html.indexOf('const castDriver ='));
  const ids = ['bootstrap-runner', 'config-generator', 'platform-walker'];
  const byId = Object.fromEntries(ids.map(id => [id, { id, name: id, type: id, crew: id === 'platform-walker' ? 'door' : 'setup' }]));
  const actors = ids.map(id => ({
    meta: byId[id], mode: 'idle', task: '', hidden: false, path: [], walks: [],
    pos: { x: 0, z: 0, set(x, y, z) { this.x = x; this.z = z; } },
    doing(task, mode) { this.task = task; this.mode = mode; },
    show(visible) { this.hidden = !visible; }, sync() {},
    walk(route) {
      this.mode = 'walk'; this.path = route;
      return new Promise(resolve => { this.walks.push(() => { this.path = []; this.mode = 'idle'; resolve(); }); });
    },
  }));
  const timers = [];
  const context = vm.createContext({
    window: { dispatchEvent() {}, kitchenWords: { start: () => '', finish: () => '', pieOf: () => null } }, sceneMode: 'live', byId, castHomes: new Map(),
    castActors: new Map(actors.map(actor => [actor.meta.id, actor])),
    buildPieces: new Map(names.map(name => [name, { state: 'gutted', install: false }])),
    STATION: [{ name: 'Make line' }], SX: [0], F: { N: 0, S: 1, W: 2, E: 3 }, DOOR: [0, 0],
    root: { remove() {} }, OV: [], feed() {}, say() {}, clearTimeout() {},
    STEP_WORD: {}, TOWN_CREW: () => [], dropTownCrew() {}, document: { createElement: () => ({}) }, overlay: el => ({ el, on: true }), tmpV: { set() { return this; } },
    setTimeout(callback) { timers.push(callback); return timers.length; },
  });
  vm.runInContext(code, context);
  const api = vm.runInContext('({ agentOn, agentOff, syncBuildCrews, updateConstruction, clearAssignments, constructionWorkers, shopper, liveAssignments })', context);
  return { ...api, actors: Object.fromEntries(actors.map(actor => [actor.meta.id, actor])), byId, timers };
}
const sceneSnapshot = (skills = [], active = []) => ({ skills: skills.map(name => ({ name, status: 'active' })), active });
const sceneEvent = (scene, id, key = id) => ({ key, character: scene.byId[id], row: { aid: key, label: 'Normal assignment' }, ok: true });
const flushArrivals = async () => { await Promise.resolve(); await Promise.resolve(); };

test('construction owns actor paths and tasks across real agent start, updates, and stop', async () => {
  const scene = await sceneAdapters(), actor = scene.actors['bootstrap-runner'];
  const snapshot = sceneSnapshot(['setup-shop']);
  scene.syncBuildCrews(snapshot);
  const constructionPath = actor.path, event = sceneEvent(scene, 'bootstrap-runner');
  scene.agentOn(event); scene.syncBuildCrews(snapshot);
  assert.strictEqual(actor.path, constructionPath);
  scene.agentOn({ ...event, row: { ...event.row, label: 'Updated assignment' } });
  assert.equal(actor.task, 'Installing walls');
  scene.agentOff(event); scene.syncBuildCrews(snapshot);
  assert.strictEqual(actor.path, constructionPath);
  assert.equal(scene.timers.length, 0);
  actor.walks[0](); await flushArrivals();
  assert.equal(actor.mode, 'work'); assert.equal(actor.task, 'Installing walls');
  scene.syncBuildCrews(sceneSnapshot());
  assert.equal(scene.constructionWorkers.size, 0); assert.equal(actor.hidden, true);
});

test('construction rejects old normal arrivals and resumes the active assignment only on release', async () => {
  const scene = await sceneAdapters(), actor = scene.actors['bootstrap-runner'];
  const event = sceneEvent(scene, 'bootstrap-runner');
  scene.agentOn(event);
  const oldArrival = actor.walks.at(-1);
  scene.syncBuildCrews(sceneSnapshot(['setup-shop']));
  oldArrival(); await flushArrivals();
  assert.equal(actor.task, 'Installing walls');
  actor.walks.at(-1)(); await flushArrivals();
  scene.syncBuildCrews(sceneSnapshot());
  assert.equal(actor.mode, 'walk'); assert.equal(actor.hidden, false);
  actor.walks.at(-1)(); await flushArrivals();
  assert.equal(actor.task, 'Normal assignment'); assert.equal(actor.mode, 'work');
});

test('Wally patrol survives agent stop while inspect-display remains and stops when both sources end', async () => {
  const scene = await sceneAdapters(), actor = scene.actors['platform-walker'];
  const event = sceneEvent(scene, 'platform-walker');
  scene.syncBuildCrews(sceneSnapshot(['inspect-display']));
  const route = actor.path;
  scene.agentOn(event);
  scene.syncBuildCrews(sceneSnapshot(['inspect-display'], [{ type: 'bytheslice:platform-walker' }]));
  assert.strictEqual(actor.path, route);
  scene.agentOff(event); scene.syncBuildCrews(sceneSnapshot(['inspect-display']));
  assert.strictEqual(actor.path, route); assert.equal(scene.timers.length, 0);
  actor.walks.at(-1)(); await flushArrivals();
  assert.equal(scene.shopper.arrived, true); assert.equal(actor.task, 'Tapping Order window');
  scene.updateConstruction(1);
  assert.equal(actor.mode, 'walk'); assert.equal(scene.shopper.index, 1);
  scene.syncBuildCrews(sceneSnapshot());
  assert.equal(scene.shopper.active, false); assert.equal(actor.hidden, true);
});

test('Wally agent-only ownership, old arrivals, and off-duty callbacks cannot override a new patrol', async () => {
  const scene = await sceneAdapters(), actor = scene.actors['platform-walker'];
  const event = sceneEvent(scene, 'platform-walker');
  scene.agentOn(event);
  const oldNormalArrival = actor.walks.at(-1);
  scene.syncBuildCrews(sceneSnapshot([], [{ type: 'bytheslice:platform-walker' }]));
  oldNormalArrival(); await flushArrivals();
  assert.equal(actor.task, 'Secret shopper: Order window');
  const oldPatrolArrival = actor.walks.at(-1);
  scene.syncBuildCrews(sceneSnapshot());
  scene.agentOff(event);
  const offDuty = scene.timers.at(-1);
  scene.syncBuildCrews(sceneSnapshot(['inspect-display']));
  oldPatrolArrival(); await flushArrivals();
  assert.equal(scene.shopper.arrived, false);
  offDuty();
  assert.equal(actor.task, 'Secret shopper: Order window');
  actor.walks.at(-1)(); await flushArrivals();
  assert.equal(scene.shopper.arrived, true);
  const lateArrival = actor.walks.at(-1);
  scene.clearAssignments();
  lateArrival(); await flushArrivals();
  assert.equal(scene.shopper.active, false); assert.equal(actor.hidden, true);
});
