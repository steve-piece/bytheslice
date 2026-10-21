// mod/testing.tsx
// Test-only stand-ins for the engine beneath the Pass: answers the $ calls the mod makes from an in-memory world, plus mount targets.

import { mock } from 'claude-code/testing'
import type { AgentInfo, AgentSpawnInput, On, RenderSurface, UiNotifyResult, UiPane } from 'claude-code'
import type { Engine } from 'claude-code/testing'

import { DEFAULT_ROLES } from './policy.ts'

export const START_MS = 1760000000000
export const PLUGIN = 'bytheslice'
export const CWD = '/repo'
export const LEDGER = '/repo/.bytheslice/ledger.jsonl'
export const ACTIVITY = '/repo/.claude/.bytheslice-state/kitchen/activity.jsonl'
export const ROTATED = '/repo/.claude/.bytheslice-state/kitchen/activity.1.jsonl'
export const SESSION = 'session-test'
export const HEAD = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678'
export const STATUS_TOOL = 'mcp__bytheslice__bts_status'
export const NOTE_TOOL = 'mcp__bytheslice__bts_note'
export const HITL_TOOL = 'mcp__bytheslice__bts_hitl'

/** What the stand-ins answer from; a test changes it between steps. */
export type World = {
  checklist: string | null
  mtimeMs: number
  branch: string | null
  version: string | null
  panes: UiPane[]
  statuses: (string | undefined)[]
  logs: string[]
  registered: string[]
  opened: number
  closed: number
  /** Files by absolute path beside the checklist: the ledger, the activity log. */
  files: Record<string, string>
  /** Every argv `$.process.run` was given, in order. */
  runs: string[][]
  /** What `git rev-parse --git-common-dir` answers; null makes git fail there. */
  commonDir: string | null
  /** HEAD's sha, ref names and subject for `git log -1`; null makes git log and rev-parse HEAD fail. */
  head: string | null
  refs: string
  subject: string
  /** When true, `tee -a` exits 1 (an unwritable ledger). */
  unwritable: boolean
  agents: AgentInfo[]
  toasts: string[]
  tools: string[]
  /** Whether each registered tool asked for its schema in the prompt (`isDeferred: false`). */
  deferred: Record<string, unknown>
  costUsd: number | null
  sessionId: string | null
  /** The session's working directory. */
  cwd: string
  /** Every native notification a plugin raised, in order. */
  notifies: { text: string; title?: string | undefined }[]
  /** What `$.ui.notify` answers. */
  notifyResult: UiNotifyResult
}

/** The rows a world file holds, parsed; a torn line is left out. */
export function rowsOf(world: World, path: string = LEDGER): Record<string, unknown>[] {
  return (world.files[path] ?? '')
    .split('\n')
    .filter(line => line.trim() !== '')
    .flatMap(line => {
      try {
        return [JSON.parse(line) as Record<string, unknown>]
      } catch {
        return []
      }
    })
}

/** One kitchen activity line, as hooks/kitchen-log.sh writes it. */
export function activityLine(row: Record<string, unknown>): string {
  return `${JSON.stringify(row)}\n`
}

const isChecklist = (path: string): boolean => /(^|\/)docs\/plans\/00_master_checklist\.md$/.test(path)

/** A checklist with one pie whose slices are all done. */
export const ALL_DONE = [
  '## Pie 7 - Finished [x]    <!-- review: continuous -->',
  '### Slice 7.1 - First [x]',
  '### Slice 7.2 - Second [x]',
  '',
].join('\n')

/** A flat v4 checklist (stages, no pies). */
export const V4 = ['## Stage 1 - Foundations [x]', '## Stage 2 - Feature work [ ]', ''].join('\n')

