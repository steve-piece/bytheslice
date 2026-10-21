// mod/touched.ts
// Touched files for a slice: the ledger's edit rows joined with git diff --numstat from the slice's start head, the roles that edited each file, and a stale flag for a builder edit after the verifier's pass.

import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import { readRows } from './ledger.ts'
import { activeSlice } from './projection.ts'
import type { LedgerRow, PassTouched, PassTouchedFile } from './types'

const checklistAtom = atom({ plugin: 'bytheslice', key: 'pass.checklist' } as const, null)
const touchedAtom = atom({ plugin: 'bytheslice', key: 'pass.touched' } as const, { slice: null, files: [], at: 0 })

/** Roles whose edit after a verifier pass invalidates it. */
export const BUILDERS: ReadonlySet<string> = new Set(['implementer', 'fix-attempter'])
/** Edits within this long of the last refresh wait for the next pulse instead of running git again. */
export const TOUCHED_REFRESH_MS = 2000
/** Files the pane lists before it counts the rest. */
export const TOUCHED_SHOWN = 8

export type Numstat = Map<string, { added: number; removed: number }>

/**
 * A path as the workspace names it: relative to `cwd`, without `./`; null for
 * a path outside the workspace (no git diff can count it).
 */
export function relativePath(path: unknown, cwd: string): string | null {
  if (typeof path !== 'string' || path.trim() === '') return null
  const raw = path.trim()
  const base = cwd.replace(/\/+$/, '')
  if (!raw.startsWith('/')) {
    const rel = raw.replace(/^(\.\/)+/, '')
    return rel.split('/').includes('..') ? null : rel
  }
  if (!raw.startsWith(`${base}/`)) return null
  const rel = raw.slice(base.length + 1)
  return rel === '' || rel.split('/').includes('..') ? null : rel
}

