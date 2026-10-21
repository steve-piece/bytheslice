// mod/team.ts
// The Pass team mode, observe-only: the roster of teammates (bakers) from $.agent.list, the activity stamps and the ledger; each teammate turn attributed to its pie; and the teammate idle and task-done events in the ledger.

import { atom, read, update } from 'claude-code'
import type { AgentInfo, EngineInterface, TurnCompleteInput } from 'claude-code'

import { labelOf, record } from './capture.ts'
import { readRows } from './ledger.ts'
import type { LedgerRow } from './ledger.ts'
import type { PassAgentMark, PassBaker, PassChecklist, PassSeen, PassTeam } from './types'

const teamAtom = atom({ plugin: 'bytheslice', key: 'pass.team' } as const, { at: 0, bakers: [] })
const agentsAtom = atom({ plugin: 'bytheslice', key: 'pass.agents' } as const, {})
const seenAtom = atom({ plugin: 'bytheslice', key: 'pass.seen' } as const, {})
const checklistAtom = atom({ plugin: 'bytheslice', key: 'pass.checklist' } as const, null)
const limitedAtom = atom({ plugin: 'bytheslice', key: 'pass.limited' } as const, false)

/** One teammate as the roster shows it (PassBaker). */
export type Baker = PassBaker

/** The fields of an `$.agent.list()` entry the roster reads. */
export type TeamAgent = Pick<AgentInfo, 'id' | 'status' | 'description'> & {
  teammateId?: string | undefined
  name?: string | undefined
}

/** A teammate as the hooks find it: its loop id, address, name, the pie its spawn label named, and its type. */
export type Teammate = { id: string; teammateId: string; name: string; pie: number | null; type: string }

// A teammate still on the team: waiting for a message (`idle`) or in a turn. One
// that ended (stopped, failed) has left the roster.
const ON_TEAM = new Set(['pending', 'running', 'waiting', 'idle'])

/** A teammate's name from its address: `baker@session-1` reads `baker`. */
export function nameOf(teammateId: string): string {
  const at = teammateId.indexOf('@')
  return at > 0 ? teammateId.slice(0, at) : teammateId
}

const rowTeammate = (row: LedgerRow): string | null =>
  typeof row.data?.teammateId === 'string' && row.data.teammateId !== '' ? row.data.teammateId : null

/**
 * The roster: one baker per teammate the list shows still on the team, by pie
 * then name. `pie` is its spawn label's (`P<pie> S<slice> ...`), else the pie
 * of its first `slice.started` row; `turns` counts its `usage` rows; `lastT`
 * is its latest stamp, turn or idle row; it reads `idle` when the list says so,
 * or when a `teammate.idle` row is newer than its last activity (the list lags
 * the event by a poll). Pure: no clock, no `$`.
 */
export function teamRoster(
  agents: readonly TeamAgent[],
  seen: Readonly<Record<string, PassSeen>>,
  ledger: readonly LedgerRow[],
): Baker[] {
  const bakers: Baker[] = []
  for (const agent of agents) {
    const teammateId = agent.teammateId
    if (typeof teammateId !== 'string' || teammateId === '' || !ON_TEAM.has(agent.status)) continue
    const name = typeof agent.name === 'string' && agent.name !== '' ? agent.name : nameOf(teammateId)
    let turns = 0
    let lastTurn = 0
    let idleAt = 0
    let startedPie: number | null = null
    for (const row of ledger) {
      const own = rowTeammate(row)
      if (row.ev === 'teammate.idle' && (own === teammateId || (own === null && row.data?.name === name))) {
        idleAt = Math.max(idleAt, row.t)
      }
      if (own !== teammateId) continue
      if (row.ev === 'usage') {
        turns += 1
        lastTurn = Math.max(lastTurn, row.t)
      } else if (row.ev === 'slice.started' && startedPie === null && typeof row.pie === 'number') {
        startedPie = row.pie
      }
    }
    const activeAt = seen[agent.id]?.lastT ?? 0
    const idle = agent.status === 'idle' || idleAt > activeAt
    bakers.push({
      teammateId,
      name,
      pie: labelOf(agent.description)?.pie ?? startedPie,
      status: idle ? 'idle' : 'running',
      turns,
      lastT: Math.max(activeAt, lastTurn, idleAt),
    })
  }
  return bakers.sort(
    (a, b) => (a.pie ?? Number.MAX_SAFE_INTEGER) - (b.pie ?? Number.MAX_SAFE_INTEGER) || a.name.localeCompare(b.name),
  )
}

async function nowOf($: EngineInterface): Promise<number> {
  try {
    return await $.clock.now()
  } catch {
    return Date.now()
  }
}

// The roster is kept in a ByTheSlice project on a supported engine only.
async function served($: EngineInterface): Promise<boolean> {
  try {
    if (await read($, limitedAtom)) return false
    return (await read($, checklistAtom)) !== null
  } catch {
    return false
  }
}

