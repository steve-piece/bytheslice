// mod/projection.test.ts
// Unit tests for the read-only projection: active pie and slice helpers, the version gate, and refresh on start, edit and mtime change.

import { expect, test } from 'claude-code/testing'

import { parseChecklist } from './checklist.ts'
import { CHECKLIST_FIXTURE } from './fixtures/checklist.fixture.ts'
import { activePie, activeSlice, allDone, counts, isChecklistPath, isOlder, WATCH_MS } from './projection.ts'
import { ALL_DONE, stage } from './testing.tsx'

test('the active pie is the first with an open slice', () => {
  const c = parseChecklist(CHECKLIST_FIXTURE)
  expect(activePie(c)?.n).toBe(5)
  expect(activeSlice(c)?.id).toBe('5.1')
  expect(counts(c)).toEqual({ done: 0, total: 8 })
  const later = parseChecklist('## Pie 2 - Two [ ]\n### Slice 2.1 - A [x]\n### Slice 2.2 - B [ ]\n## Pie 3 - Three [ ]\n### Slice 3.1 - C [ ]\n')
  expect(activePie(later)?.n).toBe(2)
  expect(activeSlice(later)?.id).toBe('2.2')
  expect(counts(later)).toEqual({ done: 1, total: 2 })
})

test('everything done gives no active pie', () => {
  const c = parseChecklist(ALL_DONE)
  expect(activePie(c)).toBeNull()
  expect(activeSlice(c)).toBeNull()
  expect(counts(c)).toEqual({ done: 0, total: 0 })
  expect(allDone(c)).toBe(true)
})

test('an empty checklist has no active pie and is not all done', () => {
  const c = parseChecklist('')
  expect(activePie(c)).toBeNull()
  expect(counts(c)).toEqual({ done: 0, total: 0 })
  expect(allDone(c)).toBe(false)
  expect(allDone(null)).toBe(false)
  expect(activePie(null)).toBeNull()
})

test('only the master checklist path triggers a refresh', () => {
  expect(isChecklistPath('/repo/docs/plans/00_master_checklist.md')).toBe(true)
  expect(isChecklistPath('docs/plans/00_master_checklist.md')).toBe(true)
  expect(isChecklistPath('docs/plans/stage_51_pass_pane.md')).toBe(false)
  expect(isChecklistPath('docs/plans/x00_master_checklist.md')).toBe(false)
  expect(isChecklistPath(undefined)).toBe(false)
})

test('versions below 2.1.299, or unreadable ones, count as older', () => {
  expect(isOlder('2.1.298')).toBe(true)
  expect(isOlder('2.1.299')).toBe(false)
  expect(isOlder('2.1.304')).toBe(false)
  expect(isOlder('2.2.0')).toBe(false)
  expect(isOlder('2.1.299-dev')).toBe(false)
  expect(isOlder(undefined)).toBe(true)
  expect(isOlder('next')).toBe(true)
})

test('session start reads the checklist, registers the command, pins the status and opens the pane', async ($, on) => {
  const { world, start } = stage(on, { checklist: CHECKLIST_FIXTURE })
  await start($)
  expect(world.registered).toEqual(['pass'])
  expect(world.statuses.at(-1)).toBe('P5 S5.1 ✓0/8')
  expect(world.opened).toBe(1)
  expect(world.logs).toEqual([])
})

test('a missing checklist gives no status, no pane and no throw', async ($, on) => {
  const { world, start } = stage(on)
  await start($)
  expect(world.registered).toEqual(['pass'])
  expect(world.statuses).toHaveLength(1)
  expect(world.statuses[0]).toBeUndefined()
  expect(world.opened).toBe(0)
})

test('an older engine leaves the mod inert and says so once', async ($, on) => {
  const { world, start } = stage(on, { checklist: CHECKLIST_FIXTURE, version: '2.1.290' })
  await start($)
  await start($)
  expect(world.registered).toEqual([])
  expect(world.statuses).toEqual([])
  expect(world.opened).toBe(0)
  expect(world.logs).toHaveLength(1)
  expect(world.logs[0]).toContain('2.1.299')
})

test('an engine that cannot say its version is treated as older', async ($, on) => {
  const { world, start } = stage(on, { checklist: CHECKLIST_FIXTURE, version: null })
  await start($)
  expect(world.registered).toEqual([])
  expect(world.logs).toHaveLength(1)
})

test('a refresh after a changed file updates the atoms on the next watch tick', async ($, on) => {
  const { world, clock, start } = stage(on, { checklist: CHECKLIST_FIXTURE })
  await start($)
  expect(world.statuses.at(-1)).toBe('P5 S5.1 ✓0/8')
  const before = world.statuses.length
  await clock.advance(WATCH_MS)
  expect(world.statuses).toHaveLength(before)
  world.checklist = ALL_DONE
  world.mtimeMs = 2
  await clock.advance(WATCH_MS)
  await clock.settle()
  expect(world.statuses.at(-1)).toBe('✓ all done')
  world.checklist = null
  await clock.advance(WATCH_MS)
  await clock.settle()
  expect(world.statuses.at(-1)).toBeUndefined()
})

test('an Edit of the checklist refreshes after the edit runs and returns the engine result', async ($, on) => {
  const { world, start } = stage(on, { checklist: CHECKLIST_FIXTURE })
  const ran: string[] = []
  on('tool.call', (_$, e) => {
    ran.push(e.tool)
    world.checklist = ALL_DONE
    return { result: { filePath: 'docs/plans/00_master_checklist.md' } }
  })
  await start($)
  const result = await $.tool.call({
    tool: 'Edit',
    file_path: 'docs/plans/00_master_checklist.md',
    old_string: '[ ]',
    new_string: '[x]',
  })
  expect(ran).toEqual(['Edit'])
  expect(result).toMatchObject({ result: { filePath: 'docs/plans/00_master_checklist.md' } })
  expect(world.statuses.at(-1)).toBe('✓ all done')
})

test('an Edit of any other file leaves the projection alone', async ($, on) => {
  const { world, start } = stage(on, { checklist: CHECKLIST_FIXTURE })
  on('tool.call', () => {
    world.checklist = ALL_DONE
    return { result: { filePath: 'README.md' } }
  })
  await start($)
  const before = world.statuses.length
  await $.tool.call({ tool: 'Write', file_path: 'README.md', content: 'x' })
  expect(world.statuses).toHaveLength(before)
})
