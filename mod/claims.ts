// mod/claims.ts
// Session against session: who else is on a pie or a slice. Claim and release rows in the shared ledger, plus three read-only sources (other sessions' ledger rows, every local and remote branch and worktree, PRs through gh), folded into one list of other work for bts_status, bts_claim, a baker skill's start and the first write or commit. It informs and never refuses.

import type { EngineInterface } from 'claude-code'

import { headsMatch } from './checks.ts'
import { git, readBase, slicesNamed } from './drift.ts'
import { stripJsonc } from './jsonc.ts'
import { appendRow, primaryRoot, readRows, sessionId } from './ledger.ts'
import type { LedgerRow } from './ledger.ts'
import { activePie, branchPie } from './projection.ts'
import { ENDED_PREFIX, STRIP_MAX_AGE_MS, STRIP_PREFIX, projectKey } from './strip.ts'
import type { PassChecklist } from './types'

/** A claim, or another session's work, with no activity for longer than this is reported as stale. */
export const CLAIM_STALE_MS = 6 * 60 * 60 * 1000
/** Rows with nothing to point at (no branch, commit or PR) older than this are history, whoever wrote them. */
export const HISTORY_MS = 7 * 24 * 60 * 60 * 1000
/** Why a session lets go of a claim. `done` keeps its work visible until it reaches the default branch. */
export const RELEASE_REASONS = ['done', 'deferred', 'abandoned'] as const
export type ReleaseReason = (typeof RELEASE_REASONS)[number]
/** A claim's goal is cut to this many characters. */
export const GOAL_MAX = 200
/** How long one `gh pr list` answer is reused. */
export const PR_CACHE_MS = 60000
/** How long one read of git (branches, worktrees, their status) is reused; the ledger is always read fresh. */
export const SNAPSHOT_MS = 10000
/** Commits read past the default branch, across every branch. */
export const OFF_BASE_DEPTH = 2000
/** Worktrees on a pie branch whose uncommitted files are counted. */
export const DIRTY_WORKTREES = 8

/** A commit on some branch that is neither on the default branch nor reachable from HEAD. */
export type RefCommit = { sha: string; branch: string; t: number; subject: string }
/** A branch tip, local or remote, by its short name. */
export type RefHead = { branch: string; sha: string; t: number }
/** A worktree of the repository: its path, its branch, and its uncommitted files when counted. */
export type WorktreeEntry = { path: string; branch: string | null; dirty: number | null }
/** An open pull request as `gh pr list` names it. */
export type OpenPr = { number: number; title: string; head: string; url: string; t: number }
/** A merged pull request's head branch and when it merged: work on that branch up to then is merged, squashed or not. */
export type MergedPr = { head: string; t: number }

/** Everything the fold reads: facts gathered once, so the fold stays pure. */
export type Elsewhere = {
  self: { sid: string; branch: string | null; worktree: string }
  rows: readonly LedgerRow[]
  now: number
  /** The default branch and its commits, or null outside git. */
  base: { base: string; shas: readonly string[]; subjects: readonly string[] } | null
  commits: readonly RefCommit[]
  heads: readonly RefHead[]
  worktrees: readonly WorktreeEntry[]
  /** Open PRs, or null when gh is missing or failed. */
  prs: readonly OpenPr[] | null
  /** Merged PRs' heads, or empty when gh is missing. */
  merged?: readonly MergedPr[]
  /** `delivery.mode` from bytheslice.config.json, or null. */
  mode: string | null
  /** When each session of the project last wrote its roadmap strip entry (a running session keeps one fresh). */
  strip: Readonly<Record<string, number>>
  /** When each session that said so ended (its `session.end`). */
  ended?: Readonly<Record<string, number>>
  staleMs: number
}

/**
 * How a session behind other work stands: `live` (running, active within the
 * stale threshold), `stale` (running, quiet past it), `idle` (no running
 * process seen; its chat may still be open) or `ended` (it said so).
 */
export type Liveness = 'live' | 'stale' | 'idle' | 'ended'

/** One other piece of work on the pie: a session, a branch, a PR, or all three folded together. */
export type Party = {
  key: string
  /** The liveliest session on it, shown in its line. */
  sid: string | null
  /** Every session the ledger puts on it. */
  sids: string[]
  branch: string | null
  worktree: string | null
  dirty: number | null
  pie: number
  slices: string[]
  /** Slices its ledger shows done. */
  done: string[]
  /** It claims or branches the pie as a whole. */
  pieLevel: boolean
  /** Commits on its branch past the default branch. */
  commits: number
  claimed: boolean
  goal: string | null
  lastT: number | null
  liveness: Liveness | null
  pr: { number: number; url: string } | null
  /** Its branch is one pie branch (not `pie-N-sN.M-...`). */
  pieBranch: boolean
}

/** What the fold found for one pie: other work that conflicts, work this session continues, and a delivery-mode mismatch. */
export type Collisions = { pie: number; conflicts: Party[]; handoffs: Party[]; delivery: string | null }

