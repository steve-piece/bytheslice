// mod/relay.ts
// Runs the two silent logging scripts (hooks/kitchen-log.sh for the kitchen activity feed, hooks/lobby-signal.sh for the Lobby) from the Pass instead of hooks.json: each classic event's envelope goes to the script on stdin, exactly as a settings hook would send it. Cursor, which has no mods, still runs the scripts as hooks.

import type { EngineInterface } from 'claude-code'

/** The scripts, relative to the plugin root. */
export const KITCHEN_LOG = 'hooks/kitchen-log.sh'
export const LOBBY_SIGNAL = 'hooks/lobby-signal.sh'

/** Which script runs on which event; `tools` narrows a tool event to those tool names. */
export const RELAYS: readonly { event: string; scripts: readonly string[]; tools?: readonly string[] }[] = [
  { event: 'SessionStart', scripts: [KITCHEN_LOG, LOBBY_SIGNAL] },
  { event: 'UserPromptSubmit', scripts: [LOBBY_SIGNAL] },
  { event: 'UserPromptExpansion', scripts: [KITCHEN_LOG] },
  { event: 'SubagentStart', scripts: [KITCHEN_LOG, LOBBY_SIGNAL] },
  { event: 'SubagentStop', scripts: [KITCHEN_LOG, LOBBY_SIGNAL] },
  { event: 'PreToolUse', scripts: [KITCHEN_LOG], tools: ['Agent', 'Skill'] },
  { event: 'PostToolUse', scripts: [KITCHEN_LOG], tools: ['Agent'] },
  { event: 'Stop', scripts: [KITCHEN_LOG, LOBBY_SIGNAL] },
  { event: 'Notification', scripts: [LOBBY_SIGNAL] },
]

/** The scripts an envelope goes to: none when a tool event names another tool. */
export function scriptsFor(event: string, envelope: { tool_name?: unknown }): readonly string[] {
  const relay = RELAYS.find(r => r.event === event)
  if (!relay) return []
  if (relay.tools && !relay.tools.includes(String(envelope.tool_name ?? ''))) return []
  return relay.scripts
}

/** Hands the envelope to each script in turn; a script that fails or cannot start is skipped. */
export async function relay($: EngineInterface, event: string, envelope: Record<string, unknown>): Promise<number> {
  const scripts = scriptsFor(event, envelope)
  if (scripts.length === 0) return 0
  const root = $.plugin.root.replace(/\/$/, '')
  const cwd = typeof envelope.cwd === 'string' && envelope.cwd !== '' ? envelope.cwd : undefined
  const stdin = JSON.stringify({ hook_event_name: event, ...envelope })
  let ran = 0
  for (const script of scripts) {
    try {
      await $.process.run(['bash', `${root}/${script}`], { ...(cwd ? { cwd } : {}), stdin, timeoutMs: 5000 })
      ran += 1
    } catch {
      // Logging never stands in the way of the session.
    }
  }
  return ran
}
