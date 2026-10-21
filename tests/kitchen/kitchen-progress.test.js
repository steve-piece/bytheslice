// tests/kitchen/kitchen-progress.test.js
// Verifies honest slice progress (committed tasks of the plan's tasks), the current step, and pie detail facts from the checklist.
'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { parseChecklist, buildSnapshot, readKitchenState, stepOf, taskProgress, countPlanTasks } = require('../../mcp/kitchen-state.js');

const CHECKLIST = `# Checklist

## Pie 3 - Native Agent Registration [x]    <!-- review: boundary -->
**Pie scope:** register the roster as native plugin agents | **MVP:** Yes | **Depends on:** Pie 2
Status: Shipped. Commit 8453de9 is on main and released as 5.1.0 (2026-07-22).

### Slice 3.1 - Register agents [x]
Status: Completed (commit 8453de9)
**Type:** infrastructure
Agents array added to the manifest with explicit file paths.

## Pie 5 - The Pass [ ]
**Pie scope:** ship the Pass mod | **MVP:** Yes
Status: In Progress. Plans written 2026-10-20.

### Slice 5.1 - Pass pane and band [x]
Status: Completed and pushed (a212665..772170c). Verifier pass on every gate.
**Type:** infrastructure | **Plan:** [stage_51_pass_pane.md](stage_51_pass_pane.md)

### Slice 5.2 - Ledger and status tool [ ]
Status: Not Started
**Type:** infrastructure | **Plan:** [stage_52_pass_ledger.md](stage_52_pass_ledger.md)

### Slice 5.3 - Pass checks [ ]
Status: Not Started
**Type:** infrastructure | **Plan:** [stage_53_pass_checks.md](../../etc/passwd)
`;
const PLAN = `# Slice 5.2
## In scope
- [ ] **1. Ledger writer.** Commit: \`feat(pie-5): 5.2 task 1 ledger writer\`.
- [ ] **2. Event capture.**
  - [ ] nested detail is not a task
- [x] **3. Projection.**
\`\`\`
- [ ] fenced example is not a task
\`\`\`
## Out of scope
- the watchdog
`;

test('checklist rows yield commit ranges, single commits, dates, plans and one-line summaries', () => {
  const { pies } = parseChecklist(CHECKLIST);
  const [pie3, pie5] = pies;
  assert.equal(pie3.commit, '8453de9'); assert.equal(pie3.date, '2026-07-22');
  assert.equal(pie3.summary, 'register the roster as native plugin agents');
  assert.equal(pie3.slices[0].commit, '8453de9');
  assert.equal(pie3.slices[0].summary, 'Agents array added to the manifest with explicit file paths.');
  assert.equal(pie5.slices[0].commit, 'a212665..772170c');
  assert.equal(pie5.slices[1].plan, 'stage_52_pass_ledger.md');
  assert.equal(pie5.slices[2].plan, undefined, 'a link that leaves docs/plans is not a plan');
});

test('plan tasks are top-level checkbox lines outside code fences', () => {
  assert.equal(countPlanTasks(PLAN), 3);
  assert.equal(countPlanTasks(''), 0);
});

test('progress counts each committed task once and refuses to guess when history and plan disagree', () => {
  const subjects = ['feat(pie-5): 5.2 task 1 ledger writer', 'feat(pie-5): 5.2 task 1 ledger writer', 'feat(pie-5): 5.2 task 2 capture',
    'feat(pie-5): 5.1 task 4 pass pane', 'feat(pie-6): 5.2 task 3 wrong pie', 'fix(pie-5): 5.2 task 3 not a task commit'];
  assert.deepEqual(taskProgress(subjects, '5.2', 6), { done: 2, total: 6 });
  assert.deepEqual(taskProgress([], '5.2', 6), { done: 0, total: 6 });
  assert.equal(taskProgress([...subjects, 'feat(pie-5): 5.2 task 9 beyond the plan'], '5.2', 6), null);
  assert.equal(taskProgress(null, '5.2', 6), null, 'no git history means no percent');
  assert.equal(taskProgress(subjects, '5.2', 0), null, 'a plan without tasks means no percent');
});

test('the step comes from the dispatch label, then from the agent role', () => {
  assert.equal(stepOf({ label: 'P5 S5.2 verify: ledger', type: 'bytheslice:implementer' }), 'verify');
  assert.equal(stepOf({ label: 'P5 S5.2 build: ledger', type: 'bytheslice:implementer' }), 'build');
  assert.equal(stepOf({ label: 'Kitchen fixes', type: 'bytheslice:fix-attempter' }), 'fix');
  assert.equal(stepOf({ label: 'Kitchen fixes', type: 'general-purpose' }), null);
});

test('the snapshot carries step and progress only for unfinished slices with real evidence', () => {
  const snapshot = buildSnapshot({ root: '/fixture', checklist: CHECKLIST, now: 5000,
    rows: [{ t: 1000, sid: 's', ev: 'SessionStart' },
      { t: 1100, sid: 's', ev: 'PreToolUse', agent: 'bytheslice:slice-verifier', label: 'P5 S5.2 verify: ledger', pie: 5, slice: '5.2' },
      { t: 1200, sid: 's', ev: 'SubagentStart', agent: 'bytheslice:slice-verifier', aid: 'v' }],
    planTasks: { 'stage_52_pass_ledger.md': 3 }, taskSubjects: ['feat(pie-5): 5.2 task 1 ledger writer', 'feat(pie-5): 5.1 task 1 x'] });
  const [s51, s52, s53] = snapshot.pies[1].slices;
  assert.equal(s52.status, 'active'); assert.equal(s52.step, 'verify'); assert.deepEqual(s52.progress, { done: 1, total: 3 });
  assert.equal(s51.progress, undefined, 'served slices need no progress');
  assert.equal(s53.progress, undefined); assert.equal(s53.step, undefined);
});

test('readKitchenState reads linked plans and task commits from the local branches, read-only', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kitchen-progress-'));
  try {
    await fs.mkdir(path.join(root, 'docs/plans'), { recursive: true });
    await fs.writeFile(path.join(root, 'docs/plans/00_master_checklist.md'), CHECKLIST);
    await fs.writeFile(path.join(root, 'docs/plans/stage_52_pass_ledger.md'), PLAN);
    const git = (...args) => execFileSync('git', args, { cwd: root, stdio: 'pipe' });
    git('init', '-q', '-b', 'main'); git('config', 'user.email', 'kitchen@example.test'); git('config', 'user.name', 'Kitchen');
    git('commit', '-q', '--allow-empty', '-m', 'chore: start');
    git('checkout', '-q', '-b', 'pie-5');
    git('commit', '-q', '--allow-empty', '-m', 'feat(pie-5): 5.2 task 1 ledger writer');
    git('commit', '-q', '--allow-empty', '-m', 'feat(pie-5): 5.2 task 2 event capture');
    git('checkout', '-q', 'main');
    const before = git('status', '--porcelain').toString();
    const snapshot = await readKitchenState(root, { now: Date.now() + 60000 });
    const s52 = snapshot.pies[1].slices[1];
    assert.deepEqual(s52.progress, { done: 2, total: 3 }, 'task commits on the pie branch count from the main checkout');
    assert.equal(git('status', '--porcelain').toString(), before, 'reading state changes nothing');
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
