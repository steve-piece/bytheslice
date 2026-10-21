// mod/watchdog.ts
// The Pass watchdog: tool.call and turn.start stamp each agent loop's last activity, and a scan every 30 seconds flags an agent (a teammate in a turn included) running past its role's budget with no activity. It warns and never stops anything.

import { atom, read, update } from 'claude-code'
import type { AgentInfo, EngineInterface, Timer } from 'claude-code'

import { roleOf } from './ledger-projection.ts'
import { DEFAULT_POLICY, budgetMs } from './policy.ts'
import type { PassAgentMark, PassSeen, PassWatchdog } from './types'
import { respondToStalls } from './watchdog-actions.ts'

const seenAtom = atom({ plugin: 'bytheslice', key: 'pass.seen' } as const, {})
const agentsAtom = atom({ plugin: 'bytheslice', key: 'pass.agents' } as const, {})
const policyAtom = atom({ plugin: 'bytheslice', key: 'pass.policy' } as const, null)
const checklistAtom = atom({ plugin: 'bytheslice', key: 'pass.checklist' } as const, null)
const limitedAtom = atom({ plugin: 'bytheslice', key: 'pass.limited' } as const, false)

/** How often the watchdog scans `$.agent.list()`. */
export const SCAN_MS = 30000
/** A loop's stamp is written at most this often, so redraws stay cheap. */
export const STAMP_MS = 5000
/** Agents the stamp map keeps, newest activity first. */
export const SEEN_KEEP = 200
/** A stamp of an agent no longer listed is dropped once it is this old. */
export const SEEN_STALE_MS = 60 * 60 * 1000

const LIVE = new Set(['pending', 'running', 'waiting'])
const ENDED = new Set(['completed', 'failed', 'killed'])

/** One agent the scan found stalled: running past its role's budget with no activity for longer than `idleMs`. */
export type Stall = {
  aid: string
  role: string
  runningMs: number
  idleMs: number
  budgetMs: number
  /** The activity stamp the stall was judged from; a later stamp ends the episode. */
  lastT: number
  /** When its running time counts from: its start, or for a teammate its current turn's start. */
  startT: number
  /** A teammate's `<name>@<team>`; absent for a subagent. */
  teammateId?: string
}

/** The fields of an `$.agent.list()` entry the scan reads. */
export type ScanAgent = Pick<AgentInfo, 'id' | 'status' | 'type'> & { teammateId?: string | undefined; parentId?: string | undefined }

const hasLiveChild = (agent: ScanAgent, list: readonly ScanAgent[]): boolean =>
  list.some(child => child.parentId === agent.id && LIVE.has(child.status))

/**
 * Whether the scan judges an agent. A subagent: `running`, or `waiting` with
 * no live child agent (held on its own background work, such as a
 * backgrounded `sleep`, or on a plan's approval). A teammate: `running` in a
 * turn only; one `idle` waits for a message and one `waiting` is held, so
 * neither is stalled. One with a live child it spawned is not judged; the
 * child is judged instead.
 */
export function judged(agent: ScanAgent, list: readonly ScanAgent[]): boolean {
  if (agent.teammateId !== undefined) return agent.status === 'running' && !hasLiveChild(agent, list)
  if (agent.status === 'running') return true
  return agent.status === 'waiting' && !hasLiveChild(agent, list)
}

/**
 * The stalled agents among `list`: judged (see `judged`), with a stamp,
 * running longer than its role's budget and idle longer than `idleMs`. A
 * teammate's running time counts from its current turn's start, since it
 * idles between turns. Pure: no clock, no `$`.
 */
export function scanAgents(
  list: readonly ScanAgent[],
  seen: Readonly<Record<string, PassSeen>>,
  now: number,
  cfg: PassWatchdog,
): Stall[] {
  const out: Stall[] = []
  for (const agent of list) {
    if (!judged(agent, list)) continue
    const stamp = seen[agent.id]
    if (!stamp) continue
    const role = stamp.role === 'agent' ? roleOf(agent.type) : stamp.role
    const budget = budgetMs(role, cfg)
    const teammate = agent.teammateId !== undefined
    const from = teammate ? stamp.turnT ?? stamp.startT : stamp.startT
    const runningMs = now - from
    const idleMs = now - stamp.lastT
    if (runningMs > budget && idleMs > cfg.idleMs) {
      out.push({
        aid: agent.id,
        role,
        runningMs,
        idleMs,
        budgetMs: budget,
        lastT: stamp.lastT,
        startT: from,
        ...(teammate && agent.teammateId ? { teammateId: agent.teammateId } : {}),
      })
    }
  }
  return out
}

/**
 * The stamp map after a scan: every live listed agent (a teammate, idle or
 * not, included) has an entry (its spawn time, else now, as start and first
 * activity); an agent the list shows ended loses its entry, and so does an
 * unlisted one past an hour. Pure.
 */
