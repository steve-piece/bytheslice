// mod/claims.test.ts
// Unit tests for the collision fold and its parsers: other sessions' rows and claims, branches past the default branch, worktrees, open PRs, releases, takeovers, handoffs on this session's own branch, stale and ended wording, and the delivery-mode flag.

import { expect, test } from 'claude-code/testing'

import {
  CLAIM_STALE_MS,
  ageWords,
  collisionLines,
  collisionsFor,
  conflictLine,
  handoffLine,
  holdsClaim,
  isPieBranch,
  overOf,
  parseHeads,
  parsePrs,
  parseRefCommits,
  parseWorktrees,
  shortBranch,
} from './claims.ts'
import type { Elsewhere } from './claims.ts'
import type { LedgerRow } from './types'

const NOW = 1760000000000
const HOUR = 60 * 60 * 1000

const row = (sid: string, t: number, ev: LedgerRow['ev'], slice: string | null, data?: Record<string, unknown>): LedgerRow => ({
  v: 1,
  t,
  sid,
  ev,
  pie: slice === null ? 7 : Number(slice.split('.')[0]),
  ...(slice === null ? {} : { slice }),
  ...(data ? { data } : {}),
})

function world(over: Partial<Elsewhere> = {}): Elsewhere {
  return {
    self: { sid: 'me', branch: 'pie-7-s7.1-first', worktree: '/repo' },
    rows: [],
    now: NOW,
    base: { base: 'origin/main', shas: ['mmmmmmm000'], subjects: ['feat(pie-6): 6.1 old work'] },
    commits: [],
    heads: [],
    worktrees: [],
    prs: [],
    mode: null,
    strip: {},
    staleMs: CLAIM_STALE_MS,
    ...over,
  }
}

const OPEN = ['7.1', '7.2', '7.3']

test('the parsers read git, worktree and gh output and skip what they cannot read', () => {
  expect(shortBranch('refs/remotes/origin/pie-7-x')).toBe('pie-7-x')
  expect(shortBranch('refs/heads/pie-7-x')).toBe('pie-7-x')
  expect(shortBranch('origin/pie-7-x')).toBe('pie-7-x')
  expect(isPieBranch('pie-7-video')).toBe(true)
  expect(isPieBranch('pie-7-s7.1-video')).toBe(false)
  expect(isPieBranch('main')).toBe(false)
  expect(parseRefCommits('abcdef1\trefs/remotes/origin/pie-7-x\t100\tfeat(pie-7): 7.1 a\tb\nnot a line\n')).toEqual([
    { sha: 'abcdef1', branch: 'pie-7-x', t: 100000, subject: 'feat(pie-7): 7.1 a\tb' },
  ])
  expect(parseHeads('refs/remotes/origin/HEAD\tx\t1\nrefs/heads/pie-7-x\tabc\t2\n')).toEqual([{ branch: 'pie-7-x', sha: 'abc', t: 2000 }])
  expect(parseWorktrees('worktree /repo\nHEAD 1\nbranch refs/heads/main\n\nworktree /wt/a\nHEAD 2\ndetached\n')).toEqual([
    { path: '/repo', branch: 'main', dirty: null },
    { path: '/wt/a', branch: null, dirty: null },
  ])
  expect(parsePrs('not json')).toBeNull()
  expect(parsePrs('[{"number":4,"title":"Pie 7","headRefName":"pie-7-x","url":"u","updatedAt":"2026-01-01T00:00:00Z"},{"title":"no number"}]')).toEqual([
    { number: 4, title: 'Pie 7', head: 'pie-7-x', url: 'u', t: Date.parse('2026-01-01T00:00:00Z') },
  ])
})

test('a clean pie has no conflicts, no handoffs and no delivery flag', () => {
  expect(collisionsFor(world(), 7, OPEN)).toEqual({ pie: 7, conflicts: [], handoffs: [], delivery: null })
})

