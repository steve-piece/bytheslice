// mod/replay.tsx
// pass replay <slice>: a focused pane stepping through a slice's commits plus its uncommitted changes, each with numstat, the roles that edited each file and the selected file's diff from git; git runs in the press handler, never in a draw.

import { atom, read, update } from 'claude-code'
import type { EngineInterface, RenderElement, RenderInput } from 'claude-code'

import { readRows } from './ledger.ts'
import { activeSlice } from './projection.ts'
import { truncate } from './rail.tsx'
import { parseNumstat } from './touched.ts'
import type { LedgerRow, PassReplay, PassReplayFile, PassReplayStep } from './types'

const checklistAtom = atom({ plugin: 'bytheslice', key: 'pass.checklist' } as const, null)
const replayAtom = atom({ plugin: 'bytheslice', key: 'pass.replay' } as const, null)

export const REPLAY_PANE = 'pass-replay'
/** Below this many body columns the pane draws one band line and a hint to widen. */
export const REPLAY_MIN_COLUMNS = 60
/** How much of a diff the pane draws; a longer one is cut at a hunk boundary. */
export const DIFF_MAX = 60000
/** Files a step lists before it counts the rest. */
export const REPLAY_FILES = 12
export const UNCOMMITTED = 'Uncommitted changes'
/** The uncommitted step's end: after every row. */
const OPEN_END = Number.MAX_SAFE_INTEGER

const roleOf = (row: LedgerRow): string => {
  const agent = row.data?.agent ?? row.agent
  return typeof agent === 'string' && agent !== '' ? agent.slice(agent.lastIndexOf(':') + 1) : 'main'
}

/**
 * The slice's replay steps: each of its commit rows in order (a sha once),
 * then one step for the uncommitted changes. A step's edit window runs from
 * the previous commit (the slice's first row for the first) to its own row.
 */
export function replaySteps(rows: readonly LedgerRow[], slice: string): PassReplayStep[] {
  const own = rows.filter(row => row.slice === slice)
  const steps: PassReplayStep[] = []
  const seen = new Set<string>()
  let fromT = Number.NEGATIVE_INFINITY
  for (const row of own) {
    if (row.ev !== 'commit') continue
    const sha = row.data?.sha
    if (typeof sha !== 'string' || !/^[0-9a-f]{7,64}$/.test(sha) || seen.has(sha)) continue
    seen.add(sha)
    steps.push({ sha, t: row.t, fromT })
    fromT = row.t
  }
  steps.push({ sha: null, t: OPEN_END, fromT })
  return steps
}

/** Path to the roles that edited it inside a step's window, in first-edit order. Pure. */
export function editorsIn(rows: readonly LedgerRow[], slice: string, step: PassReplayStep): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const row of rows) {
    if (row.ev !== 'edit' || row.slice !== slice || row.t <= step.fromT || row.t > step.t) continue
    const path = row.data?.path
    if (typeof path !== 'string') continue
    const roles = out.get(path) ?? []
    const role = roleOf(row)
    if (!roles.includes(role)) roles.push(role)
    out.set(path, roles)
  }
  return out
}

/** A diff cut to DIFF_MAX at a hunk boundary, from its first hunk on (headers dropped). */
export function hunksOf(text: string): string {
  const first = text.search(/^@@ /m)
  if (first === -1) return ''
  const body = text.slice(first)
  if (body.length <= DIFF_MAX) return body.replace(/\n+$/, '')
  const cut = body.lastIndexOf('\n@@ ', DIFF_MAX)
  return cut > 0 ? body.slice(0, cut) : ''
}

async function git($: EngineInterface, argv: string[]): Promise<string | null> {
  try {
    const run = await $.process.run(['git', ...argv], { timeoutMs: 10000 })
    return run.exitCode === 0 ? run.stdout : null
  } catch {
    return null
  }
}

