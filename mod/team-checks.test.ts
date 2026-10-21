// mod/team-checks.test.ts
// Unit tests for the checks in team mode: a teammate's tool calls warn like the lead's, a gate started as a teammate warns and still starts, a teammate's model is judged by the teammate role, and the watchdog judges a teammate only while it runs a turn.

import { expect, test } from 'claude-code/testing'

import { judgeTeammate } from './checks-spawn.ts'
import { CHECKLIST_FIXTURE } from './fixtures/checklist.fixture.ts'
import { DEFAULT_POLICY, readPolicy } from './policy.ts'
import {
  CWD,
  TEAM,
  agentCall,
  bashResult,
  endTurn,
  engineLoops,
  rowsOf,
  spawn,
  spawnTeammate,
  stage,
  startTurn,
  teammateInfo,
  warnsOf,
} from './testing.tsx'
import { SCAN_MS, scanAgents } from './watchdog.ts'

const CONFIG = `${CWD}/bytheslice.config.json`
/** Teammate turns count as stalled past 30 seconds, idle past 20 seconds. */
const FAST = JSON.stringify({ pass: { watchdog: { idleMs: 20000, budgetsMs: { teammate: 30000 } } } })
const CHECKLIST = 'docs/plans/00_master_checklist.md'
const MIN = 60000

const stalledRows = (world: Parameters<typeof rowsOf>[0]) => rowsOf(world).filter(row => row.ev === 'agent.stalled')

test('a teammate commit on main warns exactly as the lead does, and the Bash result returns', async ($, on) => {
  const { world, start } = stage(on, { checklist: CHECKLIST_FIXTURE, branch: 'main' })
  engineLoops(on, ['tm-5'])
  const answer = bashResult({ commit: { sha: 'feedfacecafe1234', kind: 'committed', branch: 'main' } })
  on('tool.call', () => answer)
  await start($)
  await spawnTeammate($, 'oven', 'P5 S5.1 oven: bake Pie 5')
  const ran = await agentCall($, 'tm-5', { tool: 'Bash', command: 'git commit -m "feat(pie-5): 5.1 x"' })
  expect(ran.deny).toBeUndefined()
  expect(ran.result).toEqual(answer.result)
  expect(ran.context?.[0]).toContain('The Pass warning (commit-on-main)')
  expect(warnsOf(world)).toEqual([['commit-on-main', null]])
})

test('a teammate ticking a slice with no verifier pass warns, and the edit completes', async ($, on) => {
  const { world, start } = stage(on, { checklist: CHECKLIST_FIXTURE })
  engineLoops(on, ['tm-5'])
  const edited = { filePath: CHECKLIST, structuredPatch: [] }
  on('tool.call', () => ({ result: edited }))
  await start($)
  await spawnTeammate($, 'oven', 'P5 S5.1 oven: bake Pie 5')
  const ran = await agentCall($, 'tm-5', {
    tool: 'Edit',
    file_path: `/repo/${CHECKLIST}`,
    old_string: '### Slice 5.1 - Pass pane and band [ ]\nStatus: Not Started',
    new_string: '### Slice 5.1 - Pass pane and band [x]\nStatus: Completed',
  })
  expect(ran.result).toEqual(edited)
  expect(ran.context?.[0]).toContain('checkbox-without-verdict')
  expect(warnsOf(world)).toEqual([['checkbox-without-verdict', '5.1']])
})

test('a slice-verifier started as a teammate warns gate-teamified once, and the teammate still starts', async ($, on) => {
  const { world, start } = stage(on, { checklist: CHECKLIST_FIXTURE })
  engineLoops(on, ['tm-v', 'sub-v'])
  await start($)
  const started = await spawnTeammate($, 'judge', 'P5 S5.1 verify: static gates', { subagentType: 'bytheslice:slice-verifier' })
  expect(started).toEqual({ model: 'sonnet', agentId: 'tm-v', teammateId: `judge@${TEAM}` })
  expect(warnsOf(world)).toEqual([['gate-teamified', '5.1']])
  const row = rowsOf(world).find(r => r.ev === 'warn')
  expect((row?.data as { text: string }).text).toBe(
    'slice-verifier was started as teammate judge; gates and reviewers stay one-shot subagents (verify-once), so dispatch it with the Agent tool and no team name. The teammate still started.',
  )
  // The same role as a one-shot subagent is what verify-once wants: no gate-teamified.
  await spawn($, 'bytheslice:slice-verifier', 'P5 S5.1 verify: static gates')
  expect(warnsOf(world).filter(([code]) => code === 'gate-teamified')).toHaveLength(1)
})

