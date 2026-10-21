// mod/ledger.test.ts
// Unit tests for the ledger writer: row shape and order, concurrent appends, an unwritable path, torn lines and the worktree root.

import { expect, test } from 'claude-code/testing'

import { normalize, parseRows, rootFromCommonDir, rowLine } from './ledger.ts'
import { CHECKLIST_FIXTURE } from './fixtures/checklist.fixture.ts'
import { LEDGER, SESSION, START_MS, note, rowsOf, stage, status } from './testing.tsx'

test('a row is one compact line in schema order, stamped v, t and sid', async ($, on) => {
  const { world, clock, start } = stage(on, { checklist: CHECKLIST_FIXTURE })
  await start($)
  expect(await note($, 'first')).toBe('ok')
  await clock.advance(1000)
  expect(await note($, 'second', '5.3')).toBe('ok')
  const lines = (world.files[LEDGER] ?? '').trimEnd().split('\n')
  expect(lines).toHaveLength(2)
  expect(lines[0]).toBe(
    `{"v":1,"t":${START_MS},"sid":"${SESSION}","ev":"note","pie":5,"slice":"5.1","data":{"text":"first"}}`,
  )
  const rows = rowsOf(world)
  expect(rows.map(row => row.slice)).toEqual(['5.1', '5.3'])
  expect(rows[1]?.t).toBe(START_MS + 1000)
  expect(world.runs.filter(argv => argv[0] === 'tee')).toEqual([
    ['tee', '-a', LEDGER],
    ['tee', '-a', LEDGER],
  ])
})

test('the row line keeps schema order and drops absent fields', () => {
  expect(rowLine({ ev: 'commit', data: { sha: 'abc1234' }, slice: '5.2', pie: 5 }, 7, 's')).toBe(
    '{"v":1,"t":7,"sid":"s","ev":"commit","pie":5,"slice":"5.2","data":{"sha":"abc1234"}}',
  )
  expect(rowLine({ ev: 'usage' }, 1, 's')).toBe('{"v":1,"t":1,"sid":"s","ev":"usage"}')
})

test('two concurrent appends both land', async ($, on) => {
  const { world, start } = stage(on, { checklist: CHECKLIST_FIXTURE })
  await start($)
  const answers = await Promise.all([note($, 'a'), note($, 'b')])
  expect(answers).toEqual(['ok', 'ok'])
  const texts = rowsOf(world).map(row => (row.data as { text: string }).text)
  expect(texts.sort()).toEqual(['a', 'b'])
})

test('an unwritable ledger is swallowed: the row drops, the log says so once, nothing throws', async ($, on) => {
  const { world, start } = stage(on, { checklist: CHECKLIST_FIXTURE, unwritable: true })
  await start($)
  expect(await note($, 'lost')).toBe('not recorded: the ledger could not be written')
  expect(await note($, 'lost again')).toBe('not recorded: the ledger could not be written')
  expect(world.files[LEDGER] ?? '').toBe('')
  const said = world.logs.filter(line => line.includes('could not write its ledger'))
  expect(said).toHaveLength(1)
  expect(said[0]).toContain('Permission denied')
  expect(world.logs.every(line => !line.includes('lost'))).toBe(true)
})

test('readRows skips a torn last line and a foreign row', async ($, on) => {
  const { world, start } = stage(on, { checklist: CHECKLIST_FIXTURE })
  world.files[LEDGER] = [
    rowLine({ ev: 'slice.started', pie: 5, slice: '5.1' }, START_MS - 50, 's'),
    '{"v":2,"t":11,"sid":"s","ev":"slice.started","pie":5,"slice":"5.2"}',
    '{"v":1,"t":30,"sid":"s","ev":"slice.sta',
  ].join('\n')
  await start($)
  const text = await status($)
  expect(text).toContain('> 5.1 building')
  expect(text).toContain('  5.2 queued')
  expect(parseRows(world.files[LEDGER] ?? '').map(row => row.slice)).toEqual(['5.1'])
  expect(parseRows('a\n{}\n')).toEqual([])
  expect(parseRows(world.files[LEDGER] ?? '', START_MS)).toEqual([])
})

test('the first write makes .bytheslice ignore itself', async ($, on) => {
  const { world, start } = stage(on, { checklist: CHECKLIST_FIXTURE, cwd: '/fresh', commonDir: '/fresh/.git' })
  await start($)
  expect(await note($, 'x')).toBe('ok')
  expect(world.files['/fresh/.bytheslice/.gitignore']).toBe('*\n')
  expect(rowsOf(world, '/fresh/.bytheslice/ledger.jsonl')).toHaveLength(1)
})

test('every worktree of a project writes the primary checkout ledger', async ($, on) => {
  const { world, start } = stage(on, {
    checklist: CHECKLIST_FIXTURE,
    cwd: '/main/.claude/worktrees/pie-5',
    commonDir: '/main/.git',
  })
  await start($)
  expect(await note($, 'from a worktree')).toBe('ok')
  expect(rowsOf(world, '/main/.bytheslice/ledger.jsonl')).toHaveLength(1)
  expect(world.files['/main/.claude/worktrees/pie-5/.bytheslice/ledger.jsonl']).toBeUndefined()
})

test('outside git the ledger sits in the session directory', async ($, on) => {
  const { world, start } = stage(on, { checklist: CHECKLIST_FIXTURE, cwd: '/loose', commonDir: null })
  await start($)
  expect(await note($, 'no repo')).toBe('ok')
  expect(rowsOf(world, '/loose/.bytheslice/ledger.jsonl')).toHaveLength(1)
})

test('the root follows the common git directory', () => {
  expect(rootFromCommonDir('/main/.git\n', '/main/.claude/worktrees/x')).toBe('/main')
  expect(rootFromCommonDir('.git', '/repo')).toBe('/repo')
  expect(rootFromCommonDir('../../.git', '/repo/a/b')).toBe('/repo')
  expect(rootFromCommonDir('/srv/project.git', '/srv/work')).toBe('/srv/work')
  expect(rootFromCommonDir('', '/repo')).toBe('/repo')
  expect(normalize('/a/./b/../c')).toBe('/a/c')
})
