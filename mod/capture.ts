// mod/capture.ts
// The Pass event capture: observe-only hooks that turn skills, verdicts, git results, turns, file edits (path and role, never content) and checklist flips into ledger rows.

import { atom, read, update } from 'claude-code'
import type {
  AgentSpawnInput,
  AgentSpawnResult,
  EngineInterface,
  ToolCallResult,
  TurnCompleteInput,
} from 'claude-code'

import { stripJsonc } from './jsonc.ts'
import { appendRow, readRows } from './ledger.ts'
import type { LedgerInput } from './ledger.ts'
import { gateOf, readActivity, rollup } from './ledger-projection.ts'
import { refreshLedger } from './live.ts'
import { activePie, activeSlice } from './projection.ts'
import { toastRow } from './toasts.ts'
import { relativePath } from './touched.ts'
import type { LedgerRow, PassAgentMark, PassChecklist, PassGate } from './types'

const checklistAtom = atom({ plugin: 'bytheslice', key: 'pass.checklist' } as const, null)
const limitedAtom = atom({ plugin: 'bytheslice', key: 'pass.limited' } as const, false)
const agentsAtom = atom({ plugin: 'bytheslice', key: 'pass.agents' } as const, {})

/** How many fix targets a verdict row keeps, and how long each may be. */
export const TARGETS_KEEP = 10
export const TARGET_MAX = 200
/** How much of a report the verdict parser reads. */
export const ANSWER_MAX = 200000
/** How many agent marks the spawn map keeps. */
export const MARKS_KEEP = 200

export type ParsedVerdict = {
  overall: 'pass' | 'fail' | 'unparsed'
  fixTargets: string[]
  rerun: string[]
  slice?: string
}

const oneLine = (value: string): string =>
  Array.from(value.replace(/[\r\n\t]+/g, ' ').trim()).slice(0, TARGET_MAX).join('')

/** The `P<pie> S<slice>` dispatch label a description starts with, or null. */
export function labelOf(text: unknown): { pie: number; slice: string } | null {
  if (typeof text !== 'string') return null
  const match = /^P(\d+) S(\d+\.\d+)/.exec(text.trim())
  return match ? { pie: Number(match[1]), slice: match[2] ?? '' } : null
}

/** The `feat(pie-N): N.M ...` attribution of a commit subject, or null. */
export function subjectOf(subject: unknown): { pie: number; slice: string } | null {
  if (typeof subject !== 'string') return null
  const match = /^\w+\(pie-(\d+)\):\s*(\d+\.\d+)\b/.exec(subject.trim())
  return match ? { pie: Number(match[1]), slice: match[2] ?? '' } : null
}

// Every balanced top-level `{...}` span that names "overall", last first.
function objectSpans(text: string): string[] {
  const spans: string[] = []
  for (let start = text.indexOf('{'); start !== -1; start = text.indexOf('{', start + 1)) {
    let depth = 0
    let inString = false
    let closed = false
    for (let i = start; i < text.length; i += 1) {
      const ch = text[i]
      if (inString) {
        if (ch === '\\') i += 1
        else if (ch === '"') inString = false
        continue
      }
      if (ch === '"') inString = true
      else if (ch === '{') depth += 1
      else if (ch === '}') {
        depth -= 1
        if (depth === 0) {
          const span = text.slice(start, i + 1)
          if (span.includes('"overall"')) spans.push(span)
          start = i
          closed = true
          break
        }
      }
    }
    // An object that never closes holds every later brace too: stop scanning.
    if (!closed) break
  }
  return spans.reverse()
}

const strings = (value: unknown): string[] =>
  Array.isArray(value)
    ? value
        .map(item => (typeof item === 'string' ? item : JSON.stringify(item) ?? ''))
        .filter(item => item !== '')
        .slice(0, TARGETS_KEEP)
        .map(oneLine)
    : []

const gatesOf = (value: unknown): string[] =>
  Array.isArray(value)
    ? value
        .map(item =>
          typeof item === 'string'
            ? item
            : item && typeof item === 'object' && typeof (item as { gate?: unknown }).gate === 'string'
              ? String((item as { gate: string }).gate)
              : '',
        )
        .filter(item => item !== '')
        .slice(0, 20)
        .map(oneLine)
    : []

