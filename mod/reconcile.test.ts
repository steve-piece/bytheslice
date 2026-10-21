// mod/reconcile.test.ts
// Unit tests for pass reconcile: agreeing and disagreeing fixtures, slices done before the ledger, and that it never edits.

import { expect, test } from 'claude-code/testing'

import { parseChecklist } from './checklist.ts'
import { CHECKLIST_FIXTURE } from './fixtures/checklist.fixture.ts'
import { projectLedger } from './ledger-projection.ts'
import { countLine, reconcileText } from './reconcile.ts'
import { LEDGER, activeAt52, stage } from './testing.tsx'
import type { LedgerRow } from './types'

const TYPED = (args: string) => ({
  command: 'pass',
  args,
  origin: { kind: 'composer' as const },
  presentation: { isFullscreen: false, columns: 120 },
})

const line = (t: number, ev: string, slice: string, data?: Record<string, unknown>) =>
  JSON.stringify({ v: 1, t, sid: 's', ev, pie: Number(slice.split('.')[0]), slice, ...(data ? { data } : {}) })

test('pass reconcile prints 0 mismatches when the checklist and the ledger agree', async ($, on) => {
  const { world, start } = stage(on, { checklist: activeAt52(CHECKLIST_FIXTURE) })
  world.files[LEDGER] = `${[
    line(1, 'slice.started', '5.1'),
    line(2, 'verdict', '5.1', { gate: 'slice-verifier', overall: 'pass', fix_targets: [], head: 'abc1234' }),
    line(3, 'slice.started', '5.2'),
  ].join('\n')}\n`
  await start($)
  const before = { ...world.files }
  const checklist = world.checklist
  const out = await $.command.run(TYPED('reconcile'))
  expect(out.text).toContain('0 mismatches')
  expect(out.text).toContain('Nothing was changed.')
  expect(world.files).toEqual(before)
  expect(world.checklist).toBe(checklist)
  expect(world.opened).toBe(1)
})

test('pass reconcile lists each disagreement in both directions', async ($, on) => {
  const { world, start } = stage(on, { checklist: activeAt52(CHECKLIST_FIXTURE) })
  world.files[LEDGER] = `${[
    line(1, 'slice.started', '5.1'),
    line(2, 'verdict', '5.1', { gate: 'slice-verifier', overall: 'fail', fix_targets: ['x'], head: 'abc1234' }),
    line(3, 'verdict', '5.3', { gate: 'slice-verifier', overall: 'pass', fix_targets: [], head: 'def5678' }),
  ].join('\n')}\n`
  await start($)
  const out = await $.command.run(TYPED('reconcile'))
  expect(String(out.text).split('\n')).toEqual([
    'Pass reconcile: checklist against .bytheslice/ledger.jsonl',
    '  Slice 5.1 is [x] with no slice-verifier pass in the ledger (last verdict at abc1234)',
    '  Slice 5.3 has a slice-verifier pass (def5678) but is still [ ]',
    expect.stringMatching(/^2 mismatches \(20 slices read, \d+ done before the ledger and not compared\)\. Nothing was changed\.$/),
  ])
})

test('the pass command without reconcile still toggles the pane', async ($, on) => {
  const { world, start } = stage(on, { checklist: CHECKLIST_FIXTURE })
  await start($, 'terminal', false)
  expect((await $.command.run(TYPED(''))).text).toBe('The Pass pane opened.')
  expect(world.panes.map(pane => pane.id)).toEqual(['pass'])
})

test('reconcile text for an empty projection and the count wording', () => {
  expect(reconcileText(null)).toContain('0 mismatches')
  expect(countLine(1)).toBe('1 mismatch')
  expect(countLine(3)).toBe('3 mismatches')
  const rows: LedgerRow[] = []
  const text = reconcileText(projectLedger(rows, [], parseChecklist(CHECKLIST_FIXTURE), 0))
  expect(text).toContain('0 mismatches (20 slices read, 10 done before the ledger and not compared)')
})
