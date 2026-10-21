// mod/replay.test.tsx
// Unit tests for pass replay on terminal and desktop: step order from commit rows plus the uncommitted step, Prev staying at the first step, per-file editors and diffs loaded by presses, the narrow fallback, and steps from metadata only.

import { expect, test } from 'claude-code/testing'

import { CHECKLIST_FIXTURE } from './fixtures/checklist.fixture.ts'
import { replaySteps, hunksOf } from './replay.tsx'
import { LEDGER, ledgerLine, ledgerText, replayTarget, stage, typed } from './testing.tsx'
import type { World } from './testing.tsx'
import type { LedgerRow } from './types'

const SURFACES = ['terminal', 'desktop'] as const
const C1 = 'c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1'
const C2 = 'c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2'
const hunk = (path: string, line: string) => `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n@@ -1,1 +1,2 @@\n keep\n+${line}\n`

const LINES = [
  ledgerLine(1, 'slice.started', '5.1', { skill: 'sell-pie', head: 'a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0' }),
  ledgerLine(2, 'edit', '5.1', { path: 'mod/a.ts', aid: 'impl-1', agent: 'implementer', tool: 'Write' }),
  ledgerLine(3, 'commit', '5.1', { sha: C1, branch: 'pie-5-the-pass' }),
  ledgerLine(4, 'edit', '5.1', { path: 'mod/b.ts', aid: 'fix-1', agent: 'fix-attempter', tool: 'Edit' }),
  ledgerLine(4, 'edit', '5.1', { path: 'mod/a.ts', agent: 'main', tool: 'Edit' }),
  ledgerLine(5, 'commit', '5.1', { sha: C2, branch: 'pie-5-the-pass' }),
  ledgerLine(5, 'commit', '5.1', { sha: C2, branch: 'pie-5-the-pass' }),
  ledgerLine(6, 'edit', '5.1', { path: 'mod/c.ts', agent: 'main', tool: 'Edit' }),
]

function seeded(world: World): void {
  world.files[LEDGER] = ledgerText(LINES)
  const answers: Record<string, string> = {
    [`git show --numstat --format=%s ${C1}`]: 'feat(pie-5): 5.1 task 1 pane\n\n3\t0\tmod/a.ts\n',
    [`git show --format= ${C1} -- mod/a.ts`]: hunk('mod/a.ts', 'first'),
    [`git show --numstat --format=%s ${C2}`]: 'feat(pie-5): 5.1 task 2 fix\n\n2\t1\tmod/b.ts\n1\t1\tmod/a.ts\n',
    [`git show --format= ${C2} -- mod/b.ts`]: hunk('mod/b.ts', 'fixed'),
    [`git show --format= ${C2} -- mod/a.ts`]: hunk('mod/a.ts', 'tweaked'),
    'git diff --numstat HEAD': '1\t0\tmod/c.ts\n',
    'git diff HEAD -- mod/c.ts': hunk('mod/c.ts', 'pending'),
  }
  world.run = argv => {
    const stdout = answers[argv.join(' ')]
    return stdout === undefined ? undefined : { stdout }
  }
}

const texts = async (ui: { findAll: (q: { type: 'Text' }) => Promise<{ text: string }[]> }) => (await ui.findAll({ type: 'Text' })).map(t => t.text)

test('steps are the commit rows in order, a sha once, then the uncommitted changes', () => {
  const rows = LINES.map(line => JSON.parse(line) as LedgerRow)
  expect(replaySteps(rows, '5.1').map(step => [step.sha?.slice(0, 2) ?? null, step.fromT])).toEqual([
    ['c1', Number.NEGATIVE_INFINITY],
    ['c2', 3],
    [null, 5],
  ])
  expect(replaySteps(rows, '9.9').map(step => step.sha)).toEqual([null])
  expect(hunksOf(hunk('x.ts', 'y'))).toBe('@@ -1,1 +1,2 @@\n keep\n+y')
  expect(hunksOf('no hunks here')).toBe('')
})

