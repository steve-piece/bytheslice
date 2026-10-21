// mod/watchdog-actions.test.ts
// Unit tests for the stall responses: the first stall's row, toast, pane flag and hidden note; a repeat suppressed; a slice's second stall raising a pane-only HITL item; nothing messaged or stopped.

import { expect, mock, test } from 'claude-code/testing'
import type { AgentInfo } from 'claude-code'

import { CHECKLIST_FIXTURE } from './fixtures/checklist.fixture.ts'
import { CWD, START_MS, agentCall, bashResult, engineLoops, paneTarget, rowsOf, spawn, stage } from './testing.tsx'
import { SCAN_MS } from './watchdog.ts'
import { minutes, planStalls, stallNote, stalledIds } from './watchdog-actions.ts'

const CONFIG = `${CWD}/bytheslice.config.json`
const FAST = JSON.stringify({ pass: { watchdog: { idleMs: 20000, budgetsMs: { discovery: 30000 } } } })
const SURFACES = ['terminal', 'desktop'] as const

const discovery = (status: AgentInfo['status'] = 'running'): AgentInfo => ({
  id: 'd1',
  description: 'P5 S5.5 discover: sleep',
  type: 'bytheslice:discovery',
  status,
})

const notesOf = (session: ReturnType<typeof mock.session>): string[] =>
  session
    .appended()
    .filter(row => row.origin.kind === 'plugin')
    .map(row => row.message.content.map(block => (block.type === 'text' ? block.text : '')).join(''))

const evs = (world: Parameters<typeof rowsOf>[0], ev: string) => rowsOf(world).filter(row => row.ev === ev)

test('minutes round to whole minutes, at least one; the note names role, id and minutes', () => {
  expect(minutes(31000)).toBe('1 minute')
  expect(minutes(12 * 60000 + 20000)).toBe('12 minutes')
  expect(stallNote({ aid: 'd1', role: 'discovery', runningMs: 7 * 60000, idleMs: 4 * 60000 })).toBe(
    'The Pass watchdog: agent discovery d1 has been running 7 minutes with no tool activity for 4 minutes; consider checking it, sending it a message, or stopping it. Nothing was stopped.',
  )
})

test('planning: a new episode counts against its slice, the same episode is skipped, the second is a HITL', () => {
  const stall = { aid: 'd1', role: 'discovery', runningMs: 1, idleMs: 1, budgetMs: 1, lastT: 10, startT: 0 }
  const keyOf = () => '5.5'
  const first = planStalls({ agents: {}, counts: {} }, [stall], keyOf, 100)
  expect(first.steps.map(step => [step.n, step.act])).toEqual([[1, 'note']])
  const repeat = planStalls(first.book, [stall], keyOf, 130)
  expect(repeat.steps).toEqual([])
  const again = planStalls(first.book, [{ ...stall, lastT: 50 }, { ...stall, aid: 'd2', lastT: 5 }], keyOf, 160)
  expect(again.steps.map(step => [step.stall.aid, step.n, step.act])).toEqual([
    ['d1', 2, 'hitl'],
    ['d2', 3, 'hitl'],
  ])
  // Flagged until a later stamp ends the episode.
  expect([...stalledIds(first.book, { d1: { lastT: 10, startT: 0, role: 'discovery' } })]).toEqual(['d1'])
  expect([...stalledIds(first.book, { d1: { lastT: 11, startT: 0, role: 'discovery' } })]).toEqual([])
})