/** Every hook here stands for the engine: nothing sits beneath a plugin in a test. */
export function stage(on: On, init: Partial<World> = {}) {
  const world: World = {
    checklist: null,
    mtimeMs: 1,
    branch: 'pie-5-the-pass',
    version: '2.1.304',
    panes: [],
    statuses: [],
    logs: [],
    registered: [],
    opened: 0,
    closed: 0,
    files: {},
    runs: [],
    commonDir: '/repo/.git',
    head: HEAD,
    refs: 'HEAD -> pie-5-the-pass, origin/pie-5-the-pass',
    subject: 'feat(pie-5): 5.2 task 1 ledger writer',
    unwritable: false,
    agents: [],
    toasts: [],
    tools: [],
    deferred: {},
    costUsd: 0.25,
    sessionId: SESSION,
    cwd: CWD,
    notifies: [],
    notifyResult: { isSent: true, channel: 'iterm2' },
    ...init,
  }
  const abs = (path: string): string => (path.startsWith('/') ? path : `${world.cwd}/${path.replace(/^\.\//, '')}`)
  const clock = mock.clock(on, { now: START_MS })
  const missing = () => new Error('ENOENT: no such file or directory')

  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('session.version', () => {
    if (world.version === null) throw new Error('no version')
    return { value: { version: world.version, base: world.version } }
  })
  on('session.id', () => {
    if (world.sessionId === null) throw new Error('no id')
    return { value: world.sessionId }
  })
  on('session.cwd', () => ({ value: world.cwd }))
  on('session.root', () => ({ value: world.cwd }))
  on('session.usage', () => ({
    value: {
      startedAt: START_MS,
      context: { window: 200000 },
      rateLimits: [],
      ...(world.costUsd === null ? {} : { cost: { usd: world.costUsd } }),
    },
  }))
  on('fs.read', (_$, e) => {
    if (isChecklist(e.path)) {
      if (world.checklist === null) throw missing()
      return { value: world.checklist }
    }
    const text = world.files[abs(e.path)]
    if (text === undefined) throw missing()
    return { value: text }
  })
  on('fs.stat', (_$, e) => {
    const text = isChecklist(e.path) ? world.checklist : world.files[abs(e.path)] ?? null
    if (text === null) throw missing()
    const mtimeMs = isChecklist(e.path) ? world.mtimeMs : 1
    return { value: { kind: 'file' as const, size: text.length, mtimeMs, isLink: false } }
  })
  on('fs.exists', (_$, e) => ({
    value: isChecklist(e.path) ? world.checklist !== null : world.files[abs(e.path)] !== undefined,
  }))
  on('fs.write', (_$, e) => {
    world.files[abs(e.path)] = e.text
    return { value: undefined }
  })
  on('process.run', (_$, e) => {
    const argv = [...e.argv]
    world.runs.push(argv)
    const out = (exitCode: number, stdout = '', stderr = '') => ({
      value: { exitCode, stdout, stderr, isStdoutTruncated: false, isStderrTruncated: false },
    })
    const line = argv.join(' ')
    if (argv[0] === 'tee') {
      if (world.unwritable) return out(1, '', 'tee: /repo/.bytheslice/ledger.jsonl: Permission denied')
      const path = argv[argv.length - 1] ?? ''
      world.files[path] = (world.files[path] ?? '') + (e.init?.stdin ?? '')
      return out(0, e.init?.stdin ?? '')
    }
    if (line.startsWith('git rev-parse') && line.includes('--git-common-dir')) {
      return world.commonDir === null ? out(128, '', 'fatal: not a git repository') : out(0, `${world.commonDir}\n`)
    }
    if (line === 'git rev-parse --abbrev-ref HEAD') {
      return world.branch === null ? out(128) : out(0, `${world.branch}\n`)
    }
    if (line === 'git rev-parse HEAD') return world.head === null ? out(128) : out(0, `${world.head}\n`)
    if (argv[0] === 'git' && argv[1] === 'log') {
      return world.head === null ? out(128) : out(0, `${world.head}\n${world.refs}\n${world.subject}\n`)
    }
    if (argv[0] === 'tail') {
      const path = argv[argv.length - 1] ?? ''
      return out(0, world.files[path] ?? '')
    }
    return out(127, '', `${argv[0]}: not found`)
  })
  on('agent.list', () => ({ value: world.agents }))
  on('tool.register', (_$, e) => {
    world.tools.push(e.name)
    world.deferred[e.name] = e.isDeferred
    return { value: { tool: `mcp__${PLUGIN}__${e.name}` } }
  })
  on('ui.toast', (_$, e) => {
    world.toasts.push(e.text)
    return { value: undefined }
  })
  on('command.register', (_$, e) => {
    world.registered.push(e.name)
    return { value: { command: e.name } }
  })
  on('ui.open', (_$, e) => {
    world.opened += 1
    if (!world.panes.some(pane => pane.id === e.id)) {
      world.panes.push({ id: e.id, title: e.title ?? e.id, isShown: true, isFocused: false, isPlaced: true })
    }
    return { value: { isPlaced: true as const } }
  })
  on('ui.close', (_$, e) => {
    world.closed += 1
    world.panes = world.panes.filter(pane => pane.id !== e.id)
    return { value: undefined }
  })
  on('ui.panes', () => ({ value: world.panes }))
  on('ui.status', (_$, e) => {
    world.statuses.push(e.text)
    return { value: undefined }
  })
  on('ui.log', (_$, e) => {
    world.logs.push(e.text)
    return { value: undefined }
  })
  on('ui.notify', (_$, e) => {
    world.notifies.push({ text: e.text, title: e.title })
    return { value: world.notifyResult }
  })
  on('session.end', (_$, e) => ({ sessionId: e.sessionId }))

  const start = (
    $: Engine,
    surface: RenderSurface = 'terminal',
    isInteractive = true,
  ): Promise<unknown> => $.session.start({ cwd: '/repo', surface, isInteractive })

  return { world, clock, start }
}

