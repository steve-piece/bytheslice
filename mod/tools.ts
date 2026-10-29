// mod/tools.ts
// The model's view of the Pass: bts_status (the same facts the pane shows, open HITL items and the team roster included), bts_note (a decision note in the ledger), bts_pr_body (the pie PR's evidence section from scripts/ledger-summary.js), and bts_hitl's and bts_wake's registration.

import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import { record } from './capture.ts'
import { registerHitl } from './hitl.ts'
import { ledgerPath } from './ledger.ts'
import { FIX_CAP, findSlice, lastVerdict } from './ledger-projection.ts'
import { activePie, activeSlice, allDone, boxReady, counts, refresh } from './projection.ts'
import { runningFor } from './rail.tsx'
import { driftLine, readDrift } from './drift.ts'
import type { StatusDrift } from './drift.ts'
import { mismatchLine } from './reconcile.ts'
import { bakersWord } from './team.ts'
import type { PassBaker, PassChecklist, PassHitlItem, PassLive, PassProjection, PassSliceView, PassTeam } from './types'
import { registerWake } from './wake.ts'

const checklistAtom = atom({ plugin: 'bytheslice', key: 'pass.checklist' } as const, null)
const ledgerAtom = atom({ plugin: 'bytheslice', key: 'pass.ledger' } as const, null)
const liveAtom = atom({ plugin: 'bytheslice', key: 'pass.live' } as const, { at: 0, agents: [] })
const branchAtom = atom({ plugin: 'bytheslice', key: 'pass.branch' } as const, null)
const toolsAtom = atom({ plugin: 'bytheslice', key: 'pass.tools' } as const, [])
const teamAtom = atom({ plugin: 'bytheslice', key: 'pass.team' } as const, { at: 0, bakers: [] })

export const STATUS_TOOL = 'bts_status'
export const NOTE_TOOL = 'bts_note'
export const PR_BODY_TOOL = 'bts_pr_body'
/** The shared ledger fold under the plugin root. */
export const SUMMARY_SCRIPT = 'scripts/ledger-summary.js'
export const NOTE_MAX = 2000
export const STATUS_LINES = 40
/** Open HITL items bts_status lists one by one before it counts the rest. */
export const STATUS_HITL = 3
/** Bakers bts_status lists one by one before it counts the rest. */
export const STATUS_BAKERS = 4

/** The names a session lists the tools under (`mcp__<plugin>__<name>`); register.tsx matches them. */
export const STATUS_LISTED = 'mcp__bytheslice__bts_status'
export const NOTE_LISTED = 'mcp__bytheslice__bts_note'
export const PR_BODY_LISTED = 'mcp__bytheslice__bts_pr_body'

const STATUS_DESCRIPTION = [
  'The Pass status for this ByTheSlice project: the active pie and slice, each slice of the pie with its status',
  '(queued, building, testing, verifying, fixing, done) and last verdicts, live agents, the fix loop as n/3,',
  'open HITL questions, the agent team roster (team: n bakers) in team mode, checklist and ledger mismatches,',
  'and the next expected action.',
  'Call it at every phase boundary instead of re-reading docs/plans/00_master_checklist.md.',
  'It reports facts from the ledger and the kitchen activity log; it never halts or refuses anything.',
].join(' ')

const NOTE_DESCRIPTION = [
  'Appends a free-form decision note to the Pass ledger (.bytheslice/ledger.jsonl) for a slice (the active one when',
  `slice is left out). Text past ${NOTE_MAX} characters is cut. Never put a secret, a credential or a prompt in a note.`,
  'Returns ok once the note is recorded.',
].join(' ')

const PR_BODY_DESCRIPTION = [
  'The pie PR evidence section, generated from the Pass ledger by scripts/ledger-summary.js: a Markdown slice table',
  '(verifier verdict at commit, tester verdict, fix loops, models, duration, cost), one warnings line per check code,',
  'HITL waits and the decision notes. pie defaults to the active pie. Write the output into the PR body under',
  '## Evidence after the --fill content; it is generated, so never edit it by hand. Read-only: it changes nothing.',
].join(' ')

