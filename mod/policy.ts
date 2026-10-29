// mod/policy.ts
// The Pass check, spawn and watchdog policy, and the enforcement mode: role defaults mirroring each agent's model frontmatter, the watchdog thresholds, the bytheslice.config.json reader and override notes.

import type { EngineInterface } from 'claude-code'

import { stripJsonc } from './jsonc.ts'
import { appendRow, readRows } from './ledger.ts'
import type { PassEnforcement, PassPolicy, PassRequireTester, PassWatchdog } from './types'

// No runtime import from 'claude-code' here: tests/pass/policy-parity.test.js
// loads this file in plain Node to hold DEFAULT_ROLES to the agent frontmatter.

export const CONFIG_PATH = 'bytheslice.config.json'
export const PROMPT_MAX = 20000

/**
 * Every agent .claude-plugin/plugin.json registers, by role, with the tier its
 * `model:` frontmatter names, one tier each, so the defaults never warn on a
 * spawn that runs as defined (deprecated v4 agents are not registered).
 * tests/pass/policy-parity.test.js fails when a default and its agent disagree.
 */
export const DEFAULT_ROLES: Readonly<Record<string, readonly string[]>> = {
  'a11y-discovery-runner': ['sonnet'],
  'block-composer': ['sonnet'],
  'bootstrap-runner': ['sonnet'],
  'branch-protection-writer': ['haiku'],
  'break-ui-runner': ['sonnet'],
  'brief-analyzer': ['sonnet'],
  'bundle-validator': ['sonnet'],
  'checklist-curator': ['sonnet'],
  'checklist-generator': ['haiku'],
  'ci-cd-detector': ['haiku'],
  'ci-fix-attempter': ['sonnet'],
  'complexity-assessor': ['opus'],
  'compliance-pre-check': ['sonnet'],
  'component-crafter': ['sonnet'],
  'config-generator': ['haiku'],
  'consistency-checker': ['haiku'],
  'db-schema-stage-writer': ['opus'],
  'debug-instrumenter': ['sonnet'],
  'design-critic': ['sonnet'],
  'e2e-installer': ['sonnet'],
  'env-scanner': ['haiku'],
  'env-verifier': ['haiku'],
  'fix-attempter': ['sonnet'],
  'framework-detector': ['haiku'],
  'github-secrets-scanner': ['haiku'],
  discovery: ['opus'],
  'husky-installer': ['haiku'],
  'layout-architect': ['sonnet'],
  'library-entry-writer': ['sonnet'],
  'library-route-scaffolder': ['sonnet'],
  'lint-config-writer': ['haiku'],
  'local-gates-runner': ['sonnet'],
  'master-checklist-synthesizer': ['opus'],
  'modern-ux-expert': ['sonnet'],
  implementer: ['opus'],
  'phased-plan-writer': ['opus'],
  'platform-walker': ['sonnet'],
  'prd-reviewer': ['sonnet'],
  'proposal-drafter': ['sonnet'],
  'quality-reviewer': ['opus'],
  'retrospective-reviewer': ['opus'],
  'rules-assembler': ['sonnet'],
  'rules-loader': ['haiku'],
  'scaffold-discovery': ['opus'],
  'slice-tester': ['sonnet'],
  'slice-verifier': ['sonnet'],
  'spec-reviewer': ['sonnet'],
  'stage-decomposer': ['sonnet'],
  'state-illustrator': ['sonnet'],
  'token-expander': ['opus'],
  'ui-fix-attempter': ['opus'],
  'workflow-writer': ['sonnet'],
}

/**
 * The role a teammate's model is judged by: not an agent file, so it sits
 * beside DEFAULT_ROLES rather than in it. A teammate bakes a whole pie, so it
 * may run on opus or sonnet; `pass.spawnPolicy.roles.teammate` overrides it.
 */
export const TEAMMATE_ROLE = 'teammate'
export const DEFAULT_TEAMMATE_TIERS: readonly string[] = ['opus', 'sonnet']

/** The verify-once gates and reviewers, which stay one-shot subagents: started as a teammate, each is `gate-teamified`. */
export const GATE_ROLES: ReadonlySet<string> = new Set(['implementer', 'slice-tester', 'slice-verifier', 'spec-reviewer', 'quality-reviewer'])

/** Strings that mark builder context in a reviewer's prompt (verify-once keeps it out). */
export const DEFAULT_MARKERS: readonly string[] = ['files_changed', 'diff --git', 'implementer returned', 'builder transcript']

/** The roles whose prompt must carry the manifest, the Exit criteria and the design-system path only. */
export const CONTEXT_ROLES: ReadonlySet<string> = new Set(['slice-tester', 'slice-verifier', 'spec-reviewer', 'quality-reviewer'])

