// mod/ledger-projection.ts
// Pure projection of ledger rows plus the kitchen activity log onto the checklist: slice status, verdicts, fix loops, live agents, rollups.

import type { EngineInterface } from 'claude-code'

import type {
  ActivityRow,
  LedgerRow,
  PassChecklist,
  PassGate,
  PassLiveAgent,
  PassMismatch,
  PassProjection,
  PassRoleTotals,
  PassSliceStatus,
  PassSliceView,
  PassVerdict,
} from './types'

/** Where hooks/kitchen-log.sh writes, relative to the project; read here, never written. */
export const ACTIVITY_PATH = '.claude/.bytheslice-state/kitchen/activity.jsonl'
export const ACTIVITY_ROTATED = '.claude/.bytheslice-state/kitchen/activity.1.jsonl'
export const FIX_CAP = 3
/** An agent start older than this with no stop is a lost stop, not a live agent. */
export const STALE_MS = 6 * 60 * 60 * 1000

export const GATES: readonly PassGate[] = ['slice-tester', 'slice-verifier']
const FIXERS = new Set(['fix-attempter', 'debug-instrumenter'])

/** An agent type without its plugin prefix (`bytheslice:slice-tester` reads `slice-tester`). */
export function roleOf(type: string | undefined): string {
  if (typeof type !== 'string' || type === '') return 'agent'
  return type.slice(type.lastIndexOf(':') + 1)
}

/** The gate an agent type is, or null for any other role. */
export function gateOf(type: string | undefined): PassGate | null {
  const role = roleOf(type)
  return role === 'slice-tester' || role === 'slice-verifier' ? role : null
}

function isActivity(value: unknown): value is ActivityRow {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const row = value as Record<string, unknown>
  return typeof row.t === 'number' && Number.isFinite(row.t) && typeof row.ev === 'string'
}

/** Parses activity log text: a torn or foreign line is skipped. */
export function parseActivity(text: string): ActivityRow[] {
  const rows: ActivityRow[] = []
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue
    try {
      const parsed: unknown = JSON.parse(line)
      if (isActivity(parsed)) rows.push(parsed)
    } catch {
      // A torn line, most often the one being written.
    }
  }
  return rows
}

