// mod/checks.ts
// The Pass warning plumbing: report a finding (warn row, toast, band style, model note), the refusal under enforcement block, the atoms checks read, and the policy at session start.

import { atom, read, update } from 'claude-code'
import type { EngineInterface, Timer, ToolCallResult } from 'claude-code'

import { appendRow } from './ledger.ts'
import type { LedgerRow } from './ledger.ts'
import { refreshLedger } from './live.ts'
import { DEFAULT_POLICY, loadPolicy } from './policy.ts'
import type { PassPolicy, PassWarning } from './types'

const checklistAtom = atom({ plugin: 'bytheslice', key: 'pass.checklist' } as const, null)
const limitedAtom = atom({ plugin: 'bytheslice', key: 'pass.limited' } as const, false)
const headAtom = atom({ plugin: 'bytheslice', key: 'pass.head' } as const, null)
const branchAtom = atom({ plugin: 'bytheslice', key: 'pass.branch' } as const, null)
const skillAtom = atom({ plugin: 'bytheslice', key: 'pass.activeSkill' } as const, null)
const policyAtom = atom({ plugin: 'bytheslice', key: 'pass.policy' } as const, null)
const reportedAtom = atom({ plugin: 'bytheslice', key: 'pass.reported' } as const, {})
const warningAtom = atom({ plugin: 'bytheslice', key: 'pass.warning' } as const, null)

/** One thing a check noticed. `key` names the instance: the same code and key report once a minute. */
export type Finding = { code: string; text: string; slice?: string; key: string; deny?: boolean }

/** A code and key report at most once in this window. */
export const REPORT_WINDOW_MS = 60000
/** How long the band keeps the warning style after a finding. */
export const WARN_BAND_MS = 5 * 60 * 1000
export const WARN_TOAST_MS = 8000
/** How often the band's warning style is checked for expiry. */
export const WARN_SWEEP_MS = 15000
export const REPORTED_KEEP = 200
const TOAST_MAX = 240

/** The ByTheSlice skills whose start the Pass tracks (the same list hooks/lib/checklist.sh detects). */
export const SKILLS: ReadonlySet<string> = new Set([
  'sell-pie',
  'sell-slice',
  'box-it-up',
  'cook-pizzas',
  'special-order',
  'pizza-party',
  'inspect-display',
  'close-shop',
  'setup-shop',
  'set-display-case',
  'open-the-shop',
  'create-menu',
  'final-quality-check',
])

/** A ByTheSlice skill's bare name from a skill, Skill tool or typed command name, or null for any other. */
export function skillName(name: unknown): string | null {
  if (typeof name !== 'string') return null
  const bare = name.trim().replace(/^\//, '').replace(/^[\w-]*bytheslice[\w-]*:/, '')
  return SKILLS.has(bare) ? bare : null
}

/** True when two shas name the same commit: one extends the other, at seven characters or more. */
export function headsMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  const [short, long] = a.length <= b.length ? [a, b] : [b, a]
  return short.length >= 7 && long.startsWith(short)
}

/** A sha cut to seven characters, or `unknown`. */
export const short = (sha: string | null | undefined): string => (typeof sha === 'string' && sha !== '' ? sha.slice(0, 7) : 'unknown')

/** The pie a slice id belongs to (`5.3` reads 5), or undefined. */
export function pieOf(slice: string | undefined): number | undefined {
  if (slice === undefined) return undefined
  const n = Number(slice.split('.')[0])
  return Number.isFinite(n) ? n : undefined
}

/** What the model reads for a finding, after the tool result or as a hidden note. */
export function modelText(finding: Finding): string {
  return `The Pass warning (${finding.code}): ${finding.text} Nothing was blocked.`
}

/** The toast line for a finding: its code, its slice and its text, cut short. */
export function toastText(finding: Finding): string {
  const where = finding.slice === undefined ? '' : ` · Slice ${finding.slice}`
  const line = `Pass ${finding.code}${where}: ${finding.text}`
  const chars = Array.from(line)
  return chars.length <= TOAST_MAX ? line : `${chars.slice(0, TOAST_MAX - 1).join('').trimEnd()}…`
}

async function nowOf($: EngineInterface): Promise<number> {
  try {
    return await $.clock.now()
  } catch {
    return Date.now()
  }
}

