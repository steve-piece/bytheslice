// mod/notify.ts
// The Pass's native notifications, each sent once: a blocking HITL question and a finished pie; one no channel sent falls back to a toast.

import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import { flipped } from './capture.ts'
import type { PassChecklist } from './types'

const notifiedAtom = atom({ plugin: 'bytheslice', key: 'pass.notified' } as const, [])

export const HITL_TITLE = 'ByTheSlice needs you'
export const PIE_TITLE = 'ByTheSlice'
/** Keys of notifications already sent this session, newest kept. */
export const NOTIFIED_KEEP = 200
export const FALLBACK_TOAST_MS = 10000
/** How much of a question a notification body or a toast carries. */
export const BODY_MAX = 300
const TOAST_MAX = 240

/** The four categories that halt a ByTheSlice loop until the operator answers. */
export const BLOCKING_CATEGORIES: ReadonlySet<string> = new Set([
  'prd_ambiguity',
  'external_credentials',
  'destructive_operation',
  'creative_direction',
])

/** What a notification came to: the channel that sent it, or why none did (`not-blocking` and `error` are the Pass's own words). */
export type NotifyOutcome = { isSent: true; channel: string } | { isSent: false; reason: string }

/** The facts a HITL notification needs. */
export type NotifyItem = { id: string; category: string; question: string; asked: 'chat' | 'pane'; slice?: string | undefined }

/** Text on one line, cut to `max` characters with an ellipsis. */
export function cutLine(text: string, max: number): string {
  const chars = Array.from(text.replace(/\s+/g, ' ').trim())
  return chars.length <= max ? chars.join('') : `${chars.slice(0, max - 1).join('').trimEnd()}…`
}

/**
 * A blocking HITL: one of the four categories, or any item the model was told
 * to ask in chat (the loop stops on it). A Pass item only the pane shows (a
 * stall) is not blocking: it toasts and never raises a native notification.
 */
export function isBlocking(item: Pick<NotifyItem, 'category' | 'asked'>): boolean {
  return BLOCKING_CATEGORIES.has(item.category) || item.asked === 'chat'
}

/** The toast a HITL item shows when no native notification carried it. */
export function hitlToast(item: Pick<NotifyItem, 'category' | 'question' | 'slice'>): string {
  const where = item.slice === undefined ? '' : ` · Slice ${item.slice}`
  return cutLine(`HITL ${item.category}${where}: ${item.question}`, TOAST_MAX)
}

function toast($: EngineInterface, text: string): void {
  try {
    $.ui.toast(text, { timeoutMs: FALLBACK_TOAST_MS })
  } catch {
    // The pane and the band still show it.
  }
}

// Claims a key: true the first time this session, false after.
async function claim($: EngineInterface, key: string): Promise<boolean> {
  try {
    if ((await read($, notifiedAtom)).includes(key)) return false
    await update($, notifiedAtom, keys => [...(keys ?? []), key].slice(-NOTIFIED_KEEP))
  } catch {
    // Without the atom the notification still goes once from this call.
  }
  return true
}

/**
 * Sends `text` as a native notification once per `key`, reading `isSent`; one
 * no channel sent (or a rejected call) shows `fallback` as a toast instead.
 * Resolves the outcome, or null when the key was already sent.
 */
export async function sendOnce(
  $: EngineInterface,
  key: string,
  text: string,
  title: string,
  fallback: string,
): Promise<NotifyOutcome | null> {
  if (!(await claim($, key))) return null
  let outcome: NotifyOutcome
  try {
    const sent = await $.ui.notify(text, { title })
    outcome = sent.isSent ? { isSent: true, channel: sent.channel } : { isSent: false, reason: sent.reason }
  } catch {
    outcome = { isSent: false, reason: 'error' }
  }
  if (!outcome.isSent) toast($, fallback)
  return outcome
}

/**
 * A raised HITL item: a blocking one goes out as a native notification titled
 * `ByTheSlice needs you` (a toast when no channel sent it); any other toasts.
 * Resolves what happened, for the `hitl.raised` row.
 */
export async function notifyHitl($: EngineInterface, item: NotifyItem): Promise<NotifyOutcome> {
  if (!isBlocking(item)) {
    toast($, hitlToast(item))
    return { isSent: false, reason: 'not-blocking' }
  }
  const sent = await sendOnce($, `hitl:${item.id}`, cutLine(item.question, BODY_MAX), HITL_TITLE, hitlToast(item))
  return sent ?? { isSent: false, reason: 'already-sent' }
}

/** Pies a checklist write completed: a slice of the pie flipped to done and every slice of it is done now. Pure. */
export function piesReady(before: PassChecklist | null, after: PassChecklist | null): number[] {
  const pies = new Set(flipped(before, after).map(flip => flip.pie))
  return [...pies].filter(n => {
    const pie = after?.pies.find(entry => entry.n === n)
    return pie !== undefined && pie.slices.length > 0 && pie.slices.every(slice => slice.done)
  })
}

/** The words a finished pie's notification says. */
export const pieText = (n: number): string => `Pie ${n} is ready for /box-it-up`

/** After a checklist write: each pie whose last slice just flipped to done is announced once. Resolves the pies sent. */
export async function notifyPiesReady(
  $: EngineInterface,
  before: PassChecklist | null,
  after: PassChecklist | null,
): Promise<number[]> {
  const out: number[] = []
  for (const n of piesReady(before, after)) {
    const sent = await sendOnce($, `pie:${n}`, pieText(n), PIE_TITLE, pieText(n))
    if (sent !== null) out.push(n)
  }
  return out
}
