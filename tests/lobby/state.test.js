// tests/lobby/state.test.js
// Covers lobby state derivation and priority, per-project progress, session rollup, stale-signal cleanup, registry prune and damage.
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const test = require('node:test');
const { deriveState, readProject, readLobby, readRegistry, SIGNAL_MAX_AGE_MS } = require('../../mcp/lobby-state.js');
const { CHECKLIST_ACTIVE, CHECKLIST_DONE, sandbox, project, register, signal, hitlRows, fakeKitchen } = require('./helpers.js');

const NOW = 1_800_000_000_000;
const sig = fields => ({ sid: 's', root: '/p', t: NOW - 1000, working: false, subagents: 0, waiting: null, ...fields });
const donePies = [{ status: 'done' }, { status: 'done' }];
const openPies = [{ status: 'done' }, { status: 'open' }];
const noKitchen = async () => null;

test('needs-you from open HITL', () => {
  assert.equal(deriveState({ openHitl: 1, signals: [], pies: openPies, now: NOW }), 'needs-you');
  assert.equal(deriveState({ openHitl: 2, signals: [], pies: donePies, now: NOW }), 'needs-you');
});

test('needs-you from waiting: permission and from waiting: idle', () => {
  assert.equal(deriveState({ openHitl: 0, signals: [sig({ waiting: 'permission' })], pies: openPies, now: NOW }), 'needs-you');
  assert.equal(deriveState({ openHitl: 0, signals: [sig({ waiting: 'idle' })], pies: openPies, now: NOW }), 'needs-you');
});

test('active from working', () => {
  assert.equal(deriveState({ openHitl: 0, signals: [sig({ working: true })], pies: openPies, now: NOW }), 'active');
});

test('active from subagents: 2 with working: false', () => {
  assert.equal(deriveState({ openHitl: 0, signals: [sig({ working: false, subagents: 2 })], pies: openPies, now: NOW }), 'active');
});

test('done only when every pie done and idle', () => {
  assert.equal(deriveState({ openHitl: 0, signals: [], pies: donePies, now: NOW }), 'done');
  assert.equal(deriveState({ openHitl: 0, signals: [sig({ working: false })], pies: donePies, now: NOW }), 'done');
  assert.equal(deriveState({ openHitl: 0, signals: [sig({ working: true })], pies: donePies, now: NOW }), 'active');
  assert.equal(deriveState({ openHitl: 0, signals: [], pies: openPies, now: NOW }), 'inactive');
  assert.equal(deriveState({ openHitl: 0, signals: [], pies: [], now: NOW }), 'inactive');
  assert.equal(deriveState({ openHitl: 0, signals: [], pies: { done: 3, total: 3 }, now: NOW }), 'done');
  assert.equal(deriveState({ openHitl: 0, signals: [], pies: { done: 0, total: 0 }, now: NOW }), 'inactive');
});

test('inactive after Stop with zero subagents', () => {
  assert.equal(deriveState({ openHitl: 0, signals: [sig({ working: false, subagents: 0, waiting: null })], pies: openPies, now: NOW }), 'inactive');
});

test('priority needs-you over active over done', () => {
  const all = [sig({ working: true, subagents: 3 }), sig({ sid: 'b', waiting: 'permission' })];
  assert.equal(deriveState({ openHitl: 0, signals: all, pies: donePies, now: NOW }), 'needs-you');
  assert.equal(deriveState({ openHitl: 1, signals: [sig({ working: true })], pies: donePies, now: NOW }), 'needs-you');
  assert.equal(deriveState({ openHitl: 0, signals: [sig({ subagents: 1 })], pies: donePies, now: NOW }), 'active');
  assert.equal(deriveState({ openHitl: 0, signals: [], pies: donePies, now: NOW }), 'done');
});

test('two sessions roll up to the highest', async t => {
  assert.equal(deriveState({ openHitl: 0, signals: [sig({ sid: 'a' }), sig({ sid: 'b', working: true })], pies: openPies, now: NOW }), 'active');
  const { base, home } = await sandbox(t);
  const root = await project(base, 'alpha', { checklist: CHECKLIST_ACTIVE });
  await register(home, [root]);
  await signal(home, 'one', { root, t: NOW - 5000, working: true });
  await signal(home, 'two', { root, t: NOW - 2000, waiting: 'idle' });
  const lobby = await readLobby({ home, now: NOW, probe: noKitchen });
  assert.equal(lobby.projects.length, 1, 'concurrent sessions never make a row per session');
  assert.equal(lobby.projects[0].state, 'needs-you');
  assert.equal(lobby.projects[0].sessions, 2);
});

