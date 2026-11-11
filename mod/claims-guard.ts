// mod/claims-guard.ts
// The collision guard's hooks: at a /sell-pie or /sell-slice start it resolves the pie the run is on, reads the other work on it, writes this session's claim (a contested one while other work is there) and warns (a warn row, a toast, the band, a note telling the model to raise a blocking HITL before it cuts a branch); the same check runs again at the first file write or commit of a stretch of work, so a session resumed from a plain message is checked too; bts_claim's tool call. It never refuses anything.

import { atom, read } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import {
  GATE_STEP,
  checkScope,
  collisionLines,
  collisionsFor,
  holdsClaim,
  holdsWork,
  openSlices,
  readElsewhere,
  resetClaims as resetSources,
  runTarget,
  serveClaim,
  writeClaim,
} from './claims.ts'
import { checksOn, reportToModel } from './checks.ts'
import type { Finding } from './checks.ts'
import { isLimited, refresh } from './projection.ts'
import type { PassChecklist } from './types'

const checklistAtom = atom({ plugin: 'bytheslice', key: 'pass.checklist' } as const, null)
const branchAtom = atom({ plugin: 'bytheslice', key: 'pass.branch' } as const, null)

/** The warning code a start or a write on other work reports under. */
export const COLLISION_CODE = 'session-collision'
/** The three sources of one start (skill prompt, Skill tool, typed command) read the other work once per pie and loop. */
export const GUARD_WINDOW_MS = 30000
/** A write or commit checks again once this long has passed since this session's last successful check. */
export const WORK_CHECK_MS = 30 * 60 * 1000

const BAKERS = /(^|:)(sell-pie|sell-slice)$/
const COMMIT = /\bgit\b(?:\s+-C\s+\S+)?[^;&|]*\bcommit\b/

const guarded = new Map<string, number>()
let lastCheck = Number.NEGATIVE_INFINITY
// A Skill tool call's arguments, held while it runs: its nested skill prompt fires before the call returns.
let pending: { skill: string; arg: unknown } | null = null

/** Before a Skill tool call runs: holds its arguments for the skill prompt it raises. */
export function notePendingStart(skill: unknown, arg: unknown): void {
  const bare = bakerSkill(skill)
  pending = bare === null ? null : { skill: bare, arg }
}

/** The arguments of the Skill tool call now running for this skill, or undefined. */
export function pendingArg(skill: unknown): unknown {
  const bare = bakerSkill(skill)
  return bare !== null && pending?.skill === bare ? pending.arg : undefined
}

/** After the Skill tool call: forgets its arguments. */
export function clearPendingStart(): void {
  pending = null
}

async function nowOf($: EngineInterface): Promise<number> {
  try {
    return await $.clock.now()
  } catch {
    return Date.now()
  }
}

