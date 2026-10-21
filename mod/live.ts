// mod/live.ts
// Keeps the Pass's live atoms current: the ledger projection (ledger plus kitchen activity) and the agent list poll.

import { atom, read, update } from 'claude-code'
import type { EngineInterface, Timer } from 'claude-code'

import { readRows } from './ledger.ts'
import { activityPath, projectLedger, readActivity, roleOf } from './ledger-projection.ts'
import type { PassLive, PassLiveEntry, PassProjection } from './types'

const checklistAtom = atom({ plugin: 'bytheslice', key: 'pass.checklist' } as const, null)
const ledgerAtom = atom({ plugin: 'bytheslice', key: 'pass.ledger' } as const, null)
const liveAtom = atom({ plugin: 'bytheslice', key: 'pass.live' } as const, { at: 0, agents: [] })
const agentsAtom = atom({ plugin: 'bytheslice', key: 'pass.agents' } as const, {})

export const PULSE_MS = 5000
const ACTIVE = new Set(['pending', 'running', 'waiting'])

async function nowOf($: EngineInterface): Promise<number> {
  try {
    return await $.clock.now()
  } catch {
    return Date.now()
  }
}

/** Reads the ledger, the activity log and the checklist atom, and writes the projection atom. */
export async function refreshLedger($: EngineInterface): Promise<PassProjection | null> {
  try {
    const [rows, activity, checklist, at] = await Promise.all([
      readRows($),
      readActivity($),
      read($, checklistAtom),
      nowOf($),
    ])
    const projection = projectLedger(rows, activity, checklist, at)
    await update($, ledgerAtom, () => projection)
    return projection
  } catch {
    return null
  }
}

/** True while any agent of the list is pending, running or waiting. */
export function hasActive(live: PassLive): boolean {
  return live.agents.some(agent => ACTIVE.has(agent.status))
}

/**
 * Polls `$.agent.list()` and writes `pass.live` when the list changed, or on
 * every poll while an agent runs (so its running time redraws). Resolves the poll.
 */
export async function pollAgents($: EngineInterface): Promise<PassLive | null> {
  try {
    const [list, marks, before, at] = await Promise.all([
      $.agent.list(),
      read($, agentsAtom),
      read($, liveAtom),
      nowOf($),
    ])
    const agents: PassLiveEntry[] = list.map(agent => {
      const mark = marks[agent.id]
      const known = before.agents.find(entry => entry.id === agent.id)
      return {
        id: agent.id,
        role: roleOf(agent.type),
        status: agent.status,
        startedAt: mark?.at ?? known?.startedAt ?? at,
      }
    })
    const next: PassLive = { at, agents }
    const same = JSON.stringify(before.agents) === JSON.stringify(agents)
    if (!same || hasActive(next)) await update($, liveAtom, () => next)
    return next
  } catch {
    return null
  }
}

let pulse: Timer | null = null

async function activityMtime($: EngineInterface): Promise<number | null> {
  try {
    const stat = await $.fs.stat(await activityPath($))
    return stat.mtimeMs + stat.size
  } catch {
    return null
  }
}

/** Every five seconds: poll the agents, and project again when the activity log changed. */
export async function startPulse($: EngineInterface): Promise<void> {
  pulse?.cancel()
  let seen = await activityMtime($)
  try {
    pulse = $.clock.every(PULSE_MS, () => {
      void (async () => {
        await pollAgents($)
        const mark = await activityMtime($)
        if (mark === seen) return
        seen = mark
        await refreshLedger($)
      })().catch(() => undefined)
    })
  } catch {
    pulse = null
  }
}
