// mod/team-pane.test.tsx
// Unit tests for team mode on screen and in the ledger, on terminal and desktop: the pane's team section (hidden with no teammates, one row per baker), the band's bakers, and the idle and done events as ledger rows.

import { expect, test } from 'claude-code/testing'

import { bandLine } from './band.tsx'
import { CHECKLIST_FIXTURE } from './fixtures/checklist.fixture.ts'
import { bakerRow } from './rail.tsx'
import { TEAM, bandTarget, endTurn, engineLoops, paneTarget, rowsOf, spawnTeammate, stage, startTurn, teammateInfo } from './testing.tsx'
import type { PassTeam } from './types'

const SURFACES = ['terminal', 'desktop'] as const

const OVEN = teammateInfo('tm-5', 'oven', 'P5 S5.1 oven: bake Pie 5')
const PEEL = teammateInfo('tm-6', 'peel', 'P6 S6.1 peel: bake Pie 6')

const teamRows = (texts: string[]): string[] => {
  const at = texts.findIndex(text => text.startsWith('Team · '))
  return at === -1 ? [] : texts.slice(at)
}

test('with no teammates the pane has no team section and the band names no bakers', async ($, on) => {
  const { world, clock, start } = stage(on, { checklist: CHECKLIST_FIXTURE })
  await start($)
  world.agents = [{ id: 'sub', description: 'P5 S5.1 build: pane', type: 'bytheslice:implementer', status: 'running' }]
  await clock.advance(5000)
  for (const surface of SURFACES) {
    const ui = await $.ui.mount(paneTarget(surface, 60))
    const texts = (await ui.findAll({ type: 'Text' })).map(line => line.text)
    expect(teamRows(texts)).toEqual([])
    expect(texts).toContain('Agents · 1 live')
    await ui.unmount()
    const band = await $.ui.mount(bandTarget(surface))
    expect((await band.find({ type: 'Text' }))?.text).toBe('Pie 5 · Slice 5.1 queued · 1 agent')
    await band.unmount()
  }
})

test('the team section shows one row per baker; teammates leave the agents list; the band counts bakers', async ($, on) => {
  const { world, clock, start } = stage(on, { checklist: CHECKLIST_FIXTURE })
  engineLoops(on, ['tm-5', 'tm-6'])
  await start($)
  await spawnTeammate($, 'oven', OVEN.description)
  await spawnTeammate($, 'peel', PEEL.description)
  world.agents = [OVEN, PEEL]
  await clock.advance(5000)
  await startTurn($, 'tm-5', 'bake')
  await endTurn($, 'baked', 'tm-5')
  for (const surface of SURFACES) {
    const ui = await $.ui.mount(paneTarget(surface, 60))
    const texts = (await ui.findAll({ type: 'Text' })).map(line => line.text)
    expect(teamRows(texts)).toEqual(['Team · 2 bakers', '  oven · Pie 5 · running · 1 turn · 0s', '  peel · Pie 6 · running · 0 turns · 5s'])
    expect(texts).toContain('No live agents')
    await ui.unmount()
    const band = await $.ui.mount(bandTarget(surface))
    expect((await band.find({ type: 'Text' }))?.text).toBe('Pie 5 · Slice 5.1 queued · 2 bakers')
    await band.unmount()
  }
})

