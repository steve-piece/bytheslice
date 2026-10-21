// mod/band.tsx
// The Pass band above the prompt, the pinned status line and the prompt hint, all drawn from the checklist atoms.

import { atom, read } from 'claude-code'
import type { EngineInterface, RenderElement, RenderInput, RenderPropsOf } from 'claude-code'

import { activePie, activeSlice, allDone, counts } from './projection.ts'
import { PANE_ID } from './rail.tsx'
import type { PassChecklist } from './types'

const checklistAtom = atom({ plugin: 'bytheslice', key: 'pass.checklist' } as const, null)

export const NARROW_COLUMNS = 60
export const DOCK_COLUMNS = 110
export const READY = '/box-it-up ready'

export type BandLine = { text: string; dim: boolean }

/** The band's one line for a checklist at a width, or null to leave the band to the engine. */
export function bandLine(c: PassChecklist | null, bodyColumns: number): BandLine | null {
  if (!c) return null
  const narrow = bodyColumns < NARROW_COLUMNS
  if (c.layout === 'stage') return { text: 'v4 checklist', dim: true }
  if (allDone(c)) return { text: narrow ? 'all done' : `All pies done · ${READY}`, dim: false }
  const pie = activePie(c)
  const slice = activeSlice(c)
  if (!pie || !slice) return null
  const { done, total } = counts(c)
  return narrow
    ? { text: `P${pie.n} S${slice.id} ${done}/${total}`, dim: false }
    : { text: `Pie ${pie.n} · Slice ${slice.id} · ${done}/${total} done`, dim: false }
}

/** The pinned status line (`P5 S5.1 ✓0/8`), or undefined to clear it. */
export function statusText(c: PassChecklist | null): string | undefined {
  if (!c) return undefined
  if (c.layout === 'stage') return 'v4 checklist'
  if (allDone(c)) return '✓ all done'
  const pie = activePie(c)
  const slice = activeSlice(c)
  if (!pie || !slice) return undefined
  const { done, total } = counts(c)
  return `P${pie.n} S${slice.id} ✓${done}/${total}`
}

/** Pins the status line for a checklist; called after every projection write. */
export function pushStatus($: EngineInterface, c: PassChecklist | null): void {
  try {
    $.ui.status(statusText(c))
  } catch {
    // A status line that cannot be pinned is not worth failing the refresh for.
  }
}

async function paneDocked($: EngineInterface, e: RenderInput<'AbovePrompt'>): Promise<boolean> {
  if (e.surface !== 'terminal' || e.viewport?.isFullscreen !== true) return false
  if ((e.viewport.columns ?? 0) < DOCK_COLUMNS) return false
  try {
    const panes = await $.ui.panes()
    return panes.some(pane => pane.id === PANE_ID && pane.isPlaced && pane.isShown)
  } catch {
    return false
  }
}

/**
 * Draws the band, or resolves null so the hook returns `next(e)`: no checklist,
 * a survey holding the band, or the pane already docked beside a wide
 * fullscreen terminal.
 */
export async function drawBand($: EngineInterface, e: RenderInput<'AbovePrompt'>): Promise<RenderElement | null> {
  if (e.props.hasSurvey) return null
  const c = await read($, checklistAtom)
  const line = bandLine(c, e.props.bodyColumns)
  if (!line) return null
  if (await paneDocked($, e)) return null
  const { Text } = $.ui.resolve(e)
  return <Text dimColor={line.dim}>{line.text}</Text>
}

/**
 * The prompt hint's props with `/box-it-up ready` added once every slice of
 * every pie is done, or null to leave the hint as the engine has it. The
 * terminal keeps its own line and takes the words as `tail`; other surfaces
 * draw no tail yet, so there the words join the hint.
 */
export async function hintProps(
  $: EngineInterface,
  e: RenderInput<'PromptHint'>,
): Promise<RenderPropsOf['PromptHint'] | null> {
  const c = await read($, checklistAtom)
  if (!allDone(c)) return null
  if (e.surface === 'terminal') return { ...e.props, tail: READY }
  const hint = e.props.hint.trim()
  return { ...e.props, hint: hint === '' ? READY : `${hint} · ${READY}` }
}
