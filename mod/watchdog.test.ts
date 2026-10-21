// mod/watchdog.test.ts
// Unit tests for the stall detector: the pure scan by case, the activity stamps on tool.call and turn.start, the config thresholds, and the 30 second interval cancelled at session.end.

import { expect, test } from 'claude-code/testing'
import type { AgentInfo } from 'claude-code'

import { CHECKLIST_FIXTURE } from './fixtures/checklist.fixture.ts'
import { DEFAULT_WATCHDOG, budgetMs, readPolicy } from './policy.ts'
import { CWD, START_MS, agentCall, bashResult, endSession, engineLoops, rowsOf, spawn, stage } from './testing.tsx'
import type { PassSeen, PassWatchdog } from './types'
import { SCAN_MS, reconcileSeen, scanAgents } from './watchdog.ts'

const CONFIG = `${CWD}/bytheslice.config.json`
/** The thresholds the stall reproduction uses: idle past 20 seconds, discovery's budget 30 seconds. */
const FAST = JSON.stringify({ pass: { watchdog: { idleMs: 20000, budgetsMs: { discovery: 30000 } } } })

const CFG: PassWatchdog = { enabled: true, idleMs: 180000, budgetsMs: { default: 900000, discovery: 300000, implementer: 1800000 } }
const MIN = 60000

const agent = (id: string, type: string, status: AgentInfo['status'] = 'running', extra: Partial<AgentInfo> = {}): AgentInfo => ({
  id,
  description: `P5 S5.5 ${type}`,
  type,
  status,
  ...extra,
})

const seenAt = (startT: number, lastT: number, role: string): PassSeen => ({ startT, lastT, role })

const stalledRows = (world: Parameters<typeof rowsOf>[0]) => rowsOf(world).filter(row => row.ev === 'agent.stalled')

test('running past its budget and idle past idleMs flags', () => {
  const now = 20 * MIN
  const stalls = scanAgents([agent('d1', 'bytheslice:discovery')], { d1: seenAt(0, 10 * MIN, 'discovery') }, now, CFG)
  expect(stalls).toEqual([{ aid: 'd1', role: 'discovery', runningMs: 20 * MIN, idleMs: 10 * MIN, budgetMs: 5 * MIN, lastT: 10 * MIN, startT: 0 }])
})

test('running past its budget but active does not flag', () => {
  const now = 20 * MIN
  expect(scanAgents([agent('d1', 'bytheslice:discovery')], { d1: seenAt(0, now - 30000, 'discovery') }, now, CFG)).toEqual([])
})

test('idle but under its budget does not flag', () => {
  const now = 20 * MIN
  // An implementer has thirty minutes before idling counts.
  expect(scanAgents([agent('i1', 'bytheslice:implementer')], { i1: seenAt(0, 0, 'implementer') }, now, CFG)).toEqual([])
})

test('completed and failed agents never flag; a teammate is skipped', () => {
  const now = 60 * MIN
  const seen = { a: seenAt(0, 0, 'discovery'), b: seenAt(0, 0, 'discovery'), t: seenAt(0, 0, 'discovery') }
  const list = [
    agent('a', 'bytheslice:discovery', 'completed'),
    agent('b', 'bytheslice:discovery', 'failed'),
    agent('t', 'bytheslice:discovery', 'running', { teammateId: 'baker@team' }),
  ]
  expect(scanAgents(list, seen, now, CFG)).toEqual([])
})

test('waiting on its own background work flags; waiting on a live child does not, the child is judged', () => {
  const now = 60 * MIN
  const seen = { w: seenAt(0, 0, 'discovery'), p: seenAt(0, 0, 'discovery'), c: seenAt(0, 0, 'discovery') }
  const alone = [agent('w', 'bytheslice:discovery', 'waiting')]
  expect(scanAgents(alone, seen, now, CFG).map(stall => stall.aid)).toEqual(['w'])
  const parent = [agent('p', 'bytheslice:discovery', 'waiting'), agent('c', 'bytheslice:discovery', 'running', { parentId: 'p' })]
  expect(scanAgents(parent, seen, now, CFG).map(stall => stall.aid)).toEqual(['c'])
})

test('a role without its own budget uses the default; an unstamped agent is never judged', () => {
  expect(budgetMs('slice-tester', DEFAULT_WATCHDOG)).toBe(900000)
  expect(budgetMs('discovery', DEFAULT_WATCHDOG)).toBe(300000)
  const now = 20 * MIN
  expect(scanAgents([agent('x', 'bytheslice:slice-tester')], {}, now, CFG)).toEqual([])
  expect(scanAgents([agent('x', 'bytheslice:slice-tester')], { x: seenAt(0, 0, 'agent') }, now, CFG)[0]?.role).toBe('slice-tester')
})

test('the stamp map gains live agents from their spawn time, and drops ended and long-gone ones', () => {
  const now = 2 * 60 * MIN
  const prev = { done: seenAt(0, now - MIN, 'discovery'), gone: seenAt(0, 0, 'discovery'), kept: seenAt(0, now - MIN, 'agent') }
  const list = [agent('done', 'bytheslice:discovery', 'completed'), agent('kept', 'bytheslice:implementer'), agent('new', 'bytheslice:slice-tester')]
  const marks = { new: { type: 'bytheslice:slice-tester', pie: 5, slice: '5.5', at: now - 5000 } }
  expect(reconcileSeen(prev, list, marks, now)).toEqual({
    kept: seenAt(0, now - MIN, 'implementer'),
    new: seenAt(now - 5000, now - 5000, 'slice-tester'),
  })
})

