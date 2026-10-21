// mod/rail.test.tsx
// Unit tests for The Pass pane on terminal and desktop: pie header, slice rail with live status, agents, gates, empty, loading, v4, all-done, narrow widths and the pass command.

import { expect, test } from 'claude-code/testing'

import { CHECKLIST_FIXTURE } from './fixtures/checklist.fixture.ts'
import { paneLines, truncate } from './rail.tsx'
import { ALL_DONE, activeAt52, fixingWorld, paneTarget, stage, V4 } from './testing.tsx'

const SURFACES = ['terminal', 'desktop'] as const

test('the pane shows the active pie header and one row per slice', async ($, on) => {
  const { start } = stage(on, { checklist: CHECKLIST_FIXTURE })
  await start($)
  for (const surface of SURFACES) {
    const ui = await $.ui.mount(paneTarget(surface))
    expect((await ui.find({ type: 'Text', text: /^Pie 5/ }))?.text).toBe('Pie 5 · The Pass')
    expect((await ui.find({ type: 'Text', text: /^review:/ }))?.text).toBe('review: boundary · branch pie-5-the-pass')
    expect((await ui.find({ type: 'Text', text: /slices done$/ }))?.text).toBe('0 of 8 slices done')
    const rows = (await ui.findAll({ type: 'Text' })).filter(row => /^[▸ ] 5\.\d/.test(row.text))
    expect(rows.map(row => row.text.slice(2, 5))).toEqual(['5.1', '5.2', '5.3', '5.4', '5.5', '5.6', '5.7', '5.8'])
    expect(rows[0]?.text.startsWith('▸ 5.1 Pass pane and band')).toBe(true)
    expect(rows[0]?.text.endsWith(' queued')).toBe(true)
    expect(rows[0]?.props.bold).toBe(true)
    expect(rows.slice(1).every(row => row.text.startsWith('  '))).toBe(true)
    await ui.unmount()
  }
})

test('done slices read done and the marker moves to the first open one', async ($, on) => {
  const partly = CHECKLIST_FIXTURE.replace('### Slice 5.1 - Pass pane and band [ ]\nStatus: Not Started', '### Slice 5.1 - Pass pane and band [x]\nStatus: Completed')
  const { start } = stage(on, { checklist: partly })
  await start($)
  for (const surface of SURFACES) {
    const ui = await $.ui.mount(paneTarget(surface))
    const first = await ui.find({ type: 'Text', text: /5\.1/ })
    expect(first?.text.startsWith('  5.1')).toBe(true)
    expect(first?.text.endsWith(' done')).toBe(true)
    expect(first?.props.dimColor).toBe(true)
    expect((await ui.find({ type: 'Text', text: /^▸/ }))?.text.startsWith('▸ 5.2')).toBe(true)
    expect((await ui.find({ type: 'Text', text: /slices done$/ }))?.text).toBe('1 of 8 slices done')
    await ui.unmount()
  }
})

test('with no checklist the pane is one dim line pointing at /cook-pizzas', async ($, on) => {
  const { start } = stage(on)
  await start($)
  for (const surface of SURFACES) {
    const ui = await $.ui.mount(paneTarget(surface))
    const lines = await ui.findAll({ type: 'Text' })
    expect(lines).toHaveLength(1)
    expect(lines[0]?.text).toContain('/cook-pizzas')
    expect(lines[0]?.props.dimColor).toBe(true)
    await ui.unmount()
  }
})

test('before the first read the pane says it is loading', async ($, on) => {
  stage(on, { checklist: CHECKLIST_FIXTURE })
  for (const surface of SURFACES) {
    const ui = await $.ui.mount(paneTarget(surface))
    expect((await ui.findAll({ type: 'Text' })).map(line => line.text)).toEqual(['Loading the checklist…'])
    await ui.unmount()
  }
})

test('a v4 checklist and a finished roadmap each get their own state', async ($, on) => {
  const { world, clock, start } = stage(on, { checklist: V4 })
  await start($)
  for (const surface of SURFACES) {
    const ui = await $.ui.mount(paneTarget(surface))
    expect((await ui.find({ type: 'Text' }))?.text).toContain('v4 checklist')
    await ui.unmount()
  }
  world.checklist = ALL_DONE
  world.mtimeMs = 5
  await clock.advance(10000)
  await clock.settle()
  for (const surface of SURFACES) {
    const ui = await $.ui.mount(paneTarget(surface))
    const texts = (await ui.findAll({ type: 'Text' })).map(line => line.text)
    expect(texts).toContain('All pies done')
    expect(texts).toContain('/box-it-up ready')
    await ui.unmount()
  }
})