const TESTER_MODES: readonly PassRequireTester[] = ['ui-slices', 'always', 'never']

/**
 * The watchdog's defaults: three minutes with no tool activity counts as idle
 * once a role has run past its budget (fifteen minutes, five for discovery,
 * thirty for the implementer). `bytheslice.config.json` key `pass.watchdog` overrides.
 */
export const DEFAULT_WATCHDOG: PassWatchdog = {
  enabled: true,
  idleMs: 180000,
  budgetsMs: { default: 900000, discovery: 300000, implementer: 1800000 },
}

const copyWatchdog = (w: PassWatchdog): PassWatchdog => ({ enabled: w.enabled, idleMs: w.idleMs, budgetsMs: { ...w.budgetsMs } })

export const DEFAULT_POLICY: PassPolicy = {
  enabled: true,
  requireTester: 'ui-slices',
  roles: {
    ...Object.fromEntries(Object.entries(DEFAULT_ROLES).map(([role, tiers]) => [role, [...tiers]])),
    [TEAMMATE_ROLE]: [...DEFAULT_TEAMMATE_TIERS],
  },
  contextMarkers: [...DEFAULT_MARKERS],
  watchdog: copyWatchdog(DEFAULT_WATCHDOG),
  enforcement: 'block',
}

const ENFORCEMENT: readonly PassEnforcement[] = ['block', 'warn']

/** How long a role may run before idling counts as a stall: its own budget, else `default`. */
export function budgetMs(role: string, watchdog: PassWatchdog): number {
  return watchdog.budgetsMs[role] ?? watchdog.budgetsMs.default ?? DEFAULT_WATCHDOG.budgetsMs.default ?? 900000
}

/** One setting a project's config moved off its default, as the ledger's `policy-override` note records it. */
export type PolicyOverride = { setting: string; value: unknown; default: unknown }

/** What reading the config gave: the policy, what it overrode, and why it fell back to defaults, if it did. */
export type PolicyRead = { policy: PassPolicy; overrides: PolicyOverride[]; problem: string | null }

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

const strings = (value: unknown): string[] | null => {
  if (typeof value === 'string') return value.trim() === '' ? [] : [value.trim()]
  if (!Array.isArray(value)) return null
  return value.filter((item): item is string => typeof item === 'string' && item.trim() !== '').map(item => item.trim())
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)

const isSpan = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0

/** Folds `pass.watchdog` over the watchdog's defaults: `enabled`, `idleMs`, and each role of `budgetsMs`. */
function watchdogOver(policy: PassPolicy, raw: unknown, overrides: PolicyOverride[]): void {
  if (!isObject(raw)) return
  const dog = policy.watchdog
  if (typeof raw.enabled === 'boolean' && raw.enabled !== dog.enabled) {
    overrides.push({ setting: 'watchdog.enabled', value: raw.enabled, default: dog.enabled })
    dog.enabled = raw.enabled
  }
  if (isSpan(raw.idleMs) && raw.idleMs !== dog.idleMs) {
    overrides.push({ setting: 'watchdog.idleMs', value: raw.idleMs, default: dog.idleMs })
    dog.idleMs = raw.idleMs
  }
  const budgets = isObject(raw.budgetsMs) ? raw.budgetsMs : {}
  for (const [rawRole, value] of Object.entries(budgets)) {
    const role = rawRole.replace(/^bytheslice:/, '').trim()
    if (role === '' || !isSpan(value) || dog.budgetsMs[role] === value) continue
    overrides.push({ setting: `watchdog.budgetsMs.${role}`, value, default: dog.budgetsMs[role] ?? null })
    dog.budgetsMs[role] = value
  }
}

/**
 * The policy from a parsed config's `pass` key over the defaults. A project
 * role list replaces that role's default (an empty list stops checking its
 * model); `contextMarkers` replaces the default list. Each change is listed.
 */