test('a live claim by another session conflicts, with its branch, worktree and goal', () => {
  const rows = [row('other', NOW - HOUR, 'claim', '7.2', { branch: 'pie-7-s7.2-second', worktree: '/wt/b', goal: 'second part' })]
  const found = collisionsFor(world({ rows, strip: { other: NOW } }), 7, OPEN)
  expect(found.conflicts.map(p => [p.key, p.slices, p.liveness, p.claimed, p.goal])).toEqual([['pie-7-s7.2-second', ['7.2'], 'live', true, 'second part']])
  expect(conflictLine(found.conflicts[0]!, NOW)).toBe(
    'Slice 7.2 is also being built by another session (other) on branch pie-7-s7.2-second in worktree /wt/b (last activity 1 h ago, goal: second part)',
  )
})

test('a claim gone quiet past the threshold is reported stale, never dropped and never honored as live', () => {
  const rows = [row('other', NOW - 3 * 24 * HOUR, 'claim', null, { branch: 'pie-7-x' })]
  const found = collisionsFor(world({ rows, strip: { other: NOW - 60000 } }), 7, OPEN)
  expect(found.conflicts).toHaveLength(1)
  expect(collisionLines(found, NOW)).toEqual(['Pie 7 was claimed by another session (other) on branch pie-7-x (stale, last activity 3 d ago)'])
})

test('a release as deferred or abandoned drops the work; a release as done keeps it until it merges', () => {
  const work = [row('other', NOW - HOUR, 'commit', '7.1', { sha: 'aaaaaaa1', branch: 'pie-7-s7.1-a' })]
  const dropped = collisionsFor(world({ rows: [...work, row('other', NOW - 1000, 'release', '7.1', { reason: 'abandoned' })] }), 7, OPEN)
  expect(dropped.conflicts).toEqual([])
  const kept = collisionsFor(world({ rows: [...work, row('other', NOW - 1000, 'release', '7.1', { reason: 'done' })] }), 7, OPEN)
  expect(kept.conflicts.map(p => p.slices)).toEqual([['7.1']])
})

test('work already on the default branch, or a slice the checklist marks done, does not conflict', () => {
  const rows = [row('other', NOW - HOUR, 'commit', '7.1', { sha: 'mmmmmmm000', branch: 'pie-7-x' }), row('other', NOW - HOUR, 'slice.started', '7.3')]
  const base = { base: 'origin/main', shas: ['mmmmmmm000'], subjects: ['feat(pie-7): 7.1 merged'] }
  expect(collisionsFor(world({ rows, base }), 7, ['7.1', '7.2']).conflicts).toEqual([])
})

test('a later claim with over naming the session takes its work over for everyone', () => {
  const rows = [
    row('other', NOW - 2 * HOUR, 'slice.started', '7.1', { branch: 'pie-7-x' }),
    row('third', NOW - HOUR, 'claim', '7.1', { branch: 'pie-7-s7.1-new', over: ['other'] }),
  ]
  const found = collisionsFor(world({ rows, strip: { third: NOW } }), 7, OPEN)
  expect(found.conflicts.map(p => p.sid)).toEqual(['third'])
  expect(overOf(found)).toEqual(['third'])
})

test('branches past the default branch conflict by the slices their subjects name; this session own branches never do', () => {
  const commits = [
    { sha: 'b1', branch: 'pie-7-big', t: NOW - HOUR, subject: 'feat(pie-7): 7.1 task 1 a' },
    { sha: 'b2', branch: 'pie-7-big', t: NOW - 2 * HOUR, subject: 'feat(pie-7): 7.2 b' },
    { sha: 'b3', branch: 'pie-7-s7.1-first', t: NOW, subject: 'feat(pie-7): 7.1 mine' },
    { sha: 'b4', branch: 'unrelated', t: NOW, subject: 'feat(pie-8): 8.1 other pie' },
  ]
  const found = collisionsFor(world({ commits }), 7, OPEN)
  expect(found.conflicts.map(p => [p.branch, p.slices, p.commits, p.sid])).toEqual([['pie-7-big', ['7.1', '7.2'], 2, null]])
  expect(conflictLine(found.conflicts[0]!, NOW)).toBe('Slices 7.1, 7.2 already have commits on branch pie-7-big (2 commits not on the default branch, last activity 1 h ago)')
})

test('a pie branch checked out in another worktree conflicts even with no commits yet, with its uncommitted files', () => {
  const worktrees = [
    { path: '/repo', branch: 'pie-7-s7.1-first', dirty: null },
    { path: '/wt/other', branch: 'pie-7-s7.2-next', dirty: 3 },
  ]
  const found = collisionsFor(world({ worktrees }), 7, OPEN)
  expect(collisionLines(found, NOW)).toEqual(['Pie 7 is checked out elsewhere on branch pie-7-s7.2-next in worktree /wt/other (3 uncommitted files)'])
})