test('narrow bodyColumns truncate names and no line runs past the width', async ($, on) => {
  const { start } = stage(on, { checklist: CHECKLIST_FIXTURE })
  await start($)
  for (const surface of SURFACES) {
    const ui = await $.ui.mount(paneTarget(surface, 22))
    const texts = (await ui.findAll({ type: 'Text' })).map(line => line.text)
    expect(texts.every(text => Array.from(text).length <= 22)).toBe(true)
    const row = texts.find(text => text.startsWith('▸ 5.1'))
    expect(row).toBe('▸ 5.1 Pass pan… queued')
    expect(texts.find(text => text.includes('5.7'))).toBe('  5.7 Review,…  queued')
    await ui.unmount()
  }
})

test('truncate cuts by characters and marks the cut', () => {
  expect(truncate('Pass pane and band', 9)).toBe('Pass pan…')
  expect(truncate('short', 9)).toBe('short')
  expect(truncate('abc', 1)).toBe('…')
  expect(truncate('abc', 0)).toBe('')
  expect(truncate('Pass pane and band', 11)).toBe('Pass pane…')
})

test('paneLines draws from atoms alone and never needs the disk', () => {
  expect(paneLines({ checklist: null, loadedAt: 0, branch: null }, 40)[0]?.text).toBe('Loading the checklist…')
  const empty = paneLines({ checklist: { pies: [], prep: null, layout: 'empty' }, loadedAt: 1, branch: 'main' }, 40)
  expect(empty.map(line => line.text)).toEqual(['The checklist has no pies yet.'])
})

// The person typing the pass command at the prompt, as the engine raises it.
const TYPED = {
  command: 'pass',
  args: '',
  origin: { kind: 'composer' as const },
  presentation: { isFullscreen: true, columns: 160 },
}

test('the pass command opens the pane, and closes it while it shows', async ($, on) => {
  const { world, start } = stage(on)
  await start($)
  expect(world.panes).toEqual([])
  const opened = await $.command.run(TYPED)
  expect(opened.text).toBe('The Pass pane opened.')
  expect(world.panes.map(pane => pane.id)).toEqual(['pass'])
  const closed = await $.command.run(TYPED)
  expect(closed.text).toBe('The Pass pane closed.')
  expect(world.panes).toEqual([])
  expect(world.closed).toBe(1)
})

const LIVE_AGENTS = [
  { id: 'fx', description: 'P5 S5.2 fix: a', type: 'bytheslice:fix-attempter', status: 'running' as const },
  { id: 'tt', description: 'P5 S5.2 test: b', type: 'bytheslice:slice-tester', status: 'running' as const },
  { id: 'dd', description: 'P5 S5.2 prep: c', type: 'bytheslice:discovery', status: 'completed' as const },
]

test('rail rows carry live status and the last verdict; agents and gates sections follow', async ($, on) => {
  const { world, start } = stage(on, { checklist: activeAt52(CHECKLIST_FIXTURE), agents: LIVE_AGENTS })
  fixingWorld(world)
  await start($)
  for (const surface of SURFACES) {
    const ui = await $.ui.mount(paneTarget(surface, 80))
    const texts = (await ui.findAll({ type: 'Text' })).map(line => line.text)
    expect(texts.find(text => text.startsWith('▸ 5.2'))?.endsWith('fixing (1/3) · verifier fail')).toBe(true)
    expect(texts.find(text => text.startsWith('  5.1'))?.endsWith(' done')).toBe(true)
    expect(texts.find(text => text.startsWith('  5.3'))?.endsWith(' queued')).toBe(true)
    expect(texts).toContain('Agents · 2 live')
    expect(texts).toContain('  fix-attempter · running · 0s')
    expect(texts).toContain('  slice-tester · running · 0s')
    expect(texts.some(text => text.includes('discovery'))).toBe(false)
    expect(texts).toContain('Gates · 5.2')
    expect(texts).toContain('  tester pass · a1b2c3d')
    expect(texts).toContain('  verifier fail · a1b2c3d')
    expect(texts).toContain('    implementer | mod/a.ts | typecheck: x')
    const failed = await ui.find({ type: 'Text', text: /^ {2}verifier fail/ })
    expect(failed?.props.color).toBe('warning')
    await ui.unmount()
  }
})

test('the agents section matches the agent list as it changes', async ($, on) => {
  const { world, clock, start } = stage(on, { checklist: CHECKLIST_FIXTURE })
  await start($)
  for (const surface of SURFACES) {
    const ui = await $.ui.mount(paneTarget(surface))
    expect((await ui.findAll({ type: 'Text' })).map(line => line.text)).toContain('No live agents')
    await ui.unmount()
  }
  world.agents = LIVE_AGENTS
  await clock.advance(5000)
  await clock.settle()
  for (const surface of SURFACES) {
    const ui = await $.ui.mount(paneTarget(surface))
    const texts = (await ui.findAll({ type: 'Text' })).map(line => line.text)
    expect(texts).toContain('Agents · 2 live')
    expect(texts.filter(text => / · running · /.test(text))).toHaveLength(2)
    await ui.unmount()
  }
})