test('the clock moving 31 seconds past the threshold flags within one tick: a row, a toast, a pane flag and a hidden note', async ($, on) => {
  const { world, clock, start } = stage(on, { checklist: CHECKLIST_FIXTURE, files: { [CONFIG]: FAST } })
  const session = mock.session(on)
  engineLoops(on, ['d1'])
  await start($)
  const started = await spawn($, 'bytheslice:discovery', 'P5 S5.5 discover: sleep')
  world.agents = [discovery()]
  // Budget 30 s and idle 20 s both pass at 30 s: 31 s later one tick has run.
  await clock.set(START_MS + 30000 + 31000)
  const rows = evs(world, 'agent.stalled')
  expect(rows).toHaveLength(1)
  expect(rows[0]).toMatchObject({ pie: 5, slice: '5.5', aid: 'd1', agent: 'bytheslice:discovery' })
  expect(rows[0]?.data).toEqual({ aid: 'd1', role: 'discovery', runningMs: 60000, idleMs: 60000, n: 1 })
  expect(world.toasts.filter(text => text.startsWith('Pass watchdog'))).toEqual([
    'Pass watchdog · Slice 5.5: discovery d1 stalled, running 1 minute, idle 1 minute. Nothing was stopped.',
  ])
  expect(notesOf(session)).toEqual([
    'The Pass watchdog: agent discovery d1 has been running 1 minute with no tool activity for 1 minute; consider checking it, sending it a message, or stopping it. Nothing was stopped.',
  ])
  // Nothing was stopped, messaged or raised.
  expect(started.agentId).toBe('d1')
  expect(evs(world, 'hitl.raised')).toEqual([])
  for (const surface of SURFACES) {
    const ui = await $.ui.mount(paneTarget(surface))
    const row = await ui.find({ type: 'Text', text: /^ {2}discovery · running/ })
    expect(row?.text.endsWith(' · stalled')).toBe(true)
    expect(row?.props.color).toBe('warning')
    await ui.unmount()
  }
})

test('a repeat of the same episode is suppressed; activity clears the flag; the slice second stall raises a pane-only HITL', async ($, on) => {
  const { world, clock, start } = stage(on, { checklist: CHECKLIST_FIXTURE, files: { [CONFIG]: FAST } })
  const session = mock.session(on)
  engineLoops(on, ['d1'])
  on('tool.call', () => bashResult())
  await start($)
  await spawn($, 'bytheslice:discovery', 'P5 S5.5 discover: sleep')
  world.agents = [discovery()]
  await clock.set(START_MS + 2 * SCAN_MS)
  expect(evs(world, 'agent.stalled')).toHaveLength(1)
  // Three more ticks of the same episode: nothing new.
  await clock.set(START_MS + 5 * SCAN_MS)
  expect(evs(world, 'agent.stalled')).toHaveLength(1)
  expect(notesOf(session)).toHaveLength(1)
  // The agent calls a tool: the flag clears.
  await agentCall($, 'd1', { tool: 'Read', file_path: 'a.ts' })
  for (const surface of SURFACES) {
    const ui = await $.ui.mount(paneTarget(surface))
    expect((await ui.find({ type: 'Text', text: /^ {2}discovery · running/ }))?.text.endsWith(' · stalled')).toBe(false)
    await ui.unmount()
  }
  // Idle again past 20 s: the second stall of Slice 5.5.
  await clock.advance(2 * SCAN_MS)
  const rows = evs(world, 'agent.stalled')
  expect(rows.map(row => (row.data as { n: number }).n)).toEqual([1, 2])
  expect(notesOf(session)).toHaveLength(1)
  const raised = evs(world, 'hitl.raised')
  expect(raised).toHaveLength(1)
  expect(raised[0]).toMatchObject({ slice: '5.5' })
  expect(raised[0]?.data).toMatchObject({
    category: 'other',
    source: 'pass',
    asked: 'pane',
    kind: 'agent-stalled',
    notify: { isSent: false, reason: 'not-blocking' },
  })
  expect(String((raised[0]?.data as { question: string }).question)).toContain('Stall 2 on Slice 5.5: agent discovery d1')
  // A stall only the pane shows sends no native notification.
  expect(world.notifies).toEqual([])
  // Still no message to the agent and nothing stopped: the agent list is as it was.
  expect(world.agents.map(entry => entry.status)).toEqual(['running'])
})

test('a finished agent clears from the scan and never flags again', async ($, on) => {
  const { world, clock, start } = stage(on, { checklist: CHECKLIST_FIXTURE, files: { [CONFIG]: FAST } })
  engineLoops(on, ['d1'])
  await start($)
  await spawn($, 'bytheslice:discovery', 'P5 S5.5 discover: quick')
  world.agents = [discovery('completed')]
  await clock.advance(10 * SCAN_MS)
  expect(evs(world, 'agent.stalled')).toEqual([])
})
