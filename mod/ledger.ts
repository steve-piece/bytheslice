// mod/ledger.ts
// The Pass ledger writer and reader: one append-only .bytheslice/ledger.jsonl per project, rooted at the primary checkout.

import type { EngineInterface } from 'claude-code'

import type { LedgerEvent, LedgerRow } from './types'

export type { LedgerEvent, LedgerRow } from './types'

export const LEDGER_DIR = '.bytheslice'
export const LEDGER_FILE = 'ledger.jsonl'
/** Lines kept when the ledger outgrows one `$.fs.read` (4 MiB); the newest are kept. */
export const TAIL_LINES = 20000

const EVENTS: ReadonlySet<string> = new Set<LedgerEvent>([
  'pie.started',
  'slice.started',
  'slice.done',
  'verdict',
  'commit',
  'push',
  'merge',
  'hitl.raised',
  'hitl.answered',
  'note',
  'usage',
  'slice.rollup',
  'warn',
  'agent.stalled',
  'teammate.idle',
  'teammate.done',
  'edit',
])

/** A row as a caller hands it; the writer stamps `v`, `t` and `sid`. */
export type LedgerInput = Omit<LedgerRow, 'v' | 't' | 'sid'>

// Module state is per load: a hot reload resolves the root again and may warn once more.
const roots = new Map<string, string>()
const readyDirs = new Set<string>()
let sid: string | null = null
let warned = false

/** Collapses `.` and `..` segments of an absolute POSIX path. */
export function normalize(path: string): string {
  const out: string[] = []
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') out.pop()
    else out.push(part)
  }
  return `/${out.join('/')}`
}

/**
 * The ledger root from `git rev-parse --git-common-dir` output: the common
 * directory's parent when it is a `.git` folder (the primary checkout, so every
 * worktree of the project shares one ledger), else the session directory.
 */
export function rootFromCommonDir(stdout: string, cwd: string): string {
  const raw = stdout.trim()
  if (raw === '') return cwd
  const absolute = normalize(raw.startsWith('/') ? raw : `${cwd}/${raw}`)
  const cut = absolute.lastIndexOf('/')
  if (absolute.slice(cut + 1) !== '.git') return cwd
  return cut <= 0 ? '/' : absolute.slice(0, cut)
}

/** The one compact JSON line a row is written as, fields in schema order. */
export function rowLine(row: LedgerInput, t: number, session: string): string {
  const full: LedgerRow = {
    v: 1,
    t,
    sid: session,
    ev: row.ev,
    ...(row.pie === undefined ? {} : { pie: row.pie }),
    ...(row.slice === undefined ? {} : { slice: row.slice }),
    ...(row.aid === undefined ? {} : { aid: row.aid }),
    ...(row.agent === undefined ? {} : { agent: row.agent }),
    ...(row.data === undefined ? {} : { data: row.data }),
  }
  return JSON.stringify(full)
}

function isRow(value: unknown): value is LedgerRow {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const row = value as Record<string, unknown>
  return (
    row.v === 1 &&
    typeof row.t === 'number' &&
    Number.isFinite(row.t) &&
    typeof row.sid === 'string' &&
    typeof row.ev === 'string' &&
    EVENTS.has(row.ev) &&
    (row.pie === undefined || typeof row.pie === 'number') &&
    (row.slice === undefined || typeof row.slice === 'string')
  )
}

/** Parses ledger text: a torn or foreign line is skipped, never thrown. */
export function parseRows(text: string, sinceT = Number.NEGATIVE_INFINITY): LedgerRow[] {
  const rows: LedgerRow[] = []
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue
    let parsed: unknown
    try {
      parsed = JSON.parse(line)
    } catch {
      continue
    }
    if (isRow(parsed) && parsed.t >= sinceT) rows.push(parsed)
  }
  return rows
}

async function cwdOf($: EngineInterface): Promise<string> {
  try {
    return await $.session.cwd()
  } catch {
    return '.'
  }
}

async function nowOf($: EngineInterface): Promise<number> {
  try {
    return await $.clock.now()
  } catch {
    return Date.now()
  }
}

