// tests/pass/activity.test.js
// Feeds real hooks/kitchen-log.sh rows to the Pass ledger projection, so the mod reads exactly what the hook writes.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const cp = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const hook = path.join(root, 'hooks/kitchen-log.sh');
const load = () => Promise.all([
  import(path.join(root, 'mod/ledger-projection.ts')),
  import(path.join(root, 'mod/checklist.ts')),
]);

const CHECKLIST = [
  '## Pie 5 - The Pass [ ]',
  '### Slice 5.1 - Pass pane and band [x]',
  '### Slice 5.2 - Ledger and status tool [ ]',
  '### Slice 5.3 - Checks [ ]',
  '',
].join('\n');

function project() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pass-activity-'));
  const git = (...args) => cp.execFileSync('git', ['-C', dir, ...args], { stdio: 'ignore' });
  git('init', '-q', '-b', 'pie-4-elsewhere');
  git('-c', 'user.email=t@e', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'init');
  fs.mkdirSync(path.join(dir, 'docs/plans'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'docs/plans/00_master_checklist.md'), CHECKLIST);
  return dir;
}

function emit(dir, envelope) {
  const run = cp.spawnSync('bash', [hook], {
    input: JSON.stringify({ session_id: 'live-1', ...envelope }),
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
    encoding: 'utf8',
  });
  assert.equal(run.status, 0);
}

test('the projection reads the rows hooks/kitchen-log.sh writes: status, fix loop, tokens and live agents', async () => {
  const [{ parseActivity, projectLedger, rollup, findSlice }, { parseChecklist }] = await load();
  const dir = project();
  try {
    const dispatch = (description, type) => ({ hook_event_name: 'PreToolUse', tool_name: 'Agent', tool_input: { description, subagent_type: type } });
    emit(dir, dispatch('P5 S5.2 build: ledger', 'bytheslice:implementer'));
    emit(dir, { hook_event_name: 'SubagentStart', agent_type: 'bytheslice:implementer', agent_id: 'impl-1' });
    emit(dir, { hook_event_name: 'SubagentStop', agent_type: 'bytheslice:implementer', agent_id: 'impl-1' });
    emit(dir, {
      hook_event_name: 'PostToolUse',
      tool_name: 'Agent',
      tool_input: { description: 'P5 S5.2 build: ledger', subagent_type: 'bytheslice:implementer' },
      tool_response: { agentId: 'impl-1', totalTokens: 4200, totalDurationMs: 61000, status: 'completed' },
    });
    emit(dir, dispatch('P5 S5.2 fix: typecheck', 'bytheslice:fix-attempter'));
    emit(dir, { hook_event_name: 'SubagentStart', agent_type: 'bytheslice:fix-attempter', agent_id: 'fix-1' });

    const log = path.join(dir, '.claude/.bytheslice-state/kitchen/activity.jsonl');
    const activity = parseActivity(fs.readFileSync(log, 'utf8'));
    // The fix: unlabeled subagent rows follow their labeled dispatch, not the pie-4 branch.
    assert.ok(activity.filter(row => row.ev.startsWith('Subagent')).every(row => row.pie === 5 && row.slice === '5.2'));

    const projection = projectLedger([], activity, parseChecklist(CHECKLIST), Date.now());
    const view = findSlice(projection, '5.2');
    assert.equal(view.status, 'fixing');
    assert.equal(view.fixLoop, 1);
    assert.equal(view.tokens, 4200);
    assert.deepEqual(view.agents.map(agent => [agent.aid, agent.role]), [['fix-1', 'fix-attempter']]);
    assert.deepEqual(projection.active, { pie: 5, slice: '5.2' });
    assert.deepEqual(rollup(activity, '5.2').agents, {
      implementer: { count: 1, tok: 4200, ms: 61000 },
      'fix-attempter': { count: 1, tok: 0, ms: 0 },
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
