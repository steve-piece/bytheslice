// mod/team.test.ts
// Unit tests for team mode's roster and attribution: the pure roster, a teammate's pie from its label or the ledger, teammate turns as usage rows carrying the teammate id, and two teammates' starts on two pies.

import { expect, test } from 'claude-code/testing'

import { CHECKLIST_FIXTURE } from './fixtures/checklist.fixture.ts'
import type { LedgerRow } from './ledger.ts'
import { nameOf, teamRoster, teammateSlice } from './team.ts'
import {
  TEAM,
  agentCall,
  endTurn,
  engineLoops,
  rowsOf,
  spawn,
  spawnTeammate,
  stage,
  startTurn,
  status,
  teammateInfo,
} from './testing.tsx'
import type { PassSeen } from './types'

const row = (t: number, ev: LedgerRow['ev'], extra: Partial<LedgerRow> = {}): LedgerRow => ({ v: 1, t, sid: 's', ev, ...extra })
const seenAt = (lastT: number): PassSeen => ({ lastT, startT: 0, role: 'teammate' })

test('the roster lists each teammate on the team once, by pie, with its turns, status and last activity', () => {
  const agents = [
    teammateInfo('b', 'beta', 'P6 S6.1 beta: bake', 'idle'),
    teammateInfo('a', 'alpha', 'P5 S5.6 alpha: bake'),
    { id: 'sub', description: 'P5 S5.6 discover: map', type: 'bytheslice:discovery', status: 'running' as const },
    teammateInfo('gone', 'gamma', 'P7 S7.1 gamma: bake', 'killed'),
  ]
  const ledger = [
    row(10, 'usage', { aid: 'a', data: { teammateId: `alpha@${TEAM}` } }),
    row(20, 'usage', { aid: 'a', data: { teammateId: `alpha@${TEAM}` } }),
    row(25, 'usage', { aid: 'b', data: { teammateId: `beta@${TEAM}` } }),
    row(30, 'usage', { data: {} }),
  ]
  expect(teamRoster(agents, { a: seenAt(40), b: seenAt(5) }, ledger)).toEqual([
    { teammateId: `alpha@${TEAM}`, name: 'alpha', pie: 5, status: 'running', turns: 2, lastT: 40 },
    { teammateId: `beta@${TEAM}`, name: 'beta', pie: 6, status: 'idle', turns: 1, lastT: 25 },
  ])
})

test('a teammate with no label takes its pie from its first slice.started row; an idle row newer than its activity reads idle', () => {
  const agents = [teammateInfo('c', 'crust', 'bake whatever is next')]
  const ledger = [
    row(5, 'slice.started', { pie: 6, slice: '6.1', data: { skill: 'sell-pie', teammateId: `crust@${TEAM}` } }),
    row(6, 'slice.started', { pie: 5, slice: '5.6', data: { skill: 'sell-pie' } }),
    row(50, 'teammate.idle', { pie: 6, data: { name: 'crust', teammateId: `crust@${TEAM}` } }),
  ]
  const [baker] = teamRoster(agents, { c: seenAt(40) }, ledger)
  expect(baker).toEqual({ teammateId: `crust@${TEAM}`, name: 'crust', pie: 6, status: 'idle', turns: 0, lastT: 50 })
  // Activity after the idle row (its next turn started) reads running again.
  expect(teamRoster(agents, { c: seenAt(60) }, ledger)[0]?.status).toBe('running')
  // No label and no row: no pie yet.
  expect(teamRoster(agents, {}, [])[0]?.pie).toBeNull()
  expect(nameOf('scout@session-1')).toBe('scout')
  expect(teammateSlice(`crust@${TEAM}`, null, ledger, null)).toBe('6.1')
})

