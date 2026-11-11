// mod/board.ts
// The project board: one view of every pie and slice shared by every chat, worktree and branch of a project. Derived on read from the ledger, git and gh (the same sources as the collision guard), never stored in a file; served by bts_board and drawn in the Pass pane.

import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import { ageWords, collisionsFor, readElsewhere } from './claims.ts'
import type { Elsewhere, Liveness, Party } from './claims.ts'
import { headsMatch } from './checks.ts'
import { slicesNamed } from './drift.ts'
import { activePie, refresh } from './projection.ts'
import type { PassBoard, PassBoardSlice, PassBoardState, PassChecklist } from './types'

export type { PassBoard, PassBoardSlice, PassBoardState } from './types'

const checklistAtom = atom({ plugin: 'bytheslice', key: 'pass.checklist' } as const, null)
const branchAtom = atom({ plugin: 'bytheslice', key: 'pass.branch' } as const, null)
const boardAtom = atom({ plugin: 'bytheslice', key: 'pass.board' } as const, null)

/** The pane's board is read again at most this often (git each time, gh cached a minute). */
export const BOARD_READ_MS = 30000
/** Board rows the pane shows for the active pie before it counts the rest. */
export const BOARD_SHOWN = 6
/** Pies bts_board lists in full; the rest get one line each. */
export const BOARD_PIES = 6

/** How far along each state is; a slice takes the furthest any holder reached. */
const RANK: Record<PassBoardState, number> = { queued: 0, claimed: 1, building: 2, built: 3, 'in review': 4, merged: 5 }

/** A state as the board prints it. */
export const STATE_WORDS: Record<PassBoardState, string> = {
  queued: 'queued',
  claimed: 'claimed',
  building: 'building',
  built: 'built, unmerged',
  'in review': 'in review',
  merged: 'merged',
}

/** The state one holder gives a slice. Pure. */
export function stateOf(party: Party, slice: string): PassBoardState {
  if (party.pr !== null) return 'in review'
  if (party.done.includes(slice) || party.commits > 0) return 'built'
  if (party.liveness === 'live' || (party.dirty !== null && party.dirty > 0)) return 'building'
  return 'claimed'
}

/**
 * Every pie's slices with their state, holder, PR, last activity and goal.
 * `merged` when nothing unmerged holds it and a ledger commit of the slice or a
 * subject naming it is on the default branch; otherwise the furthest any session, branch or PR took it
 * (`in review`, `built, unmerged`, `building`, `claimed`); `queued` when
 * nothing holds it. A slice the checklist marks done with nothing else known
 * reads `built, unmerged` until it reaches the default branch. Pure.
 */
export function boardOf(c: PassChecklist | null, world: Elsewhere, scope: 'open' | 'all' = 'open'): PassBoard {
  // Everyone's work, this session's included: a self no row or branch belongs to.
  const all: Elsewhere = { ...world, self: { sid: '', branch: null, worktree: '' } }
  const named = world.base ? slicesNamed(world.base.subjects) : new Set<string>()
  const onBase = (sha: unknown): boolean => typeof sha === 'string' && (world.base?.shas.some(merged => headsMatch(merged, sha)) ?? false)
  const merged = (id: string): boolean => named.has(id) || world.rows.some(row => row.ev === 'commit' && row.slice === id && onBase(row.data?.sha))
  const pies: PassBoard['pies'] = []
  for (const pie of c?.pies ?? []) {
    if (pie.slices.length === 0) continue
    if (scope === 'open' && pie.done && pie.slices.every(s => merged(s.id))) continue
    const found = collisionsFor(all, pie.n, pie.slices.map(s => s.id))
    const parties = [...found.conflicts, ...found.handoffs]
    const slices: PassBoardSlice[] = pie.slices.map(s => {
      // A slice's holders are the parties naming it; a claim on the pie as a whole shows on the pie line instead.
      const holding = parties
        .filter(p => p.slices.includes(s.id))
        .sort((a, b) => RANK[stateOf(b, s.id)] - RANK[stateOf(a, s.id)] || (b.lastT ?? 0) - (a.lastT ?? 0))
      // Merged once nothing unmerged holds it: one task on the default branch leaves the rest of the slice in play.
      if (holding.length === 0 && merged(s.id)) return { id: s.id, name: s.name, state: 'merged', holders: 0, holder: null, pr: null, lastT: null, goal: null, dirty: null, ahead: null }
      const best = holding[0] ?? null
      const own: PassBoardState = s.done ? 'built' : 'queued'
      const theirs = best === null ? own : stateOf(best, s.id)
      const state = RANK[theirs] >= RANK[own] ? theirs : own
      return {
        id: s.id,
        name: s.name,
        state,
        holders: new Set(holding.map(p => p.sid ?? p.branch)).size,
        holder: best === null ? null : { sid: best.sid, branch: best.branch, worktree: best.worktree, liveness: best.liveness },
        pr: best?.pr ?? null,
        lastT: best?.lastT ?? null,
        goal: best?.goal ?? null,
        dirty: best?.dirty ?? null,
        ahead: best?.ahead ?? null,
      }
    })
    const whole = parties
      .filter(p => p.pieLevel && p.slices.length === 0)
      .map(p => ({ sid: p.sid, branch: p.branch, worktree: p.worktree, liveness: p.liveness }))
    pies.push({ n: pie.n, name: pie.name, done: pie.done, slices, pieHolders: whole })
  }
  return { at: world.now, pies, prsChecked: world.prs !== null }
}

