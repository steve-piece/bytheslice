// mod/ledger-projection.test.ts
// Unit tests for the pure ledger projection: status ladder, fix loops from activity, rollups, dedupe, checklist-only slices, mismatches, cost.

import { expect, test } from 'claude-code/testing'

import { parseChecklist } from './checklist.ts'
import { CHECKLIST_FIXTURE } from './fixtures/checklist.fixture.ts'
import { dedupeActivity, findSlice, liveAgents, parseActivity, projectLedger, rollup, STALE_MS, statusOf } from './ledger-projection.ts'
import { ACTIVITY, ROTATED, activityLine, stage, status } from './testing.tsx'
import type { ActivityRow, LedgerRow } from './types'

const C = parseChecklist(CHECKLIST_FIXTURE)
const DONE_51 = parseChecklist(
  CHECKLIST_FIXTURE.replace('### Slice 5.1 - Pass pane and band [ ]\nStatus: Not Started', '### Slice 5.1 - Pass pane and band [x]\nStatus: Completed'),
)

const row = (t: number, ev: LedgerRow['ev'], slice: string, data?: Record<string, unknown>, sid = 's'): LedgerRow => ({
  v: 1,
  t,
  sid,
  ev,
  pie: Number(slice.split('.')[0]),
  slice,
  ...(data ? { data } : {}),
})

const start = (t: number, role: string, aid: string, slice = '5.2'): ActivityRow => ({
  t,
  sid: 's',
  ev: 'SubagentStart',
  agent: `bytheslice:${role}`,
  aid,
  pie: 5,
  slice,
})

const stop = (t: number, aid: string, slice = '5.2'): ActivityRow => ({ t, sid: 's', ev: 'SubagentStop', aid, pie: 5, slice })

const verdict = (t: number, gate: string, overall: string, head: string | null = 'abc1234', slice = '5.2') =>
  row(t, 'verdict', slice, { gate, overall, fix_targets: overall === 'fail' ? ['implementer | a.ts | x'] : [], head })

test('the status ladder follows the latest signal from rows and activity', () => {
  const rows: LedgerRow[] = [row(1, 'slice.started', '5.2')]
  const acts: ActivityRow[] = []
  const at = () => findSlice(projectLedger(rows, acts, C, 10), '5.2')?.status
  expect(at()).toBe('building')
  acts.push(start(2, 'implementer', 'i1'))
  expect(at()).toBe('building')
  acts.push(start(3, 'slice-tester', 't1'))
  expect(at()).toBe('testing')
  rows.push(verdict(4, 'slice-tester', 'pass'))
  expect(at()).toBe('verifying')
  acts.push(start(5, 'slice-verifier', 'v1'))
  expect(at()).toBe('verifying')
  rows.push(verdict(6, 'slice-verifier', 'fail'))
  expect(at()).toBe('fixing')
  acts.push(start(7, 'fix-attempter', 'f1'))
  expect(at()).toBe('fixing')
  rows.push(verdict(8, 'slice-verifier', 'pass'))
  expect(at()).toBe('verifying')
  expect(findSlice(projectLedger(rows, acts, C, 10), '5.3')?.status).toBe('queued')
  expect(statusOf(true, [{ t: 1, status: 'fixing' }])).toBe('done')
  expect(statusOf(false, [])).toBe('queued')
})

test('the fix loop counts fix-attempter starts in the activity log only', () => {
  const rows = [verdict(1, 'slice-verifier', 'fail'), verdict(2, 'slice-verifier', 'fail')]
  const acts = [
    start(3, 'fix-attempter', 'f1'),
    start(3, 'fix-attempter', 'f1'),
    start(4, 'debug-instrumenter', 'd1'),
    start(5, 'fix-attempter', 'f2'),
    start(6, 'fix-attempter', 'f9', '5.3'),
  ]
  const view = findSlice(projectLedger(rows, acts, C, 10), '5.2')
  expect(view?.fixLoop).toBe(2)
  expect(findSlice(projectLedger(rows, [], C, 10), '5.2')?.fixLoop).toBe(0)
})

test('a rollup totals agents by role, tokens, time and fix loops, and survives rotation', () => {
  const acts: ActivityRow[] = [
    start(1, 'implementer', 'i1'),
    { t: 2, sid: 's', ev: 'PostToolUse', agent: 'bytheslice:implementer', aid: 'i1', tok: 700, ms: 4000, ok: true, pie: 5, slice: '5.2' },
    start(3, 'slice-tester', 't1'),
    { t: 4, sid: 's', ev: 'PostToolUse', agent: 'bytheslice:slice-tester', aid: 't1', tok: 300, ms: 1000, ok: true, pie: 5, slice: '5.2' },
    start(5, 'fix-attempter', 'f1'),
    start(6, 'implementer', 'i9', '5.3'),
  ]
  const totals = rollup(acts, '5.2')
  expect(totals).toEqual({
    agents: {
      implementer: { count: 1, tok: 700, ms: 4000 },
      'slice-tester': { count: 1, tok: 300, ms: 1000 },
      'fix-attempter': { count: 1, tok: 0, ms: 0 },
    },
    fixLoops: 1,
    tokens: 1000,
    ms: 5000,
  })
  // Once the activity log has rotated away, the slice reads its totals from the rollup row.
  const rows = [row(9, 'slice.rollup', '5.2', totals)]
  const view = findSlice(projectLedger(rows, [], C, 10), '5.2')
  expect(view?.fixLoop).toBe(1)
  expect(view?.tokens).toBe(1000)
})

