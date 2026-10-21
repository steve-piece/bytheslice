// mod/checks-checklist.test.ts
// Unit tests for the checkbox, push and plan-write checks: each warns once with its reason, the call always completes, normal work stays silent.

import { expect, test } from 'claude-code/testing'

import { boxMarks, flipsOf, judgeFlips, judgePlanWrite, judgePush } from './checks-checklist.ts'
import { parseChecklist } from './checklist.ts'
import { CHECKLIST_FIXTURE } from './fixtures/checklist.fixture.ts'
import { projectLedger } from './ledger-projection.ts'
import { HEAD, LEDGER, activeAt52, bashResult, engineLoops, ledgerLine, ledgerText, rowsOf, stage, warnsOf } from './testing.tsx'
import type { LedgerRow } from './types'

const CHECKLIST = 'docs/plans/00_master_checklist.md'
const OLD_HEAD = '0123456789abcdef0123456789abcdef01234567'
const EDITED = { filePath: CHECKLIST, structuredPatch: [] }

const tick51 = {
  tool: 'Edit' as const,
  file_path: `/repo/${CHECKLIST}`,
  old_string: '### Slice 5.1 - Pass pane and band [ ]\nStatus: Not Started',
  new_string: '### Slice 5.1 - Pass pane and band [x]\nStatus: Completed',
}

const verifier = (slice: string, overall: string, head: string | null, t = 1) =>
  ledgerLine(t, 'verdict', slice, { gate: 'slice-verifier', overall, fix_targets: [], head })
const tester = (slice: string, overall: string, t = 1) =>
  ledgerLine(t, 'verdict', slice, { gate: 'slice-tester', overall, fix_targets: [], head: HEAD })

// A one-pie checklist whose open slice is a frontend slice.
const UI = ['## Pie 7 - Screens [ ]', '### Slice 7.1 - Order screen [ ]', 'Status: Not Started', '**Type:** frontend', ''].join('\n')

test('a flip without a verdict warns once and the edit still returns its result', async ($, on) => {
  const { world, start } = stage(on, { checklist: CHECKLIST_FIXTURE })
  on('tool.call', () => ({ result: EDITED }))
  await start($)
  const ran = await $.tool.call(tick51)
  expect(ran.deny).toBeUndefined()
  expect(ran.result).toEqual(EDITED)
  expect(ran.context).toHaveLength(1)
  expect(ran.context?.[0]).toContain('checkbox-without-verdict')
  expect(ran.context?.[0]).toContain('Slice 5.1 was marked [x] with no slice-verifier verdict in the ledger')
  expect(warnsOf(world)).toEqual([['checkbox-without-verdict', '5.1']])
  expect(world.toasts).toHaveLength(1)
  expect(world.toasts[0]?.startsWith('Pass checkbox-without-verdict · Slice 5.1:')).toBe(true)
  // The same flip again inside a minute reports nothing more.
  const again = await $.tool.call(tick51)
  expect(again.result).toEqual(EDITED)
  expect(again.context).toBeUndefined()
  expect(warnsOf(world)).toHaveLength(1)
})

test('a flip with a slice-verifier pass at a matching HEAD is silent', async ($, on) => {
  const { world, start } = stage(on, { checklist: CHECKLIST_FIXTURE })
  world.files[LEDGER] = ledgerText([verifier('5.1', 'pass', HEAD)])
  on('tool.call', () => ({ result: EDITED }))
  await start($)
  const ran = await $.tool.call(tick51)
  expect(ran.result).toEqual(EDITED)
  expect(ran.context).toBeUndefined()
  expect(warnsOf(world)).toEqual([])
  expect(world.toasts).toEqual([])
})

test('a stale HEAD (a pass at an older sha) and a failed verdict each warn with their reason', async ($, on) => {
  const { world, start } = stage(on, { checklist: CHECKLIST_FIXTURE })
  world.files[LEDGER] = ledgerText([verifier('5.1', 'pass', OLD_HEAD), verifier('5.2', 'fail', HEAD)])
  on('tool.call', () => ({ result: EDITED }))
  await start($)
  const stale = await $.tool.call(tick51)
  expect(stale.context?.[0]).toContain(`with its slice-verifier pass at 0123456, not at HEAD ${HEAD.slice(0, 7)}`)
  const failed = await $.tool.call({
    tool: 'Edit',
    file_path: CHECKLIST,
    old_string: '### Slice 5.2 - Ledger and status tool [ ]',
    new_string: '### Slice 5.2 - Ledger and status tool [x]',
  })
  expect(failed.context?.[0]).toContain('while its latest slice-verifier verdict is fail')
  expect(warnsOf(world)).toEqual([
    ['checkbox-without-verdict', '5.1'],
    ['checkbox-without-verdict', '5.2'],
  ])
})

