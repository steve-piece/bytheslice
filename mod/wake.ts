// mod/wake.ts
// bts_wake, a teammate's stand-in for ScheduleWakeup (which teammates lack): a $.clock.after timer that, when it fires, sends the caller's loop a message (a send wakes an idle teammate; a hidden note cannot) and records a ledger note row.

import type { EngineInterface, Timer } from 'claude-code'

import { record } from './capture.ts'
import type { LedgerRow } from './ledger.ts'
import { teammateOf } from './team.ts'
import type { Teammate } from './team.ts'

export const WAKE_TOOL = 'bts_wake'
/** The name a session lists the tool under (`mcp__<plugin>__<name>`); register.tsx matches it. */
export const WAKE_LISTED = 'mcp__bytheslice__bts_wake'
/** The shortest and longest wait: ten seconds to an hour (ScheduleWakeup clamps to one minute to an hour). */
export const WAKE_MIN_MS = 10000
export const WAKE_MAX_MS = 3600000
export const WAKE_NOTE_MAX = 500
export const WAKE_DEFAULT_NOTE = 'your bts_wake timer is up; call bts_status and carry on.'
const WAKE_TOAST_MS = 8000

const DESCRIPTION = [
  'Wakes you after a delay. For a teammate of an agent team, which has no ScheduleWakeup: call it with { afterMs, note },',
  'then end your turn; when the time is up the Pass sends you the note as a message, which wakes you if you are idle.',
  `afterMs is clamped to ${WAKE_MIN_MS / 1000} seconds to ${WAKE_MAX_MS / 60000} minutes. One timer per teammate: arming again`,
  'replaces the earlier one. Only a teammate arms it (the main conversation has ScheduleWakeup). It returns at once and',
  'never blocks; the ledger records whether the message was delivered.',
].join(' ')

type Armed = { timer: Timer; teammateId: string; at: number }

// One pending wake per teammate loop. Module state: a reload drops the timers
// with the old environment, and session.end cancels them.
const armed = new Map<string, Armed>()

/** Registers bts_wake with its schema in the prompt's tool list; resolves the listed name. */
export async function registerWake($: EngineInterface): Promise<string> {
  const listed = await $.tool.register({
    name: WAKE_TOOL,
    description: DESCRIPTION,
    inputSchema: {
      type: 'object',
      properties: {
        afterMs: {
          type: 'number',
          description: `Milliseconds to wait before the wake, ${WAKE_MIN_MS} to ${WAKE_MAX_MS}.`,
        },
        note: { type: 'string', description: `What the wake message says, up to ${WAKE_NOTE_MAX} characters. Never a secret.` },
      },
      required: ['afterMs'],
      additionalProperties: false,
    },
    isDeferred: false,
  })
  return listed.tool
}

/** A wait in milliseconds clamped to ten seconds to an hour, or null when it is not a number. Pure. */
export function wakeMs(value: unknown): number | null {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value
  if (typeof n !== 'number' || !Number.isFinite(n)) return null
  return Math.min(WAKE_MAX_MS, Math.max(WAKE_MIN_MS, Math.round(n)))
}

/** The note cut to 500 characters, or the default when none was given. Pure. */
export function wakeNote(value: unknown): string {
  const text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
  return text === '' ? WAKE_DEFAULT_NOTE : Array.from(text).slice(0, WAKE_NOTE_MAX).join('')
}

/** The message the teammate reads when its wake fires. Pure. */
export function wakeText(note: string, afterMs: number): string {
  return `bts_wake (${Math.round(afterMs / 1000)} s): ${note}`
}

async function nowOf($: EngineInterface): Promise<number> {
  try {
    return await $.clock.now()
  } catch {
    return Date.now()
  }
}

const ENDED = new Set(['completed', 'failed', 'killed'])

/**
 * The wake firing: sends the teammate its note as a message (which wakes it
 * when idle; one that ended is not resumed), then one ledger `note` row
 * `{ kind: 'wake', teammateId, name, afterMs, note, delivered, reason? }` and,
 * when nothing was delivered, a toast. Resolves the row, or null.
 */
export async function fireWake($: EngineInterface, who: Teammate, note: string, afterMs: number): Promise<LedgerRow | null> {
  let delivered = false
  let reason: string | null = null
  try {
    const listed = (await $.agent.list()).find(agent => agent.id === who.id)
    if (!listed || ENDED.has(listed.status)) {
      reason = 'the teammate has ended'
    } else {
      const sent = await $.session.send({ to: { agentId: who.id }, text: wakeText(note, afterMs) })
      delivered = sent.isDelivered
      reason = sent.isDelivered ? null : sent.reason
    }
  } catch (error) {
    reason = error instanceof Error ? error.message.split('\n')[0] ?? 'the send failed' : 'the send failed'
  }
  if (!delivered) {
    try {
      $.ui.toast(`bts_wake could not reach ${who.name}: ${reason ?? 'not delivered'}`, { timeoutMs: WAKE_TOAST_MS })
    } catch {
      // The ledger row still says it.
    }
  }
  return record($, {
    ev: 'note',
    ...(who.pie === null ? {} : { pie: who.pie }),
    aid: who.id,
    data: {
      kind: 'wake',
      teammateId: who.teammateId,
      name: who.name,
      afterMs,
      note,
      delivered,
      ...(reason === null ? {} : { reason: Array.from(reason).slice(0, 300).join('') }),
    },
  })
}

/**
 * Serves bts_wake for the loop that called it: a teammate's call arms one
 * timer (replacing its earlier one) and answers at once; any other loop's
 * call arms nothing and says why. Resolves the text the model reads.
 */
export async function serveWake($: EngineInterface, input: Record<string, unknown>, agentId: unknown): Promise<string> {
  const who = await teammateOf($, agentId)
  if (!who) {
    return 'not armed: bts_wake wakes a teammate of an agent team. The main conversation has ScheduleWakeup, and a subagent runs until it returns. Nothing was halted.'
  }
  const ms = wakeMs(input.afterMs)
  if (ms === null) return 'not armed: afterMs must be a number of milliseconds. Nothing was halted.'
  const note = wakeNote(input.note)
  armed.get(who.id)?.timer.cancel()
  const at = await nowOf($)
  let timer: Timer
  try {
    timer = $.clock.after(ms, () => {
      if (armed.get(who.id)?.timer === timer) armed.delete(who.id)
      void fireWake($, who, note, ms).catch(() => null)
    })
  } catch {
    return 'not armed: the Pass could not start a timer. Nothing was halted.'
  }
  armed.set(who.id, { timer, teammateId: who.teammateId, at })
  return (
    `armed: in ${Math.round(ms / 1000)} s the Pass sends you "${note}" as a message, which wakes you if you are idle. ` +
    'End your turn now. Arming again replaces this timer.'
  )
}

/** How many wakes are pending, by teammate loop id. */
export function pendingWakes(): string[] {
  return [...armed.keys()]
}

/** At `session.end`: every pending wake is cancelled. */
export function stopWakes(): void {
  for (const entry of armed.values()) entry.timer.cancel()
  armed.clear()
}