/** The bare baker skill a name or typed command names (`sell-pie`, `sell-slice`), or null. Pure. */
export function bakerSkill(name: unknown): 'sell-pie' | 'sell-slice' | null {
  if (typeof name !== 'string') return null
  const m = BAKERS.exec(name.trim().replace(/^\//, ''))
  return m ? (m[2] as 'sell-pie' | 'sell-slice') : null
}

/** The finding other work reports: the facts, one per line, and the step to take. Pure. */
export function collisionFinding(pie: number, lines: readonly string[], slice?: string | null, agentId: string | null = null): Finding {
  return {
    code: COLLISION_CODE,
    // Keyed by loop too, so a teammate starting on the same pie within the minute still gets its own note.
    key: `${pie}:${agentId ?? 'main'}:${lines.join('|')}`,
    ...(slice === undefined || slice === null ? {} : { slice }),
    text: `other work is already on Pie ${pie}: ${lines.map(line => `(${line})`).join(' ')}. ${GATE_STEP}`,
  }
}

async function checklistOf($: EngineInterface): Promise<PassChecklist | null> {
  return read($, checklistAtom).catch(() => null)
}

/**
 * At a baker skill's start: resolves the pie and slice the run is on (its
 * argument, its branch, this session's claims, else the active pie; a
 * teammate's own pie when given), reads the other work, writes this session's
 * claims for the pie (`/sell-pie`) and the slice, contested when other work is
 * there, and reports that work as a `session-collision` warning the model reads
 * as a hidden note. A `/sell-slice` start is checked for its slice only.
 * Resolves `{ lines }` (empty when nothing else is there), or null when the
 * engine is limited or another source of the same start already read them;
 * the caller marks the start rows it writes contested when lines are found.
 */
export async function guardStart(
  $: EngineInterface,
  name: unknown,
  agentId: string | null,
  opts: { teammatePie?: number | null; arg?: unknown } = {},
): Promise<{ lines: string[] } | null> {
  const skill = bakerSkill(name)
  if (skill === null || (await isLimited($))) return null
  const c = await checklistOf($)
  if (c === null || c.layout !== 'pie') return null
  const now = await nowOf($)
  const world = await readElsewhere($)
  const target =
    opts.teammatePie != null
      ? { pie: opts.teammatePie, slice: c.pies.find(x => x.n === opts.teammatePie)?.slices.find(s => !s.done)?.id ?? null }
      : runTarget(c, { arg: opts.arg, branch: world.self.branch, rows: world.rows, sid: world.self.sid })
  if (target === null) return null
  const key = `${target.pie}|${agentId ?? 'main'}`
  const last = guarded.get(key)
  if (last !== undefined && now - last < GUARD_WINDOW_MS) return null
  const scope = skill === 'sell-slice' && target.slice !== null ? [target.slice] : openSlices(c, target.pie)
  const found = collisionsFor(world, target.pie, scope)
  const lines = collisionLines(found, world.now)
  // The start is a claim every other session reads, unless other work is there: then it is intent only.
  const ids: (string | null)[] = [...(skill === 'sell-pie' ? [null] : []), ...(target.slice !== null ? [target.slice] : [])]
  for (const id of ids) {
    if (holdsClaim(world.rows, world.self.sid, target.pie, id)) continue
    await writeClaim($, {
      pie: target.pie,
      ...(id === null ? {} : { slice: id }),
      skill,
      branch: world.self.branch,
      worktree: world.self.worktree,
      auto: true,
      contested: lines.length > 0,
    })
  }
  guarded.set(key, now)
  lastCheck = now
  if (lines.length > 0 && (await checksOn($)) !== null) await reportToModel($, [collisionFinding(target.pie, lines, target.slice, agentId)], agentId)
  return { lines }
}

/** True for a Bash command that commits. Pure. */
export const isCommit = (command: unknown): boolean => typeof command === 'string' && COMMIT.test(command)

/**
 * Before a file write or a commit: once per half hour of work, reads the other
 * work on the pie this session is on and returns it as a finding the tool
 * result carries. Skipped while this session holds the slice and has work on
 * it (it is the one already building). Resolves no findings outside a
 * ByTheSlice project, with checks off, or when nothing else is there.
 */
export async function guardWork($: EngineInterface): Promise<Finding[]> {
  if ((await checksOn($)) === null) return []
  const now = await nowOf($)
  if (now - lastCheck < WORK_CHECK_MS) return []
  const c = await checklistOf($)
  if (c === null || c.layout !== 'pie') return []
  const branch = await read($, branchAtom).catch(() => null)
  const world = await readElsewhere($, branch === null ? {} : { branch })
  lastCheck = now
  const target = runTarget(c, { branch: world.self.branch, rows: world.rows, sid: world.self.sid })
  if (target === null || holdsWork(world.rows, world.self.sid, target.pie, target.slice)) return []
  const lines = collisionLines(collisionsFor(world, target.pie, checkScope(c, world.rows, world.self.sid, target)), world.now)
  return lines.length === 0 ? [] : [collisionFinding(target.pie, lines, target.slice)]
}

/** Serves bts_claim from the checklist atom (read once more when it is empty). */
export async function serveClaimTool($: EngineInterface, input: Record<string, unknown>): Promise<string> {
  if ((await checklistOf($)) === null) await refresh($).catch(() => null)
  const c = await checklistOf($)
  const answer = await serveClaim($, input, c)
  lastCheck = await nowOf($)
  return answer
}

/** Forgets the guard marks, the cached PR list and the git snapshot (a new session, or a test). */
export function resetClaims(): void {
  resetSources()
  guarded.clear()
  pending = null
  lastCheck = Number.NEGATIVE_INFINITY
}