test('a UI slice wants a slice-tester pass too; an infrastructure slice does not', async ($, on) => {
  const { world, start } = stage(on, { checklist: UI })
  world.files[LEDGER] = ledgerText([verifier('7.1', 'pass', HEAD)])
  on('tool.call', () => ({ result: EDITED }))
  await start($)
  const ran = await $.tool.call({ tool: 'Edit', file_path: CHECKLIST, old_string: '7.1 - Order screen [ ]', new_string: '7.1 - Order screen [x]' })
  expect(ran.context?.[0]).toContain('checkbox-without-tester')
  expect(ran.context?.[0]).toContain('a frontend slice wants one')
  expect(warnsOf(world)).toEqual([['checkbox-without-tester', '7.1']])
})

test('a UI slice with both passes at HEAD flips silently', async ($, on) => {
  const { world, start } = stage(on, { checklist: UI })
  world.files[LEDGER] = ledgerText([tester('7.1', 'pass'), verifier('7.1', 'pass', HEAD, 2)])
  on('tool.call', () => ({ result: EDITED }))
  await start($)
  await $.tool.call({ tool: 'Edit', file_path: CHECKLIST, old_string: '### Slice 7.1 - Order screen [ ]', new_string: '### Slice 7.1 - Order screen [x]' })
  expect(warnsOf(world)).toEqual([])
})

test('a whole-file Write that ticks a slice is judged too, and a failed edit reports nothing', async ($, on) => {
  const { world, start } = stage(on, { checklist: CHECKLIST_FIXTURE })
  let fail = true
  on('tool.call', () => (fail ? { isError: true as const, result: 'old_string not found', text: 'old_string not found' } : { result: EDITED }))
  await start($)
  const errored = await $.tool.call(tick51)
  expect(errored.isError).toBe(true)
  expect(warnsOf(world)).toEqual([])
  fail = false
  const content = CHECKLIST_FIXTURE.replace(tick51.old_string, tick51.new_string)
  const ran = await $.tool.call({ tool: 'Write', file_path: CHECKLIST, content })
  expect(ran.result).toEqual(EDITED)
  expect(warnsOf(world)).toEqual([['checkbox-without-verdict', '5.1']])
})

test('a mid-slice push (HEAD a commit of the open slice) is silent', async ($, on) => {
  const { world, start } = stage(on, { checklist: activeAt52(CHECKLIST_FIXTURE) })
  world.files[LEDGER] = ledgerText([ledgerLine(1, 'commit', '5.2', { sha: HEAD, branch: 'pie-5-the-pass' })])
  on('tool.call', () => bashResult())
  await start($)
  const mid = await $.tool.call({ tool: 'Bash', command: 'git push origin pie-5-the-pass' })
  expect(mid.result).toEqual(bashResult().result)
  expect(mid.context).toBeUndefined()
  expect(warnsOf(world)).toEqual([])
})

test('a push of a slice marked done without a pass at HEAD warns and still runs', async ($, on) => {
  const { world, start } = stage(on, { checklist: activeAt52(CHECKLIST_FIXTURE) })
  world.files[LEDGER] = ledgerText([ledgerLine(1, 'commit', '5.1', { sha: HEAD, branch: 'pie-5-the-pass' })])
  on('tool.call', () => bashResult())
  await start($)
  const pushed = await $.tool.call({ tool: 'Bash', command: 'git push' })
  expect(pushed.result).toEqual(bashResult().result)
  expect(pushed.context?.[0]).toContain('push-slice-done-unverified')
  expect(pushed.context?.[0]).toContain('This push carries Slice 5.1, marked [x] with no slice-verifier verdict in the ledger')
  expect(warnsOf(world)).toEqual([['push-slice-done-unverified', '5.1']])
  expect(rowsOf(world).map(row => row.ev)).toEqual(['commit', 'push', 'warn'])
})

test('a push of a done slice verified at HEAD, or off a pie branch, is silent', async ($, on) => {
  const { world, start } = stage(on, { checklist: activeAt52(CHECKLIST_FIXTURE) })
  world.files[LEDGER] = ledgerText([
    ledgerLine(1, 'commit', '5.1', { sha: HEAD, branch: 'pie-5-the-pass' }),
    verifier('5.1', 'pass', HEAD, 2),
  ])
  on('tool.call', () => bashResult())
  await start($)
  await $.tool.call({ tool: 'Bash', command: 'git push' })
  expect(warnsOf(world)).toEqual([])
  const done = projectLedger(
    [{ v: 1, t: 1, sid: 's', ev: 'commit', pie: 5, slice: '5.1', data: { sha: HEAD } } as LedgerRow],
    [],
    parseChecklist(activeAt52(CHECKLIST_FIXTURE)),
  )
  expect(judgePush('git push', { branch: 'feature/x', head: HEAD, ledger: done })).toBeNull()
  expect(judgePush('git push', { branch: 'pie/5', head: HEAD, ledger: done })?.code).toBe('push-slice-done-unverified')
  expect(judgePush('git status', { branch: 'pie/5', head: HEAD, ledger: done })).toBeNull()
})