export function reconcileSeen(
  prev: Readonly<Record<string, PassSeen>>,
  list: readonly ScanAgent[],
  marks: Readonly<Record<string, PassAgentMark>>,
  now: number,
): Record<string, PassSeen> {
  const next: Record<string, PassSeen> = {}
  const listed = new Map(list.map(agent => [agent.id, agent]))
  for (const [id, stamp] of Object.entries(prev)) {
    const agent = listed.get(id)
    if (agent && ENDED.has(agent.status)) continue
    if (!agent && now - stamp.lastT > SEEN_STALE_MS) continue
    next[id] = agent && stamp.role === 'agent' ? { ...stamp, role: roleOf(agent.type) } : stamp
  }
  for (const agent of list) {
    const onTeam = agent.teammateId !== undefined && agent.status === 'idle'
    if ((!LIVE.has(agent.status) && !onTeam) || next[agent.id]) continue
    const start = marks[agent.id]?.at ?? now
    next[agent.id] = { lastT: start, role: roleOf(agent.type), startT: start }
  }
  const kept = Object.entries(next).sort(([, a], [, b]) => b.lastT - a.lastT).slice(0, SEEN_KEEP)
  return Object.fromEntries(kept)
}

async function nowOf($: EngineInterface): Promise<number> {
  try {
    return await $.clock.now()
  } catch {
    return Date.now()
  }
}

/**
 * Stamps an agent loop's activity (a `tool.call` or `turn.start` carrying
 * `e.agentId`; the main loop carries none and is skipped): `lastT` now, at
 * most once per 5 seconds per agent. Resolves whether it wrote.
 */
export async function stamp($: EngineInterface, agentId: unknown): Promise<boolean> {
  if (typeof agentId !== 'string' || agentId === '') return false
  const now = await nowOf($)
  const known = (await read($, seenAtom))[agentId]
  if (known && now >= known.lastT && now - known.lastT < STAMP_MS) return false
  const mark = known ? undefined : (await read($, agentsAtom))[agentId]
  await update($, seenAtom, prev => {
    const before = prev?.[agentId] ?? known
    const entry: PassSeen = {
      lastT: Math.max(now, before?.lastT ?? 0),
      role: before?.role ?? roleOf(mark?.type),
      startT: before?.startT ?? mark?.at ?? now,
      ...(before?.turnT === undefined ? {} : { turnT: before.turnT }),
    }
    return { ...(prev ?? {}), [agentId]: entry }
  })
  return true
}

/**
 * Stamps the start of a loop's turn (`turn.start` with `e.agentId`): `lastT`
 * and `turnT` now, never held back by the 5 second throttle (a turn starts
 * rarely, and a teammate's running time counts from it). Resolves whether it wrote.
 */
export async function stampTurn($: EngineInterface, agentId: unknown): Promise<boolean> {
  if (typeof agentId !== 'string' || agentId === '') return false
  const now = await nowOf($)
  const known = (await read($, seenAtom))[agentId]
  const mark = known ? undefined : (await read($, agentsAtom))[agentId]
  await update($, seenAtom, prev => {
    const before = prev?.[agentId] ?? known
    const entry: PassSeen = {
      lastT: Math.max(now, before?.lastT ?? 0),
      role: before?.role ?? roleOf(mark?.type),
      startT: before?.startT ?? mark?.at ?? now,
      turnT: now,
    }
    return { ...(prev ?? {}), [agentId]: entry }
  })
  return true
}

/**
 * One scan: in a ByTheSlice project with the watchdog on, reads the agent
 * list, keeps the stamp map current and hands each stall to the responses
 * (warn-only). Resolves the stalls it found.
 */
export async function scan($: EngineInterface): Promise<Stall[]> {
  if (await read($, limitedAtom)) return []
  if ((await read($, checklistAtom)) === null) return []
  const policy = (await read($, policyAtom)) ?? DEFAULT_POLICY
  const cfg = policy.watchdog ?? DEFAULT_POLICY.watchdog
  if (!cfg.enabled) return []
  const [list, marks, now] = await Promise.all([$.agent.list(), read($, agentsAtom), nowOf($)])
  const before = await read($, seenAtom)
  const fresh = reconcileSeen(before, list, marks, now)
  const seen =
    JSON.stringify(fresh) === JSON.stringify(before)
      ? before
      : await update($, seenAtom, prev => reconcileSeen(prev ?? {}, list, marks, now))
  const stalls = scanAgents(list, seen, now, cfg)
  if (stalls.length > 0) await respondToStalls($, stalls, now)
  return stalls
}

let timer: Timer | null = null

/** From `session.start`: scans every 30 seconds until `session.end` (or a reload) cancels it. */
export async function startWatchdog($: EngineInterface): Promise<void> {
  timer?.cancel()
  try {
    timer = $.clock.every(SCAN_MS, () => {
      void scan($).catch(() => [])
    })
  } catch {
    timer = null
  }
}

/** At `session.end`: the scan stops. */
export function stopWatchdog(): void {
  timer?.cancel()
  timer = null
}
