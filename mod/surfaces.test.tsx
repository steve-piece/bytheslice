// mod/surfaces.test.tsx
// Surface sweep for the Pass: the pane, band and hint drawn against all four surface element tables (terminal, desktop, vscode, mobile).

import { expect, test } from 'claude-code/testing'

import { CHECKLIST_FIXTURE } from './fixtures/checklist.fixture.ts'
import { ALL_DONE, bandTarget, engineDraws, hintTarget, paneTarget, stage } from './testing.tsx'

// Every element the Pass draws (Box, Text) is in all four surface tables, so each
// drawing is checked against each table. In a session the engine raises Pane on every
// attached surface but AbovePrompt and PromptHint on terminal and desktop only (the
// 2.1.304 declarations say so), so the vscode and mobile band and hint rows below prove
// the trees validate there, not that a session shows them.
const SURFACES = ['terminal', 'desktop', 'vscode', 'mobile'] as const

test('the pane draws the same rows on every surface', async ($, on) => {
  const { start } = stage(on, { checklist: CHECKLIST_FIXTURE })
  await start($)
  const drawn: string[][] = []
  for (const surface of SURFACES) {
    const ui = await $.ui.mount(paneTarget(surface))
    const texts = (await ui.findAll({ type: 'Text' })).map(line => line.text)
    expect(texts[0]).toBe('Pie 5 · The Pass')
    expect(texts.filter(text => /^[▸ ] 5\.\d/.test(text))).toHaveLength(8)
    drawn.push(texts)
    await ui.unmount()
  }
  for (const texts of drawn) expect(texts).toEqual(drawn[0])
})

test('the band and the hint trees validate on every surface table', async ($, on) => {
  const { world, clock, start } = stage(on, { checklist: CHECKLIST_FIXTURE })
  engineDraws(on)
  await start($)
  for (const surface of SURFACES) {
    const band = await $.ui.mount(bandTarget(surface))
    expect((await band.find({ type: 'Text' }))?.text).toBe('Pie 5 · Slice 5.1 queued')
    await band.unmount()
  }
  world.checklist = ALL_DONE
  world.mtimeMs = 7
  await clock.advance(10000)
  await clock.settle()
  for (const surface of SURFACES) {
    const hint = await $.ui.mount(hintTarget(surface))
    expect((await hint.find({ type: 'Text' }))?.text).toContain('/box-it-up ready')
    await hint.unmount()
  }
})
