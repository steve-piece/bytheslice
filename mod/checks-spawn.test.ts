// mod/checks-spawn.test.ts
// Unit tests for the spawn policy: model tiers, builder context in reviewer prompts and model drift warn through a toast and a hidden note; the spawn is never altered.

import { expect, mock, test } from 'claude-code/testing'

import { givenModel, judgeSpawn, markerIn, roleOf } from './checks-spawn.ts'
import { CHECKLIST_FIXTURE } from './fixtures/checklist.fixture.ts'
import { DEFAULT_POLICY } from './policy.ts'
import { MODEL_IDS, endTurn, engineLoops, spawn, stage, warnsOf } from './testing.tsx'

const notesOf = (session: ReturnType<typeof mock.session>): string[] =>
  session
    .appended()
    .filter(row => row.origin.kind === 'plugin')
    .map(row => row.message.content.map(block => (block.type === 'text' ? block.text : '')).join(''))

test('an opus verifier warns model-policy; the spawn returns what next gave, model untouched', async ($, on) => {
  const { world, start } = stage(on, { checklist: CHECKLIST_FIXTURE })
  const session = mock.session(on)
  let asked: unknown = 'unset'
  on('agent.spawn', (_$, e) => {
    asked = e.model
    return { model: 'claude-opus-5-5', agentId: 'v1' }
  })
  await start($)
  const started = await spawn($, 'bytheslice:slice-verifier', 'P5 S5.3 verify: gates', { model: 'opus' })
  expect(started).toEqual({ model: 'claude-opus-5-5', agentId: 'v1' })
  expect(asked).toBe('opus')
  expect(warnsOf(world)).toEqual([['model-policy', '5.3']])
  expect(world.toasts[0]).toContain('Pass model-policy · Slice 5.3: slice-verifier was spawned on opus; the role table allows sonnet.')
  expect(notesOf(session)).toEqual([
    'The Pass warning (model-policy): slice-verifier was spawned on opus; the role table allows sonnet. The spawn went ahead on the model it named. Nothing was blocked.',
  ])
})

test('a sonnet verifier with a clean prompt is silent, and stays silent at its turn end', async ($, on) => {
  const { world, start } = stage(on, { checklist: CHECKLIST_FIXTURE })
  const session = mock.session(on)
  engineLoops(on, ['v1'])
  await start($)
  await spawn($, 'bytheslice:slice-verifier', 'P5 S5.3 verify: gates', { model: 'sonnet', prompt: 'Manifest and Exit criteria.' })
  await endTurn($, '{"overall": "pass"}', 'v1')
  expect(warnsOf(world)).toEqual([])
  expect(notesOf(session)).toEqual([])
})

test('a tester prompt with files_changed warns builder-context, and the agent still runs with that prompt', async ($, on) => {
  const { world, start } = stage(on, { checklist: CHECKLIST_FIXTURE })
  const session = mock.session(on)
  let given = ''
  on('agent.spawn', (_$, e) => {
    given = e.prompt
    return { model: 'claude-sonnet-4-6', agentId: 't1' }
  })
  await start($)
  const prompt = 'Manifest: {...}\nFILES_CHANGED:\n  - mod/a.ts'
  const started = await spawn($, 'bytheslice:slice-tester', 'P5 S5.3 test: probes', { prompt })
  expect(started.agentId).toBe('t1')
  expect(given).toBe(prompt)
  expect(warnsOf(world)).toEqual([['builder-context', '5.3']])
  expect(notesOf(session)[0]).toContain('builder-context')
  expect(notesOf(session)[0]).toContain('the slice-tester prompt carries builder context (it holds "files_changed")')
  expect(JSON.stringify(world.files)).not.toContain('mod/a.ts')
})