for (const surface of SURFACES) {
  test(`pass replay opens a focused pane at the first commit, and Next walks to the uncommitted step (${surface})`, async ($, on) => {
    const { world, start } = stage(on, { checklist: CHECKLIST_FIXTURE })
    seeded(world)
    await start($, surface)
    const answer = await $.command.run(typed('replay 5.1'))
    expect(answer.text).toBe('Replay 5.1: step 1 of 3. Prev and Next step through it; Escape closes.')
    expect(world.panes.some(pane => pane.id === 'pass-replay')).toBe(true)
    const ui = await $.ui.mount(replayTarget(surface))
    expect((await texts(ui)).slice(0, 2)).toEqual(['Replay 5.1 · step 1 of 3', 'c1c1c1c feat(pie-5): 5.1 task 1 pane'])
    const files = await ui.findAll({ type: 'Button' })
    expect(files.map(b => [b.key, b.props.label])).toEqual([
      ['file-0', '▸ +3 -0 mod/a.ts · implementer'],
      ['prev', 'Prev'],
      ['next', 'Next'],
    ])
    await ui.press({ key: 'next' })
    expect((await texts(ui)).slice(0, 2)).toEqual(['Replay 5.1 · step 2 of 3', 'c2c2c2c feat(pie-5): 5.1 task 2 fix'])
    const second = await ui.findAll({ type: 'Button' })
    expect(second.slice(0, 2).map(b => b.props.label)).toEqual(['▸ +2 -1 mod/b.ts · fix-attempter', '  +1 -1 mod/a.ts · main'])
    await ui.press({ key: 'file-1' })
    const code = await ui.find({ type: 'Code' })
    expect(code?.props.source).toBe('@@ -1,1 +1,2 @@\n keep\n+tweaked')
    expect(code?.props.format).toBe('diff')
    await ui.press({ key: 'next' })
    expect((await texts(ui)).slice(0, 2)).toEqual(['Replay 5.1 · step 3 of 3', 'Uncommitted changes'])
    await ui.press({ key: 'next' })
    expect((await texts(ui))[0]).toBe('Replay 5.1 · step 3 of 3')
    expect(world.runs.some(argv => argv.join(' ') === 'git diff HEAD -- mod/c.ts')).toBe(true)
    await ui.unmount()
  })

  test(`Prev at the first step stays at the first step (${surface})`, async ($, on) => {
    const { world, start } = stage(on, { checklist: CHECKLIST_FIXTURE })
    seeded(world)
    await start($, surface)
    await $.command.run(typed('replay 5.1'))
    const ui = await $.ui.mount(replayTarget(surface))
    const before = world.runs.length
    await ui.press({ key: 'prev' })
    expect((await texts(ui))[0]).toBe('Replay 5.1 · step 1 of 3')
    // Staying put loads nothing again.
    expect(world.runs.length).toBe(before)
    await ui.unmount()
  })

  test(`under 60 columns the pane is one band line and a hint to widen (${surface})`, async ($, on) => {
    const { world, start } = stage(on, { checklist: CHECKLIST_FIXTURE })
    seeded(world)
    await start($, surface)
    await $.command.run(typed('replay 5.1'))
    const ui = await $.ui.mount(replayTarget(surface, 50))
    await ui.press({ key: 'next' })
    expect(await texts(ui)).toEqual(['Replay 5.1: step 2 of 3', 'Widen to 60 columns to see files and diffs.'])
    expect(await ui.find({ type: 'Code' })).toBeUndefined()
    await ui.unmount()
  })
}

test('pass replay names a slice with no rows, and a bad id gets the usage line', async ($, on) => {
  const { world, start } = stage(on, { checklist: CHECKLIST_FIXTURE })
  seeded(world)
  await start($)
  expect((await $.command.run(typed('replay 9.9'))).text).toBe('Replay 9.9: the ledger has no rows for that slice yet.')
  expect((await $.command.run(typed('replay nope'))).text).toBe('Usage: pass replay <slice>, for example pass replay 5.2.')
  expect(world.panes.some(pane => pane.id === 'pass-replay')).toBe(false)
})

test('a replay reads git for diffs and stores nothing: the ledger holds no content after a replay', async ($, on) => {
  const { world, start } = stage(on, { checklist: CHECKLIST_FIXTURE })
  seeded(world)
  await start($)
  const before = world.files[LEDGER]
  await $.command.run(typed('replay 5.1'))
  const ui = await $.ui.mount(replayTarget('terminal'))
  await ui.press({ key: 'next' })
  await ui.unmount()
  expect(world.files[LEDGER]).toBe(before)
  expect((before ?? '').includes('+first')).toBe(false)
})
