// tests/checklist-format/checklist-format.test.js
// The shared checklist parse (mcp/kitchen-state.js, mirrored by mod/checklist.ts) on older and hand-edited formats, and every rule of the format check in mcp/checklist-format.js.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseChecklist, shopStatus } = require('../../mcp/kitchen-state.js');
const { RULES, validateChecklist, checklistCounts, formatReport } = require('../../mcp/checklist-format.js');
const { PR_CREATE } = require('../../hooks/checklist-check.js');

const root = path.resolve(__dirname, '../..');
const fixture = name => fs.readFileSync(path.join(root, 'tests/fixtures/checklist-format', name), 'utf8');
const BALDWIN = fixture('baldwin-shaped.md');
const FLAT = fixture('flat-v4.md');

const slices = markdown => Object.fromEntries(parseChecklist(markdown).pies.flatMap(pie => pie.slices.map(s => [s.number, s.status])));
const rules = markdown => validateChecklist(markdown).map(p => `${p.line} ${p.rule}`);

// Parser cases

test('a status in a heading comment is read, not stripped', () => {
  const md = '## Pie 3: Q <!-- Status: Completed -->\n### Slice 3.1 <!-- Status: Completed -->\n### Slice 3.2: B   <!-- Status: In Progress, 2026-10-21 -->\n';
  assert.deepEqual(slices(md), { 3.1: 'done', 3.2: 'done' });
  const open = '## Pie 3: Q\n### Slice 3.1 <!-- Status: Completed -->\n### Slice 3.2: B   <!-- Status: In Progress, 2026-10-21 -->\n';
  assert.deepEqual(slices(open), { 3.1: 'done', 3.2: 'active' });
  assert.equal(parseChecklist(open).pies[0].title, 'Q');
});

test('the review annotation stays out of the status and the title', () => {
  const pie = parseChecklist('## Pie 2: Two    <!-- review: continuous -->\n### Slice 2.1: A\n**Status:** Not Started\n').pies[0];
  assert.equal(pie.title, 'Two');
  assert.equal(pie.status, 'open');
});

test('Complete, Partial and the bold body Status line read as statuses', () => {
  assert.deepEqual(slices('## Pie 4: F\n### Slice 4.1: A\n**Status:** Complete\n### Slice 4.2: B\n**Status:** Partial\n### Slice 4.3: C\nStatus: Shipped\n'),
    { 4.1: 'done', 4.2: 'active', 4.3: 'done' });
});

test('a slice id with a letter suffix is a slice', () => {
  assert.deepEqual(Object.keys(slices('## Pie 9: Q\n### Slice 9.2: A [x]\n### Slice 9.2a: B [x]\n### Slice 9.3: C [ ]\n')), ['9.2', '9.2a', '9.3']);
});

test('a slice listed twice counts once, with the furthest status', () => {
  const md = '## Prep <!-- Status: Completed -->\n- [x] Slice 1.4: DB\n### Slice 1.4: DB Schema\n**Status:** Completed\n## Pie 2: A\n### Slice 2.1: X [ ]\n### Slice 2.1: X again [x]\n';
  const parsed = parseChecklist(md);
  assert.deepEqual(parsed.pies.map(pie => pie.slices.map(s => `${s.number}:${s.status}`)), [['1.4:done'], ['2.1:done']]);
});

test('a pie written only as a table counts its rows, by the Slice and status columns', () => {
  const md = [
    '## Pie 4: Market',
    '| Slice | Stage | Deliverable / Plan | Tasks | Implementation |',
    '|---|---|---|---|---|',
    '| 4.1 | 44 | [Records](stage_44.md) | 5 | Completed, verified 2026-10-21 |',
    '| 4.2 | 45 | [Editor](stage_45.md) | 5 | In Progress |',
    '| 4.3 | 46 | [Photos](stage_46.md) | 6 | Not Started |',
    '| 9.9 | 99 | [Other pie](stage_99.md) | 1 | Completed |',
  ].join('\n');
  const pie = parseChecklist(md).pies[0];
  assert.deepEqual(pie.slices.map(s => [s.number, s.title, s.status]), [['4.1', 'Records', 'done'], ['4.2', 'Editor', 'active'], ['4.3', 'Photos', 'open']]);
  const boxes = '## Pie 6: B\n| Pie | Slice | Name | Status |\n|---|---|---|---|\n| 6 | 6.1 | One | [x] |\n| 6 | 6.2 | Two | [ ] |\n';
  assert.deepEqual(slices(boxes), { 6.1: 'done', 6.2: 'open' });
});