test('duplicate activity rows count once, by time and agent id', () => {
  const twice = [start(1, 'implementer', 'i1'), start(1, 'implementer', 'i1'), start(1, 'implementer', 'i2')]
  expect(dedupeActivity(twice)).toHaveLength(2)
  expect(rollup(twice, '5.2').agents.implementer?.count).toBe(2)
  expect(parseActivity(`${JSON.stringify(start(1, 'x', 'a'))}\n{"t":2,"ev":"Sub`)).toHaveLength(1)
})

test('a slice with no ledger rows still reports from the checklist', () => {
  const p = projectLedger([], [], DONE_51, 10)
  const done = findSlice(p, '5.1')
  const open = findSlice(p, '5.2')
  expect(done).toMatchObject({ status: 'done', tracked: false, verdicts: [], commits: [], fixLoop: 0 })
  expect(open).toMatchObject({ status: 'queued', tracked: false })
  expect(p.active).toEqual({ pie: 5, slice: '5.2' })
  expect(p.pies).toHaveLength(6)
  expect(p.mismatches).toEqual([])
  expect(p.untracked).toBe(DONE_51.pies.flatMap(pie => pie.slices).filter(slice => slice.done).length)
  expect(projectLedger([], [], null, 0).pies).toEqual([])
})

test('mismatches: a tracked [x] without a verifier pass, and a verifier pass on an open slice', () => {
  const rows = [row(1, 'slice.started', '5.1'), verdict(2, 'slice-verifier', 'pass', 'abc1234', '5.3')]
  expect(projectLedger(rows, [], DONE_51, 10).mismatches).toEqual([
    { pie: 5, slice: '5.1', kind: 'done-without-pass', head: null },
    { pie: 5, slice: '5.3', kind: 'pass-without-done', head: 'abc1234' },
  ])
  const agreed = [row(1, 'slice.started', '5.1'), verdict(2, 'slice-verifier', 'pass', 'abc1234', '5.1')]
  expect(projectLedger(agreed, [], DONE_51, 10).mismatches).toEqual([])
  const noHead = [verdict(2, 'slice-verifier', 'pass', null, '5.1')]
  expect(projectLedger(noHead, [], DONE_51, 10).mismatches.map(m => m.kind)).toEqual(['done-without-pass'])
})

test('commits, notes, duration and cost per slice', () => {
  const rows: LedgerRow[] = [
    row(100, 'slice.started', '5.2'),
    row(150, 'commit', '5.2', { sha: 'aaa1111' }),
    row(160, 'commit', '5.2', { sha: 'aaa1111' }),
    row(170, 'note', '5.2', { text: 'chose tee' }),
    row(180, 'usage', '5.2', { costUsd: 0.5 }),
    row(190, 'usage', '5.2', { costUsd: 0.75 }),
    row(195, 'usage', '5.3', { costUsd: 1 }),
    row(200, 'usage', '5.2', { costUsd: 0.25 }, 'other-session'),
    row(400, 'slice.done', '5.2'),
  ]
  const view = findSlice(projectLedger(rows, [], C, 500), '5.2')
  expect(view).toMatchObject({ commits: ['aaa1111'], notes: 1, startedAt: 100, doneAt: 400, durationMs: 300, costUsd: 1 })
  expect(findSlice(projectLedger(rows, [], C, 500), '5.3')?.costUsd).toBe(0.25)
})

test('live agents are starts with no stop, and a start older than the stale bound is dropped', () => {
  const acts = [start(1000, 'implementer', 'i1'), start(2000, 'slice-tester', 't1'), stop(3000, 't1'), start(10, 'old', 'o1')]
  const live = liveAgents(acts, 10 + STALE_MS + 1)
  expect(live.map(a => a.aid)).toEqual(['i1'])
  expect(live[0]).toEqual({ aid: 'i1', role: 'implementer', pie: 5, slice: '5.2', startedAt: 1000 })
  expect(findSlice(projectLedger([], acts, C, 5000), '5.2')?.agents.map(a => a.aid)).toEqual(['o1', 'i1'])
})

test('the activity log is read rotated file first and a partial line is skipped', async ($, on) => {
  const { world, start: begin } = stage(on, { checklist: CHECKLIST_FIXTURE })
  world.files[ROTATED] = activityLine(start(1, 'implementer', 'i1', '5.1'))
  world.files[ACTIVITY] = `${activityLine(start(2, 'slice-tester', 't1', '5.1'))}{"t":3,"ev":"SubagentSt`
  await begin($)
  expect(await status($)).toContain('> 5.1 testing')
})
