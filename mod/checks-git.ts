// mod/checks-git.ts
// Pass checks that warn and never block: a fix-attempter (or ci-fix-attempter) past its cap of 3, and a git commit or push on main.

import { atom, read, update } from 'claude-code'
import type { AgentSpawnInput, EngineInterface } from 'claude-code'

import { gitIntent, labelOf } from './capture.ts'
import { checksOn } from './checks.ts'
import type { Finding } from './checks.ts'
import { CI_FIX_CAP, FIX_CAP, findSlice } from './ledger-projection.ts'
import { activePie, activeSlice } from './projection.ts'
import type { PassChecklist, PassFixCounts, PassProjection } from './types'

const checklistAtom = atom({ plugin: 'bytheslice', key: 'pass.checklist' } as const, null)
const ledgerAtom = atom({ plugin: 'bytheslice', key: 'pass.ledger' } as const, null)
const branchAtom = atom({ plugin: 'bytheslice', key: 'pass.branch' } as const, null)
const countsAtom = atom({ plugin: 'bytheslice', key: 'pass.fixCounts' } as const, { fix: {}, ci: {} })

const MAINS: ReadonlySet<string> = new Set(['main', 'master'])
const HITL = "only the operator's explicit reply at the HITL raises it"

/** Which fix loop a spawn joins, and the counter it bumps once it started. */
export type FixSpawn = { kind: 'fix' | 'ci'; key: string; attempt: number }

/** The fix loop an agent type belongs to: `ci` for ci-fix-attempter, `fix` for fix-attempter, else null. */
export function fixKind(subagentType: unknown): FixSpawn['kind'] | null {
  if (typeof subagentType !== 'string') return null
  if (subagentType.endsWith('ci-fix-attempter')) return 'ci'
  if (subagentType.endsWith('fix-attempter')) return 'fix'
  return null
}

/** The pie a branch name carries (`pie-5-the-pass`, `pie/5`), or null. */
export function branchPie(branch: string | null): number | null {
  const match = /(^|\/)pie[-/](\d+)/.exec(branch ?? '')
  return match ? Number(match[2]) : null
}

/** What the fix-loop check reads. */
export type FixView = {
  checklist: PassChecklist | null
  ledger: PassProjection | null
  branch: string | null
  counts: PassFixCounts
}

/**
 * Which attempt a fix spawn is: the slice (from its `P<pie> S<slice>` label,
 * else the active slice) or, for ci-fix-attempter, the pie (label, branch,
 * active pie), and the larger of what the activity log and this session
 * counted, plus one. Null for any other spawn. Pure.
 */
export function fixSpawnOf(e: Pick<AgentSpawnInput, 'subagentType' | 'description'>, view: FixView): FixSpawn | null {
  const kind = fixKind(e.subagentType)
  if (kind === null) return null
  if (kind === 'fix') {
    const slice = labelOf(e.description)?.slice ?? activeSlice(view.checklist)?.id
    if (slice === undefined) return null
    const logged = findSlice(view.ledger, slice)?.fixLoop ?? 0
    return { kind, key: slice, attempt: Math.max(logged, view.counts.fix[slice] ?? 0) + 1 }
  }
  const labelled = /^P(\d+)\b/.exec(typeof e.description === 'string' ? e.description.trim() : '')?.[1]
  const pie = labelled !== undefined ? Number(labelled) : branchPie(view.branch) ?? activePie(view.checklist)?.n
  if (pie === undefined) return null
  const logged = view.ledger?.pies.find(entry => entry.n === pie)?.ciFixLoop ?? 0
  return { kind, key: String(pie), attempt: Math.max(logged, view.counts.ci[String(pie)] ?? 0) + 1 }
}

/** `fix-loop-cap` for attempt 4 or later of a slice's fix loop, or round 4 of a pie's CI fixes. Pure. */
export function judgeFixCap(spawn: FixSpawn | null): Finding | null {
  if (!spawn) return null
  if (spawn.kind === 'fix') {
    if (spawn.attempt <= FIX_CAP) return null
    return {
      code: 'fix-loop-cap',
      slice: spawn.key,
      key: `fix|${spawn.key}|${spawn.attempt}`,
      text: `fix-attempter attempt ${spawn.attempt} of cap ${FIX_CAP} on Slice ${spawn.key}; ${HITL}. The spawn went ahead.`,
    }
  }
  if (spawn.attempt <= CI_FIX_CAP) return null
  return {
    code: 'fix-loop-cap',
    key: `ci|${spawn.key}|${spawn.attempt}`,
    text: `ci-fix-attempter round ${spawn.attempt} of cap ${CI_FIX_CAP} on Pie ${spawn.key}; ${HITL}. The spawn went ahead.`,
  }
}

/** Judges a spawn before it starts, from atoms: the fix-loop cap. Resolves the spawn's loop and any finding. */
export async function checkFixSpawn(
  $: EngineInterface,
  e: Pick<AgentSpawnInput, 'subagentType' | 'description'>,
): Promise<{ spawn: FixSpawn | null; findings: Finding[] }> {
  if (fixKind(e.subagentType) === null || !(await checksOn($))) return { spawn: null, findings: [] }
  const [checklist, ledger, branch, counts] = await Promise.all([
    read($, checklistAtom),
    read($, ledgerAtom),
    read($, branchAtom),
    read($, countsAtom),
  ])
  const spawn = fixSpawnOf(e, { checklist, ledger, branch, counts })
  const found = judgeFixCap(spawn)
  return { spawn, findings: found ? [found] : [] }
}

/** After a fix spawn started: this session's counter for its slice or pie moves to its attempt. */
export async function countFix($: EngineInterface, spawn: FixSpawn | null): Promise<void> {
  if (!spawn) return
  await update($, countsAtom, counts => {
    const current = counts ?? { fix: {}, ci: {} }
    const table = { ...current[spawn.kind], [spawn.key]: Math.max(current[spawn.kind][spawn.key] ?? 0, spawn.attempt) }
    return { ...current, [spawn.kind]: table }
  }).catch(() => undefined)
}

// `git -C <path>` or `cd <path>` before the git step: the target's branch may not be the session's.
const ELSEWHERE = /\bgit(?:\s+-c\s+\S+)*\s+-C\s+\S|(^|[;&|(\n]\s*)cd\s+\S/

/**
 * `commit-on-main` for a `git commit` or `git push` while the session's branch
 * is main or master. A command that changes directory first is judged by the
 * session's branch all the same, and says it is best effort. Pure.
 */
export function judgeCommitOnMain(command: unknown, branch: string | null): Finding | null {
  const intent = gitIntent(command)
  if ((!intent.commit && !intent.push) || branch === null || !MAINS.has(branch)) return null
  const verb = intent.commit && intent.push ? 'git commit and git push' : intent.commit ? 'git commit' : 'git push'
  const elsewhere =
    typeof command === 'string' && ELSEWHERE.test(command)
      ? " Best effort: the command changes directory first, so the Pass read the session's branch, not the target's."
      : ''
  return {
    code: 'commit-on-main',
    key: `${branch}|${verb}`,
    text: `A ${verb} ran while this session is on ${branch}; ByTheSlice commits and pushes on a pie branch.${elsewhere} The command went ahead.`,
  }
}

/** Judges a Bash command before it runs: a commit or push on main. Atoms only. */
export async function checkCommitOnMain($: EngineInterface, command: unknown): Promise<Finding[]> {
  const intent = gitIntent(command)
  if (!intent.commit && !intent.push) return []
  if (!(await checksOn($))) return []
  const found = judgeCommitOnMain(command, await read($, branchAtom))
  return found ? [found] : []
}