// The teammates' ids, statuses and stamps at the last read: the five-second
// pulse reads the ledger again only when they moved (an event forces a read).
let lastSign = ''

/** What the roster's inputs other than the ledger look like now; a change calls for a fresh read. */
export function teamSign(list: readonly TeamAgent[], seen: Readonly<Record<string, PassSeen>>): string {
  return JSON.stringify(
    list
      .filter(agent => typeof agent.teammateId === 'string' && agent.teammateId !== '')
      .map(agent => [agent.id, agent.teammateId, agent.status, agent.description, seen[agent.id]?.lastT ?? 0]),
  )
}

/**
 * Reads the list, the stamps and the ledger and writes `pass.team` when the
 * roster changed. Outside team mode (no teammate listed, none on the roster)
 * it reads no ledger; the pulse's call (no `force`) reads it only when a
 * teammate's status or stamp moved. Resolves the roster, or null when nothing
 * was read.
 */
export async function refreshTeam(
  $: EngineInterface,
  options: { list?: readonly TeamAgent[]; force?: boolean } = {},
): Promise<Baker[] | null> {
  try {
    if (!(await served($))) return null
    const list = options.list ?? (await $.agent.list())
    const before: PassTeam = await read($, teamAtom)
    const hasTeammate = list.some(agent => typeof agent.teammateId === 'string' && agent.teammateId !== '')
    if (!hasTeammate && before.bakers.length === 0) return null
    const [stamped, marks, now] = await Promise.all([read($, seenAtom), read($, agentsAtom), nowOf($)])
    // A teammate with no stamp yet counts from its spawn, else from when the roster first held it.
    const seen: Record<string, PassSeen> = { ...stamped }
    for (const agent of list) {
      if (typeof agent.teammateId !== 'string' || seen[agent.id]) continue
      const since = marks[agent.id]?.at ?? before.bakers.find(baker => baker.teammateId === agent.teammateId)?.lastT ?? now
      seen[agent.id] = { lastT: since, startT: since, role: 'teammate' }
    }
    const sign = teamSign(list, seen)
    // A roster never written (a fresh session or a reload) is always read.
    if (options.force !== true && sign === lastSign && hasTeammate && before.at !== 0) return null
    lastSign = sign
    const rows = hasTeammate ? await readRows($) : []
    const bakers = hasTeammate ? teamRoster(list, seen, rows) : []
    if (before.at === 0 || JSON.stringify(bakers) !== JSON.stringify(before.bakers)) {
      const team: PassTeam = { at: now, bakers }
      await update($, teamAtom, () => team)
    }
    return bakers
  } catch {
    return null
  }
}

/**
 * The teammate an agent id names, or null for any other loop: from the spawn
 * marks first (in memory), else one `$.agent.list()` read.
 */
export async function teammateOf($: EngineInterface, agentId: unknown): Promise<Teammate | null> {
  if (typeof agentId !== 'string' || agentId === '') return null
  const marks: Record<string, PassAgentMark> = await read($, agentsAtom).catch(() => ({}))
  const mark = marks[agentId]
  if (mark?.teammateId) {
    return { id: agentId, teammateId: mark.teammateId, name: mark.name ?? nameOf(mark.teammateId), pie: mark.pie, type: mark.type }
  }
  if (mark) return null
  try {
    const listed = (await $.agent.list()).find(agent => agent.id === agentId)
    if (!listed?.teammateId) return null
    return {
      id: agentId,
      teammateId: listed.teammateId,
      name: listed.name ?? nameOf(listed.teammateId),
      pie: labelOf(listed.description)?.pie ?? null,
      type: listed.type,
    }
  } catch {
    return null
  }
}

/** A teammate found by its loop id when the event carries one, else by its name in the team (a classic event's `teammate_name`). */
export async function teammateNamed($: EngineInterface, name: unknown, agentId?: unknown): Promise<Teammate | null> {
  const byId = await teammateOf($, agentId)
  if (byId) return byId
  if (typeof name !== 'string' || name === '') return null
  try {
    const listed = (await $.agent.list()).find(
      agent => typeof agent.teammateId === 'string' && (agent.name === name || nameOf(agent.teammateId) === name),
    )
    if (!listed?.teammateId) return null
    return { id: listed.id, teammateId: listed.teammateId, name, pie: labelOf(listed.description)?.pie ?? null, type: listed.type }
  } catch {
    return null
  }
}

/**
 * The slice a teammate's row is attributed to: its latest `slice.started` row,
 * else the first open slice of its pie. Pure.
 */
export function teammateSlice(
  teammateId: string,
  pie: number | null,
  rows: readonly LedgerRow[],
  c: PassChecklist | null,
): string | null {
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const row = rows[i]
    if (row?.ev === 'slice.started' && row !== undefined && rowTeammate(row) === teammateId && typeof row.slice === 'string') {
      return row.slice
    }
  }
  if (pie === null) return null
  return c?.pies.find(entry => entry.n === pie)?.slices.find(slice => !slice.done)?.id ?? null
}

