// mod/capture.test.ts
// Unit tests for event capture: baker skills, verdicts from tester and verifier, git results, main-loop usage and checklist flips.

import { expect, test } from 'claude-code/testing'

import { gitIntent, labelOf, parseVerdict, subjectOf } from './capture.ts'
import { CHECKLIST_FIXTURE } from './fixtures/checklist.fixture.ts'
import {
  ACTIVITY,
  HEAD,
  activityLine,
  bashResult,
  endTurn,
  engineLoops,
  rowsOf,
  spawn,
  stage,
} from './testing.tsx'

const VERIFIER_FAIL = [
  'Verdict below.',
  '```jsonc',
  '{',
  '  "checks": { "lint": "pass", "typecheck": "fail" },',
  '  "rerun": [ { "gate": "typecheck", "reason": "fix changed mod/a.ts" } ],',
  '  "overall": "fail",',
  '  "fix_targets": [',
  '    // agent | file | reason',
  '    "implementer | mod/a.ts | typecheck: x is a string",',
  '    "implementer | mod/b.ts | lint: unused import",',
  '  ],',
  '  "status": "complete"',
  '}',
  '```',
].join('\n')

const TESTER_PASS = ['slice: "5.2"', 'type: infrastructure', 'overall: pass', 'fix_targets:', 'summary: all green'].join('\n')

test('a baker skill records pie.started and slice.started once each, from any of its sources', async ($, on) => {
  const { world, start } = stage(on, { checklist: CHECKLIST_FIXTURE })
  engineLoops(on)
  on('tool.call', () => ({ result: {} }))
  await start($)
  await $.skill.prompt({ skill: 'bytheslice:sell-pie', text: 'bake', frontmatter: {}, source: 'plugin' })
  await $.skill.prompt({ skill: 'sell-pie', text: 'bake again', frontmatter: {}, source: 'plugin' })
  await $.tool.call({ tool: 'Skill', skill: 'bytheslice:sell-slice' })
  await $.skill.prompt({ skill: 'commit', text: 'not a baker', frontmatter: {}, source: 'built-in' })
  const rows = rowsOf(world)
  expect(rows.map(row => [row.ev, row.pie, row.slice ?? null])).toEqual([
    ['pie.started', 5, null],
    ['slice.started', 5, '5.1'],
  ])
  expect(rows[0]?.data).toEqual({ skill: 'sell-pie' })
})

test('the Skill tool alone records the start where skill prompts pass the plugin by', async ($, on) => {
  const { world, start } = stage(on, { checklist: CHECKLIST_FIXTURE })
  engineLoops(on)
  on('tool.call', () => ({ result: {} }))
  await start($)
  await $.tool.call({ tool: 'Skill', skill: 'bytheslice:sell-slice' })
  expect(rowsOf(world).map(row => row.ev)).toEqual(['pie.started', 'slice.started'])
})

test('a slice-verifier report becomes one verdict row with gate, overall, fix targets, re-runs and HEAD', async ($, on) => {
  const { world, start } = stage(on, { checklist: CHECKLIST_FIXTURE })
  engineLoops(on, ['agent-v'])
  await start($)
  const started = await spawn($, 'bytheslice:slice-verifier', 'P5 S5.2 verify: static gates')
  expect(started.agentId).toBe('agent-v')
  const ended = await endTurn($, VERIFIER_FAIL, 'agent-v')
  expect(ended.text).toBe('')
  const rows = rowsOf(world)
  expect(rows).toHaveLength(1)
  expect(rows[0]).toMatchObject({
    ev: 'verdict',
    pie: 5,
    slice: '5.2',
    aid: 'agent-v',
    agent: 'bytheslice:slice-verifier',
    data: {
      gate: 'slice-verifier',
      overall: 'fail',
      fix_targets: ['implementer | mod/a.ts | typecheck: x is a string', 'implementer | mod/b.ts | lint: unused import'],
      rerun: ['typecheck'],
      head: HEAD,
    },
  })
  expect(JSON.stringify(rows[0])).not.toContain('Verdict below')
  expect(world.toasts).toEqual(['Slice 5.2 slice-verifier failed · 2 fix targets'])
})

