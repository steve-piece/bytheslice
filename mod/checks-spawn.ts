// mod/checks-spawn.ts
// The Pass spawn policy as warnings: a model outside the role's tiers, a reviewer prompt carrying builder context, and a run that drifted to another tier.

import { atom, read, update } from 'claude-code'
import type { AgentSpawnInput, EngineInterface, TurnCompleteInput } from 'claude-code'

import { labelOf } from './capture.ts'
import { checksOn } from './checks.ts'
import type { Finding } from './checks.ts'
import { CONTEXT_ROLES, PROMPT_MAX, tierAllowed } from './policy.ts'
import type { PassPolicy, PassSpawnTrack } from './types'

const spawnsAtom = atom({ plugin: 'bytheslice', key: 'pass.spawns' } as const, {})

/** How many tracked spawns the drift check keeps. */
export const SPAWNS_KEEP = 200

/** The role of an agent type: `bytheslice:slice-tester` reads `slice-tester`; another plugin's type stays whole. */
export function roleOf(subagentType: unknown): string {
  if (typeof subagentType !== 'string') return ''
  return subagentType.startsWith('bytheslice:') ? subagentType.slice('bytheslice:'.length) : subagentType
}

const tiers = (allowed: readonly string[]): string => allowed.join(' or ')

/** The spawn's model when it names one; `inherit` and an empty value leave the choice to the definition. */
export function givenModel(model: unknown): string | null {
  if (typeof model !== 'string') return null
  const trimmed = model.trim()
  return trimmed === '' || trimmed.toLowerCase() === 'inherit' ? null : trimmed
}

/** A spawn's identity before it has an agent id: its Agent call, and its place in a workflow run. */
export function spawnKey(e: Pick<AgentSpawnInput, 'tool_use_id' | 'workflow'>): string {
  return `${e.tool_use_id}#${e.workflow?.agentIndex ?? ''}`
}

/** The first configured marker the prompt holds (case-insensitive), or null. */
export function markerIn(prompt: string, markers: readonly string[]): string | null {
  const text = prompt.toLowerCase()
  return markers.find(marker => marker !== '' && text.includes(marker.toLowerCase())) ?? null
}

/** What a spawn's judgment gave: its findings, and whether its model is checked again at its first turn's end. */
export type SpawnJudgment = { findings: Finding[]; track: Omit<PassSpawnTrack, 'at'> | null }

type SpawnFacts = Pick<
  AgentSpawnInput,
  'tool_use_id' | 'prompt' | 'subagentType' | 'model' | 'parentAgentId' | 'isTeammate' | 'resume' | 'workflow'
> & { description?: string }

/**
 * Judges a spawn against the role table: `model-policy` when it names a model
 * outside the role's tiers, `builder-context` when a tester, verifier or
 * reviewer prompt carries a marker or runs past 20,000 characters. A spawn
 * that names no model (or an allowed one) is tracked for the drift check.
 * Teammates (5.6) and resumed runs are left alone. Pure.
 */
export function judgeSpawn(e: SpawnFacts, policy: Pick<PassPolicy, 'roles' | 'contextMarkers'>): SpawnJudgment {
  if (e.isTeammate === true || e.resume !== undefined) return { findings: [], track: null }
  const role = roleOf(e.subagentType)
  const key = spawnKey(e)
  const slice = labelOf(e.description)?.slice ?? null
  const where = slice === null ? {} : { slice }
  const findings: Finding[] = []
  const allowed = policy.roles[role]
  const given = givenModel(e.model)
  let track: SpawnJudgment['track'] = null
  if (allowed !== undefined && allowed.length > 0) {
    if (given !== null && !tierAllowed(given, allowed)) {
      findings.push({
        code: 'model-policy',
        ...where,
        key,
        text: `${role} was spawned on ${given}; the role table allows ${tiers(allowed)}. The spawn went ahead on the model it named.`,
      })
    } else {
      track = { role, given, parent: e.parentAgentId ?? null, slice }
    }
  }
  if (CONTEXT_ROLES.has(role)) {
    const prompt = typeof e.prompt === 'string' ? e.prompt : ''
    const marker = markerIn(prompt, policy.contextMarkers)
    const long = prompt.length > PROMPT_MAX
    if (marker !== null || long) {
      const why = marker !== null ? `it holds "${marker}"` : `it runs ${prompt.length} characters, past ${PROMPT_MAX}`
      findings.push({
        code: 'builder-context',
        ...where,
        key,
        text: `the ${role} prompt carries builder context (${why}); verify-once gives it only the manifest, the Exit criteria and the design-system path. The agent still runs.`,
      })
    }
  }
  return { findings, track }
}

/** Judges a spawn before it starts, from the policy atom alone. */
export async function checkSpawn($: EngineInterface, e: SpawnFacts): Promise<SpawnJudgment> {
  const policy = await checksOn($)
  if (!policy) return { findings: [], track: null }
  return judgeSpawn(e, policy)
}

/** After a spawn started: keeps it for the drift check at its first turn's end. */
export async function trackSpawn(
  $: EngineInterface,
  agentId: string | undefined,
  track: SpawnJudgment['track'],
): Promise<void> {
  if (typeof agentId !== 'string' || !track) return
  let at = Date.now()
  try {
    at = await $.clock.now()
  } catch {
    // Wall clock it is.
  }
  await update($, spawnsAtom, spawns => {
    const kept = Object.entries(spawns ?? {}).slice(-(SPAWNS_KEEP - 1))
    return { ...Object.fromEntries(kept), [agentId]: { ...track, at } }
  }).catch(() => undefined)
}

/** `model-drift` when a tracked agent's turn ran on a model outside its role's tiers. Pure. */
export function judgeDrift(
  agentId: string,
  track: PassSpawnTrack,
  usedModel: string,
  policy: Pick<PassPolicy, 'roles'>,
): Finding | null {
  const allowed = policy.roles[track.role]
  if (allowed === undefined || allowed.length === 0 || tierAllowed(usedModel, allowed)) return null
  const asked = track.given === null ? 'it named no model' : `it named ${track.given}`
  return {
    code: 'model-drift',
    ...(track.slice === null ? {} : { slice: track.slice }),
    key: agentId,
    text: `${track.role} ran on ${usedModel} (${asked}); the role table allows ${tiers(allowed)}. Nothing was changed.`,
  }
}

/**
 * At a subagent's turn end: a tracked spawn's model is compared with its
 * role's tiers once, then forgotten. Resolves the finding and the loop to tell.
 */
export async function checkDrift(
  $: EngineInterface,
  e: Pick<TurnCompleteInput, 'agentId' | 'usage'>,
): Promise<{ findings: Finding[]; parent: string | null }> {
  const none = { findings: [], parent: null }
  const agentId = e.agentId
  const used = e.usage?.model
  if (typeof agentId !== 'string' || typeof used !== 'string' || used === '') return none
  const spawns = await read($, spawnsAtom).catch(() => ({}) as Record<string, PassSpawnTrack>)
  const track = spawns[agentId]
  if (!track) return none
  await update($, spawnsAtom, all => {
    const { [agentId]: _gone, ...rest } = all ?? {}
    return rest
  }).catch(() => undefined)
  const policy = await checksOn($)
  if (!policy) return none
  const found = judgeDrift(agentId, track, used, policy)
  return { findings: found ? [found] : [], parent: track.parent }
}