test('signal older than 24 hours ignored (crash cleanup)', async t => {
  const stale = sig({ t: NOW - SIGNAL_MAX_AGE_MS - 1, working: true, subagents: 4, waiting: 'permission' });
  assert.equal(deriveState({ openHitl: 0, signals: [stale], pies: openPies, now: NOW }), 'inactive');
  assert.equal(deriveState({ openHitl: 0, signals: [stale], pies: donePies, now: NOW }), 'done');
  const edge = sig({ t: NOW - SIGNAL_MAX_AGE_MS, working: true });
  assert.equal(deriveState({ openHitl: 0, signals: [edge], pies: openPies, now: NOW }), 'active', 'exactly 24 hours is still live');
  const { base, home } = await sandbox(t);
  const root = await project(base, 'crashed', { checklist: CHECKLIST_ACTIVE });
  await register(home, [root]);
  await signal(home, 'dead', { root, t: NOW - SIGNAL_MAX_AGE_MS - 60000, working: true });
  const [row] = (await readLobby({ home, now: NOW, probe: noKitchen })).projects;
  assert.equal(row.state, 'inactive');
  assert.equal(row.sessions, 0);
});

test('worktree entries share one row', async t => {
  const { base, home } = await sandbox(t);
  const root = await project(base, 'primary', { checklist: CHECKLIST_ACTIVE });
  const alias = path.join(base, 'alias-link');
  await fs.symlink(root, alias);
  // The hooks write the primary checkout for every worktree; a second spelling of the same folder must still be one row.
  await register(home, [root, alias]);
  await signal(home, 'main-session', { root, t: NOW - 1000, working: false });
  await signal(home, 'worktree-session', { root: alias, t: NOW - 1000, subagents: 1 });
  const lobby = await readLobby({ home, now: NOW, probe: noKitchen });
  assert.equal(lobby.projects.length, 1);
  assert.equal(lobby.projects[0].key, root);
  assert.equal(lobby.projects[0].sessions, 2);
  assert.equal(lobby.projects[0].state, 'active');
});

test('missing folder pruned and registry rewritten', async t => {
  const { base, home } = await sandbox(t);
  const kept = await project(base, 'kept', { checklist: CHECKLIST_DONE });
  const gone = path.join(base, 'gone');
  const file = path.join(home, 'projects.json');
  await fs.writeFile(file, JSON.stringify({ v: 1, projects: [
    { root: gone, name: 'gone', addedAt: 1 }, { root: kept, name: 'kept', addedAt: 2 },
  ] }));
  const lobby = await readLobby({ home, now: NOW, probe: noKitchen });
  assert.deepEqual(lobby.projects.map(row => row.name), ['kept']);
  const rewritten = JSON.parse(await fs.readFile(file, 'utf8'));
  assert.deepEqual(rewritten, { v: 1, projects: [{ root: kept, name: 'kept', addedAt: 2 }] });
  assert.equal((await fs.stat(file)).mode & 0o777, 0o600);
  const leftovers = (await fs.readdir(home)).filter(name => name.startsWith('.tmp') || name === '.lock');
  assert.deepEqual(leftovers, [], 'no temp file or writers lock is left behind');
  // With prune off (the /open allowlist read), a gone folder is skipped but the file is not touched.
  await fs.writeFile(file, JSON.stringify({ v: 1, projects: [{ root: gone, name: 'gone', addedAt: 1 }] }));
  assert.deepEqual(await readRegistry({ home, prune: false }), []);
  assert.equal(JSON.parse(await fs.readFile(file, 'utf8')).projects.length, 1);
});

test('damaged registry gives empty list', async t => {
  const { home } = await sandbox(t);
  assert.deepEqual(await readLobby({ home, now: NOW, probe: noKitchen }), { v: 1, generatedAt: NOW, projects: [] }, 'absent file');
  const file = path.join(home, 'projects.json');
  for (const damaged of ['{not json', '[]', '{"v":1,"projects":"nope"}', 'null']) {
    await fs.writeFile(file, damaged);
    assert.deepEqual((await readLobby({ home, now: NOW, probe: noKitchen })).projects, [], damaged);
    assert.equal(await fs.readFile(file, 'utf8'), damaged, 'a damaged file is left for the hooks to replace');
  }
});