/**
 * The policy when checks run: null while the engine is limited, while there is
 * no master checklist (a repo the Pass does not serve) or when the config
 * turned checks off. Reads atoms only.
 */
export async function checksOn($: EngineInterface): Promise<PassPolicy | null> {
  try {
    if (await read($, limitedAtom)) return null
    if ((await read($, checklistAtom)) === null) return null
    const policy = (await read($, policyAtom)) ?? DEFAULT_POLICY
    return policy.enabled ? policy : null
  } catch {
    return null
  }
}

/**
 * Reports a finding: one `warn` ledger row `{ code, text }`, one toast, the
 * band's warning style for five minutes, and the text the model should read.
 * The same code and key report at most once a minute: a repeat resolves null.
 */
export async function report($: EngineInterface, finding: Finding, blocked = false): Promise<string | null> {
  const now = await nowOf($)
  const id = `${finding.code}|${finding.key}`
  try {
    const seen = await read($, reportedAtom)
    const last = seen[id]
    if (last !== undefined && now - last < REPORT_WINDOW_MS) return null
    await update($, reportedAtom, marks => {
      const kept = Object.entries(marks ?? {}).filter(([key]) => key !== id).slice(-(REPORTED_KEEP - 1))
      return { ...Object.fromEntries(kept), [id]: now }
    })
  } catch {
    // Without the dedupe atom the finding still reports.
  }
  const pie = pieOf(finding.slice)
  await appendRow($, {
    ev: 'warn',
    ...(pie === undefined ? {} : { pie }),
    ...(finding.slice === undefined ? {} : { slice: finding.slice }),
    data: { code: finding.code, text: finding.text, ...(blocked ? { blocked: true } : {}) },
  })
  try {
    $.ui.toast(toastText(finding), { timeoutMs: WARN_TOAST_MS })
  } catch {
    // A toast that cannot show still leaves the row and the model's text.
  }
  const warning: PassWarning = { code: finding.code, slice: finding.slice ?? null, t: now, until: now + WARN_BAND_MS }
  await update($, warningAtom, () => warning).catch(() => undefined)
  await refreshLedger($)
  return modelText(finding)
}

/** What the model reads when the Pass refuses a call: the rule, and that only the operator can loosen it. */
export function refusalText(finding: Finding): string {
  return (
    `The Pass refused this (${finding.code}): ${finding.text} ` +
    'Operator override only: "enforcement": "warn" in bytheslice.config.json, set by hand, or a relaunch with BTS_ALLOW_BYPASS=1. Never set either yourself.'
  )
}

/**
 * Under enforcement `block`, the refusal for findings that ask for one: each
 * is reported (a `warn` row marked `blocked`, a toast) and the texts joined
 * for the deny. Null under `warn`, with checks off, or when none asks.
 */
export async function refusalOf($: EngineInterface, findings: readonly Finding[]): Promise<string | null> {
  const blocking = findings.filter(finding => finding.deny === true)
  if (blocking.length === 0) return null
  const policy = await checksOn($)
  if (!policy || (policy.enforcement ?? 'block') !== 'block') return null
  for (const finding of blocking) await report($, finding, true).catch(() => null)
  return blocking.map(refusalText).join('\n')
}

/** Reports each finding in order; resolves the texts that were not repeats. */
export async function reportAll($: EngineInterface, findings: readonly Finding[]): Promise<string[]> {
  const texts: string[] = []
  for (const finding of findings) {
    const text = await report($, finding).catch(() => null)
    if (text !== null) texts.push(text)
  }
  return texts
}

/**
 * A tool's result with each finding's text added to `context`, which the model
 * reads after the result. A refused or failed call is returned as it came, with
 * nothing reported; so is every result when reporting fails.
 */
export async function warnResult<R extends ToolCallResult>($: EngineInterface, ran: R, findings: readonly Finding[]): Promise<R> {
  if (findings.length === 0 || ran.deny !== undefined || ran.isError === true) return ran
  try {
    const texts = await reportAll($, findings)
    if (texts.length === 0) return ran
    return { ...ran, context: [...(ran.context ?? []), ...texts] }
  } catch {
    return ran
  }
}