const sidWord = (sid: string): string => (sid.length <= 12 ? sid : `${sid.slice(0, 8)}…`)

function holderWords(slice: PassBoardSlice, self: string, now: number): string {
  const h = slice.holder
  const parts: string[] = []
  if (h !== null) {
    const who = h.sid === null ? null : h.sid === self ? 'this session' : `session ${sidWord(h.sid)}${livenessWord(h.liveness)}`
    if (who !== null) parts.push(who)
    if (h.branch !== null) parts.push(h.branch)
    if (h.worktree !== null) parts.push(h.worktree)
  }
  if (slice.dirty !== null && slice.dirty > 0) parts.push(`${slice.dirty} uncommitted`)
  if (slice.ahead !== null && slice.ahead > 0) parts.push(`${slice.ahead} unpushed`)
  if (slice.pr !== null) parts.push(`PR ${slice.pr.number}`)
  if (slice.lastT !== null) parts.push(ageWords(now - slice.lastT))
  if (slice.holders > 1) parts.push(`${slice.holders} holders`)
  if (slice.goal !== null) parts.push(`goal: ${slice.goal}`)
  return parts.join(' · ')
}

const livenessWord = (l: Liveness | null): string => (l === 'stale' ? ' (stale)' : l === 'idle' ? ' (idle)' : l === 'ended' ? ' (ended)' : '')

/** One slice row: `23.1 in review · session abc · pie-23-x · PR 251 · 1 h ago`. Pure. */
export function boardLine(slice: PassBoardSlice, self: string, now: number): string {
  const rest = slice.state === 'queued' || slice.state === 'merged' ? '' : holderWords(slice, self, now)
  return `${slice.id} ${STATE_WORDS[slice.state]}${rest === '' ? '' : ` · ${rest}`}`
}

/** A pie's counts in one line: `Pie 23 Video · 2 merged, 1 in review, 3 queued`. Pure. */
export function pieSummary(pie: PassBoard['pies'][number]): string {
  const counts = new Map<PassBoardState, number>()
  for (const s of pie.slices) counts.set(s.state, (counts.get(s.state) ?? 0) + 1)
  const order: PassBoardState[] = ['merged', 'in review', 'built', 'building', 'claimed', 'queued']
  const words = order.filter(st => counts.has(st)).map(st => `${counts.get(st)} ${STATE_WORDS[st]}`)
  const whole = pie.pieHolders.map(h => (h.sid !== null ? `session ${sidWord(h.sid)}${livenessWord(h.liveness)}` : null) ?? h.branch ?? 'unknown')
  return `Pie ${pie.n} ${pie.name} · ${words.join(', ')}${whole.length > 0 ? ` · pie claimed by ${whole.join(', ')}` : ''}`
}

/** The bts_board text: every listed pie with a line per slice, then one line per pie past the first few. Pure. */
export function boardText(board: PassBoard, self: string, onlyPie: number | null = null): string {
  const pies = onlyPie === null ? board.pies : board.pies.filter(p => p.n === onlyPie)
  if (pies.length === 0) return onlyPie === null ? 'Project board: no open pies.' : `Project board: no Pie ${onlyPie} in the checklist.`
  const lines = [`Project board · ${pies.length} pie${pies.length === 1 ? '' : 's'} · every chat, worktree and branch of this project`]
  for (const pie of pies.slice(0, BOARD_PIES)) {
    lines.push(pieSummary(pie))
    for (const slice of pie.slices) lines.push(`  ${boardLine(slice, self, board.at)}`)
  }
  for (const pie of pies.slice(BOARD_PIES)) lines.push(pieSummary(pie))
  if (!board.prsChecked) lines.push('Open PRs were not read (gh is unavailable), so no slice reads in review.')
  lines.push('Derived on read from the ledger, git and gh; nothing here is stored or refuses a step.')
  return lines.join('\n')
}

// ---- Reading and serving ---------------------------------------------------

let lastRead = Number.NEGATIVE_INFINITY

/** Forgets when the pane's board was last read (a new session, or a test). */
export function resetBoard(): void {
  lastRead = Number.NEGATIVE_INFINITY
}

