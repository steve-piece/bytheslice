// tests/kitchen/kitchen-order-line.test.js
// Verifies snapshot order normalization and actual scene queue reconciliation with deferred walking actors.
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { buildSnapshot } = require('../../mcp/kitchen-state.js');
const html = fs.readFileSync(path.join(__dirname, '../../skills/open-kitchen/kitchen.html'), 'utf8');
const normalization = html.slice(html.indexOf('function snapshotOrders('), html.indexOf('let liveLineRoot ='));
const order = (n, count = 2, status = 'open') => ({ id: `pie-${n}`, pie: n, title: `Order ${n}`, status,
  slices: Array.from({ length: count }, (_, i) => ({ number: `${n}.${i + 1}`, title: `Work ${i + 1}`, status })) });
const snapshot = (pies, active = [], root = '/fixture') => ({ project: { root }, pies, active });
const json = value => JSON.parse(JSON.stringify(value));

function adapter() {
  const actors = [], elements = new Map(), overlays = [], calls = [], phaseActors = new Map();
  const element = () => ({ textContent: '', className: '', isConnected: false, children: [],
    setAttribute() {}, replaceChildren() { this.children = []; },
    append(child) { child.isConnected = true; this.children.push(child); }, remove() { this.isConnected = false; } });
  const coBox = element(), root = { remove() {} }, shelfPies = [];
  class Actor {
    constructor(id, look, x, z) {
      this.pos = { x, y: .06, z }; this.g = { position: { x, z } }; this.path = []; this.mode = 'idle';
      this.meta = { id }; this.hidden = false; actors.push(this);
    }
    walk(points) { this.path = points.map(([x, z]) => ({ x, z })); this.mode = 'walk'; return new Promise(resolve => { this.res = resolve; }); }
    face() {} show(on) { this.hidden = !on; } doing(task, mode) { this.task = task; this.mode = mode; }
  }
  const A = { ezra: new Actor('ezra', {}, 0, 0), pia: new Actor('pia', {}, 0, 0) };
  const context = vm.createContext({ sceneMode: 'live', COOKS: [0, 1, 2, 3], Actor, actors, root,
    simT: 0, closed: false, cur: null, pizza: null, served: [], shelfPies, OV: overlays,
    skins: [0], F: { N: 0, E: 1, S: 2, W: 3 }, A, phaseActors,
    window: { addEventListener() {} }, document: { createElement: element }, coBox,
    $: id => { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); },
    sheet: { hidden: true }, nm: o => o.slice ? `Slice ${o.sid}` : `Pie ${o.n}`,
    tagFor(actor, text) { actor.tagEl = element(); actor.tagEl.textContent = text; actor.tagO = { el: actor.tagEl, on: true }; overlays.push(actor.tagO); },
    callout(text) { calls.push(text); }, feed(text) { calls.push(text); }, setTickets() {}, renderStats() {}, renderOrder() {}, renderOrdersSheet() {},
    cancelActor(actor) { actor.path = []; actor.res = null; actor.mode = 'idle'; },
    phaseActor(actor, station, task) { phaseActors.set(actor.meta.id, { task, actor }); actor.task = task; actor.show(true); },
    makePizza(count, single) { calls.push(['pizza', count, single]); return { g: { visible: true }, wedges: Array.from({ length: count }, () => ({})) }; },
    setWedge(pizza, i, state) { pizza.wedges[i].state = state; }, addServed() { shelfPies.push({}); },
    activeRing: { visible: false, position: { set() {} }, scale: { set() {} } },
  });
  const customers = html.slice(html.indexOf('const custQueue ='), html.indexOf('// the customer whose order'));
  const update = html.slice(html.indexOf('function lineUpdate()'), html.indexOf('// Snapshot order data'));
  const reconcile = html.slice(html.indexOf('// Snapshot order data'), html.indexOf('// ---------- the service:'));
  vm.runInContext(customers + update + reconcile, context);
  return { context, calls, actors, shelfPies, phaseActors,
    sync: vm.runInContext('syncOrderLine', context), clear: vm.runInContext('clearLiveLine', context),
    queue: () => vm.runInContext('custQueue', context), events: () => json(vm.runInContext('orderEvents', context)),
    normalize: vm.runInContext('snapshotOrders', context), qslot: vm.runInContext('qslot', context) };
}

test('normalization keeps full plan order without a queue cap and unique slots extend beyond the mockup', () => {
  const scene = adapter(), pies = Array.from({ length: 65 }, (_, index) => order(index + 1));
  scene.sync(snapshot(pies));
  assert.equal(scene.queue().length, 65);
  assert.deepEqual(json(scene.queue().map(customer => customer.order.n)), pies.map(pie => pie.pie));
  assert.equal(new Set(scene.queue().map((_, index) => JSON.stringify(scene.qslot(index)))).size, 65);
  assert.ok(scene.qslot(64)[0] < scene.qslot(63)[0]);
});

