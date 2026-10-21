// mod/hitl.test.ts
// Unit tests for the HITL core: bts_hitl raises and answers, a double answer is ignored, an unknown id is refused with text, the projection orders items oldest first with waitedMs from ledger times, and the operator's reply in chat answers what was asked there.

import { expect, test } from 'claude-code/testing'

import { CHECKLIST_FIXTURE } from './fixtures/checklist.fixture.ts'
import { NEXT_STEP, PANE_ANSWER, REPLY_ANSWER, answerText, isOperatorReply, newId, parseHitl } from './hitl.ts'
import { hitlOf } from './ledger-projection.ts'
import { START_MS, hitl, ledgerLine, ledgerText, rowsOf, stage, status } from './testing.tsx'
import type { LedgerRow } from './types'

const evs = (world: Parameters<typeof rowsOf>[0], ev: string) => rowsOf(world).filter(row => row.ev === ev)

const ASK = { category: 'prd_ambiguity', question: 'Should the watchdog nudge teammates too?', context: 'spec 4.7 is unclear' }

/** The prompt the operator types, as the engine stamps it. */
const typedPrompt = (text: string, kind = 'composer') => ({ text, origin: { kind } }) as never

const row = (t: number, ev: 'hitl.raised' | 'hitl.answered', data: Record<string, unknown>): LedgerRow =>
  JSON.parse(ledgerLine(t, ev, '5.5', data)) as LedgerRow

test('raising returns at once with the id, an open status and the next step, and records the question', async ($, on) => {
  const { world, start } = stage(on, { checklist: CHECKLIST_FIXTURE })
  await start($)
  const answer = JSON.parse(await hitl($, ASK)) as { id: string; status: string; next: string }
  expect(answer.status).toBe('open')
  expect(answer.next).toBe(NEXT_STEP)
  expect((answer as unknown as { notify: string }).notify).toBe('sent (iterm2)')
  expect(answer.id).toMatch(/^hitl-[0-9a-z]+$/)
  const raised = evs(world, 'hitl.raised')
  expect(raised).toHaveLength(1)
  expect(raised[0]).toMatchObject({ pie: 5, slice: '5.1' })
  expect(raised[0]?.data).toEqual({
    id: answer.id,
    category: 'prd_ambiguity',
    question: ASK.question,
    context: ASK.context,
    source: 'agent',
    asked: 'chat',
    notify: { isSent: true, channel: 'iterm2' },
  })
  const text = await status($)
  expect(text).toContain('Open HITL: 1 (oldest first; answer with bts_hitl { id, answer })')
  expect(text).toContain(`  - ${answer.id} prd_ambiguity 5.1 0s: ${ASK.question}`)
})

test('answering records the answer and how long it waited; a second answer is ignored', async ($, on) => {
  const { world, clock, start } = stage(on, { checklist: CHECKLIST_FIXTURE })
  await start($)
  const { id } = JSON.parse(await hitl($, { ...ASK, slice: '5.5' })) as { id: string }
  await clock.advance(90000)
  const first = JSON.parse(await hitl($, { id, answer: 'Yes: nudge teammates in 5.6.' })) as { status: string; waitedMs: number }
  expect(first).toEqual({ id, status: 'answered', waitedMs: 90000 })
  const again = await hitl($, { id, answer: 'No, changed my mind.' })
  expect(again).toBe('already answered (tool); nothing changed.')
  const answered = evs(world, 'hitl.answered')
  expect(answered).toHaveLength(1)
  expect(answered[0]).toMatchObject({ pie: 5, slice: '5.5' })
  expect(answered[0]?.data).toEqual({ id, answer: 'Yes: nudge teammates in 5.6.', waitedMs: 90000, via: 'tool' })
  expect(await status($)).toContain('Open HITL: none')
})

test('an unknown id is refused with text naming the open ones; a malformed call says what it needs', async ($, on) => {
  const { world, start } = stage(on, { checklist: CHECKLIST_FIXTURE })
  await start($)
  const { id } = JSON.parse(await hitl($, ASK)) as { id: string }
  expect(await hitl($, { id: 'hitl-nope', answer: 'x' })).toBe(`not recorded: no HITL item has id hitl-nope (open: ${id}).`)
  expect(await hitl($, { id })).toBe('not recorded: an answer needs both id and answer.')
  expect(await hitl($, { category: 'urgent', question: 'q' })).toContain('not raised: category must be one of prd_ambiguity')
  expect(await hitl($, { category: 'creative_direction' })).toBe('not raised: question is required.')
  expect(evs(world, 'hitl.answered')).toEqual([])
  expect(evs(world, 'hitl.raised')).toHaveLength(1)
})