/** Drops repeated activity rows: the same event at the same time for the same agent counts once. */
export function dedupeActivity(rows: readonly ActivityRow[]): ActivityRow[] {
  const seen = new Set<string>()
  const out: ActivityRow[] = []
  for (const row of rows) {
    const key = `${row.ev}|${row.t}|${row.aid ?? ''}|${row.agent ?? ''}|${row.label ?? ''}|${row.sid ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(row)
  }
  return out
}

/**
 * Where the kitchen log lives: under the session's project root, the
 * directory hooks/kitchen-log.sh reads as CLAUDE_PROJECT_DIR.
 */
export async function activityPath($: EngineInterface, rotated = false): Promise<string> {
  let root = '.'
  try {
    root = await $.session.root()
  } catch {
    try {
      root = await $.session.cwd()
    } catch {
      root = '.'
    }
  }
  return `${root.replace(/\/$/, '')}/${rotated ? ACTIVITY_ROTATED : ACTIVITY_PATH}`
}

/**
 * Reads the kitchen activity log (the rotated file first, so rows run oldest
 * first). A missing or partial file gives what it can, never a throw.
 */
export async function readActivity($: EngineInterface): Promise<ActivityRow[]> {
  const rows: ActivityRow[] = []
  for (const rotated of [true, false]) {
    try {
      rows.push(...parseActivity(await $.fs.read(await activityPath($, rotated))))
    } catch {
      // Missing: the kitchen log has not written here yet.
    }
  }
  return rows
}

/** Live agents: activity starts with no stop of the same id, younger than STALE_MS. */
export function liveAgents(activity: readonly ActivityRow[], now: number): PassLiveAgent[] {
  const started = new Map<string, ActivityRow>()
  const stopped = new Set<string>()
  for (const row of dedupeActivity(activity)) {
    if (typeof row.aid !== 'string' || row.aid === '') continue
    if (row.ev === 'SubagentStart' && !started.has(row.aid)) started.set(row.aid, row)
    if (row.ev === 'SubagentStop') stopped.add(row.aid)
  }
  const live: PassLiveAgent[] = []
  for (const [aid, row] of started) {
    if (stopped.has(aid) || now - row.t > STALE_MS) continue
    live.push({ aid, role: roleOf(row.agent), pie: row.pie ?? null, slice: row.slice ?? null, startedAt: row.t })
  }
  return live.sort((a, b) => a.startedAt - b.startedAt)
}

/** Fix-attempter starts in the activity log for one slice (one per agent id). */
export function fixLoops(activity: readonly ActivityRow[], slice: string): number {
  const aids = new Set<string>()
  let unnamed = 0
  for (const row of dedupeActivity(activity)) {
    if (row.ev !== 'SubagentStart' || row.slice !== slice || roleOf(row.agent) !== 'fix-attempter') continue
    if (typeof row.aid === 'string' && row.aid !== '') aids.add(row.aid)
    else unnamed += 1
  }
  return aids.size + unnamed
}

/** What a slice.rollup row keeps: per-role agent counts, tokens and time, and fix loops. */
export type SliceRollup = { agents: Record<string, PassRoleTotals>; fixLoops: number; tokens: number; ms: number }

/** Totals one slice's activity rows, so the ledger keeps them after the log rotates. */
export function rollup(activity: readonly ActivityRow[], slice: string): SliceRollup {
  const agents: Record<string, PassRoleTotals> = {}
  const counted = new Set<string>()
  const totals = (role: string): PassRoleTotals => (agents[role] ??= { count: 0, tok: 0, ms: 0 })
  let tokens = 0
  let ms = 0
  for (const row of dedupeActivity(activity)) {
    if (row.slice !== slice) continue
    const role = roleOf(row.agent)
    if (row.ev === 'SubagentStart') {
      const key = row.aid ?? `${row.t}`
      if (counted.has(key)) continue
      counted.add(key)
      totals(role).count += 1
    } else if (row.ev === 'PostToolUse' && (typeof row.tok === 'number' || typeof row.ms === 'number')) {
      const entry = totals(role)
      entry.tok += row.tok ?? 0
      entry.ms += row.ms ?? 0
      tokens += row.tok ?? 0
      ms += row.ms ?? 0
    }
  }
  return { agents, fixLoops: fixLoops(activity, slice), tokens, ms }
}

function verdictOf(row: LedgerRow): PassVerdict | null {
  const data = row.data ?? {}
  const gate = data.gate
  if (gate !== 'slice-tester' && gate !== 'slice-verifier') return null
  const overall = data.overall === 'pass' || data.overall === 'fail' ? data.overall : 'unparsed'
  const targets = Array.isArray(data.fix_targets) ? data.fix_targets.filter((x): x is string => typeof x === 'string') : []
  return { gate, overall, fixTargets: targets, head: typeof data.head === 'string' ? data.head : null, t: row.t }
}

type Signal = { t: number; status: Exclude<PassSliceStatus, 'queued' | 'done'> }

const phaseOfRole = (role: string): Signal['status'] => {
  if (role === 'slice-tester') return 'testing'
  if (role === 'slice-verifier') return 'verifying'
  if (FIXERS.has(role)) return 'fixing'
  return 'building'
}

/** The ladder: the latest signal decides; done comes from the checklist, queued from no signal at all. */
export function statusOf(done: boolean, signals: readonly Signal[]): PassSliceStatus {
  if (done) return 'done'
  let latest: Signal | null = null
  for (const signal of signals) if (latest === null || signal.t >= latest.t) latest = signal
  return latest?.status ?? 'queued'
}

function rollupOf(rows: readonly LedgerRow[]): SliceRollup | null {
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const row = rows[i]
    if (row?.ev !== 'slice.rollup') continue
    const data = row.data ?? {}
    return {
      agents: (data.agents as Record<string, PassRoleTotals> | undefined) ?? {},
      fixLoops: typeof data.fixLoops === 'number' ? data.fixLoops : 0,
      tokens: typeof data.tokens === 'number' ? data.tokens : 0,
      ms: typeof data.ms === 'number' ? data.ms : 0,
    }
  }
  return null
}

/** Session cost deltas: each usage row's cost minus its session's previous one. */
function costBySlice(rows: readonly LedgerRow[]): Map<string, number> {
  const last = new Map<string, number>()
  const by = new Map<string, number>()
  for (const row of rows) {
    if (row.ev !== 'usage') continue
    const cost = row.data?.costUsd
    if (typeof cost !== 'number' || !Number.isFinite(cost)) continue
    const delta = Math.max(0, cost - (last.get(row.sid) ?? 0))
    last.set(row.sid, cost)
    if (row.slice !== undefined) by.set(row.slice, (by.get(row.slice) ?? 0) + delta)
  }
  return by
}

function sliceView(
  pie: number,
  id: string,
  name: string,
  done: boolean,
  rows: readonly LedgerRow[],
  activity: readonly ActivityRow[],
  live: readonly PassLiveAgent[],
  cost: Map<string, number>,
): PassSliceView {
  const own = rows.filter(row => row.slice === id)
  const acts = activity.filter(row => row.slice === id)
  const signals: Signal[] = []
  const latest = new Map<PassGate, PassVerdict>()
  const commits: string[] = []
  let startedAt: number | null = null
  let doneAt: number | null = null
  let notes = 0
  const seen = (t: number) => {
    startedAt = startedAt === null ? t : Math.min(startedAt, t)
  }
  for (const row of own) {
    if (row.ev === 'slice.started') {
      signals.push({ t: row.t, status: 'building' })
      seen(row.t)
    } else if (row.ev === 'verdict') {
      const verdict = verdictOf(row)
      if (!verdict) continue
      latest.set(verdict.gate, verdict)
      const status: Signal['status'] =
        verdict.overall === 'fail'
          ? 'fixing'
          : verdict.overall === 'unparsed' && verdict.gate === 'slice-tester'
            ? 'testing'
            : 'verifying'
      signals.push({ t: row.t, status })
    } else if (row.ev === 'commit') {
      const sha = row.data?.sha
      if (typeof sha === 'string' && !commits.includes(sha)) commits.push(sha)
    } else if (row.ev === 'slice.done') {
      doneAt = doneAt ?? row.t
    } else if (row.ev === 'note') {
      notes += 1
    }
  }
  for (const row of dedupeActivity(acts)) {
    if (row.ev !== 'SubagentStart') continue
    signals.push({ t: row.t, status: phaseOfRole(roleOf(row.agent)) })
    seen(row.t)
  }
  const rolled = rollupOf(own)
  const counted = fixLoops(acts, id)
  const summed = rollup(acts, id).tokens
  const begun: number | null = startedAt
  const ended: number | null = doneAt
  return {
    id,
    name,
    pie,
    done,
    status: statusOf(done, signals),
    fixLoop: counted > 0 ? counted : rolled?.fixLoops ?? 0,
    verdicts: GATES.flatMap(gate => {
      const verdict = latest.get(gate)
      return verdict ? [verdict] : []
    }),
    commits,
    startedAt: begun,
    doneAt: ended,
    durationMs: begun !== null && ended !== null ? Math.max(0, ended - begun) : null,
    tokens: summed > 0 ? summed : rolled?.tokens ?? 0,
    costUsd: cost.has(id) ? Math.round((cost.get(id) ?? 0) * 10000) / 10000 : null,
    agents: live.filter(agent => agent.slice === id),
    notes,
    tracked: own.length > 0,
  }
}

/** Where the checklist and the ledger disagree, for slices the ledger tracked. */
export function mismatchesOf(views: readonly PassSliceView[]): PassMismatch[] {
  const out: PassMismatch[] = []
  for (const view of views) {
    const verifier = view.verdicts.find(verdict => verdict.gate === 'slice-verifier')
    const passed = verifier?.overall === 'pass' && verifier.head !== null
    if (view.done && view.tracked && !passed) {
      out.push({ pie: view.pie, slice: view.id, kind: 'done-without-pass', head: verifier?.head ?? null })
    }
    if (!view.done && verifier?.overall === 'pass') {
      out.push({ pie: view.pie, slice: view.id, kind: 'pass-without-done', head: verifier.head })
    }
  }
  return out
}

/**
 * Projects ledger rows and kitchen activity onto the checklist. A slice with
 * no rows still reports from the checklist (queued or done). Pure: no `$`.
 */
export function projectLedger(
  rows: readonly LedgerRow[],
  activity: readonly ActivityRow[],
  checklist: PassChecklist | null,
  now = 0,
): PassProjection {
  const acts = dedupeActivity(activity)
  const live = liveAgents(acts, now)
  const cost = costBySlice(rows)
  const pies = (checklist?.layout === 'pie' ? checklist.pies : []).map(pie => ({
    n: pie.n,
    name: pie.name,
    review: pie.review,
    done: pie.done,
    slices: pie.slices.map(slice => sliceView(pie.n, slice.id, slice.name, slice.done, rows, acts, live, cost)),
  }))
  const views = pies.flatMap(pie => pie.slices)
  const open = pies.find(pie => pie.slices.some(slice => !slice.done))
  const first = open?.slices.find(slice => !slice.done)
  return {
    pies,
    active: open && first ? { pie: open.n, slice: first.id } : null,
    live,
    mismatches: mismatchesOf(views),
    untracked: views.filter(view => view.done && !view.tracked).length,
    at: now,
  }
}

/** One slice's view by id, or null. */
export function findSlice(projection: PassProjection | null, id: string | undefined): PassSliceView | null {
  if (!projection || id === undefined) return null
  for (const pie of projection.pies) {
    const found = pie.slices.find(slice => slice.id === id)
    if (found) return found
  }
  return null
}

/** A slice's latest verdict of any gate, or null. */
export function lastVerdict(view: PassSliceView | null): PassVerdict | null {
  if (!view) return null
  let latest: PassVerdict | null = null
  for (const verdict of view.verdicts) if (latest === null || verdict.t >= latest.t) latest = verdict
  return latest
}
