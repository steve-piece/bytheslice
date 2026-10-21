// mod/band.tsx
// The Pass band above the prompt (live slice status, agents, fix loop, warning style on a failed verdict or a check warning), the pinned status line and the prompt hint.

import { atom, read } from 'claude-code'
import type { EngineInterface, RenderElement, RenderInput, RenderPropsOf } from 'claude-code'

import { FIX_CAP, findSlice, lastVerdict } from './ledger-projection.ts'
import { activePie, activeSlice, allDone, counts } from './projection.ts'
import { PANE_ID } from './rail.tsx'
import type { PassChecklist, PassLive, PassProjection, PassWarning } from './types'

const checklistAtom = atom({ plugin: 'bytheslice', key: 'pass.checklist' } as const, null)
const ledgerAtom = atom({ plugin: 'bytheslice', key: 'pass.ledger' } as const, null)
const liveAtom = atom({ plugin: 'bytheslice', key: 'pass.live' } as const, { at: 0, agents: [] })
const warningAtom = atom({ plugin: 'bytheslice', key: 'pass.warning' } as const, null)

export const NARROW_COLUMNS = 60
export const DOCK_COLUMNS = 110
export const READY = '/box-it-up ready'

export type BandLine = { text: string; dim: boolean; warn?: boolean }

const ACTIVE = new Set(['pending', 'running', 'waiting'])

/**
 * The band's one line for a checklist at a width, or null to leave the band to
 * the engine. With the ledger it reads `Pie 5 · Slice 5.2 verifying · 3 agents
 * · fix 1/3`, in the warning style while the slice's latest verdict failed,
 * and for five minutes after a check warning, which it then names.
 */
export function bandLine(
  c: PassChecklist | null,
  bodyColumns: number,
  ledger: PassProjection | null = null,
  live: PassLive | null = null,
  warning: PassWarning | null = null,
): BandLine | null {
  if (!c) return null
  const narrow = bodyColumns < NARROW_COLUMNS
  if (c.layout === 'stage') return { text: 'v4 checklist', dim: true }
  if (allDone(c)) return { text: narrow ? 'all done' : `All pies done · ${READY}`, dim: false }
  const pie = activePie(c)
  const slice = activeSlice(c)
  if (!pie || !slice) return null
  if (!ledger) {
    const { done, total } = counts(c)
    return narrow
      ? { text: `P${pie.n} S${slice.id} ${done}/${total}`, dim: false }
      : { text: `Pie ${pie.n} · Slice ${slice.id} · ${done}/${total} done`, dim: false }
  }
  const view = findSlice(ledger, slice.id)
  const status = view?.status ?? 'queued'
  const agents = (live?.agents ?? []).filter(agent => ACTIVE.has(agent.status)).length
  const fix = view?.fixLoop ?? 0
  const warn = lastVerdict(view)?.overall === 'fail' || warning !== null
  if (narrow) {
    const tail = fix > 0 ? ` fix ${fix}/${FIX_CAP}` : ''
    return { text: `P${pie.n} S${slice.id} ${status}${tail}`, dim: false, warn }
  }
  const parts = [`Pie ${pie.n} · Slice ${slice.id} ${status}`]
  if (agents > 0) parts.push(`${agents} agent${agents === 1 ? '' : 's'}`)
  if (fix > 0) parts.push(`fix ${fix}/${FIX_CAP}`)
  if (warning !== null) parts.push(`warn ${warning.code}`)
  return { text: parts.join(' · '), dim: false, warn }
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
  const [c, ledger, live, warning] = await Promise.all([
    read($, checklistAtom),
    read($, ledgerAtom),
    read($, liveAtom),
    read($, warningAtom),
  ])
  const line = bandLine(c, e.props.bodyColumns, ledger, live, warning)
  if (!line) return null
  if (await paneDocked($, e)) return null
  const { Text } = $.ui.resolve(e)
  return line.warn === true ? <Text color="warning">{line.text}</Text> : <Text dimColor={line.dim}>{line.text}</Text>
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
