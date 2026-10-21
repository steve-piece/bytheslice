// mod/checks-git.test.ts
// Unit tests for the fix-loop cap (fix-attempter per slice, ci-fix-attempter per pie, plus its one HITL inbox item) and the main-branch check: they warn, and the spawn or command completes.

import { expect, mock, test } from 'claude-code/testing'

import { branchPie, fixKind, fixSpawnOf, judgeCommitOnMain, judgeFixCap } from './checks-git.ts'
import { parseChecklist } from './checklist.ts'
import { CHECKLIST_FIXTURE } from './fixtures/checklist.fixture.ts'
import { projectLedger } from './ledger-projection.ts'
import { ACTIVITY, activityLine, bashResult, engineLoops, rowsOf, spawn, stage, status, warnsOf } from './testing.tsx'

const fixStart = (aid: string, slice = '5.1') =>
  activityLine({ t: 10, sid: 's', ev: 'SubagentStart', agent: 'bytheslice:fix-attempter', aid, pie: 5, slice })

test('the fourth fix-attempter spawn on a slice warns and still returns a model; the third does not', async ($, on) => {
  const { world, start } = stage(on, { checklist: CHECKLIST_FIXTURE })
  engineLoops(on, ['f1', 'f2', 'f3', 'f4'])
  await start($)
  for (const n of [1, 2, 3]) {
    const started = await spawn($, 'bytheslice:fix-attempter', `P5 S5.1 fix: attempt ${n}`)
    expect(started).toEqual({ model: 'sonnet', agentId: `f${n}` })
  }
  expect(warnsOf(world)).toEqual([])
  const fourth = await spawn($, 'bytheslice:fix-attempter', 'P5 S5.1 fix: attempt 4')
  expect(fourth).toEqual({ model: 'sonnet', agentId: 'f4' })
  expect(warnsOf(world)).toEqual([['fix-loop-cap', '5.1']])
  expect(world.toasts[0]).toContain("fix-attempter attempt 4 of cap 3 on Slice 5.1; only the operator's explicit reply at the HITL raises it")
})

test('a fourth fix spawn adds exactly one HITL inbox item, asked in chat; a fifth adds none', async ($, on) => {
  const { world, start } = stage(on, { checklist: CHECKLIST_FIXTURE })
  const session = mock.session(on)
  engineLoops(on, ['f1', 'f2', 'f3', 'f4', 'f5'])
  await start($)
  for (const n of [1, 2, 3]) await spawn($, 'bytheslice:fix-attempter', `P5 S5.1 fix: attempt ${n}`)
  expect(rowsOf(world).filter(row => row.ev === 'hitl.raised')).toEqual([])
  const fourth = await spawn($, 'bytheslice:fix-attempter', 'P5 S5.1 fix: attempt 4')
  expect(fourth.agentId).toBe('f4')
  const raised = rowsOf(world).filter(row => row.ev === 'hitl.raised')
  expect(raised).toHaveLength(1)
  expect(raised[0]).toMatchObject({ pie: 5, slice: '5.1' })
  expect(raised[0]?.data).toMatchObject({
    category: 'other',
    source: 'pass',
    asked: 'chat',
    kind: 'fix-loop-cap',
    question: 'Slice 5.1 is on fix-attempter attempt 4, past the cap of 3. Grant more fix loops, or stop the slice here?',
  })
  const id = String((raised[0]?.data as { id: string }).id)
  // Asked in chat, so it is blocking: one native notification.
  expect(world.notifies).toHaveLength(1)
  const notes = session
    .appended()
    .filter(row => row.origin.kind === 'plugin')
    .map(row => row.message.content.map(block => (block.type === 'text' ? block.text : '')).join(''))
  expect(notes.at(-1)).toBe(
    `The Pass opened HITL ${id} for the fix cap: ask the operator in chat, and when they answer call bts_hitl with { id: "${id}", answer }. Nothing was blocked.`,
  )
  await spawn($, 'bytheslice:fix-attempter', 'P5 S5.1 fix: attempt 5')
  expect(rowsOf(world).filter(row => row.ev === 'hitl.raised')).toHaveLength(1)
  expect(warnsOf(world)).toEqual([
    ['fix-loop-cap', '5.1'],
    ['fix-loop-cap', '5.1'],
  ])
  expect(await status($)).toContain('Open HITL: 1')
})

test('the activity log counts fix attempts made before this session', async ($, on) => {
  const { world, start } = stage(on, { checklist: CHECKLIST_FIXTURE })
  world.files[ACTIVITY] = [fixStart('a'), fixStart('b'), fixStart('c'), fixStart('d', '5.2')].join('')
  engineLoops(on, ['f4', 'x1'])
  await start($)
  await spawn($, 'bytheslice:fix-attempter', 'P5 S5.1 fix: again')
  await spawn($, 'bytheslice:fix-attempter', 'P5 S5.2 fix: first here')
  expect(warnsOf(world)).toEqual([['fix-loop-cap', '5.1']])
})