test('a teammate model is judged by the teammate role: opus and sonnet pass, haiku warns, a project may allow it', () => {
  const facts = { tool_use_id: 'toolu-t', prompt: 'bake', subagentType: 'teammate', isTeammate: true as const, name: 'oven' }
  expect(judgeTeammate({ ...facts, model: 'opus' }, DEFAULT_POLICY)).toEqual({
    findings: [],
    track: { role: 'teammate', given: 'opus', parent: null, slice: null },
  })
  expect(judgeTeammate({ ...facts, model: 'claude-sonnet-5-5' }, DEFAULT_POLICY).findings).toEqual([])
  const haiku = judgeTeammate({ ...facts, model: 'haiku', description: 'P6 S6.1 oven: bake' }, DEFAULT_POLICY)
  expect(haiku.findings.map(f => [f.code, f.slice])).toEqual([['model-policy', '6.1']])
  expect(haiku.findings[0]?.text).toBe(
    'teammate oven was spawned on haiku; the role table allows opus or sonnet for a teammate. The spawn went ahead on the model it named.',
  )
  const project = readPolicy('{ "pass": { "spawnPolicy": { "roles": { "teammate": ["haiku"] } } } }')
  expect(project.overrides).toEqual([{ setting: 'roles.teammate', value: ['haiku'], default: ['opus', 'sonnet'] }])
  expect(judgeTeammate({ ...facts, model: 'haiku' }, project.policy).findings).toEqual([])
  // Each reviewer role is a gate; a plain teammate is not.
  for (const role of ['implementer', 'slice-tester', 'slice-verifier', 'spec-reviewer', 'quality-reviewer']) {
    expect(judgeTeammate({ ...facts, subagentType: `bytheslice:${role}` }, DEFAULT_POLICY).findings.map(f => f.code)).toEqual(['gate-teamified'])
  }
  expect(judgeTeammate({ ...facts, subagentType: 'bytheslice:discovery' }, DEFAULT_POLICY).findings).toEqual([])
})

test('a teammate first turn on a tier outside the teammate role warns model-drift once', async ($, on) => {
  const { world, start } = stage(on, { checklist: CHECKLIST_FIXTURE })
  engineLoops(on, ['tm-5'])
  await start($)
  await spawnTeammate($, 'oven', 'P5 S5.1 oven: bake Pie 5')
  await endTurn($, 'baked', 'tm-5', 'claude-haiku-4-5')
  await endTurn($, 'baked again', 'tm-5', 'claude-haiku-4-5')
  expect(warnsOf(world)).toEqual([['model-drift', '5.1']])
})

test('an idle teammate never flags, however long it waits for a message', async ($, on) => {
  const { world, clock, start } = stage(on, { checklist: CHECKLIST_FIXTURE, files: { [CONFIG]: FAST } })
  engineLoops(on, ['tm-5'])
  await start($)
  await spawnTeammate($, 'oven', 'P5 S5.1 oven: bake Pie 5')
  world.agents = [teammateInfo('tm-5', 'oven', 'P5 S5.1 oven: bake Pie 5', 'idle')]
  await clock.advance(20 * MIN)
  expect(stalledRows(world)).toEqual([])
})

test('a running teammate silent past its turn budget flags once, its row naming the teammate', async ($, on) => {
  const { world, clock, start } = stage(on, { checklist: CHECKLIST_FIXTURE, files: { [CONFIG]: FAST } })
  engineLoops(on, ['tm-5'])
  await start($)
  await spawnTeammate($, 'oven', 'P5 S5.1 oven: bake Pie 5')
  world.agents = [teammateInfo('tm-5', 'oven', 'P5 S5.1 oven: bake Pie 5', 'running')]
  await startTurn($, 'tm-5', 'bake')
  // The tick at 30 s: a 30 s turn is not past 30 s. The tick at 60 s flags.
  await clock.advance(2 * SCAN_MS)
  await clock.advance(4 * SCAN_MS)
  const rows = stalledRows(world)
  expect(rows).toHaveLength(1)
  expect(rows[0]).toMatchObject({ pie: 5, slice: '5.1', aid: 'tm-5' })
  expect(rows[0]?.data).toEqual({ aid: 'tm-5', role: 'teammate', runningMs: 60000, idleMs: 60000, n: 1, teammateId: `oven@${TEAM}` })
  expect(world.toasts.some(text => text.includes(`teammate oven@${TEAM} stalled`))).toBe(true)
})

test('a teammate turn counts from its own start: a long idle before it does not make a fresh turn stalled', async ($, on) => {
  const { world, clock, start } = stage(on, { checklist: CHECKLIST_FIXTURE, files: { [CONFIG]: FAST } })
  engineLoops(on, ['tm-5'])
  await start($)
  await spawnTeammate($, 'oven', 'P5 S5.1 oven: bake Pie 5')
  world.agents = [teammateInfo('tm-5', 'oven', 'P5 S5.1 oven: bake Pie 5', 'idle')]
  await clock.advance(5 * MIN)
  world.agents = [teammateInfo('tm-5', 'oven', 'P5 S5.1 oven: bake Pie 5', 'running')]
  await startTurn($, 'tm-5', 'a message from the lead')
  // At 5:30 the turn has run 30 s: not past its budget, though the teammate is 5 minutes old.
  await clock.advance(SCAN_MS)
  expect(stalledRows(world)).toEqual([])
  await clock.advance(SCAN_MS)
  expect(stalledRows(world).map(row => (row.data as { runningMs: number }).runningMs)).toEqual([60000])
})

test('a running teammate waiting on a live subagent is not judged; the subagent is', () => {
  const cfg = { enabled: true, idleMs: 20000, budgetsMs: { default: 30000 } }
  const list = [
    teammateInfo('tm-5', 'oven', 'P5 S5.1 oven: bake', 'running'),
    { id: 'imp', description: 'P5 S5.1 build: x', type: 'bytheslice:implementer', status: 'running' as const, parentId: 'tm-5' },
  ]
  const seen = { 'tm-5': { lastT: 0, startT: 0, role: 'teammate', turnT: 0 }, imp: { lastT: 0, startT: 0, role: 'implementer' } }
  expect(scanAgents(list, seen, 10 * MIN, cfg).map(stall => stall.aid)).toEqual(['imp'])
})
