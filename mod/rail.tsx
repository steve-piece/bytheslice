// mod/rail.tsx
// The Pass pane: pie header and slice rail of the active pie, drawn read-only from the checklist atoms, plus the pass command's toggle.

import { atom, read } from 'claude-code'
import type { EngineInterface, RenderElement, RenderInput } from 'claude-code'

import { activePie, activeSlice, allDone, counts } from './projection.ts'
import type { PassChecklist } from './types'

const checklistAtom = atom({ plugin: 'bytheslice', key: 'pass.checklist' } as const, null)
const loadedAtAtom = atom({ plugin: 'bytheslice', key: 'pass.loadedAt' } as const, 0)
const branchAtom = atom({ plugin: 'bytheslice', key: 'pass.branch' } as const, null)

export const PANE_ID = 'pass'
export const PANE_TITLE = 'The Pass'
export const COMMAND = 'pass'

export type PaneLine = { text: string; dim?: boolean; bold?: boolean }

export type PaneView = {
  checklist: PassChecklist | null
  loadedAt: number
  branch: string | null
}

/** Cuts text to `width` cells, ending a cut with an ellipsis. */
export function truncate(text: string, width: number): string {
  const chars = Array.from(text)
  if (width <= 0) return ''
  if (chars.length <= width) return text
  if (width === 1) return '…'
  return `${chars.slice(0, width - 1).join('').trimEnd()}…`
}

const fit = (line: PaneLine, columns: number): PaneLine => ({ ...line, text: truncate(line.text, columns) })

function sliceRows(c: PassChecklist, columns: number): PaneLine[] {
  const pie = activePie(c)
  if (!pie) return []
  const current = activeSlice(c)
  const idWidth = Math.max(...pie.slices.map(slice => Array.from(slice.id).length))
  const longest = Math.max(...pie.slices.map(slice => Array.from(slice.name).length))
  return pie.slices.map(slice => {
    const mark = slice.id === current?.id ? '▸' : ' '
    const state = slice.done ? 'done' : 'open'
    const prefix = `${mark} ${slice.id.padEnd(idWidth)} `
    const room = columns - Array.from(prefix).length - state.length - 1
    const name = truncate(slice.name, Math.min(room, longest))
    const padded = name + ' '.repeat(Math.max(0, Math.min(room, longest) - Array.from(name).length))
    const text = room > 0 ? `${prefix}${padded} ${state}` : `${prefix}${state}`
    return { text, dim: slice.done, bold: slice.id === current?.id }
  })
}

/** Every line the pane shows, top to bottom, sized to `columns`. */
export function paneLines(view: PaneView, columns: number): PaneLine[] {
  const { checklist: c, loadedAt, branch } = view
  const width = Math.max(1, columns)
  if (c === null && loadedAt <= 0) return [fit({ text: 'Loading the checklist…', dim: true }, width)]
  if (c === null) {
    return [fit({ text: 'No checklist yet. Run /cook-pizzas to plan the pies.', dim: true }, width)]
  }
  if (c.layout === 'stage') {
    return [fit({ text: 'v4 checklist: run /cook-pizzas --repie to see pies here.', dim: true }, width)]
  }
  if (c.layout === 'empty') return [fit({ text: 'The checklist has no pies yet.', dim: true }, width)]
  const where = branch === null ? null : fit({ text: `branch ${branch}`, dim: true }, width)
  if (allDone(c)) {
    return [
      fit({ text: 'All pies done', bold: true }, width),
      ...(where ? [where] : []),
      fit({ text: '/box-it-up ready' }, width),
    ]
  }
  const pie = activePie(c)
  if (!pie) return [fit({ text: 'No open slices in the checklist.', dim: true }, width)]
  const { done, total } = counts(c)
  const mode = `review: ${pie.review}${branch === null ? '' : ` · branch ${branch}`}`
  return [
    fit({ text: `Pie ${pie.n} · ${pie.name}`, bold: true }, width),
    fit({ text: mode, dim: true }, width),
    fit({ text: `${done} of ${total} slices done` }, width),
    ...sliceRows(c, width),
  ]
}

/** Draws the pane from the atoms alone: it never writes and never touches the disk. */
export async function drawPane($: EngineInterface, e: RenderInput<'Pane'>): Promise<RenderElement> {
  const [checklist, loadedAt, branch] = await Promise.all([
    read($, checklistAtom),
    read($, loadedAtAtom),
    read($, branchAtom),
  ])
  const lines = paneLines({ checklist, loadedAt, branch }, e.props.bodyColumns)
  const { Box, Text } = $.ui.resolve(e)
  return (
    <Box flexDirection="column">
      {lines.map(line => (
        <Text dimColor={line.dim === true} bold={line.bold === true}>
          {line.text}
        </Text>
      ))}
    </Box>
  )
}

/** Opens the pane; resolves whether a surface placed it, and why not. */
export async function openPane($: EngineInterface): Promise<{ isPlaced: boolean; reason?: string }> {
  return $.ui.open({ id: PANE_ID, title: PANE_TITLE })
}

/** The pass command: closes the pane while it shows, opens it otherwise. Resolves the command's output line. */
export async function togglePane($: EngineInterface): Promise<string> {
  const panes = await $.ui.panes().catch(() => [])
  const shown = panes.find(pane => pane.id === PANE_ID)
  if (shown && shown.isShown && shown.isPlaced) {
    await $.ui.close({ id: PANE_ID })
    return 'The Pass pane closed.'
  }
  const opened = await openPane($)
  return opened.isPlaced ? 'The Pass pane opened.' : `The Pass pane is open and waits to be drawn: ${opened.reason ?? 'no surface placed it'}.`
}
