// mod/seeded.test.tsx
// Seeded-violation suite on terminal and desktop: each spec violation warns exactly once and its call or spawn completes; plus the pane, band and pass checks views.

import { expect, test } from 'claude-code/testing'
import type { RenderSurface } from 'claude-code'
import type { Engine } from 'claude-code/testing'

import { CHECKLIST_FIXTURE } from './fixtures/checklist.fixture.ts'
import {
  ACTIVITY,
  HEAD,
  LEDGER,
  MODEL_IDS,
  activeAt52,
  activityLine,
  bandTarget,
  bashResult,
  endTurn,
  engineLoops,
  ledgerLine,
  ledgerText,
  paneTarget,
  spawn,
  stage,
  typed,
  warnsOf,
} from './testing.tsx'
import type { World } from './testing.tsx'

const SURFACES = ['terminal', 'desktop'] as const satisfies readonly RenderSurface[]
const CHECKLIST = 'docs/plans/00_master_checklist.md'
const EDITED = { filePath: CHECKLIST }
const UI = ['## Pie 7 - Screens [ ]', '### Slice 7.1 - Order screen [ ]', 'Status: Not Started', '**Type:** frontend', ''].join('\n')

/** One seeded violation: how to set the world up, and the call or spawn that commits it. */
type Seed = {
  code: string
  /** True for a check enforcement block refuses: the act resolves true when the call was refused. */
  refused?: boolean
  init?: Partial<World>
  before?: (world: World) => void
  /** Resolves true when the call or spawn completed: a result present, no deny. */
  act: ($: Engine) => Promise<boolean>
}

const completedCall = (ran: { deny?: unknown; result?: unknown }): boolean => ran.deny === undefined && ran.result !== undefined
const refusedCall = (ran: { deny?: unknown; result?: unknown }, code: string): boolean =>
  typeof ran.deny === 'string' && ran.deny.includes(code) && ran.result === undefined
const completedSpawn = (started: { deny?: unknown; agentId?: unknown; model?: unknown }): boolean =>
  started.deny === undefined && typeof started.agentId === 'string' && typeof started.model === 'string'

const SEEDS: Seed[] = [
  {
    code: 'builder-context',
    act: async $ => completedSpawn(await spawn($, 'bytheslice:slice-tester', 'P5 S5.3 test: probes', { prompt: 'Manifest.\nfiles_changed:\n  - mod/a.ts' })),
  },
  {
    code: 'checkbox-without-verdict',
    refused: true,
    act: async $ =>
      refusedCall(
        await $.tool.call({
          tool: 'Edit',
          file_path: CHECKLIST,
          old_string: '### Slice 5.1 - Pass pane and band [ ]',
          new_string: '### Slice 5.1 - Pass pane and band [x]',
        }),
        'checkbox-without-verdict',
      ),
  },
  {
    code: 'model-policy',
    act: async $ => completedSpawn(await spawn($, 'bytheslice:slice-verifier', 'P5 S5.3 verify: gates', { model: 'opus' })),
  },
  {
    code: 'model-drift',
    act: async $ => {
      const started = await spawn($, 'bytheslice:implementer', 'P5 S5.3 build: task 1')
      const ended = await endTurn($, 'built', String(started.agentId), MODEL_IDS.sonnet)
      return completedSpawn(started) && typeof ended.text === 'string'
    },
  },
  {
    code: 'fix-loop-cap',
    before: world => {
      world.files[ACTIVITY] = ['a', 'b', 'c']
        .map(aid => activityLine({ t: 10, sid: 's', ev: 'SubagentStart', agent: 'bytheslice:fix-attempter', aid, pie: 5, slice: '5.1' }))
        .join('')
    },
    act: async $ => completedSpawn(await spawn($, 'bytheslice:fix-attempter', 'P5 S5.1 fix: attempt 4')),
  },
  {
    code: 'commit-on-main',
    init: { branch: 'main' },
    act: async $ => completedCall(await $.tool.call({ tool: 'Bash', command: 'git commit -m x' })),
  },
  {
    code: 'push-slice-done-unverified',
    init: { checklist: activeAt52(CHECKLIST_FIXTURE) },
    before: world => {
      world.files[LEDGER] = ledgerText([ledgerLine(1, 'commit', '5.1', { sha: HEAD, branch: 'pie-5-the-pass' })])
    },
    act: async $ => completedCall(await $.tool.call({ tool: 'Bash', command: 'git push' })),
  },
  {
    code: 'plan-write-during-bake',
    act: async $ => {
      await $.skill.prompt({ skill: 'bytheslice:sell-slice', text: 'sell', frontmatter: {}, source: 'plugin' })
      return completedCall(await $.tool.call({ tool: 'Write', file_path: '/repo/docs/plans/stage_53_pass_checks.md', content: '# plan' }))
    },
  },
  {
    code: 'checkbox-without-tester',
    init: { checklist: UI },
    before: world => {
      world.files[LEDGER] = ledgerText([ledgerLine(1, 'verdict', '7.1', { gate: 'slice-verifier', overall: 'pass', fix_targets: [], head: HEAD })])
    },
    act: async $ =>
      completedCall(await $.tool.call({ tool: 'Edit', file_path: CHECKLIST, old_string: '### Slice 7.1 - Order screen [ ]', new_string: '### Slice 7.1 - Order screen [x]' })),
  },
]

