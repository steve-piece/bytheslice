// tests/kitchen/kitchen-state.test.js
// Verifies privacy, activity lifecycle, checklist status, setup, rotation, cursor, and phase folding.
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { checklist, activity } = require('../fixtures/kitchen/data.js');
const { sanitizeRow, parseActivity, parseChecklist, foldActivity, buildSnapshot, readKitchenState } = require('../../mcp/kitchen-state.js');
const base = { t: 1000, sid: 'session' };

test('privacy allowlist strips unknown fields and fields inappropriate to the event', () => {
  const row = sanitizeRow({ ...base, ev: 'SubagentStart', agent: 'bytheslice:discovery', aid: 'agent',
    label: 'not allowed here', skill: 'not allowed here', src: 'not allowed here', prompt: 'PRIVATE_SENTINEL',
    last_assistant_message: 'PRIVATE_SENTINEL', env: { value: 'PRIVATE_SENTINEL' }, output: 'PRIVATE_SENTINEL' });
  assert.deepEqual(row, { ...base, ev: 'SubagentStart', agent: 'bytheslice:discovery', aid: 'agent' });
  const dispatch = sanitizeRow({ ...base, ev: 'PreToolUse', label: `\n${'x'.repeat(150)}\t`, agent: 'cook' });
  assert.equal(dispatch.label.length, 120);
  assert.equal(sanitizeRow({ ...base, ev: 'Unknown' }), null);
  assert.equal(sanitizeRow({ ...base, ev: 'Stop', t: -1 }), null);
});

test('parses only completed JSONL rows and measures current cursor in bytes', () => {
  const good = `${JSON.stringify({ ...base, ev: 'PreToolUse', label: 'café', agent: 'cook' })}\n`;
  const completed = `${good}{bad}\n`;
  const result = parseActivity(Buffer.from(`${completed}{"partial":`));
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].label, 'café');
  assert.equal(result.cursor, Buffer.byteLength(completed));
  assert.equal(parseActivity('{"partial":').cursor, 0);
});

test('pairs dispatch labels with starts and authoritative result ids, then removes ended agents', () => {
  const rows = [
    { ...base, ev: 'SessionStart' },
    { ...base, t: 1100, ev: 'PreToolUse', agent: 'cook', label: 'P4 S4.2 build: first', pie: 4, slice: '4.2' },
    { ...base, t: 1200, ev: 'PreToolUse', agent: 'cook', label: 'P4 S4.3 build: second', pie: 4, slice: '4.3' },
    { ...base, t: 1300, ev: 'SubagentStart', agent: 'cook', aid: 'one' },
    { ...base, t: 1400, ev: 'SubagentStart', agent: 'cook', aid: 'two' },
    { ...base, t: 1500, ev: 'PostToolUse', agent: 'cook', label: 'P4 S4.3 build: second', aid: 'one' },
    { ...base, t: 1600, ev: 'PostToolUse', agent: 'cook', label: 'P4 S4.2 build: first', aid: 'two' },
  ];
  const state = foldActivity(rows, 2000);
  assert.equal(state.active.find(agent => agent.aid === 'one').slice, '4.3');
  assert.equal(state.active.find(agent => agent.aid === 'two').slice, '4.2');
  const ended = foldActivity([...rows,
    { ...base, t: 1700, ev: 'SubagentStop', aid: 'one' },
    { ...base, t: 1800, ev: 'PostToolUse', agent: 'cook', aid: 'two', ok: true },
  ], 2000);
  assert.deepEqual(ended.active, []);
});