test('a teammate turn appends one usage row with its address, name, pie, slice and cost; a subagent turn appends none', async ($, on) => {
  const { world, start } = stage(on, { checklist: CHECKLIST_FIXTURE, costUsd: 1.5 })
  engineLoops(on, ['tm-a', 'sub-1'])
  await start($)
  const started = await spawnTeammate($, 'alpha', 'P6 S6.1 alpha: bake Pie 6', { model: 'sonnet' })
  expect(started.teammateId).toBe(`alpha@${TEAM}`)
  // The list does not show it yet: the spawn's mark alone attributes the turn.
  world.agents = []
  await startTurn($, 'tm-a', 'bake Pie 6')
  await endTurn($, 'baked a slice', 'tm-a')
  await spawn($, 'bytheslice:discovery', 'P6 S6.1 discover: map')
  await endTurn($, 'mapped', 'sub-1')
  const usage = rowsOf(world).filter(r => r.ev === 'usage')
  expect(usage).toHaveLength(1)
  expect(usage[0]).toMatchObject({ pie: 6, slice: '6.1', aid: 'tm-a', agent: 'teammate' })
  expect(usage[0]?.data).toEqual({
    teammateId: `alpha@${TEAM}`,
    name: 'alpha',
    turnId: 'turn-tm-a',
    durationMs: 1200,
    tokens: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 5, cache_creation_input_tokens: 0 },
    model: 'claude-opus-5-5',
    costUsd: 1.5,
  })
  // The main loop's own turn still records usage on the active slice, with no teammate id.
  await endTurn($, 'lead turn')
  const lead = rowsOf(world).filter(r => r.ev === 'usage').at(-1)
  expect(lead?.slice).toBe('5.1')
  expect((lead?.data as Record<string, unknown>).teammateId).toBeUndefined()
})

test('two teammates starting sell-pie record slice.started on two pies, each row carrying its teammate id', async ($, on) => {
  const { world, start } = stage(on, { checklist: CHECKLIST_FIXTURE })
  engineLoops(on, ['tm-5', 'tm-6'])
  on('tool.call', () => ({ result: {} }))
  await start($)
  await spawnTeammate($, 'oven', 'P5 S5.1 oven: bake Pie 5')
  await spawnTeammate($, 'peel', 'P6 S6.1 peel: bake Pie 6')
  world.agents = [teammateInfo('tm-5', 'oven', 'P5 S5.1 oven: bake Pie 5'), teammateInfo('tm-6', 'peel', 'P6 S6.1 peel: bake Pie 6')]
  // Inside each Skill call the skill's prompt is raised too, naming no loop: in team mode it records nothing.
  await $.skill.prompt({ skill: 'bytheslice:sell-pie', text: 'bake', frontmatter: {}, source: 'plugin' })
  await agentCall($, 'tm-5', { tool: 'Skill', skill: 'bytheslice:sell-pie' })
  await $.skill.prompt({ skill: 'bytheslice:sell-pie', text: 'bake', frontmatter: {}, source: 'plugin' })
  await agentCall($, 'tm-6', { tool: 'Skill', skill: 'bytheslice:sell-pie' })
  // A repeat from the same teammate records nothing new.
  await agentCall($, 'tm-6', { tool: 'Skill', skill: 'bytheslice:sell-pie' })
  expect(rowsOf(world).filter(r => r.ev === 'pie.started').map(r => [r.pie, (r.data as Record<string, unknown>).teammateId])).toEqual([
    [5, `oven@${TEAM}`],
    [6, `peel@${TEAM}`],
  ])
  const started = rowsOf(world)
    .filter(r => r.ev === 'slice.started')
    .map(r => [r.pie, r.slice, (r.data as Record<string, unknown>).teammateId])
  expect(started).toEqual([
    [5, '5.1', `oven@${TEAM}`],
    [6, '6.1', `peel@${TEAM}`],
  ])
  const text = await status($)
  expect(text).toContain('team: 2 bakers')
  expect(text).toContain(`oven@${TEAM} · Pie 5 · running · 0 turns`)
  expect(text).toContain(`peel@${TEAM} · Pie 6 · running · 0 turns`)
})

test('a teammate spawned without a label bakes the active pie and the roster resolves its pie from the ledger', async ($, on) => {
  const { world, clock, start } = stage(on, { checklist: CHECKLIST_FIXTURE })
  engineLoops(on, ['tm-x'])
  on('tool.call', () => ({ result: {} }))
  await start($)
  await spawnTeammate($, 'dough', 'bake the next pie')
  world.agents = [teammateInfo('tm-x', 'dough', 'bake the next pie')]
  // The five-second pulse reads the list and finds the new teammate.
  await clock.advance(5000)
  expect(await status($)).toContain(`dough@${TEAM} · no pie yet · running`)
  await agentCall($, 'tm-x', { tool: 'Skill', skill: 'bytheslice:sell-pie' })
  const startedRow = rowsOf(world).find(r => r.ev === 'slice.started')
  expect(startedRow).toMatchObject({ pie: 5, slice: '5.1', data: { skill: 'sell-pie', teammateId: `dough@${TEAM}` } })
  expect(await status($)).toContain(`dough@${TEAM} · Pie 5 · running`)
})
