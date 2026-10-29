// mod/enforcement.test.ts
// Unit tests for 5.8's enforcement work in the mod: the enforcement key and the operator bypass, stall items that close once their agent ended, the checklist found from a worktree, and status drift in bts_status.

import { expect, test } from 'claude-code/testing'

import { statusDrift, slicesNamed } from './drift.ts'
import { ENDED_ANSWER, STALE_STALL_MS, endedStalls, stallAgent } from './hitl.ts'
import { parseChecklist } from './checklist.ts'
import { CHECKLIST_FIXTURE } from './fixtures/checklist.fixture.ts'
import { readPolicy } from './policy.ts'
import { CONFIG, HEAD, LEDGER, START_MS, ledgerLine, ledgerText, rowsOf, stage, status } from './testing.tsx'
import type { PassHitlItem, PassProjection } from './types'

test('enforcement defaults to block, the top-level key sets warn, and an unknown value is ignored', () => {
  expect(readPolicy(null).policy.enforcement).toBe('block')
  const warn = readPolicy('{ // operator\n "enforcement": "warn" }')
  expect(warn.policy.enforcement).toBe('warn')
  expect(warn.overrides).toEqual([{ setting: 'enforcement', value: 'warn', default: 'block' }])
  expect(readPolicy('{ "enforcement": "off" }').policy.enforcement).toBe('block')
  expect(readPolicy('{ "pass": { "enforcement": "warn" } }').policy.enforcement).toBe('block')
})

test('the operator bypass sets warn for the session and is never recorded as an override', async ($, on) => {
  const { world, start } = stage(on, { checklist: CHECKLIST_FIXTURE, env: { BTS_ALLOW_BYPASS: '1' }, files: { [CONFIG]: '{ "enforcement": "block" }' } })
  on('tool.call', () => ({ result: { filePath: 'x', structuredPatch: [] } }))
  await start($)
  const ran = await $.tool.call({
    tool: 'Edit',
    file_path: 'docs/plans/00_master_checklist.md',
    old_string: '### Slice 5.1 - Pass pane and band [ ]',
    new_string: '### Slice 5.1 - Pass pane and band [x]',
  })
  expect(ran.deny).toBeUndefined()
  expect(rowsOf(world).some(row => row.ev === 'note' && JSON.stringify(row.data).includes('BTS_ALLOW_BYPASS'))).toBe(false)
})

const stallItem = (over: Partial<PassHitlItem> = {}): PassHitlItem => ({
  id: 'h1',
  category: 'other',
  question: 'Stall 2 on Slice 5.5: agent implementer a1b2 has run 40m with no tool activity for 12m. Check it?',
  context: null,
  source: 'pass',
  asked: 'pane',
  kind: 'agent-stalled',
  sid: 'session-test',
  pie: 5,
  slice: '5.5',
  t: START_MS,
  ...over,
})

test('a stall item names its agent by aid, or by the id its question carries', () => {
  expect(stallAgent(stallItem({ aid: 'zz9' }))).toBe('zz9')
  expect(stallAgent(stallItem())).toBe('a1b2')
  expect(stallAgent(stallItem({ question: 'Stall 2: teammate oven@team (tm-5) has run 9m with no tool activity for 4m.' }))).toBe('tm-5')
  expect(stallAgent(stallItem({ question: 'something else' }))).toBeNull()
})

test('ended stalls: an ended agent, a gone agent of this session, and another session past a day', () => {
  const view = { session: 'session-test', now: START_MS + 1000 }
  expect(endedStalls([stallItem()], { ...view, ended: new Set(['a1b2']) }).map(i => i.id)).toEqual(['h1'])
  expect(endedStalls([stallItem()], { ...view, isLive: () => true })).toEqual([])
  expect(endedStalls([stallItem()], { ...view, isLive: () => false }).map(i => i.id)).toEqual(['h1'])
  const other = stallItem({ sid: 'other-session' })
  expect(endedStalls([other], { ...view, isLive: () => false })).toEqual([])
  expect(endedStalls([other], { ...view, now: START_MS + STALE_STALL_MS + 1, isLive: () => false }).map(i => i.id)).toEqual(['h1'])
  // Only stall items close on their own: the model's questions wait for the operator.
  expect(endedStalls([stallItem({ kind: null, source: 'agent' })], { ...view, ended: new Set(['a1b2']) })).toEqual([])
})

const raisedStall = (aid: string, sid = 'session-test') =>
  JSON.stringify({
    v: 1,
    t: START_MS,
    sid,
    ev: 'hitl.raised',
    pie: 5,
    slice: '5.5',
    data: { id: 'h-stall', category: 'other', question: `Stall 2 on Slice 5.5: agent implementer ${aid} has run 40m.`, source: 'pass', asked: 'pane', kind: 'agent-stalled', aid },
  })