/** The pane as a surface mounts it. */
export function paneTarget<P extends RenderSurface>(surface: P, bodyColumns = 48) {
  return {
    plugin: PLUGIN,
    surface,
    component: 'Pane' as const,
    requestId: 'pass',
    props: {
      title: 'The Pass',
      isFocused: false,
      bodyColumns,
      placement: 'dock' as const,
      scroll: { offset: 0, bodyRows: 30 },
      view: {},
    },
  }
}

/** The band above the prompt as a surface mounts it. */
export function bandTarget<P extends RenderSurface>(
  surface: P,
  bodyColumns = 100,
  options: { hasSurvey?: boolean; columns?: number; isFullscreen?: boolean } = {},
) {
  return {
    plugin: PLUGIN,
    surface,
    component: 'AbovePrompt' as const,
    ...(options.columns === undefined
      ? {}
      : { viewport: { columns: options.columns, rows: 40, isFullscreen: options.isFullscreen ?? false } }),
    props: {
      hasSurvey: options.hasSurvey ?? false,
      isWorking: false,
      maxRows: 6,
      bodyColumns,
      scroll: { offset: 0, bodyRows: 5 },
      view: {},
    },
  }
}

/** The prompt hint as a surface mounts it. */
export function hintTarget<P extends RenderSurface>(surface: P) {
  return {
    plugin: PLUGIN,
    surface,
    component: 'PromptHint' as const,
    props: { isDraft: false, isWorking: false, hint: '? for shortcuts' },
  }
}

/** The engine's own drawing, stood in by a hook beneath: what a site shows when the Pass passes. */
export function engineDraws(on: On): void {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    if (e.component === 'PromptHint') {
      const tail = e.props.tail === undefined ? '' : ` | tail: ${e.props.tail}`
      return <Text>{`engine hint: ${e.props.hint}${tail}`}</Text>
    }
    return <Text>engine</Text>
  })
}

/** Calls bts_note the way the model does; resolves the text it answered. */
export async function note($: Engine, text: unknown, slice?: string): Promise<string> {
  const ran = await $.tool.call({ tool: NOTE_TOOL, text, ...(slice === undefined ? {} : { slice }) })
  return String(ran.result)
}

/** Calls bts_hitl the way the model does; resolves the text it answered. */
export async function hitl($: Engine, input: Record<string, unknown>): Promise<string> {
  const ran = await $.tool.call({ tool: HITL_TOOL, ...input })
  return String(ran.result)
}

/**
 * Calls a tool from inside a subagent's loop, as the engine raises a call that
 * loop made: the input carries the loop's `agentId`, which a plugin's own call
 * types leave out.
 */
export function agentCall($: Engine, agentId: string, input: { tool: string } & Record<string, unknown>) {
  return $.tool.call({ ...input, agentId } as never)
}

/** Ends the session as the person leaving does (or with another reason). */
export function endSession($: Engine, reason: 'prompt_input_exit' | 'clear' = 'prompt_input_exit') {
  return $.session.end({ reason, sessionId: SESSION, resume: { id: SESSION } })
}

/** Calls bts_status the way the model does; resolves the text it answered. */
export async function status($: Engine, scope?: 'active' | 'all'): Promise<string> {
  const ran = await $.tool.call({ tool: STATUS_TOOL, ...(scope === undefined ? {} : { scope }) })
  return String(ran.result)
}

/** The engine beneath an agent spawn, a turn's end and a skill's prompt: each answers as core would. */
export function engineLoops(on: On, agentIds: string[] = ['agent-1']): void {
  let n = 0
  on('agent.spawn', () => ({ model: 'sonnet', agentId: agentIds[n++] ?? `agent-${n}` }))
  on('turn.complete', (_$, e) => ({ text: '', ...(e.usage ? { usage: e.usage } : {}) }))
  on('skill.prompt', (_$, e) => ({ text: e.text }))
}

/** The API id a tier runs as in these tests. */
export const MODEL_IDS: Readonly<Record<string, string>> = {
  opus: 'claude-opus-5-5',
  sonnet: 'claude-sonnet-4-6',
  haiku: 'claude-haiku-4-5',
}

