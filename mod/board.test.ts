// mod/board.test.ts
// Unit tests for the project board: each slice state from the shared sources (merged, in review, built and unmerged, building, claimed, queued), holders and collisions, whole-pie claims, the bts_board text, the pane rows, and bts_board end to end.

import { expect, test } from 'claude-code/testing'

import { boardLine, boardOf, boardRows, boardText, pieSummary } from './board.ts'
import { CLAIM_STALE_MS } from './claims.ts'
import type { Elsewhere } from './claims.ts'
import { CONFIG, LEDGER, START_MS, stage } from './testing.tsx'
import type { LedgerRow, PassChecklist } from './types'

const NOW = 1760000000000
const HOUR = 60 * 60 * 1000

const CHECKLIST: PassChecklist = {
  layout: 'pie',
  prep: null,
  pies: [
    { n: 6, name: 'Done', review: 'boundary', done: true, slices: [{ id: '6.1', name: 'Old', done: true }] },
    {
      n: 7,
      name: 'Seven',
      review: 'boundary',
      done: false,
      slices: ['7.1', '7.2', '7.3', '7.4', '7.5', '7.6'].map(id => ({ id, name: `Part ${id}`, done: id === '7.6' })),
    },
  ],
}

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
    self: { sid: 'me', branch: 'pie-7-s7.4-fourth', worktree: '/repo' },
    rows: [],
    now: NOW,
    base: { base: 'origin/main', shas: ['mmmmmmm000'], subjects: ['feat(pie-6): 6.1 old', 'feat(pie-7): 7.1 first'] },
    commits: [],
    heads: [],
    worktrees: [],
    prs: [],
    mode: null,
    strip: { me: NOW, other: NOW },
    staleMs: CLAIM_STALE_MS,
    ...over,
  }
}

/** One world holding every state: 7.1 merged, 7.2 in review, 7.3 built, 7.4 building (this session), 7.5 claimed, 7.6 checklist-done. */
const EVERY = world({
  rows: [
    row('me', NOW - 10 * 60000, 'claim', '7.4', { branch: 'pie-7-s7.4-fourth', worktree: '/repo', goal: 'the fourth part' }),
    row('stale', NOW - 3 * 24 * HOUR, 'claim', '7.5', { branch: 'pie-7-s7.5-fifth', worktree: '/wt/five' }),
    row('other', NOW - 2 * HOUR, 'claim', null, { branch: 'pie-7-whole' }),
  ],
  strip: { me: NOW, other: NOW, stale: NOW },
  commits: [
    { sha: 'c3', branch: 'pie-7-s7.3-third', t: NOW - HOUR, subject: 'feat(pie-7): 7.3 third' },
    { sha: 'c2', branch: 'pie-7-s7.2-second', t: NOW - 2 * HOUR, subject: 'feat(pie-7): 7.2 second' },
  ],
  worktrees: [
    { path: '/repo', branch: 'pie-7-s7.4-fourth', dirty: 2, ahead: 1 },
    { path: '/wt/five', branch: 'pie-7-s7.5-fifth', dirty: 0, ahead: null },
  ],
  prs: [{ number: 31, title: 'Slice 7.2: second', head: 'pie-7-s7.2-second', url: 'u31', t: NOW - HOUR }],
})

test('every slice gets one state, the furthest any session, branch or PR took it', () => {
  const board = boardOf(CHECKLIST, EVERY)
  expect(board.pies.map(p => p.n)).toEqual([7])
  const seven = board.pies[0]!
  expect(seven.slices.map(s => [s.id, s.state])).toEqual([
    ['7.1', 'merged'],
    ['7.2', 'in review'],
    ['7.3', 'built'],
    ['7.4', 'building'],
    ['7.5', 'claimed'],
    ['7.6', 'built'],
  ])
  expect(seven.pieHolders.map(h => [h.sid, h.branch])).toEqual([['other', 'pie-7-whole']])
  expect(boardOf(CHECKLIST, EVERY, 'all').pies.map(p => p.n)).toEqual([6, 7])
})

test('board lines name the holder, local work, the PR, the age and the goal; this session reads as itself', () => {
  const seven = boardOf(CHECKLIST, EVERY).pies[0]!
  const lines = seven.slices.map(s => boardLine(s, 'me', NOW))
  expect(lines).toEqual([
    '7.1 merged',
    '7.2 in review · pie-7-s7.2-second · PR 31 · 1 h ago',
    '7.3 built, unmerged · pie-7-s7.3-third · 1 h ago',
    '7.4 building · this session · pie-7-s7.4-fourth · /repo · 2 uncommitted · 1 unpushed · 10 min ago · goal: the fourth part',
    '7.5 claimed · session stale (stale) · pie-7-s7.5-fifth · /wt/five · 3 d ago',
    '7.6 built, unmerged',
  ])
  expect(pieSummary(seven)).toBe('Pie 7 Seven · 1 merged, 1 in review, 2 built, unmerged, 1 building, 1 claimed · pie claimed by session other')
})

