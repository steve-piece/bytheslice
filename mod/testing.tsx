// mod/testing.tsx
// Test-only stand-ins for the engine beneath the Pass: answers the $ calls the mod makes from an in-memory world, plus mount targets.

import { mock } from 'claude-code/testing'
import type { On, RenderSurface, UiPane } from 'claude-code'
import type { Engine } from 'claude-code/testing'

export const START_MS = 1760000000000
export const PLUGIN = 'bytheslice'

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
}

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
    ...init,
  }
  const clock = mock.clock(on, { now: START_MS })
  const missing = () => new Error('ENOENT: no such file or directory')

  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('session.version', () => {
    if (world.version === null) throw new Error('no version')
    return { value: { version: world.version, base: world.version } }
  })
  on('fs.read', () => {
    if (world.checklist === null) throw missing()
    return { value: world.checklist }
  })
  on('fs.stat', () => {
    if (world.checklist === null) throw missing()
    return { value: { kind: 'file' as const, size: world.checklist.length, mtimeMs: world.mtimeMs, isLink: false } }
  })
  on('process.run', () => ({
    value: {
      exitCode: world.branch === null ? 128 : 0,
      stdout: world.branch === null ? '' : `${world.branch}\n`,
      stderr: '',
      isStdoutTruncated: false,
      isStderrTruncated: false,
    },
  }))
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