// Agents drift to `FAIL` or `Pass`: the verdict word is read in any case.
const verdictOf = (value: unknown): 'pass' | 'fail' | undefined => {
  const word = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return word === 'pass' || word === 'fail' ? word : undefined
}

function fromObject(value: Record<string, unknown>): ParsedVerdict {
  const overall = verdictOf(value.overall) ?? 'unparsed'
  const slice = typeof value.slice === 'string' && /^\d+\.\d+$/.test(value.slice) ? value.slice : undefined
  return {
    overall,
    fixTargets: strings(value.fix_targets),
    rerun: gatesOf(value.rerun),
    ...(slice === undefined ? {} : { slice }),
  }
}

// A YAML block list under `key:` (`- "item"` lines), as the tester writes it.
function yamlList(text: string, key: string): string[] {
  const lines = text.split('\n')
  const at = lines.findIndex(line => new RegExp(`^\\s*${key}\\s*:\\s*$`).test(line))
  if (at === -1) return []
  const out: string[] = []
  for (const line of lines.slice(at + 1)) {
    const item = /^\s*-\s+(.*)$/.exec(line)
    if (!item) break
    const raw = (item[1] ?? '').trim().replace(/^["']|["']$/g, '')
    if (raw !== '') out.push(oneLine(raw))
    if (out.length >= TARGETS_KEEP) break
  }
  return out
}

/**
 * Reads a tester or verifier report for its verdict: the JSON (or JSONC)
 * object naming `overall`, else YAML `overall:` lines. Never throws; a report
 * it cannot read gives `overall: 'unparsed'`.
 */
export function parseVerdict(answer: unknown): ParsedVerdict {
  const text = typeof answer === 'string' ? answer.slice(0, ANSWER_MAX) : ''
  try {
    for (const span of objectSpans(text)) {
      try {
        const parsed: unknown = JSON.parse(stripJsonc(span))
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && 'overall' in parsed) {
          return fromObject(parsed as Record<string, unknown>)
        }
      } catch {
        // Not this span.
      }
    }
    const overall = verdictOf(/^\s*overall\s*:\s*["']?(pass|fail)\b/im.exec(text)?.[1])
    if (overall !== undefined) {
      const slice = /^\s*slice\s*:\s*["']?(\d+\.\d+)/im.exec(text)?.[1]
      return {
        overall,
        fixTargets: yamlList(text, 'fix_targets'),
        rerun: yamlList(text, 'rerun'),
        ...(slice === undefined ? {} : { slice }),
      }
    }
  } catch {
    // Falls through to unparsed.
  }
  return { overall: 'unparsed', fixTargets: [], rerun: [] }
}

export type GitIntent = { commit: boolean; push: boolean; merge: 'pr' | 'git' | null; pr: number | null }

// Shell segments split on control operators; quoting is not modeled, which only
// errs toward reading a quoted `git commit` as a command (the result decides).
function segments(command: string): string[][] {
  return command
    .split(/&&|\|\||[;|\n]/)
    .map(part => part.trim().split(/\s+/).filter(word => word !== ''))
    .filter(words => words.length > 0)
}

const GIT_OPTS_WITH_VALUE = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace'])

const WRAPPERS = new Set(['env', 'command', 'nice', 'time', 'exec', 'sudo'])

// The command word of a segment: past `(`, `VAR=value` assignments and wrappers.
function commandAt(words: string[]): number {
  let i = 0
  while (i < words.length) {
    const word = (words[i] ?? '').replace(/^\(+/, '')
    if (word === '' || /^[A-Za-z_][A-Za-z0-9_]*=/.test(word) || WRAPPERS.has(word)) i += 1
    else return i
  }
  return -1
}

const named = (word: string | undefined, name: string): boolean => {
  const bare = (word ?? '').replace(/^\(+/, '')
  return bare === name || bare.endsWith(`/${name}`)
}

function gitSubcommand(words: string[]): string | null {
  let i = commandAt(words)
  if (i === -1 || !named(words[i], 'git')) return null
  for (i += 1; i < words.length; i += 1) {
    const word = words[i] ?? ''
    if (GIT_OPTS_WITH_VALUE.has(word)) i += 1
    else if (!word.startsWith('-')) return word
  }
  return null
}

/** Which git or gh steps a Bash command takes: commit, push, a PR merge or a git merge. */
export function gitIntent(command: unknown): GitIntent {
  const intent: GitIntent = { commit: false, push: false, merge: null, pr: null }
  if (typeof command !== 'string') return intent
  for (const words of segments(command)) {
    const sub = gitSubcommand(words)
    if (sub === 'commit') intent.commit = true
    if (sub === 'push') intent.push = true
    if (sub === 'merge') intent.merge = intent.merge ?? 'git'
    const gh = commandAt(words)
    if (gh !== -1 && named(words[gh], 'gh')) {
      const rest = words.slice(gh + 1)
      const pr = rest.indexOf('pr')
      if (pr !== -1 && rest[pr + 1] === 'merge') {
        intent.merge = 'pr'
        const number = rest.slice(pr + 2).find(word => /^#?\d+$/.test(word))
        if (number) intent.pr = Number(number.replace('#', ''))
      }
    }
  }
  return intent
}

/** The structured git record core attaches to a Bash result, when it did. */
type GitOperation = {
  commit?: { sha?: string; kind?: string; branch?: string }
  push?: { branch?: string }
  branch?: { ref?: string; action?: string }
  pr?: { number?: number; action?: string }
}

async function isLimited($: EngineInterface): Promise<boolean> {
  try {
    return await read($, limitedAtom)
  } catch {
    return false
  }
}

async function checklistOf($: EngineInterface): Promise<PassChecklist | null> {
  try {
    return await read($, checklistAtom)
  } catch {
    return null
  }
}

// Capture runs only in a ByTheSlice project on a supported engine: a repo with
// no master checklist never gets a .bytheslice folder from a turn or a commit.
async function idle($: EngineInterface): Promise<boolean> {
  return (await isLimited($)) || (await checklistOf($)) === null
}

async function activeWhere($: EngineInterface): Promise<{ pie?: number; slice?: string }> {
  const c = await checklistOf($)
  const pie = activePie(c)
  const slice = activeSlice(c)
  return { ...(pie ? { pie: pie.n } : {}), ...(slice ? { slice: slice.id } : {}) }
}

async function git($: EngineInterface, argv: string[]): Promise<string | null> {
  try {
    const run = await $.process.run(['git', ...argv], { timeoutMs: 5000 })
    return run.exitCode === 0 ? run.stdout : null
  } catch {
    return null
  }
}

/** HEAD's sha, branch and the pie and slice its subject names; any part may be missing. */
async function headFacts($: EngineInterface): Promise<{ sha?: string; branch?: string; pie?: number; slice?: string }> {
  const out = await git($, ['log', '-1', '--format=%H%n%D%n%s'])
  if (out === null) return {}
  const [sha = '', refs = '', subject = ''] = out.split('\n')
  const branch = /HEAD -> ([^,\s]+)/.exec(refs)?.[1]
  const named = subjectOf(subject)
  return {
    ...(/^[0-9a-f]{7,64}$/.test(sha.trim()) ? { sha: sha.trim() } : {}),
    ...(branch ? { branch } : {}),
    ...(named ?? {}),
  }
}

/** Appends a row, then toasts it once and projects the ledger again. Resolves the row, or null. */
export async function record($: EngineInterface, row: LedgerInput): Promise<LedgerRow | null> {
  const written = await appendRow($, row)
  if (written) {
    await toastRow($, written)
    await refreshLedger($)
  }
  return written
}

/** `agent.spawn`, after `next`: keeps the started agent's type and its label's pie and slice; a teammate's address and name too. */
export async function markSpawn($: EngineInterface, e: AgentSpawnInput, result: AgentSpawnResult): Promise<void> {
  if (result.deny !== undefined || typeof result.agentId !== 'string' || (await isLimited($))) return
  const label = labelOf(e.description)
  const teammateId = typeof result.teammateId === 'string' && result.teammateId !== '' ? result.teammateId : null
  // A teammate bakes its own pie: only its label names it (else its first slice.started row does), never the active pie.
  const where: { pie?: number; slice?: string } = label ?? (teammateId === null ? await activeWhere($) : {})
  let at = Date.now()
  try {
    at = await $.clock.now()
  } catch {
    // Wall clock it is.
  }
  const name = typeof e.name === 'string' && e.name !== '' ? e.name : teammateId?.split('@')[0]
  const mark: PassAgentMark = {
    type: e.subagentType,
    pie: where.pie ?? null,
    slice: where.slice ?? null,
    at,
    ...(teammateId === null ? {} : { teammateId, ...(name ? { name } : {}) }),
  }
  const id = result.agentId
  await update($, agentsAtom, marks => {
    const kept = Object.entries(marks ?? {}).slice(-(MARKS_KEEP - 1))
    return { ...Object.fromEntries(kept), [id]: mark }
  }).catch(() => undefined)
}

async function typeOf($: EngineInterface, agentId: string): Promise<PassAgentMark | null> {
  const marks = await read($, agentsAtom).catch(() => ({}) as Record<string, PassAgentMark>)
  const mark = marks[agentId]
  if (mark) return mark
  try {
    const listed = (await $.agent.list()).find(agent => agent.id === agentId)
    return listed ? { type: listed.type, pie: labelOf(listed.description)?.pie ?? null, slice: labelOf(listed.description)?.slice ?? null, at: 0 } : null
  } catch {
    return null
  }
}

/** A tester or verifier report becomes one verdict row: gate, overall, fix targets, re-runs and HEAD. */
export async function captureVerdict($: EngineInterface, e: TurnCompleteInput): Promise<LedgerRow | null> {
  if (typeof e.agentId !== 'string') return null
  const mark = await typeOf($, e.agentId)
  const gate: PassGate | null = gateOf(mark?.type)
  if (!mark || !gate) return null
  const verdict = parseVerdict(e.answer)
  const head = (await git($, ['rev-parse', 'HEAD']))?.trim()
  const fallback = await activeWhere($)
  const slice = mark.slice ?? verdict.slice ?? fallback.slice
  const pie = mark.pie ?? (slice !== undefined ? Number(slice.split('.')[0]) : fallback.pie)
  return record($, {
    ev: 'verdict',
    ...(pie === undefined || Number.isNaN(pie) ? {} : { pie }),
    ...(slice === undefined ? {} : { slice }),
    aid: e.agentId,
    agent: mark.type,
    data: {
      gate,
      overall: verdict.overall,
      fix_targets: verdict.fixTargets,
      rerun: verdict.rerun,
      head: head && /^[0-9a-f]{7,64}$/.test(head) ? head : null,
    },
  })
}

/** A main-loop turn becomes one usage row: its id, duration, tokens, model and the session's cost so far. */
export async function captureUsage($: EngineInterface, e: TurnCompleteInput): Promise<LedgerRow | null> {
  if (e.agentId !== undefined) return null
  let costUsd: number | null = null
  try {
    const usd = (await $.session.usage()).cost?.usd
    costUsd = typeof usd === 'number' && Number.isFinite(usd) ? usd : null
  } catch {
    costUsd = null
  }
  const usage = e.usage
  return record($, {
    ev: 'usage',
    ...(await activeWhere($)),
    data: {
      turnId: e.turnId,
      durationMs: e.durationMs,
      tokens: usage
        ? {
            input_tokens: usage.input_tokens,
            output_tokens: usage.output_tokens,
            cache_read_input_tokens: usage.cache_read_input_tokens,
            cache_creation_input_tokens: usage.cache_creation_input_tokens,
          }
        : null,
      model: usage?.model ?? null,
      costUsd,
    },
  })
}

/** `turn.complete`, after `next`: a gate's report is a verdict, a main-loop turn is usage. */
export async function captureTurn($: EngineInterface, e: TurnCompleteInput): Promise<void> {
  if (await idle($)) return
  if (e.agentId === undefined) await captureUsage($, e)
  else await captureVerdict($, e)
}

/**
 * A Bash result, after `next`: a `git commit`, `git push`, `gh pr merge` or
 * `git merge` that ran without error becomes a row. A failed git read still
 * records the row, without a sha.
 */
export async function captureBash(
  $: EngineInterface,
  command: unknown,
  ran: ToolCallResult,
): Promise<LedgerRow[]> {
  if (ran.deny !== undefined || ran.isError === true || (await idle($))) return []
  const intent = gitIntent(command)
  if (!intent.commit && !intent.push && intent.merge === null) return []
  const result = (ran.result ?? {}) as { interrupted?: unknown; backgroundTaskId?: unknown; gitOperation?: GitOperation }
  if (result.interrupted === true || typeof result.backgroundTaskId === 'string') return []
  const op = result.gitOperation ?? {}
  const facts = await headFacts($)
  const active = await activeWhere($)
  const where = facts.slice !== undefined ? { pie: facts.pie, slice: facts.slice } : active
  const rows: LedgerRow[] = []
  const push = async (row: LedgerInput) => {
    const written = await record($, row)
    if (written) rows.push(written)
  }
  if (intent.commit) {
    // Core's record may carry an abbreviated sha: the full one wins when it extends it.
    const recorded = op.commit?.sha
    const sha = recorded === undefined || (facts.sha?.startsWith(recorded) ?? false) ? facts.sha ?? recorded : recorded
    const branch = op.commit?.branch ?? facts.branch
    await push({
      ev: 'commit',
      ...where,
      data: { ...(sha ? { sha } : {}), ...(branch ? { branch } : {}), ...(op.commit?.kind ? { kind: op.commit.kind } : {}) },
    })
  }
  if (intent.push) {
    const branch = op.push?.branch ?? facts.branch
    await push({ ev: 'push', ...where, data: { ...(facts.sha ? { sha: facts.sha } : {}), ...(branch ? { branch } : {}) } })
  }
  if (intent.merge !== null) {
    const pr = op.pr?.action === 'merged' && typeof op.pr.number === 'number' ? op.pr.number : intent.pr
    await push({
      ev: 'merge',
      ...active,
      data: {
        kind: intent.merge,
        ...(pr !== null ? { pr } : {}),
        ...(facts.branch ? { branch: facts.branch } : {}),
        ...(facts.sha ? { sha: facts.sha } : {}),
      },
    })
  }
  return rows
}

const BAKERS = /(^|:)(sell-pie|sell-slice)$/

/** The teammate a baker skill started in: its address and the pie its spawn label named. */
export type SkillBaker = { teammateId: string; pie: number | null }

/**
 * A `/sell-pie` or `/sell-slice` run (its skill prompt, its Skill tool call or
 * its typed command): records `pie.started` and `slice.started` for the active
 * pie and slice, each only the first time, so the three sources never double up.
 * Started in a teammate's loop (`baker`), it records that teammate's pie (its
 * spawn label's, else the active pie) and that pie's first open slice, each row
 * carrying `data.teammateId`; a slice already started by that teammate is not
 * recorded again.
 */
export async function captureSkill($: EngineInterface, name: unknown, baker: SkillBaker | null = null): Promise<LedgerRow[]> {
  if (typeof name !== 'string' || !BAKERS.test(name.trim()) || (await isLimited($))) return []
  const c = await checklistOf($)
  const own = baker?.pie == null ? null : c?.pies.find(entry => entry.n === baker.pie && entry.slices.some(s => !s.done)) ?? null
  const pie = own ?? activePie(c)
  const slice = own ? own.slices.find(s => !s.done) ?? null : activeSlice(c)
  if (!pie) return []
  const rows = await readRows($)
  const skill = name.trim().slice(name.trim().lastIndexOf(':') + 1)
  const who = baker ? { teammateId: baker.teammateId } : {}
  const out: LedgerRow[] = []
  if (!rows.some(row => row.ev === 'pie.started' && row.pie === pie.n)) {
    const written = await record($, { ev: 'pie.started', pie: pie.n, data: { skill, ...who } })
    if (written) out.push(written)
  }
  const started = (row: LedgerRow): boolean =>
    row.ev === 'slice.started' && row.slice === slice?.id && (baker === null || row.data?.teammateId === baker.teammateId)
  if (slice && !rows.some(started)) {
    // The head it starts at is where its touched files and replay count from.
    const head = (await git($, ['rev-parse', 'HEAD']))?.trim()
    const at = head && /^[0-9a-f]{7,64}$/.test(head) ? { head } : {}
    const written = await record($, { ev: 'slice.started', pie: pie.n, slice: slice.id, data: { skill, ...who, ...at } })
    if (written) out.push(written)
  }
  return out
}

/** Slice ids the checklist shows done now that it did not before. */
export function flipped(before: PassChecklist | null, after: PassChecklist | null): { pie: number; slice: string }[] {
  if (!before || !after) return []
  const was = new Set(before.pies.flatMap(pie => pie.slices.filter(slice => slice.done).map(slice => slice.id)))
  const known = new Set(before.pies.flatMap(pie => pie.slices.map(slice => slice.id)))
  return after.pies.flatMap(pie =>
    pie.slices.filter(slice => slice.done && !was.has(slice.id) && known.has(slice.id)).map(slice => ({ pie: pie.n, slice: slice.id })),
  )
}

/**
 * After a checklist refresh: each slice that flipped to done gets one
 * `slice.done` row (with its last slice-verifier verdict, if any) and one
 * `slice.rollup` row from the activity log, so history survives rotation.
 */
export async function recordDoneFlips(
  $: EngineInterface,
  before: PassChecklist | null,
  after: PassChecklist | null,
): Promise<LedgerRow[]> {
  const flips = flipped(before, after)
  if (flips.length === 0 || (await isLimited($))) return []
  const rows = await readRows($)
  const activity = await readActivity($)
  const out: LedgerRow[] = []
  for (const { pie, slice } of flips) {
    if (rows.some(row => row.ev === 'slice.done' && row.slice === slice)) continue
    const verifier = [...rows]
      .reverse()
      .find(row => row.ev === 'verdict' && row.slice === slice && row.data?.gate === 'slice-verifier')
    const done = await record($, {
      ev: 'slice.done',
      pie,
      slice,
      data: {
        verdict: verifier
          ? { overall: verifier.data?.overall ?? 'unparsed', head: verifier.data?.head ?? null, t: verifier.t }
          : null,
      },
    })
    if (done) out.push(done)
    const totals = rollup(activity, slice)
    const rolled = await record($, { ev: 'slice.rollup', pie, slice, data: totals })
    if (rolled) out.push(rolled)
  }
  return out
}

/**
 * An `Edit` or `Write` that ran without error becomes one `edit` row: the
 * workspace-relative path, the agent id and its role from the spawn map
 * (`main` for the main loop) and the tool. Never the file's content, the old
 * or new string, or the result. A path outside the workspace is not recorded.
 * Appended without a projection read, since edits come often.
 */
export async function captureEdit(
  $: EngineInterface,
  e: { file_path?: unknown; agentId?: string | undefined },
  tool: string,
  ran: ToolCallResult,
): Promise<LedgerRow | null> {
  if (ran.deny !== undefined || ran.isError === true || (await idle($))) return null
  let cwd = '.'
  try {
    cwd = await $.session.cwd()
  } catch {
    // Relative paths still record.
  }
  const path = relativePath(e.file_path, cwd)
  if (path === null) return null
  const aid = typeof e.agentId === 'string' && e.agentId !== '' ? e.agentId : undefined
  const mark = aid === undefined ? null : await typeOf($, aid)
  const agent = mark ? mark.type.slice(mark.type.lastIndexOf(':') + 1) : aid === undefined ? 'main' : 'agent'
  const active = await activeWhere($)
  const slice = mark?.slice ?? active.slice
  const pie = mark?.pie ?? (slice !== undefined ? Number(slice.split('.')[0]) : active.pie)
  return appendRow($, {
    ev: 'edit',
    ...(pie === undefined || pie === null || Number.isNaN(pie) ? {} : { pie }),
    ...(slice === undefined ? {} : { slice }),
    ...(aid === undefined ? {} : { aid }),
    agent,
    data: { path, ...(aid === undefined ? {} : { aid }), agent, tool },
  })
}