test('a second active order swaps spots by walking, retaining positions and rings and chimes once', () => {
  const scene = adapter(), pies = [order(4), order(7), order(5)];
  scene.sync(snapshot(pies));
  const first = scene.queue()[0], second = scene.queue()[1], before = json(second.pos);
  scene.sync(snapshot(pies, [{ pie: 7, slice: '7.1', startedAt: 2 }]));
  assert.deepEqual(json(scene.queue().map(customer => customer.order.n)), [7, 4, 5]);
  assert.deepEqual(json(second.pos), before);
  assert.equal(second.path.length, 3); assert.equal(first.mode, 'walk');
  assert.equal(scene.context.activeRing.visible, true);
  scene.sync(snapshot(pies, [{ pie: 7, slice: '7.1', startedAt: 2 }]));
  assert.equal(scene.events().filter(event => event.type === 'new-order').length, 1);
  assert.equal(scene.events().filter(event => event.type === 'chime').length, 1);
  assert.equal(scene.events().filter(event => event.type === 'swap').length, 1);
});

test('later orders join the back with a plain Added to the plan ticket and repeated polls do not duplicate', () => {
  const scene = adapter(); scene.sync(snapshot([order(4), order(7)]));
  scene.sync(snapshot([order(4), order(9), order(7)]));
  assert.deepEqual(json(scene.queue().map(customer => customer.order.n)), [4, 7, 9]);
  const added = scene.queue().at(-1);
  assert.equal(added.tagEl.textContent, 'Added to the plan: Pie 9');
  assert.equal(added.tagEl.className, 'tag');
  assert.equal(added.pos.x, -44); assert.equal(added.mode, 'walk');
  scene.sync(snapshot([order(4), order(9), order(7)])); assert.equal(scene.queue().length, 3);
  assert.equal(scene.calls.length, 0, 'planned additions do not call out or chime');
});

test('one-slice pies and standalone orders create one slice, served pies populate only the pie shelf', () => {
  const scene = adapter(), single = order(8, 1), done = order(2, 3, 'done'), standalone = { ...order(9, 1), id: 'standalone-slice-9.1', single: true };
  scene.sync(snapshot([done, single, standalone], [{ pie: 8, slice: '8.1' }]));
  assert.equal(scene.queue()[0].tagEl.textContent, 'Slice 8.1 · Now baking');
  assert.deepEqual(scene.calls.find(Array.isArray), ['pizza', 1, true]);
  assert.equal(scene.shelfPies.length, 1);
  single.status = 'done'; single.slices[0].status = 'done';
  scene.sync(snapshot([done, single, standalone]));
  assert.equal(scene.shelfPies.length, 1); assert.equal(scene.queue().length, 1);
  assert.equal(scene.normalize(snapshot([standalone])).open[0].slice, true);
});

test('zero open orders clears tickets and ring, keeps waiting crew and persistent exact note', () => {
  const scene = adapter(); scene.sync(snapshot([order(4)], [{ pie: 4 }]));
  scene.sync(snapshot([order(4, 2, 'done')]));
  assert.equal(scene.queue().length, 0); assert.equal(scene.context.cur, null); assert.equal(scene.context.pizza, null);
  assert.equal(scene.context.activeRing.visible, false); assert.equal(scene.shelfPies.length, 1);
  assert.equal(vm.runInContext('liveAllServed.textContent', scene.context), 'All orders served. Close this window, or run `/special-order` to add a pie or a slice.');
  assert.equal(scene.phaseActors.size, 2);
  scene.sync(snapshot([order(5)])); assert.equal(vm.runInContext('liveAllServed', scene.context), null);
});

test('incomplete snapshots preserve the last known line without announcing all served', () => {
  const scene = adapter(); scene.sync(snapshot([order(4)]));
  for (const pies of [undefined, null, [{ id: 'broken' }], [order(4), order(4)]]) {
    scene.sync(snapshot(pies)); assert.equal(scene.queue().length, 1);
    assert.equal(vm.runInContext('liveAllServed', scene.context), null);
  }
});

test('rapid active changes and cancellation cannot revive customers through walking callbacks', () => {
  const scene = adapter(), pies = [order(4), order(5), order(6)]; scene.sync(snapshot(pies));
  scene.sync(snapshot(pies, [{ pie: 5 }]));
  const removed = scene.queue()[0], oldArrival = removed.res;
  scene.sync(snapshot([pies[0], pies[2]], [{ pie: 6 }]));
  oldArrival();
  assert.deepEqual(json(scene.queue().map(customer => customer.order.n)), [6, 4]);
  assert.equal(scene.actors.includes(removed), false); assert.equal(removed.hidden, true);
  scene.sync(snapshot([pies[0], pies[2]], [{ pie: 4 }]));
  assert.deepEqual(json(scene.queue().map(customer => customer.order.n)), [4, 6]);
  assert.equal(new Set(scene.queue().map(customer => customer.order.key)).size, 2);
  scene.clear(); assert.deepEqual(scene.events(), []);
  scene.context.sceneMode = 'demo'; scene.sync(snapshot([])); assert.equal(scene.queue().length, 2);
});