/** Registers bts_status, bts_note, bts_pr_body, bts_hitl and bts_wake with their schemas in the prompt's tool list; resolves the listed names. */
export async function registerTools($: EngineInterface): Promise<string[]> {
  const listed: string[] = []
  const status = await $.tool.register({
    name: STATUS_TOOL,
    description: STATUS_DESCRIPTION,
    inputSchema: {
      type: 'object',
      properties: {
        scope: {
          type: 'string',
          enum: ['active', 'all'],
          description: 'active (default): the active pie only. all: every pie, one line each, plus the active pie.',
        },
      },
      additionalProperties: false,
    },
    isDeferred: false,
  })
  listed.push(status.tool)
  const note = await $.tool.register({
    name: NOTE_TOOL,
    description: NOTE_DESCRIPTION,
    inputSchema: {
      type: 'object',
      properties: {
        slice: { type: 'string', description: 'The slice id, N.M; the active slice when left out.' },
        text: { type: 'string', description: `The note, up to ${NOTE_MAX} characters.` },
      },
      required: ['text'],
      additionalProperties: false,
    },
    isDeferred: false,
  })
  listed.push(note.tool)
  const prBody = await $.tool.register({
    name: PR_BODY_TOOL,
    description: PR_BODY_DESCRIPTION,
    inputSchema: {
      type: 'object',
      properties: { pie: { type: 'integer', minimum: 0, description: 'The pie number; the active pie when left out.' } },
      additionalProperties: false,
    },
    isDeferred: false,
  })
  listed.push(prBody.tool)
  listed.push(await registerHitl($))
  listed.push(await registerWake($))
  await update($, toolsAtom, () => listed).catch(() => undefined)
  return listed
}

const gateWord = (gate: string): string => (gate === 'slice-tester' ? 'tester' : 'verifier')

/** One open HITL item as bts_status lists it: id, category, slice, age and the question on one short line. */
export function hitlStatusLine(item: PassHitlItem, now: number): string {
  const question = Array.from(item.question.replace(/\s+/g, ' ').trim())
  const shown = question.length <= 100 ? question.join('') : `${question.slice(0, 99).join('').trimEnd()}…`
  return `${item.id} ${item.category}${item.slice === null ? '' : ` ${item.slice}`} ${runningFor(now - item.t)}: ${shown}`
}

/** A slice's status word: `fixing (1/3)` while fixing, else the plain word. */
export function statusWord(view: PassSliceView): string {
  return view.status === 'fixing' ? `fixing (${view.fixLoop}/${FIX_CAP})` : view.status
}

function verdictWords(view: PassSliceView): string {
  return view.verdicts
    .map(v => `${gateWord(v.gate)} ${v.overall}${v.head ? ` ${v.head.slice(0, 7)}` : ''}${v.overall === 'fail' ? ` (${v.fixTargets.length} target${v.fixTargets.length === 1 ? '' : 's'})` : ''}`)
    .join(' · ')
}

function sliceLine(view: PassSliceView, isActive: boolean): string {
  const parts = [`${isActive ? '>' : ' '} ${view.id} ${statusWord(view)}`]
  if (view.fixLoop > 0 && view.status !== 'fixing') parts.push(`fix ${view.fixLoop}/${FIX_CAP}`)
  const verdicts = verdictWords(view)
  if (verdicts !== '') parts.push(verdicts)
  if (view.commits.length > 0) parts.push(`${view.commits.length} commit${view.commits.length === 1 ? '' : 's'}`)
  return parts.join(' · ')
}

