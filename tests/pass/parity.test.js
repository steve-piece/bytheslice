// tests/pass/parity.test.js
// Keeps the Pass mod's checklist parser (mod/checklist.ts) in step with the kitchen parser (mcp/kitchen-state.js) on the pinned fixture.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const kitchen = require('../../mcp/kitchen-state.js');

const root = path.resolve(__dirname, '../..');
const fixture = fs.readFileSync(path.join(root, 'tests/fixtures/pass/checklist.md'), 'utf8');
const load = () => Promise.all([
  import(path.join(root, 'mod/checklist.ts')),
  import(path.join(root, 'mod/fixtures/checklist.fixture.ts')),
]);

// The kitchen's shape reduced to what the Pass reads: pie number, name, done, and each slice's id, name, done.
const fromKitchen = markdown => kitchen.parseChecklist(markdown).pies.map(pie => ({
  n: pie.pie, name: pie.title, done: pie.status === 'done',
  slices: pie.slices.map(slice => ({ id: slice.number, name: slice.title, done: slice.status === 'done' })),
}));
const fromPass = parsed => parsed.pies.map(pie => ({
  n: pie.n, name: pie.name, done: pie.done,
  slices: pie.slices.map(slice => ({ id: slice.id, name: slice.name, done: slice.done })),
}));

test('the fixture string the mod tests read equals the pinned markdown fixture', async () => {
  const [, { CHECKLIST_FIXTURE }] = await load();
  assert.equal(CHECKLIST_FIXTURE, fixture);
});

test('both parsers find the same pies and slices in the pinned fixture', async () => {
  const [{ parseChecklist }] = await load();
  const pass = parseChecklist(fixture);
  const ours = fromPass(pass);
  const theirs = fromKitchen(fixture);
  assert.equal(ours.length, theirs.length, 'pie count');
  assert.equal(ours.flatMap(pie => pie.slices).length, theirs.flatMap(pie => pie.slices).length, 'slice count');
  assert.deepEqual(ours, theirs);
  assert.equal(ours.length, 6);
  assert.equal(ours.flatMap(pie => pie.slices).length, 20);
});

test('Prep counts match the kitchen shop status on the pinned fixture', async () => {
  const [{ parseChecklist }] = await load();
  assert.deepEqual(parseChecklist(fixture).prep, kitchen.shopStatus(fixture).prep);
});

test('both parsers agree on standalone slices, malformed headings, fences and status overrides', async () => {
  const [{ parseChecklist }] = await load();
  const cases = [
    '## Pie 2 - Two [ ]\n### Slice 2.1 - First [x]\n### Slice 3.1 - Wrong pie [ ]\n',
    '## Slice 7.1 - Standalone [ ]\nStatus: In Progress\n## Pie 8 - Eight [ ]\n### Slice 8.1 - One [ ]\n',
    '## Pie X - Not a number\n### Slice 4.2 - Orphan [ ]\n### Slice four - Not a slice [x]\n',
    '## Pie 3 - Fenced [ ]\n```\n### Slice 3.9 - Hidden [ ]\n```\n### Slice 3.1 - Shown [ ]\n',
    '## Pie 4 - Override [x]\nStatus: All slices complete.\n### Slice 4.1 - A [x]\n### Slice 4.2 - B [ ]\n',
    '## ~~Pie 5 - Struck~~\n### Slice 5.1 - Done by strike [ ]\n',
    '',
  ];
  for (const markdown of cases) assert.deepEqual(fromPass(parseChecklist(markdown)), fromKitchen(markdown), markdown);
});

test('a flat v4 checklist gives the Pass no pies, by design, while the kitchen lists its stages', async () => {
  const [{ parseChecklist }] = await load();
  const v4 = '## Prep\n- [x] Design system\n## Stage 1 - Foundations [x]\n## Stage 2 - Feature [ ]\n';
  const parsed = parseChecklist(v4);
  assert.equal(parsed.layout, 'stage');
  assert.deepEqual(parsed.pies, []);
  assert.deepEqual(parsed.prep, { done: 1, total: 1 });
  assert.ok(fromKitchen(v4).length > 0);
});
