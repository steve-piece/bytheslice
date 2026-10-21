// mod/toasts.test.ts
// Unit tests for the Pass toasts: slice done, a failed verdict and a push each toast once per ledger row; other rows stay quiet.

import { expect, test } from 'claude-code/testing'

import { CHECKLIST_FIXTURE } from './fixtures/checklist.fixture.ts'
import { bashResult, endTurn, engineLoops, spawn, stage } from './testing.tsx'
import { rowKey, toastText } from './toasts.ts'
import type { LedgerRow } from './types'

const SURFACES = ['terminal', 'desktop'] as const

const row = (ev: LedgerRow['ev'], data?: Record<string, unknown>, slice: string | null = '5.2'): LedgerRow => ({
  v: 1,
  t: 1,
  sid: 's',
  ev,
  ...(slice === null ? {} : { slice }),
  ...(data ? { data } : {}),
})

for (const surface of SURFACES) {
  test(`a push toasts once per ledger row, in a ${surface} session`, async ($, on) => {
    const { world, clock } = stage(on, { checklist: CHECKLIST_FIXTURE })
    on('tool.call', () => bashResult({ push: { branch: 'pie-5-the-pass' } }))
    await $.session.start({ cwd: '/repo', surface, isInteractive: true })
    await $.tool.call({ tool: 'Bash', command: 'git push' })
    // A second row at the same moment by the same session is the same row.
    await $.tool.call({ tool: 'Bash', command: 'git push' })
    expect(world.toasts).toEqual(['Pushed pie-5-the-pass'])
    await clock.advance(1000)
    await $.tool.call({ tool: 'Bash', command: 'git push' })
    expect(world.toasts).toEqual(['Pushed pie-5-the-pass', 'Pushed pie-5-the-pass'])
  })
}

test('a failed verdict toasts once; a passing one and plain commits stay quiet', async ($, on) => {
  const { world, start } = stage(on, { checklist: CHECKLIST_FIXTURE })
  engineLoops(on, ['agent-v', 'agent-w'])
  on('tool.call', () => bashResult())
  await start($)
  await spawn($, 'bytheslice:slice-verifier', 'P5 S5.1 verify: a')
  await endTurn($, '{"overall": "fail", "fix_targets": ["implementer | a.ts | x"]}', 'agent-v')
  await spawn($, 'bytheslice:slice-verifier', 'P5 S5.1 verify: b')
  await endTurn($, '{"overall": "pass", "fix_targets": []}', 'agent-w')
  await $.tool.call({ tool: 'Bash', command: 'git commit -m x' })
  expect(world.toasts).toEqual(['Slice 5.1 slice-verifier failed · 1 fix target'])
})

test('which rows toast, and what they say', () => {
  expect(toastText(row('slice.done', { verdict: { overall: 'pass' } }))).toBe('Slice 5.2 done · verifier pass')
  expect(toastText(row('slice.done', { verdict: null }))).toBe('Slice 5.2 done')
  expect(toastText(row('slice.done', undefined, null))).toBe('Slice done')
  expect(toastText(row('verdict', { gate: 'slice-tester', overall: 'fail', fix_targets: ['a', 'b'] }))).toBe(
    'Slice 5.2 slice-tester failed · 2 fix targets',
  )
  expect(toastText(row('verdict', { gate: 'slice-tester', overall: 'pass' }))).toBeNull()
  expect(toastText(row('push', { branch: 'pie-5' }))).toBe('Pushed pie-5')
  expect(toastText(row('push'))).toBe('Pushed')
  for (const ev of ['commit', 'note', 'usage', 'slice.rollup', 'pie.started'] as const) expect(toastText(row(ev))).toBeNull()
  expect(rowKey(row('push'))).toBe('s|1|push||5.2')
})
