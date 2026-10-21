// mod/register.tsx
// The Pass hooks module, wiring only: version gate, ledger capture, the bts tools, the pass command, pane, band and prompt hint.

import { atom, read } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { drawBand, hintProps, pushStatus } from './band.tsx'
import { captureBash, captureSkill, captureTurn, markSpawn, recordDoneFlips } from './capture.ts'
import { startSession } from './ledger.ts'
import { pollAgents, refreshLedger, startPulse } from './live.ts'
import { gate, isChecklistPath, isLimited, refresh, watchChecklist } from './projection.ts'
import { drawPane, openPane, togglePane } from './rail.tsx'
import { reconcileText } from './reconcile.ts'
import { registerTools, serveNote, serveStatus } from './tools.ts'

const checklistAtom = atom({ plugin: 'bytheslice', key: 'pass.checklist' } as const, null)
const ledgerAtom = atom({ plugin: 'bytheslice', key: 'pass.ledger' } as const, null)

// Every checklist write goes through here: the status line follows it, a slice
// that flipped to done is recorded, and the ledger projection is read again.
async function reload($: EngineInterface): Promise<boolean> {
  const before = await read($, checklistAtom).catch(() => null)
  const c = await refresh($)
  pushStatus($, c)
  await recordDoneFlips($, before, c).catch(() => [])
  await refreshLedger($)
  return c !== null
}

const inputOf = (e: unknown): Record<string, unknown> =>
  e !== null && typeof e === 'object' ? (e as Record<string, unknown>) : {}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    if (!(await gate($))) {
      await startSession($).catch(() => undefined)
      // Awaited here, so the model has both tools listed by its first turn.
      await registerTools($).catch(() => undefined)
      await $.command
        .register({
          name: 'pass',
          description: 'Open or close The Pass pane; pass reconcile lists where the checklist and the ledger disagree.',
        })
        .catch(() => undefined)
      const hasChecklist = await reload($)
      await watchChecklist($, () => reload($))
      await pollAgents($)
      await startPulse($)
      // Unasked, the engine places the pane only on a wide terminal; it waits undrawn below that.
      if (hasChecklist && e.isInteractive) void openPane($).catch(() => undefined)
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: ['Edit', 'Write'] }, async ($, e, next) => {
    const ran = await next(e)
    if (isChecklistPath(e.file_path) && !(await isLimited($))) await reload($)
    return ran
  }).catch(($, e, next) => next(e))

  // Observe only: the git result is read after the command ran and always returned as it came.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const ran = await next(e)
    await captureBash($, e.command, ran).catch(() => [])
    return ran
  }).catch(($, e, next) => next(e))

  // Listed as mcp__<plugin>__<name>; the pattern also takes a prefixed plugin name a host may give.
  on('tool.call', { tool: ['mcp__bytheslice__bts_status', /^mcp__\w*bytheslice\w*__bts_status$/] }, async ($, e) => ({ result: await serveStatus($, inputOf(e)) })).catch(() => ({
    result: 'The Pass status is unavailable right now; read docs/plans/00_master_checklist.md instead. Nothing was halted.',
  }))

  on('tool.call', { tool: ['mcp__bytheslice__bts_note', /^mcp__\w*bytheslice\w*__bts_note$/] }, async ($, e) => ({ result: await serveNote($, inputOf(e)) })).catch(() => ({
    result: 'not recorded: the Pass could not write the note. Nothing was halted.',
  }))

  on('agent.spawn', async ($, e, next) => {
    const started = await next(e)
    await markSpawn($, e, started).catch(() => undefined)
    return started
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    await captureTurn($, e).catch(() => undefined)
    return done
  }).catch(($, e, next) => next(e))

  // A baker skill's start, from whichever of three sources the session raises;
  // skill.prompt passes over an installed plugin where an organization manages
  // Claude Code, so the Skill tool and the typed command are read too.
  on('skill.prompt', async ($, e, next) => {
    const prompt = await next(e)
    await captureSkill($, e.skill).catch(() => [])
    return prompt
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'Skill' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny === undefined && ran.isError !== true) await captureSkill($, e.skill).catch(() => [])
    return ran
  }).catch(($, e, next) => next(e))

  on('classic.UserPromptExpansion', async ($, e, next) => {
    const expanded = await next(e)
    await captureSkill($, e.command_name).catch(() => [])
    return expanded
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'pass' }, async ($, e) => {
    if (e.args.trim().toLowerCase() === 'reconcile') {
      await refreshLedger($)
      return { text: reconcileText(await read($, ledgerAtom)) }
    }
    return { text: await togglePane($) }
  }).catch(() => ({
    text: 'The Pass could not answer that command; nothing changed.',
  }))

  on('ui.render', { component: 'Pane', requestId: 'pass' }, async ($, e) => drawPane($, e)).catch(($, e, next) =>
    next(e),
  )

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => (await drawBand($, e)) ?? next(e)).catch(
    ($, e, next) => next(e),
  )

  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    const props = await hintProps($, e)
    return props ? next({ ...e, props }) : next(e)
  }).catch(($, e, next) => next(e))
}