test('pass.watchdog in the config overrides the thresholds per key and lists each change', () => {
  const read = readPolicy(FAST)
  expect(read.policy.watchdog).toEqual({ enabled: true, idleMs: 20000, budgetsMs: { default: 900000, discovery: 30000, implementer: 1800000 } })
  expect(read.overrides).toEqual([
    { setting: 'watchdog.idleMs', value: 20000, default: 180000 },
    { setting: 'watchdog.budgetsMs.discovery', value: 30000, default: 300000 },
  ])
  expect(readPolicy('{"pass":{"watchdog":{"idleMs":-1,"budgetsMs":{"discovery":"soon"}}}}').overrides).toEqual([])
})

test('a subagent tool call stamps its loop and returns what next gave; the main loop is not stamped', async ($, on) => {
  const { world, clock, start } = stage(on, { checklist: CHECKLIST_FIXTURE, files: { [CONFIG]: FAST } })
  engineLoops(on, ['d1'])
  const answer = bashResult()
  on('tool.call', () => answer)
  await start($)
  await spawn($, 'bytheslice:discovery', 'P5 S5.5 discover: sleep')
  world.agents = [agent('d1', 'bytheslice:discovery')]
  await clock.advance(40000)
  const ran = await agentCall($, 'd1', { tool: 'Bash', command: 'sleep 150' })
  expect(ran.result).toEqual(answer.result)
  expect(ran.context).toBeUndefined()
  // Within five seconds a second call does not move the stamp.
  await clock.advance(3000)
  await agentCall($, 'd1', { tool: 'Bash', command: 'ls' })
  // A main-loop call (no agentId) stamps nothing.
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  // The tick at 60 s sees idle at exactly 20 s (not past it); the tick at 90 s flags, idle counted from the 40 s stamp.
  await clock.set(START_MS + 3 * SCAN_MS)
  const rows = stalledRows(world)
  expect(rows).toHaveLength(1)
  expect(rows[0]?.data).toEqual({ aid: 'd1', role: 'discovery', runningMs: 90000, idleMs: 50000, n: 1 })
})

test('a subagent turn start stamps its loop too', async ($, on) => {
  const { world, clock, start } = stage(on, { checklist: CHECKLIST_FIXTURE, files: { [CONFIG]: FAST } })
  engineLoops(on, ['d1'])
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  await start($)
  await spawn($, 'bytheslice:discovery', 'P5 S5.5 discover: think')
  world.agents = [agent('d1', 'bytheslice:discovery')]
  await clock.advance(25000)
  const started = await $.turn.start({ text: '', turnId: 'turn-d1', agentId: 'd1' })
  expect(started).toEqual({ turnId: 'turn-d1' })
  // The tick at 60 s: running 60 s, idle 35 s since the turn's stamp at 25 s.
  await clock.set(START_MS + 2 * SCAN_MS)
  expect(stalledRows(world)[0]?.data).toMatchObject({ runningMs: 60000, idleMs: 35000 })
})

test('the interval is cancelled at session.end: nothing flags after it', async ($, on) => {
  const { world, clock, start } = stage(on, { checklist: CHECKLIST_FIXTURE, files: { [CONFIG]: FAST } })
  engineLoops(on, ['d1'])
  await start($)
  await spawn($, 'bytheslice:discovery', 'P5 S5.5 discover: sleep')
  world.agents = [agent('d1', 'bytheslice:discovery')]
  await endSession($)
  await clock.advance(10 * SCAN_MS)
  expect(stalledRows(world)).toEqual([])
})

test('a /clear ends the session but keeps the process, so the scan starts again', async ($, on) => {
  const { world, clock, start } = stage(on, { checklist: CHECKLIST_FIXTURE, files: { [CONFIG]: FAST } })
  engineLoops(on, ['d1'])
  await start($)
  await spawn($, 'bytheslice:discovery', 'P5 S5.5 discover: sleep')
  world.agents = [agent('d1', 'bytheslice:discovery')]
  await endSession($, 'clear')
  await clock.advance(3 * SCAN_MS)
  expect(stalledRows(world)).toHaveLength(1)
})

test('outside a ByTheSlice project the scan writes nothing', async ($, on) => {
  const { world, clock, start } = stage(on, { files: { [CONFIG]: FAST } })
  engineLoops(on, ['d1'])
  await start($)
  await spawn($, 'bytheslice:discovery', 'P5 S5.5 discover: sleep')
  world.agents = [agent('d1', 'bytheslice:discovery')]
  await clock.advance(5 * SCAN_MS)
  expect(world.files[`${CWD}/.bytheslice/ledger.jsonl`]).toBeUndefined()
})

test('with the watchdog turned off in the config the scan writes nothing', async ($, on) => {
  const off = JSON.stringify({ pass: { watchdog: { enabled: false, idleMs: 20000, budgetsMs: { discovery: 30000 } } } })
  const { world, clock, start } = stage(on, { checklist: CHECKLIST_FIXTURE, files: { [CONFIG]: off } })
  engineLoops(on, ['d1'])
  await start($)
  await spawn($, 'bytheslice:discovery', 'P5 S5.5 discover: sleep')
  world.agents = [agent('d1', 'bytheslice:discovery')]
  await clock.advance(5 * SCAN_MS)
  expect(stalledRows(world)).toEqual([])
})