/**
 * Appends a hidden note the model reads (a user row it never typed) to the
 * loop that spawned an agent, or to the main conversation; when that loop has
 * ended, to the main one. Resolves whether a note was stored.
 */
export async function noteModel($: EngineInterface, text: string, agentId: string | null = null): Promise<boolean> {
  const message = { type: 'user' as const, content: [{ type: 'text' as const, text }] }
  for (const target of agentId === null ? [null] : [agentId, null]) {
    try {
      const stored = await $.session.append(target === null ? { message } : { message, agentId: target })
      if ((stored as { deny?: unknown }).deny === undefined) return true
    } catch {
      // A loop that ended refuses the row; the main conversation is tried next.
    }
  }
  return false
}

/** Reports findings a spawn or a turn raised and hands each new one to the model as a hidden note. */
export async function reportToModel($: EngineInterface, findings: readonly Finding[], agentId: string | null): Promise<string[]> {
  const texts = await reportAll($, findings)
  for (const text of texts) await noteModel($, text, agentId)
  return texts
}

async function git($: EngineInterface, argv: string[]): Promise<string | null> {
  try {
    const run = await $.process.run(['git', ...argv], { timeoutMs: 5000 })
    const out = run.stdout.trim()
    return run.exitCode === 0 && out !== '' ? out : null
  } catch {
    return null
  }
}

/** Reads HEAD's sha into `pass.head`; resolves it, or null outside git. */
export async function readHead($: EngineInterface): Promise<string | null> {
  const sha = await git($, ['rev-parse', 'HEAD'])
  const head = sha !== null && /^[0-9a-f]{7,64}$/.test(sha) ? sha : null
  await update($, headAtom, () => head).catch(() => undefined)
  return head
}

async function readBranch($: EngineInterface): Promise<string | null> {
  const branch = await git($, ['rev-parse', '--abbrev-ref', 'HEAD'])
  await update($, branchAtom, () => branch).catch(() => undefined)
  return branch
}

// Git steps after which HEAD or the branch may have moved.
const MOVES = /\bgit\b[^;&|\n]*?\s(checkout|switch|worktree|merge|rebase|reset|pull|cherry-pick|revert|am|stash)\b/

/**
 * After a Bash command ran: a commit row has HEAD read again in the session's
 * directory (a row's own sha may name a commit made elsewhere through
 * `git -C`), and a command that may move HEAD or the branch (checkout, switch,
 * worktree, merge, rebase, reset, pull, ...) has both read again. Off the hot path.
 */
export async function trackGit($: EngineInterface, command: unknown, rows: readonly LedgerRow[]): Promise<void> {
  const moved = typeof command === 'string' && MOVES.test(command)
  if (moved || rows.some(row => row.ev === 'commit')) await readHead($)
  if (moved) await readBranch($)
}

/** A ByTheSlice skill's start becomes `pass.activeSkill`; any other skill leaves it as it was. */
export async function trackSkill($: EngineInterface, name: unknown): Promise<string | null> {
  const skill = skillName(name)
  if (skill !== null) await update($, skillAtom, () => skill).catch(() => undefined)
  return skill
}

let sweep: Timer | null = null

/** Every 15 seconds: clears the band's warning style once its five minutes are up. */
export async function startWarningSweep($: EngineInterface): Promise<void> {
  sweep?.cancel()
  try {
    sweep = $.clock.every(WARN_SWEEP_MS, () => {
      void (async () => {
        const warning = await read($, warningAtom)
        if (warning === null || (await nowOf($)) < warning.until) return
        await update($, warningAtom, () => null)
      })().catch(() => undefined)
    })
  } catch {
    sweep = null
  }
}

/**
 * At session start, after the checklist was read: HEAD into `pass.head`, the
 * policy read once into `pass.policy` (its overrides recorded when this is a
 * ByTheSlice project), and the band's warning sweep.
 */
export async function primeChecks($: EngineInterface): Promise<PassPolicy> {
  await readHead($)
  const served = (await read($, checklistAtom).catch(() => null)) !== null
  const policy = await loadPolicy($, { record: served }).catch(() => DEFAULT_POLICY)
  await update($, policyAtom, () => policy).catch(() => undefined)
  await startWarningSweep($)
  return policy
}
