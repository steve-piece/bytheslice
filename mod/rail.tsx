// mod/rail.tsx
// The Pass pane: pie header, slice rail with live status and last verdict, live agents, gates and check warnings, drawn from atoms only, plus the pass command's toggle and checks text.

import { atom, read } from 'claude-code'
import type { EngineInterface, RenderElement, RenderInput } from 'claude-code'

import { FIX_CAP, findSlice } from './ledger-projection.ts'
import { activePie, activeSlice, allDone, counts } from './projection.ts'
import type { PassChecklist, PassFinding, PassLive, PassProjection, PassSliceView } from './types'

const checklistAtom = atom({ plugin: 'bytheslice', key: 'pass.checklist' } as const, null)
const loadedAtAtom = atom({ plugin: 'bytheslice', key: 'pass.loadedAt' } as const, 0)
const branchAtom = atom({ plugin: 'bytheslice', key: 'pass.branch' } as const, null)
const ledgerAtom = atom({ plugin: 'bytheslice', key: 'pass.ledger' } as const, null)
const liveAtom = atom({ plugin: 'bytheslice', key: 'pass.live' } as const, { at: 0, agents: [] })

export const PANE_ID = 'pass'
export const PANE_TITLE = 'The Pass'
export const COMMAND = 'pass'
/** Fix targets the gates section lists under a failed verdict. */
export const PANE_TARGETS = 3

export type PaneLine = { text: string; dim?: boolean; bold?: boolean; warn?: boolean }

export type PaneView = {
  checklist: PassChecklist | null
  loadedAt: number
  branch: string | null
  ledger?: PassProjection | null
  live?: PassLive
  /** The time ages are counted to; the projection's own time when left out. */
  now?: number
}

const ACTIVE = new Set(['pending', 'running', 'waiting'])

/** Cuts text to `width` cells, ending a cut with an ellipsis. */
export function truncate(text: string, width: number): string {
  const chars = Array.from(text)
  if (width <= 0) return ''
  if (chars.length <= width) return text
  if (width === 1) return '…'
  return `${chars.slice(0, width - 1).join('').trimEnd()}…`
}

const fit = (line: PaneLine, columns: number): PaneLine => ({ ...line, text: truncate(line.text, columns) })

const gateWord = (gate: string): string => (gate === 'slice-tester' ? 'tester' : 'verifier')