test('an open PR for the pie or one of its slices conflicts; one for another pie does not', () => {
  const prs = [
    { number: 12, title: 'Slice 7.3: third', head: 'feature/x', url: 'u12', t: NOW - HOUR },
    { number: 13, title: 'Pie 8: next', head: 'pie-8-next', url: 'u13', t: NOW },
  ]
  const found = collisionsFor(world({ prs }), 7, OPEN)
  expect(collisionLines(found, NOW)).toEqual(['Slice 7.3 already has an open PR on branch feature/x (last activity 1 h ago, PR 12 open)'])
})

test('another session on this session own branch is a handoff once it is no longer live, a conflict while it is', () => {
  const rows = [row('earlier', NOW - 10 * HOUR, 'commit', '7.1', { sha: 'ccccccc1', branch: 'pie-7-s7.1-first' })]
  const ended = collisionsFor(world({ rows }), 7, OPEN)
  expect(ended.conflicts).toEqual([])
  expect(ended.handoffs.map(p => handoffLine(p, NOW))).toEqual(['Slice 7.1: continuing on branch pie-7-s7.1-first from session earlier (ended)'])
  const live = collisionsFor(world({ rows: [{ ...rows[0]!, t: NOW - 60000 }], strip: { earlier: NOW } }), 7, OPEN)
  expect(live.conflicts.map(p => p.sid)).toEqual(['earlier'])
})

test('an ended session with no branch, commit or PR on record is history to continue; a live one still conflicts', () => {
  const rows = [row('before-clear', NOW - 2 * HOUR, 'slice.started', '7.1'), row('before-clear', NOW - HOUR, 'verdict', '7.1', { gate: 'slice-verifier' })]
  const ended = collisionsFor(world({ rows }), 7, OPEN)
  expect(ended.conflicts).toEqual([])
  expect(ended.handoffs.map(p => handoffLine(p, NOW))).toEqual(['Slice 7.1: continuing from session before-clear (ended)'])
  expect(collisionsFor(world({ rows, strip: { 'before-clear': NOW } }), 7, OPEN).conflicts.map(p => p.liveness)).toEqual(['live'])
})

test('an ended session whose only claim was the pie leaves nothing behind', () => {
  const rows = [row('gone', NOW - 30 * HOUR, 'pie.started', null)]
  expect(collisionsFor(world({ rows }), 7, OPEN).conflicts).toEqual([])
})

test('merge-per-slice flags a run on one pie branch, its own or another', () => {
  const mine = collisionsFor(world({ mode: 'merge-per-slice', self: { sid: 'me', branch: 'pie-7-everything', worktree: '/repo' } }), 7, OPEN)
  expect(mine.delivery).toBe('delivery.mode is merge-per-slice (one branch and PR per slice), but this session is on one pie branch, pie-7-everything, for Pie 7')
  expect(collisionsFor(world({ mode: 'pie-pr', self: { sid: 'me', branch: 'pie-7-everything', worktree: '/repo' } }), 7, OPEN).delivery).toBeNull()
  expect(collisionsFor(world({ mode: 'merge-per-slice' }), 7, OPEN).delivery).toBeNull()
})

test('holdsClaim follows this session own claims and releases; ageWords reads minutes, hours and days', () => {
  const rows = [row('me', 1, 'claim', '7.1'), row('me', 2, 'claim', null), row('me', 3, 'release', null, { reason: 'done' })]
  expect(holdsClaim(rows, 'me', 7, '7.1')).toBe(false)
  expect(holdsClaim(rows.slice(0, 2), 'me', 7, '7.1')).toBe(true)
  expect(holdsClaim(rows.slice(0, 2), 'me', 7, null)).toBe(true)
  expect(holdsClaim(rows, 'other', 7, '7.1')).toBe(false)
  expect([ageWords(10000), ageWords(5 * 60000), ageWords(3 * HOUR), ageWords(72 * HOUR)]).toEqual(['just now', '5 min ago', '3 h ago', '3 d ago'])
})