test('a tester report in YAML, for an agent known only to the agent list, still lands', async ($, on) => {
  const { world, start } = stage(on, {
    checklist: CHECKLIST_FIXTURE,
    agents: [{ id: 'agent-t', description: 'P5 S5.2 test: probes', type: 'bytheslice:slice-tester', status: 'running' }],
  })
  engineLoops(on)
  await start($)
  await endTurn($, TESTER_PASS, 'agent-t')
  expect(rowsOf(world)).toHaveLength(1)
  expect(rowsOf(world)[0]).toMatchObject({ ev: 'verdict', slice: '5.2', data: { gate: 'slice-tester', overall: 'pass' } })
  expect(world.toasts).toEqual([])
})

test('a report the parser cannot read records overall unparsed; other agents record nothing', async ($, on) => {
  const { world, start } = stage(on, { checklist: CHECKLIST_FIXTURE })
  engineLoops(on, ['agent-v', 'agent-d'])
  await start($)
  await spawn($, 'bytheslice:slice-verifier', 'P5 S5.2 verify: gates')
  await spawn($, 'bytheslice:discovery', 'P5 S5.2 prep: recon')
  await endTurn($, 'I ran out of time before the verdict.', 'agent-v')
  await endTurn($, '{"overall": "pass"}', 'agent-d')
  const rows = rowsOf(world)
  expect(rows.map(row => [row.ev, (row.data as { overall?: string }).overall])).toEqual([['verdict', 'unparsed']])
})

test('a main-loop turn records usage: turn id, duration, tokens, model and the session cost', async ($, on) => {
  const { world, start } = stage(on, { checklist: CHECKLIST_FIXTURE, costUsd: 1.5 })
  engineLoops(on)
  await start($)
  await endTurn($, 'PRIVATE final answer')
  const rows = rowsOf(world)
  expect(rows).toHaveLength(1)
  expect(rows[0]).toMatchObject({
    ev: 'usage',
    pie: 5,
    slice: '5.1',
    data: {
      turnId: 'turn-main',
      durationMs: 1200,
      tokens: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 5, cache_creation_input_tokens: 0 },
      model: 'claude-opus-5-5',
      costUsd: 1.5,
    },
  })
  expect(world.files['/repo/.bytheslice/ledger.jsonl']).not.toContain('PRIVATE')
})

test('a git commit records its sha and branch, attributed by the commit subject, and returns the engine result', async ($, on) => {
  const { world, start } = stage(on, { checklist: CHECKLIST_FIXTURE })
  const result = bashResult()
  on('tool.call', () => result)
  await start($)
  const ran = await $.tool.call({ tool: 'Bash', command: 'git add -- mod/a.ts && git commit -m "feat(pie-5): 5.2 task 1 x"' })
  expect(ran.result).toEqual(result.result)
  expect(rowsOf(world)).toEqual([
    expect.objectContaining({ ev: 'commit', pie: 5, slice: '5.2', data: { sha: HEAD, branch: 'pie-5-the-pass' } }),
  ])
})

test('commit and push in one command record both; the push toasts once', async ($, on) => {
  const { world, start } = stage(on, { checklist: CHECKLIST_FIXTURE })
  on('tool.call', () => bashResult({ commit: { sha: 'feedfacecafe1234', kind: 'committed', branch: 'pie-5-the-pass' }, push: { branch: 'pie-5-the-pass' } }))
  await start($)
  await $.tool.call({ tool: 'Bash', command: 'git -C /repo commit -m x && git push origin pie-5-the-pass' })
  const rows = rowsOf(world)
  expect(rows.map(row => row.ev)).toEqual(['commit', 'push'])
  expect(rows[0]?.data).toEqual({ sha: 'feedfacecafe1234', branch: 'pie-5-the-pass', kind: 'committed' })
  expect(rows[1]?.data).toEqual({ sha: HEAD, branch: 'pie-5-the-pass' })
  expect(world.toasts).toEqual(['Pushed pie-5-the-pass'])
})

test('an abbreviated sha in the git record is written in full when HEAD extends it', async ($, on) => {
  const { world, start } = stage(on, { checklist: CHECKLIST_FIXTURE })
  on('tool.call', () => bashResult({ commit: { sha: HEAD.slice(0, 7), kind: 'committed', branch: 'pie-5-the-pass' } }))
  await start($)
  await $.tool.call({ tool: 'Bash', command: 'git commit -m "feat(pie-5): 5.2 x"' })
  expect(rowsOf(world)[0]?.data).toEqual({ sha: HEAD, branch: 'pie-5-the-pass', kind: 'committed' })
})