/** A duration as `45s`, `12m` or `2h 05m`. */
export function runningFor(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`
}

/** A rail row's state words: the status (`fixing (n/3)` while fixing) and the last verdict beside it. */
export function stateWords(view: PassSliceView | null, done: boolean): string {
  if (!view) return done ? 'done' : 'queued'
  const status = view.status === 'fixing' ? `fixing (${view.fixLoop}/${FIX_CAP})` : view.status
  let last = null as PassSliceView['verdicts'][number] | null
  for (const verdict of view.verdicts) if (last === null || verdict.t >= last.t) last = verdict
  return last ? `${status} · ${gateWord(last.gate)} ${last.overall}` : status
}

function sliceRows(c: PassChecklist, ledger: PassProjection | null, columns: number): PaneLine[] {
  const pie = activePie(c)
  if (!pie) return []
  const current = activeSlice(c)
  const idWidth = Math.max(...pie.slices.map(slice => Array.from(slice.id).length))
  const longest = Math.max(...pie.slices.map(slice => Array.from(slice.name).length))
  return pie.slices.map(slice => {
    const view = findSlice(ledger, slice.id)
    const mark = slice.id === current?.id ? '▸' : ' '
    const state = stateWords(view, slice.done)
    const prefix = `${mark} ${slice.id.padEnd(idWidth)} `
    const room = columns - Array.from(prefix).length - Array.from(state).length - 1
    const name = truncate(slice.name, Math.min(room, longest))
    const padded = name + ' '.repeat(Math.max(0, Math.min(room, longest) - Array.from(name).length))
    const text = room > 0 ? `${prefix}${padded} ${state}` : `${prefix}${state}`
    const failed = view?.verdicts.some(verdict => verdict.overall === 'fail') === true && view.status === 'fixing'
    return fit({ text, dim: slice.done, bold: slice.id === current?.id, warn: failed }, columns)
  })
}

function agentRows(live: PassLive | undefined, columns: number): PaneLine[] {
  const running = (live?.agents ?? []).filter(agent => ACTIVE.has(agent.status))
  if (running.length === 0) return [fit({ text: 'No live agents', dim: true }, columns)]
  return [
    fit({ text: `Agents · ${running.length} live`, bold: true }, columns),
    ...running.map(agent =>
      fit({ text: `  ${agent.role} · ${agent.status} · ${runningFor((live?.at ?? 0) - agent.startedAt)}` }, columns),
    ),
  ]
}

function gateRows(view: PassSliceView | null, columns: number): PaneLine[] {
  if (!view || view.verdicts.length === 0) return []
  const rows: PaneLine[] = [fit({ text: `Gates · ${view.id}`, bold: true }, columns)]
  for (const verdict of view.verdicts) {
    const head = verdict.head ? ` · ${verdict.head.slice(0, 7)}` : ''
    rows.push(fit({ text: `  ${gateWord(verdict.gate)} ${verdict.overall}${head}`, warn: verdict.overall === 'fail' }, columns))
    if (verdict.overall !== 'fail') continue
    for (const target of verdict.fixTargets.slice(0, PANE_TARGETS)) rows.push(fit({ text: `    ${target}`, dim: true }, columns))
    if (verdict.fixTargets.length > PANE_TARGETS) {
      rows.push(fit({ text: `    and ${verdict.fixTargets.length - PANE_TARGETS} more`, dim: true }, columns))
    }
  }
  return rows
}

/** One finding as the pane and the pass checks command list it: `code · slice · age ago`. */
export function findingLine(finding: PassFinding, now: number): string {
  return `${finding.code} · ${finding.slice ?? 'no slice'} · ${runningFor(now - finding.t)} ago`
}

function findingRows(ledger: PassProjection | null, now: number, columns: number): PaneLine[] {
  if (!ledger) return []
  const findings = ledger.findings ?? []
  if (findings.length === 0) return [fit({ text: 'Warnings · none', dim: true }, columns)]
  return [
    fit({ text: `Warnings · ${findings.length} latest`, bold: true }, columns),
    ...findings.map(finding => fit({ text: `  ${findingLine(finding, now)}`, warn: true }, columns)),
  ]
}

/**
 * The pass checks command's text: the same findings the pane lists, newest
 * first, each with what it said. Every check warns; none ever blocked.
 */
export function checksText(ledger: PassProjection | null, now: number): string {
  const findings = ledger?.findings ?? []
  if (findings.length === 0) return 'Pass checks: no warnings in the ledger. Every check warns; nothing is ever blocked.'
  const lines = [`Pass checks: the latest ${findings.length} warning${findings.length === 1 ? '' : 's'}, newest first. Nothing was blocked.`]
  for (const finding of findings) {
    lines.push(`  ${findingLine(finding, now)}`)
    if (finding.text !== '') lines.push(`    ${finding.text}`)
  }
  return lines.join('\n')
}

/** Every line the pane shows, top to bottom, sized to `columns`. */
export function paneLines(view: PaneView, columns: number): PaneLine[] {
  const { checklist: c, loadedAt, branch } = view
  const ledger = view.ledger ?? null
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
  const now = view.now ?? ledger?.at ?? 0
  if (allDone(c)) {
    return [
      fit({ text: 'All pies done', bold: true }, width),
      ...(where ? [where] : []),
      fit({ text: '/box-it-up ready' }, width),
      ...findingRows(ledger, now, width),
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
    ...sliceRows(c, ledger, width),
    ...agentRows(view.live, width),
    ...gateRows(findSlice(ledger, activeSlice(c)?.id), width),
    ...findingRows(ledger, now, width),
  ]
}

/** Draws the pane from the atoms alone: it never writes and never touches the disk. */
export async function drawPane($: EngineInterface, e: RenderInput<'Pane'>): Promise<RenderElement> {
  const [checklist, loadedAt, branch, ledger, live] = await Promise.all([
    read($, checklistAtom),
    read($, loadedAtAtom),
    read($, branchAtom),
    read($, ledgerAtom),
    read($, liveAtom),
  ])
  let now = ledger?.at ?? 0
  try {
    now = await $.clock.now()
  } catch {
    // Ages count to the projection's time.
  }
  const lines = paneLines({ checklist, loadedAt, branch, ledger, live, now }, e.props.bodyColumns)
  const { Box, Text } = $.ui.resolve(e)
  return (
    <Box flexDirection="column">
      {lines.map(line =>
        line.warn === true ? (
          <Text color="warning" bold={line.bold === true}>
            {line.text}
          </Text>
        ) : (
          <Text dimColor={line.dim === true} bold={line.bold === true}>
            {line.text}
          </Text>
        ),
      )}
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
