// mod/checks-checklist.ts
// Pass checks on typed tool input that warn and never block: a slice marked [x] without a verdict, a push of an unverified done slice, a plan write during sell-slice.

import { atom, read } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import { gitIntent } from './capture.ts'
import { checklistText, isChecklistPath } from './projection.ts'
import { parseChecklist } from './checklist.ts'
import { checksOn, headsMatch, short } from './checks.ts'
import type { Finding } from './checks.ts'
import { findSlice } from './ledger-projection.ts'
import type { PassChecklist, PassPolicy, PassProjection, PassSliceView, PassVerdict } from './types'

const checklistAtom = atom({ plugin: 'bytheslice', key: 'pass.checklist' } as const, null)
const ledgerAtom = atom({ plugin: 'bytheslice', key: 'pass.ledger' } as const, null)
const headAtom = atom({ plugin: 'bytheslice', key: 'pass.head' } as const, null)
const branchAtom = atom({ plugin: 'bytheslice', key: 'pass.branch' } as const, null)
const skillAtom = atom({ plugin: 'bytheslice', key: 'pass.activeSkill' } as const, null)

/** Slice types that want a slice-tester pass before `[x]` under the default policy. */
export const UI_TYPES: ReadonlySet<string> = new Set(['frontend', 'full-stack'])
/**
 * The skills during which slice plans stay static: sell-slice alone, as
 * hooks/stage-plan-guard.sh has it. sell-pie appends build notes to stage
 * files by design, so a plan write there is normal and silent.
 */
export const BAKERS: ReadonlySet<string> = new Set(['sell-slice'])

const PLAN_PATH = /(^|[\\/])docs[\\/]plans[\\/]stage_[^\\/]*$/
const PIE_BRANCH = /(^|\/)pie[-/]\d+/

/** What an Edit or a Write does to a file's text. */
export type FileChange = { kind: 'write'; content: string } | { kind: 'edit'; old: string; next: string; all: boolean }

/** A slice the change marks done that was open before, with its type when the checklist names one. */
export type Flip = { id: string; type?: string }

/** The change an Edit or Write input makes, or null for an input without the text. */
export function changeOf(e: Record<string, unknown>): FileChange | null {
  if (typeof e.content === 'string') return { kind: 'write', content: e.content }
  if (typeof e.old_string === 'string' && typeof e.new_string === 'string') {
    return { kind: 'edit', old: e.old_string, next: e.new_string, all: e.replace_all === true }
  }
  return null
}

const doneMap = (c: PassChecklist | null): Map<string, boolean> =>
  new Map((c?.pies ?? []).flatMap(pie => pie.slices.map(slice => [slice.id, slice.done] as const)))

const typeOf = (c: PassChecklist | null, id: string): string | undefined => {
  for (const pie of c?.pies ?? []) {
    const found = pie.slices.find(slice => slice.id === id)
    if (found) return found.type
  }
  return undefined
}