test('an idle event appends teammate.idle and flips the row; the next turn flips it back', async ($, on) => {
  const { world, clock, start } = stage(on, { checklist: CHECKLIST_FIXTURE })
  engineLoops(on, ['tm-5', 'tm-6'])
  on('classic.TeammateIdle', () => ({}))
  await start($)
  await spawnTeammate($, 'oven', OVEN.description)
  await spawnTeammate($, 'peel', PEEL.description)
  world.agents = [OVEN, PEEL]
  await clock.advance(5000)
  // The list still says running: the event alone flips the row.
  await clock.advance(2000)
  await $.classic.TeammateIdle({ teammate_name: 'peel', team_name: TEAM })
  const idle = rowsOf(world).filter(row => row.ev === 'teammate.idle')
  expect(idle).toHaveLength(1)
  expect(idle[0]).toMatchObject({ pie: 6, aid: 'tm-6', data: { name: 'peel', teammateId: `peel@${TEAM}` } })
  for (const surface of SURFACES) {
    const ui = await $.ui.mount(paneTarget(surface, 60))
    expect(teamRows((await ui.findAll({ type: 'Text' })).map(line => line.text))).toEqual([
      'Team · 2 bakers',
      '  oven · Pie 5 · running · 0 turns · 7s',
      '  peel · Pie 6 · idle · 0 turns · 0s',
    ])
    const peel = await ui.find({ type: 'Text', text: /peel/ })
    expect(peel?.props.dimColor).toBe(true)
    await ui.unmount()
  }
  await clock.advance(3000)
  await startTurn($, 'tm-6', 'a message from the lead')
  for (const surface of SURFACES) {
    const ui = await $.ui.mount(paneTarget(surface, 60))
    expect((await ui.find({ type: 'Text', text: /peel/ }))?.text).toBe('  peel · Pie 6 · running · 0 turns · 0s')
    await ui.unmount()
  }
})

test('a teammate task completed appends teammate.done; the lead own task and a refused completion append nothing', async ($, on) => {
  const { world, clock, start } = stage(on, { checklist: CHECKLIST_FIXTURE })
  engineLoops(on, ['tm-5'])
  let refuse = false
  on('classic.TaskCompleted', () => (refuse ? { block: 'tests are red' } : {}))
  await start($)
  await spawnTeammate($, 'oven', OVEN.description)
  world.agents = [OVEN]
  await clock.advance(5000)
  const out = await $.classic.TaskCompleted({ task_id: '1', task_subject: 'Bake Slice 5.1', teammate_name: 'oven' })
  expect(out).toEqual({})
  await $.classic.TaskCompleted({ task_id: '2', task_subject: 'Lead bookkeeping' })
  refuse = true
  const refused = await $.classic.TaskCompleted({ task_id: '3', task_subject: 'Bake Slice 5.2', teammate_name: 'oven' })
  expect(refused).toEqual({ block: 'tests are red' })
  const done = rowsOf(world).filter(row => row.ev === 'teammate.done')
  expect(done).toHaveLength(1)
  expect(done[0]).toMatchObject({ pie: 5, aid: 'tm-5', data: { taskId: '1', subject: 'Bake Slice 5.1', name: 'oven', teammateId: `oven@${TEAM}` } })
})

test('an idle hook beneath that keeps the teammate working records no idle row, and nothing is ever blocked by the Pass', async ($, on) => {
  const { world, start } = stage(on, { checklist: CHECKLIST_FIXTURE })
  on('classic.TeammateIdle', () => ({ block: 'keep going' }))
  await start($)
  world.agents = [OVEN]
  expect(await $.classic.TeammateIdle({ teammate_name: 'oven', team_name: TEAM })).toEqual({ block: 'keep going' })
  expect(rowsOf(world).filter(row => row.ev === 'teammate.idle')).toEqual([])
})

test('the pure band and row words', () => {
  const team: PassTeam = {
    at: 1,
    bakers: [{ teammateId: `oven@${TEAM}`, name: 'oven', pie: 5, status: 'idle', turns: 3, lastT: 0 }],
  }
  const c = { pies: [{ n: 5, name: 'P', review: 'boundary' as const, done: false, slices: [{ id: '5.1', name: 's', done: false }] }], prep: null, layout: 'pie' as const }
  expect(bandLine(c, 100, null, null, null, team)?.text).toBe('Pie 5 · Slice 5.1 · 0/1 done')
  const ledger = { pies: [], active: null, live: [], mismatches: [], untracked: 0, findings: [], hitl: { open: [], waitedMs: {} }, at: 0 }
  expect(bandLine(c, 100, ledger, null, null, team)?.text).toBe('Pie 5 · Slice 5.1 queued · 1 baker')
  expect(bandLine(c, 40, ledger, null, null, team)?.text).toBe('P5 S5.1 queued 1 baker')
  expect(bakerRow(team.bakers[0]!, 125000)).toBe('  oven · Pie 5 · idle · 3 turns · 2m')
})