/** The ledger's absolute path: `<primary checkout>/.bytheslice/ledger.jsonl`. */
export async function ledgerPath($: EngineInterface): Promise<string> {
  return `${(await primaryRoot($)).replace(/\/$/, '')}/${LEDGER_DIR}/${LEDGER_FILE}`
}

/** The primary checkout every worktree of the project shares (the session directory outside git). */
export async function primaryRoot($: EngineInterface): Promise<string> {
  const cwd = await cwdOf($)
  let root = roots.get(cwd)
  if (root === undefined) {
    root = cwd
    try {
      let run = await $.process.run(['git', 'rev-parse', '--path-format=absolute', '--git-common-dir'], {
        timeoutMs: 5000,
      })
      // Git before 2.31 has no --path-format; the plain form answers relative to the cwd.
      if (run.exitCode !== 0) run = await $.process.run(['git', 'rev-parse', '--git-common-dir'], { timeoutMs: 5000 })
      // Only a git answer is kept: outside a repository the next row asks again.
      if (run.exitCode === 0) {
        root = rootFromCommonDir(run.stdout, cwd)
        roots.set(cwd, root)
      }
    } catch {
      root = cwd
    }
  }
  return root
}

/** The id rows carry: the session's own id (the transcript's name), else one minted once per load. */
export async function sessionId($: EngineInterface): Promise<string> {
  if (sid !== null) return sid
  try {
    const id = await $.session.id()
    if (typeof id === 'string' && id !== '') sid = id
  } catch {
    // Minted below.
  }
  if (sid === null) sid = `pass-${(await nowOf($)).toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  return sid
}

/** Reads the session id at session start, so every row of the session carries the same one. */
export async function startSession($: EngineInterface): Promise<string> {
  sid = null
  return sessionId($)
}

// The folder ignores itself, so the ledger stays out of git in any project.
async function ensureDir($: EngineInterface, path: string): Promise<void> {
  const dir = path.slice(0, path.lastIndexOf('/'))
  if (readyDirs.has(dir)) return
  const ignore = `${dir}/.gitignore`
  if (!(await $.fs.exists(ignore))) await $.fs.write(ignore, '*\n')
  readyDirs.add(dir)
}

function warnOnce($: EngineInterface, reason: string): void {
  if (warned) return
  warned = true
  try {
    $.ui.log(`The Pass could not write its ledger (${reason}); that row was dropped and the session goes on.`)
  } catch {
    // Nothing else to tell.
  }
}

/**
 * Appends one row as a single short `O_APPEND` write (`tee -a`, since `$.fs`
 * has no append), safe across sessions writing the same file. Never throws:
 * a failure logs once and drops the row. Resolves the row written, or null.
 */
export async function appendRow($: EngineInterface, row: LedgerInput): Promise<LedgerRow | null> {
  try {
    const path = await ledgerPath($)
    await ensureDir($, path)
    const t = await nowOf($)
    const line = rowLine(row, t, await sessionId($))
    const run = await $.process.run(['tee', '-a', path], { stdin: `${line}\n`, timeoutMs: 5000 })
    if (run.exitCode !== 0) throw new Error(run.stderr.trim() || `tee exited ${run.exitCode}`)
    return JSON.parse(line) as LedgerRow
  } catch (error) {
    warnOnce($, error instanceof Error ? error.message.split('\n')[0] ?? 'unknown error' : 'unknown error')
    return null
  }
}

/**
 * Reads the ledger's rows, oldest first; missing gives `[]`. A file past one
 * read's 4 MiB is read from its newest lines. `sinceT` keeps rows at or after it.
 */
export async function readRows($: EngineInterface, opts: { sinceT?: number } = {}): Promise<LedgerRow[]> {
  let path: string
  try {
    path = await ledgerPath($)
  } catch {
    return []
  }
  let text: string | null = null
  try {
    text = await $.fs.read(path)
  } catch {
    try {
      if (await $.fs.exists(path)) {
        const run = await $.process.run(['tail', '-n', String(TAIL_LINES), path], { timeoutMs: 5000 })
        if (run.exitCode === 0) text = run.stdout
      }
    } catch {
      text = null
    }
  }
  return text === null ? [] : parseRows(text, opts.sinceT)
}