/** The next expected action, a fact to act on; it gates nothing. */
export function nextAction(c: PassChecklist | null, p: PassProjection | null, branch: string | null = null): string {
  if (!c) return 'no checklist yet: run /cook-pizzas to plan the pies'
  if (c.layout === 'stage') return 'v4 checklist: /sell-slice serves one stage at a time, or /cook-pizzas --repie'
  if (allDone(c)) return boxReady(c, branch) ? '/box-it-up ready' : 'all pies done; nothing left to box'
  const pie = activePie(c)
  const slice = activeSlice(c)
  if (!pie || !slice) return 'no open slice in the checklist'
  const view = findSlice(p, slice.id)
  const status = view?.status ?? 'queued'
  const verifier = view?.verdicts.find(v => v.gate === 'slice-verifier')
  if (status === 'queued') return `start Slice ${slice.id} (/sell-pie, or /sell-slice for a careful slice)`
  if (status === 'building') return `finish the build of Slice ${slice.id}, then run slice-tester`
  if (status === 'testing') return `wait for slice-tester on Slice ${slice.id}, then run slice-verifier`
  if (status === 'fixing') {
    return (view?.fixLoop ?? 0) >= FIX_CAP
      ? `fix loop at ${FIX_CAP}/${FIX_CAP} on Slice ${slice.id}: raise a prd_ambiguity HITL question`
      : `dispatch fix-attempter on the fix targets of Slice ${slice.id}, then re-verify`
  }
  if (verifier?.overall === 'pass') return `flip Slice ${slice.id} to [x] and commit feat(pie-${pie.n}): ${slice.id} ${slice.name}`
  return `wait for slice-verifier on Slice ${slice.id}`
}

/** One baker as bts_status lists it: address, pie, status, turns and how long since its last activity. */
export function bakerLine(baker: PassBaker, now: number): string {
  const pie = baker.pie === null ? 'no pie yet' : `Pie ${baker.pie}`
  const turns = `${baker.turns} turn${baker.turns === 1 ? '' : 's'}`
  return `${baker.teammateId} · ${pie} · ${baker.status} · ${turns} · last ${runningFor(now - baker.lastT)} ago`
}

function liveWords(live: PassLive, p: PassProjection | null, now: number): string {
  if (live.at > 0) {
    // Teammates are listed under team: below, not as live agents.
    const running = live.agents.filter(
      a => a.teammateId === undefined && (a.status === 'running' || a.status === 'pending' || a.status === 'waiting'),
    )
    if (running.length === 0) return 'none'
    return running.map(a => `${a.role} ${a.status} ${runningFor(now - a.startedAt)}`).join(', ')
  }
  const fromLog = p?.live ?? []
  if (fromLog.length === 0) return 'none'
  return fromLog.map(a => `${a.role}${a.slice ? ` ${a.slice}` : ''} ${runningFor(now - a.startedAt)}`).join(', ')
}

/**
 * The bts_status text, under 40 lines: active pie and slice, each slice's
 * status and last verdicts, live agents, fix loop, open HITL, mismatches, next.
 */