const SLICE_BRANCH = /(^|\/)pie[-/]\d+[-/]s\d+\.\d+/
const SLICE_OF_BRANCH = /(^|\/)pie[-/]\d+[-/]s(\d+\.\d+)/
const PIES_TITLE = /\bpies?\s+(\d+(?:\s*(?:,|&|and|to|-)\s*\d+)*)/gi
const SLICES_TITLE = /\bslices?\s+(\d+\.\d+(?:\s*(?:,|&|and)\s*\d+\.\d+)*)/gi
/** A PR that only plans work: its title says so and nothing else ties it to a build. */
const PLAN_TITLE = /\b(plans?|planning|roadmap|checklist|specs?|docs?|special order)\b/i
/** A squash merge's subject names its PR: `Pie 23: video (#251)`. */
const SQUASH_SUBJECT = /\(#\d+\)\s*$/
const SLICE_ID = /^\d+\.\d+$/
/**
 * The ledger events that are work on a slice. A warning, note or HITL row about one is not, and neither is
 * bookkeeping (`usage` after a turn, `slice.rollup` after a flip), which follows a release in the same turn.
 */
const WORK_EVENTS: ReadonlySet<string> = new Set(['pie.started', 'slice.started', 'claim', 'commit', 'push', 'merge', 'verdict', 'slice.done', 'edit'])
const RANK: Record<Liveness, number> = { live: 3, stale: 2, idle: 1, ended: 0 }

/** A ref's short branch name: `refs/heads/x` and `refs/remotes/origin/x` both read `x`. Pure. */
export function shortBranch(ref: string): string {
  return ref
    .trim()
    .replace(/^refs\/heads\//, '')
    .replace(/^refs\/remotes\/[^/]+\//, '')
    .replace(/^origin\//, '')
}

/** The slice a slice branch is named for (`pie-7-s7.2-x` reads 7.2), or null for any other branch. Pure. */
export function branchSlice(branch: string | null): string | null {
  return SLICE_OF_BRANCH.exec(branch ?? '')?.[2] ?? null
}

/** Whether a branch name is one pie branch rather than one slice's. Pure. */
export function isPieBranch(branch: string | null): boolean {
  return branch !== null && branchPie(branch) !== null && !SLICE_BRANCH.test(branch)
}

/** Every pie a title names: `Pie 23`, `Pies 23 and 24`, `Pie 26 ... and Pie 27`, `Pies 3 to 5`. Pure. */
export function piesInTitle(title: string): number[] {
  const out = new Set<number>()
  for (const m of title.matchAll(PIES_TITLE)) {
    const list = m[1] ?? ''
    const range = /^(\d+)\s*(?:to|-)\s*(\d+)$/.exec(list.trim())
    if (range) {
      const [a, b] = [Number(range[1]), Number(range[2])]
      for (let n = Math.min(a, b); n <= Math.max(a, b) && n - Math.min(a, b) < 50; n += 1) out.add(n)
    } else for (const n of list.match(/\d+/g) ?? []) out.add(Number(n))
  }
  return [...out]
}

/** Every slice a title names: `Slice 23.1`, `Slices 23.1 and 23.2`. Pure. */
export function slicesInTitle(title: string): string[] {
  const out = new Set<string>()
  for (const m of title.matchAll(SLICES_TITLE)) for (const id of (m[1] ?? '').match(/\d+\.\d+/g) ?? []) out.add(id)
  return [...out]
}

const pieOfSlice = (slice: string): number => Number(slice.split('.')[0])

const sortSlices = (ids: Iterable<string>): string[] =>
  [...new Set(ids)].sort((a, b) => {
    const [a1, a2] = a.split('.').map(Number)
    const [b1, b2] = b.split('.').map(Number)
    return (a1 ?? 0) - (b1 ?? 0) || (a2 ?? 0) - (b2 ?? 0)
  })

const rowBranch = (row: LedgerRow): string | null => {
  const value = row.data?.branch
  return typeof value === 'string' && value !== '' && value !== 'HEAD' ? shortBranch(value) : null
}

/**
 * A claim (or the start beside it) recorded while other work was on the pie:
 * it states intent and becomes a claim only through `over: true`, so nobody
 * counts it as a claim or as work.
 */
export const isContested = (row: LedgerRow): boolean => row.data?.contested === true

/** The branches this session's own rows name, plus the one checked out: its own work, never a conflict. Pure. */
export function ownBranches(world: Pick<Elsewhere, 'self' | 'rows' | 'base'>): Set<string> {
  const own = new Set<string>()
  if (world.self.branch && world.self.branch !== 'HEAD') own.add(shortBranch(world.self.branch))
  for (const row of world.rows) {
    if (row.sid !== world.self.sid || isContested(row)) continue
    const branch = rowBranch(row)
    if (branch !== null) own.add(branch)
  }
  if (world.base) own.delete(shortBranch(world.base.base))
  return own
}

/** How a session stands: `live` or `stale` while its strip entry is fresh, else `ended` if it said so, else `idle`. Pure. */
export function livenessOf(sid: string, lastT: number | null, world: Pick<Elsewhere, 'strip' | 'now' | 'staleMs' | 'ended'>): Liveness {
  const strip = world.strip[sid]
  if (strip !== undefined && world.now - strip <= STRIP_MAX_AGE_MS) return lastT === null || world.now - lastT > world.staleMs ? 'stale' : 'live'
  return world.ended?.[sid] !== undefined ? 'ended' : 'idle'
}

type SidWork = {
  sid: string
  slices: Map<string, { lastWork: number; lastDrop: number; lastCommit: number; lastFresh: number; shas: string[] }>
  pieWork: number
  pieDrop: number
  pieClaim: boolean
  claimed: boolean
  branch: string | null
  branchT: number
  worktree: string | null
  goal: string | null
  goalT: number
  done: Set<string>
}

/**
 * Other work on `pie`: every other session's ledger rows and claims for it,
 * every branch with commits that name its slices (or a pie branch checked out
 * in another worktree), and every open PR for it; folded by branch. Work
 * already on the default branch (by sha, by a subject naming the slice, or by
 * a merged PR of its branch, so squash merges count), released as deferred or
 * abandoned, or taken over by a later claim does not count, and neither does a
 * contested claim. Work on this session's own branch by a session no longer
 * live is a handoff, not a conflict. `open` is the slices the checklist still
 * shows open: `[]` means none (nothing collides), null means unknown (no filter).
 * Pure.
 */
export function collisionsFor(world: Elsewhere, pie: number, open: readonly string[] | null): Collisions {
  const filter = open === null ? null : new Set(open)
  if (filter !== null && filter.size === 0) return { pie, conflicts: [], handoffs: [], delivery: null }
  // A merged commit is already left out by sha. Only a squash merge (`... (#n)`) proves a whole slice merged:
  // one task of a slice on the default branch says nothing about the slice's other commits.
  const squashes = (world.base?.subjects ?? []).filter(subject => SQUASH_SUBJECT.test(subject))
  const named = new Set([...slicesNamed(squashes), ...squashes.flatMap(subject => slicesInTitle(subject))])
  // A squash merge naming the pie (`Pie 23: ... (#251)`) merged its whole-pie branch.
  const squashedPie = (world.base?.subjects ?? []).some(subject => SQUASH_SUBJECT.test(subject) && piesInTitle(subject).includes(pie))
  const onBase = (sha: string): boolean => world.base?.shas.some(merged => headsMatch(merged, sha)) ?? false
  const mergedBefore = (branch: string | null, t: number): boolean =>
    branch !== null && (world.merged ?? []).some(m => shortBranch(m.head) === branch && m.t >= t)
  const own = ownBranches(world)
  const inPie = (row: LedgerRow): boolean =>
    row.pie === pie || (typeof row.slice === 'string' && SLICE_ID.test(row.slice) && pieOfSlice(row.slice) === pie)
  const wanted = (id: string): boolean => pieOfSlice(id) === pie && (filter === null || filter.has(id))

  // One pass over the ledger: last activity per session, takeovers, branches per session, and each session's work.
  const lastBySid = new Map<string, number>()
  const takeovers: { t: number; slice: string | null; over: Set<string> }[] = []
  const sidBranches = new Map<string, Set<string>>()
  const bySid = new Map<string, SidWork>()
  for (const row of world.rows) {
    lastBySid.set(row.sid, Math.max(lastBySid.get(row.sid) ?? row.t, row.t))
    if (!inPie(row) || isContested(row)) continue
    if (row.ev === 'claim' && Array.isArray(row.data?.over)) {
      takeovers.push({ t: row.t, slice: row.slice ?? null, over: new Set(row.data.over.filter((x): x is string => typeof x === 'string')) })
    }
    // A release as deferred or abandoned lets go of that session's work on every source, as a takeover would:
    // its ledger rows, its branches' commits from before the release, their worktrees and PRs.
    if (row.ev === 'release' && row.data?.reason !== 'done') takeovers.push({ t: row.t, slice: row.slice ?? null, over: new Set([row.sid]) })
    const branch = rowBranch(row)
    if (branch !== null) sidBranches.set(row.sid, (sidBranches.get(row.sid) ?? new Set()).add(branch))
    if (row.sid === world.self.sid || (!WORK_EVENTS.has(row.ev) && row.ev !== 'release')) continue
    let work = bySid.get(row.sid)
    if (!work) {
      work = { sid: row.sid, slices: new Map(), pieWork: Number.NEGATIVE_INFINITY, pieDrop: Number.NEGATIVE_INFINITY, pieClaim: false, claimed: false, branch: null, branchT: Number.NEGATIVE_INFINITY, worktree: null, goal: null, goalT: Number.NEGATIVE_INFINITY, done: new Set() }
      bySid.set(row.sid, work)
    }
    if (branch !== null && row.t >= work.branchT) {
      work.branch = branch
      work.branchT = row.t
    }
    if (row.ev === 'claim') {
      work.claimed = true
      if (typeof row.data?.worktree === 'string') work.worktree = row.data.worktree
      if (typeof row.data?.goal === 'string' && row.data.goal !== '' && row.t >= work.goalT) {
        work.goal = row.data.goal
        work.goalT = row.t
      }
    }
    const dropping = row.ev === 'release' && row.data?.reason !== 'done'
    if (row.slice === undefined || !SLICE_ID.test(row.slice)) {
      if (dropping) work.pieDrop = Math.max(work.pieDrop, row.t)
      else if (row.ev !== 'release') {
        work.pieWork = Math.max(work.pieWork, row.t)
        // A /sell-slice start writes pie.started too; only a pie claim or a /sell-pie start holds the whole pie.
        if (row.ev === 'claim' || (row.ev === 'pie.started' && row.data?.skill !== 'sell-slice')) work.pieClaim = true
      }
      continue
    }
    const slice = work.slices.get(row.slice) ?? { lastWork: Number.NEGATIVE_INFINITY, lastDrop: Number.NEGATIVE_INFINITY, lastCommit: Number.NEGATIVE_INFINITY, lastFresh: Number.NEGATIVE_INFINITY, shas: [] }
    if (dropping) slice.lastDrop = Math.max(slice.lastDrop, row.t)
    else if (row.ev !== 'release') slice.lastWork = Math.max(slice.lastWork, row.t)
    // A claim, a start or an edit is fresh work; a push, verdict or done flip only follows commits.
    if (row.ev === 'claim' || row.ev === 'slice.started' || row.ev === 'edit') slice.lastFresh = Math.max(slice.lastFresh, row.t)
    if (row.ev === 'commit' && typeof row.data?.sha === 'string') {
      slice.shas.push(row.data.sha)
      slice.lastCommit = Math.max(slice.lastCommit, row.t)
    }
    if (row.ev === 'slice.done') work.done.add(row.slice)
    work.slices.set(row.slice, slice)
  }

  // A takeover covers the sessions it names and every branch they recorded. A slice takeover covers that slice;
  // whole-pie evidence needs a pie takeover, or a takeover of every slice this check is about.
  const matches = (x: { slice: string | null }, slice: string | null): boolean => x.slice === null || x.slice === slice
  const takenOver = (sid: string, branch: string | null, slice: string | null, since: number): boolean =>
    takeovers.some(x => x.t > since && matches(x, slice) && (x.over.has(sid) || (branch !== null && x.over.has(branch))))
  const branchTaken = (branch: string, slice: string | null, since: number): boolean =>
    takeovers.some(
      x => x.t > since && matches(x, slice) && (x.over.has(branch) || [...x.over].some(name => sidBranches.get(name)?.has(branch) ?? false)),
    )
  const checked = filter === null ? null : [...filter]
  const wholeTaken = (branch: string, since: number): boolean =>
    branchTaken(branch, null, since) || (checked !== null && checked.every(id => branchTaken(branch, id, since)))
  const sidWholeTaken = (sid: string, branch: string | null, since: number): boolean =>
    takenOver(sid, branch, null, since) || (checked !== null && checked.every(id => takenOver(sid, branch, id, since)))

  const parties = new Map<string, Party>()
  const partyFor = (branch: string | null, sid: string | null): Party => {
    const key = branch ?? `session:${sid ?? 'unknown'}`
    let party = parties.get(key)
    if (!party) {
      party = { key, sid: null, sids: [], branch, worktree: null, dirty: null, pie, slices: [], done: [], pieLevel: false, commits: 0, claimed: false, goal: null, lastT: null, liveness: null, pr: null, pieBranch: isPieBranch(branch) }
      parties.set(key, party)
    }
    if (sid !== null && !party.sids.includes(sid)) party.sids.push(sid)
    return party
  }
  const touch = (party: Party, t: number | null) => {
    if (t !== null && Number.isFinite(t)) party.lastT = party.lastT === null ? t : Math.max(party.lastT, t)
  }

  // Source 1: other sessions' ledger rows and claims.
  for (const work of bySid.values()) {
    const live: string[] = []
    for (const [id, slice] of work.slices) {
      if (slice.lastWork === Number.NEGATIVE_INFINITY) continue
      if (slice.lastDrop >= slice.lastWork || work.pieDrop >= slice.lastWork) continue
      // Settled only when every commit it recorded reached the default branch, not when one did, and nothing
      // (a fresh claim, an edit) came after its last commit: merged commits cover only the work before them.
      const allMerged = slice.shas.length > 0 && slice.shas.every(onBase) && slice.lastFresh <= slice.lastCommit
      // A squash merge naming the pie (`Pie 7: ... (#42)`) merged its whole-pie branch, ledger rows included.
      const squashedHere = squashedPie && isPieBranch(work.branch)
      if (named.has(id) || allMerged || squashedHere || mergedBefore(work.branch, slice.lastWork)) continue
      if (!wanted(id)) continue
      if (takenOver(work.sid, work.branch, id, slice.lastWork)) continue
      live.push(id)
    }
    // A pie-level claim alone matters while its session may still be on it: an ended one left nothing behind.
    const gone = livenessOf(work.sid, lastBySid.get(work.sid) ?? null, world) === 'ended'
    const pieOpen =
      work.pieClaim &&
      work.pieWork > work.pieDrop &&
      !(gone && live.length === 0) &&
      !mergedBefore(work.branch, work.pieWork) &&
      !sidWholeTaken(work.sid, work.branch, work.pieWork)
    if (live.length === 0 && !pieOpen) continue
    const party = partyFor(work.branch, work.sid)
    party.slices = sortSlices([...party.slices, ...live])
    party.done = sortSlices([...party.done, ...[...work.done].filter(id => live.includes(id))])
    party.pieLevel ||= pieOpen
    party.claimed ||= work.claimed
    party.worktree ??= work.worktree
    party.goal ??= work.goal
    touch(party, lastBySid.get(work.sid) ?? null)
  }

  // Source 2: branches with commits past the default branch. A subject naming this pie's slices is evidence for
  // those slices only; one naming none counts for its slice branch's slice, or the whole pie on a whole-pie branch.
  for (const commit of world.commits) {
    const branch = shortBranch(commit.branch)
    if (own.has(branch) || mergedBefore(branch, commit.t)) continue
    const subjectSlices = [...slicesNamed([commit.subject])].filter(id => pieOfSlice(id) === pie)
    const bySlice = branchSlice(branch)
    const ids = (subjectSlices.length > 0 ? subjectSlices : bySlice !== null && pieOfSlice(bySlice) === pie ? [bySlice] : [])
      .filter(id => wanted(id) && !named.has(id) && !branchTaken(branch, id, commit.t))
    const wholePie = subjectSlices.length === 0 && bySlice === null && branchPie(branch) === pie && !squashedPie && !wholeTaken(branch, commit.t)
    if (ids.length === 0 && !wholePie) continue
    const party = partyFor(branch, null)
    party.slices = sortSlices([...party.slices, ...ids])
    party.commits += 1
    party.pieLevel ||= wholePie
    touch(party, commit.t)
  }
  // A pie or slice branch with nothing past the default branch counts only when another worktree has it checked out.
  for (const tree of world.worktrees) {
    if (tree.path === world.self.worktree || tree.branch === null) continue
    const branch = shortBranch(tree.branch)
    if (own.has(branch) || branchPie(branch) !== pie) continue
    const tip = world.heads.find(head => head.branch === branch)?.t ?? null
    const bySlice = branchSlice(branch)
    // Uncommitted edits are new work: a merge of the branch's committed tip says nothing about them.
    const dirty = (tree.dirty ?? 0) > 0
    if (!dirty && mergedBefore(branch, tip ?? 0)) continue
    if (bySlice !== null ? !wanted(bySlice) || (!dirty && named.has(bySlice)) || branchTaken(branch, bySlice, tip ?? 0) : (!dirty && squashedPie) || wholeTaken(branch, tip ?? 0)) continue
    const party = partyFor(branch, null)
    if (bySlice !== null) party.slices = sortSlices([...party.slices, bySlice])
    else party.pieLevel ||= party.slices.length === 0
    if (party.lastT === null) touch(party, tip)
  }

  // Source 3: open PRs for this pie or its slices. A PR that only names the pie in a planning title is not a build.
  for (const pr of world.prs ?? []) {
    const head = shortBranch(pr.head)
    if (own.has(head)) continue
    const known = parties.has(head)
    const titleSlices = slicesInTitle(pr.title).filter(id => pieOfSlice(id) === pie)
    const headSlice = branchSlice(head)
    const prSlices = titleSlices.length > 0 ? titleSlices : headSlice !== null && pieOfSlice(headSlice) === pie ? [headSlice] : []
    const byHead = branchPie(head) === pie
    const byTitle = piesInTitle(pr.title).includes(pie)
    if (!known && !byHead && prSlices.length === 0 && !byTitle) continue
    if (!known && !byHead && prSlices.length === 0 && PLAN_TITLE.test(pr.title)) continue
    const slices = prSlices.filter(wanted)
    if (!known && prSlices.length > 0 && slices.length === 0) continue
    // A PR updates after a takeover (reviews, CI), so any takeover of its branch covers it.
    if (prSlices.length > 0 ? slices.every(id => branchTaken(head, id, Number.NEGATIVE_INFINITY)) : wholeTaken(head, Number.NEGATIVE_INFINITY)) continue
    const party = partyFor(head, null)
    party.pr = { number: pr.number, url: pr.url }
    if (slices.length > 0) party.slices = sortSlices([...party.slices, ...slices])
    else if (party.slices.length === 0) party.pieLevel = true
    touch(party, pr.t)
  }

  // Worktrees and liveness (the liveliest of its sessions), then the split into conflicts and handoffs.
  const conflicts: Party[] = []
  const handoffs: Party[] = []
  for (const party of parties.values()) {
    const tree = party.branch === null ? undefined : world.worktrees.find(x => x.branch !== null && shortBranch(x.branch) === party.branch && x.path !== world.self.worktree)
    if (tree) {
      party.worktree = tree.path
      party.dirty = tree.dirty
    }
    for (const sid of party.sids) {
      const liveness = livenessOf(sid, lastBySid.get(sid) ?? party.lastT, world)
      if (party.liveness === null || RANK[liveness] > RANK[party.liveness]) {
        party.liveness = liveness
        party.sid = sid
      }
    }
    // A claim's worktree is where it was made, maybe a primary checkout it left: it counts only with no branch,
    // commit or PR elsewhere to point at, as does an ended session's or old history's.
    const onOwn = party.branch !== null && own.has(party.branch)
    const unlocated = party.branch === null && party.commits === 0 && party.pr === null
    const sameTree = unlocated && party.worktree !== null && party.worktree === world.self.worktree
    const history = unlocated && (party.liveness === 'ended' || (party.lastT !== null && world.now - party.lastT > HISTORY_MS))
    if ((onOwn || sameTree || history) && party.liveness !== 'live') handoffs.push(party)
    else conflicts.push(party)
  }
  const order = (a: Party, b: Party) => (b.lastT ?? 0) - (a.lastT ?? 0)
  conflicts.sort(order)
  handoffs.sort(order)

  let delivery: string | null = null
  if (world.mode === 'merge-per-slice') {
    const mine = world.self.branch !== null && branchPie(world.self.branch) === pie && isPieBranch(world.self.branch) ? world.self.branch : null
    const theirs = conflicts.find(x => x.pieBranch && x.slices.length >= 2)?.branch ?? null
    const branch = mine ?? theirs
    if (branch !== null) {
      delivery = `delivery.mode is merge-per-slice (one branch and PR per slice), but ${mine ? 'this session is on' : 'another run used'} one pie branch, ${branch}, for Pie ${pie}`
    }
  }
  return { pie, conflicts, handoffs, delivery }
}

/** An age as `just now`, `12 min ago`, `5 h ago` or `3 d ago`. Pure. */
export function ageWords(ms: number): string {
  const m = Math.floor(Math.max(0, ms) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  const h = Math.floor(m / 60)
  if (h < 48) return `${h} h ago`
  return `${Math.floor(h / 24)} d ago`
}

const sidWord = (sid: string): string => (sid.length <= 12 ? sid : `${sid.slice(0, 8)}…`)

function sliceWords(party: Party): string {
  if (party.slices.length === 0) return `Pie ${party.pie}`
  if (party.slices.length === 1) return `Slice ${party.slices[0]}`
  return `Slices ${party.slices.join(', ')}`
}

/** One conflict in plain words, for example `Slice 23.1 is also being built by another session (abc) on branch X (...)`. Pure. */
export function conflictLine(party: Party, now: number): string {
  const many = party.slices.length > 1
  const what = sliceWords(party)
  const be = many ? 'are' : 'is'
  let who: string
  if (party.sid !== null && party.liveness === 'live') who = `${be} also being built by another session (${sidWord(party.sid)})`
  else if (party.sid !== null && (party.liveness === 'stale' || party.liveness === 'idle')) {
    who = `${many ? 'were' : 'was'} ${party.claimed ? 'claimed' : 'started'} by another session (${sidWord(party.sid)})`
  } else if (party.sid !== null) who = `${many ? 'were' : 'was'} worked on by a session that has ended (${sidWord(party.sid)})`
  else if (party.commits > 0) who = `already ${many ? 'have' : 'has'} commits`
  else if (party.pr !== null) who = `already ${many ? 'have' : 'has'} an open PR`
  else who = `${be} checked out elsewhere`
  const where: string[] = []
  if (party.branch !== null) where.push(`on branch ${party.branch}`)
  if (party.worktree !== null) where.push(`in worktree ${party.worktree}`)
  const facts: string[] = []
  if (party.liveness === 'stale') facts.push('stale')
  if (party.liveness === 'idle') facts.push('idle: no running session seen, its chat may still be open')
  if (party.sids.length > 1) facts.push(`${party.sids.length} sessions on it`)
  if (party.commits > 0) facts.push(`${party.commits} commit${party.commits === 1 ? '' : 's'} not on the default branch`)
  if (party.dirty !== null && party.dirty > 0) facts.push(`${party.dirty} uncommitted file${party.dirty === 1 ? '' : 's'}`)
  if (party.done.length > 0) facts.push(`${party.done.join(', ')} done in its ledger`)
  if (party.lastT !== null) facts.push(`last activity ${ageWords(now - party.lastT)}`)
  if (party.pr !== null) facts.push(`PR ${party.pr.number} open`)
  if (party.goal !== null) facts.push(`goal: ${party.goal}`)
  return `${what} ${who}${where.length > 0 ? ` ${where.join(' ')}` : ''}${facts.length > 0 ? ` (${facts.join(', ')})` : ''}`
}

/** One handoff in plain words: this session continues another's work on its own branch. Pure. */
export function handoffLine(party: Party, now: number): string {
  const state = party.liveness === 'ended' ? 'ended' : `${party.liveness ?? 'stale'}, last activity ${ageWords(now - (party.lastT ?? now))}`
  const where = party.branch === null ? '' : ` on branch ${party.branch}`
  return `${sliceWords(party)}: continuing${where} from session ${sidWord(party.sid ?? 'unknown')} (${state})`
}

/** What a session does about conflicts before it cuts a branch or writes code. */
export const GATE_STEP =
  'Before cutting a branch or writing code, raise a destructive_operation HITL with bts_hitl carrying these facts, ask the operator in chat, and stop. Once they say to go ahead, call bts_claim with over: true.'

/** The lines bts_status, bts_claim and the skill start print for one pie. Pure. */
export function collisionLines(found: Collisions, now: number): string[] {
  const lines = found.conflicts.map(party => conflictLine(party, now))
  if (found.delivery !== null) lines.push(found.delivery)
  return lines
}

// ---- Reading the sources ---------------------------------------------------

type PrList = { open: OpenPr[]; merged: MergedPr[] }
type GitSnapshot = { key: string; t: number; commits: RefCommit[]; heads: RefHead[]; worktrees: WorktreeEntry[] }

let prCache: { cwd: string; t: number; prs: PrList | null } | null = null
let snapshot: GitSnapshot | null = null

/** Forgets the cached PR list and git snapshot (a new session, or a test). */
export function resetClaims(): void {
  prCache = null
  snapshot = null
}

async function nowOf($: EngineInterface): Promise<number> {
  try {
    return await $.clock.now()
  } catch {
    return Date.now()
  }
}

async function cwdOf($: EngineInterface): Promise<string> {
  try {
    return await $.session.cwd()
  } catch {
    return '.'
  }
}

/** Parses `git log --source --format=%H%x09%S%x09%ct%x09%s` output. Pure. */
export function parseRefCommits(text: string): RefCommit[] {
  const out: RefCommit[] = []
  for (const line of text.split('\n')) {
    const [sha, ref, ct, ...rest] = line.split('\t')
    if (!sha || !ref || !ct || !/^[0-9a-f]{7,64}$/.test(sha)) continue
    const t = Number(ct) * 1000
    if (!Number.isFinite(t)) continue
    out.push({ sha, branch: shortBranch(ref), t, subject: rest.join('\t') })
  }
  return out
}

/** Parses `git for-each-ref --format=%(refname)%09%(objectname)%09%(committerdate:unix)` output. Pure. */
export function parseHeads(text: string): RefHead[] {
  const out: RefHead[] = []
  for (const line of text.split('\n')) {
    const [ref, sha, ct] = line.split('\t')
    if (!ref || !sha || !ct || ref.endsWith('/HEAD')) continue
    out.push({ branch: shortBranch(ref), sha, t: Number(ct) * 1000 })
  }
  return out
}

/** Parses `git worktree list --porcelain` output. Pure. */
export function parseWorktrees(text: string): WorktreeEntry[] {
  const out: WorktreeEntry[] = []
  let current: WorktreeEntry | null = null
  for (const line of text.split('\n')) {
    if (line.startsWith('worktree ')) {
      current = { path: line.slice('worktree '.length).trim(), branch: null, dirty: null }
      out.push(current)
    } else if (current && line.startsWith('branch ')) {
      current.branch = shortBranch(line.slice('branch '.length))
    }
  }
  return out
}

/**
 * Parses `gh pr list --json number,title,headRefName,url,updatedAt,state,mergedAt`
 * output into open PRs and merged heads (a closed, unmerged PR is neither);
 * anything else reads as null. Pure.
 */
export function parsePrList(text: string): PrList | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return null
  }
  if (!Array.isArray(parsed)) return null
  const open: OpenPr[] = []
  const merged: MergedPr[] = []
  for (const item of parsed) {
    if (item === null || typeof item !== 'object') continue
    const v = item as Record<string, unknown>
    if (typeof v.number !== 'number' || typeof v.headRefName !== 'string') continue
    const state = typeof v.state === 'string' ? v.state.toUpperCase() : 'OPEN'
    if (state === 'MERGED') {
      const t = typeof v.mergedAt === 'string' ? Date.parse(v.mergedAt) : Number.NaN
      if (Number.isFinite(t)) merged.push({ head: v.headRefName, t })
      continue
    }
    if (state !== 'OPEN') continue
    const t = typeof v.updatedAt === 'string' ? Date.parse(v.updatedAt) : Number.NaN
    open.push({
      number: v.number,
      title: typeof v.title === 'string' ? v.title : '',
      head: v.headRefName,
      url: typeof v.url === 'string' ? v.url : '',
      t: Number.isFinite(t) ? t : 0,
    })
  }
  return { open, merged }
}

/** The open PRs of a `gh pr list` answer, or null. Pure. */
export function parsePrs(text: string): OpenPr[] | null {
  return parsePrList(text)?.open ?? null
}

/** Open PRs and merged heads through gh, cached for a minute; null when gh is missing, signed out or slow. Never throws. */
export async function readPrs($: EngineInterface, cwd: string, now: number): Promise<PrList | null> {
  if (prCache && prCache.cwd === cwd && now - prCache.t < PR_CACHE_MS) return prCache.prs
  let prs: PrList | null = null
  try {
    const run = await $.process.run(
      ['gh', 'pr', 'list', '--state', 'all', '--limit', '200', '--json', 'number,title,headRefName,url,updatedAt,state,mergedAt'],
      { cwd, timeoutMs: 10000 },
    )
    prs = run.exitCode === 0 ? parsePrList(run.stdout) : null
  } catch {
    prs = null
  }
  prCache = { cwd, t: now, prs }
  return prs
}

/** `delivery.mode` from bytheslice.config.json in the session directory, else the primary checkout. Never throws. */
export async function readMode($: EngineInterface, cwd: string): Promise<string | null> {
  const roots = [cwd, await primaryRoot($).catch(() => cwd)]
  for (const root of new Set(roots)) {
    try {
      const path = `${root.replace(/\/$/, '')}/bytheslice.config.json`
      if (!(await $.fs.exists(path))) continue
      const config = JSON.parse(stripJsonc(await $.fs.read(path))) as { delivery?: { mode?: unknown } }
      const mode = config?.delivery?.mode
      return typeof mode === 'string' ? mode : null
    } catch {
      continue
    }
  }
  return null
}

/** Each session's strip time and each ended session's end time, from `$.store`. */
async function readSessionTimes($: EngineInterface): Promise<{ strip: Record<string, number>; ended: Record<string, number> }> {
  const strip: Record<string, number> = {}
  const ended: Record<string, number> = {}
  try {
    const project = await projectKey($)
    const live = `${STRIP_PREFIX}${project}:`
    const gone = `${ENDED_PREFIX}${project}:`
    const keys = (await $.store.keys()).filter(key => key.startsWith(live) || key.startsWith(gone))
    const values = await Promise.all(keys.map(key => $.store.get(key)))
    keys.forEach((key, i) => {
      const value = values[i] as { t?: unknown } | number | undefined
      const t = typeof value === 'number' ? value : typeof value?.t === 'number' ? value.t : null
      if (t === null) return
      if (key.startsWith(live)) strip[key.slice(live.length)] = t
      else ended[key.slice(gone.length)] = t
    })
  } catch {
    // No store: every other session reads as idle, and its work still shows.
  }
  return { strip, ended }
}

async function readGit($: EngineInterface, cwd: string, base: NonNullable<Elsewhere['base']>): Promise<Omit<GitSnapshot, 'key' | 't'>> {
  const [log, refs, list] = await Promise.all([
    git($, ['log', '--branches', '--remotes', '--source', `-n${OFF_BASE_DEPTH}`, '--format=%H%x09%S%x09%ct%x09%s', '--not', base.base, 'HEAD'], 8000),
    git($, ['for-each-ref', '--format=%(refname)%09%(objectname)%09%(committerdate:unix)', 'refs/heads', 'refs/remotes']),
    git($, ['worktree', 'list', '--porcelain']),
  ])
  const worktrees = list === null ? [] : parseWorktrees(list)
  const counted = worktrees.filter(tree => tree.path !== cwd && branchPie(tree.branch) !== null).slice(0, DIRTY_WORKTREES)
  const statuses = await Promise.all(counted.map(tree => git($, ['-C', tree.path, 'status', '--porcelain'])))
  counted.forEach((tree, i) => {
    const status = statuses[i]
    tree.dirty = status === null || status === undefined ? null : status.split('\n').filter(line => line.trim() !== '').length
  })
  return { commits: log === null ? [] : parseRefCommits(log), heads: refs === null ? [] : parseHeads(refs), worktrees }
}

/**
 * Reads every source: the ledger (always fresh), the default branch, commits
 * on any branch past it and past HEAD, branch tips and worktrees (uncommitted
 * files in those on a pie branch; this git snapshot is reused for 10 seconds),
 * PRs (a minute), `delivery.mode`, and the strip and end marks. Read-only; a
 * source that fails reads as empty.
 */
export async function readElsewhere(
  $: EngineInterface,
  opts: { branch?: string | null; base?: Elsewhere['base'] } = {},
): Promise<Elsewhere> {
  const [sid, cwd, now, rows] = await Promise.all([sessionId($), cwdOf($), nowOf($), readRows($).catch(() => [])])
  const [branch, base] = await Promise.all([
    opts.branch !== undefined ? Promise.resolve(opts.branch) : git($, ['rev-parse', '--abbrev-ref', 'HEAD']).then(out => out?.trim() ?? null),
    opts.base !== undefined ? Promise.resolve(opts.base) : readBase($).catch(() => null),
  ])
  const key = `${cwd}|${branch ?? ''}|${base?.base ?? ''}|${base?.shas[0] ?? ''}`
  const fresh = snapshot !== null && snapshot.key === key && now - snapshot.t < SNAPSHOT_MS
  const [gitPart, prs, mode, times] = await Promise.all([
    fresh || base === null ? Promise.resolve(base === null ? { commits: [], heads: [], worktrees: [] } : snapshot!) : readGit($, cwd, base),
    readPrs($, cwd, now),
    readMode($, cwd),
    readSessionTimes($),
  ])
  if (!fresh && base !== null) snapshot = { key, t: now, ...gitPart }
  return {
    self: { sid, branch, worktree: cwd },
    rows,
    now,
    base,
    commits: gitPart.commits,
    heads: gitPart.heads,
    worktrees: gitPart.worktrees,
    prs: prs?.open ?? null,
    merged: prs?.merged ?? [],
    mode,
    strip: times.strip,
    ended: times.ended,
    staleMs: CLAIM_STALE_MS,
  }
}

/** The ids of a pie's slices the checklist still shows open; null when the checklist or the pie cannot be read. Pure. */
export function openSlices(c: PassChecklist | null, pie: number): string[] | null {
  const found = c?.pies.find(x => x.n === pie)
  return found ? found.slices.filter(s => !s.done).map(s => s.id) : null
}

// ---- Which pie a run is on ---------------------------------------------------

/** The pie or slice a run's argument names: `23`, `pie 23`, `Pie 23`, `23.1`, `slice 23.1`. Pure. */
export function parseRunArg(arg: unknown): { pie: number; slice: string | null } | null {
  if (typeof arg !== 'string') return null
  const slice = /(?:^|\s|slice\s*)(\d+)\.(\d+)\b/i.exec(arg)
  if (slice) return { pie: Number(slice[1]), slice: `${slice[1]}.${slice[2]}` }
  const pie = /\bpie[-\s]*(\d+)\b/i.exec(arg) ?? /^\s*(\d+)\s*$/.exec(arg)
  return pie ? { pie: Number(pie[1]), slice: null } : null
}

/**
 * The pie and slice this run is on, not merely the first open one: the run's
 * argument, else the checked-out branch (`pie-N-sN.M-*` or `pie-N-*`), else
 * this session's latest claim still held, else its latest `slice.started`,
 * else the checklist's active pie. A slice left unnamed is the pie's first
 * open slice. Null when the checklist has no such pie. Pure.
 */
export function runTarget(
  c: PassChecklist | null,
  facts: { arg?: unknown; branch: string | null; rows: readonly LedgerRow[]; sid: string },
): { pie: number; slice: string | null } | null {
  const known = (pie: number) => c?.pies.find(x => x.n === pie) ?? null
  const firstOpen = (pie: number) => known(pie)?.slices.find(s => !s.done)?.id ?? null
  const fill = (pie: number, slice: string | null) => (known(pie) ? { pie, slice: slice ?? firstOpen(pie) } : null)
  const arg = parseRunArg(facts.arg)
  if (arg) {
    const hit = fill(arg.pie, arg.slice)
    if (hit) return hit
  }
  const bySlice = branchSlice(facts.branch)
  if (bySlice !== null) {
    const hit = fill(pieOfSlice(bySlice), bySlice)
    if (hit) return hit
  }
  const byPie = branchPie(facts.branch)
  if (byPie !== null) {
    const hit = fill(byPie, null)
    if (hit) return hit
  }
  const held = new Map<string, LedgerRow>()
  let started: LedgerRow | null = null
  for (const row of facts.rows) {
    if (row.sid !== facts.sid || typeof row.pie !== 'number') continue
    const key = `${row.pie}|${row.slice ?? ''}`
    if (row.ev === 'claim' && !isContested(row)) held.set(key, row)
    if (row.ev === 'release') {
      held.delete(key)
      if (row.slice === undefined) for (const k of [...held.keys()]) if (k.startsWith(`${row.pie}|`)) held.delete(k)
    }
    if (row.ev === 'slice.started') started = row
  }
  const latest = [...held.values()].sort((a, b) => b.t - a.t)[0] ?? started
  if (latest && typeof latest.pie === 'number') {
    const hit = fill(latest.pie, latest.slice ?? null)
    if (hit) return hit
  }
  const pie = activePie(c)
  return pie ? { pie: pie.n, slice: firstOpen(pie.n) } : null
}

/**
 * The slices a check of this session's run is about: just its slice when the
 * run claimed that slice and never the pie as a whole (a `/sell-slice` run),
 * else the pie's open slices. Pure.
 */
export function checkScope(
  c: PassChecklist | null,
  rows: readonly LedgerRow[],
  sid: string,
  target: { pie: number; slice: string | null },
): string[] | null {
  const own = rows.filter(row => row.sid === sid && row.ev === 'claim' && row.pie === target.pie)
  const sliceOnly = own.length > 0 && own.every(row => row.slice !== undefined)
  return sliceOnly && target.slice !== null ? [target.slice] : openSlices(c, target.pie)
}

// ---- Claims ----------------------------------------------------------------

/** Whether this session holds an open, uncontested claim for the pie (slice null) or the slice. Pure. */
export function holdsClaim(rows: readonly LedgerRow[], sid: string, pie: number, slice: string | null): boolean {
  let held = false
  for (const row of rows) {
    if (row.sid !== sid || row.pie !== pie) continue
    const same = slice === null ? row.slice === undefined : row.slice === slice
    if (row.ev === 'claim' && same && !isContested(row)) held = true
    if (row.ev === 'release' && (same || row.slice === undefined)) held = false
  }
  return held
}

/** Whether this session holds the slice and has work of its own on it (an edit, commit or verdict). Pure. */
export function holdsWork(rows: readonly LedgerRow[], sid: string, pie: number, slice: string | null): boolean {
  if (slice === null || !holdsClaim(rows, sid, pie, slice)) return false
  return rows.some(row => row.sid === sid && row.slice === slice && (row.ev === 'edit' || row.ev === 'commit' || row.ev === 'verdict'))
}

/**
 * Writes a claim row: the pie, the slice when given, this session's branch and
 * worktree, its goal and what it takes over. `contested` marks one written
 * while other work was on it: it states intent, and nobody counts it as a claim.
 */
export async function writeClaim(
  $: EngineInterface,
  claim: {
    pie: number
    slice?: string
    goal?: string
    skill?: string
    branch: string | null
    worktree: string
    over?: string[]
    auto?: boolean
    contested?: boolean
  },
): Promise<LedgerRow | null> {
  const goal = claim.goal === undefined ? undefined : Array.from(claim.goal.replace(/\s+/g, ' ').trim()).slice(0, GOAL_MAX).join('')
  return appendRow($, {
    ev: 'claim',
    pie: claim.pie,
    ...(claim.slice === undefined ? {} : { slice: claim.slice }),
    data: {
      ...(claim.branch ? { branch: claim.branch } : {}),
      worktree: claim.worktree,
      ...(goal ? { goal } : {}),
      ...(claim.skill ? { skill: claim.skill } : {}),
      ...(claim.over && claim.over.length > 0 ? { over: claim.over } : {}),
      ...(claim.auto ? { auto: true } : {}),
      ...(claim.contested ? { contested: true } : {}),
    },
  })
}

/** Writes a release row for the pie or one slice. */
export async function writeRelease(
  $: EngineInterface,
  release: { pie: number; slice?: string; reason: ReleaseReason; branch: string | null; worktree: string },
): Promise<LedgerRow | null> {
  return appendRow($, {
    ev: 'release',
    pie: release.pie,
    ...(release.slice === undefined ? {} : { slice: release.slice }),
    data: { reason: release.reason, ...(release.branch ? { branch: release.branch } : {}), worktree: release.worktree },
  })
}

/** What a takeover names: each conflicting session and its branch, so every source of that work is covered. Pure. */
export function overOf(found: Collisions): string[] {
  return [...new Set(found.conflicts.flatMap(party => [...party.sids, party.branch]).filter((x): x is string => x !== null))]
}

export const CLAIM_TOOL = 'bts_claim'
export const CLAIM_LISTED = 'mcp__bytheslice__bts_claim'

const CLAIM_DESCRIPTION = [
  'Claims a pie or a slice for this session in the shared Pass ledger, so every other chat, worktree and branch of the project sees who is on it,',
  'and reports any other session, branch or open PR already on it. Call it in a baker preflight after git fetch and before cutting a branch:',
  '{ pie, slice?, goal }. With conflicts it records only a contested claim (intent, not a claim) and lists them; raise a destructive_operation',
  'HITL with those facts and stop. After the operator says go ahead, call it again with over: true, which records the claim.',
  'Call { pie, slice?, release: done | deferred | abandoned } when you let go. It never refuses anything.',
].join(' ')

/** Registers bts_claim with its schema in the prompt's tool list; resolves the listed name. */
export async function registerClaim($: EngineInterface): Promise<string> {
  const registered = await $.tool.register({
    name: CLAIM_TOOL,
    description: CLAIM_DESCRIPTION,
    inputSchema: {
      type: 'object',
      properties: {
        pie: { type: 'integer', minimum: 0, description: 'The pie number; the slice pie, else the pie this run is on, when left out.' },
        slice: { type: 'string', description: 'The slice id, N.M. Leave out to claim the pie as a whole.' },
        goal: { type: 'string', description: `One line on what this session is about to do, up to ${GOAL_MAX} characters. Never a secret.` },
        release: { type: 'string', enum: [...RELEASE_REASONS], description: 'Let go of the claim instead: done, deferred or abandoned.' },
        over: { type: 'boolean', description: 'True once the operator approved going ahead despite the conflicts listed.' },
      },
      additionalProperties: false,
    },
    isDeferred: false,
  })
  return registered.tool
}

/** Serves bts_claim: a release, or a claim (contested while other work is on it) plus that work. */
export async function serveClaim($: EngineInterface, input: Record<string, unknown>, c: PassChecklist | null): Promise<string> {
  const rawSlice = typeof input.slice === 'string' ? input.slice.trim() : undefined
  if (rawSlice !== undefined && !SLICE_ID.test(rawSlice)) {
    return `bts_claim: "${Array.from(rawSlice).slice(0, 40).join('')}" is not a slice id; give it as N.M (for example 23.1), or leave slice out for the whole pie. Nothing was recorded.`
  }
  const slice = rawSlice
  const given = typeof input.pie === 'number' && Number.isSafeInteger(input.pie) && input.pie >= 0 ? input.pie : null
  const world = await readElsewhere($)
  const pie = given ?? (slice !== undefined ? pieOfSlice(slice) : runTarget(c, { branch: world.self.branch, rows: world.rows, sid: world.self.sid })?.pie ?? null)
  if (pie === null) return 'bts_claim: no pie named and no pie this run is on; call it with { pie: <n> }.'
  if (slice !== undefined && pieOfSlice(slice) !== pie) return `bts_claim: Slice ${slice} is not in Pie ${pie}.`
  const what = slice === undefined ? `Pie ${pie}` : `Slice ${slice}`
  const release = typeof input.release === 'string' && (RELEASE_REASONS as readonly string[]).includes(input.release) ? (input.release as ReleaseReason) : null
  if (release !== null) {
    const row = await writeRelease($, { pie, ...(slice === undefined ? {} : { slice }), reason: release, branch: world.self.branch, worktree: world.self.worktree })
    return row ? `released ${what} (${release})` : 'not recorded: the ledger could not be written'
  }
  const open = slice !== undefined ? [slice] : openSlices(c, pie)
  const found = collisionsFor(world, pie, open)
  const lines = collisionLines(found, world.now)
  const approved = input.over === true
  const over = approved ? overOf(found) : []
  const contested = lines.length > 0 && !approved
  const goal = typeof input.goal === 'string' ? input.goal : undefined
  const row = await writeClaim($, {
    pie,
    ...(slice === undefined ? {} : { slice }),
    ...(goal === undefined ? {} : { goal }),
    branch: world.self.branch,
    worktree: world.self.worktree,
    over,
    contested,
  })
  if (!row) return 'not recorded: the ledger could not be written. Check for other work by hand (git branch -a, gh pr list) before cutting a branch.'
  const at = world.self.branch ? ` on branch ${world.self.branch}` : ''
  const handoffs = found.handoffs.map(party => `  - ${handoffLine(party, world.now)}`)
  if (lines.length === 0) {
    const prs = world.prs === null ? ' (open PRs were not checked: gh is unavailable)' : ''
    return [`claimed ${what}${at}; no other session, branch or open PR is on it${prs}.`, ...handoffs].join('\n')
  }
  if (approved) return [`claimed ${what}${at}${over.length > 0 ? `, over ${over.join(', ')}` : ''} with the operator's approval:`, ...lines.map(l => `  - ${l}`), ...handoffs].join('\n')
  return [`not claimed: other work is on ${what} (recorded as a contested claim, which nobody counts as a claim):`, ...lines.map(l => `  - ${l}`), ...handoffs, GATE_STEP].join('\n')
}
