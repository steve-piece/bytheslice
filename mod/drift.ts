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

async function git($: EngineInterface, argv: string[]): Promise<string | null> {
  try {
    const run = await $.process.run(['git', ...argv], { timeoutMs: 5000 })
    return run.exitCode === 0 ? run.stdout : null
  } catch {
    return null
  }
}

/** The default branch to compare with: origin's HEAD, else origin/main, main, origin/master, master. */
async function baseRef($: EngineInterface): Promise<string | null> {
  const head = (await git($, ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD']))?.trim()
  for (const ref of [head, 'origin/main', 'main', 'origin/master', 'master']) {
    if (ref && (await git($, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`])) !== null) return ref
  }
  return null
}

/** Reads the default branch's commits and returns the drift; none outside git. */
export async function readDrift($: EngineInterface, c: PassChecklist | null, p: PassProjection | null, branch: string | null): Promise<StatusDrift[]> {
  if (!c || c.layout !== 'pie') return []
  const base = await baseRef($)
  if (base === null) return []
  const log = await git($, ['log', `-n${MERGED_DEPTH}`, '--format=%H %s', base])
  if (log === null) return []
  const shas: string[] = []
  const subjects: string[] = []
  for (const line of log.split('\n')) {
    const cut = line.indexOf(' ')
    if (cut <= 0) continue
    shas.push(line.slice(0, cut))
    subjects.push(line.slice(cut + 1))
  }
  return statusDrift(c, p, { base, shas, subjects, branch })
}