/** Loads one step's subject, files and the selected file's diff from git. Never throws. */
export async function loadStep(
  $: EngineInterface,
  rows: readonly LedgerRow[],
  slice: string,
  steps: PassReplayStep[],
  index: number,
  selected = 0,
): Promise<PassReplay> {
  const at = Math.max(0, Math.min(index, steps.length - 1))
  const step = steps[at] ?? { sha: null, t: OPEN_END, fromT: Number.NEGATIVE_INFINITY }
  const editors = editorsIn(rows, slice, step)
  let subject = UNCOMMITTED
  let numstat = ''
  let error: string | null = null
  if (step.sha !== null) {
    const shown = await git($, ['show', '--numstat', '--format=%s', step.sha])
    if (shown === null) error = `git show ${step.sha.slice(0, 7)} failed: the commit may be on another branch`
    else {
      const [first = '', ...rest] = shown.split('\n')
      subject = first.trim()
      numstat = rest.join('\n')
    }
  } else {
    const diffed = await git($, ['diff', '--numstat', 'HEAD'])
    if (diffed === null) error = 'git diff HEAD failed'
    else numstat = diffed
  }
  const counted = parseNumstat(numstat)
  const files: PassReplayFile[] = [...counted].map(([path, n]) => ({ path, ...n, agents: editors.get(path) ?? [] }))
  const pick = files.length === 0 ? 0 : Math.max(0, Math.min(selected, files.length - 1))
  let diff = ''
  const file = files[pick]
  if (file && error === null) {
    const raw = step.sha !== null ? await git($, ['show', '--format=', step.sha, '--', file.path]) : await git($, ['diff', 'HEAD', '--', file.path])
    diff = raw === null ? '' : hunksOf(raw)
  }
  return { slice, steps, index: at, subject, files, selected: pick, diff, error }
}

const SLICE = /^\d+\.\d+$/

/**
 * pass replay <slice>: builds the slice's steps from the ledger, loads the
 * first, writes the replay atom and opens the focused pane. Resolves the
 * command's output line.
 */
export async function openReplay($: EngineInterface, arg: string): Promise<string> {
  const named = arg.trim()
  const slice = named === '' ? activeSlice(await read($, checklistAtom).catch(() => null))?.id : named
  if (slice === undefined || !SLICE.test(slice)) return 'Usage: pass replay <slice>, for example pass replay 5.2.'
  const rows = await readRows($)
  if (!rows.some(row => row.slice === slice)) return `Replay ${slice}: the ledger has no rows for that slice yet.`
  const steps = replaySteps(rows, slice)
  const state = await loadStep($, rows, slice, steps, 0)
  const seen = draws
  await update($, replayAtom, () => state)
  const opened: { isPlaced: boolean; reason?: string } = await $.ui
    .open({ id: REPLAY_PANE, title: `Replay ${slice}`, focus: true, closeOnEscape: true })
    .catch(() => ({ isPlaced: false }))
  const line = `Replay ${slice}: step 1 of ${steps.length}`
  if (!opened.isPlaced) return `${line}. The pane is open and waits to be drawn: ${opened.reason ?? 'no surface placed it'}.`
  // The engine answers placed and shown even while its own diff panel holds the dock, and then never draws the pane.
  if (!(await drawnSince($, seen).catch(() => true))) {
    return `${line}. The replay pane is open behind another panel, such as Claude Code's diff panel: run /diff to hide that panel and the replay shows.`
  }
  return `${line}. Prev and Next step through it; Escape closes.`
}

/** Draws of the replay pane so far: the command reads whether the surface drew it after the open. */
let draws = 0
/** How long pass replay waits for the opened pane's first draw before saying it is covered. */
export const REPLAY_DRAW_WAIT_MS = 1000

async function drawnSince($: EngineInterface, seen: number): Promise<boolean> {
  for (let waited = 0; draws === seen && waited < REPLAY_DRAW_WAIT_MS; waited += 100) await $.clock.sleep(100)
  return draws !== seen
}

/** A Prev or Next press: moves one step (staying put at either end) and loads it. Resolves the new state. */
export async function stepReplay($: EngineInterface, delta: number): Promise<PassReplay | null> {
  const state = await read($, replayAtom)
  if (!state) return null
  const target = Math.max(0, Math.min(state.index + delta, state.steps.length - 1))
  if (target === state.index) return state
  const next = await loadStep($, await readRows($), state.slice, state.steps, target)
  await update($, replayAtom, () => next)
  return next
}

