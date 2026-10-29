// mod/relay.test.ts
// Unit tests for the logging relay: each classic event hands its envelope to kitchen-log.sh and lobby-signal.sh as a settings hook would, tool events only for their tools, and a script that fails never touches the event.

import { expect, test } from 'claude-code/testing'

import { CHECKLIST_FIXTURE } from './fixtures/checklist.fixture.ts'
import { KITCHEN_LOG, LOBBY_SIGNAL, RELAYS, scriptsFor } from './relay.ts'
import { stage } from './testing.tsx'

const scriptRuns = (runs: string[][]): string[] =>
  runs.filter(argv => argv[0] === 'bash' && /hooks\/(kitchen-log|lobby-signal)\.sh$/.test(argv[1] ?? '')).map(argv => (argv[1] ?? '').replace(/^.*\/hooks\//, 'hooks/'))

test('every event the two scripts document is relayed, and nothing else', () => {
  const kitchen = RELAYS.filter(r => r.scripts.includes(KITCHEN_LOG)).map(r => r.event).sort()
  const lobby = RELAYS.filter(r => r.scripts.includes(LOBBY_SIGNAL)).map(r => r.event).sort()
  expect(kitchen).toEqual(['PostToolUse', 'PreToolUse', 'SessionStart', 'Stop', 'SubagentStart', 'SubagentStop', 'UserPromptExpansion'])
  expect(lobby).toEqual(['Notification', 'SessionStart', 'Stop', 'SubagentStart', 'SubagentStop', 'UserPromptSubmit'])
})

test('tool events go only to their tools', () => {
  expect(scriptsFor('PreToolUse', { tool_name: 'Agent' })).toEqual([KITCHEN_LOG])
  expect(scriptsFor('PreToolUse', { tool_name: 'Skill' })).toEqual([KITCHEN_LOG])
  expect(scriptsFor('PreToolUse', { tool_name: 'Bash' })).toEqual([])
  expect(scriptsFor('PostToolUse', { tool_name: 'Skill' })).toEqual([])
  expect(scriptsFor('PermissionRequest', {})).toEqual([])
})

test('a Stop hands the envelope to both scripts on stdin, with its event name', async ($, on) => {
  const { world, start } = stage(on, { checklist: CHECKLIST_FIXTURE })
  const stdins: string[] = []
  world.run = (argv, stdin) => {
    if (argv[0] === 'bash') stdins.push(stdin ?? '')
    return argv[0] === 'bash' ? { exitCode: 0 } : undefined
  }
  on('classic.Stop', () => ({}))
  await start($)
  world.runs.length = 0
  await $.classic.Stop({ stop_hook_active: false })
  expect(scriptRuns(world.runs)).toEqual([KITCHEN_LOG, LOBBY_SIGNAL])
  expect(stdins).toHaveLength(2)
  expect(JSON.parse(stdins[0] ?? '{}')).toMatchObject({ hook_event_name: 'Stop', stop_hook_active: false })
})

test('a failing script leaves the event untouched', async ($, on) => {
  const { world, start } = stage(on, { checklist: CHECKLIST_FIXTURE })
  world.run = argv => (argv[0] === 'bash' ? { exitCode: 1, stderr: 'boom' } : undefined)
  on('classic.Notification', () => ({}))
  await start($)
  const out = await $.classic.Notification({ message: 'waiting', notification_type: 'idle_prompt' })
  expect(out).toEqual({})
  expect(scriptRuns(world.runs)).toContain(LOBBY_SIGNAL)
})