// A slice heading or a Prep line, and the box it carries.
const SLICE_LINE = /^\s*(?:#{2,3}\s+(?:\[[ xX-]\]\s*)?(?:~~)?Slice\s+(\d+\.\d+)\b|(?:-\s*)?\[[ xX]\]\s+Slice\s+(\d+\.\d+)\b)/i

/** Each slice heading or Prep line in a piece of checklist text: its id and whether its box reads `[x]`. */
export function boxMarks(text: string): Map<string, boolean> {
  const marks = new Map<string, boolean>()
  for (const line of text.split(/\r?\n/)) {
    const match = SLICE_LINE.exec(line)
    const id = match?.[1] ?? match?.[2]
    if (id !== undefined) marks.set(id, /\[[xX]\]/.test(line))
  }
  return marks
}

// Boxes ticked in `after` that were open in `before`; a slice `before` does not
// show counts when the checklist atom has it open.
function ticked(before: Map<string, boolean>, after: Map<string, boolean>, was: Map<string, boolean>): string[] {
  const ids: string[] = []
  for (const [id, checked] of after) {
    const open = before.has(id) ? before.get(id) === false : was.get(id) === false
    if (checked && open) ids.push(id)
  }
  return ids
}

// Slices the parse of `after` reads done that the parse of `before` read open (a Status line, a struck heading).
const parsedDone = (before: PassChecklist | null, after: PassChecklist): string[] => {
  const was = doneMap(before)
  return after.pies.flatMap(pie => pie.slices.filter(slice => slice.done && was.get(slice.id) === false).map(slice => slice.id))
}

/**
 * The slices a change to the checklist marks done that were open: a heading or
 * Prep box ticked from `[ ]` to `[x]`, or a slice the parser now reads done. A
 * Write is read whole; an Edit is applied to the text the last refresh read
 * (held in memory), and when that text no longer holds `old_string` it is
 * judged from its own lines. Pure.
 */
export function flipsOf(change: FileChange, text: string | null, checklist: PassChecklist | null): Flip[] {
  const was = doneMap(checklist)
  const ids: string[] = []
  let after: PassChecklist | null = null
  if (change.kind === 'write') {
    after = parseChecklist(change.content)
    ids.push(...ticked(text === null ? new Map() : boxMarks(text), boxMarks(change.content), was))
    ids.push(...parsedDone(text === null ? checklist : parseChecklist(text), after))
  } else {
    ids.push(...ticked(boxMarks(change.old), boxMarks(change.next), was))
    if (change.old !== '' && text !== null && text.includes(change.old)) {
      const edited = change.all ? text.split(change.old).join(change.next) : text.replace(change.old, () => change.next)
      after = parseChecklist(edited)
      // The whole lines around the edit, for an old_string cut mid-line.
      ids.push(...ticked(boxMarks(text), boxMarks(edited), was))
      ids.push(...parsedDone(parseChecklist(text), after))
    }
  }
  const flips: Flip[] = []
  for (const id of new Set(ids)) {
    const type = typeOf(after, id) ?? typeOf(checklist, id)
    flips.push({ id, ...(type === undefined ? {} : { type }) })
  }
  return flips
}

const latest = (view: PassSliceView | null, gate: PassVerdict['gate']): PassVerdict | null =>
  view?.verdicts.find(verdict => verdict.gate === gate) ?? null

/** True when the slice's latest slice-verifier verdict passed at this HEAD. */
export function verifiedAt(view: PassSliceView | null, head: string | null): boolean {
  const verifier = latest(view, 'slice-verifier')
  return verifier?.overall === 'pass' && headsMatch(verifier.head, head)
}

function verdictReason(view: PassSliceView | null, head: string | null): string {
  const verifier = latest(view, 'slice-verifier')
  if (!verifier) return 'with no slice-verifier verdict in the ledger'
  if (verifier.overall !== 'pass') return `while its latest slice-verifier verdict is ${verifier.overall}`
  if (head === null) return 'while the Pass does not know HEAD, so its slice-verifier pass cannot be matched to it'
  return `with its slice-verifier pass at ${short(verifier.head)}, not at HEAD ${short(head)}`
}

/** What the checkbox check reads: the checklist, the ledger projection, HEAD and the policy. */
export type CheckboxView = {
  checklist: PassChecklist | null
  ledger: PassProjection | null
  head: string | null
  policy: Pick<PassPolicy, 'requireTester'>
}

/** Whether a slice of this type wants a slice-tester pass before `[x]`. */
export function needsTester(type: string | undefined, mode: PassPolicy['requireTester']): boolean {
  if (mode === 'always') return true
  if (mode === 'never') return false
  return type !== undefined && UI_TYPES.has(type)
}

/**
 * Findings for slices marked done: `checkbox-without-verdict` unless the
 * slice-verifier passed at HEAD, and `checkbox-without-tester` for a slice that
 * wants a tester pass and has none. Pure.
 */
export function judgeFlips(flips: readonly Flip[], view: CheckboxView): Finding[] {
  const findings: Finding[] = []
  for (const flip of flips) {
    const slice = findSlice(view.ledger, flip.id)
    if (!verifiedAt(slice, view.head)) {
      findings.push({
        code: 'checkbox-without-verdict',
        slice: flip.id,
        key: flip.id,
        text: `Slice ${flip.id} was marked [x] ${verdictReason(slice, view.head)}. The edit went through; run slice-verifier at HEAD before marking a slice done.`,
      })
    }
    const type = flip.type ?? typeOf(view.checklist, flip.id)
    const tester = latest(slice, 'slice-tester')
    if (needsTester(type, view.policy.requireTester) && tester?.overall !== 'pass') {
      const kind = type === undefined ? 'this slice' : `a ${type} slice`
      const seen = tester ? ` (its latest slice-tester verdict is ${tester.overall})` : ''
      findings.push({
        code: 'checkbox-without-tester',
        slice: flip.id,
        key: flip.id,
        text: `Slice ${flip.id} was marked [x] with no slice-tester pass in the ledger${seen}; ${kind} wants one. The edit went through.`,
      })
    }
  }
  return findings
}

/** The plan path from `docs/plans/` on, as the finding names it. */
const planName = (path: string): string => {
  const cut = path.replace(/\\/g, '/').lastIndexOf('docs/plans/')
  return cut === -1 ? path : path.slice(cut)
}

/** `plan-write-during-bake` for a write under docs/plans/stage_ while sell-slice runs (not sell-pie). Pure. */
export function judgePlanWrite(path: unknown, skill: string | null): Finding | null {
  if (typeof path !== 'string' || !PLAN_PATH.test(path) || skill === null || !BAKERS.has(skill)) return null
  const name = planName(path)
  return {
    code: 'plan-write-during-bake',
    key: name,
    text: `${name} changed while ${skill} runs; slice plans stay static during delivery (cook-pizzas and special-order change them). The write went through.`,
  }
}

/** The slice whose ledger commits hold this HEAD, or null when no commit row names it. */
export function sliceAtHead(ledger: PassProjection | null, head: string | null): PassSliceView | null {
  if (!ledger || head === null) return null
  for (const pie of ledger.pies) {
    for (const slice of pie.slices) if (slice.commits.some(sha => headsMatch(sha, head))) return slice
  }
  return null
}

/**
 * `push-slice-done-unverified` for a `git push` on a pie branch whose HEAD is a
 * commit of a slice already marked done without a slice-verifier pass at that
 * HEAD. A push mid-slice (HEAD a commit of an open slice) is normal and silent. Pure.
 */
export function judgePush(
  command: unknown,
  view: { branch: string | null; head: string | null; ledger: PassProjection | null },
): Finding | null {
  if (!gitIntent(command).push || view.branch === null || !PIE_BRANCH.test(view.branch)) return null
  const slice = sliceAtHead(view.ledger, view.head)
  if (!slice || !slice.done || verifiedAt(slice, view.head)) return null
  return {
    code: 'push-slice-done-unverified',
    slice: slice.id,
    key: `${slice.id}|${short(view.head)}`,
    text: `This push carries Slice ${slice.id}, marked [x] ${verdictReason(slice, view.head)}. The push went ahead.`,
  }
}

const inputOf = (e: unknown): Record<string, unknown> =>
  e !== null && typeof e === 'object' ? (e as Record<string, unknown>) : {}

/**
 * Judges an Edit or Write before it runs, from atoms and the checklist text
 * held in memory: the checkbox checks on the master checklist, the plan-write
 * check under docs/plans/stage_. Never reads the disk or runs a process.
 */
export async function checkFileWrite($: EngineInterface, e: unknown): Promise<Finding[]> {
  const input = inputOf(e)
  const path = input.file_path
  if (typeof path !== 'string') return []
  const isPlan = PLAN_PATH.test(path)
  const isChecklist = isChecklistPath(path)
  if (!isPlan && !isChecklist) return []
  const policy = await checksOn($)
  if (!policy) return []
  if (isPlan) {
    const found = judgePlanWrite(path, await read($, skillAtom))
    return found ? [found] : []
  }
  const change = changeOf(input)
  if (!change) return []
  const [checklist, ledger, head] = await Promise.all([read($, checklistAtom), read($, ledgerAtom), read($, headAtom)])
  return judgeFlips(flipsOf(change, checklistText(), checklist), { checklist, ledger, head, policy })
}

/** Judges a Bash command before it runs: a push of an unverified done slice. Atoms only. */
export async function checkPush($: EngineInterface, command: unknown): Promise<Finding[]> {
  if (!gitIntent(command).push) return []
  if (!(await checksOn($))) return []
  const [branch, head, ledger] = await Promise.all([read($, branchAtom), read($, headAtom), read($, ledgerAtom)])
  const found = judgePush(command, { branch, head, ledger })
  return found ? [found] : []
}
