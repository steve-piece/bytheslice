// mod/subjects.test.ts
// Which default-branch subjects say a pie or slice merged, replayed from the first live run of 6.6.0: plan commits that only name a pie merge nothing, a pie-boundary squash settles every slice of its pie up to when it landed, and an old /sell-pie start with no branch of the pie holds nothing.

import { expect, test } from 'claude-code/testing'

import { boardOf, boardText } from './board.ts'
import { CLAIM_STALE_MS, collisionsFor } from './claims.ts'
import type { Elsewhere } from './claims.ts'
import { boundaryPie, boundaryTime, isPlanOnly, parseBaseLog, slicesNamed, squashSlices, statusDrift } from './drift.ts'
import type { LedgerRow, PassChecklist } from './types'

const NOW = 1762860000000
const HOUR = 60 * 60 * 1000

const PIE_28_PLAN = 'chore(plans): add Pie 28 chaptered clip selection (#254)'
const PIE_24_25_PLAN = 'chore(plans): add Pie 24 signup domains and warming lifecycle, Pie 25 model personas (#250)'
const PIE_23_MERGE = 'Pie 23: Video GIF Posting (#251)'

const pie = (n: number, name: string, count: number, done = false) => ({
  n,
  name,
  review: 'boundary' as const,
  done,
  slices: Array.from({ length: count }, (_, i) => ({ id: `${n}.${i + 1}`, name: `Part ${i + 1}`, done })),
})

/** The project's checklist as the live run read it: Pie 8 open, Pie 23 checked off, Pies 24, 25 and 28 planned. */
const CHECKLIST: PassChecklist = {
  layout: 'pie',
  prep: null,
  pies: [pie(8, 'Earlier', 1), pie(23, 'Video GIF Posting', 6, true), pie(24, 'Signup domains', 8), pie(25, 'Model Personas', 4), pie(28, 'Chaptered Clip Selection', 8)],
}

const row = (sid: string, t: number, ev: LedgerRow['ev'], pieN: number, slice: string | null, data?: Record<string, unknown>): LedgerRow => ({
  v: 1,
  t,
  sid,
  ev,
  pie: pieN,
  ...(slice === null ? {} : { slice }),
  ...(data ? { data } : {}),
})

const BASE = {
  base: 'origin/main',
  shas: ['p28', 'm23', 'p2425'],
  subjects: [PIE_28_PLAN, PIE_23_MERGE, PIE_24_25_PLAN],
  times: [NOW - HOUR, NOW - 3 * HOUR, NOW - 30 * HOUR],
}

