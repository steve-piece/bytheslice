// tests/kitchen/kitchen-cast.test.js
// Exercises deterministic snapshot diffs, character allocation, completion results, and demo selection.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../../skills/open-kitchen/kitchen.html'), 'utf8');
const source = html.match(/<script id="kitchen-cast">([\s\S]*?)<\/script>/)[1];
const row = (aid, type = 'bytheslice:implementer', extra = {}) => ({ aid, type, sid: 'session', label: 'P4 S4.3 build', ...extra });
const snapshot = (active = [], extra = {}) => ({ project: { root: '/fixture', setup: 'built' }, active, skills: [], recent: [], ...extra });
function driver() {
  const window = {};
  vm.runInNewContext(source, { window });
  const events = [], modes = [];
  const roster = {
    implementer: { id: 'implementer', name: 'Ren', crew: 'line', tier: 'opus' },
    'implementer#2': { id: 'implementer#2', name: 'Dom', crew: 'line', tier: 'opus' },
    discovery: { id: 'discovery', name: 'Pip', crew: 'line', tier: 'opus' },
    'brief-analyzer': { id: 'brief-analyzer', name: 'Bree', crew: 'menu', tier: 'sonnet' },
  };
  const cast = window.createKitchenCastDriver({ roster, emit: (type, event) => events.push({ type, ...event }),
    demo: () => modes.push('demo'), live: () => modes.push('live') });
  return { cast, events, modes };
}

test('repeated polls and reordered agents preserve Ren and Dom without duplicate starts', () => {
  const { cast, events } = driver();
  cast.apply(snapshot([row('one'), row('two')]));
  assert.deepEqual(events.map(event => event.character.name), ['Ren', 'Dom']);
  cast.apply(snapshot([row('two'), row('one')]));
  assert.equal(events.length, 2);
  cast.apply(snapshot([row('two'), row('three')]));
  assert.equal(events.at(-2).type, 'agentOff');
  assert.equal(events.at(-1).character.name, 'Ren');
});

test('extra plugin instances use division helpers and nonplugin types use pass temps', () => {
  const { cast, events } = driver();
  cast.apply(snapshot([row('one'), row('two'), row('three'), row('four', 'Explore'), row('five', 'custom') ,
    row('six', 'bytheslice:brief-analyzer'), row('seven', 'bytheslice:brief-analyzer')]));
  assert.equal(events[2].character.id, 'helper:line:1');
  assert.equal(events[2].character.tier, 'opus');
  assert.equal(events[3].character.name, 'Temp 1');
  assert.equal(events[3].character.crew, 'pass');
  assert.equal(events[3].character.type, 'Explore');
  assert.equal(events[4].character.id, 'helper:pass:2');
  assert.equal(events[6].character.crew, 'menu');
});

test('completion reads the matching session result and defaults to Done', () => {
  const { cast, events } = driver();
  cast.apply(snapshot([row('one'), row('two')]));
  cast.apply(snapshot([], { recent: [{ aid: 'one', sid: 'session', ok: false }, { aid: 'one', sid: 'old', ok: true }] }));
  const stopped = events.filter(event => event.type === 'agentOff');
  assert.equal(stopped[0].ok, false);
  assert.equal(stopped[1].ok, true);
});

test('label updates preserve assignment and session changes produce a stop and a start', () => {
  const { cast, events } = driver();
  cast.apply(snapshot([row('one')]));
  cast.apply(snapshot([row('one', undefined, { label: 'New label' })]));
  assert.equal(events[1].update, true);
  assert.equal(events[1].character.name, 'Ren');
  cast.apply(snapshot([row('one', undefined, { sid: 'next' })]));
  assert.deepEqual(events.slice(-2).map(event => event.type), ['agentOff', 'agentOn']);
});

test('active skills emit only starts and stops, with historical completed skills ignored', () => {
  const { cast, events } = driver();
  const skill = { sid: 'session', name: 'bytheslice:sell-pie', startedAt: 100, status: 'active' };
  cast.apply(snapshot([], { skills: [skill] }));
  cast.apply(snapshot([], { skills: [skill] }));
  cast.apply(snapshot([], { skills: [{ ...skill, status: 'done' }] }));
  assert.deepEqual(events.map(event => event.type), ['skillOn', 'skillOff']);
});

test('only absent setup is ignored and none selects demo while partial and built select live', () => {
  const { cast, events, modes } = driver();
  cast.apply({});
  assert.equal(cast.mode, null);
  cast.apply(snapshot([], { project: { root: '/fixture', setup: 'none' } }));
  cast.apply(snapshot([], { project: { root: '/fixture', setup: 'none' } }));
  cast.apply(snapshot([row('one')], { project: { root: '/fixture', setup: 'partial' } }));
  cast.apply(snapshot([row('one')]));
  assert.deepEqual(modes, ['demo', 'live']);
  assert.equal(events.length, 1);
  cast.apply(snapshot([row('one')], { project: { root: '/other', setup: 'built' } }));
  assert.deepEqual(modes, ['demo', 'live', 'live']);
  assert.equal(events.length, 2);
});

test('scripted service starts exclusively inside demoDriver', () => {
  const serviceCalls = html.match(/\bservice\(\);/g) || [];
  assert.equal(serviceCalls.length, 1);
  assert.match(html, /function demoDriver\(\) \{[\s\S]*?service\(\); startAtDawn\(\);/);
});