test('a failing git read still records the commit, without a sha, on the active slice', async ($, on) => {
  const { world, start } = stage(on, { checklist: CHECKLIST_FIXTURE, head: null })
  on('tool.call', () => bashResult())
  await start($)
  await $.tool.call({ tool: 'Bash', command: 'git commit -m "wip"' })
  const rows = rowsOf(world)
  expect(rows).toHaveLength(1)
  expect(rows[0]).toMatchObject({ ev: 'commit', pie: 5, slice: '5.1' })
  expect(rows[0]?.data).toEqual({})
})

test('an errored, interrupted or backgrounded git command records nothing', async ($, on) => {
  const { world, start } = stage(on, { checklist: CHECKLIST_FIXTURE })
  let answer: unknown = { isError: true, result: 'nothing to commit', text: 'Exit code 1' }
  on('tool.call', () => answer as { result: unknown })
  await start($)
  await $.tool.call({ tool: 'Bash', command: 'git commit -m x' })
  answer = { result: { stdout: '', stderr: '', interrupted: true } }
  await $.tool.call({ tool: 'Bash', command: 'git push' })
  answer = { result: { stdout: '', stderr: '', interrupted: false, backgroundTaskId: 'bg-1' } }
  await $.tool.call({ tool: 'Bash', command: 'git push' })
  answer = bashResult()
  await $.tool.call({ tool: 'Bash', command: 'git status && echo git commit' })
  expect(rowsOf(world)).toEqual([])
})

test('gh pr merge records a pr merge with its number', async ($, on) => {
  const { world, start } = stage(on, { checklist: CHECKLIST_FIXTURE })
  on('tool.call', () => bashResult())
  await start($)
  await $.tool.call({ tool: 'Bash', command: 'gh as steve-piece pr merge 44 --merge' })
  expect(rowsOf(world)).toEqual([expect.objectContaining({ ev: 'merge', data: expect.objectContaining({ kind: 'pr', pr: 44 }) })])
})

test('a slice that flips to done records slice.done with its verifier verdict and a rollup from activity', async ($, on) => {
  const { world, start } = stage(on, { checklist: CHECKLIST_FIXTURE })
  engineLoops(on, ['agent-v'])
  world.files[ACTIVITY] = [
    activityLine({ t: 10, sid: 's', ev: 'SubagentStart', agent: 'bytheslice:implementer', aid: 'i1', pie: 5, slice: '5.1' }),
    activityLine({ t: 11, sid: 's', ev: 'SubagentStart', agent: 'bytheslice:fix-attempter', aid: 'f1', pie: 5, slice: '5.1' }),
    activityLine({ t: 12, sid: 's', ev: 'PostToolUse', agent: 'bytheslice:implementer', aid: 'i1', tok: 500, ms: 9000, ok: true, label: 'P5 S5.1 build: x', pie: 5, slice: '5.1' }),
  ].join('')
  const flipped = CHECKLIST_FIXTURE.replace('### Slice 5.1 - Pass pane and band [ ]\nStatus: Not Started', '### Slice 5.1 - Pass pane and band [x]\nStatus: Completed')
  on('tool.call', () => {
    world.checklist = flipped
    return { result: { filePath: 'docs/plans/00_master_checklist.md' } }
  })
  await start($)
  await spawn($, 'bytheslice:slice-verifier', 'P5 S5.1 verify: gates')
  await endTurn($, '{"overall": "pass", "fix_targets": []}', 'agent-v')
  await $.tool.call({ tool: 'Edit', file_path: 'docs/plans/00_master_checklist.md', old_string: '[ ]', new_string: '[x]' })
  const rows = rowsOf(world)
  expect(rows.map(row => row.ev)).toEqual(['verdict', 'slice.done', 'slice.rollup'])
  expect(rows[1]).toMatchObject({ pie: 5, slice: '5.1', data: { verdict: { overall: 'pass', head: HEAD } } })
  expect(rows[2]?.data).toEqual({
    agents: {
      implementer: { count: 1, tok: 500, ms: 9000 },
      'fix-attempter': { count: 1, tok: 0, ms: 0 },
    },
    fixLoops: 1,
    tokens: 500,
    ms: 9000,
  })
  expect(world.toasts).toEqual(['Slice 5.1 done · verifier pass'])
  // The same flip seen again records nothing new.
  await $.tool.call({ tool: 'Edit', file_path: 'docs/plans/00_master_checklist.md', old_string: '[ ]', new_string: '[x]' })
  expect(rowsOf(world)).toHaveLength(3)
})

