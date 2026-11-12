// mod/claims.test.ts
// Unit tests for the collision fold and its parsers: other sessions' rows and claims, branches past the default branch, worktrees, open PRs, releases, takeovers, handoffs on this session's own branch, stale and ended wording, and the delivery-mode flag.

import { expect, test } from 'claude-code/testing'

import {
  CLAIM_STALE_MS,
  ageWords,
  collisionLines,
  collisionsFor,
  branchSlice,
  conflictLine,
  handoffLine,
  holdsClaim,
  isPieBranch,
  checkScope,
  holdsWork,
  openSlices,
  overOf,
  parseHeads,
  parsePrList,
  parseRunArg,
  piesInTitle,
  runTarget,
  sessionWork,
  slicesInTitle,
  parsePrs,
  parseRefCommits,
  parseWorktrees,
  shortBranch,
} from './claims.ts'
import type { Elsewhere } from './claims.ts'
import type { LedgerRow, PassChecklist } from './types'

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
  // The turn that released it still writes its usage row: bookkeeping, not new work.
  const usage = row('other', NOW - 500, 'usage', '7.1', { tok: 10 })
  expect(collisionsFor(world({ rows: [...work, row('other', NOW - 1000, 'release', '7.1', { reason: 'abandoned' }), usage] }), 7, OPEN).conflicts).toEqual([])
  const kept = collisionsFor(world({ rows: [...work, row('other', NOW - 1000, 'release', '7.1', { reason: 'done' })] }), 7, OPEN)
  expect(kept.conflicts.map(p => p.slices)).toEqual([['7.1']])
})

test('work already on the default branch, or a slice the checklist marks done, does not conflict', () => {
  const rows = [row('other', NOW - HOUR, 'commit', '7.1', { sha: 'mmmmmmm000', branch: 'pie-7-x' }), row('other', NOW - HOUR, 'slice.started', '7.3')]
  const base = { base: 'origin/main', shas: ['mmmmmmm000'], subjects: ['feat(pie-7): 7.1 merged (#9)'] }
  expect(collisionsFor(world({ rows, base }), 7, ['7.1', '7.2']).conflicts).toEqual([])
})

