// mod/rail.tsx
// The Pass pane: pie header, slice rail with live status and last verdict, live agents with stall flags, gates, touched files (red after a builder edit past the verifier's pass) and check warnings, the HITL inbox, the team roster in team mode, the other live sessions of the project (read-only), drawn from atoms only, plus the pass command's toggle and checks text.

import { atom, read } from 'claude-code'
import type { EngineInterface, RenderElement, RenderInput } from 'claude-code'

import { markAnswered } from './hitl.ts'
import { FIX_CAP, findSlice } from './ledger-projection.ts'
import { activePie, activeSlice, allDone, counts } from './projection.ts'
import { bakersWord } from './team.ts'
import { STRIP_SHOWN, stripLine } from './strip.ts'
import type { StripOther } from './strip.ts'
import { TOUCHED_SHOWN } from './touched.ts'
import type { PassBaker, PassChecklist, PassFinding, PassHitlItem, PassLive, PassProjection, PassSliceView, PassTeam, PassTouched } from './types'
import { stalledIds } from './watchdog-actions.ts'

const checklistAtom = atom({ plugin: 'bytheslice', key: 'pass.checklist' } as const, null)
const loadedAtAtom = atom({ plugin: 'bytheslice', key: 'pass.loadedAt' } as const, 0)
const branchAtom = atom({ plugin: 'bytheslice', key: 'pass.branch' } as const, null)
const ledgerAtom = atom({ plugin: 'bytheslice', key: 'pass.ledger' } as const, null)
const liveAtom = atom({ plugin: 'bytheslice', key: 'pass.live' } as const, { at: 0, agents: [] })
const seenAtom = atom({ plugin: 'bytheslice', key: 'pass.seen' } as const, {})
const stallsAtom = atom({ plugin: 'bytheslice', key: 'pass.stalls' } as const, { agents: {}, counts: {} })
const teamAtom = atom({ plugin: 'bytheslice', key: 'pass.team' } as const, { at: 0, bakers: [] })
const stripAtom = atom({ plugin: 'bytheslice', key: 'pass.strip' } as const, [])
const touchedAtom = atom({ plugin: 'bytheslice', key: 'pass.touched' } as const, { slice: null, files: [], at: 0 })

export const PANE_ID = 'pass'
export const PANE_TITLE = 'The Pass'
export const COMMAND = 'pass'
/** Fix targets the gates section lists under a failed verdict. */
export const PANE_TARGETS = 3

/** The label of each inbox item's button; the real answer stays in chat. */
export const ANSWER_LABEL = 'Mark answered'

/** One pane row: a line of text, or with `answer` the button that marks that HITL id answered. */
export type PaneLine = { text: string; dim?: boolean; bold?: boolean; warn?: boolean; stale?: boolean; answer?: string }