export function policyFrom(config: unknown): { policy: PassPolicy; overrides: PolicyOverride[] } {
  const policy: PassPolicy = {
    enabled: DEFAULT_POLICY.enabled,
    requireTester: DEFAULT_POLICY.requireTester,
    roles: Object.fromEntries(Object.entries(DEFAULT_POLICY.roles).map(([role, tiers]) => [role, [...tiers]])),
    contextMarkers: [...DEFAULT_POLICY.contextMarkers],
    watchdog: copyWatchdog(DEFAULT_POLICY.watchdog),
    enforcement: DEFAULT_POLICY.enforcement ?? 'block',
  }
  const overrides: PolicyOverride[] = []
  // Top level, beside `pass`: the workflow guard hook reads the same key.
  const enforcement = isObject(config) ? config.enforcement : undefined
  if (typeof enforcement === 'string' && (ENFORCEMENT as readonly string[]).includes(enforcement) && enforcement !== policy.enforcement) {
    overrides.push({ setting: 'enforcement', value: enforcement, default: policy.enforcement })
    policy.enforcement = enforcement as PassEnforcement
  }
  const pass = isObject(config) ? config.pass : undefined
  if (!isObject(pass)) return { policy, overrides }
  const checks = isObject(pass.checks) ? pass.checks : {}
  if (typeof checks.enabled === 'boolean' && checks.enabled !== policy.enabled) {
    overrides.push({ setting: 'checks.enabled', value: checks.enabled, default: policy.enabled })
    policy.enabled = checks.enabled
  }
  const tester = checks.requireTester
  if (typeof tester === 'string' && (TESTER_MODES as readonly string[]).includes(tester) && tester !== policy.requireTester) {
    overrides.push({ setting: 'checks.requireTester', value: tester, default: policy.requireTester })
    policy.requireTester = tester as PassRequireTester
  }
  const spawn = isObject(pass.spawnPolicy) ? pass.spawnPolicy : {}
  const roles = isObject(spawn.roles) ? spawn.roles : {}
  for (const [rawRole, rawTiers] of Object.entries(roles)) {
    const role = rawRole.replace(/^bytheslice:/, '').trim()
    const tiers = strings(rawTiers)
    if (role === '' || tiers === null) continue
    const before = policy.roles[role] ?? null
    if (same(before, tiers)) continue
    overrides.push({ setting: `roles.${role}`, value: tiers, default: before })
    policy.roles[role] = tiers
  }
  const markers = strings(spawn.contextMarkers)
  if (markers !== null && !same(markers, policy.contextMarkers)) {
    overrides.push({ setting: 'contextMarkers', value: markers, default: policy.contextMarkers })
    policy.contextMarkers = markers
  }
  watchdogOver(policy, pass.watchdog, overrides)
  return { policy, overrides }
}

/** Reads config text (JSONC); missing gives the defaults, malformed gives the defaults and says why. */
export function readPolicy(text: string | null): PolicyRead {
  if (text === null) return { ...policyFrom(undefined), problem: null }
  try {
    return { ...policyFrom(JSON.parse(stripJsonc(text)) as unknown), problem: null }
  } catch (error) {
    const reason = error instanceof Error ? error.message.split('\n')[0] ?? 'unreadable' : 'unreadable'
    return { ...policyFrom(undefined), problem: reason }
  }
}

/** True when a model (an alias or an API id) names any of the allowed tiers, by case-insensitive substring. */
export function tierAllowed(model: string, allowed: readonly string[]): boolean {
  const name = model.toLowerCase()
  return allowed.some(tier => tier !== '' && name.includes(tier.toLowerCase()))
}

/**
 * Appends one `note` row per override the ledger does not already hold with
 * the same setting and value, so each override is recorded once. Resolves the
 * number written.
 */
export async function recordOverrides($: EngineInterface, overrides: readonly PolicyOverride[]): Promise<number> {
  if (overrides.length === 0) return 0
  const rows = await readRows($)
  let written = 0
  for (const override of overrides) {
    const known = rows.some(
      row =>
        row.ev === 'note' &&
        row.data?.kind === 'policy-override' &&
        row.data.setting === override.setting &&
        same(row.data.value, override.value),
    )
    if (known) continue
    const row = await appendRow($, {
      ev: 'note',
      data: { kind: 'policy-override', setting: override.setting, value: override.value, default: override.default },
    })
    if (row) written += 1
  }
  return written
}

/**
 * Reads `bytheslice.config.json` in the session's directory, key `pass` (call it once per session): the
 * defaults when the file is missing, and when it cannot be read, with a log
 * line saying so. With `record`, each override not yet in the ledger becomes a note row.
 */
export async function loadPolicy($: EngineInterface, options: { record?: boolean } = {}): Promise<PassPolicy> {
  let text: string | null = null
  try {
    const cwd = (await $.session.cwd().catch(() => '.')).replace(/\/$/, '')
    const path = `${cwd}/${CONFIG_PATH}`
    text = (await $.fs.exists(path)) ? await $.fs.read(path) : null
  } catch {
    text = null
  }
  const read = readPolicy(text)
  if (read.problem !== null) {
    try {
      $.ui.log(`The Pass could not read ${CONFIG_PATH} (${read.problem}); its checks use the default policy.`)
    } catch {
      // Nothing else to tell.
    }
  }
  if (options.record === true) await recordOverrides($, read.overrides).catch(() => 0)
  // The operator's launch switch: every refusal becomes a warning for this session.
  const bypass = await $.env.get('BTS_ALLOW_BYPASS').catch(() => undefined)
  if (bypass === '1') return { ...read.policy, enforcement: 'warn', bypass: true }
  return read.policy
}