test('readProject reports progress, active pie and slice, and open HITL from the kitchen parser and ledger', async t => {
  const { base, home } = await sandbox(t);
  const root = await project(base, 'progress', { checklist: CHECKLIST_ACTIVE, ledger: hitlRows(['h1', 'h2'], ['h1']) });
  const row = await readProject({ root, name: 'progress' }, { home, now: NOW, probe: noKitchen });
  assert.deepEqual(row, {
    key: root, root, path: root, name: 'progress',
    pies: { done: 2, total: 3 }, slices: { done: 4, total: 6 },
    active: { pie: { number: 3, name: 'Current' }, slice: { number: '3.2', name: 'Building' } },
    activePie: { number: 3, name: 'Current' }, activeSlice: { number: '3.2', name: 'Building' },
    sessions: 0, state: 'needs-you', kitchenUrl: null,
  });
  const answered = await project(base, 'answered', { checklist: CHECKLIST_DONE, ledger: hitlRows(['h1'], ['h1']) });
  const done = await readProject({ root: answered, name: 'answered' }, { home, now: NOW, probe: noKitchen });
  assert.equal(done.state, 'done');
  assert.equal(done.active, null);
  assert.equal(done.activePie, null);
  assert.equal(done.activeSlice, null);
});

test('a missing checklist gives zero pies and state inactive', async t => {
  const { base, home } = await sandbox(t);
  const root = await project(base, 'blank');
  const row = await readProject({ root, name: 'blank' }, { home, now: NOW, probe: noKitchen });
  assert.deepEqual([row.pies, row.slices, row.active, row.state], [{ done: 0, total: 0 }, { done: 0, total: 0 }, null, 'inactive']);
});

test('readProject reads only signals whose root matches the project', async t => {
  const { base, home } = await sandbox(t);
  const mine = await project(base, 'mine', { checklist: CHECKLIST_ACTIVE });
  const other = await project(base, 'other', { checklist: CHECKLIST_ACTIVE });
  await signal(home, 'theirs', { root: other, t: NOW - 1000, working: true });
  await fs.writeFile(path.join(home, 'signals', 'torn.json'), '{"v":1,"root":');
  const row = await readProject({ root: mine, name: 'mine' }, { home, now: NOW, probe: noKitchen });
  assert.equal(row.state, 'inactive');
  assert.equal(row.sessions, 0);
});

test('kitchenUrl is set only when the kitchen answers for this port and root', async t => {
  const { base, home } = await sandbox(t);
  const live = await project(base, 'live', { checklist: CHECKLIST_ACTIVE });
  const port = await fakeKitchen(t, live);
  const row = await readProject({ root: live, name: 'live' }, { home, now: NOW });
  assert.equal(row.kitchenUrl, `http://127.0.0.1:${port}/`);
  const imposter = await project(base, 'imposter', { checklist: CHECKLIST_ACTIVE });
  await fakeKitchen(t, imposter, { claimRoot: live });
  assert.equal((await readProject({ root: imposter, name: 'imposter' }, { home, now: NOW })).kitchenUrl, null);
  const stale = await project(base, 'stale', { checklist: CHECKLIST_ACTIVE });
  await fs.mkdir(path.join(stale, '.claude/.bytheslice-state/kitchen'), { recursive: true });
  await fs.writeFile(path.join(stale, '.claude/.bytheslice-state/kitchen/port'), 'not-a-port\n');
  assert.equal((await readProject({ root: stale, name: 'stale' }, { home, now: NOW })).kitchenUrl, null);
});

test('readLobby orders needs-you, active, done, inactive, then name, and probes kitchens concurrently', async t => {
  const { base, home } = await sandbox(t);
  const roots = {};
  for (const name of ['zeta-idle', 'beta-done', 'alpha-idle', 'omega-active', 'gamma-needs']) {
    roots[name] = await project(base, name, { checklist: name.endsWith('done') ? CHECKLIST_DONE : CHECKLIST_ACTIVE });
  }
  await register(home, Object.values(roots));
  await signal(home, 'a', { root: roots['omega-active'], t: NOW - 10, working: true });
  await signal(home, 'n', { root: roots['gamma-needs'], t: NOW - 10, waiting: 'permission' });
  let inFlight = 0, peak = 0;
  const probe = async () => { inFlight++; peak = Math.max(peak, inFlight); await new Promise(resolve => setTimeout(resolve, 50)); inFlight--; return null; };
  const lobby = await readLobby({ home, now: NOW, probe });
  assert.equal(lobby.v, 1);
  assert.equal(lobby.generatedAt, NOW);
  assert.deepEqual(lobby.projects.map(row => [row.name, row.state]), [
    ['gamma-needs', 'needs-you'], ['omega-active', 'active'], ['beta-done', 'done'], ['alpha-idle', 'inactive'], ['zeta-idle', 'inactive'],
  ]);
  assert.equal(peak, 5, 'every project kitchen is probed at once');
});
