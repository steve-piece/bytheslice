// mod/register.tsx
// The Pass hooks module, wiring only: version gate, ledger capture, checks that warn and never block, the bts tools, the pass command, pane, band and hint.

import { atom, read } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { drawBand, hintProps, pushStatus } from './band.tsx'
import { captureBash, captureSkill, captureTurn, markSpawn, recordDoneFlips } from './capture.ts'
import { primeChecks, reportToModel, trackGit, trackSkill, warnResult } from './checks.ts'
import { checkFileWrite, checkPush } from './checks-checklist.ts'
import { checkCommitOnMain, checkFixSpawn, countFix } from './checks-git.ts'
import { checkDrift, checkSpawn, trackSpawn } from './checks-spawn.ts'
import { startSession } from './ledger.ts'
import { pollAgents, refreshLedger, startPulse } from './live.ts'
import { gate, isChecklistPath, isLimited, refresh, watchChecklist } from './projection.ts'
import { checksText, drawPane, openPane, togglePane } from './rail.tsx'
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
          description:
            'Open or close The Pass pane; pass reconcile lists where the checklist and the ledger disagree; pass checks lists the latest check warnings.',
        })
        .catch(() => undefined)
      const hasChecklist = await reload($)
      await primeChecks($).catch(() => undefined)
      await watchChecklist($, () => reload($))
      await pollAgents($)
      await startPulse($)
      // Unasked, the engine places the pane only on a wide terminal; it waits undrawn below that.
      if (hasChecklist && e.isInteractive) void openPane($).catch(() => undefined)
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  // Checks judge before the call from atoms only, always call next, and add any
  // warning to what the model reads after the result; the call is never refused.
  on('tool.call', { tool: ['Edit', 'Write'] }, async ($, e, next) => {
    const findings = await checkFileWrite($, e).catch(() => [])
    const ran = await next(e)
    if (isChecklistPath(e.file_path) && !(await isLimited($))) await reload($).catch(() => false)
    return warnResult($, ran, findings)
  }).catch(($, e, next) => next(e))

  // The git result is read after the command ran and returned as it came, a warning added at most.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const findings = [
      ...(await checkCommitOnMain($, e.command).catch(() => [])),
      ...(await checkPush($, e.command).catch(() => [])),
    ]
    const ran = await next(e)
    const rows = await captureBash($, e.command, ran).catch(() => [])
    if (ran.deny === undefined && ran.isError !== true) await trackGit($, e.command, rows).catch(() => undefined)
    return warnResult($, ran, findings)
  }).catch(($, e, next) => next(e))

  // Listed as mcp__<plugin>__<name>; the pattern also takes a prefixed plugin name a host may give.
  on('tool.call', { tool: ['mcp__bytheslice__bts_status', /^mcp__\w*bytheslice\w*__bts_status$/] }, async ($, e) => ({ result: await serveStatus($, inputOf(e)) })).catch(() => ({
    result: 'The Pass status is unavailable right now; read docs/plans/00_master_checklist.md instead. Nothing was halted.',
  }))

  on('tool.call', { tool: ['mcp__bytheslice__bts_note', /^mcp__\w*bytheslice\w*__bts_note$/] }, async ($, e) => ({ result: await serveNote($, inputOf(e)) })).catch(() => ({
    result: 'not recorded: the Pass could not write the note. Nothing was halted.',
  }))

  // The spawn policy and the fix-loop cap warn: the spawn runs on the model and task
  // it asked for, and next's answer is returned untouched.
  on('agent.spawn', async ($, e, next) => {
    const judged = await checkSpawn($, e).catch(() => ({ findings: [], track: null }))
    const fix = await checkFixSpawn($, e).catch(() => ({ spawn: null, findings: [] }))
    const started = await next(e)
    await markSpawn($, e, started).catch(() => undefined)
    if (started.deny === undefined) {
      await countFix($, fix.spawn).catch(() => undefined)
      await trackSpawn($, started.agentId, judged.track).catch(() => undefined)
      await reportToModel($, [...fix.findings, ...judged.findings], e.parentAgentId ?? null).catch(() => [])
    }
    return started
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    await captureTurn($, e).catch(() => undefined)
    const drift = await checkDrift($, e).catch(() => ({ findings: [], parent: null }))
    await reportToModel($, drift.findings, drift.parent).catch(() => [])
    return done
  }).catch(($, e, next) => next(e))

  // A baker skill's start, from whichever of three sources the session raises;
  // skill.prompt passes over an installed plugin where an organization manages
  // Claude Code, so the Skill tool and the typed command are read too.
  on('skill.prompt', async ($, e, next) => {
    const prompt = await next(e)
    await trackSkill($, e.skill).catch(() => null)
    await captureSkill($, e.skill).catch(() => [])
    return prompt
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'Skill' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny === undefined && ran.isError !== true) {
      await trackSkill($, e.skill).catch(() => null)
      await captureSkill($, e.skill).catch(() => [])
    }
    return ran
  }).catch(($, e, next) => next(e))

  on('classic.UserPromptExpansion', async ($, e, next) => {
    const expanded = await next(e)
    await trackSkill($, e.command_name).catch(() => null)
    await captureSkill($, e.command_name).catch(() => [])
    return expanded
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'pass' }, async ($, e) => {
    const sub = e.args.trim().toLowerCase()
    if (sub === 'reconcile') {
      await refreshLedger($)
      return { text: reconcileText(await read($, ledgerAtom)) }
    }
    if (sub === 'checks') {
      await refreshLedger($)
      return { text: checksText(await read($, ledgerAtom), await $.clock.now().catch(() => Date.now())) }
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