test('a SubagentStop closes the stall item open about that agent, via auto', async ($, on) => {
  const { world, start } = stage(on, { checklist: CHECKLIST_FIXTURE })
  world.files[LEDGER] = ledgerText([raisedStall('agent-7'), raisedStall('agent-8').replace('h-stall', 'h-other')])
  on('classic.SubagentStop', () => ({}))
  await start($)
  await $.classic.SubagentStop({ agent_id: 'agent-7', agent_type: 'bytheslice:implementer' })
  const answered = rowsOf(world).filter(row => row.ev === 'hitl.answered')
  expect(answered).toHaveLength(1)
  expect(answered[0]?.data).toEqual(expect.objectContaining({ id: 'h-stall', answer: ENDED_ANSWER, via: 'auto' }))
})

test('from a worktree without docs/plans, the checklist is read from the primary checkout', async ($, on) => {
  const { world, start } = stage(on, {
    checklist: CHECKLIST_FIXTURE,
    cwd: '/repo/.claude/worktrees/pie-5',
    commonDir: '/repo/.git',
    checklistAt: '/repo/docs/plans/00_master_checklist.md',
  })
  await start($)
  const text = await status($)
  expect(text).not.toContain('no checklist')
  expect(text.split('\n')[0]).toBe('The Pass · Pie 5 The Pass · Slice 5.1 Pass pane and band · queued')
  expect(world.checklistAt).toBe('/repo/docs/plans/00_master_checklist.md')
})

test('status drift: open but merged, done but never merged, and a pie waiting on its own branch', () => {
  const checklist = parseChecklist(CHECKLIST_FIXTURE)
  const sha = (n: number) => `${String(n).repeat(7)}aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`
  const projection = {
    pies: [
      { n: 4, slices: [{ id: '4.1', commits: [sha(4)] }, { id: '4.2', commits: [] }, { id: '4.3', commits: [] }] },
      { n: 5, slices: [{ id: '5.1', commits: [sha(5)] }, { id: '5.2', commits: [] }] },
    ],
  } as unknown as PassProjection
  const view = { base: 'origin/main', shas: [sha(5)], subjects: ['feat(pie-5): 5.3 task 1 checks'], branch: 'main' }
  expect(slicesNamed(view.subjects)).toEqual(new Set(['5.3']))
  expect(statusDrift(checklist, projection, view)).toEqual([
    { id: '4.1', kind: 'done-not-merged', base: 'origin/main', commits: 1 },
    { id: '5.1', kind: 'open-but-merged', base: 'origin/main', commits: 1 },
    { id: '5.3', kind: 'open-but-merged', base: 'origin/main', commits: 0 },
  ])
  // On Pie 4's own branch its done slices wait for the boundary PR: no drift for them.
  expect(statusDrift(checklist, projection, { ...view, branch: 'pie-4-live-kitchen' }).map(d => d.id)).toEqual(['5.1', '5.3'])
})

test('bts_status lists status drift from the default branch', async ($, on) => {
  const { start } = stage(on, {
    checklist: CHECKLIST_FIXTURE,
    run: argv => {
      const line = argv.join(' ')
      if (line.startsWith('git symbolic-ref')) return { stdout: 'origin/main\n' }
      if (line.startsWith('git rev-parse --verify')) return { stdout: `${HEAD}\n` }
      if (line.startsWith('git log -n')) return { stdout: `${HEAD} feat(pie-5): 5.2 task 1 ledger\n` }
      return undefined
    },
  })
  await start($)
  const text = await status($)
  expect(text).toContain('Status drift: 1 (checklist against origin/main)')
  expect(text).toContain('Slice 5.2 is still open in the checklist, but its commits are on origin/main')
})

test('a failed verdict ledger line still refuses the flip, and a pass at HEAD lets it through', async ($, on) => {
  const { world, start } = stage(on, { checklist: CHECKLIST_FIXTURE })
  world.files[LEDGER] = ledgerText([ledgerLine(1, 'verdict', '5.1', { gate: 'slice-verifier', overall: 'pass', fix_targets: [], head: HEAD })])
  on('tool.call', () => ({ result: { filePath: 'x', structuredPatch: [] } }))
  await start($)
  const ran = await $.tool.call({
    tool: 'Edit',
    file_path: 'docs/plans/00_master_checklist.md',
    old_string: '### Slice 5.1 - Pass pane and band [ ]',
    new_string: '### Slice 5.1 - Pass pane and band [x]',
  })
  expect(ran.deny).toBeUndefined()
})
