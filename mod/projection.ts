// mod/projection.ts
// Read-only projection of the master checklist into session state atoms, with the pure active-pie helpers the pane and band draw from.

import { atom, read, update } from 'claude-code'
import type { EngineInterface, Timer } from 'claude-code'

import { parseChecklist } from './checklist.ts'
import type { PassChecklist, PassPie, PassSlice } from './types'

export const CHECKLIST_PATH = 'docs/plans/00_master_checklist.md'
export const WATCH_MS = 10000
export const MIN_VERSION = [2, 1, 299] as const

// `claude plugin validate` reads state references off each file's own consts, so a
// file that reads or writes an atom declares it itself; band.tsx and rail.tsx do too.
const checklistAtom = atom({ plugin: 'bytheslice', key: 'pass.checklist' } as const, null)
const loadedAtAtom = atom({ plugin: 'bytheslice', key: 'pass.loadedAt' } as const, 0)
const limitedAtom = atom({ plugin: 'bytheslice', key: 'pass.limited' } as const, false)
const branchAtom = atom({ plugin: 'bytheslice', key: 'pass.branch' } as const, null)

/** The active pie: the first pie with an open slice; null when none has one. */
export function activePie(c: PassChecklist | null): PassPie | null {
  if (!c) return null
  return c.pies.find(pie => pie.slices.some(slice => !slice.done)) ?? null
}

/** The active slice: the first open slice of the active pie. */
export function activeSlice(c: PassChecklist | null): PassSlice | null {
  return activePie(c)?.slices.find(slice => !slice.done) ?? null
}

/** Slices done and in total for the active pie; zero and zero without one. */
export function counts(c: PassChecklist | null): { done: number; total: number } {
  const pie = activePie(c)
  if (!pie) return { done: 0, total: 0 }
  return { done: pie.slices.filter(slice => slice.done).length, total: pie.slices.length }
}

/** True when the checklist has pies and every one of them is done. */
export function allDone(c: PassChecklist | null): boolean {
  return c !== null && c.layout === 'pie' && c.pies.length > 0 && c.pies.every(pie => pie.done)
}

/** The pie a branch name carries (`pie-5-the-pass`, `pie/5`), or null. */
export function branchPie(branch: string | null): number | null {
  const match = /(^|\/)pie[-/](\d+)/.exec(branch ?? '')
  return match ? Number(match[2]) : null
}

/**
 * Every slice is done and a pie branch is still checked out, so its boundary
 * PR is left to open. Once the pie is merged and the branch is gone there is
 * nothing to box, and the surfaces say only that the pies are done.
 */
export const boxReady = (c: PassChecklist | null, branch: string | null): boolean => allDone(c) && branchPie(branch) !== null

/** True for a tool path that names the master checklist. */
export function isChecklistPath(path: unknown): boolean {
  return typeof path === 'string' && /(^|[\\/])00_master_checklist\.md$/.test(path)
}

/** Whether an engine version is older than the Pass supports (2.1.299); an unreadable one counts as older. */
export function isOlder(version: string | undefined): boolean {
  const parts = /^(\d+)\.(\d+)\.(\d+)/.exec(version ?? '')
  if (!parts) return true
  const have = [Number(parts[1]), Number(parts[2]), Number(parts[3])]
  for (let i = 0; i < MIN_VERSION.length; i += 1) {
    const a = have[i] ?? 0
    const b = MIN_VERSION[i] ?? 0
    if (a !== b) return a < b
  }
  return false
}

async function readText($: EngineInterface): Promise<string | null> {
  try {
    return await $.fs.read(CHECKLIST_PATH)
  } catch {
    return null
  }
}

async function readBranch($: EngineInterface): Promise<string | null> {
  try {
    const run = await $.process.run(['git', 'rev-parse', '--abbrev-ref', 'HEAD'], { timeoutMs: 5000 })
    const branch = run.exitCode === 0 ? run.stdout.trim() : ''
    return branch === '' ? null : branch
  } catch {
    return null
  }
}

async function now($: EngineInterface): Promise<number> {
  try {
    return await $.clock.now()
  } catch {
    return Date.now()
  }
}

// The text the last refresh read, held in memory so the checkbox check can
// apply an Edit to it on the hot path without reading the disk.
let lastText: string | null = null

/** The checklist text as the last refresh read it, or null before one (or with no file). */
export function checklistText(): string | null {
  return lastText
}

/**
 * Reads the checklist (a missing file gives null, never a throw), parses it and
 * writes the atoms. Resolves the parsed checklist.
 */
export async function refresh($: EngineInterface): Promise<PassChecklist | null> {
  const text = await readText($)
  lastText = text
  const parsed = text === null ? null : parseChecklist(text)
  const branch = await readBranch($)
  const at = await now($)
  try {
    await update($, checklistAtom, () => parsed)
    await update($, branchAtom, () => branch)
    await update($, loadedAtAtom, () => at)
  } catch {
    // State writes failing leave the last drawing in place; the next refresh tries again.
  }
  return parsed
}

/** True once the version check set the mod inert. */
export async function isLimited($: EngineInterface): Promise<boolean> {
  try {
    return await read($, limitedAtom)
  } catch {
    return false
  }
}

/**
 * Reads the engine version: below 2.1.299 (or one the engine cannot say) sets
 * `pass.limited` and logs once, so the mod stays inert instead of failing.
 * Resolves true when limited.
 */
export async function gate($: EngineInterface): Promise<boolean> {
  let version: string | undefined
  try {
    const v = await $.session.version()
    version = v.base ?? v.version
  } catch {
    version = undefined
  }
  if (!isOlder(version)) {
    await update($, limitedAtom, () => false).catch(() => undefined)
    return false
  }
  const wasLimited = await read($, limitedAtom).catch(() => false)
  await update($, limitedAtom, () => true).catch(() => undefined)
  if (!wasLimited) {
    $.ui.log(
      `The Pass needs Claude Code 2.1.299 or later (this session runs ${version ?? 'an unknown version'}); its pane and band stay off.`,
    )
  }
  return true
}

async function mtimeOf($: EngineInterface): Promise<number | null> {
  try {
    return (await $.fs.stat(CHECKLIST_PATH)).mtimeMs
  } catch {
    return null
  }
}

let watcher: Timer | null = null

/**
 * Every 10 seconds compares the checklist's mtime with the last one seen and
 * calls `reload` only when it changed (or the file appeared or went away).
 */
export async function watchChecklist($: EngineInterface, reload: () => Promise<unknown>): Promise<void> {
  watcher?.cancel()
  let seen = await mtimeOf($)
  try {
    watcher = $.clock.every(WATCH_MS, () => {
      void (async () => {
        const mtime = await mtimeOf($)
        if (mtime === seen) return
        seen = mtime
        await reload()
      })().catch(() => undefined)
    })
  } catch {
    watcher = null
  }
}