/**
 * A teammate's turn end, after `next`: one `usage` row with its address, name,
 * pie and slice, the turn's duration, tokens and model, and the session's cost
 * so far, so cost and time roll up per baker. Any other loop is left to
 * captureTurn. Resolves the row, or null.
 */
export async function captureTeammateTurn($: EngineInterface, e: TurnCompleteInput): Promise<LedgerRow | null> {
  if (!(await served($))) return null
  const who = await teammateOf($, e.agentId)
  if (!who) return null
  const [rows, c] = await Promise.all([readRows($), read($, checklistAtom).catch(() => null)])
  const slice = teammateSlice(who.teammateId, who.pie, rows, c)
  const pie = who.pie ?? (slice !== null ? Number(slice.split('.')[0]) : null)
  let costUsd: number | null = null
  try {
    const usd = (await $.session.usage()).cost?.usd
    costUsd = typeof usd === 'number' && Number.isFinite(usd) ? usd : null
  } catch {
    costUsd = null
  }
  const usage = e.usage
  return record($, {
    ev: 'usage',
    ...(pie === null || Number.isNaN(pie) ? {} : { pie }),
    ...(slice === null ? {} : { slice }),
    aid: who.id,
    agent: who.type,
    data: {
      teammateId: who.teammateId,
      name: who.name,
      turnId: e.turnId,
      durationMs: e.durationMs,
      tokens: usage
        ? {
            input_tokens: usage.input_tokens,
            output_tokens: usage.output_tokens,
            cache_read_input_tokens: usage.cache_read_input_tokens,
            cache_creation_input_tokens: usage.cache_creation_input_tokens,
          }
        : null,
      model: usage?.model ?? null,
      costUsd,
    },
  })
}

/** What a `classic.TeammateIdle` input carries that the Pass reads (a live payload also holds `agent_id`). */
export type IdleEvent = { teammate_name?: unknown; agent_id?: unknown }

/** What a `classic.TaskCompleted` input carries that the Pass reads. */
export type DoneEvent = { task_id?: unknown; task_subject?: unknown; teammate_name?: unknown; agent_id?: unknown }

const SUBJECT_MAX = 200

/**
 * `classic.TeammateIdle`, once `next` let the teammate go idle: one
 * `teammate.idle` row `{ name, teammateId }` on its pie, and the roster read
 * again. Resolves the row, or null.
 */
export async function recordIdle($: EngineInterface, e: IdleEvent): Promise<LedgerRow | null> {
  if (!(await served($)) || typeof e.teammate_name !== 'string' || e.teammate_name === '') return null
  const who = await teammateNamed($, e.teammate_name, e.agent_id)
  const row = await record($, {
    ev: 'teammate.idle',
    ...(who?.pie == null ? {} : { pie: who.pie }),
    ...(who ? { aid: who.id } : {}),
    data: { name: e.teammate_name, ...(who ? { teammateId: who.teammateId } : {}) },
  })
  await refreshTeam($, { force: true })
  return row
}

/**
 * `classic.TaskCompleted` of a teammate's task, once `next` let it complete:
 * one `teammate.done` row `{ taskId, subject, name, teammateId }` on its pie.
 * A task the lead completed (no `teammate_name`) is not a teammate's and is
 * left out. Resolves the row, or null.
 */
export async function recordDone($: EngineInterface, e: DoneEvent): Promise<LedgerRow | null> {
  if (!(await served($)) || typeof e.teammate_name !== 'string' || e.teammate_name === '') return null
  const who = await teammateNamed($, e.teammate_name, e.agent_id)
  const subject = typeof e.task_subject === 'string' ? Array.from(e.task_subject).slice(0, SUBJECT_MAX).join('') : ''
  const row = await record($, {
    ev: 'teammate.done',
    ...(who?.pie == null ? {} : { pie: who.pie }),
    ...(who ? { aid: who.id } : {}),
    data: {
      taskId: typeof e.task_id === 'string' ? e.task_id : String(e.task_id ?? ''),
      subject,
      name: e.teammate_name,
      ...(who ? { teammateId: who.teammateId } : {}),
    },
  })
  await refreshTeam($, { force: true })
  return row
}

/**
 * True while the session has a team: a baker on the roster, or a teammate
 * this session spawned. A `skill.prompt` carries no loop id, so in team mode
 * a baker skill's start is left to its Skill tool call, which says whose
 * loop it ran in. Atoms only.
 */
export async function teamActive($: EngineInterface): Promise<boolean> {
  try {
    if ((await read($, teamAtom)).bakers.length > 0) return true
    const marks: Record<string, PassAgentMark> = await read($, agentsAtom)
    return Object.values(marks).some(mark => typeof mark.teammateId === 'string')
  } catch {
    return false
  }
}

/** The roster's count in words: `1 baker`, `3 bakers`. */
export function bakersWord(n: number): string {
  return `${n} baker${n === 1 ? '' : 's'}`
}