test('a later claim with over naming the session takes its work over for everyone', () => {
  const rows = [
    row('other', NOW - 2 * HOUR, 'slice.started', '7.1', { branch: 'pie-7-x' }),
    row('third', NOW - HOUR, 'claim', '7.1', { branch: 'pie-7-s7.1-new', over: ['other'] }),
  ]
  const found = collisionsFor(world({ rows, strip: { third: NOW } }), 7, OPEN)
  expect(found.conflicts.map(p => p.sid)).toEqual(['third'])
  expect(overOf(found)).toEqual(['third', 'pie-7-s7.1-new'])
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

test('a slice branch checked out in another worktree conflicts for its slice even with no commits yet, with its uncommitted files', () => {
  const worktrees = [
    { path: '/repo', branch: 'pie-7-s7.1-first', dirty: null },
    { path: '/wt/other', branch: 'pie-7-s7.2-next', dirty: 3 },
  ]
  const found = collisionsFor(world({ worktrees }), 7, OPEN)
  expect(collisionLines(found, NOW)).toEqual(['Slice 7.2 is checked out elsewhere on branch pie-7-s7.2-next in worktree /wt/other (3 uncommitted files)'])
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
  const ended = collisionsFor(world({ rows, ended: { earlier: NOW - 9 * HOUR } }), 7, OPEN)
  expect(ended.conflicts).toEqual([])
  expect(ended.handoffs.map(p => handoffLine(p, NOW))).toEqual(['Slice 7.1: continuing on branch pie-7-s7.1-first from session earlier (ended)'])
  const live = collisionsFor(world({ rows: [{ ...rows[0]!, t: NOW - 60000 }], strip: { earlier: NOW } }), 7, OPEN)
  expect(live.conflicts.map(p => p.sid)).toEqual(['earlier'])
})

test('an ended session with no branch, commit or PR on record is history to continue; a live one still conflicts', () => {
  const rows = [row('before-clear', NOW - 2 * HOUR, 'slice.started', '7.1'), row('before-clear', NOW - HOUR, 'verdict', '7.1', { gate: 'slice-verifier' })]
  const ended = collisionsFor(world({ rows, ended: { 'before-clear': NOW - 30 * 60000 } }), 7, OPEN)
  expect(ended.conflicts).toEqual([])
  expect(ended.handoffs.map(p => handoffLine(p, NOW))).toEqual(['Slice 7.1: continuing from session before-clear (ended)'])
  // Without an end mark it may only be idle (its chat still open): it conflicts, worded as idle.
  const idle = collisionsFor(world({ rows }), 7, OPEN)
  expect(idle.conflicts.map(p => p.liveness)).toEqual(['idle'])
  expect(conflictLine(idle.conflicts[0]!, NOW)).toContain('(idle: no running session seen, its chat may still be open, last activity 1 h ago)')
  expect(collisionsFor(world({ rows, strip: { 'before-clear': NOW } }), 7, OPEN).conflicts.map(p => p.liveness)).toEqual(['live'])
})

test('an ended session whose only claim was the pie leaves nothing behind', () => {
  const rows = [row('gone', NOW - 30 * HOUR, 'pie.started', null)]
  expect(collisionsFor(world({ rows, ended: { gone: NOW - 29 * HOUR } }), 7, OPEN).conflicts).toEqual([])
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

test('a claim made in this worktree before the session moved to its own branch never hides that branch as a handoff', () => {
  // Claimed from the primary checkout, then built and pushed on its own branch, opened a PR, and ended.
  const rows = [
    row('left', NOW - 5 * HOUR, 'claim', '7.1', { worktree: '/repo' }),
    row('left', NOW - 4 * HOUR, 'commit', '7.1', { sha: 'ddddddd1', branch: 'pie-7-s7.1-theirs' }),
  ]
  const prs = [{ number: 40, title: 'Slice 7.1: first', head: 'pie-7-s7.1-theirs', url: 'u40', t: NOW - HOUR }]
  const found = collisionsFor(world({ rows, prs, self: { sid: 'me', branch: 'main', worktree: '/repo' } }), 7, ['7.1'])
  expect(found.handoffs).toEqual([])
  expect(found.conflicts.map(p => [p.branch, p.pr?.number ?? null])).toEqual([['pie-7-s7.1-theirs', 40]])
})

test('an approved takeover covers the session, its branch commits, its worktree and its PR', () => {
  const rows = [
    row('other', NOW - 3 * HOUR, 'commit', '7.1', { sha: 'eeeeeee1', branch: 'pie-7-big' }),
    row('me', NOW - HOUR, 'claim', '7.1', { branch: 'pie-7-s7.1-first', over: ['other'] }),
  ]
  const commits = [{ sha: 'eeeeeee1', branch: 'pie-7-big', t: NOW - 3 * HOUR, subject: 'feat(pie-7): 7.1 task 1' }]
  const worktrees = [{ path: '/wt/big', branch: 'pie-7-big', dirty: 0 }]
  const prs = [{ number: 41, title: 'Pie 7: big', head: 'pie-7-big', url: 'u41', t: NOW }]
  const heads = [{ branch: 'pie-7-big', sha: 'eeeeeee1', t: NOW - 3 * HOUR }]
  expect(collisionsFor(world({ rows, commits, worktrees, prs, heads, strip: { other: NOW } }), 7, ['7.1']).conflicts).toEqual([])
  // A commit after the takeover is new work on that branch, and shows again.
  const later = [...commits, { sha: 'eeeeeee2', branch: 'pie-7-big', t: NOW - 60000, subject: 'feat(pie-7): 7.1 task 2' }]
  expect(collisionsFor(world({ rows, commits: later, heads }), 7, ['7.1']).conflicts.map(p => [p.branch, p.commits])).toEqual([['pie-7-big', 1]])
})

test('a slice claim ignores another slice branch, its commits, its worktree and its PR', () => {
  expect(branchSlice('pie-7-s7.2-second')).toBe('7.2')
  expect(branchSlice('pie-7-whole')).toBeNull()
  const commits = [
    { sha: 'f1', branch: 'pie-7-s7.2-second', t: NOW - HOUR, subject: 'feat(pie-7): 7.2 second' },
    { sha: 'f2', branch: 'pie-7-s7.2-second', t: NOW - HOUR, subject: 'wip' },
  ]
  const worktrees = [{ path: '/wt/two', branch: 'pie-7-s7.2-second', dirty: 2 }]
  const prs = [{ number: 42, title: 'Slice 7.2: second', head: 'pie-7-s7.2-second', url: 'u42', t: NOW }]
  expect(collisionsFor(world({ commits, worktrees, prs }), 7, ['7.1']).conflicts).toEqual([])
  // Checking the whole pie still sees it, as slice 7.2 work.
  const all = collisionsFor(world({ commits, worktrees, prs }), 7, OPEN)
  expect(all.conflicts.map(p => [p.branch, p.slices, p.pieLevel, p.pr?.number ?? null])).toEqual([['pie-7-s7.2-second', ['7.2'], false, 42]])
})

const CHECKLIST: PassChecklist = {
  layout: 'pie',
  prep: null,
  pies: [
    { n: 8, name: 'Earlier', review: 'boundary', done: false, slices: [{ id: '8.6', name: 'Left open', done: false }] },
    { n: 23, name: 'Video', review: 'boundary', done: false, slices: [{ id: '23.1', name: 'Kinds', done: false }, { id: '23.2', name: 'Upload', done: false }] },
  ],
}

test('the run target is the pie the run is on, not the first pie with an open slice', () => {
  const at = (facts: Partial<Parameters<typeof runTarget>[1]>) => runTarget(CHECKLIST, { branch: null, rows: [], sid: 'me', ...facts })
  expect(at({})).toEqual({ pie: 8, slice: '8.6' })
  expect(at({ branch: 'pie-23-video' })).toEqual({ pie: 23, slice: '23.1' })
  expect(at({ branch: 'pie-23-s23.2-upload' })).toEqual({ pie: 23, slice: '23.2' })
  expect(at({ branch: 'main', arg: '23' })).toEqual({ pie: 23, slice: '23.1' })
  expect(at({ branch: 'main', arg: 'Slice 23.2' })).toEqual({ pie: 23, slice: '23.2' })
  // A merge-per-slice conductor sits on main between slices: its own claim says where it is.
  const rows = [row('me', 1, 'claim', '23.2'), row('me', 2, 'claim', '23.2', { contested: true })]
  expect(at({ branch: 'main', rows })).toEqual({ pie: 23, slice: '23.2' })
  expect(at({ branch: 'main', rows: [row('me', 1, 'claim', '23.2', { contested: true })] })).toEqual({ pie: 8, slice: '8.6' })
  expect(at({ branch: 'pie-99-gone' })).toEqual({ pie: 8, slice: '8.6' })
  expect([parseRunArg('pie 23'), parseRunArg('7'), parseRunArg('bake it'), parseRunArg(undefined)]).toEqual([{ pie: 23, slice: null }, { pie: 7, slice: null }, null, null])
})

test('a contested claim is intent only: it makes no conflict for the holder and no claim for its writer', () => {
  const rows = [
    row('me', NOW - 2 * HOUR, 'claim', '7.1', { branch: 'pie-7-s7.1-first' }),
    row('me', NOW - HOUR, 'commit', '7.1', { sha: 'abcdef12', branch: 'pie-7-s7.1-first' }),
    row('newcomer', NOW - 60000, 'claim', '7.1', { branch: 'pie-7-s7.1-again', contested: true }),
    row('newcomer', NOW - 30000, 'warn', '7.1', { code: 'session-collision' }),
  ]
  expect(collisionsFor(world({ rows, strip: { newcomer: NOW } }), 7, OPEN).conflicts).toEqual([])
  expect(holdsClaim(rows, 'newcomer', 7, '7.1')).toBe(false)
  expect(holdsWork(rows, 'me', 7, '7.1')).toBe(true)
  expect(holdsWork(rows, 'newcomer', 7, '7.1')).toBe(false)
})

test('squash-merged work counts as merged: a merged PR of its branch, a base subject naming the slice or the pie', () => {
  const commits = [{ sha: 'a1', branch: 'pie-7-s7.1-theirs', t: NOW - 3 * HOUR, subject: 'feat(pie-7): 7.1 first' }]
  const rows = [row('other', NOW - 3 * HOUR, 'commit', '7.1', { sha: 'a1', branch: 'pie-7-s7.1-theirs' })]
  expect(collisionsFor(world({ commits, rows, merged: [{ head: 'pie-7-s7.1-theirs', t: NOW - HOUR }] }), 7, OPEN).conflicts).toEqual([])
  // Work after the merge is new work again.
  expect(collisionsFor(world({ commits, merged: [{ head: 'pie-7-s7.1-theirs', t: NOW - 4 * HOUR }] }), 7, OPEN).conflicts).toHaveLength(1)
  const base = { base: 'origin/main', shas: ['m1'], subjects: ['feat(pie-7): 7.1 first (#40)'] }
  expect(collisionsFor(world({ commits, base }), 7, OPEN).conflicts).toEqual([])
  const whole = [{ sha: 'w1', branch: 'pie-7-everything', t: NOW - HOUR, subject: 'wip' }]
  const squash = { base: 'origin/main', shas: ['m1'], subjects: ['Pie 7: everything (#41)'] }
  expect(collisionsFor(world({ commits: whole, base: squash }), 7, OPEN).conflicts).toEqual([])
  expect(collisionsFor(world({ commits: whole }), 7, OPEN).conflicts).toHaveLength(1)
  expect(parsePrList('[{"number":1,"headRefName":"a","state":"MERGED","mergedAt":"2026-01-01T00:00:00Z"},{"number":2,"headRefName":"b","state":"CLOSED"},{"number":3,"headRefName":"c","state":"OPEN","title":"t","url":"u"}]')).toEqual({
    open: [{ number: 3, title: 't', head: 'c', url: 'u', t: 0 }],
    merged: [{ head: 'a', t: Date.parse('2026-01-01T00:00:00Z') }],
  })
})

test('a party keeps every session on its branch and shows the liveliest', () => {
  const rows = [
    row('first', NOW - 2 * HOUR, 'commit', '7.1', { sha: 'b1', branch: 'pie-7-s7.4-fourth' }),
    row('second', NOW - 60000, 'edit', '7.1', { branch: 'pie-7-s7.4-fourth' }),
  ]
  // This session's own branch: the ended first session alone would be a handoff, but a live second one conflicts.
  const found = collisionsFor(world({ rows, self: { sid: 'me', branch: 'pie-7-s7.4-fourth', worktree: '/repo' }, strip: { second: NOW }, ended: { first: NOW - HOUR } }), 7, OPEN)
  expect(found.handoffs).toEqual([])
  expect(found.conflicts.map(p => [p.sid, p.sids, p.liveness])).toEqual([['second', ['first', 'second'], 'live']])
  expect(conflictLine(found.conflicts[0]!, NOW)).toContain('2 sessions on it')
})

test('an empty open list means nothing is open; null means the checklist could not tell', () => {
  const rows = [row('other', NOW - HOUR, 'claim', '7.1', { branch: 'pie-7-s7.1-first' }), row('other', NOW - HOUR, 'claim', null, { branch: 'pie-7-s7.1-first' })]
  expect(collisionsFor(world({ rows, strip: { other: NOW } }), 7, []).conflicts).toEqual([])
  expect(collisionsFor(world({ rows, strip: { other: NOW } }), 7, null).conflicts.map(p => p.slices)).toEqual([['7.1']])
  expect(openSlices(CHECKLIST, 23)).toEqual(['23.1', '23.2'])
  expect(openSlices(CHECKLIST, 99)).toBeNull()
  expect(openSlices(null, 23)).toBeNull()
})

test('PR titles name every pie and slice they mention, and a planning PR is not a build', () => {
  expect(piesInTitle('add Pie 26 plans and Pie 27 plans')).toEqual([26, 27])
  expect(piesInTitle('Pies 23 and 24: media')).toEqual([23, 24])
  expect(piesInTitle('Pies 3 to 5')).toEqual([3, 4, 5])
  expect(slicesInTitle('Slices 7.1 and 7.2')).toEqual(['7.1', '7.2'])
  const plan = [{ number: 50, title: 'docs: add Pie 7 and Pie 8 plans', head: 'docs/roadmap', url: 'u50', t: NOW }]
  expect(collisionsFor(world({ prs: plan }), 7, OPEN).conflicts).toEqual([])
  const build = [{ number: 51, title: 'Pies 6 and 7: shared upload', head: 'feature/upload', url: 'u51', t: NOW }]
  expect(collisionsFor(world({ prs: build }), 7, OPEN).conflicts.map(p => p.pr?.number)).toEqual([51])
})

test('a rejected start is intent only: its contested slice.started is not work either', () => {
  const rows = [
    row('newcomer', NOW - 60000, 'slice.started', '7.1', { skill: 'sell-slice', contested: true }),
    row('newcomer', NOW - 60000, 'claim', '7.1', { branch: 'pie-7-s7.1-again', contested: true }),
  ]
  expect(collisionsFor(world({ rows, strip: { newcomer: NOW } }), 7, OPEN).conflicts).toEqual([])
})

test('a /sell-slice run is checked for its slice only; a /sell-pie run, or one with no claims yet, for the open pie', () => {
  const target = { pie: 23, slice: '23.1' }
  expect(checkScope(CHECKLIST, [row('me', 1, 'claim', '23.1')], 'me', target)).toEqual(['23.1'])
  expect(checkScope(CHECKLIST, [row('me', 1, 'claim', null), row('me', 1, 'claim', '23.1')].map(r => ({ ...r, pie: 23 })), 'me', target)).toEqual(['23.1', '23.2'])
  expect(checkScope(CHECKLIST, [], 'me', target)).toEqual(['23.1', '23.2'])
})

test('a /sell-slice start elsewhere holds its slice, never the whole pie', () => {
  const rows = [
    row('other', NOW - 60000, 'pie.started', null, { skill: 'sell-slice' }),
    row('other', NOW - 60000, 'slice.started', '7.2', { skill: 'sell-slice' }),
  ]
  expect(collisionsFor(world({ rows, strip: { other: NOW } }), 7, ['7.1']).conflicts).toEqual([])
  expect(collisionsFor(world({ rows, strip: { other: NOW } }), 7, ['7.2']).conflicts.map(p => p.slices)).toEqual([['7.2']])
  // A /sell-pie start holds the pie with a branch of that pie on record (6.6.1: a bare old start holds nothing).
  const pie = [row('other', NOW - 60000, 'pie.started', null, { skill: 'sell-pie', branch: 'pie-7-x' })]
  expect(collisionsFor(world({ rows: pie, strip: { other: NOW } }), 7, ['7.1']).conflicts.map(p => p.pieLevel)).toEqual([true])
})

test('a release as abandoned lets go of that session branch commits, worktree and PR too; later work shows again', () => {
  const rows = [
    row('other', NOW - 3 * HOUR, 'commit', '7.1', { sha: 'r1', branch: 'pie-7-s7.1-gone' }),
    row('other', NOW - 2 * HOUR, 'release', '7.1', { reason: 'abandoned' }),
  ]
  const commits = [{ sha: 'r1', branch: 'pie-7-s7.1-gone', t: NOW - 3 * HOUR, subject: 'feat(pie-7): 7.1 task 1' }]
  const worktrees = [{ path: '/wt/gone', branch: 'pie-7-s7.1-gone', dirty: 1 }]
  const prs = [{ number: 60, title: 'Slice 7.1: gone', head: 'pie-7-s7.1-gone', url: 'u60', t: NOW }]
  const heads = [{ branch: 'pie-7-s7.1-gone', sha: 'r1', t: NOW - 3 * HOUR }]
  expect(collisionsFor(world({ rows, commits, worktrees, prs, heads, strip: { other: NOW } }), 7, ['7.1']).conflicts).toEqual([])
  const later = [...commits, { sha: 'r2', branch: 'pie-7-s7.1-gone', t: NOW - 60000, subject: 'feat(pie-7): 7.1 task 2' }]
  expect(collisionsFor(world({ rows, commits: later, heads }), 7, ['7.1']).conflicts.map(p => p.commits)).toEqual([1])
})

test('one task of a slice on the default branch never hides its other, unmerged commits', () => {
  const base = { base: 'origin/main', shas: ['t1aaaaa'], subjects: ['feat(pie-7): 7.1 task 1 first'] }
  const commits = [{ sha: 't2bbbbb', branch: 'pie-7-s7.1-theirs', t: NOW - HOUR, subject: 'feat(pie-7): 7.1 task 2 second' }]
  expect(collisionsFor(world({ base, commits }), 7, ['7.1']).conflicts.map(p => [p.branch, p.commits])).toEqual([['pie-7-s7.1-theirs', 1]])
  // The ledger side too: task 1 merged, task 2 not.
  const rows = [
    row('other', NOW - 2 * HOUR, 'commit', '7.1', { sha: 't1aaaaa', branch: 'pie-7-s7.1-theirs' }),
    row('other', NOW - HOUR, 'commit', '7.1', { sha: 't2bbbbb', branch: 'pie-7-s7.1-theirs' }),
  ]
  expect(collisionsFor(world({ base, rows }), 7, ['7.1']).conflicts.map(p => p.slices)).toEqual([['7.1']])
  // Every recorded commit merged: settled.
  expect(collisionsFor(world({ base, rows: rows.slice(0, 1) }), 7, ['7.1']).conflicts).toEqual([])
})

test('a worktree with uncommitted edits still counts after its branch earlier PR merged', () => {
  const worktrees = [{ path: '/wt/again', branch: 'pie-7-s7.1-again', dirty: 2 }]
  const heads = [{ branch: 'pie-7-s7.1-again', sha: 'h1', t: NOW - 3 * HOUR }]
  const merged = [{ head: 'pie-7-s7.1-again', t: NOW - 2 * HOUR }]
  expect(collisionsFor(world({ worktrees, heads, merged }), 7, ['7.1']).conflicts.map(p => [p.branch, p.dirty])).toEqual([['pie-7-s7.1-again', 2]])
  // Clean, the merge settles it.
  expect(collisionsFor(world({ worktrees: [{ ...worktrees[0]!, dirty: 0 }], heads, merged }), 7, ['7.1']).conflicts).toEqual([])
})

test('a fresh claim or edit after a session merged commits is live work again', () => {
  const base = { base: 'origin/main', shas: ['old0001'], subjects: ['feat(pie-7): 7.1 task 1'] }
  const merged = [row('other', NOW - 5 * HOUR, 'commit', '7.1', { sha: 'old0001', branch: 'pie-7-s7.1-old' })]
  expect(collisionsFor(world({ base, rows: merged, strip: { other: NOW } }), 7, ['7.1']).conflicts).toEqual([])
  const again = [...merged, row('other', NOW - 10 * 60000, 'claim', '7.1', { branch: 'main' }), row('other', NOW - 60000, 'edit', '7.1')]
  expect(collisionsFor(world({ base, rows: again, strip: { other: NOW } }), 7, ['7.1']).conflicts.map(p => [p.sid, p.liveness])).toEqual([['other', 'live']])
})

test('a pie-boundary squash settles the pie ledger work on every branch up to when it landed', () => {
  const rows = [row('other', NOW - 5 * HOUR, 'commit', '7.2', { sha: 'orig001', branch: 'pie-7-seven' })]
  const squash = { base: 'origin/main', shas: ['sq1'], subjects: ['Pie 7: seven (#42)'], times: [NOW - HOUR] }
  expect(collisionsFor(world({ rows, base: squash }), 7, ['7.2']).conflicts).toEqual([])
  // A slice branch's work from before the merge is settled too (6.6.1); work after it is new.
  const slice = [row('other', NOW - 5 * HOUR, 'commit', '7.2', { sha: 'orig002', branch: 'pie-7-s7.2-own' })]
  expect(collisionsFor(world({ rows: slice, base: squash }), 7, ['7.2']).conflicts).toEqual([])
  const after = [row('other', NOW - 60000, 'commit', '7.2', { sha: 'new0003', branch: 'pie-7-s7.2-own' })]
  expect(collisionsFor(world({ rows: after, base: squash }), 7, ['7.2']).conflicts).toHaveLength(1)
})


// ---- 2026-11-11: a chat that claimed nothing is on no slice ---------------------------------------------------

test('a session with no claim, start or pie branch is on no slice; the run target still falls back to the active pie', () => {
  const facts = { branch: 'dk-nba-1111', rows: [row('other', NOW, 'claim', '23.1')], sid: 'me' }
  expect(sessionWork(CHECKLIST, facts)).toBe(null)
  expect(runTarget(CHECKLIST, facts)).toEqual({ pie: 8, slice: '8.6' })
  expect(sessionWork(CHECKLIST, { ...facts, rows: [row('me', NOW, 'claim', '23.2')] })).toEqual({ pie: 23, slice: '23.2' })
  expect(sessionWork(CHECKLIST, { ...facts, branch: 'pie-23-s23.1-kinds' })?.slice).toBe('23.1')
})

test('edits, pushes and commits a session never claimed or started a slice for are not work on it', () => {
  // Every row of a chat that claimed nothing used to carry the checklist's first open slice (18 chats "on Slice 2.2").
  const defaulted = [
    row('slate', NOW - 60000, 'edit', '7.1', { path: 'scripts/board.py' }),
    row('slate', NOW - 50000, 'push', '7.1', { sha: 'aaaaaaa1', branch: 'dk-nba-1111' }),
    row('slate', NOW - 40000, 'commit', '7.1', { sha: 'aaaaaaa1', branch: 'dk-nba-1111' }),
  ]
  expect(collisionsFor(world({ rows: defaulted, strip: { slate: NOW } }), 7, OPEN).conflicts).toEqual([])
  // The same rows after a claim on the slice, or on a branch of the pie, are work.
  const claimed = [row('slate', NOW - 70000, 'claim', '7.1'), ...defaulted]
  expect(collisionsFor(world({ rows: claimed, strip: { slate: NOW } }), 7, OPEN).conflicts.map(p => p.sid)).toEqual(['slate'])
  const onPie = defaulted.map(r => ({ ...r, data: { ...r.data, branch: 'pie-7-s7.1-other' } }))
  expect(collisionsFor(world({ rows: onPie, strip: { slate: NOW } }), 7, OPEN).conflicts.length).toBe(1)
})


test('a released or contested start is not this session\'s work (Codex on #67)', () => {
  const facts = { branch: 'dk-nba-1111', sid: 'me' }
  const start = row('me', NOW - 3000, 'slice.started', '23.1', { skill: 'sell-slice' })
  expect(sessionWork(CHECKLIST, { ...facts, rows: [start] })).toEqual({ pie: 23, slice: '23.1' })
  const released = [start, row('me', NOW - 2000, 'release', '23.1', { reason: 'abandoned' })]
  expect(sessionWork(CHECKLIST, { ...facts, rows: released })).toBe(null)
  const pieRelease = [start, row('me', NOW - 2000, 'release', null, { reason: 'deferred' })].map(r => ({ ...r, pie: 23 }))
  expect(sessionWork(CHECKLIST, { ...facts, rows: pieRelease })).toBe(null)
  const contested = [row('me', NOW - 1000, 'slice.started', '23.2', { skill: 'sell-slice', contested: true })]
  expect(sessionWork(CHECKLIST, { ...facts, rows: contested })).toBe(null)
})
