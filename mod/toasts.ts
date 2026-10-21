// mod/toasts.ts
// The Pass toasts: one short line when a slice is done, a verdict fails or a branch is pushed, once per ledger row.

import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { LedgerRow } from './types'

const toastedAtom = atom({ plugin: 'bytheslice', key: 'pass.toasted' } as const, [])

/** How many announced row keys the dedupe set keeps. */
export const TOASTED_KEEP = 200
export const TOAST_MS = 5000

/** A ledger row's identity for dedupe: session, time and event. */
export function rowKey(row: LedgerRow): string {
  return `${row.sid}|${row.t}|${row.ev}|${row.aid ?? ''}|${row.slice ?? ''}`
}

const where = (row: LedgerRow): string => (row.slice === undefined ? '' : `Slice ${row.slice} `)

/** The toast a row earns, or null: slice done, a failed verdict, a push. */
export function toastText(row: LedgerRow): string | null {
  const data = row.data ?? {}
  if (row.ev === 'slice.done') {
    const verdict = data.verdict as { overall?: unknown } | null | undefined
    const tail = verdict && typeof verdict.overall === 'string' ? ` · verifier ${verdict.overall}` : ''
    return `${where(row)}done${tail}`.replace(/^done/, 'Slice done')
  }
  if (row.ev === 'verdict' && data.overall === 'fail') {
    const targets = Array.isArray(data.fix_targets) ? data.fix_targets.length : 0
    const gate = typeof data.gate === 'string' ? data.gate : 'gate'
    return `${where(row)}${gate} failed · ${targets} fix target${targets === 1 ? '' : 's'}`
  }
  if (row.ev === 'push') {
    const branch = typeof data.branch === 'string' ? data.branch : null
    return branch ? `Pushed ${branch}` : 'Pushed'
  }
  return null
}

/** Toasts a row once: a row already announced, or one that earns no toast, shows nothing. */
export async function toastRow($: EngineInterface, row: LedgerRow): Promise<boolean> {
  const text = toastText(row)
  if (text === null) return false
  const key = rowKey(row)
  try {
    const seen = await read($, toastedAtom)
    if (seen.includes(key)) return false
    await update($, toastedAtom, keys => [...(keys ?? []), key].slice(-TOASTED_KEEP))
    $.ui.toast(text, { timeoutMs: TOAST_MS })
    return true
  } catch {
    return false
  }
}