async function nowOf($: EngineInterface): Promise<number> {
  try {
    return await $.clock.now()
  } catch {
    return Date.now()
  }
}

async function checklistOf($: EngineInterface): Promise<PassChecklist | null> {
  if ((await read($, checklistAtom).catch(() => null)) === null) await refresh($).catch(() => null)
  return read($, checklistAtom).catch(() => null)
}

/** Reads the board fresh; null outside a ByTheSlice project. Never throws. */
export async function readBoard($: EngineInterface, scope: 'open' | 'all' = 'open'): Promise<{ board: PassBoard; self: string } | null> {
  try {
    const c = await checklistOf($)
    if (c === null || c.layout !== 'pie') return null
    const branch = await read($, branchAtom).catch(() => null)
    const world = await readElsewhere($, branch === null ? {} : { branch })
    return { board: boardOf(c, world, scope), self: world.self.sid }
  } catch {
    return null
  }
}

/** The pulse's step: reads the board into `pass.board` at most every 30 seconds (`force` at session start). */
export async function pulseBoard($: EngineInterface, force = false): Promise<PassBoard | null> {
  const now = await nowOf($)
  if (!force && now - lastRead < BOARD_READ_MS) return null
  lastRead = now
  if ((await read($, checklistAtom).catch(() => null)) === null) return null
  const read_ = await readBoard($)
  if (read_ === null) return null
  const before = await read($, boardAtom).catch(() => null)
  const next = { ...read_.board, self: read_.self }
  if (JSON.stringify(before) !== JSON.stringify(next)) await update($, boardAtom, () => next).catch(() => undefined)
  return read_.board
}

export const BOARD_TOOL = 'bts_board'
export const BOARD_LISTED = 'mcp__bytheslice__bts_board'

const BOARD_DESCRIPTION = [
  'The project board: every open pie and slice of this ByTheSlice project across every chat, worktree and branch,',
  'each with its state (queued, claimed, building, built and unmerged, in review, merged), who holds it (session,',
  'branch, worktree), uncommitted and unpushed work, the open PR, last activity and the claim goal.',
  'Derived on read from the shared ledger, git and gh; read-only. Call it to learn what the other sessions are doing.',
].join(' ')

/** Registers bts_board with its schema in the prompt's tool list; resolves the listed name. */
export async function registerBoard($: EngineInterface): Promise<string> {
  const registered = await $.tool.register({
    name: BOARD_TOOL,
    description: BOARD_DESCRIPTION,
    inputSchema: {
      type: 'object',
      properties: {
        pie: { type: 'integer', minimum: 0, description: 'One pie only; every open pie when left out.' },
        scope: { type: 'string', enum: ['open', 'all'], description: 'open (default): pies with a slice not yet merged. all: every pie.' },
      },
      additionalProperties: false,
    },
    isDeferred: false,
  })
  return registered.tool
}

/** Serves bts_board. */
export async function serveBoard($: EngineInterface, input: Record<string, unknown>): Promise<string> {
  const scope = input.scope === 'all' ? 'all' : 'open'
  const pie = typeof input.pie === 'number' && Number.isSafeInteger(input.pie) && input.pie >= 0 ? input.pie : null
  const got = await readBoard($, pie === null ? scope : 'all')
  if (got === null) return 'Project board: no nested checklist at docs/plans/00_master_checklist.md, so there is no board.'
  await update($, boardAtom, () => ({ ...got.board, self: got.self })).catch(() => undefined)
  return boardText(got.board, got.self, pie)
}

/** The active pie's board rows for the pane: slices something holds, then a count of the rest. Pure. */
export function boardRows(board: (PassBoard & { self?: string }) | null, c: PassChecklist | null): string[] {
  if (board === null) return []
  const pie = activePie(c)
  const own = pie ? board.pies.find(p => p.n === pie.n) : undefined
  const held = own?.slices.filter(s => s.state !== 'queued' && s.state !== 'merged' && s.holder !== null && s.holder.sid !== (board.self ?? '')) ?? []
  const others = board.pies.filter(p => p.n !== pie?.n && p.slices.some(s => s.holder !== null && s.state !== 'merged'))
  if (held.length === 0 && others.length === 0) return []
  const rows = [`Board · ${held.length} held elsewhere${others.length > 0 ? ` · ${others.length} other pie${others.length === 1 ? '' : 's'} active` : ''}`]
  for (const slice of held.slice(0, BOARD_SHOWN)) rows.push(`  ${boardLine(slice, board.self ?? '', board.at)}`)
  if (held.length > BOARD_SHOWN) rows.push(`  and ${held.length - BOARD_SHOWN} more (bts_board lists them all)`)
  for (const pie of others.slice(0, 2)) rows.push(`  ${pieSummary(pie)}`)
  return rows
}