test('a reviewer prompt past 20,000 characters warns builder-context; an implementer prompt never does', async ($, on) => {
  const { world, start } = stage(on, { checklist: CHECKLIST_FIXTURE })
  engineLoops(on, ['q1', 'i1'])
  await start($)
  await spawn($, 'bytheslice:quality-reviewer', 'P5 S5.3 review: quality', { prompt: 'x'.repeat(20001) })
  await spawn($, 'bytheslice:implementer', 'P5 S5.3 build: task 1', { prompt: `files_changed ${'y'.repeat(30000)}` })
  expect(warnsOf(world)).toEqual([['builder-context', '5.3']])
  expect(world.toasts[0]).toContain('it runs 20001 characters, past 20000')
})

test('an unset model warns only at turn.complete, when the run landed on the wrong tier', async ($, on) => {
  const { world, start } = stage(on, { checklist: CHECKLIST_FIXTURE })
  const session = mock.session(on)
  engineLoops(on, ['i1', 'i2'])
  await start($)
  await spawn($, 'bytheslice:implementer', 'P5 S5.3 build: task 1')
  await spawn($, 'bytheslice:implementer', 'P5 S5.3 build: task 2')
  expect(warnsOf(world)).toEqual([])
  await endTurn($, 'done', 'i1', MODEL_IDS.sonnet)
  await endTurn($, 'done', 'i2', MODEL_IDS.opus)
  expect(warnsOf(world)).toEqual([['model-drift', '5.3']])
  expect(notesOf(session)).toEqual([
    'The Pass warning (model-drift): implementer ran on claude-sonnet-4-6 (it named no model); the role table allows opus. Nothing was changed. Nothing was blocked.',
  ])
  // Each spawn is checked at its first turn's end only.
  await endTurn($, 'again', 'i1', MODEL_IDS.sonnet)
  expect(warnsOf(world)).toHaveLength(1)
})

test('workflow agents are checked; teammates, resumed runs and other plugins are left to later slices', async ($, on) => {
  const { world, start } = stage(on, { checklist: CHECKLIST_FIXTURE })
  engineLoops(on, ['w1', 't1', 'r1', 'o1'])
  await start($)
  await spawn($, 'bytheslice:slice-verifier', 'wf verify', { model: 'haiku', workflow: { runId: 'wf_1', agentIndex: 2 } })
  await spawn($, 'bytheslice:slice-verifier', 'team verify', { model: 'haiku', isTeammate: true })
  await spawn($, 'bytheslice:slice-tester', 'resumed', { prompt: 'files_changed', resume: { agentId: 'old' } })
  await spawn($, 'other:slice-verifier', 'not ours', { model: 'haiku' })
  expect(warnsOf(world)).toEqual([['model-policy', null]])
})

test('the pure parts: roles, given models, markers and the judgment', () => {
  expect(roleOf('bytheslice:slice-tester')).toBe('slice-tester')
  expect(roleOf('Explore')).toBe('Explore')
  expect(roleOf('other:implementer')).toBe('other:implementer')
  expect(givenModel('inherit')).toBeNull()
  expect(givenModel(' ')).toBeNull()
  expect(givenModel('claude-sonnet-4-6')).toBe('claude-sonnet-4-6')
  expect(markerIn('see the Diff --git below', DEFAULT_POLICY.contextMarkers)).toBe('diff --git')
  expect(markerIn('clean', DEFAULT_POLICY.contextMarkers)).toBeNull()
  const facts = { tool_use_id: 'toolu-1', prompt: 'p', subagentType: 'bytheslice:discovery', model: 'claude-haiku-4-5' }
  expect(judgeSpawn(facts, DEFAULT_POLICY)).toEqual({ findings: [], track: { role: 'discovery', given: 'claude-haiku-4-5', parent: null, slice: null } })
  expect(judgeSpawn({ ...facts, model: 'opus', description: 'P5 S5.4 prep: recon' }, DEFAULT_POLICY).findings[0]?.slice).toBe('5.4')
  expect(judgeSpawn({ ...facts, model: 'fable' }, DEFAULT_POLICY).findings.map(f => f.code)).toEqual(['model-policy'])
  expect(judgeSpawn({ ...facts, subagentType: 'general-purpose' }, DEFAULT_POLICY)).toEqual({ findings: [], track: null })
})
