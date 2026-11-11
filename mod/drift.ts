// mod/drift.ts
// Status drift for bts_status: a slice the checklist calls open whose commits already reached the default branch, and a slice marked done none of whose commits did. It informs and never edits.

import type { EngineInterface } from 'claude-code'

import { headsMatch } from './checks.ts'
import { branchPie } from './projection.ts'
import type { PassChecklist, PassProjection } from './types'

/** One slice whose checklist status and the default branch disagree. */
export type StatusDrift = { id: string; kind: 'open-but-merged' | 'done-not-merged'; base: string; commits: number }

/** What git says: the default branch, its commits (shas and subjects) and the current branch. */
export type MergedView = { base: string; shas: readonly string[]; subjects: readonly string[]; branch: string | null }

/** How far back the default branch is read. */
export const MERGED_DEPTH = 3000

// A conductor commit subject names its slice: `feat(pie-N): N.M task K ...`.
const SUBJECT_SLICE = /\(pie-\d+\):\s*(\d+\.\d+)\b/g

/** A squash merge's subject ends with its PR number: `Pie 23: video (#251)`. */
const SQUASH_SUFFIX = /\(#\d+\)\s*$/
/** A conventional-commit type that plans or documents rather than builds (`chore(plans): ...`), unless scoped to a pie. */
const PLAN_TYPE = /^\s*(chore|docs?|plans?|specs?)(\((?!pie-\d)[^)]*\))?!?:/i
/** A planning change in words: a verb that changes plans, then a plan noun (`add Pie 26 plans`, `update the roadmap`). */
const PLAN_PHRASE = /\b(add|adds|added|update|updates|updated|write|writes|wrote|draft|drafts|drafted|revise|revises|revised|re-?plan)\b[^()]*\b(plans?|roadmap|checklist|specs?|special order)\b/i
/** A title whose name is nothing but a plan noun (`Pie 9: plan (#12)`, `Slice 7.1: spec`). */
const PLAN_NAME = /:\s*(the\s+)?(plans?|planning|roadmap|checklist|specs?|docs?)\s*(\(#\d+\))?\s*$/i

/**
 * Whether a subject or title records a planning change, so it is never
 * evidence that a pie was built or merged: a plan or docs commit type not
 * scoped to a pie (`chore(plans): ...`), a planning phrase (`add ... plans`),
 * or a name that is only a plan noun. A feature whose name merely contains
 * such a word (`Pie 7: Subscription plans`, `Slice 7.1: Docs viewer`) is not
 * one. Pure.
 */
export function isPlanOnly(text: string): boolean {
  return PLAN_TYPE.test(text) || PLAN_PHRASE.test(text) || PLAN_NAME.test(text)
}

/**
 * The pie a pie-boundary squash merge merged: its subject has the boundary
 * PR's shape, the pie at the start (`Pie 23: Video GIF Posting (#251)`), and is
 * no plan (`chore(plans): add Pie 28 ... (#254)` merges nothing). Null for any
 * other subject. Pure.
 */
export function boundaryPie(subject: string): number | null {
  if (!SQUASH_SUFFIX.test(subject) || isPlanOnly(subject)) return null
  const m = /^\s*pie\s+(\d+)\b/i.exec(subject)
  return m ? Number(m[1]) : null
}

/**
 * The slices a squash merge merged: a conductor subject naming them
 * (`feat(pie-7): 7.1 first (#40)`), or a slice PR's shape with the slice at the
 * start (`Slice 7.1: first (#40)`) that is no plan. Pure.
 */
export function squashSlices(subject: string): string[] {
  if (!SQUASH_SUFFIX.test(subject)) return []
  const ids = new Set(slicesNamed([subject]))
  const m = /^\s*slice\s+(\d+\.\d+)\b/i.exec(subject)
  if (m?.[1] !== undefined && !isPlanOnly(subject)) ids.add(m[1])
  return [...ids]
}

/**
 * When the newest pie-boundary squash merge of `pie` landed on the default
 * branch, `Infinity` when its time is unknown, or null when there is none. Pure.
 */
export function boundaryTime(base: { subjects: readonly string[]; times?: readonly number[] } | null, pie: number): number | null {
  let at: number | null = null
  base?.subjects.forEach((subject, i) => {
    if (boundaryPie(subject) !== pie) return
    const t = base.times?.[i]
    const when = t !== undefined && Number.isFinite(t) ? t : Number.POSITIVE_INFINITY
    at = at === null ? when : Math.max(at, when)
  })
  return at
}

/** Slice ids the subjects name. Pure. */
export function slicesNamed(subjects: readonly string[]): Set<string> {
  const ids = new Set<string>()
  for (const subject of subjects) for (const m of subject.matchAll(SUBJECT_SLICE)) if (m[1] !== undefined) ids.add(m[1])
  return ids
}

/**
 * Each slice whose status disagrees with the default branch: open while a
 * ledger commit of it, or a commit subject naming it, is on the base
 * (`open-but-merged`); done while it has ledger commits and none is on the
 * base, unless its pie branch is the one checked out, where a pie waits for
 * its boundary PR (`done-not-merged`). Pure.
 */
export function statusDrift(c: PassChecklist | null, p: PassProjection | null, view: MergedView): StatusDrift[] {
  if (!c || c.layout !== 'pie') return []
  const named = slicesNamed(view.subjects)
  const onBase = (sha: string): boolean => view.shas.some(merged => headsMatch(merged, sha))
  const checkedOutPie = branchPie(view.branch)
  const drift: StatusDrift[] = []
  for (const pie of c.pies) {
    for (const slice of pie.slices) {
      const commits = p?.pies.find(x => x.n === pie.n)?.slices.find(x => x.id === slice.id)?.commits ?? []
      const merged = commits.filter(onBase)
      if (!slice.done && (merged.length > 0 || named.has(slice.id))) {
        drift.push({ id: slice.id, kind: 'open-but-merged', base: view.base, commits: merged.length })
      } else if (slice.done && commits.length > 0 && merged.length === 0 && !named.has(slice.id) && checkedOutPie !== pie.n) {
        drift.push({ id: slice.id, kind: 'done-not-merged', base: view.base, commits: commits.length })
      }
    }
  }
  return drift
}

/** One line per drift, in plain words. */
export function driftLine(d: StatusDrift): string {
  return d.kind === 'open-but-merged'
    ? `Slice ${d.id} is still open in the checklist, but its commits are on ${d.base}: mark it [x] once slice-verifier passed`
    : `Slice ${d.id} is [x], but none of its ${d.commits} commit${d.commits === 1 ? '' : 's'} reached ${d.base}`
}

/** Runs git and resolves its stdout, or null when it fails or cannot start. */
export async function git($: EngineInterface, argv: string[], timeoutMs = 5000): Promise<string | null> {
  try {
    const run = await $.process.run(['git', ...argv], { timeoutMs })
    return run.exitCode === 0 ? run.stdout : null
  } catch {
    return null
  }
}

/** The default branch to compare with: origin's HEAD, else origin/main, main, origin/master, master. */
export async function baseRef($: EngineInterface): Promise<string | null> {
  const head = (await git($, ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD']))?.trim()
  for (const ref of [head, 'origin/main', 'main', 'origin/master', 'master']) {
    if (ref && (await git($, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`])) !== null) return ref
  }
  return null
}

/** The default branch as read: its name, its newest commits' shas and subjects, and their commit times (NaN when unread). */
export type BaseLog = { base: string; shas: string[]; subjects: string[]; times: number[] }

/** Parses `git log --format='%H %ct%x09%s'` output; a line without the time reads its subject with a NaN time. Pure. */
export function parseBaseLog(base: string, text: string): BaseLog {
  const shas: string[] = []
  const subjects: string[] = []
  const times: number[] = []
  for (const line of text.split('\n')) {
    const cut = line.indexOf(' ')
    if (cut <= 0) continue
    const rest = line.slice(cut + 1)
    const timed = /^(\d{9,11})\t(.*)$/.exec(rest)
    shas.push(line.slice(0, cut))
    subjects.push(timed ? timed[2] ?? '' : rest)
    times.push(timed ? Number(timed[1]) * 1000 : Number.NaN)
  }
  return { base, shas, subjects, times }
}

/** The default branch and its newest commits (shas, subjects and times), or null outside git. */
export async function readBase($: EngineInterface): Promise<BaseLog | null> {
  const base = await baseRef($)
  if (base === null) return null
  const log = await git($, ['log', `-n${MERGED_DEPTH}`, '--format=%H %ct%x09%s', base])
  if (log === null) return null
  return parseBaseLog(base, log)
}

/** Reads the default branch's commits and returns the drift; none outside git. A base already read is used as is. */
export async function readDrift(
  $: EngineInterface,
  c: PassChecklist | null,
  p: PassProjection | null,
  branch: string | null,
  known?: BaseLog | { base: string; shas: string[]; subjects: string[] } | null,
): Promise<StatusDrift[]> {
  if (!c || c.layout !== 'pie') return []
  const read = known === undefined ? await readBase($) : known
  if (read === null) return []
  return statusDrift(c, p, { ...read, branch })
}