test('a plan write warns during sell-slice, and is silent under cook-pizzas and sell-pie', async ($, on) => {
  const { world, start } = stage(on, { checklist: CHECKLIST_FIXTURE })
  engineLoops(on)
  on('tool.call', () => ({ result: {} }))
  await start($)
  const plan = { tool: 'Write' as const, file_path: '/repo/docs/plans/stage_53_pass_checks.md', content: '# plan' }
  await $.skill.prompt({ skill: 'bytheslice:cook-pizzas', text: 'plan', frontmatter: {}, source: 'plugin' })
  const quiet = await $.tool.call(plan)
  expect(quiet.context).toBeUndefined()
  // sell-pie appends build notes to stage files by design: silent.
  await $.skill.prompt({ skill: 'bytheslice:sell-pie', text: 'bake', frontmatter: {}, source: 'plugin' })
  const baking = await $.tool.call({ ...plan, content: '# plan\n\n## Build notes\n' })
  expect(baking.result).toEqual({})
  expect(baking.context).toBeUndefined()
  expect(warnsOf(world)).toEqual([])
  await $.skill.prompt({ skill: 'bytheslice:sell-slice', text: 'sell', frontmatter: {}, source: 'plugin' })
  const loud = await $.tool.call(plan)
  expect(loud.result).toEqual({})
  expect(loud.context?.[0]).toContain('(plan-write-during-bake): docs/plans/stage_53_pass_checks.md changed while sell-slice runs')
  expect(warnsOf(world)).toEqual([['plan-write-during-bake', null]])
  expect(rowsOf(world).filter(row => row.ev === 'warn')[0]?.pie).toBeUndefined()
})

test('flipsOf reads a ticked box, a Status line, a Write, a replace_all and a stale fragment', () => {
  const text = CHECKLIST_FIXTURE
  const c = parseChecklist(text)
  // A box ticked while the Status line still says Not Started.
  expect(flipsOf({ kind: 'edit', old: '### Slice 5.3 - Pass checks as warnings [ ]', next: '### Slice 5.3 - Pass checks as warnings [x]', all: false }, text, c)).toEqual([
    { id: '5.3', type: 'infrastructure' },
  ])
  // A Status line alone, which the parser reads as done.
  const status = '### Slice 5.4 - Hook reduction [ ]\nStatus: Not Started'
  expect(flipsOf({ kind: 'edit', old: status, next: status.replace('Not Started', 'Completed'), all: false }, text, c).map(f => f.id)).toEqual(['5.4'])
  // An edit whose old text the memory no longer holds: judged from its own lines.
  expect(flipsOf({ kind: 'edit', old: '### Slice 5.5 - Watchdog [ ]', next: '### Slice 5.5 - Watchdog [x]', all: false }, null, c).map(f => f.id)).toEqual(['5.5'])
  // A slice already done is no flip; an untouched box is no flip.
  expect(flipsOf({ kind: 'edit', old: '### Slice 4.1 - Activity feed [x]', next: '### Slice 4.1 - Activity feed [x] ', all: false }, text, c)).toEqual([])
  expect(flipsOf({ kind: 'edit', old: 'Fixture for', next: 'A fixture for', all: false }, text, c)).toEqual([])
  // A Prep line counts as a slice line.
  const prep = '## Prep - Pie 1: Foundations\n[ ] Slice 1.1 - Built\n'
  expect(flipsOf({ kind: 'write', content: prep.replace('[ ]', '[x]') }, prep, parseChecklist(prep)).map(f => f.id)).toEqual(['1.1'])
  expect(boxMarks('[x] Slice 1.2 - A\n### Slice 2.1 - B [ ]\nnot a slice [x]')).toEqual(
    new Map([
      ['1.2', true],
      ['2.1', false],
    ]),
  )
})

test('judgeFlips names each reason and honors requireTester never', () => {
  const c = parseChecklist(UI)
  const ledger = projectLedger([], [], c)
  const flips = [{ id: '7.1', type: 'frontend' }]
  expect(judgeFlips(flips, { checklist: c, ledger, head: HEAD, policy: { requireTester: 'ui-slices' } }).map(f => f.code)).toEqual([
    'checkbox-without-verdict',
    'checkbox-without-tester',
  ])
  expect(judgeFlips(flips, { checklist: c, ledger, head: HEAD, policy: { requireTester: 'never' } }).map(f => f.code)).toEqual([
    'checkbox-without-verdict',
  ])
  const unknown = judgeFlips(flips, { checklist: c, ledger, head: null, policy: { requireTester: 'never' } })
  expect(unknown[0]?.text).toContain('with no slice-verifier verdict')
  expect(judgePlanWrite('docs/plans/00_master_checklist.md', 'sell-slice')).toBeNull()
  expect(judgePlanWrite('docs/plans/stage_9_x.md', 'sell-pie')).toBeNull()
  expect(judgePlanWrite('docs/plans/stage_9_x.md', 'sell-slice')?.code).toBe('plan-write-during-bake')
  expect(judgePlanWrite('docs/plans/stage_9_x.md', null)).toBeNull()
})
