// mod/strip.test.ts
// Unit tests for the cross-session strip and pass history: two sessions see each other and not themselves, stale entries drop, session end deletes the key, writes wait 10 seconds, and history prints the ledger table.

import { expect, test } from 'claude-code/testing'

import { CHECKLIST_FIXTURE } from './fixtures/checklist.fixture.ts'
import { STRIP_MAX_AGE_MS, agoWords, othersOf, stripLine } from './strip.ts'
import { LEDGER, START_MS, endSession, ledgerLine, ledgerText, paneTarget, stage, typed } from './testing.tsx'

const SURFACES = ['terminal', 'desktop'] as const
const KEY = 'strip:/repo:'
const other = (t: number, slice = '4.2', status = 'verifying') => ({ pie: Number(slice.split('.')[0]), slice, status, branch: 'pie-4-live-kitchen', t })

test('each session sees the others of its project and never itself; other projects and stale entries drop', () => {
  const entries = {
    [`${KEY}a`]: other(START_MS - 120000),
    [`${KEY}b`]: other(START_MS - 60000, '5.1', 'building'),
    [`${KEY}old`]: other(START_MS - STRIP_MAX_AGE_MS - 1),
    'strip:/elsewhere:c': other(START_MS),
    [`${KEY}junk`]: { nope: true },
  }
  expect(othersOf(entries, '/repo', 'a', START_MS).map(o => o.sid)).toEqual(['b'])
  expect(othersOf(entries, '/repo', 'b', START_MS).map(o => o.sid)).toEqual(['a'])
  expect(stripLine(other(START_MS - 120000), START_MS)).toBe('Pie 4 · Slice 4.2 verifying · 2 min ago')
  expect(agoWords(30000)).toBe('just now')
  expect(agoWords(3 * 3600000)).toBe('3 h ago')
})

for (const surface of SURFACES) {
  test(`two sessions on one project: each writes its key and the pane lists only the other (${surface})`, async ($, on) => {
    const { world, start } = stage(on, { checklist: CHECKLIST_FIXTURE, sessionId: 'session-a' })
    await start($, surface)
    expect(world.store[`${KEY}session-a`]).toEqual({ pie: 5, slice: '5.1', status: 'queued', branch: 'pie-5-the-pass', t: START_MS })
    // A second session of the same project starts in the same store.
    world.sessionId = 'session-b'
    await start($, surface)
    expect(Object.keys(world.store).filter(key => key.startsWith(KEY)).sort()).toEqual([`${KEY}session-a`, `${KEY}session-b`])
    const ui = await $.ui.mount(paneTarget(surface, 60))
    expect((await ui.findAll({ type: 'Text' })).map(t => t.text).filter(t => /Other sessions|^ {2}Pie/.test(t))).toEqual([
      'Other sessions · 1',
      '  Pie 5 · Slice 5.1 queued · just now',
    ])
    await ui.unmount()
  })
}

test('an entry older than six hours is not listed, and session end deletes this session key', async ($, on) => {
  const { world, start } = stage(on, {
    checklist: CHECKLIST_FIXTURE,
    store: { [`${KEY}gone`]: other(START_MS - STRIP_MAX_AGE_MS - 1000), [`${KEY}live`]: other(START_MS - 120000) },
  })
  await start($)
  const ui = await $.ui.mount(paneTarget('terminal', 60))
  const lines = (await ui.findAll({ type: 'Text' })).map(t => t.text)
  expect(lines).toContain('Other sessions · 1')
  expect(lines).toContain('  Pie 4 · Slice 4.2 verifying · 2 min ago')
  await ui.unmount()
  expect(world.store[`${KEY}session-test`]).toBeDefined()
  await endSession($)
  expect(world.store[`${KEY}session-test`]).toBeUndefined()
  // The others are read-only: nothing of theirs was deleted.
  expect(world.store[`${KEY}gone`]).toBeDefined()
})

test('a change writes at most once per 10 seconds; the pulse after the window writes it', async ($, on) => {
  const { world, clock, start } = stage(on, { checklist: CHECKLIST_FIXTURE })
  await start($)
  const moved = CHECKLIST_FIXTURE.replace('### Slice 5.1 - Pass pane and band [ ]\nStatus: Not Started', '### Slice 5.1 - Pass pane and band [x]\nStatus: Completed')
  world.checklist = moved
  world.mtimeMs = 9
  await clock.advance(5000)
  await clock.settle()
  expect(world.store[`${KEY}session-test`]).toMatchObject({ slice: '5.1' })
  await clock.advance(6000)
  await clock.settle()
  expect(world.store[`${KEY}session-test`]).toMatchObject({ slice: '5.2', t: START_MS + 10000 })
})

test('pass history prints the ledger table from the script, or says there is no ledger', async ($, on) => {
  const { world, start } = stage(on, { checklist: CHECKLIST_FIXTURE })
  const table = 'Pie 5 The Pass · 1 of 1 slices done · fix loops 0 · $0.25\n  slice  done  duration  fix  verifier  cost\n  5.1    yes   10m       0    pass      $0.25\n'
  world.run = argv => (argv[0] === 'node' && argv.slice(2).join(' ') === '--root /repo --format text' ? { stdout: table } : undefined)
  await start($)
  expect((await $.command.run(typed('history'))).text).toBe(`Pass history: no ledger at ${LEDGER} yet. Bake a pie with the Pass mod loaded.`)
  world.files[LEDGER] = ledgerText([ledgerLine(1, 'slice.started', '5.1')])
  expect((await $.command.run(typed('history'))).text).toBe(`Pass history (from the ledger):\n${table.trimEnd()}`)
})
