// mod/types/index.d.ts
// The Pass state contract: checklist, ledger and projection types, and the session state keys the mod owns under the bytheslice plugin.

/** One slice row: its `N.M` id, its name, and whether the checklist marks it done. */
export type PassSlice = { id: string; name: string; done: boolean }

/** One pie (Prep counts as Pie 1, Foundations) with its review mode and its slices in checklist order. */
export type PassPie = {
  n: number
  name: string
  review: 'boundary' | 'continuous'
  done: boolean
  slices: PassSlice[]
}

/** Which shape the checklist file has: nested v5 pies, a flat v4 stage table, or neither. */
export type PassLayout = 'pie' | 'stage' | 'empty'

/** The parsed checklist. A flat v4 file has `pies: []` and `layout: 'stage'`. */
export type PassChecklist = {
  pies: PassPie[]
  prep: { done: number; total: number } | null
  layout: PassLayout
}

/** What a ledger row records. The kitchen activity log already holds agent starts and stops. */
export type LedgerEvent =
  | 'pie.started'
  | 'slice.started'
  | 'slice.done'
  | 'verdict'
  | 'commit'
  | 'push'
  | 'merge'
  | 'hitl.raised'
  | 'hitl.answered'
  | 'note'
  | 'usage'
  | 'slice.rollup'
  | 'warn'

/** One line of `.bytheslice/ledger.jsonl`: facts only, never a prompt, an answer or a secret. */
export type LedgerRow = {
  v: 1
  t: number
  sid: string
  ev: LedgerEvent
  pie?: number
  slice?: string
  aid?: string
  agent?: string
  data?: Record<string, unknown>
}

/** One row of the Pie 4 kitchen activity log, as hooks/kitchen-log.sh writes it. */
export type ActivityRow = {
  t: number
  sid?: string
  ev: string
  agent?: string
  aid?: string
  label?: string
  skill?: string
  tok?: number
  ms?: number
  ok?: boolean
  pie?: number
  slice?: string
  src?: string
}

/** Where a slice stands, as the ledger and the activity log show it. */
export type PassSliceStatus = 'queued' | 'building' | 'testing' | 'verifying' | 'fixing' | 'done'

/** The two verify-once gates whose verdicts the ledger records. */
export type PassGate = 'slice-tester' | 'slice-verifier'

/** A gate's latest verdict for a slice. */
export type PassVerdict = {
  gate: PassGate
  overall: 'pass' | 'fail' | 'unparsed'
  fixTargets: string[]
  head: string | null
  t: number
}

/** An agent the activity log shows started and not yet stopped. */
export type PassLiveAgent = {
  aid: string
  role: string
  pie: number | null
  slice: string | null
  startedAt: number
}

/** Per-role totals the slice rollup keeps after the activity log rotates. */
export type PassRoleTotals = { count: number; tok: number; ms: number }

/** One slice as the ledger projection reports it. */
export type PassSliceView = {
  id: string
  name: string
  pie: number
  done: boolean
  status: PassSliceStatus
  /** Fix-attempter starts for the slice, shown as `n/3`. */
  fixLoop: number
  /** The latest verdict per gate, tester first. */
  verdicts: PassVerdict[]
  commits: string[]
  startedAt: number | null
  doneAt: number | null
  durationMs: number | null
  tokens: number
  costUsd: number | null
  agents: PassLiveAgent[]
  notes: number
  /** True when the ledger holds any row of this slice's own. */
  tracked: boolean
}

/** One pie as the ledger projection reports it. */
export type PassPieView = {
  n: number
  name: string
  review: 'boundary' | 'continuous'
  done: boolean
  slices: PassSliceView[]
}

/** A slice where the checklist and the ledger disagree. Facts to read, never a refusal. */
export type PassMismatch = {
  pie: number
  slice: string
  kind: 'done-without-pass' | 'pass-without-done'
  head: string | null
}

/** The whole ledger projection the pane, band and bts_status read. */
export type PassProjection = {
  pies: PassPieView[]
  active: { pie: number; slice: string } | null
  live: PassLiveAgent[]
  mismatches: PassMismatch[]
  /** Done slices with no ledger rows of their own: finished before the ledger. */
  untracked: number
  at: number
}

/** What an `agent.spawn` hook learned about one started agent. */
export type PassAgentMark = { type: string; pie: number | null; slice: string | null; at: number }

/** One `$.agent.list()` entry as the pane lists it. */
export type PassLiveEntry = { id: string; role: string; status: string; startedAt: number }

/** The live agents poll: when it last ran and what it saw. */
export type PassLive = { at: number; agents: PassLiveEntry[] }

declare module 'claude-code' {
  interface PluginState {
    bytheslice: {
      /** The parsed checklist, or null when the file is missing or not yet read. */
      'pass.checklist': PassChecklist | null
      /** When the checklist was last read, epoch milliseconds; 0 before the first read. */
      'pass.loadedAt': number
      /** True when the engine is older than the Pass supports; the mod then stays inert. */
      'pass.limited': boolean
      /** The current git branch of the session's directory, or null when git gave none. */
      'pass.branch': string | null
      /** The ledger projection, or null before the first read. */
      'pass.ledger': PassProjection | null
      /** Agent id to what its spawn said: type and the pie and slice its label named. */
      'pass.agents': Record<string, PassAgentMark>
      /** The latest `$.agent.list()` poll. */
      'pass.live': PassLive
      /** Keys of ledger rows a toast already announced, newest last. */
      'pass.toasted': string[]
      /** The listed names of the tools the Pass registered (`mcp__<plugin>__bts_status`). */
      'pass.tools': string[]
    }
  }
}
