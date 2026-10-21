// mod/band.test.tsx
// Unit tests for the band, status line and prompt hint on terminal and desktop: live status, warning style, survey, narrow form, docked pane and the all-done hint.

import { expect, test } from 'claude-code/testing'

import { bandLine, statusText } from './band.tsx'
import { parseChecklist } from './checklist.ts'
import { CHECKLIST_FIXTURE } from './fixtures/checklist.fixture.ts'
import { ALL_DONE, LEDGER, activeAt52, bandTarget, engineDraws, fixingWorld, hintTarget, stage, V4 } from './testing.tsx'

const SURFACES = ['terminal', 'desktop'] as const

test('the band is one line naming the active pie, slice and its status', async ($, on) => {
  const { start } = stage(on, { checklist: CHECKLIST_FIXTURE })
  engineDraws(on)
  await start($)
  for (const surface of SURFACES) {
    const ui = await $.ui.mount(bandTarget(surface))
    const lines = await ui.findAll({ type: 'Text' })
    expect(lines.map(line => line.text)).toEqual(['Pie 5 · Slice 5.1 queued'])
    await ui.unmount()
  }
})

test('the band yields to a survey', async ($, on) => {
  const { start } = stage(on, { checklist: CHECKLIST_FIXTURE })
  engineDraws(on)
  await start($)
  for (const surface of SURFACES) {
    const ui = await $.ui.mount(bandTarget(surface, 100, { hasSurvey: true }))
    expect((await ui.findAll({ type: 'Text' })).map(line => line.text)).toEqual(['engine'])
    await ui.unmount()
  }
})

test('under 60 columns the band takes the short form', async ($, on) => {
  const { start } = stage(on, { checklist: CHECKLIST_FIXTURE })
  engineDraws(on)
  await start($)
  for (const surface of SURFACES) {
    const ui = await $.ui.mount(bandTarget(surface, 59))
    expect((await ui.find({ type: 'Text' }))?.text).toBe('P5 S5.1 queued')
    await ui.unmount()
    const wide = await $.ui.mount(bandTarget(surface, 60))
    expect((await wide.find({ type: 'Text' }))?.text).toBe('Pie 5 · Slice 5.1 queued')
    await wide.unmount()
  }
})

test('with no checklist the band draws nothing of its own', async ($, on) => {
  const { start } = stage(on)
  engineDraws(on)
  await start($)
  for (const surface of SURFACES) {
    const ui = await $.ui.mount(bandTarget(surface))
    expect((await ui.find({ type: 'Text' }))?.text).toBe('engine')
    await ui.unmount()
  }
})

test('a v4 checklist shows the dim line v4 checklist', async ($, on) => {
  const { start } = stage(on, { checklist: V4 })
  engineDraws(on)
  await start($)
  for (const surface of SURFACES) {
    const ui = await $.ui.mount(bandTarget(surface))
    const line = await ui.find({ type: 'Text' })
    expect(line?.text).toBe('v4 checklist')
    expect(line?.props.dimColor).toBe(true)
    await ui.unmount()
  }
})

test('the band steps aside while the pane is docked beside a wide fullscreen terminal', async ($, on) => {
  const { world, start } = stage(on, { checklist: CHECKLIST_FIXTURE })
  engineDraws(on)
  await start($)
  expect(world.panes.map(pane => pane.id)).toEqual(['pass'])
  const docked = await $.ui.mount(bandTarget('terminal', 100, { columns: 160, isFullscreen: true }))
  expect((await docked.find({ type: 'Text' }))?.text).toBe('engine')
  await docked.unmount()
  const mainScreen = await $.ui.mount(bandTarget('terminal', 100, { columns: 160, isFullscreen: false }))
  expect((await mainScreen.find({ type: 'Text' }))?.text).toBe('Pie 5 · Slice 5.1 queued')
  await mainScreen.unmount()
  const narrow = await $.ui.mount(bandTarget('terminal', 80, { columns: 90, isFullscreen: true }))
  expect((await narrow.find({ type: 'Text' }))?.text).toBe('Pie 5 · Slice 5.1 queued')
  await narrow.unmount()
  world.panes = []
  const closed = await $.ui.mount(bandTarget('terminal', 100, { columns: 160, isFullscreen: true }))
  expect((await closed.find({ type: 'Text' }))?.text).toBe('Pie 5 · Slice 5.1 queued')
  await closed.unmount()
})

test('the status line carries P5 S5.1 ✓0/8 and follows each projection write', async ($, on) => {
  const { world, clock, start } = stage(on, { checklist: CHECKLIST_FIXTURE })
  await start($)
  expect(world.statuses).toEqual(['P5 S5.1 ✓0/8'])
  world.checklist = V4
  world.mtimeMs = 9
  await clock.advance(10000)
  await clock.settle()
  expect(world.statuses).toEqual(['P5 S5.1 ✓0/8', 'v4 checklist'])
})