test('two holders on one slice are counted, so a collision shows on the board', () => {
  const both = world({
    rows: [row('other', NOW - HOUR, 'claim', '7.2', { branch: 'pie-7-s7.2-a' }), row('me', NOW - 60000, 'claim', '7.2', { branch: 'pie-7-s7.4-fourth' })],
  })
  const slice = boardOf(CHECKLIST, both).pies[0]!.slices.find(s => s.id === '7.2')!
  expect(slice.holders).toBe(2)
  expect(boardLine(slice, 'me', NOW).endsWith('· 2 holders')).toBe(true)
})

test('the bts_board text lists each open pie and notes when gh was not read', () => {
  const text = boardText(boardOf(CHECKLIST, world({ prs: null })), 'me')
  expect(text.split('\n')).toEqual([
    'Project board · 1 pie · every chat, worktree and branch of this project',
    'Pie 7 Seven · 1 merged, 1 built, unmerged, 4 queued',
    '  7.1 merged',
    '  7.2 queued',
    '  7.3 queued',
    '  7.4 queued',
    '  7.5 queued',
    '  7.6 built, unmerged',
    'Open PRs were not read (gh is unavailable), so no slice reads in review.',
    'Derived on read from the ledger, git and gh; nothing here is stored or refuses a step.',
  ])
  expect(boardText(boardOf(CHECKLIST, world()), 'me', 9)).toBe('Project board: no Pie 9 in the checklist.')
})

test('the pane rows show only slices held elsewhere, and nothing when nothing is', () => {
  const board = { ...boardOf(CHECKLIST, EVERY), self: 'me' }
  expect(boardRows(board, CHECKLIST)).toEqual([
    'Board · 3 held elsewhere',
    '  7.2 in review · pie-7-s7.2-second · PR 31 · 1 h ago',
    '  7.3 built, unmerged · pie-7-s7.3-third · 1 h ago',
    '  7.5 claimed · session stale (stale) · pie-7-s7.5-fifth · /wt/five · 3 d ago',
  ])
  expect(boardRows({ ...boardOf(CHECKLIST, world()), self: 'me' }, CHECKLIST)).toEqual([])
  expect(boardRows(null, CHECKLIST)).toEqual([])
})

test('bts_board reads the ledger, git and gh on call and answers the board', async ($, on) => {
  const checklist = ['## Pie 7 - Seven [ ]', '### Slice 7.1 - First [ ]', 'Status: Not Started', '', '### Slice 7.2 - Second [ ]', 'Status: Not Started', ''].join('\n')
  const { world: w, start } = stage(on, { checklist, branch: 'pie-7-s7.2-second' })
  w.files[CONFIG] = '{}'
  w.files[LEDGER] = `${JSON.stringify({ v: 1, t: START_MS - HOUR, sid: 'chat-a', ev: 'claim', pie: 7, slice: '7.1', data: { branch: 'pie-7-s7.1-first', goal: 'first part' } })}\n`
  w.store['strip:/repo:chat-a'] = { pie: 7, slice: '7.1', status: 'building', branch: 'pie-7-s7.1-first', t: START_MS }
  w.run = argv => {
    const line = argv.join(' ')
    if (line === 'git symbolic-ref --quiet --short refs/remotes/origin/HEAD') return { stdout: 'origin/main\n' }
    if (line.startsWith('git rev-parse --verify --quiet origin/main')) return { stdout: 'm1\n' }
    if (argv[0] === 'git' && argv[1] === 'log' && argv.includes('--source')) return { stdout: '' }
    if (argv[0] === 'git' && argv[1] === 'log') return { stdout: 'mmmmmmm1 chore: start\n' }
    if (argv[0] === 'gh') return { stdout: '[]' }
    return undefined
  }
  await start($)
  const text = String((await $.tool.call({ tool: 'mcp__bytheslice__bts_board' })).result)
  expect(text).toContain('Pie 7 Seven · 1 building, 1 queued')
  expect(text).toContain('  7.1 building · session chat-a · pie-7-s7.1-first · 1 h ago · goal: first part')
  expect(text).toContain('  7.2 queued')
})