export function statusReport(
  view: {
    checklist: PassChecklist | null
    projection: PassProjection | null
    live: PassLive
    branch: string | null
    now: number
    team?: PassTeam
    drift?: readonly StatusDrift[]
  },
  scope: 'active' | 'all' = 'active',
): string {
  const { checklist: c, projection: p, live, branch, now } = view
  const bakers = view.team?.bakers ?? []
  const lines: string[] = []
  if (!c) {
    lines.push('The Pass: no checklist at docs/plans/00_master_checklist.md.')
  } else if (c.layout === 'stage') {
    lines.push('The Pass: a v4 checklist (## Stage N); the Pass reads nested pies only.')
  } else {
    const pie = activePie(c)
    const slice = activeSlice(c)
    const pv = pie ? p?.pies.find(x => x.n === pie.n) ?? null : null
    const sv = slice ? findSlice(p, slice.id) : null
    lines.push(
      pie && slice
        ? `The Pass · Pie ${pie.n} ${pie.name} · Slice ${slice.id} ${slice.name}${sv ? ` · ${statusWord(sv)}` : ''}`
        : 'The Pass · every pie is done',
    )
    const { done, total } = counts(c)
    lines.push(
      [branch ? `branch ${branch}` : null, pie ? `${done} of ${total} slices done` : null, pie ? `review ${pie.review}` : null]
        .filter(Boolean)
        .join(' · ') || 'no active pie',
    )
    if (scope === 'all') {
      lines.push('Pies:')
      const pies = c.pies.slice(0, 12)
      for (const x of pies) {
        const d = x.slices.filter(s => s.done).length
        lines.push(`  Pie ${x.n} ${x.name} · ${x.done ? 'done' : 'open'} · ${d}/${x.slices.length} slices`)
      }
      if (c.pies.length > pies.length) lines.push(`  and ${c.pies.length - pies.length} more pies`)
    }
    if (pie) {
      lines.push(`Slices of Pie ${pie.n}:`)
      const views = pv?.slices ?? []
      for (const s of pie.slices) {
        const found = views.find(x => x.id === s.id)
        lines.push(found ? sliceLine(found, s.id === slice?.id) : `${s.id === slice?.id ? '>' : ' '} ${s.id} ${s.done ? 'done' : 'queued'}`)
      }
    }
    const failed = lastVerdict(sv)
    if (sv && failed && failed.overall === 'fail' && failed.fixTargets.length > 0) {
      lines.push(`Fix targets (${sv.id}, ${failed.gate}):`)
      for (const target of failed.fixTargets.slice(0, 5)) lines.push(`  - ${target}`)
      if (failed.fixTargets.length > 5) lines.push(`  and ${failed.fixTargets.length - 5} more`)
    }
    lines.push(`Fix loop: ${sv?.fixLoop ?? 0}/${FIX_CAP}`)
  }
  lines.push(`Live agents: ${liveWords(live, p, now)}`)
  if (bakers.length > 0) {
    lines.push(`team: ${bakersWord(bakers.length)} (teammates, one pie each; bts_wake wakes an idle one after a delay)`)
    for (const baker of bakers.slice(0, STATUS_BAKERS)) lines.push(`  - ${bakerLine(baker, now)}`)
    if (bakers.length > STATUS_BAKERS) lines.push(`  and ${bakers.length - STATUS_BAKERS} more (the pane lists them all)`)
  }
  const open = p?.hitl?.open ?? []
  if (open.length === 0) lines.push('Open HITL: none')
  else {
    lines.push(`Open HITL: ${open.length} (oldest first; answer with bts_hitl { id, answer })`)
    for (const item of open.slice(0, STATUS_HITL)) lines.push(`  - ${hitlStatusLine(item, now)}`)
    if (open.length > STATUS_HITL) lines.push(`  and ${open.length - STATUS_HITL} more (the pane lists them all)`)
  }
  const mismatches = (p?.mismatches ?? []).filter(m => m.kind === 'done-without-pass')
  if (mismatches.length === 0) lines.push('Mismatches: none')
  else {
    lines.push(`Mismatches: ${mismatches.length}`)
    for (const m of mismatches.slice(0, 4)) lines.push(`  - ${mismatchLine(m)}`)
    if (mismatches.length > 4) lines.push(`  and ${mismatches.length - 4} more (pass reconcile lists them all)`)
  }
  const drift = view.drift ?? []
  if (drift.length > 0) {
    lines.push(`Status drift: ${drift.length} (checklist against ${drift[0]?.base ?? 'the default branch'})`)
    for (const d of drift.slice(0, 4)) lines.push(`  - ${driftLine(d)}`)
    if (drift.length > 4) lines.push(`  and ${drift.length - 4} more`)
  }
  lines.push(`Next: ${nextAction(c, p, branch)}`)
  lines.push('These are facts from the ledger; nothing here halts or refuses a step.')
  if (lines.length > STATUS_LINES) {
    const tail = lines.slice(-6)
    return [...lines.slice(0, STATUS_LINES - tail.length - 1), '  (cut to fit)', ...tail].join('\n')
  }
  return lines.join('\n')
}

async function nowOf($: EngineInterface): Promise<number> {
  try {
    return await $.clock.now()
  } catch {
    return Date.now()
  }
}