test('the projection lists open items oldest first, and waitedMs from the ledger times', () => {
  const rows = [
    row(START_MS + 5000, 'hitl.raised', { id: 'b', category: 'creative_direction', question: 'second', source: 'agent', asked: 'chat' }),
    row(START_MS, 'hitl.raised', { id: 'a', category: 'prd_ambiguity', question: 'first', source: 'agent', asked: 'chat' }),
    row(START_MS + 9000, 'hitl.raised', { id: 'c', category: 'other', question: 'third', source: 'pass', asked: 'pane', kind: 'agent-stalled' }),
    row(START_MS + 65000, 'hitl.answered', { id: 'b', answer: 'y', waitedMs: 1, via: 'tool' }),
    row(START_MS + 99000, 'hitl.answered', { id: 'b', answer: 'z', waitedMs: 2, via: 'tool' }),
    row(START_MS + 1000, 'hitl.answered', { id: 'ghost', answer: 'n', via: 'tool' }),
  ]
  const view = hitlOf(rows)
  expect(view.open.map(item => item.id)).toEqual(['a', 'c'])
  expect(view.open[1]).toEqual({
    id: 'c',
    category: 'other',
    question: 'third',
    context: null,
    source: 'pass',
    asked: 'pane',
    kind: 'agent-stalled',
    pie: 5,
    slice: '5.5',
    t: START_MS + 9000,
  })
  // The first answer's time minus the raise's; the stored number and later answers do not count.
  expect(view.waitedMs).toEqual({ b: 60000 })
})

test("the operator's reply in chat answers the items asked there, never the pane-only ones, and keeps none of their words", async ($, on) => {
  const { world, clock, start } = stage(on, { checklist: CHECKLIST_FIXTURE })
  on('prompt.submit', (_$, e) => ({ text: e.text }))
  world.files['/repo/.bytheslice/ledger.jsonl'] = ledgerText([
    ledgerLine(START_MS - 1000, 'hitl.raised', '5.5', { id: 'stall', category: 'other', question: 'stalled', source: 'pass', asked: 'pane', kind: 'agent-stalled' }),
  ])
  await start($)
  const { id } = JSON.parse(await hitl($, ASK)) as { id: string }
  await clock.advance(30000)
  // A slash command, a scheduled prompt and an unstamped one are not replies.
  await $.prompt.submit({ text: '/pass', origin: { kind: 'composer' }, command: { name: 'pass', args: '' } } as never)
  await $.prompt.submit(typedPrompt('loop tick', 'scheduled-trigger'))
  await $.prompt.submit({ text: 'bare' } as never)
  expect(evs(world, 'hitl.answered')).toEqual([])
  await $.prompt.submit(typedPrompt('go with option B, my token is sk-live-000000000000000000'))
  const answered = evs(world, 'hitl.answered')
  expect(answered.map(entry => entry.data)).toEqual([{ id, answer: REPLY_ANSWER, waitedMs: 30000, via: 'reply' }])
  expect(JSON.stringify(rowsOf(world))).not.toContain('option B')
  expect(JSON.stringify(rowsOf(world))).not.toContain('sk-live')
  // The model's own answer afterwards is kept once, as the decision; a third is ignored.
  await clock.advance(5000)
  expect(JSON.parse(await hitl($, { id, answer: 'Nudge teammates in 5.6.' }))).toEqual({ id, status: 'answered', waitedMs: 30000 })
  expect(await hitl($, { id, answer: 'again' })).toBe('already answered (reply); nothing changed.')
  expect(evs(world, 'hitl.answered').map(entry => (entry.data as { via: string }).via)).toEqual(['reply', 'tool'])
  // The pane-only stall item is still open.
  expect(await status($)).toContain('Open HITL: 1')
})

test('answers keep no secrets: the credentials category records none of it, token shapes are redacted', () => {
  expect(answerText('external_credentials', 'use key abc')).toBe('(not recorded: credentials category)')
  expect(answerText('prd_ambiguity', 'Use sk-ant-api03-abcdefghijklmnop and ghp_abcdefghijklmnopqrstuvwxyz12 please')).toBe(
    'Use [redacted] and [redacted] please',
  )
  expect(answerText('prd_ambiguity', `ship it\n${'x'.repeat(900)}`)).toHaveLength(500)
  expect(PANE_ANSWER).toBe('marked answered in pane')
})

test('the pure parts: parsing both shapes, ids, and which prompts are replies', () => {
  expect(parseHitl({ id: ' hitl-1 ', answer: ' ok ' })).toEqual({ kind: 'answer', id: 'hitl-1', answer: 'ok' })
  expect(parseHitl({ category: 'destructive_operation', question: 'Drop the table?', slice: '5.5' })).toEqual({
    kind: 'raise',
    raise: { category: 'destructive_operation', question: 'Drop the table?', context: null, slice: '5.5', source: 'agent', asked: 'chat' },
  })
  expect(parseHitl({ category: 'other', question: 'q' }).kind).toBe('invalid')
  expect(parseHitl(null).kind).toBe('invalid')
  expect(newId(START_MS)).toMatch(/^hitl-[0-9a-z]{10}$/)
  expect(isOperatorReply({ origin: { kind: 'composer' } })).toBe(true)
  expect(isOperatorReply({ origin: { kind: 'bridge' } })).toBe(true)
  expect(isOperatorReply({ origin: { kind: 'task-notification' } })).toBe(false)
  expect(isOperatorReply({ origin: { kind: 'composer' }, isMeta: true })).toBe(false)
})