test('the prompt hint says /box-it-up ready only when every slice of every pie is done and a pie branch is checked out', async ($, on) => {
  const { world, clock, start } = stage(on, { checklist: CHECKLIST_FIXTURE })
  engineDraws(on)
  await start($)
  for (const surface of SURFACES) {
    const ui = await $.ui.mount(hintTarget(surface))
    expect((await ui.find({ type: 'Text' }))?.text).toBe('engine hint: ? for shortcuts')
    await ui.unmount()
  }
  world.checklist = ALL_DONE
  world.mtimeMs = 3
  await clock.advance(10000)
  await clock.settle()
  const terminal = await $.ui.mount(hintTarget('terminal'))
  expect((await terminal.find({ type: 'Text' }))?.text).toBe('engine hint: ? for shortcuts | tail: /box-it-up ready')
  await terminal.unmount()
  const desktop = await $.ui.mount(hintTarget('desktop'))
  expect((await desktop.find({ type: 'Text' }))?.text).toBe('engine hint: ? for shortcuts · /box-it-up ready')
  await desktop.unmount()
  world.branch = 'main'
  world.mtimeMs = 4
  await clock.advance(10000)
  await clock.settle()
  const merged = await $.ui.mount(hintTarget('terminal'))
  expect((await merged.find({ type: 'Text' }))?.text).toBe('engine hint: ? for shortcuts')
  await merged.unmount()
})

test('band and status text cover every checklist state', () => {
  const c = parseChecklist(CHECKLIST_FIXTURE)
  expect(bandLine(c, 100)).toEqual({ text: 'Pie 5 · Slice 5.1 · 0/8 done', dim: false })
  expect(bandLine(null, 100)).toBeNull()
  expect(bandLine(parseChecklist(''), 100)).toBeNull()
  expect(bandLine(parseChecklist(ALL_DONE), 100, null, null, null, null, 'pie-7-done')?.text).toBe('All pies done · /box-it-up ready')
  expect(bandLine(parseChecklist(ALL_DONE), 100, null, null, null, null, 'main')?.text).toBe('All pies done')
  expect(bandLine(parseChecklist(ALL_DONE), 100)?.text).toBe('All pies done')
  expect(bandLine(parseChecklist(ALL_DONE), 40)?.text).toBe('all done')
  expect(statusText(c)).toBe('P5 S5.1 ✓0/8')
  expect(statusText(null)).toBeUndefined()
  expect(statusText(parseChecklist(ALL_DONE))).toBe('✓ all done')
})

test('with the ledger the band reads status, agents and the fix loop, in the warning style after a failed verdict', async ($, on) => {
  const { world, start } = stage(on, {
    checklist: activeAt52(CHECKLIST_FIXTURE),
    agents: [
      { id: 'fx', description: 'P5 S5.2 fix: a', type: 'bytheslice:fix-attempter', status: 'running' },
      { id: 'tt', description: 'P5 S5.2 test: b', type: 'bytheslice:slice-tester', status: 'pending' },
      { id: 'vv', description: 'P5 S5.2 verify: c', type: 'bytheslice:slice-verifier', status: 'running' },
    ],
  })
  engineDraws(on)
  fixingWorld(world)
  await start($)
  for (const surface of SURFACES) {
    const ui = await $.ui.mount(bandTarget(surface))
    const line = await ui.find({ type: 'Text' })
    expect(line?.text).toBe('Pie 5 · Slice 5.2 fixing · 3 agents · fix 1/3')
    expect(line?.props.color).toBe('warning')
    await ui.unmount()
    const narrow = await $.ui.mount(bandTarget(surface, 40))
    expect((await narrow.find({ type: 'Text' }))?.text).toBe('P5 S5.2 fixing fix 1/3')
    await narrow.unmount()
  }
})

test('a passing verdict leaves the band in its plain style', async ($, on) => {
  const { world, start } = stage(on, { checklist: activeAt52(CHECKLIST_FIXTURE) })
  engineDraws(on)
  world.files[LEDGER] = `${JSON.stringify({ v: 1, t: 1, sid: 's', ev: 'verdict', pie: 5, slice: '5.2', data: { gate: 'slice-verifier', overall: 'pass', fix_targets: [], head: 'abc1234' } })}\n`
  await start($)
  for (const surface of SURFACES) {
    const ui = await $.ui.mount(bandTarget(surface))
    const line = await ui.find({ type: 'Text' })
    expect(line?.text).toBe('Pie 5 · Slice 5.2 verifying')
    expect(line?.props.color).toBeUndefined()
    await ui.unmount()
  }
})