test('a table is ignored once the pie has slice headings, and outside any pie', () => {
  const md = '## Pie 4: M\n| Slice | Name | Status |\n|---|---|---|\n| 4.1 | A | Completed |\n| 4.2 | B | Completed |\n### Slice 4.1: A [ ]\n## MVP Summary\n| Pie | Slice | Name | Status |\n|---|---|---|---|\n| 5 | 5.1 | Ghost | [x] |\n';
  assert.deepEqual(slices(md), { 4.1: 'open' });
});

test('a pie rolls up from its slices, and a done pie heading marks its slices done', () => {
  const md = '## Pie 2: Rolled\n### Slice 2.1 [x]\n### Slice 2.2 <!-- Status: Completed -->\n## Pie 3: Marked [x]\n### Slice 3.1: A\n**Status:** Not Started\n';
  assert.deepEqual(parseChecklist(md).pies.map(pie => pie.status), ['done', 'done']);
  assert.deepEqual(shopStatus(md).slices, { done: 3, total: 3, open: 0 });
});

test('flat v4 checklists still parse: Stage headings, body Status lines, and the table-only stage file', () => {
  const stages = '## Prep\n- [x] Design system\n## Stage 5 - Auth [x]\n## Stage 6 - Inbox\n**Status:** Completed\n## Stage 7 - Quotes\nStatus: Not Started\n';
  assert.deepEqual(parseChecklist(stages).pies.filter(pie => pie.id.startsWith('standalone-stage')).map(pie => pie.status), ['done', 'done', 'open']);
  assert.deepEqual(validateChecklist(stages), []);
  // A table-only v4 file has no Stage headings: the hook's awk table count reads it, the parse sees only Prep.
  assert.deepEqual(parseChecklist(FLAT).pies.map(pie => pie.id), ['pie-1']);
  assert.deepEqual(validateChecklist(FLAT), []);
});

// The Baldwin-shaped fixture

test('the Baldwin-shaped fixture counts each pie and slice once', () => {
  assert.deepEqual(checklistCounts(BALDWIN), { pies: { done: 3, total: 5 }, slices: { done: 16, total: 18 }, nextOpenPie: 'Pie 4: In-Stock Marketplace' });
  const status = slices(BALDWIN);
  assert.equal(status['3.2a'], 'done');
  assert.equal(status['4.3'], 'open');
  assert.equal(status['5.2'], 'active');
  assert.equal(status['1.4'], 'done');
  assert.equal(Object.keys(status).length, 18);
});

test('the Baldwin-shaped fixture draws exactly the duplicate and the table-only pie', () => {
  assert.deepEqual(rules(BALDWIN), ['24 duplicate-slice', '65 table-only-pie']);
});

// Validator rules, one each

test('every rule has a description', () => {
  assert.deepEqual(Object.keys(RULES).sort(), ['duplicate-slice', 'missing-status', 'status-disagreement', 'table-only-pie', 'unknown-status', 'unreadable-status']);
});

test('table-only-pie', () => {
  const md = '## Pie 4: M\n| Slice | Name | Status |\n|---|---|---|\n| 4.1 | A | Completed |\n';
  assert.deepEqual(rules(md), ['4 table-only-pie']);
});

test('duplicate-slice, across a Prep line and a heading and between two headings', () => {
  assert.deepEqual(rules('## Prep\n- [x] Slice 1.4: DB\n### Slice 1.4: DB\n**Status:** Completed\n'), ['3 duplicate-slice']);
  assert.deepEqual(rules('## Pie 2: A\n### Slice 2.1: X [x]\n### Slice 2.1: Y [x]\n'), ['3 duplicate-slice']);
});

test('unreadable-status: list and quote forms, dash forms, emphasis, check emoji, odd notes', () => {
  const md = [
    '## Pie 2: A',
    '### Slice 2.1: X',
    '- **Status:** Completed',
    '### Slice 2.2: Y',
    '> Status: Completed',
    '### Slice 2.3: Z',
    'Status - Completed',
    '### Slice 2.4: W',
    '_Status:_ Completed',
    '### Slice 2.5: V \u2705',
    '### Slice 2.6: U <!-- status=done -->',
  ].join('\n');
  const found = validateChecklist(md).filter(p => p.rule === 'unreadable-status').map(p => p.line);
  assert.deepEqual(found, [3, 5, 7, 9, 10, 11]);
});

