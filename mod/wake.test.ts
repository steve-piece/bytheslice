// mod/wake.test.ts
// Unit tests for bts_wake: a teammate's call arms one timer that fires once at the caller's loop and records a note row; arming again replaces it; session.end cancels it; any other loop arms nothing; an undelivered or ended wake is recorded and toasted.

import { expect, test } from 'claude-code/testing'

import { CHECKLIST_FIXTURE } from './fixtures/checklist.fixture.ts'
import { TEAM, agentCall, endSession, engineLoops, rowsOf, spawn, spawnTeammate, stage, teammateInfo } from './testing.tsx'
import { WAKE_DEFAULT_NOTE, WAKE_MAX_MS, WAKE_MIN_MS, wakeMs, wakeNote, wakeText } from './wake.ts'

const WAKE = 'mcp__bytheslice__bts_wake'
const OVEN = teammateInfo('tm-5', 'oven', 'P5 S5.1 oven: bake Pie 5', 'idle')

const wakeRows = (world: Parameters<typeof rowsOf>[0]) =>
  rowsOf(world).filter(row => row.ev === 'note' && (row.data as { kind?: unknown }).kind === 'wake')

async function team($: Parameters<typeof spawn>[0], on: Parameters<typeof stage>[0], init: Parameters<typeof stage>[1] = {}) {
  const staged = stage(on, { checklist: CHECKLIST_FIXTURE, ...init })
  engineLoops(on, ['tm-5', 'sub-1'])
  await staged.start($)
  await spawnTeammate($, 'oven', OVEN.description)
  staged.world.agents = [OVEN]
  return staged
}

test('a teammate wake fires once, at the caller, as a message, and records a note row', async ($, on) => {
  const { world, clock } = await team($, on)
  const ran = await agentCall($, 'tm-5', { tool: WAKE, afterMs: 30000, note: 'check the verifier' })
  expect(String(ran.result)).toBe(
    'armed: in 30 s the Pass sends you "check the verifier" as a message, which wakes you if you are idle. End your turn now. Arming again replaces this timer.',
  )
  await clock.advance(29000)
  expect(world.sent).toEqual([])
  await clock.advance(1000)
  expect(world.sent).toHaveLength(1)
  expect(world.sent[0]?.text).toBe('bts_wake (30 s): check the verifier')
  expect(world.sent[0]?.to).toContain('tm-5')
  await clock.advance(10 * 60000)
  expect(world.sent).toHaveLength(1)
  const rows = wakeRows(world)
  expect(rows).toHaveLength(1)
  expect(rows[0]).toMatchObject({ pie: 5, aid: 'tm-5' })
  expect(rows[0]?.data).toEqual({ kind: 'wake', teammateId: `oven@${TEAM}`, name: 'oven', afterMs: 30000, note: 'check the verifier', delivered: true })
})

test('arming again replaces the earlier timer', async ($, on) => {
  const { world, clock } = await team($, on)
  await agentCall($, 'tm-5', { tool: WAKE, afterMs: 60000, note: 'first' })
  await agentCall($, 'tm-5', { tool: WAKE, afterMs: 20000, note: 'second' })
  await clock.advance(5 * 60000)
  expect(world.sent.map(sent => sent.text)).toEqual(['bts_wake (20 s): second'])
})

test('session.end cancels a pending wake', async ($, on) => {
  const { world, clock } = await team($, on)
  await agentCall($, 'tm-5', { tool: WAKE, afterMs: 30000, note: 'later' })
  await endSession($)
  await clock.advance(5 * 60000)
  expect(world.sent).toEqual([])
  expect(wakeRows(world)).toEqual([])
})

test('the main conversation and a subagent arm nothing and are told why', async ($, on) => {
  const { world, clock } = await team($, on)
  const main = await $.tool.call({ tool: WAKE, afterMs: 30000, note: 'x' } as never)
  expect(String(main.result)).toContain('not armed: bts_wake wakes a teammate of an agent team')
  await spawn($, 'bytheslice:discovery', 'P5 S5.1 discover: map')
  const sub = await agentCall($, 'sub-1', { tool: WAKE, afterMs: 30000, note: 'x' })
  expect(String(sub.result)).toContain('The main conversation has ScheduleWakeup')
  const bad = await agentCall($, 'tm-5', { tool: WAKE, afterMs: 'soon' })
  expect(String(bad.result)).toBe('not armed: afterMs must be a number of milliseconds. Nothing was halted.')
  await clock.advance(5 * 60000)
  expect(world.sent).toEqual([])
})

test('a refused send is recorded and toasted; a teammate that ended is not sent to', async ($, on) => {
  const { world, clock } = await team($, on, {
    sendResult: { isDelivered: false, reason: 'The server-side auto mode classifier gave no verdict for SendMessage' },
  })
  await agentCall($, 'tm-5', { tool: WAKE, afterMs: 10000 })
  await clock.advance(10000)
  expect(world.sent).toHaveLength(1)
  expect(world.toasts.some(text => text.startsWith('bts_wake could not reach oven: The server-side auto mode classifier'))).toBe(true)
  expect(wakeRows(world)[0]?.data).toMatchObject({ note: WAKE_DEFAULT_NOTE, delivered: false })
  world.agents = [{ ...OVEN, status: 'killed' }]
  await agentCall($, 'tm-5', { tool: WAKE, afterMs: 10000, note: 'gone' })
  await clock.advance(10000)
  expect(world.sent).toHaveLength(1)
  expect(wakeRows(world)[1]?.data).toMatchObject({ note: 'gone', delivered: false, reason: 'the teammate has ended' })
})

test('the pure parts: the wait is clamped, the note cut, the message worded', () => {
  expect(wakeMs(5)).toBe(WAKE_MIN_MS)
  expect(wakeMs('90000')).toBe(90000)
  expect(wakeMs(10 * WAKE_MAX_MS)).toBe(WAKE_MAX_MS)
  expect(wakeMs('later')).toBeNull()
  expect(wakeNote('  ')).toBe(WAKE_DEFAULT_NOTE)
  expect(Array.from(wakeNote('x'.repeat(900)))).toHaveLength(500)
  expect(wakeText('go', 45000)).toBe('bts_wake (45 s): go')
})
