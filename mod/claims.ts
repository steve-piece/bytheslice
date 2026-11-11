// mod/claims.ts
// Session against session: who else is on a pie or a slice. Claim and release rows in the shared ledger, plus three read-only sources (other sessions' ledger rows, every local and remote branch and worktree, open PRs through gh), folded into one list of other work for bts_status, bts_claim and a baker skill's start. It informs and never refuses.

import type { EngineInterface } from 'claude-code'

import { headsMatch } from './checks.ts'
import { git, readBase, slicesNamed } from './drift.ts'
import { stripJsonc } from './jsonc.ts'
import { appendRow, primaryRoot, readRows, sessionId } from './ledger.ts'
import type { LedgerRow } from './ledger.ts'
import { branchPie } from './projection.ts'
import { STRIP_MAX_AGE_MS, STRIP_PREFIX, projectKey } from './strip.ts'
import type { PassChecklist } from './types'

/** A claim, or another session's work, with no activity for longer than this is reported as stale. */
export const CLAIM_STALE_MS = 6 * 60 * 60 * 1000
/** Why a session lets go of a claim. `done` keeps its work visible until it reaches the default branch. */
export const RELEASE_REASONS = ['done', 'deferred', 'abandoned'] as const
export type ReleaseReason = (typeof RELEASE_REASONS)[number]
/** A claim's goal is cut to this many characters. */
export const GOAL_MAX = 200
/** How long one `gh pr list` answer is reused. */
export const PR_CACHE_MS = 60000
/** Commits read past the default branch, across every branch. */
export const OFF_BASE_DEPTH = 2000
/** Other worktrees whose uncommitted files are counted. */
export const DIRTY_WORKTREES = 8

/** A commit on some branch that is neither on the default branch nor reachable from HEAD. */
export type RefCommit = { sha: string; branch: string; t: number; subject: string }
/** A branch tip, local or remote, by its short name. */
export type RefHead = { branch: string; sha: string; t: number }
/** A worktree of the repository: its path, its branch, and its uncommitted files when counted. */
export type WorktreeEntry = { path: string; branch: string | null; dirty: number | null }
/** An open pull request as `gh pr list` names it. */
export type OpenPr = { number: number; title: string; head: string; url: string; t: number }

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
  /** `delivery.mode` from bytheslice.config.json, or null. */
  mode: string | null
  /** When each session of the project last wrote its roadmap strip entry (a live session keeps one). */
  strip: Readonly<Record<string, number>>
  staleMs: number
}

/** How a session behind other work stands: running now, gone quiet past the threshold, or ended. */
export type Liveness = 'live' | 'stale' | 'ended'