/**
 * Serves bts_status from the atoms and the projection, plus one read of the
 * default branch for status drift. A checklist the atom does not hold yet is
 * read once more first, so a call that beat the first refresh (or ran in a
 * worktree before the primary checkout was found) does not say there is none.
 */
export async function serveStatus($: EngineInterface, input: Record<string, unknown>): Promise<string> {
  if ((await read($, checklistAtom)) === null) await refresh($).catch(() => null)
  const [checklist, projection, live, branch, team, now] = await Promise.all([
    read($, checklistAtom),
    read($, ledgerAtom),
    read($, liveAtom),
    read($, branchAtom),
    read($, teamAtom),
    nowOf($),
  ])
  const scope = input.scope === 'all' ? 'all' : 'active'
  const drift = await readDrift($, checklist, projection, branch).catch(() => [])
  return statusReport({ checklist, projection, live, branch, now, team, drift }, scope)
}

/** Serves bts_note: appends one note row (text cut to 2,000 characters) and answers `ok`. */
export async function serveNote($: EngineInterface, input: Record<string, unknown>): Promise<string> {
  const raw = typeof input.text === 'string' ? input.text.trim() : ''
  if (raw === '') return 'not recorded: text is required'
  const text = Array.from(raw).slice(0, NOTE_MAX).join('')
  const c = await read($, checklistAtom).catch(() => null)
  const named = typeof input.slice === 'string' && /^\d+\.\d+$/.test(input.slice.trim()) ? input.slice.trim() : undefined
  const slice = named ?? activeSlice(c)?.id
  const pie = slice !== undefined ? Number(slice.split('.')[0]) : activePie(c)?.n
  const row = await record($, {
    ev: 'note',
    ...(pie === undefined ? {} : { pie }),
    ...(slice === undefined ? {} : { slice }),
    data: { text, ...(Array.from(raw).length > NOTE_MAX ? { cut: true } : {}) },
  })
  return row ? 'ok' : 'not recorded: the ledger could not be written'
}

/**
 * Serves bts_pr_body: the output of `node <plugin root>/scripts/ledger-summary.js
 * --pie <n> --format pr-body`, or one line naming what is missing (node, the
 * ledger, a pie). Read-only; it never writes the PR itself.
 */
export async function servePrBody($: EngineInterface, input: Record<string, unknown>): Promise<string> {
  const given = typeof input.pie === 'number' && Number.isSafeInteger(input.pie) && input.pie >= 0 ? input.pie : null
  const c = await read($, checklistAtom).catch(() => null)
  const pie = given ?? activePie(c)?.n ?? null
  if (pie === null) return 'bts_pr_body: no pie named and no active pie in the checklist; call it with { pie: <n> }.'
  let ledger: string
  try {
    ledger = await ledgerPath($)
  } catch {
    return 'bts_pr_body: the ledger path could not be resolved, so there is no evidence section; open the PR without it.'
  }
  if (!(await $.fs.exists(ledger).catch(() => false))) {
    return `bts_pr_body: no ledger at ${ledger}; this pie was baked without the Pass, so the PR has no evidence section.`
  }
  let cwd = '.'
  try {
    cwd = await $.session.cwd()
  } catch {
    // The script resolves the ledger from the process directory.
  }
  const script = `${$.plugin.root.replace(/\/$/, '')}/${SUMMARY_SCRIPT}`
  try {
    const run = await $.process.run(['node', script, '--root', cwd, '--pie', String(pie), '--format', 'pr-body'], { cwd, timeoutMs: 20000 })
    if (run.exitCode === 127) return 'bts_pr_body: node was not found on PATH, so the evidence section could not be generated; open the PR without it.'
    if (run.exitCode !== 0) {
      const why = run.stderr.trim().split('\n')[0] ?? ''
      return `bts_pr_body: ${SUMMARY_SCRIPT} exited ${run.exitCode}${why === '' ? '' : ` (${why})`}; open the PR without the evidence section.`
    }
    return run.stdout.trimEnd()
  } catch {
    return 'bts_pr_body: node could not be started, so the evidence section could not be generated; open the PR without it.'
  }
}
