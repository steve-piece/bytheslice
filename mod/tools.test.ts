// mod/tools.test.ts
// Unit tests for bts_status and bts_note: registration, an empty ledger, a mid-slice ledger, a mismatch, scope all, and note truncation.

import { expect, test } from 'claude-code/testing'

import { CHECKLIST_FIXTURE } from './fixtures/checklist.fixture.ts'
import { rowLine } from './ledger.ts'
import { ACTIVITY, LEDGER, START_MS, activityLine, note, rowsOf, stage, status } from './testing.tsx'
import { NOTE_MAX, nextAction, statusReport } from './tools.ts'

const DONE_51 = CHECKLIST_FIXTURE.replace(
  '### Slice 5.1 - Pass pane and band [ ]\nStatus: Not Started',
  '### Slice 5.1 - Pass pane and band [x]\nStatus: Completed',
)

const ledger = (...lines: string[]) => `${lines.join('\n')}\n`

test('the four tools register at session start with their schemas in the prompt', async ($, on) => {
  const { world, start } = stage(on, { checklist: CHECKLIST_FIXTURE })
  await start($)
  expect(world.tools).toEqual(['bts_status', 'bts_note', 'bts_hitl', 'bts_wake'])
  expect(world.deferred).toEqual({ bts_status: false, bts_note: false, bts_hitl: false, bts_wake: false })
})

test('bts_status on an empty ledger names the active pie and every slice queued', async ($, on) => {
  const { start } = stage(on, { checklist: CHECKLIST_FIXTURE })
  await start($)
  const text = await status($)
  const lines = text.split('\n')
  expect(lines[0]).toBe('The Pass · Pie 5 The Pass · Slice 5.1 Pass pane and band · queued')
  expect(lines[1]).toBe('branch pie-5-the-pass · 0 of 8 slices done · review boundary')
  expect(lines.filter(line => / 5\.\d queued$/.test(line))).toHaveLength(8)
  expect(text).toContain('Fix loop: 0/3')
  expect(text).toContain('Open HITL: none')
  expect(text).toContain('Mismatches: none')
  expect(text).toContain('Next: start Slice 5.1')
  expect(lines.length).toBeLessThan(40)
})

test('bts_status mid-slice shows status, verdicts, fix targets, the fix loop and live agents', async ($, on) => {
  const { world, start } = stage(on, {
    checklist: DONE_51,
    agents: [{ id: 'fx', description: 'P5 S5.2 fix: a', type: 'bytheslice:fix-attempter', status: 'running' }],
  })
  world.files[LEDGER] = ledger(
    rowLine({ ev: 'slice.started', pie: 5, slice: '5.1' }, 1, 's'),
    rowLine({ ev: 'verdict', pie: 5, slice: '5.1', data: { gate: 'slice-verifier', overall: 'pass', fix_targets: [], head: 'abc1234def' } }, 2, 's'),
    rowLine({ ev: 'slice.started', pie: 5, slice: '5.2' }, 3, 's'),
    rowLine({ ev: 'verdict', pie: 5, slice: '5.2', data: { gate: 'slice-tester', overall: 'pass', fix_targets: [], head: 'abc1234def' } }, 4, 's'),
    rowLine(
      { ev: 'verdict', pie: 5, slice: '5.2', data: { gate: 'slice-verifier', overall: 'fail', fix_targets: ['implementer | mod/a.ts | typecheck'], head: 'abc1234def' } },
      5,
      's',
    ),
  )
  world.files[ACTIVITY] = activityLine({ t: 6, sid: 's', ev: 'SubagentStart', agent: 'bytheslice:fix-attempter', aid: 'fx', pie: 5, slice: '5.2' })
  await start($)
  const text = await status($)
  expect(text).toContain('Slice 5.2 Ledger and status tool · fixing (1/3)')
  expect(text).toContain('  5.1 done · verifier pass abc1234')
  expect(text).toContain('> 5.2 fixing (1/3) · tester pass abc1234 · verifier fail abc1234 (1 target)')
  expect(text).toContain('Fix targets (5.2, slice-verifier):\n  - implementer | mod/a.ts | typecheck')
  expect(text).toContain('Fix loop: 1/3')
  expect(text).toContain('Live agents: fix-attempter running 0s')
  expect(text).toContain('Mismatches: none')
  expect(text).toContain('Next: dispatch fix-attempter on the fix targets of Slice 5.2, then re-verify')
})

test('bts_status names a slice marked [x] with no verifier pass in the ledger', async ($, on) => {
  const { world, start } = stage(on, { checklist: DONE_51 })
  world.files[LEDGER] = ledger(rowLine({ ev: 'slice.started', pie: 5, slice: '5.1' }, 1, 's'))
  await start($)
  const text = await status($)
  expect(text).toContain('Mismatches: 1\n  - Slice 5.1 is [x] with no slice-verifier pass in the ledger')
})

test('bts_status scope all lists every pie on one line and stays under 40 lines', async ($, on) => {
  const { start } = stage(on, { checklist: CHECKLIST_FIXTURE })
  await start($)
  const text = await status($, 'all')
  expect(text).toContain('Pies:\n  Pie 1 Foundations · done · 3/3 slices')
  expect(text).toContain('  Pie 6 Frontend Path · open · 0/2 slices')
  expect(text.split('\n').length).toBeLessThan(40)
})

test('bts_note appends a note row on the active slice, or the one named, and cuts long text', async ($, on) => {
  const { world, start } = stage(on, { checklist: CHECKLIST_FIXTURE })
  await start($)
  expect(await note($, 'chose tee -a for appends')).toBe('ok')
  expect(await note($, 'x'.repeat(NOTE_MAX + 500), '5.4')).toBe('ok')
  expect(await note($, '   ')).toBe('not recorded: text is required')
  expect(await note($, 42)).toBe('not recorded: text is required')
  const rows = rowsOf(world)
  expect(rows).toHaveLength(2)
  expect(rows[0]).toMatchObject({ ev: 'note', pie: 5, slice: '5.1', t: START_MS, data: { text: 'chose tee -a for appends' } })
  expect(rows[1]).toMatchObject({ ev: 'note', pie: 5, slice: '5.4', data: { cut: true } })
  expect(String((rows[1]?.data as { text: string }).text).length).toBe(NOTE_MAX)
  expect(world.toasts).toEqual([])
})

test('the report and the next action cover the edge states', () => {
  const live = { at: 0, agents: [] }
  expect(statusReport({ checklist: null, projection: null, live, branch: null, now: 0 })).toContain('no checklist')
  expect(nextAction(null, null)).toContain('/cook-pizzas')
  const v4 = { pies: [], prep: null, layout: 'stage' as const }
  expect(nextAction(v4, null)).toContain('v4 checklist')
  const done = { pies: [{ n: 7, name: 'Done', review: 'boundary' as const, done: true, slices: [{ id: '7.1', name: 'A', done: true }] }], prep: null, layout: 'pie' as const }
  expect(nextAction(done, null)).toBe('/box-it-up ready')
})