test('parent Stop closes skills while background actors remain until the next session', () => {
  const state = foldActivity(activity, 3000);
  assert.deepEqual(state.active.map(agent => agent.aid), ['cook']);
  assert.equal(state.active[0].label, 'P4 S4.2 build: café');
  assert.equal(state.phase, 'open');
  assert.equal(state.skills[0].status, 'active');
  const stopped = foldActivity([...activity, { t: 3000, sid: 'current', ev: 'Stop' }], 603001);
  assert.deepEqual(stopped.active, state.active);
  assert.equal(stopped.skills[0].status, 'done');
  assert.equal(stopped.skills[0].endedAt, 3000);
  assert.equal(stopped.phase, 'open');
  const next = foldActivity([...activity, { t: 4000, sid: 'next', ev: 'SessionStart' }], 5000);
  assert.deepEqual(next.active, []);
  assert.equal(next.phase, 'dawn');
  assert.equal(next.skills[0].status, 'done');
});

test('parent idle preserves pending dispatch attribution until a background actor starts and completes', () => {
  const rows = [
    { ...base, ev: 'SessionStart' },
    { ...base, t: 1100, ev: 'PreToolUse', agent: 'bytheslice:slice-tester', label: 'P4 S4.2 test: background', pie: 4, slice: '4.2' },
    { ...base, t: 1200, ev: 'Stop' },
    { ...base, t: 1300, ev: 'SubagentStart', agent: 'bytheslice:slice-tester', aid: 'background' },
  ];
  const state = foldActivity(rows, 601201);
  assert.deepEqual(state.active, [{ aid: 'background', type: 'bytheslice:slice-tester',
    label: 'P4 S4.2 test: background', pie: 4, slice: '4.2', startedAt: 1300, sid: 'session' }]);
  assert.equal(state.phase, 'open');
  for (const completion of [
    { ...base, t: 1400, ev: 'SubagentStop', aid: 'background' },
    { ...base, t: 1400, ev: 'PostToolUse', agent: 'bytheslice:slice-tester',
      label: 'P4 S4.2 test: background', aid: 'background', ok: true },
  ]) {
    const ended = foldActivity([...rows, completion], 601201);
    assert.deepEqual(ended.active, []);
    assert.equal(ended.phase, 'after-hours');
    assert.equal(foldActivity([...rows, completion], 601200).phase, 'open');
  }
});

test('after-hours requires parent idle beyond ten minutes and no active skill or actor', () => {
  const rows = [
    { ...base, ev: 'SessionStart' },
    { ...base, t: 1100, ev: 'SubagentStart', agent: 'bytheslice:slice-tester', aid: 'background' },
    { ...base, t: 1200, ev: 'Stop' },
  ];
  assert.equal(foldActivity(rows, 601201).phase, 'open');
  const ended = [...rows, { ...base, t: 1300, ev: 'SubagentStop', aid: 'background' }];
  assert.equal(foldActivity(ended, 601200).phase, 'open');
  assert.equal(foldActivity(ended, 601201).phase, 'after-hours');
  assert.equal(foldActivity([...ended,
    { ...base, t: 1400, ev: 'PreToolUse', skill: 'bytheslice:sell-pie' },
  ], 601201).phase, 'open');
  assert.equal(foldActivity([
    { ...base, ev: 'SessionStart' }, { ...base, t: 1200, ev: 'Stop' },
  ], 601201).phase, 'after-hours');
});

test('limits recent to 50 and finished skills to 20 while retaining an active skill', () => {
  const rows = [{ ...base, ev: 'SessionStart' }];
  for (let index = 1; index <= 55; index++) rows.push({ ...base, t: 1000 + index, ev: 'PreToolUse', skill: `skill-${index}` });
  const state = foldActivity(rows, 2000);
  assert.equal(state.recent.length, 50);
  assert.equal(state.skills.length, 21);
  assert.equal(state.skills.filter(skill => skill.status === 'active').length, 1);
  assert.equal(state.skills.find(skill => skill.status === 'active').name, 'skill-55');
  assert.equal(state.skills.filter(skill => skill.status === 'done')[0].name, 'skill-35');
});