// `a => b` and `dir/{a => b}/f` name the file after the rename.
function renamed(path: string): string {
  const braced = /^(.*)\{(.*) => (.*)\}(.*)$/.exec(path)
  if (braced) return `${braced[1]}${braced[3]}${braced[4]}`.replace(/\/\//g, '/')
  const plain = / => /.exec(path)
  return plain ? path.slice(plain.index + 4) : path
}

/** Parses `git diff --numstat` lines (`added<TAB>removed<TAB>path`; a binary file counts `-` as 0). */
export function parseNumstat(text: string): Numstat {
  const out: Numstat = new Map()
  for (const line of text.split('\n')) {
    const match = /^(\d+|-)\t(\d+|-)\t(.+)$/.exec(line)
    if (!match) continue
    const path = renamed(match[3] ?? '')
    if (path === '') continue
    out.set(path, { added: match[1] === '-' ? 0 : Number(match[1]), removed: match[2] === '-' ? 0 : Number(match[2]) })
  }
  return out
}

const roleOfRow = (row: LedgerRow): string => {
  const agent = row.data?.agent ?? row.agent
  return typeof agent === 'string' && agent !== '' ? agent.slice(agent.lastIndexOf(':') + 1) : 'main'
}

/** The time of the slice's last slice-verifier pass, or null. */
export function lastPassT(rows: readonly LedgerRow[], slice: string): number | null {
  let at: number | null = null
  for (const row of rows) {
    if (row.ev === 'verdict' && row.slice === slice && row.data?.gate === 'slice-verifier' && row.data.overall === 'pass') {
      at = at === null ? row.t : Math.max(at, row.t)
    }
  }
  return at
}

/**
 * Joins a slice's edit rows with numstat: every edited path (numstat 0/0 when
 * git counts none, a gitignored plan say) then every other path git counts.
 * `stale` marks a builder edit after the last verifier pass. Pure.
 */
export function touchedOf(rows: readonly LedgerRow[], slice: string, numstat: Numstat): PassTouchedFile[] {
  const passT = lastPassT(rows, slice)
  const byPath = new Map<string, PassTouchedFile>()
  for (const row of rows) {
    if (row.ev !== 'edit' || row.slice !== slice) continue
    const path = row.data?.path
    if (typeof path !== 'string' || path === '') continue
    const role = roleOfRow(row)
    const file = byPath.get(path) ?? { path, added: 0, removed: 0, roles: [], stale: false }
    if (!file.roles.includes(role)) file.roles.push(role)
    if (passT !== null && row.t > passT && BUILDERS.has(role)) file.stale = true
    byPath.set(path, file)
  }
  for (const [path, counted] of numstat) {
    const file = byPath.get(path) ?? { path, added: 0, removed: 0, roles: [], stale: false }
    file.added = counted.added
    file.removed = counted.removed
    byPath.set(path, file)
  }
  return [...byPath.values()]
}

/** The head a slice started at (its first `slice.started` row's `data.head`), or null. */
export function startHead(rows: readonly LedgerRow[], slice: string): string | null {
  for (const row of rows) {
    if (row.ev !== 'slice.started' || row.slice !== slice) continue
    const head = row.data?.head
    if (typeof head === 'string' && /^[0-9a-f]{7,64}$/.test(head)) return head
  }
  return null
}

async function git($: EngineInterface, argv: string[]): Promise<string | null> {
  try {
    const run = await $.process.run(['git', ...argv], { timeoutMs: 10000 })
    return run.exitCode === 0 ? run.stdout : null
  } catch {
    return null
  }
}

/** What the slice's diff counts from: its start head, else the merge-base with `main`, else null. */
export async function diffBase($: EngineInterface, rows: readonly LedgerRow[], slice: string): Promise<string | null> {
  const head = startHead(rows, slice)
  if (head !== null) return head
  const base = (await git($, ['merge-base', 'HEAD', 'main']))?.trim() ?? ''
  return /^[0-9a-f]{7,64}$/.test(base) ? base : null
}

/**
 * The files a slice touched, each with numstat since its start head (working
 * tree included), the roles that edited it, and whether a builder edit came
 * after the verifier's pass. Reads the ledger and runs one git diff.
 */
export async function touchedFiles($: EngineInterface, slice: string, given?: readonly LedgerRow[]): Promise<PassTouchedFile[]> {
  const rows = given ?? (await readRows($))
  const base = await diffBase($, rows, slice)
  const numstat = base === null ? new Map() : parseNumstat((await git($, ['diff', '--numstat', base])) ?? '')
  return touchedOf(rows, slice, numstat)
}

async function nowOf($: EngineInterface): Promise<number> {
  try {
    return await $.clock.now()
  } catch {
    return Date.now()
  }
}

// Module state per load: when git last ran for the pane, and whether an edit, verdict or commit came since.
let lastRefresh = Number.NEGATIVE_INFINITY
let dirty = false

/** Forgets the throttle at session start, so a new session reads at its first edit. */
export function resetTouched(): void {
  lastRefresh = Number.NEGATIVE_INFINITY
  dirty = false
}

/** Notes that the touched files changed (an edit, a verdict, a commit); the next pulse reads them again. */
export function markTouched(): void {
  dirty = true
}

/** Reads the active slice's touched files into `pass.touched`. Never throws; resolves what it wrote, or null. */
export async function refreshTouched($: EngineInterface): Promise<PassTouched | null> {
  try {
    dirty = false
    const at = await nowOf($)
    lastRefresh = at
    const slice = activeSlice(await read($, checklistAtom))?.id ?? null
    const files = slice === null ? [] : await touchedFiles($, slice)
    const next: PassTouched = { slice, files, at }
    await update($, touchedAtom, () => next)
    return next
  } catch {
    return null
  }
}

/** After an edit: reads again at once unless git ran in the last 2 seconds; then the pulse catches up. */
export async function refreshTouchedSoon($: EngineInterface): Promise<PassTouched | null> {
  markTouched()
  if ((await nowOf($)) - lastRefresh < TOUCHED_REFRESH_MS) return null
  return refreshTouched($)
}

/** The pulse's step: reads again only when something marked the files changed. */
export async function refreshTouchedIfDirty($: EngineInterface): Promise<PassTouched | null> {
  return dirty ? refreshTouched($) : null
}
