// mod/types/index.d.ts
// The Pass state contract: checklist, ledger and projection types, and the session state keys the mod owns under the bytheslice plugin.

/**
 * One slice row: its `N.M` id, its name, whether the checklist marks it done,
 * and its `**Type:**` (`frontend`, `full-stack`, `infrastructure`, ...) when the checklist names one.
 */
export type PassSlice = { id: string; name: string; done: boolean; type?: string }

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
  | 'agent.stalled'

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
  /** ci-fix-attempter starts the activity log attributes to this pie, against a cap of 3 CI rounds. */
  ciFixLoop: number
}

/** One warning a Pass check raised, as the ledger's `warn` rows keep it. A warning never blocked anything. */
export type PassFinding = { code: string; slice: string | null; text: string; t: number }

/** A slice where the checklist and the ledger disagree. Facts to read, never a refusal. */
export type PassMismatch = {
  pie: number
  slice: string
  kind: 'done-without-pass' | 'pass-without-done'
  head: string | null
}

/** The four categories that halt a ByTheSlice loop, plus `other` for the Pass's own items. */
export type PassHitlCategory = 'prd_ambiguity' | 'external_credentials' | 'destructive_operation' | 'creative_direction' | 'other'

/** One HITL question the ledger shows raised and not yet answered. Raising it halted nothing. */
export type PassHitlItem = {
  id: string
  category: PassHitlCategory
  question: string
  context: string | null
  /** `agent`: the model raised it through bts_hitl. `pass`: the mod raised it (a stall, the fix cap). */
  source: 'agent' | 'pass'
  /** `chat`: the model was told to ask it in chat, so the operator's next reply answers it. `pane`: only the pane showed it. */
  asked: 'chat' | 'pane'
  /** What raised a Pass item (`agent-stalled`, `fix-loop-cap`), or null for the model's own. */
  kind: string | null
  pie: number | null
  slice: string | null
  t: number
}

/** The HITL inbox as the ledger shows it: open items oldest first, and how long each answered item waited. */
export type PassHitl = { open: PassHitlItem[]; waitedMs: Record<string, number> }

/** The whole ledger projection the pane, band and bts_status read. */
export type PassProjection = {
  pies: PassPieView[]
  active: { pie: number; slice: string } | null
  live: PassLiveAgent[]
  mismatches: PassMismatch[]
  /** Done slices with no ledger rows of their own: finished before the ledger. */
  untracked: number
  /** The newest check warnings in the ledger, newest first, at most 10. */
  findings: PassFinding[]
  /** The HITL inbox. */
  hitl: PassHitl
  at: number
}

/** Whether a slice marked done needs a slice-tester pass too: UI slices only (the default), every slice, or none. */
export type PassRequireTester = 'ui-slices' | 'always' | 'never'

/** The watchdog's thresholds: `bytheslice.config.json` key `pass.watchdog` over the defaults in mod/policy.ts. */
export type PassWatchdog = {
  /** False stops the stall scan; nothing else changes. */
  enabled: boolean
  /** No tool activity for longer than this, past the role's budget, is a stall. */
  idleMs: number
  /** Role to how long it may run before idling counts; `default` for any role not listed. */
  budgetsMs: Record<string, number>
}

/** The check and spawn policy: `bytheslice.config.json` key `pass` over the defaults in mod/policy.ts. */
export type PassPolicy = {
  /** False turns every Pass check off; the pane, band and ledger stay on. */
  enabled: boolean
  requireTester: PassRequireTester
  /** Role (an agent type without its `bytheslice:` prefix) to the model tiers it may run on, matched by substring. */
  roles: Record<string, string[]>
  /** Case-insensitive strings that mark builder context in a reviewer's prompt. */
  contextMarkers: string[]
  /** The stall watchdog's thresholds. */
  watchdog: PassWatchdog
}

/** When an agent loop last showed activity (a tool call or a turn start), when it started, and its role. */
export type PassSeen = { lastT: number; role: string; startT: number }

/** One agent's latest stall: which episode (its `lastT` then), the count it took, and the key counts are kept by. */
export type PassStallMark = { n: number; lastT: number; at: number; key: string }

/** Stalls this session flagged: per agent its latest episode, per slice (or lone agent) how many. */
export type PassStalls = { agents: Record<string, PassStallMark>; counts: Record<string, number> }

/** The band's warning style after a finding: which one, and until when. */
export type PassWarning = { code: string; slice: string | null; t: number; until: number }

/** A spawn whose model the Pass checks again when its first turn ends. */
export type PassSpawnTrack = {
  role: string
  /** The model the spawn named, or null when it left the choice to the agent definition. */
  given: string | null
  /** The loop that spawned it (`parentAgentId`), or null for the main conversation. */
  parent: string | null
  /** The slice its `P<pie> S<slice>` dispatch label named, or null. */
  slice: string | null
  at: number
}

/** Fix spawns this session started: fix-attempter per slice, ci-fix-attempter per pie. */
export type PassFixCounts = { fix: Record<string, number>; ci: Record<string, number> }

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
      /** HEAD's sha in the session's directory: read at session start, after each commit row and after a branch move. */
      'pass.head': string | null
      /** The ByTheSlice skill the session last started (`sell-pie`, `cook-pizzas`, ...), without its plugin prefix. */
      'pass.activeSkill': string | null
      /** The check and spawn policy read once at session start; null before then (the defaults apply). */
      'pass.policy': PassPolicy | null
      /** `code|key` of each warning reported, to when; a key reports at most once a minute. */
      'pass.reported': Record<string, number>
      /** The latest finding while the band still shows it, or null. */
      'pass.warning': PassWarning | null
      /** Agent id to a spawn whose model is checked again when its first turn ends. */
      'pass.spawns': Record<string, PassSpawnTrack>
      /** Fix spawns this session started, beside what the activity log counts. */
      'pass.fixCounts': PassFixCounts
      /** Agent id to its last activity, start and role, as the tool.call and turn.start stamps and the watchdog scan keep them. */
      'pass.seen': Record<string, PassSeen>
      /** Stalls the watchdog flagged this session. */
      'pass.stalls': PassStalls
      /** Keys already sent as a native notification (a HITL id, `pie:<n>`), newest last. */
      'pass.notified': string[]
    }
  }
}