test('folds ordered pies, Prep, standalone slices, status text and legacy stages', () => {
  const result = parseChecklist(checklist);
  assert.equal(result.prepComplete, true);
  assert.equal(parseChecklist('## Prep [x]\n').prepComplete, true);
  assert.deepEqual(result.pies.map(pie => [pie.id, pie.status, pie.single]), [
    ['pie-1', 'done', false], ['pie-2', 'done', true], ['pie-4', 'active', false], ['standalone-slice-7.1', 'active', true],
  ]);
  assert.equal(result.pies[2].slices[1].status, 'open');
  const legacy = parseChecklist('## Stage 8 - Old format\nStatus: Done\n## Stage 9 - Next\nStatus: In Progress\n');
  assert.deepEqual(legacy.pies.map(pie => [pie.single, pie.status]), [[true, 'done'], [true, 'active']]);
  assert.equal(parseChecklist('## Pie 3 - Single slice order\n### Slice 3.1 - Small\n').pies[0].single, true);
  assert.deepEqual(parseChecklist('```md\n## Pie 999 - Code example\n```\n').pies, []);
});

test('uses actual setup evidence and overlays activity only onto unfinished work', () => {
  assert.equal(buildSnapshot({ root: '/fixture/project' }).project.setup, 'none');
  assert.equal(buildSnapshot({ root: '/fixture/project', markers: { config: true } }).project.setup, 'partial');
  const markers = { config: true, prd: true, checklist: true, designSystem: true, workflows: true, prePush: true, envCheck: true, branchProtection: true };
  assert.equal(buildSnapshot({ root: '/fixture/project', markers }).project.setup, 'built');
  const state = buildSnapshot({ root: '/fixture/project', checklist, rows: activity, port: 4477, now: 3000 });
  assert.equal(state.project.setup, 'built');
  assert.equal(state.pies.find(pie => pie.pie === 4).slices.find(slice => slice.number === '4.2').status, 'active');
  assert.equal(state.pies.find(pie => pie.pie === 2).status, 'done');
  assert.equal(state.port, 4477);
});

test('reader folds rotation plus current safely and returns full snapshots for any valid since', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kitchen-state-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const dir = path.join(root, '.claude/.bytheslice-state/kitchen');
  await fs.mkdir(dir, { recursive: true });
  await fs.mkdir(path.join(root, 'docs/plans'), { recursive: true });
  await fs.writeFile(path.join(root, 'docs/plans/00_master_checklist.md'), checklist);
  await fs.writeFile(path.join(dir, 'activity.1.jsonl'), activity.slice(0, 5).map(row => JSON.stringify(row)).join('\n') + '\n');
  const malicious = { ...activity[5], prompt: 'PRIVATE_SENTINEL', last_assistant_message: 'PRIVATE_SENTINEL', output: 'PRIVATE_SENTINEL' };
  const completed = `${JSON.stringify(malicious)}\n{broken}\n`;
  await fs.writeFile(path.join(dir, 'activity.jsonl'), `${completed}{"partial":`);
  const state = await readKitchenState(root, { port: 4480, now: 3000 });
  assert.equal(state.cursor, Buffer.byteLength(completed));
  assert.equal(state.active[0].label, 'P4 S4.2 build: café');
  assert.equal(JSON.stringify(state).includes('PRIVATE_SENTINEL'), false);
  assert.deepEqual(await readKitchenState(root, { since: state.cursor + 999, port: 4480, now: 3000 }), state);
  for (const since of [-1, 0.1, '1', null]) await assert.rejects(readKitchenState(root, { since }), /nonnegative integer/);
  await fs.rename(path.join(dir, 'activity.jsonl'), path.join(dir, 'activity.1.jsonl'));
  await fs.writeFile(path.join(dir, 'activity.jsonl'), `${JSON.stringify({ t: 4000, sid: 'next', ev: 'SessionStart' })}\n`);
  const rotated = await readKitchenState(root, { now: 5000 });
  assert.deepEqual(rotated.active, []);
  assert.equal(rotated.phase, 'dawn');
});