test('status-disagreement, both directions; an unknown value draws only unknown-status', () => {
  assert.deepEqual(rules('## Pie 2: A [x]\n### Slice 2.1: X [x]\n### Slice 2.2: Y\n**Status:** In Progress\n'), ['1 status-disagreement']);
  assert.deepEqual(rules('## Pie 3: B\n**Status:** In Progress\n### Slice 3.1: X [x]\n### Slice 3.2: Y [x]\n'), ['1 status-disagreement']);
  assert.deepEqual(rules('## Pie 3: B [x]\nStatus: All slices done and pushed.\n### Slice 3.1: X [x]\n'), ['2 unknown-status']);
  assert.deepEqual(rules('## Pie 3: B\n### Slice 3.1: X [x]\n### Slice 3.2: Y [x]\n'), [], 'an unmarked pie rolls up silently');
});

test('unknown-status, in a body line, a heading note and a table cell; an empty value too', () => {
  assert.deepEqual(rules('## Pie 2: A\n### Slice 2.1: X\n**Status:** Built 2026-09-02\n'), ['3 unknown-status']);
  assert.deepEqual(rules('## Pie 2: A\n### Slice 2.1: X <!-- Status: Locally implemented -->\n'), ['2 unknown-status']);
  assert.deepEqual(rules('## Pie 2: A\n### Slice 2.1: X\n**Status:**\n'), ['3 unknown-status']);
  assert.deepEqual(rules('## Pie 4: M\n| Slice | Name | Status |\n|---|---|---|\n| 4.1 | A | Verified Locally |\n'), ['4 table-only-pie', '4 unknown-status']);
  const known = ['Completed 2026-08-31', 'Not Started', 'In Progress', 'Partial: owed', 'waiting until 2026-12-01: a date', 'Done', 'Shipped'];
  for (const value of known) assert.deepEqual(rules(`## Pie 2: A\n### Slice 2.1: X\n**Status:** ${value}\n`), [], value);
});

test('missing-status, for a heading and for an empty table cell', () => {
  assert.deepEqual(rules('## Pie 2: A\n### Slice 2.1: X\nSome notes.\n### Slice 2.2: Y [ ]\n'), ['2 missing-status']);
  assert.deepEqual(rules('## Pie 4: M\n| Slice | Name | Status |\n|---|---|---|\n| 4.1 | A |  |\n'), ['4 missing-status', '4 table-only-pie']);
});

test('the template slice shape, prose and user-flow steps draw nothing', () => {
  const md = [
    '## Pie 2: Blog <!-- review: boundary -->',
    '**Pie scope:** write a post | **MVP:** Yes',
    '**User flow:**',
    '1. Open the editor - Slice 2.1',
    '### Slice 2.1: Editor',
    '**Status:** Not Started    <!-- In Progress | Completed | waiting until <YYYY-MM-DD>: <criterion> -->',
    'The Status vocabulary accepts exactly three values.',
    '```',
    '### Slice 2.9: fenced example',
    '```',
    '## Unnumbered work',
    '- Status: whatever, outside any pie',
  ].join('\n');
  assert.deepEqual(validateChecklist(md), []);
});

test('the report names each problem with its line and routes the repair to a separate subagent', () => {
  const report = formatReport(validateChecklist(BALDWIN));
  assert.match(report, /2 problems/);
  assert.match(report, /line 24 duplicate-slice: Slice 1\.4/);
  assert.match(report, /line 65 table-only-pie: Pie 4/);
  assert.match(report, /separate subagent session/);
  assert.match(report, /keep going/);
  assert.equal(formatReport([]), '');
  assert.doesNotMatch(report, /[\u2013\u2014]/, 'no em or en dashes');
  const many = Array.from({ length: 30 }, (_, i) => ({ rule: 'missing-status', line: i + 1, message: 'x' }));
  assert.match(formatReport(many), /and 10 more/);
});

test('the validator never throws on input that is not a checklist', () => {
  for (const value of [undefined, null, 42, '', '   ', '# Title only\n', '|||\n|---|\n']) assert.deepEqual(validateChecklist(value), []);
});

test('the PR hook matches every gh pr create form and nothing else', () => {
  const gh = 'g' + 'h';
  for (const cmd of [`${gh} pr create --fill`, `${gh} as steve-piece pr create --title x`, `cd app && ${gh} pr create`, `${gh} -R o/r pr create`, `${gh} --repo=o/r pr new`, `(${gh} pr create)`]) {
    assert.ok(PR_CREATE.test(cmd), cmd);
  }
  for (const cmd of [`${gh} pr view 3`, `${gh} pr list`, 'echo pr create', `${gh}x pr create`, `${gh} pr created`, `${gh} as x pr checks 3`]) {
    assert.ok(!PR_CREATE.test(cmd), cmd);
  }
});