/** One other piece of work on the pie: a session, a branch, a PR, or all three folded together. */
export type Party = {
  key: string
  sid: string | null
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
const PIE_TITLE = /\bpie\s+(\d+)\b/i
const SLICE_TITLE = /\bslice\s+(\d+)\.(\d+)\b/i
const SLICE_ID = /^\d+\.\d+$/

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

/** The branches this session's own rows name, plus the one checked out: its own work, never a conflict. Pure. */
export function ownBranches(world: Pick<Elsewhere, 'self' | 'rows' | 'base'>): Set<string> {
  const own = new Set<string>()
  if (world.self.branch && world.self.branch !== 'HEAD') own.add(shortBranch(world.self.branch))
  for (const row of world.rows) {
    if (row.sid !== world.self.sid) continue
    const branch = rowBranch(row)
    if (branch !== null) own.add(branch)
  }
  if (world.base) own.delete(shortBranch(world.base.base))
  return own
}

/** How a session stands: `ended` with no live strip entry, else `live` or `stale` by its last activity. Pure. */
export function livenessOf(sid: string, lastT: number | null, world: Pick<Elsewhere, 'strip' | 'now' | 'staleMs'>): Liveness {
  const strip = world.strip[sid]
  if (strip === undefined || world.now - strip > STRIP_MAX_AGE_MS) return 'ended'
  if (lastT === null || world.now - lastT > world.staleMs) return 'stale'
  return 'live'
}

type SidWork = {
  sid: string
  slices: Map<string, { lastWork: number; lastDrop: number; shas: string[] }>
  pieWork: number
  pieDrop: number
  pieClaim: boolean
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
 * already on the default branch, released as deferred or abandoned, or taken
 * over by a later claim does not count. Work on this session's own branch by a
 * session no longer live is a handoff, not a conflict. `open` limits slices to
 * those the checklist still shows open. Pure.
 */
export function collisionsFor(world: Elsewhere, pie: number, open: readonly string[]): Collisions {
  const openSet = new Set(open)
  const named = world.base ? slicesNamed(world.base.subjects) : new Set<string>()
  const onBase = (sha: string): boolean => world.base?.shas.some(merged => headsMatch(merged, sha)) ?? false
  const own = ownBranches(world)
  const inPie = (row: LedgerRow): boolean =>
    row.pie === pie || (typeof row.slice === 'string' && SLICE_ID.test(row.slice) && pieOfSlice(row.slice) === pie)

  // Last activity per session across the whole ledger, and the takeovers later claims recorded.
  const lastBySid = new Map<string, number>()
  const takeovers: { t: number; slice: string | null; over: Set<string> }[] = []
  for (const row of world.rows) {
    lastBySid.set(row.sid, Math.max(lastBySid.get(row.sid) ?? row.t, row.t))
    if (row.ev === 'claim' && inPie(row) && Array.isArray(row.data?.over)) {
      takeovers.push({ t: row.t, slice: row.slice ?? null, over: new Set(row.data.over.filter((x): x is string => typeof x === 'string')) })
    }
  }

  const bySid = new Map<string, SidWork>()
  for (const row of world.rows) {
    if (row.sid === world.self.sid || !inPie(row)) continue
    let work = bySid.get(row.sid)
    if (!work) {
      work = { sid: row.sid, slices: new Map(), pieWork: Number.NEGATIVE_INFINITY, pieDrop: Number.NEGATIVE_INFINITY, pieClaim: false, branch: null, branchT: Number.NEGATIVE_INFINITY, worktree: null, goal: null, goalT: Number.NEGATIVE_INFINITY, done: new Set() }
      bySid.set(row.sid, work)
    }
    const branch = rowBranch(row)
    if (branch !== null && row.t >= work.branchT) {
      work.branch = branch
      work.branchT = row.t
    }
    if (row.ev === 'claim') {
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
        if (row.ev === 'claim' || row.ev === 'pie.started') work.pieClaim = true
      }
      continue
    }
    const slice = work.slices.get(row.slice) ?? { lastWork: Number.NEGATIVE_INFINITY, lastDrop: Number.NEGATIVE_INFINITY, shas: [] }
    if (dropping) slice.lastDrop = Math.max(slice.lastDrop, row.t)
    else if (row.ev !== 'release') slice.lastWork = Math.max(slice.lastWork, row.t)
    if (row.ev === 'commit' && typeof row.data?.sha === 'string') slice.shas.push(row.data.sha)
    if (row.ev === 'slice.done') work.done.add(row.slice)
    work.slices.set(row.slice, slice)
  }

  const takenOver = (sid: string, branch: string | null, slice: string | null, since: number): boolean =>
    takeovers.some(
      x => x.t > since && (x.slice === null || x.slice === slice) && (x.over.has(sid) || (branch !== null && x.over.has(branch))),
    )
  // A takeover covers a branch it names, and every branch the sessions it names recorded, on every source. A slice
  // takeover covers that slice only; whole-pie evidence (a pie claim, a pie PR) needs a pie takeover.
  const sidBranches = new Map<string, Set<string>>()
  for (const row of world.rows) {
    const branch = rowBranch(row)
    if (branch === null || !inPie(row)) continue
    sidBranches.set(row.sid, (sidBranches.get(row.sid) ?? new Set()).add(branch))
  }
  const branchTaken = (branch: string, slice: string | null, since: number): boolean =>
    takeovers.some(
      x =>
        x.t > since &&
        (x.slice === null || x.slice === slice) &&
        (x.over.has(branch) || [...x.over].some(name => sidBranches.get(name)?.has(branch) ?? false)),
    )
  // Whole-pie evidence on a branch is covered by a pie takeover, or by a takeover of every slice this check is about.
  const wholeTaken = (branch: string, since: number): boolean =>
    branchTaken(branch, null, since) || (openSet.size > 0 && [...openSet].every(id => branchTaken(branch, id, since)))
  // Evidence on a slice branch belongs to that slice: a check of other slices never counts it.
  const wanted = (id: string): boolean => pieOfSlice(id) === pie && (openSet.size === 0 || openSet.has(id))

  const parties = new Map<string, Party>()
  const partyFor = (branch: string | null, sid: string | null): Party => {
    const key = branch ?? `session:${sid ?? 'unknown'}`
    let party = parties.get(key)
    if (!party) {
      party = { key, sid, branch, worktree: null, dirty: null, pie, slices: [], done: [], pieLevel: false, commits: 0, claimed: false, goal: null, lastT: null, liveness: null, pr: null, pieBranch: isPieBranch(branch) }
      parties.set(key, party)
    }
    if (party.sid === null && sid !== null) party.sid = sid
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
      if (named.has(id) || slice.shas.some(onBase)) continue
      if (openSet.size > 0 && !openSet.has(id)) continue
      if (takenOver(work.sid, work.branch, id, slice.lastWork)) continue
      live.push(id)
    }
    // A pie-level claim alone matters while its session lives: an ended one with no open slice left nothing behind.
    const ended = livenessOf(work.sid, lastBySid.get(work.sid) ?? null, world) === 'ended'
    const pieOpen =
      work.pieClaim &&
      work.pieWork > work.pieDrop &&
      openSet.size > 0 &&
      !(ended && live.length === 0) &&
      !takenOver(work.sid, work.branch, null, work.pieWork) &&
      ![...openSet].every(id => takenOver(work.sid, work.branch, id, work.pieWork))
    if (live.length === 0 && !pieOpen) continue
    const party = partyFor(work.branch, work.sid)
    party.slices = sortSlices([...party.slices, ...live])
    party.done = sortSlices([...party.done, ...[...work.done].filter(id => live.includes(id))])
    party.pieLevel ||= pieOpen
    party.claimed ||= world.rows.some(row => row.sid === work.sid && row.ev === 'claim' && inPie(row))
    party.worktree ??= work.worktree
    party.goal ??= work.goal
    touch(party, lastBySid.get(work.sid) ?? null)
  }

  // Source 2: branches with commits past the default branch that name this pie's slices or carry its name.
  for (const commit of world.commits) {
    const branch = shortBranch(commit.branch)
    if (own.has(branch)) continue
    // A subject naming this pie's slices is evidence for those slices only; one naming none counts for its slice
    // branch's slice, or for the whole pie on a whole-pie branch.
    const subjectSlices = [...slicesNamed([commit.subject])].filter(id => pieOfSlice(id) === pie)
    const bySlice = branchSlice(branch)
    const ids = (subjectSlices.length > 0 ? subjectSlices : bySlice !== null && pieOfSlice(bySlice) === pie ? [bySlice] : [])
      .filter(wanted)
      .filter(id => !branchTaken(branch, id, commit.t))
    const wholePie = subjectSlices.length === 0 && bySlice === null && branchPie(branch) === pie && !wholeTaken(branch, commit.t)
    if (ids.length === 0 && !wholePie) continue
    const party = partyFor(branch, null)
    party.slices = sortSlices([...party.slices, ...ids])
    party.commits += 1
    party.pieLevel ||= wholePie
    touch(party, commit.t)
  }
  // A pie branch with nothing past the default branch counts only when another worktree has it checked out.
  for (const tree of world.worktrees) {
    if (tree.path === world.self.worktree || tree.branch === null) continue
    const branch = shortBranch(tree.branch)
    if (own.has(branch) || branchPie(branch) !== pie) continue
    const tip = world.heads.find(head => head.branch === branch)?.t ?? null
    const bySlice = branchSlice(branch)
    if (bySlice !== null ? !wanted(bySlice) || branchTaken(branch, bySlice, tip ?? 0) : wholeTaken(branch, tip ?? 0)) continue
    const party = partyFor(branch, null)
    if (bySlice !== null) party.slices = sortSlices([...party.slices, bySlice])
    else party.pieLevel ||= party.slices.length === 0
    if (party.lastT === null) touch(party, tip)
  }

  // Source 3: open PRs for this pie or its slices.
  for (const pr of world.prs ?? []) {
    const head = shortBranch(pr.head)
    if (own.has(head)) continue
    const title = SLICE_TITLE.exec(pr.title)
    const prSlice = title ? `${title[1]}.${title[2]}` : branchSlice(head)
    const titlePie = PIE_TITLE.exec(pr.title)
    // A PR updates after a takeover (reviews, CI), so any takeover of its branch covers it.
    if (prSlice !== null ? branchTaken(head, prSlice, Number.NEGATIVE_INFINITY) : wholeTaken(head, Number.NEGATIVE_INFINITY)) continue
    let slice: string | null = null
    if (parties.has(head)) slice = prSlice !== null && wanted(prSlice) ? prSlice : null
    else if (prSlice !== null) {
      if (!wanted(prSlice)) continue
      slice = prSlice
    } else if (branchPie(head) !== pie && !(titlePie !== null && Number(titlePie[1]) === pie)) continue
    const party = partyFor(head, null)
    party.pr = { number: pr.number, url: pr.url }
    if (slice !== null) party.slices = sortSlices([...party.slices, slice])
    else if (party.slices.length === 0) party.pieLevel = true
    touch(party, pr.t)
  }

  // Worktrees and liveness, then the split into conflicts and handoffs.
  const conflicts: Party[] = []
  const handoffs: Party[] = []
  for (const party of parties.values()) {
    const tree = party.branch === null ? undefined : world.worktrees.find(x => x.branch !== null && shortBranch(x.branch) === party.branch && x.path !== world.self.worktree)
    if (tree) {
      party.worktree = tree.path
      party.dirty = tree.dirty
    }
    if (party.sid !== null) party.liveness = livenessOf(party.sid, party.lastT, world)
    // This session's own branch or worktree, or an ended session's rows with no branch, commit or PR to point at
    // (rows from before claims, or this chat before a /clear gave it a new id): history to continue, not a conflict.
    // A claim's worktree is where it was made, maybe a primary checkout it left: it counts only with no branch,
    // commit or PR elsewhere to point at.
    const onOwn = party.branch !== null && own.has(party.branch)
    const unlocated = party.branch === null && party.commits === 0 && party.pr === null
    const sameTree = unlocated && party.worktree !== null && party.worktree === world.self.worktree
    const nowhere = unlocated && party.liveness === 'ended'
    if ((onOwn || sameTree || nowhere) && party.liveness !== 'live') handoffs.push(party)
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
  else if (party.sid !== null && party.liveness === 'stale') who = `${many ? 'were' : 'was'} ${party.claimed ? 'claimed' : 'started'} by another session (${sidWord(party.sid)})`
  else if (party.sid !== null) who = `${many ? 'were' : 'was'} worked on by a session that has ended (${sidWord(party.sid)})`
  else if (party.commits > 0) who = `already ${many ? 'have' : 'has'} commits`
  else if (party.pr !== null) who = `already ${many ? 'have' : 'has'} an open PR`
  else who = `${be} checked out elsewhere`
  const where: string[] = []
  if (party.branch !== null) where.push(`on branch ${party.branch}`)
  if (party.worktree !== null) where.push(`in worktree ${party.worktree}`)
  const facts: string[] = []
  if (party.liveness === 'stale') facts.push('stale')
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
  const state = party.liveness === 'ended' ? 'ended' : `stale, last activity ${ageWords(now - (party.lastT ?? now))}`
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

let prCache: { cwd: string; t: number; prs: OpenPr[] | null } | null = null

/** Forgets the cached PR list (a new session, or a test). */
export function resetClaims(): void {
  prCache = null
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

/** Parses `gh pr list --json number,title,headRefName,url,updatedAt` output; anything else reads as none. Pure. */
export function parsePrs(text: string): OpenPr[] | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return null
  }
  if (!Array.isArray(parsed)) return null
  const out: OpenPr[] = []
  for (const item of parsed) {
    if (item === null || typeof item !== 'object') continue
    const v = item as Record<string, unknown>
    if (typeof v.number !== 'number' || typeof v.headRefName !== 'string') continue
    const t = typeof v.updatedAt === 'string' ? Date.parse(v.updatedAt) : Number.NaN
    out.push({
      number: v.number,
      title: typeof v.title === 'string' ? v.title : '',
      head: v.headRefName,
      url: typeof v.url === 'string' ? v.url : '',
      t: Number.isFinite(t) ? t : 0,
    })
  }
  return out
}

/** Open PRs through gh, cached for a minute; null when gh is missing, signed out or slow. Never throws. */
export async function readPrs($: EngineInterface, cwd: string, now: number): Promise<OpenPr[] | null> {
  if (prCache && prCache.cwd === cwd && now - prCache.t < PR_CACHE_MS) return prCache.prs
  let prs: OpenPr[] | null = null
  try {
    const run = await $.process.run(
      ['gh', 'pr', 'list', '--state', 'open', '--limit', '100', '--json', 'number,title,headRefName,url,updatedAt'],
      { cwd, timeoutMs: 10000 },
    )
    prs = run.exitCode === 0 ? parsePrs(run.stdout) : null
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

async function readStripTimes($: EngineInterface): Promise<Record<string, number>> {
  const out: Record<string, number> = {}
  try {
    const prefix = `${STRIP_PREFIX}${await projectKey($)}:`
    for (const key of await $.store.keys()) {
      if (!key.startsWith(prefix)) continue
      const value = (await $.store.get(key)) as { t?: unknown } | undefined
      if (value && typeof value.t === 'number') out[key.slice(prefix.length)] = value.t
    }
  } catch {
    // No store: every other session reads as ended, and its work still shows.
  }
  return out
}

/**
 * Reads every source once: the ledger, the default branch, commits on any
 * branch past it and past HEAD, branch tips, worktrees (uncommitted files in
 * those on a pie branch), open PRs, `delivery.mode` and the strip. Read-only;
 * a source that fails reads as empty.
 */
export async function readElsewhere(
  $: EngineInterface,
  opts: { branch?: string | null; base?: Elsewhere['base'] } = {},
): Promise<Elsewhere> {
  const [sid, cwd, now, rows] = await Promise.all([sessionId($), cwdOf($), nowOf($), readRows($).catch(() => [])])
  const branch = opts.branch !== undefined ? opts.branch : (await git($, ['rev-parse', '--abbrev-ref', 'HEAD']))?.trim() ?? null
  const base = opts.base !== undefined ? opts.base : await readBase($).catch(() => null)
  let commits: RefCommit[] = []
  let heads: RefHead[] = []
  let worktrees: WorktreeEntry[] = []
  if (base !== null) {
    const log = await git(
      $,
      ['log', '--branches', '--remotes', '--source', `-n${OFF_BASE_DEPTH}`, '--format=%H%x09%S%x09%ct%x09%s', '--not', base.base, 'HEAD'],
      8000,
    )
    commits = log === null ? [] : parseRefCommits(log)
    const refs = await git($, ['for-each-ref', '--format=%(refname)%09%(objectname)%09%(committerdate:unix)', 'refs/heads', 'refs/remotes'])
    heads = refs === null ? [] : parseHeads(refs)
  }
  const list = await git($, ['worktree', 'list', '--porcelain'])
  worktrees = list === null ? [] : parseWorktrees(list)
  let counted = 0
  for (const tree of worktrees) {
    if (tree.path === cwd || branchPie(tree.branch) === null || counted >= DIRTY_WORKTREES) continue
    counted += 1
    const status = await git($, ['-C', tree.path, 'status', '--porcelain'])
    tree.dirty = status === null ? null : status.split('\n').filter(line => line.trim() !== '').length
  }
  const [prs, mode, strip] = await Promise.all([readPrs($, cwd, now), readMode($, cwd), readStripTimes($)])
  return { self: { sid, branch, worktree: cwd }, rows, now, base, commits, heads, worktrees, prs, mode, strip, staleMs: CLAIM_STALE_MS }
}

/** The ids of a pie's slices the checklist still shows open. Pure. */
export function openSlices(c: PassChecklist | null, pie: number): string[] {
  return c?.pies.find(x => x.n === pie)?.slices.filter(s => !s.done).map(s => s.id) ?? []
}

// ---- Claims ----------------------------------------------------------------

/** Whether this session already holds an open claim for the pie (slice null) or the slice. Pure. */
export function holdsClaim(rows: readonly LedgerRow[], sid: string, pie: number, slice: string | null): boolean {
  let held = false
  for (const row of rows) {
    if (row.sid !== sid || row.pie !== pie) continue
    const same = slice === null ? row.slice === undefined : row.slice === slice
    if (row.ev === 'claim' && same) held = true
    if (row.ev === 'release' && (same || row.slice === undefined)) held = false
  }
  return held
}

/** Writes a claim row: the pie, the slice when given, this session's branch and worktree, its goal and what it takes over. */
export async function writeClaim(
  $: EngineInterface,
  claim: { pie: number; slice?: string; goal?: string; skill?: string; branch: string | null; worktree: string; over?: string[]; auto?: boolean },
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
  return [...new Set(found.conflicts.flatMap(party => [party.sid, party.branch]).filter((x): x is string => x !== null))]
}

export const CLAIM_TOOL = 'bts_claim'
export const CLAIM_LISTED = 'mcp__bytheslice__bts_claim'

const CLAIM_DESCRIPTION = [
  'Claims a pie or a slice for this session in the shared Pass ledger, so every other chat, worktree and branch of the project sees who is on it,',
  'and reports any other session, branch or open PR already on it. Call it in a baker preflight after git fetch and before cutting a branch:',
  '{ pie, slice?, goal }. With conflicts it still records the claim and lists them; raise a destructive_operation HITL with those facts and stop.',
  'After the operator says go ahead, call it again with over: true. Call { pie, slice?, release: done | deferred | abandoned } when you let go.',
  'It never refuses anything.',
].join(' ')

/** Registers bts_claim with its schema in the prompt's tool list; resolves the listed name. */
export async function registerClaim($: EngineInterface): Promise<string> {
  const registered = await $.tool.register({
    name: CLAIM_TOOL,
    description: CLAIM_DESCRIPTION,
    inputSchema: {
      type: 'object',
      properties: {
        pie: { type: 'integer', minimum: 0, description: 'The pie number; the slice pie, else the active pie, when left out.' },
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

/** Serves bts_claim: a release, or a claim plus the conflicts on what it claims. */
export async function serveClaim($: EngineInterface, input: Record<string, unknown>, c: PassChecklist | null, activePie: number | null): Promise<string> {
  const slice = typeof input.slice === 'string' && SLICE_ID.test(input.slice.trim()) ? input.slice.trim() : undefined
  const given = typeof input.pie === 'number' && Number.isSafeInteger(input.pie) && input.pie >= 0 ? input.pie : null
  const pie = given ?? (slice !== undefined ? pieOfSlice(slice) : activePie)
  if (pie === null) return 'bts_claim: no pie named and no active pie in the checklist; call it with { pie: <n> }.'
  if (slice !== undefined && pieOfSlice(slice) !== pie) return `bts_claim: Slice ${slice} is not in Pie ${pie}.`
  const world = await readElsewhere($)
  const what = slice === undefined ? `Pie ${pie}` : `Slice ${slice}`
  const release = typeof input.release === 'string' && (RELEASE_REASONS as readonly string[]).includes(input.release) ? (input.release as ReleaseReason) : null
  if (release !== null) {
    const row = await writeRelease($, { pie, ...(slice === undefined ? {} : { slice }), reason: release, branch: world.self.branch, worktree: world.self.worktree })
    return row ? `released ${what} (${release})` : 'not recorded: the ledger could not be written'
  }
  const open = slice !== undefined ? [slice] : openSlices(c, pie)
  const found = collisionsFor(world, pie, open)
  const approved = input.over === true
  const over = approved ? overOf(found) : []
  const goal = typeof input.goal === 'string' ? input.goal : undefined
  const row = await writeClaim($, {
    pie,
    ...(slice === undefined ? {} : { slice }),
    ...(goal === undefined ? {} : { goal }),
    branch: world.self.branch,
    worktree: world.self.worktree,
    over,
  })
  if (!row) return 'not recorded: the ledger could not be written. Check for other work by hand (git branch -a, gh pr list) before cutting a branch.'
  const lines = collisionLines(found, world.now)
  const head = `claimed ${what}${world.self.branch ? ` on branch ${world.self.branch}` : ''}`
  const handoffs = found.handoffs.map(party => `  - ${handoffLine(party, world.now)}`)
  if (lines.length === 0) {
    const prs = world.prs === null ? ' (open PRs were not checked: gh is unavailable)' : ''
    return [`${head}; no other session, branch or open PR is on it${prs}.`, ...handoffs].join('\n')
  }
  if (approved) return [`${head}${over.length > 0 ? `, over ${over.join(', ')}` : ''} with the operator's approval:`, ...lines.map(l => `  - ${l}`), ...handoffs].join('\n')
  return [`${head}, but other work is on it:`, ...lines.map(l => `  - ${l}`), ...handoffs, GATE_STEP].join('\n')
}