test('ci-fix-attempter has its own per-pie counter of 3 rounds', async ($, on) => {
  const { world, start } = stage(on, { checklist: CHECKLIST_FIXTURE })
  engineLoops(on, ['c1', 'c2', 'c3', 'f1', 'c4'])
  await start($)
  for (const n of [1, 2, 3]) await spawn($, 'bytheslice:ci-fix-attempter', `CI round ${n}`)
  // A slice's fix-attempter is a different loop and stays silent.
  await spawn($, 'bytheslice:fix-attempter', 'P5 S5.1 fix: one')
  expect(warnsOf(world)).toEqual([])
  const fourth = await spawn($, 'bytheslice:ci-fix-attempter', 'CI round 4')
  expect(fourth.agentId).toBe('c4')
  expect(warnsOf(world)).toEqual([['fix-loop-cap', null]])
  expect(world.toasts[0]).toContain('ci-fix-attempter round 4 of cap 3 on Pie 5')
})

test('a commit on a feature branch is silent', async ($, on) => {
  const { world, start } = stage(on, { checklist: CHECKLIST_FIXTURE })
  on('tool.call', () => bashResult())
  await start($)
  const ran = await $.tool.call({ tool: 'Bash', command: 'git commit -m "feat(pie-5): 5.3 task 3 x"' })
  expect(ran.context).toBeUndefined()
  expect(warnsOf(world)).toEqual([])
})

test('a commit on main warns and the Bash result still returns', async ($, on) => {
  const { world, start } = stage(on, { checklist: CHECKLIST_FIXTURE, branch: 'main' })
  const answer = bashResult({ commit: { sha: 'feedfacecafe1234', kind: 'committed', branch: 'main' } })
  on('tool.call', () => answer)
  await start($)
  const ran = await $.tool.call({ tool: 'Bash', command: 'git add -A && git commit -m x' })
  expect(ran.deny).toBeUndefined()
  expect(ran.result).toEqual(answer.result)
  expect(ran.context?.[0]).toBe(
    'The Pass warning (commit-on-main): A git commit ran while this session is on main; ByTheSlice commits and pushes on a pie branch. The command went ahead. Nothing was blocked.',
  )
  expect(warnsOf(world)).toEqual([['commit-on-main', null]])
})

test('a push on master warns; a command that changes directory first says it is best effort', async ($, on) => {
  const { world, start } = stage(on, { checklist: CHECKLIST_FIXTURE, branch: 'master' })
  on('tool.call', () => bashResult())
  await start($)
  const ran = await $.tool.call({ tool: 'Bash', command: 'cd ../other && git push' })
  expect(ran.context?.[0]).toContain('A git push ran while this session is on master')
  expect(ran.context?.[0]).toContain('Best effort')
  expect(warnsOf(world)).toEqual([['commit-on-main', null]])
})

test('the pure parts: fix kinds, branch pies, attempts and the main-branch judgment', () => {
  expect(fixKind('bytheslice:ci-fix-attempter')).toBe('ci')
  expect(fixKind('bytheslice:fix-attempter')).toBe('fix')
  expect(fixKind('bytheslice:debug-instrumenter')).toBeNull()
  expect(branchPie('pie-5-the-pass')).toBe(5)
  expect(branchPie('feature/pie/12')).toBe(12)
  expect(branchPie('main')).toBeNull()
  const checklist = parseChecklist(CHECKLIST_FIXTURE)
  const ledger = projectLedger([], [], checklist)
  const view = { checklist, ledger, branch: 'main', counts: { fix: { '5.1': 2 }, ci: {} } }
  expect(fixSpawnOf({ subagentType: 'bytheslice:fix-attempter', description: 'unlabelled' }, view)).toEqual({ kind: 'fix', key: '5.1', attempt: 3 })
  expect(fixSpawnOf({ subagentType: 'bytheslice:ci-fix-attempter', description: 'P6 ci round' }, view)).toEqual({ kind: 'ci', key: '6', attempt: 1 })
  expect(judgeFixCap({ kind: 'fix', key: '5.1', attempt: 3 })).toBeNull()
  expect(judgeFixCap({ kind: 'fix', key: '5.1', attempt: 5 })?.key).toBe('fix|5.1|5')
  expect(judgeCommitOnMain('git -C /x commit -m y', 'main')?.text).toContain('Best effort')
  expect(judgeCommitOnMain('git status', 'main')).toBeNull()
  expect(judgeCommitOnMain('git commit -m y', null)).toBeNull()
})