export type PaneView = {
  checklist: PassChecklist | null
  loadedAt: number
  branch: string | null
  ledger?: PassProjection | null
  live?: PassLive
  /** Agents the watchdog flags as stalled right now. */
  stalled?: ReadonlySet<string>
  /** The team roster; its section shows only while it has a baker. */
  team?: PassTeam
  /** The active slice's touched files; the section shows only for the active slice. */
  touched?: PassTouched
  /** Other live sessions of the same project, newest first; read-only. */
  strip?: StripOther[]
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

function agentRows(live: PassLive | undefined, stalled: ReadonlySet<string>, columns: number): PaneLine[] {
  // Teammates have their own section below.
  const running = (live?.agents ?? []).filter(agent => ACTIVE.has(agent.status) && agent.teammateId === undefined)
  if (running.length === 0) return [fit({ text: 'No live agents', dim: true }, columns)]
  return [
    fit({ text: `Agents · ${running.length} live`, bold: true }, columns),
    ...running.map(agent => {
      const flag = stalled.has(agent.id) ? ' · stalled' : ''
      const text = `  ${agent.role} · ${agent.status} · ${runningFor((live?.at ?? 0) - agent.startedAt)}${flag}`
      return fit({ text, ...(flag === '' ? {} : { warn: true }) }, columns)
    }),
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

/** One touched file's row: numstat, path, the roles that edited it, and `after pass` when stale. */
export function touchedLine(file: PassTouched['files'][number]): string {
  const roles = file.roles.length === 0 ? '' : ` · ${file.roles.join(', ')}`
  return `  +${file.added} -${file.removed} ${file.path}${roles}${file.stale ? ' · after pass' : ''}`
}

/** The touched-files section for the active slice: a builder edit after the verifier's pass is red, since it invalidates that verdict. */
function touchedRows(touched: PassTouched | undefined, slice: string | undefined, columns: number): PaneLine[] {
  if (!touched || slice === undefined || touched.slice !== slice || touched.files.length === 0) return []
  const stale = touched.files.filter(file => file.stale).length
  const count = `${touched.files.length} file${touched.files.length === 1 ? '' : 's'}`
  const rows: PaneLine[] = [
    fit({ text: `Touched · ${slice} · ${count}${stale > 0 ? ` · ${stale} after the pass` : ''}`, bold: true, ...(stale > 0 ? { stale: true } : {}) }, columns),
  ]
  // Stale files first, so a narrow pane still shows what invalidates the verdict.
  const ordered = [...touched.files].sort((a, b) => Number(b.stale) - Number(a.stale))
  for (const file of ordered.slice(0, TOUCHED_SHOWN)) {
    rows.push(fit({ text: touchedLine(file), ...(file.stale ? { stale: true } : { dim: file.roles.length === 0 }) }, columns))
  }
  if (ordered.length > TOUCHED_SHOWN) rows.push(fit({ text: `  and ${ordered.length - TOUCHED_SHOWN} more`, dim: true }, columns))
  return rows
}

/** The roadmap strip: where the project's other live sessions stand, read-only, newest first. */
function stripRows(strip: StripOther[] | undefined, now: number, columns: number): PaneLine[] {
  const others = strip ?? []
  if (others.length === 0) return []
  const rows: PaneLine[] = [fit({ text: `Other sessions · ${others.length}`, dim: true }, columns)]
  for (const other of others.slice(0, STRIP_SHOWN)) rows.push(fit({ text: `  ${stripLine(other.entry, now)}`, dim: true }, columns))
  if (others.length > STRIP_SHOWN) rows.push(fit({ text: `  and ${others.length - STRIP_SHOWN} more`, dim: true }, columns))
  return rows
}

/** One baker's pane row: name, pie, running or idle, turns, and the age of its last activity. */
export function bakerRow(baker: PassBaker, now: number): string {
  const pie = baker.pie === null ? 'no pie' : `Pie ${baker.pie}`
  return `  ${baker.name} · ${pie} · ${baker.status} · ${baker.turns} turn${baker.turns === 1 ? '' : 's'} · ${runningFor(now - baker.lastT)}`
}

/** The team section: only while the roster has a baker, its count then one row each. */
function teamRows(team: PassTeam | undefined, stalled: ReadonlySet<string>, ids: ReadonlyMap<string, string>, now: number, columns: number): PaneLine[] {
  const bakers = team?.bakers ?? []
  if (bakers.length === 0) return []
  return [
    fit({ text: `Team · ${bakersWord(bakers.length)}`, bold: true }, columns),
    ...bakers.map(baker => {
      const id = ids.get(baker.teammateId)
      const flag = id !== undefined && stalled.has(id) ? ' · stalled' : ''
      return fit({ text: `${bakerRow(baker, now)}${flag}`, dim: baker.status === 'idle', ...(flag === '' ? {} : { warn: true }) }, columns)
    }),
  ]
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

/** One inbox item's heading: category, slice and age. */
export function hitlLine(item: PassHitlItem, now: number): string {
  return `${item.category}${item.slice === null ? '' : ` · ${item.slice}`} · ${runningFor(now - item.t)} ago`
}

/** The HITL inbox: open items oldest first, each its heading, its question cut to the width, and its button. */
function inboxRows(ledger: PassProjection | null, now: number, columns: number): PaneLine[] {
  const open = ledger?.hitl?.open ?? []
  if (open.length === 0) return []
  const rows: PaneLine[] = [fit({ text: `HITL inbox · ${open.length} open`, bold: true, warn: true }, columns)]
  for (const item of open) {
    rows.push(fit({ text: `  ${hitlLine(item, now)}`, warn: true }, columns))
    rows.push(fit({ text: `  ${item.question.replace(/\s+/g, ' ').trim()}` }, columns))
    rows.push({ text: ANSWER_LABEL, answer: item.id })
  }
  return rows
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
  const ids = new Map((view.live?.agents ?? []).flatMap(agent => (agent.teammateId ? [[agent.teammateId, agent.id] as const] : [])))
  const team = teamRows(view.team, view.stalled ?? new Set(), ids, now, width)
  if (allDone(c)) {
    return [
      fit({ text: 'All pies done', bold: true }, width),
      ...(where ? [where] : []),
      fit({ text: '/box-it-up ready' }, width),
      ...stripRows(view.strip, now, width),
      ...findingRows(ledger, now, width),
      ...inboxRows(ledger, now, width),
      ...team,
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
    ...stripRows(view.strip, now, width),
    ...sliceRows(c, ledger, width),
    ...agentRows(view.live, view.stalled ?? new Set(), width),
    ...gateRows(findSlice(ledger, activeSlice(c)?.id), width),
    ...touchedRows(view.touched, activeSlice(c)?.id, width),
    ...findingRows(ledger, now, width),
    ...inboxRows(ledger, now, width),
    ...team,
  ]
}

/**
 * Draws the pane from the atoms alone: it never writes and never touches the
 * disk. An inbox item's button records the answer from its press, not here.
 */
export async function drawPane($: EngineInterface, e: RenderInput<'Pane'>): Promise<RenderElement> {
  const [checklist, loadedAt, branch, ledger, live, seen, stalls, team, touched, strip] = await Promise.all([
    read($, checklistAtom),
    read($, loadedAtAtom),
    read($, branchAtom),
    read($, ledgerAtom),
    read($, liveAtom),
    read($, seenAtom),
    read($, stallsAtom),
    read($, teamAtom),
    read($, touchedAtom),
    read($, stripAtom),
  ])
  let now = ledger?.at ?? 0
  try {
    now = await $.clock.now()
  } catch {
    // Ages count to the projection's time.
  }
  const stalled = stalledIds(stalls, seen)
  const lines = paneLines({ checklist, loadedAt, branch, ledger, live, stalled, now, team, touched, strip }, e.props.bodyColumns)
  const { Box, Text, Button } = $.ui.resolve(e)
  return (
    <Box flexDirection="column">
      {lines.map(line =>
        line.answer !== undefined ? (
          <Button
            key={`answer-${line.answer}`}
            label={ANSWER_LABEL}
            onPress={() => {
              void markAnswered($, line.answer ?? '').catch(() => undefined)
            }}
          />
        ) : line.stale === true ? (
          <Text color="error" bold={line.bold === true}>
            {line.text}
          </Text>
        ) : line.warn === true ? (
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