test('a slice with one task merged and the rest on a branch reads as that work, not merged', () => {
  const base = { base: 'origin/main', shas: ['t1aaaaa'], subjects: ['feat(pie-7): 7.2 task 1 first'] }
  const commits = [{ sha: 't2bbbbb', branch: 'pie-7-s7.2-rest', t: NOW - HOUR, subject: 'feat(pie-7): 7.2 task 2 rest' }]
  const slice = boardOf(CHECKLIST, world({ base, commits })).pies.find(p => p.n === 7)!.slices.find(s => s.id === '7.2')!
  expect([slice.state, slice.holder?.branch]).toEqual(['built', 'pie-7-s7.2-rest'])
  expect(boardOf(CHECKLIST, world({ base })).pies.find(p => p.n === 7)!.slices.find(s => s.id === '7.2')!.state).toBe('merged')
})

test('this session commits count as build evidence for their slice, read from the ledger', () => {
  const rows = [
    row('me', NOW - HOUR, 'claim', '7.4', { branch: 'pie-7-s7.4-fourth' }),
    row('me', NOW - 30 * 60000, 'commit', '7.4', { sha: 'own0001', branch: 'pie-7-s7.4-fourth' }),
  ]
  const seven = boardOf(CHECKLIST, world({ rows })).pies.find(p => p.n === 7)!
  expect(seven.slices.find(s => s.id === '7.4')!.state).toBe('built')
})

test('on one shared pie branch each slice is judged by its own evidence', () => {
  const commits = [{ sha: 'sh1', branch: 'pie-7-work', t: NOW - HOUR, subject: 'feat(pie-7): 7.1 task 1' }]
  const rows = [row('other', NOW - 60000, 'claim', '7.2', { branch: 'pie-7-work' })]
  const seven = boardOf(CHECKLIST, world({ commits, rows })).pies.find(p => p.n === 7)!
  expect(seven.slices.filter(s => s.id === '7.1' || s.id === '7.2').map(s => [s.id, s.state])).toEqual([
    ['7.1', 'built'],
    ['7.2', 'building'],
  ])
})

test('two live chats on one branch are two holders, and the pane shows the slice even when one is this session', () => {
  const rows = [
    row('me', NOW - 60000, 'claim', '7.2', { branch: 'pie-7-work' }),
    row('other', NOW - 30000, 'claim', '7.2', { branch: 'pie-7-work' }),
  ]
  const board = { ...boardOf(CHECKLIST, world({ rows })), self: 'me' }
  const slice = board.pies.find(p => p.n === 7)!.slices.find(s => s.id === '7.2')!
  expect([slice.holders, slice.sids.sort()]).toEqual([2, ['me', 'other']])
  expect(boardRows(board, CHECKLIST).some(line => line.startsWith('  7.2 building'))).toBe(true)
})

test('a whole-pie claim marks another pie active, and stays on the pie line after its session starts a slice', () => {
  const two: PassChecklist = {
    ...CHECKLIST,
    pies: [...CHECKLIST.pies, { n: 8, name: 'Eight', review: 'boundary', done: false, slices: [{ id: '8.1', name: 'First', done: false }] }],
  }
  const eight = [{ ...row('other', NOW - 60000, 'claim', null, { branch: 'pie-8-eight' }), pie: 8 }]
  const board = { ...boardOf(two, world({ rows: eight })), self: 'me' }
  expect(boardRows(board, two)).toEqual(['Board · 0 held elsewhere · 1 other pie active', '  Pie 8 Eight · 1 queued · pie claimed by session other'])
  const pieThenSlice = [row('other', NOW - 2 * 60000, 'claim', null, { branch: 'pie-7-whole' }), row('other', NOW - 60000, 'claim', '7.1', { branch: 'pie-7-whole' })]
  const seven = boardOf(CHECKLIST, world({ rows: pieThenSlice })).pies.find(p => p.n === 7)!
  expect(seven.pieHolders.map(h => [h.sid, h.branch])).toEqual([['other', 'pie-7-whole']])
  expect(seven.slices.find(s => s.id === '7.1')!.state).toBe('building')
})

test('squash-merged slices read merged: a squash subject naming the pie, or a merged PR of their commits branch', () => {
  const done: PassChecklist = { ...CHECKLIST, pies: [{ ...CHECKLIST.pies[1]!, done: true, slices: CHECKLIST.pies[1]!.slices.map(s => ({ ...s, done: true })) }] }
  const rows = [row('other', NOW - 5 * HOUR, 'commit', '7.2', { sha: 'orig001', branch: 'pie-7-seven' })]
  const squash = { base: 'origin/main', shas: ['sq1'], subjects: ['Pie 7: seven (#42)'] }
  expect(boardOf(done, world({ rows, base: squash })).pies).toEqual([])
  const viaPr = boardOf(done, world({ rows, base: { base: 'origin/main', shas: [], subjects: [] }, merged: [{ head: 'pie-7-seven', t: NOW - HOUR }] }), 'all')
  expect(viaPr.pies[0]!.slices.find(s => s.id === '7.2')!.state).toBe('merged')
})