/** A file press: shows that file's diff for the current step. */
export async function selectFile($: EngineInterface, selected: number): Promise<PassReplay | null> {
  const state = await read($, replayAtom)
  if (!state || selected === state.selected) return state
  const next = await loadStep($, await readRows($), state.slice, state.steps, state.index, selected)
  await update($, replayAtom, () => next)
  return next
}

/** The band line the narrow pane shows: `Replay 5.2: step 2 of 6`. */
export function replayLine(state: PassReplay): string {
  return `Replay ${state.slice}: step ${state.index + 1} of ${state.steps.length}`
}

/** A step's heading: short sha and subject, or the uncommitted label. */
export function stepHeading(state: PassReplay): string {
  const step = state.steps[state.index]
  return step?.sha ? `${step.sha.slice(0, 7)} ${state.subject}` : UNCOMMITTED
}

/** One file row: numstat, path and the roles that edited it. */
export function fileLine(file: PassReplayFile): string {
  const who = file.agents.length === 0 ? '' : ` · ${file.agents.join(', ')}`
  return `+${file.added} -${file.removed} ${file.path}${who}`
}

/** Draws the replay pane from its atom alone; every press loads git data, the draw never does. */
export async function drawReplay($: EngineInterface, e: RenderInput<'Pane'>): Promise<RenderElement> {
  draws += 1
  const state = await read($, replayAtom)
  const elements = $.ui.resolve(e)
  const { Box, Text, Button } = elements
  const columns = Math.max(1, e.props.bodyColumns)
  if (!state) return <Text dimColor>Run pass replay &lt;slice&gt; to step through a slice.</Text>
  const prev = <Button key="prev" label="Prev" onPress={() => void stepReplay($, -1).catch(() => null)} />
  const next = <Button key="next" label="Next" onPress={() => void stepReplay($, 1).catch(() => null)} />
  if (columns < REPLAY_MIN_COLUMNS) {
    return (
      <Box flexDirection="column">
        <Text bold>{truncate(replayLine(state), columns)}</Text>
        <Text dimColor>{truncate(`Widen to ${REPLAY_MIN_COLUMNS} columns to see files and diffs.`, columns)}</Text>
        <Box flexDirection="row">
          {prev}
          {next}
        </Box>
      </Box>
    )
  }
  // Per-surface presence of Code is read at draw time; without it the diff is plain Text lines.
  const Code: typeof elements.Code | undefined = 'Code' in elements ? elements.Code : undefined
  const shown = state.files.slice(0, REPLAY_FILES)
  const selected = state.files[state.selected]
  const diff =
    state.diff === '' ? (
      <Text dimColor>{selected ? 'No diff to show for this file.' : 'No files changed in this step.'}</Text>
    ) : Code ? (
      <Code source={state.diff} format="diff" path={selected?.path} wrap="truncate-end" />
    ) : (
      <Box flexDirection="column">
        {state.diff.split('\n').map(line => (
          <Text color={line.startsWith('+') ? 'success' : line.startsWith('-') ? 'error' : undefined}>{truncate(line, columns)}</Text>
        ))}
      </Box>
    )
  return (
    <Box flexDirection="column">
      <Text bold>{truncate(`${replayLine(state).replace(':', ' ·')}`, columns)}</Text>
      <Text>{truncate(stepHeading(state), columns)}</Text>
      {state.error ? <Text color="warning">{truncate(state.error, columns)}</Text> : null}
      {shown.map((file, i) => (
        <Button
          key={`file-${i}`}
          label={truncate(`${i === state.selected ? '▸' : ' '} ${fileLine(file)}`, columns)}
          onPress={() => void selectFile($, i).catch(() => null)}
        />
      ))}
      {state.files.length > shown.length ? <Text dimColor>{`  and ${state.files.length - shown.length} more files`}</Text> : null}
      {diff}
      <Box flexDirection="row">
        {prev}
        {next}
      </Box>
    </Box>
  )
}
