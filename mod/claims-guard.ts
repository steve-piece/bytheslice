// mod/claims-guard.ts
// The collision guard's hooks: at a /sell-pie or /sell-slice start it reads the other work on the pie and, when there is any, warns (a warn row, a toast, the band) and tells the model to raise a blocking HITL before it cuts a branch; bts_claim's tool call. It never refuses a start.

import { atom, read } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import { GATE_STEP, collisionLines, collisionsFor, openSlices, readElsewhere, resetClaims as resetPrs, serveClaim } from './claims.ts'
import { checksOn, reportToModel } from './checks.ts'
import type { Finding } from './checks.ts'
import { activePie, refresh } from './projection.ts'

const checklistAtom = atom({ plugin: 'bytheslice', key: 'pass.checklist' } as const, null)

/** The warning code a start on other work reports under. */
export const COLLISION_CODE = 'session-collision'
/** The three sources of one start (skill prompt, Skill tool, typed command) read the other work once. */
export const GUARD_WINDOW_MS = 30000

const BAKERS = /(^|:)(sell-pie|sell-slice)$/

let guarded: { pie: number; t: number } | null = null

async function nowOf($: EngineInterface): Promise<number> {
  try {
    return await $.clock.now()
  } catch {
    return Date.now()
  }
}

/** The finding a start on other work reports: the facts, one per line, and the step to take. Pure. */
export function collisionFinding(pie: number, lines: readonly string[], slice?: string): Finding {
  return {
    code: COLLISION_CODE,
    key: `${pie}:${lines.join('|')}`,
    ...(slice === undefined ? {} : { slice }),
    text: `other work is already on Pie ${pie}: ${lines.map(line => `(${line})`).join(' ')}. ${GATE_STEP}`,
  }
}

/**
 * At a baker skill's start: reads the other work on its pie (a teammate's
 * own pie when given) and reports it as a `session-collision` warning the
 * model reads as a hidden note. Resolves the lines, or null when there were
 * none, checks are off, or another source of the same start already ran.
 */
export async function guardStart(
  $: EngineInterface,
  name: unknown,
  agentId: string | null,
  teammatePie: number | null = null,
): Promise<string[] | null> {
  if (typeof name !== 'string' || !BAKERS.test(name.trim().replace(/^\//, ''))) return null
  if ((await checksOn($)) === null) return null
  const c = await read($, checklistAtom).catch(() => null)
  const pie = teammatePie === null ? activePie(c) : c?.pies.find(x => x.n === teammatePie) ?? null
  if (!pie) return null
  const now = await nowOf($)
  if (guarded && guarded.pie === pie.n && now - guarded.t < GUARD_WINDOW_MS) return null
  guarded = { pie: pie.n, t: now }
  const open = openSlices(c, pie.n)
  const world = await readElsewhere($)
  const lines = collisionLines(collisionsFor(world, pie.n, open), world.now)
  if (lines.length === 0) return null
  await reportToModel($, [collisionFinding(pie.n, lines, open[0])], agentId)
  return lines
}

/** Serves bts_claim from the checklist atom (read once more when it is empty). */
export async function serveClaimTool($: EngineInterface, input: Record<string, unknown>): Promise<string> {
  if ((await read($, checklistAtom).catch(() => null)) === null) await refresh($).catch(() => null)
  const c = await read($, checklistAtom).catch(() => null)
  return serveClaim($, input, c, activePie(c)?.n ?? null)
}

/** Forgets the last guarded start and the cached PR list (a new session, or a test). */
export function resetClaims(): void {
  resetPrs()
  guarded = null
}