// Which model each spawned agent runs on: its definition's tier, as a session runs it.
const ranOn = new Map<string, string>()
let spawned = 0

/** Spawns an agent through the plugins as the Agent tool does; `extra` sets `model`, `prompt` and the rest. */
export async function spawn($: Engine, subagentType: string, description: string, extra: Partial<AgentSpawnInput> = {}) {
  spawned += 1
  const started = await $.agent.spawn({
    tool_use_id: `toolu-${spawned}`,
    prompt: 'the task',
    description,
    subagentType,
    provider: { plugin: 'engine', tier: 'core' },
    parentModel: 'claude-opus-5-5',
    background: false,
    fork: false,
    ...extra,
  })
  if (typeof started.agentId === 'string') {
    const tier = DEFAULT_ROLES[subagentType.replace(/^bytheslice:/, '')]?.[0]
    ranOn.set(started.agentId, (tier === undefined ? undefined : MODEL_IDS[tier]) ?? MODEL_IDS.opus ?? 'claude-opus-5-5')
  }
  return started
}

/**
 * Ends a turn through the plugins: a subagent's when `agentId` is given, else
 * the main loop's. A spawned agent's turn runs on its definition's tier unless
 * `model` names another.
 */
export function endTurn($: Engine, answer: string, agentId?: string, model?: string) {
  const used = model ?? (agentId === undefined ? undefined : ranOn.get(agentId)) ?? 'claude-opus-5-5'
  return $.turn.complete({
    answer,
    durationMs: 1200,
    isAborted: false,
    turnId: `turn-${agentId ?? 'main'}`,
    reason: 'answer',
    ...(agentId === undefined ? {} : { agentId }),
    usage: {
      input_tokens: 100,
      output_tokens: 20,
      cache_read_input_tokens: 5,
      cache_creation_input_tokens: 0,
      model: used,
    },
  })
}

/** A Bash result as core answers it, with an optional structured git record. */
export function bashResult(gitOperation?: Record<string, unknown>) {
  return { result: { stdout: '', stderr: '', interrupted: false, ...(gitOperation ? { gitOperation } : {}) } }
}

/** A ledger where Slice 5.2 is fixing: tester passed, verifier failed with two targets, one fix-attempter started. */
export function fixingWorld(world: World): void {
  const line = (t: number, ev: string, data?: Record<string, unknown>) =>
    JSON.stringify({ v: 1, t, sid: 's', ev, pie: 5, slice: '5.2', ...(data ? { data } : {}) })
  world.files[LEDGER] = `${[
    line(1, 'slice.started'),
    line(2, 'verdict', { gate: 'slice-tester', overall: 'pass', fix_targets: [], head: HEAD }),
    line(3, 'verdict', {
      gate: 'slice-verifier',
      overall: 'fail',
      fix_targets: ['implementer | mod/a.ts | typecheck: x', 'implementer | mod/b.ts | lint: y'],
      head: HEAD,
    }),
  ].join('\n')}\n`
  world.files[ACTIVITY] = activityLine({ t: 4, sid: 's', ev: 'SubagentStart', agent: 'bytheslice:fix-attempter', aid: 'fx', pie: 5, slice: '5.2' })
}

/** The fixture with Slice 5.1 checked, so 5.2 is the active slice. */
export function activeAt52(checklist: string): string {
  return checklist.replace('### Slice 5.1 - Pass pane and band [ ]\nStatus: Not Started', '### Slice 5.1 - Pass pane and band [x]\nStatus: Completed')
}

/** One ledger line: a row at time `t`, on `slice` (and its pie) when one is given. */
export function ledgerLine(t: number, ev: string, slice?: string, data?: Record<string, unknown>): string {
  const pie = slice === undefined ? {} : { pie: Number(slice.split('.')[0]), slice }
  return JSON.stringify({ v: 1, t, sid: 's', ev, ...pie, ...(data ? { data } : {}) })
}

/** A ledger file's text from its lines. */
export function ledgerText(lines: readonly string[]): string {
  return `${lines.join('\n')}\n`
}

/** The `warn` rows the ledger holds, as `[code, slice]`. */
export function warnsOf(world: World): [string, string | null][] {
  return rowsOf(world)
    .filter(row => row.ev === 'warn')
    .map(row => [String((row.data as { code?: unknown } | undefined)?.code), typeof row.slice === 'string' ? row.slice : null])
}

/** The pass command as the person types it. */
export function typed(args: string) {
  return {
    command: 'pass',
    args,
    origin: { kind: 'composer' as const },
    presentation: { isFullscreen: false, columns: 120 },
  }
}
