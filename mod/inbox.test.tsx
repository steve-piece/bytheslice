// mod/inbox.test.tsx
// Unit tests for the HITL inbox on terminal and desktop: the pane lists open items oldest first with a Mark answered button, the band reads HITL n in the warning style, and native notifications go once per raise with a toast fallback.

import { expect, test } from 'claude-code/testing'

import { CHECKLIST_FIXTURE } from './fixtures/checklist.fixture.ts'
import { ANSWER_LABEL } from './rail.tsx'
import { LEDGER, START_MS, bandTarget, hitl, ledgerLine, ledgerText, paneTarget, rowsOf, stage } from './testing.tsx'
import { HITL_TITLE, PIE_TITLE, isBlocking, piesReady } from './notify.ts'
import { parseChecklist } from './checklist.ts'

const SURFACES = ['terminal', 'desktop'] as const
const evs = (world: Parameters<typeof rowsOf>[0], ev: string) => rowsOf(world).filter(row => row.ev === ev)

const raised = (t: number, id: string, category: string, question: string, extra: Record<string, unknown> = {}) =>
  ledgerLine(t, 'hitl.raised', '5.1', { id, category, question, source: 'agent', asked: 'chat', ...extra })

const LONG = 'Should the pane keep a long question on one line and cut it at the width of the pane body, or wrap it?'

const SEEDED = ledgerText([
  raised(START_MS - 120000, 'hitl-old', 'prd_ambiguity', 'Which budget for discovery?'),
  raised(START_MS - 60000, 'hitl-new', 'creative_direction', LONG),
  raised(START_MS - 90000, 'hitl-done', 'destructive_operation', 'Drop the table?'),
  ledgerLine(START_MS - 30000, 'hitl.answered', '5.1', { id: 'hitl-done', answer: 'no', waitedMs: 60000, via: 'tool' }),
])

