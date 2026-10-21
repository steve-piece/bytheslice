// mod/strip.ts
// The cross-session roadmap strip: each session keeps one $.store entry (strip:<projectKey>:<sid>) saying where it is, at most once per 10 seconds, deletes it at session end, and reads the other live sessions of the same project, read-only.

import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import { findSlice } from './ledger-projection.ts'
import { ledgerPath, sessionId } from './ledger.ts'
import { activePie, activeSlice } from './projection.ts'
import type { PassStripEntry } from './types'

const checklistAtom = atom({ plugin: 'bytheslice', key: 'pass.checklist' } as const, null)
const ledgerAtom = atom({ plugin: 'bytheslice', key: 'pass.ledger' } as const, null)
const branchAtom = atom({ plugin: 'bytheslice', key: 'pass.branch' } as const, null)
const stripAtom = atom({ plugin: 'bytheslice', key: 'pass.strip' } as const, [])

export const STRIP_PREFIX = 'strip:'
/** A session writes its entry at most this often. */
export const STRIP_WRITE_MS = 10000
/** Entries older than this belong to a session that ended without saying so. */
export const STRIP_MAX_AGE_MS = 6 * 60 * 60 * 1000
/** An unchanged entry is written again this often, so a quiet live session does not age out. */
export const STRIP_HEARTBEAT_MS = 30 * 60 * 1000
/** The other sessions are read again at most this often. */
export const STRIP_READ_MS = 30000
/** Other sessions the pane lists. */
export const STRIP_SHOWN = 4

export type StripOther = { sid: string; entry: PassStripEntry }

async function nowOf($: EngineInterface): Promise<number> {
  try {
    return await $.clock.now()
  } catch {
    return Date.now()
  }
}

/** The project key: the ledger root (the primary checkout), so every worktree of a project shares it. */
export async function projectKey($: EngineInterface): Promise<string> {
  const path = await ledgerPath($)
  return path.slice(0, path.lastIndexOf('/.bytheslice/'))
}

export const stripKey = (project: string, sid: string): string => `${STRIP_PREFIX}${project}:${sid}`

function isEntry(value: unknown): value is PassStripEntry {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const v = value as Record<string, unknown>
  return typeof v.t === 'number' && Number.isFinite(v.t) && typeof v.status === 'string'
}

/**
 * The other sessions' entries for a project: its keys only, never `sid`'s own,
 * none older than six hours, newest first. Pure.
 */
export function othersOf(entries: Readonly<Record<string, unknown>>, project: string, sid: string, now: number): StripOther[] {
  const prefix = `${STRIP_PREFIX}${project}:`
  const out: StripOther[] = []
  for (const [key, value] of Object.entries(entries)) {
    if (!key.startsWith(prefix)) continue
    const other = key.slice(prefix.length)
    if (other === '' || other === sid || other.includes(':') || !isEntry(value)) continue
    if (now - value.t > STRIP_MAX_AGE_MS) continue
    out.push({ sid: other, entry: value })
  }
  return out.sort((a, b) => b.entry.t - a.entry.t)
}

/** An age as `just now`, `2 min ago` or `3 h ago`. */
export function agoWords(ms: number): string {
  const m = Math.floor(Math.max(0, ms) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  return `${Math.floor(m / 60)} h ago`
}

/** One strip line: `Pie 4 · Slice 4.2 verifying · 2 min ago`. */
export function stripLine(entry: PassStripEntry, now: number): string {
  const where =
    entry.pie === null ? 'no open pie' : entry.slice === null ? `Pie ${entry.pie} · ${entry.status}` : `Pie ${entry.pie} · Slice ${entry.slice} ${entry.status}`
  return `${where} · ${agoWords(now - entry.t)}`
}

/** This session's entry from its atoms: active pie and slice, the slice's status, the branch. */
export async function ownEntry($: EngineInterface, now: number): Promise<PassStripEntry> {
  const [checklist, ledger, branch] = await Promise.all([
    read($, checklistAtom).catch(() => null),
    read($, ledgerAtom).catch(() => null),
    read($, branchAtom).catch(() => null),
  ])
  const pie = activePie(checklist)
  const slice = activeSlice(checklist)
  const status = slice ? findSlice(ledger, slice.id)?.status ?? 'queued' : pie ? 'open' : 'done'
  return { pie: pie?.n ?? null, slice: slice?.id ?? null, status, branch, t: now }
}

// Module state per load: what this session last wrote and when, when the pulse
// last ran and last read, and the project key once resolved.
let written: { key: string; body: string; t: number } | null = null
let lastPulse = Number.NEGATIVE_INFINITY
let lastRead = Number.NEGATIVE_INFINITY
let project: string | null = null

/** Forgets the last write at session start, so the new session writes and reads at once. */
export function resetStrip(): void {
  written = null
  lastPulse = Number.NEGATIVE_INFINITY
  lastRead = Number.NEGATIVE_INFINITY
  project = null
}

async function keyOf($: EngineInterface): Promise<string> {
  project ??= await projectKey($)
  return project
}

/**
 * Writes this session's entry when where it stands changed, at most once per
 * 10 seconds (the next pulse catches a change held back), and every 30 minutes
 * unchanged. Resolves whether it wrote.
 */
export async function writeStrip($: EngineInterface, at?: number): Promise<boolean> {
  try {
    // Outside a ByTheSlice project there is nothing to say.
    if ((await read($, checklistAtom).catch(() => null)) === null) return false
    const now = at ?? (await nowOf($))
    const key = stripKey(await keyOf($), await sessionId($))
    const entry = await ownEntry($, now)
    const body = JSON.stringify({ ...entry, t: 0 })
    if (written && written.key === key && written.body === body && now - written.t < STRIP_HEARTBEAT_MS) return false
    if (written && written.key === key && now - written.t < STRIP_WRITE_MS) return false
    await $.store.set(key, entry)
    written = { key, body, t: now }
    return true
  } catch {
    return false
  }
}

/** Reads the other live sessions of this project into `pass.strip`. Never throws. */
export async function readStrip($: EngineInterface, at?: number): Promise<StripOther[]> {
  try {
    const [key, sid, now, keys] = await Promise.all([keyOf($), sessionId($), at ?? nowOf($), $.store.keys()])
    const prefix = `${STRIP_PREFIX}${key}:`
    const entries: Record<string, unknown> = {}
    for (const key of keys) if (key.startsWith(prefix)) entries[key] = await $.store.get(key)
    const others = othersOf(entries, key, sid, now)
    const before = await read($, stripAtom).catch(() => [])
    if (JSON.stringify(before) !== JSON.stringify(others)) await update($, stripAtom, () => others)
    return others
  } catch {
    return []
  }
}

/**
 * The pulse's step, at most once per 10 seconds (`force` at session start):
 * writes this session's entry if it moved, and reads the others every 30 seconds.
 */
export async function pulseStrip($: EngineInterface, force = false): Promise<StripOther[] | null> {
  const now = await nowOf($)
  if (!force && now - lastPulse < STRIP_WRITE_MS) return null
  lastPulse = now
  // Outside a ByTheSlice project the strip neither writes nor reads.
  if ((await read($, checklistAtom).catch(() => null)) === null) return null
  await writeStrip($, now)
  if (!force && now - lastRead < STRIP_READ_MS) return null
  lastRead = now
  return readStrip($, now)
}

/** At session end: deletes this session's entry. Never throws. */
export async function clearStrip($: EngineInterface): Promise<void> {
  try {
    await $.store.delete(stripKey(await keyOf($), await sessionId($)))
  } catch {
    // An entry left behind ages out after six hours.
  }
  written = null
}