for (const surface of SURFACES) {
  for (const seed of SEEDS) {
    test(`seeded ${seed.code} on ${surface}: one warn row, one toast, and the call ${seed.refused ? 'refused' : 'completed'}`, async ($, on) => {
      const { world, start } = stage(on, { checklist: CHECKLIST_FIXTURE, ...seed.init })
      seed.before?.(world)
      engineLoops(on, ['agent-1'])
      on('tool.call', (_$, e) => (e.tool === 'Bash' ? bashResult() : { result: EDITED }))
      await start($, surface)
      expect(await seed.act($)).toBe(true)
      expect(warnsOf(world).filter(([code]) => code === seed.code)).toHaveLength(1)
      expect(warnsOf(world)).toHaveLength(1)
      expect(world.toasts.filter(text => text.startsWith(`Pass ${seed.code}`))).toHaveLength(1)
    })
  }
}

test('the pane lists the latest warnings with code, slice and age, on terminal and desktop', async ($, on) => {
  const { world, clock, start } = stage(on, { checklist: CHECKLIST_FIXTURE, branch: 'main' })
  on('tool.call', (_$, e) => (e.tool === 'Bash' ? bashResult() : { result: EDITED }))
  await start($)
  for (const surface of SURFACES) {
    const ui = await $.ui.mount(paneTarget(surface, 80))
    const quiet = await ui.find({ type: 'Text', text: /^Warnings/ })
    expect(quiet?.text).toBe('Warnings · none')
    expect(quiet?.props.dimColor).toBe(true)
    await ui.unmount()
  }
  await $.tool.call({ tool: 'Bash', command: 'git commit -m x' })
  await $.tool.call({ tool: 'Edit', file_path: CHECKLIST, old_string: '### Slice 5.1 - Pass pane and band [ ]', new_string: '### Slice 5.1 - Pass pane and band [x]' })
  await clock.advance(125000)
  expect(warnsOf(world)).toHaveLength(2)
  for (const surface of SURFACES) {
    const ui = await $.ui.mount(paneTarget(surface, 80))
    expect((await ui.find({ type: 'Text', text: /^Warnings/ }))?.text).toBe('Warnings · 2 latest')
    const rows = (await ui.findAll({ type: 'Text' })).filter(row => /^ {2}[a-z-]+ · /.test(row.text))
    expect(rows.map(row => row.text)).toEqual(['  checkbox-without-verdict · 5.1 · 2m ago', '  commit-on-main · no slice · 2m ago'])
    expect(rows[0]?.props.color).toBe('warning')
    await ui.unmount()
  }
})

test('pass checks prints the same warnings as text, and says so when there are none', async ($, on) => {
  const { world, start } = stage(on, { checklist: CHECKLIST_FIXTURE, branch: 'main' })
  on('tool.call', () => bashResult())
  await start($, 'terminal', false)
  expect((await $.command.run(typed('checks'))).text).toBe('Pass checks: no warnings in the ledger. Every check warns; nothing is ever blocked.')
  await $.tool.call({ tool: 'Bash', command: 'git commit -m x' })
  const text = (await $.command.run(typed('checks'))).text ?? ''
  expect(text.split('\n')).toEqual([
    'Pass checks: the latest 1 warning, newest first. Nothing was blocked.',
    '  commit-on-main · no slice · 0s ago',
    '    A git commit ran while this session is on main; ByTheSlice commits and pushes on a pie branch. The command went ahead.',
  ])
  expect(warnsOf(world)).toHaveLength(1)
})

test('the band takes the warning style for five minutes after a finding, then lets it go', async ($, on) => {
  const { clock, start } = stage(on, { checklist: CHECKLIST_FIXTURE, branch: 'main' })
  on('tool.call', () => bashResult())
  await start($)
  const draw = async (surface: (typeof SURFACES)[number]) => {
    const band = await $.ui.mount(bandTarget(surface))
    const line = await band.find({ type: 'Text' })
    await band.unmount()
    return line
  }
  for (const surface of SURFACES) expect((await draw(surface))?.props.color).toBeUndefined()
  await $.tool.call({ tool: 'Bash', command: 'git commit -m x' })
  for (const surface of SURFACES) {
    const line = await draw(surface)
    expect(line?.text).toBe('Pie 5 · Slice 5.1 queued · warn commit-on-main')
    expect(line?.props.color).toBe('warning')
  }
  await clock.advance(4 * 60 * 1000)
  expect((await draw('terminal'))?.props.color).toBe('warning')
  await clock.advance(75 * 1000)
  for (const surface of SURFACES) {
    const line = await draw(surface)
    expect(line?.text).toBe('Pie 5 · Slice 5.1 queued')
    expect(line?.props.color).toBeUndefined()
  }
})