for (const surface of SURFACES) {
  test(`the pane lists open items oldest first, each with its age, its question cut to the width and a button (${surface})`, async ($, on) => {
    const { world, start } = stage(on, { checklist: CHECKLIST_FIXTURE })
    world.files[LEDGER] = SEEDED
    await start($, surface)
    const ui = await $.ui.mount(paneTarget(surface, 48))
    const texts = (await ui.findAll({ type: 'Text' })).map(line => line.text)
    const at = texts.indexOf('HITL inbox · 2 open')
    expect(at).toBeGreaterThan(-1)
    expect(texts.slice(at + 1)).toEqual([
      '  prd_ambiguity · 5.1 · 2m ago',
      '  Which budget for discovery?',
      '  creative_direction · 5.1 · 1m ago',
      '  Should the pane keep a long question on one l…',
    ])
    expect(texts.every(text => Array.from(text).length <= 48)).toBe(true)
    const buttons = await ui.findAll({ type: 'Button' })
    expect(buttons.map(button => [button.key, button.props.label])).toEqual([
      ['answer-hitl-old', ANSWER_LABEL],
      ['answer-hitl-new', ANSWER_LABEL],
    ])
    expect((await ui.find({ type: 'Text', text: 'HITL inbox · 2 open' }))?.props.color).toBe('warning')
    await ui.unmount()
  })

  test(`pressing Mark answered records the answer and clears the band warning (${surface})`, async ($, on) => {
    const { world, clock, start } = stage(on, { checklist: CHECKLIST_FIXTURE })
    await start($, surface)
    const { id } = JSON.parse(await hitl($, { category: 'prd_ambiguity', question: 'Which budget for discovery?' })) as { id: string }
    const band = await $.ui.mount(bandTarget(surface))
    const warned = await band.find({ type: 'Text' })
    expect(warned?.text).toBe('Pie 5 · Slice 5.1 queued · HITL 1')
    expect(warned?.props.color).toBe('warning')
    await band.unmount()
    const narrow = await $.ui.mount(bandTarget(surface, 59))
    expect((await narrow.find({ type: 'Text' }))?.text).toBe('P5 S5.1 queued HITL 1')
    await narrow.unmount()
    await clock.advance(45000)
    const pane = await $.ui.mount(paneTarget(surface))
    await pane.press({ key: `answer-${id}` })
    expect(evs(world, 'hitl.answered').map(row => row.data)).toEqual([
      { id, answer: 'marked answered in pane', waitedMs: 45000, via: 'pane' },
    ])
    expect(await pane.findAll({ type: 'Button' })).toEqual([])
    await pane.unmount()
    const cleared = await $.ui.mount(bandTarget(surface))
    const line = await cleared.find({ type: 'Text' })
    expect(line?.text).toBe('Pie 5 · Slice 5.1 queued')
    expect(line?.props.color).toBeUndefined()
    await cleared.unmount()
  })

  test(`each raise sends one native notification titled ByTheSlice needs you (${surface})`, async ($, on) => {
    const { world, start } = stage(on, { checklist: CHECKLIST_FIXTURE })
    await start($, surface)
    await hitl($, { category: 'prd_ambiguity', question: 'First question?' })
    await hitl($, { category: 'external_credentials', question: 'Second question?' })
    expect(world.notifies).toEqual([
      { text: 'First question?', title: HITL_TITLE },
      { text: 'Second question?', title: HITL_TITLE },
    ])
    expect(world.toasts).toEqual([])
  })

  test(`a no-surface notification falls back to the toast and the reason goes in the ledger row (${surface})`, async ($, on) => {
    const { world, start } = stage(on, { checklist: CHECKLIST_FIXTURE, notifyResult: { isSent: false, reason: 'no-surface' } })
    await start($, surface)
    const answer = JSON.parse(await hitl($, { category: 'destructive_operation', question: 'Drop the staging table?', slice: '5.5' })) as { notify: string }
    expect(answer.notify).toBe('not sent: no-surface (toast shown)')
    expect(world.notifies).toHaveLength(1)
    expect(world.toasts).toEqual(['HITL destructive_operation · Slice 5.5: Drop the staging table?'])
    expect(evs(world, 'hitl.raised')[0]?.data).toMatchObject({ notify: { isSent: false, reason: 'no-surface' } })
  })
}

test('the last slice of a pie flipping to done sends Pie N is ready once', async ($, on) => {
  const before = [
    '## Pie 7 - Screens [ ]    <!-- review: boundary -->',
    '### Slice 7.1 - One [x]',
    'Status: Completed',
    '### Slice 7.2 - Two [ ]',
    'Status: Not Started',
    '',
    '## Pie 8 - Later [ ]    <!-- review: boundary -->',
    '### Slice 8.1 - Three [ ]',
    'Status: Not Started',
    '',
  ].join('\n')
  const after = before.replace('### Slice 7.2 - Two [ ]\nStatus: Not Started', '### Slice 7.2 - Two [x]\nStatus: Completed')
  const { world, start } = stage(on, { checklist: before })
  on('tool.call', () => {
    world.checklist = after
    return { result: { filePath: 'docs/plans/00_master_checklist.md' } }
  })
  await start($)
  for (let i = 0; i < 2; i += 1) {
    await $.tool.call({ tool: 'Edit', file_path: 'docs/plans/00_master_checklist.md', old_string: '[ ]', new_string: '[x]' })
  }
  expect(world.notifies).toEqual([{ text: 'Pie 7 is ready for /box-it-up', title: PIE_TITLE }])
  expect(piesReady(parseChecklist(before), parseChecklist(after))).toEqual([7])
  expect(piesReady(parseChecklist(after), parseChecklist(after))).toEqual([])
})

test('blocking means one of the four categories, or any item asked in chat', () => {
  expect(isBlocking({ category: 'prd_ambiguity', asked: 'chat' })).toBe(true)
  expect(isBlocking({ category: 'other', asked: 'chat' })).toBe(true)
  expect(isBlocking({ category: 'other', asked: 'pane' })).toBe(false)
})
