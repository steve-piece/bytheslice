// mod/watchdog-actions.ts
// What the Pass does about a stall, warn-only: the first time a ledger row, a toast, a pane flag and a hidden note to the main conversation; a slice's second stall raises a HITL inbox item instead. Nothing is messaged or stopped.

import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import { record } from './capture.ts'
import { noteModel } from './checks.ts'
import { raiseHitl } from './hitl.ts'
import type { PassAgentMark, PassProjection, PassSeen, PassStalls } from './types'
import type { Stall } from './watchdog.ts'

const stallsAtom = atom({ plugin: 'bytheslice', key: 'pass.stalls' } as const, { agents: {}, counts: {} })
const agentsAtom = atom({ plugin: 'bytheslice', key: 'pass.agents' } as const, {})
const ledgerAtom = atom({ plugin: 'bytheslice', key: 'pass.ledger' } as const, null)

export const STALL_TOAST_MS = 8000
/** The kind a stall's HITL item carries in the ledger. */
export const STALL_KIND = 'agent-stalled'
/** Agents the stall book keeps. */
export const STALLS_KEEP = 200

/** What one new stall episode calls for: the first for its slice a note, any later one a HITL item. */
export type StallStep = { stall: Stall; key: string; n: number; act: 'note' | 'hitl' }

/** Whole minutes, at least one: `1 minute`, `12 minutes`. */
export function minutes(ms: number): string {
  const m = Math.max(1, Math.round(ms / 60000))
  return `${m} minute${m === 1 ? '' : 's'}`
}

type StallFacts = Pick<Stall, 'aid' | 'role' | 'runningMs' | 'idleMs'> & { teammateId?: string | undefined }

/** Who stalled, as the texts name it: `agent <role> <id>`, or `teammate <name>@<team> (<id>)`. */
export function stallWho(stall: StallFacts): string {
  return stall.teammateId ? `teammate ${stall.teammateId} (${stall.aid})` : `agent ${stall.role} ${stall.aid}`
}

/** The hidden note the main conversation reads on a first stall. It names role, id and minutes. */
export function stallNote(stall: StallFacts): string {
  return (
    `The Pass watchdog: ${stallWho(stall)} has been running ${minutes(stall.runningMs)} with no tool activity for ` +
    `${minutes(stall.idleMs)}; consider checking it, sending it a message, or stopping it. Nothing was stopped.`
  )
}

/** The toast a first stall shows. */
export function stallToast(stall: StallFacts, slice: string | null): string {
  const where = slice === null ? '' : ` · Slice ${slice}`
  const who = stall.teammateId ? `teammate ${stall.teammateId}` : `${stall.role} ${stall.aid}`
  return `Pass watchdog${where}: ${who} stalled, running ${minutes(stall.runningMs)}, idle ${minutes(stall.idleMs)}. Nothing was stopped.`
}

/** The HITL question a repeat stall raises. */
export function stallQuestion(stall: StallFacts, slice: string | null, n: number): string {
  const where = slice === null ? '' : ` on Slice ${slice}`
  return (
    `Stall ${n}${where}: ${stallWho(stall)} has run ${minutes(stall.runningMs)} with no tool activity for ` +
    `${minutes(stall.idleMs)}. Check it, send it a message or stop it? The Pass stopped nothing.`
  )
}

/**
 * Which stalls are new episodes, and the stall book after them. An agent whose
 * last flag judged the same `lastT` is the same episode and is skipped; a new
 * episode counts against its key (the slice, else the lone agent): count 1 is
 * a note, any later count a HITL item. Pure.
 */
export function planStalls(
  book: PassStalls,
  stalls: readonly Stall[],
  keyOf: (aid: string) => string,
  now: number,
): { steps: StallStep[]; book: PassStalls } {
  const agents = { ...book.agents }
  const counts = { ...book.counts }
  const steps: StallStep[] = []
  for (const stall of stalls) {
    const prev = agents[stall.aid]
    if (prev && prev.lastT === stall.lastT) continue
    const key = keyOf(stall.aid)
    const n = (counts[key] ?? 0) + 1
    counts[key] = n
    agents[stall.aid] = { n, lastT: stall.lastT, at: now, key }
    steps.push({ stall, key, n, act: n === 1 ? 'note' : 'hitl' })
  }
  const kept = Object.entries(agents).sort(([, a], [, b]) => b.at - a.at).slice(0, STALLS_KEEP)
  return { steps, book: { agents: Object.fromEntries(kept), counts } }
}

/** Agents flagged now: a stall whose episode no later stamp has ended. Pure. */
export function stalledIds(book: PassStalls | null, seen: Readonly<Record<string, PassSeen>> | null): Set<string> {
  const out = new Set<string>()
  for (const [aid, mark] of Object.entries(book?.agents ?? {})) {
    const stamp = seen?.[aid]
    if (!stamp || stamp.lastT <= mark.lastT) out.add(aid)
  }
  return out
}

function toast($: EngineInterface, text: string): void {
  try {
    $.ui.toast(text, { timeoutMs: STALL_TOAST_MS })
  } catch {
    // The ledger row and the pane flag still say it.
  }
}

/**
 * Responds to each new stall episode: one `agent.stalled` ledger row `{ aid,
 * role, runningMs, idleMs, n }`; the first for its slice a toast and a hidden
 * note to the main conversation, a later one a HITL inbox item in place of
 * the note (one open item per slice). No message goes to the agent and
 * nothing is stopped. Resolves the steps taken.
 */
export async function respondToStalls($: EngineInterface, stalls: readonly Stall[], now: number): Promise<StallStep[]> {
  const marks: Record<string, PassAgentMark> = await read($, agentsAtom).catch(() => ({}))
  const keyOf = (aid: string): string => marks[aid]?.slice ?? `agent:${aid}`
  let steps: StallStep[] = []
  await update($, stallsAtom, book => {
    const planned = planStalls(book ?? { agents: {}, counts: {} }, stalls, keyOf, now)
    steps = planned.steps
    return planned.book
  })
  for (const step of steps) {
    const { stall } = step
    const mark = marks[stall.aid]
    const slice = mark?.slice ?? null
    const pie = mark?.pie ?? (slice !== null ? Number(slice.split('.')[0]) : null)
    await record($, {
      ev: 'agent.stalled',
      ...(pie === null || Number.isNaN(pie) ? {} : { pie }),
      ...(slice === null ? {} : { slice }),
      aid: stall.aid,
      ...(mark?.type ? { agent: mark.type } : {}),
      data: {
        aid: stall.aid,
        role: stall.role,
        runningMs: stall.runningMs,
        idleMs: stall.idleMs,
        n: step.n,
        ...(stall.teammateId ? { teammateId: stall.teammateId } : {}),
      },
    })
    if (step.act === 'note') {
      toast($, stallToast(stall, slice))
      await noteModel($, stallNote(stall), null)
      continue
    }
    const projection: PassProjection | null = await read($, ledgerAtom).catch(() => null)
    const open = (projection?.hitl?.open ?? []).some(item => item.kind === STALL_KIND && slice !== null && item.slice === slice)
    if (open) {
      toast($, stallToast(stall, slice))
      continue
    }
    await raiseHitl($, {
      category: 'other',
      question: stallQuestion(stall, slice, step.n),
      ...(slice === null ? {} : { slice }),
      ...(pie === null || Number.isNaN(pie) ? {} : { pie }),
      source: 'pass',
      asked: 'pane',
      kind: STALL_KIND,
      aid: stall.aid,
    })
  }
  return steps
}
