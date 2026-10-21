// mod/touched.test.ts
// Unit tests for edit capture and touched files: an edit row holds path and role only, numstat joins the edits, a builder edit after the verifier's pass is stale and draws red on terminal and desktop.

import { expect, test } from 'claude-code/testing'

import { CHECKLIST_FIXTURE } from './fixtures/checklist.fixture.ts'
import { LEDGER, agentCall, engineLoops, ledgerLine, ledgerText, paneTarget, rowsOf, spawn, stage } from './testing.tsx'
import { parseNumstat, relativePath, touchedOf } from './touched.ts'
import type { LedgerRow } from './types'

const SURFACES = ['terminal', 'desktop'] as const
const START = 'aaaa111122223333444455556666777788889999'
const rowsFrom = (lines: string[]): LedgerRow[] => lines.map(line => JSON.parse(line) as LedgerRow)
const edit = (t: number, path: string, agent: string) => ledgerLine(t, 'edit', '5.1', { path, agent, tool: 'Edit' })
const pass = (t: number) => ledgerLine(t, 'verdict', '5.1', { gate: 'slice-verifier', overall: 'pass', fix_targets: [], head: START })

test('paths are workspace-relative; a path outside the workspace is not one', () => {
  expect(relativePath('/repo/mod/a.ts', '/repo')).toBe('mod/a.ts')
  expect(relativePath('./mod/a.ts', '/repo')).toBe('mod/a.ts')
  expect(relativePath('/elsewhere/a.ts', '/repo')).toBeNull()
  expect(relativePath('../a.ts', '/repo')).toBeNull()
  expect(relativePath(42, '/repo')).toBeNull()
})

test('numstat reads counts, binary files and renames', () => {
  const parsed = parseNumstat('3\t1\tmod/a.ts\n-\t-\tassets/logo.png\n2\t2\tmod/{old => new}/b.ts\n1\t0\tc.ts => d.ts\nnoise\n')
  expect([...parsed]).toEqual([
    ['mod/a.ts', { added: 3, removed: 1 }],
    ['assets/logo.png', { added: 0, removed: 0 }],
    ['mod/new/b.ts', { added: 2, removed: 2 }],
    ['d.ts', { added: 1, removed: 0 }],
  ])
})

test('a builder edit after the verifier pass is stale; one before it, or the main loop after it, is not', () => {
  const rows = rowsFrom([
    edit(1, 'mod/a.ts', 'implementer'),
    pass(2),
    edit(3, 'mod/b.ts', 'fix-attempter'),
    edit(4, 'mod/c.ts', 'main'),
  ])
  const files = touchedOf(rows, '5.1', parseNumstat('3\t1\tmod/a.ts\n5\t0\tmod/b.ts\n1\t1\tREADME.md\n'))
  expect(files).toEqual([
    { path: 'mod/a.ts', added: 3, removed: 1, roles: ['implementer'], stale: false },
    { path: 'mod/b.ts', added: 5, removed: 0, roles: ['fix-attempter'], stale: true },
    { path: 'mod/c.ts', added: 0, removed: 0, roles: ['main'], stale: false },
    { path: 'README.md', added: 1, removed: 1, roles: [], stale: false },
  ])
  // With no pass yet nothing is stale.
  expect(touchedOf(rows.filter(row => row.ev !== 'verdict'), '5.1', new Map()).some(file => file.stale)).toBe(false)
})

test('an edit becomes one row of path, agent id, role and tool, and never its content', async ($, on) => {
  const { world, start } = stage(on, { checklist: CHECKLIST_FIXTURE })
  engineLoops(on, ['impl-1'])
  on('tool.call', () => ({ result: { filePath: '/repo/mod/a.ts' } }))
  await start($)
  await spawn($, 'bytheslice:implementer', 'P5 S5.1 build: pane')
  await agentCall($, 'impl-1', { tool: 'Edit', file_path: '/repo/mod/a.ts', old_string: 'OLD SECRET', new_string: 'NEW SECRET' })
  await $.tool.call({ tool: 'Write', file_path: '/repo/mod/b.ts', content: 'WRITTEN SECRET' })
  await $.tool.call({ tool: 'Write', file_path: '/tmp/outside.ts', content: 'x' })
  const edits = rowsOf(world).filter(row => row.ev === 'edit')
  expect(edits.map(row => [row.slice, row.aid ?? null, row.data])).toEqual([
    ['5.1', 'impl-1', { path: 'mod/a.ts', aid: 'impl-1', agent: 'implementer', tool: 'Edit' }],
    ['5.1', null, { path: 'mod/b.ts', agent: 'main', tool: 'Write' }],
  ])
  const text = world.files[LEDGER] ?? ''
  for (const leak of ['SECRET', 'new_string', 'old_string', '"content"', 'file_text']) expect(text.includes(leak)).toBe(false)
})

for (const surface of SURFACES) {
  test(`the pane lists touched files with numstat and roles, a stale one in red (${surface})`, async ($, on) => {
    const { world, start } = stage(on, { checklist: CHECKLIST_FIXTURE })
    world.files[LEDGER] = ledgerText([
      ledgerLine(1, 'slice.started', '5.1', { skill: 'sell-pie', head: START }),
      edit(2, 'mod/a.ts', 'implementer'),
      pass(3),
      edit(4, 'mod/b.ts', 'fix-attempter'),
    ])
    world.run = argv => (argv.join(' ') === `git diff --numstat ${START}` ? { stdout: '3\t1\tmod/a.ts\n5\t0\tmod/b.ts\n' } : undefined)
    await start($, surface)
    const ui = await $.ui.mount(paneTarget(surface, 60))
    const header = await ui.find({ type: 'Text', text: /^Touched/ })
    expect(header?.text).toBe('Touched · 5.1 · 2 files · 1 after the pass')
    expect(header?.props.color).toBe('error')
    const stale = await ui.find({ type: 'Text', text: /mod\/b\.ts/ })
    expect(stale?.text).toBe('  +5 -0 mod/b.ts · fix-attempter · after pass')
    expect(stale?.props.color).toBe('error')
    const fresh = await ui.find({ type: 'Text', text: /mod\/a\.ts/ })
    expect(fresh?.text).toBe('  +3 -1 mod/a.ts · implementer')
    expect(fresh?.props.color).toBeUndefined()
    await ui.unmount()
  })
}
