// mod/checklist.test.ts
// Unit tests for the Pass checklist parser: pinned fixture counts, review modes, Prep, v4 and malformed input.

import { expect, test } from 'claude-code/testing'

import { parseChecklist } from './checklist.ts'
import { CHECKLIST_FIXTURE } from './fixtures/checklist.fixture.ts'

test('the pinned fixture parses to six pies and twenty slices', () => {
  const c = parseChecklist(CHECKLIST_FIXTURE)
  expect(c.layout).toBe('pie')
  expect(c.pies.map(pie => pie.n)).toEqual([1, 2, 3, 4, 5, 6])
  expect(c.pies.map(pie => pie.slices.length)).toEqual([3, 2, 2, 3, 8, 2])
  expect(c.pies.map(pie => pie.done)).toEqual([true, true, true, true, false, false])
  expect(c.pies.flatMap(pie => pie.slices).filter(slice => slice.done)).toHaveLength(10)
})

test('names, ids and review modes come from the headings and annotations', () => {
  const c = parseChecklist(CHECKLIST_FIXTURE)
  expect(c.pies[0]).toMatchObject({ n: 1, name: 'Foundations', review: 'boundary' })
  expect(c.pies[2]).toMatchObject({ n: 3, name: 'Native Agent Registration', review: 'continuous' })
  expect(c.pies[4]?.name).toBe('The Pass')
  expect(c.pies[4]?.slices[0]).toEqual({ id: '5.1', name: 'Pass pane and band', done: false })
  expect(c.pies[0]?.slices[1]?.id).toBe('1.2')
})

test('Prep bare lines count as Pie 1 slices and as the Prep tally', () => {
  const c = parseChecklist(CHECKLIST_FIXTURE)
  expect(c.prep).toEqual({ done: 3, total: 3 })
  const open = parseChecklist('## Prep - Pie 1: Foundations\n[x] Slice 1.1 - Built\n[ ] Slice 1.2 - Not yet\n')
  expect(open.prep).toEqual({ done: 1, total: 2 })
  expect(open.pies[0]?.slices.map(slice => slice.done)).toEqual([true, false])
})

test('a heading inside a code fence is never parsed', () => {
  const c = parseChecklist(CHECKLIST_FIXTURE)
  expect(c.pies.some(pie => pie.n === 9)).toBe(false)
})

test('a later Status line overrides the pie header, and done slices close the pie again', () => {
  const c = parseChecklist('## Pie 4 - Live [x]\nStatus: All slices complete.\n### Slice 4.1 - A [x]\n### Slice 4.2 - B [ ]\n')
  expect(c.pies[0]?.done).toBe(false)
  const closed = parseChecklist('## Pie 4 - Live [ ]\n### Slice 4.1 - A [x]\n### Slice 4.2 - B\nStatus: Completed\n')
  expect(closed.pies[0]?.done).toBe(true)
})

test('a malformed heading is skipped, never thrown', () => {
  const c = parseChecklist('## Pie X - No number\n### Slice five - No id [x]\n## Pie 2 - Two [ ]\n### Slice 2.1 - Real [ ]\n')
  expect(c.pies.map(pie => pie.n)).toEqual([2])
  expect(c.pies[0]?.slices.map(slice => slice.id)).toEqual(['2.1'])
  expect(parseChecklist(undefined as unknown as string)).toEqual({ pies: [], prep: null, layout: 'empty' })
})

test('a flat v4 stage checklist gives no pies and says so', () => {
  const c = parseChecklist('## Prep\n- [x] Design system\n## Stage 1 - Foundations [x]\n## Stage 2 - Work [ ]\n')
  expect(c.layout).toBe('stage')
  expect(c.pies).toEqual([])
  expect(c.prep).toEqual({ done: 1, total: 1 })
})

test('an empty file gives an empty checklist', () => {
  expect(parseChecklist('')).toEqual({ pies: [], prep: null, layout: 'empty' })
  expect(parseChecklist('# Title only\n\nSome words.\n').layout).toBe('empty')
})