test('active standalone slice attribution wins over an ambiguous pie number', () => {
  const context = vm.createContext({ COOKS: [0, 1] }); vm.runInContext(normalization, context);
  const pie = order(4), single = { ...order(4, 1), id: 'standalone-slice-4.9', slices: [{ number: '4.9', title: 'Extra', status: 'open' }] };
  const data = vm.runInContext('snapshotOrders', context)(snapshot([pie, single], [{ pie: 4, slice: '4.9' }]));
  assert.equal(data.active, single.id);
});


test('actual checklist parser supports standalone Slice headers, one-slice pies and legacy single stages', () => {
  const checklist = `## Pie 3 - Small pie
### Slice 3.1 - One task
## Slice 8.1 - Outside a pie
## Notes
### Slice 9.2 - Orphan slice
## Stage 12 - Legacy single task
`;
  const snapshot = buildSnapshot({ root: '/fixture/parser', checklist,
    rows: [{ t: 1000, sid: 'parser', ev: 'SessionStart' },
      { t: 1100, sid: 'parser', ev: 'SubagentStart', aid: 'single', agent: 'bytheslice:implementer', pie: 8, slice: '8.1' }], now: 1200 });
  const scene = adapter(), data = scene.normalize(snapshot);
  assert.deepEqual(json(data.open.map(order => [order.key, order.slice, order.sid])), [
    ['pie-3', true, '3.1'], ['standalone-slice-8.1', true, '8.1'],
    ['standalone-slice-9.2', true, '9.2'], ['standalone-stage-12', true, '12']]);
  scene.sync(snapshot);
  assert.equal(scene.queue()[0].order.key, 'standalone-slice-8.1');
  assert.deepEqual(scene.calls.find(Array.isArray), ['pizza', 1, true]);
  assert.equal(scene.context.pizza.wedges[0].state, 'ok');
});

test('the actual live makePizza path calls makeSlice for a single order', () => {
  const source = html.slice(html.indexOf('function makePizza('), html.indexOf('// one slice on its own plate'));
  const group = { userData: {} }, calls = [];
  const context = vm.createContext({ sceneMode: 'live', PIZ: { x: 0, y: 0, z: 0 }, root: {}, G: () => group,
    makeSlice(g) { calls.push(g); return { single: true }; } });
  vm.runInContext(source, context);
  const result = vm.runInContext('makePizza(1, true)', context);
  assert.equal(result.single, true); assert.equal(calls[0], group); assert.equal(group.userData.orderSource, 'live');
});

test('live customer cards, station cards, tracker attributes and Orders sheets escape plan titles', () => {
  const unsafe = '<img src=x onerror=alert(1)>', escaped = '&lt;img src=x onerror=alert(1)&gt;';
  const current = { o: { n: 4, title: unsafe }, slices: [{ id: '4.1', name: unsafe, st: 0, status: 'waiting' }], stage: 1 };
  const element = { innerHTML: '', addEventListener() {} }, cards = [];
  const context = vm.createContext({ cur: current, sceneMode: 'live', STEP: ['Ticket', 'Line'],
    CHIP: { waiting: ['c-wait', 'Waiting'] }, sliceLabel: () => 'Waiting', STEP_WORD: {}, taskNote: () => '',
    nm: order => `Pie ${order.n}`, custQueue: [], parked: [], served: [], $: () => element, sheet: { dataset: {} },
    stationObjs: [{}], STATION: [{ name: 'UI' }], COOKS: [{ meta: { name: 'Cook', id: 'cook' } }],
    tapTarget(g, card) { cards.push(card); } });
  const escapeSource = html.slice(html.indexOf('function escapeCard('), html.indexOf('let tipAnchor'));
  const customerSource = html.slice(html.indexOf('function actorCard('), html.indexOf('function tap(x, y)'));
  const sheetSource = html.slice(html.indexOf('function renderOrdersSheet('), html.indexOf("$('#bLog').onclick"));
  const stationSource = html.slice(html.indexOf('stationObjs.forEach((g, i) => tapTarget'), html.indexOf("{ const o = root.getObjectByName('board86')"));
  vm.runInContext(escapeSource + customerSource + sheetSource + stationSource, context);
  const customer = { isCustomer: true, order: { n: 4, title: unsafe, desc: unsafe, slices: [[unsafe]] } };
  const card = vm.runInContext('actorCard', context)(customer);
  assert.ok(card.includes(escaped)); assert.equal(card.includes(unsafe), false);
  assert.ok(cards[0]().includes(escaped)); assert.equal(cards[0]().includes(unsafe), false);
  vm.runInContext('renderOrdersSheet()', context);
  assert.ok(element.innerHTML.includes(escaped)); assert.equal(element.innerHTML.includes(unsafe), false);
  const trackerSource = html.slice(html.indexOf('function renderOrder('), html.indexOf('function renderStats('));
  assert.ok(trackerSource.includes('escapeCard(sl.name)'));
});