test('a project with no master checklist gets no ledger from turns or commits', async ($, on) => {
  const { world, start } = stage(on)
  engineLoops(on)
  on('tool.call', () => bashResult())
  await start($)
  await $.tool.call({ tool: 'Bash', command: 'git commit -m x && git push' })
  await endTurn($, 'done')
  expect(Object.keys(world.files)).toEqual([])
  expect(world.runs.some(argv => argv[0] === 'tee')).toBe(false)
})

test('an inert mod on an older engine records nothing', async ($, on) => {
  const { world, start } = stage(on, { checklist: CHECKLIST_FIXTURE, version: '2.1.290' })
  engineLoops(on)
  on('tool.call', () => bashResult())
  await start($)
  await $.tool.call({ tool: 'Bash', command: 'git commit -m x' })
  await endTurn($, 'done')
  expect(rowsOf(world)).toEqual([])
})

test('the verdict parser reads JSONC, YAML and nothing at all', () => {
  expect(parseVerdict(VERIFIER_FAIL)).toEqual({
    overall: 'fail',
    fixTargets: ['implementer | mod/a.ts | typecheck: x is a string', 'implementer | mod/b.ts | lint: unused import'],
    rerun: ['typecheck'],
  })
  expect(parseVerdict(TESTER_PASS)).toEqual({ overall: 'pass', fixTargets: [], rerun: [], slice: '5.2' })
  expect(parseVerdict('overall: fail\nfix_targets:\n  - "implementer:a.ts: Bold does nothing"\n')).toEqual({
    overall: 'fail',
    fixTargets: ['implementer:a.ts: Bold does nothing'],
    rerun: [],
  })
  // A tester that writes the verdict word in capitals, with prose after it (a 6.0.0 run).
  expect(
    parseVerdict('status: complete\noverall: FAIL (blocking a11y contrast, 2 findings). All behavioral checks pass.\n\nslice: "2.3"\nfix_targets:\n- "implementer:components/meals/delete-meal-dialog.tsx: Delete meal contrast 4.12"\n'),
  ).toEqual({ overall: 'fail', fixTargets: ['implementer:components/meals/delete-meal-dialog.tsx: Delete meal contrast 4.12'], rerun: [], slice: '2.3' })
  expect(parseVerdict('status: complete\noverall: PASS. Every check passes.\nfix_targets: []').overall).toBe('pass')
  expect(parseVerdict('overall: "Fail"').overall).toBe('fail')
  expect(parseVerdict('{"overall":"FAIL"}').overall).toBe('fail')
  expect(parseVerdict('no verdict here')).toEqual({ overall: 'unparsed', fixTargets: [], rerun: [] })
  expect(parseVerdict(undefined).overall).toBe('unparsed')
  expect(parseVerdict('{'.repeat(5000)).overall).toBe('unparsed')
  const long = parseVerdict(JSON.stringify({ overall: 'fail', fix_targets: Array.from({ length: 30 }, (_, i) => `t${i} ${'x'.repeat(300)}`) }))
  expect(long.fixTargets).toHaveLength(10)
  expect(Array.from(long.fixTargets[0] ?? '').length).toBe(200)
})

test('git intent, dispatch labels and commit subjects', () => {
  expect(gitIntent('git add -- a && git commit -m x && git push')).toEqual({ commit: true, push: true, merge: null, pr: null })
  expect(gitIntent('git -C /repo -c core.x=y commit -m z')).toMatchObject({ commit: true, push: false })
  expect(gitIntent('git status; git log')).toEqual({ commit: false, push: false, merge: null, pr: null })
  expect(gitIntent('gh pr merge 12 --merge')).toMatchObject({ merge: 'pr', pr: 12 })
  expect(gitIntent('git merge origin/main')).toMatchObject({ merge: 'git' })
  expect(gitIntent(42)).toEqual({ commit: false, push: false, merge: null, pr: null })
  expect(labelOf('P5 S5.2 verify: x')).toEqual({ pie: 5, slice: '5.2' })
  expect(labelOf('verify things')).toBeNull()
  expect(subjectOf('feat(pie-5): 5.2 task 1 ledger writer')).toEqual({ pie: 5, slice: '5.2' })
  expect(subjectOf('chore(release): 5.3.0')).toBeNull()
})