function world(over: Partial<Elsewhere> = {}): Elsewhere {
  return {
    self: { sid: 'me', branch: 'main', worktree: '/repo' },
    rows: [],
    now: NOW,
    base: BASE,
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

test('a plan commit that names a pie merges nothing; only the boundary shape does', () => {
  expect([boundaryPie(PIE_28_PLAN), boundaryPie(PIE_24_25_PLAN), boundaryPie(PIE_23_MERGE)]).toEqual([null, null, 23])
  expect(boundaryPie('Pie 23: Video GIF Posting')).toBeNull()
  expect(boundaryPie('docs: Pie 9 roadmap (#12)')).toBeNull()
  expect(boundaryPie('Pie 9: add plans for onboarding (#12)')).toBeNull()
  expect(boundaryPie('Pie 9: plan (#12)')).toBeNull()
  // A feature named with a plan word is still a boundary merge: box-it-up titles the PR from the pie's own name.
  expect(boundaryPie('Pie 7: Subscription plans (#42)')).toBe(7)
  expect(boundaryPie('Pie 9: Docs export (#40)')).toBe(9)
  expect(squashSlices('Slice 7.4: Checklist editor (#43)')).toEqual(['7.4'])
  expect([isPlanOnly(PIE_28_PLAN), isPlanOnly('chore(pie-28): 28.1 task 2 bump deps'), isPlanOnly('Pie 23: Video GIF Posting (#251)')]).toEqual([true, false, false])
  expect(squashSlices('feat(pie-7): 7.1 first (#40)')).toEqual(['7.1'])
  expect(squashSlices('Slice 7.2: second (#41)')).toEqual(['7.2'])
  expect(squashSlices('docs: Slice 7.3 spec (#42)')).toEqual([])
  expect(squashSlices('feat(pie-7): 7.1 first')).toEqual([])
  expect(boundaryTime(BASE, 23)).toBe(NOW - 3 * HOUR)
  expect([boundaryTime(BASE, 28), boundaryTime(BASE, 24)]).toEqual([null, null])
  expect(boundaryTime({ subjects: [PIE_23_MERGE] }, 23)).toBe(Number.POSITIVE_INFINITY)
})

test('the default branch log reads its commit times, and still reads a line without one', () => {
  expect(parseBaseLog('origin/main', `abc 1762860000\t${PIE_23_MERGE}\ndef plain subject\n`)).toEqual({
    base: 'origin/main',
    shas: ['abc', 'def'],
    subjects: [PIE_23_MERGE, 'plain subject'],
    times: [1762860000000, Number.NaN],
  })
})

test('the board no longer reads planned pies as merged (cases 1 to 3)', () => {
  const board = boardOf(CHECKLIST, world({ prs: [{ number: 252, title: 'Pie 24: Signup domains', head: 'pie-24-signup', url: 'u252', t: NOW }] }))
  const states = (n: number) => board.pies.find(p => p.n === n)?.slices.map(s => s.state)
  expect(states(28)).toEqual(Array(8).fill('queued'))
  expect(states(25)).toEqual(Array(4).fill('queued'))
  expect(states(24)?.includes('merged')).toBe(false)
  expect(boardText(board, 'me')).toContain('Pie 28 Chaptered Clip Selection · 8 queued')
})

test('a pie-boundary squash settles every slice of its pie, a stray duplicate branch included (case 4)', () => {
  // The abandoned duplicate build of 23.1: commits on its own slice branch, a day before the pie merged.
  const commits = [
    { sha: 'd1', branch: 'pie-23-s23.1-media-kinds', t: NOW - 20 * HOUR, subject: 'feat(pie-23): 23.1 task 1 media kinds' },
    { sha: 'd2', branch: 'archive/pie-23-s23.1-media-kinds', t: NOW - 20 * HOUR, subject: 'feat(pie-23): 23.1 task 1 media kinds' },
  ]
  const rows = [row('dup', NOW - 20 * HOUR, 'commit', 23, '23.1', { sha: 'd1', branch: 'pie-23-s23.1-media-kinds' })]
  expect(collisionsFor(world({ commits, rows }), 23, null).conflicts).toEqual([])
  const board = boardOf(CHECKLIST, world({ commits, rows }), 'all')
  expect(board.pies.find(p => p.n === 23)?.slices.every(s => s.state === 'merged')).toBe(true)
  expect(boardOf(CHECKLIST, world({ commits, rows })).pies.some(p => p.n === 23)).toBe(false)
  // Work after the pie merged is new work, and shows.
  const later = [{ sha: 'd3', branch: 'pie-23-s23.1-media-kinds', t: NOW - 60000, subject: 'feat(pie-23): 23.1 task 2 again' }]
  expect(collisionsFor(world({ commits: later }), 23, null).conflicts.map(p => p.slices)).toEqual([['23.1']])
})

test('an old /sell-pie start with no branch of the pie holds nothing (case 5)', () => {
  // The archived duplicate chat: under the old plugin its start wrote pie.started for the first open pie, Pie 8.
  const rows = [row('06d4e226-dup', NOW - 5 * HOUR, 'pie.started', 8, null, { skill: 'sell-pie' })]
  expect(collisionsFor(world({ rows }), 8, ['8.1']).conflicts).toEqual([])
  expect(boardOf(CHECKLIST, world({ rows })).pies.find(p => p.n === 8)?.pieHolders).toEqual([])
  // With a branch of the pie on record, a start does hold it.
  const held = [...rows, row('06d4e226-dup', NOW - 4 * HOUR, 'push', 8, null, { branch: 'pie-8-earlier' })]
  expect(collisionsFor(world({ rows: held }), 8, ['8.1']).conflicts.map(p => p.pieLevel)).toEqual([true])
})

test('a plan commit no longer hides a real whole-pie build on another branch', () => {
  // Before 6.6.1 the Pie 28 plan commit read as Pie 28's squash merge and hid this branch from every check.
  const commits = [{ sha: 'b1', branch: 'pie-28-chapters', t: NOW - 30 * 60000, subject: 'wip chapters' }]
  expect(collisionsFor(world({ commits }), 28, CHECKLIST.pies[4]!.slices.map(s => s.id)).conflicts.map(p => [p.branch, p.pieLevel])).toEqual([['pie-28-chapters', true]])
})

test('status drift reads no slice from plan commits', () => {
  expect(slicesNamed([PIE_28_PLAN, PIE_24_25_PLAN, PIE_23_MERGE])).toEqual(new Set())
  expect(statusDrift(CHECKLIST, null, { base: 'origin/main', shas: BASE.shas, subjects: BASE.subjects, branch: 'main' })).toEqual([])
})
