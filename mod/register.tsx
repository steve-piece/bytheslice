// mod/register.tsx
// The Pass hooks module, wiring only: version gate, ledger capture (file edits as path and role only), checks that warn and never block, the stall watchdog, the HITL inbox, team mode (roster, teammate turns, idle and done), the cross-session strip, the bts tools, the pass command (replay and history included), pane, replay pane, band and hint.

import { atom, read } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { drawBand, hintProps, pushStatus } from './band.tsx'
import { captureBash, captureEdit, captureSkill, captureTurn, markSpawn, recordDoneFlips } from './capture.ts'
import { primeChecks, reportToModel, trackGit, trackSkill, warnResult } from './checks.ts'
import { checkFileWrite, checkPush } from './checks-checklist.ts'
import { checkCommitOnMain, checkFixSpawn, countFix, raiseFixCap } from './checks-git.ts'
import { checkDrift, checkSpawn, trackSpawn } from './checks-spawn.ts'
import { closeOnReply, isOperatorReply, serveHitl } from './hitl.ts'
import { startSession } from './ledger.ts'
import { pollAgents, refreshLedger, startPulse } from './live.ts'
import { notifyPiesReady } from './notify.ts'
import { gate, isChecklistPath, isLimited, refresh, watchChecklist } from './projection.ts'
import { checksText, drawPane, openPane, togglePane } from './rail.tsx'
import { reconcileText } from './reconcile.ts'
import { REPLAY_PANE, drawReplay, openReplay } from './replay.tsx'
import { clearStrip, pulseStrip, resetStrip } from './strip.ts'
import { historyText } from './history.ts'
import { captureTeammateTurn, recordDone, recordIdle, refreshTeam, teamActive, teammateOf } from './team.ts'
import { registerTools, serveNote, servePrBody, serveStatus } from './tools.ts'
import { markTouched, refreshTouched, refreshTouchedIfDirty, refreshTouchedSoon, resetTouched } from './touched.ts'
import { stamp, stampTurn, startWatchdog, stopWatchdog } from './watchdog.ts'
import { serveWake, stopWakes } from './wake.ts'

const checklistAtom = atom({ plugin: 'bytheslice', key: 'pass.checklist' } as const, null)
const ledgerAtom = atom({ plugin: 'bytheslice', key: 'pass.ledger' } as const, null)

// Every checklist write goes through here: the status line follows it, a slice
// that flipped to done is recorded, a pie it finished is announced once, and
// the ledger projection is read again.
async function reload($: EngineInterface): Promise<boolean> {
  const before = await read($, checklistAtom).catch(() => null)
  const c = await refresh($)
  pushStatus($, c)
  await recordDoneFlips($, before, c).catch(() => [])
  await notifyPiesReady($, before, c).catch(() => [])
  await refreshLedger($)
  // The active slice may have moved: its touched files are read on the next pulse.
  markTouched()
  return c !== null
}

const inputOf = (e: unknown): Record<string, unknown> =>
  e !== null && typeof e === 'object' ? (e as Record<string, unknown>) : {}

export const register: Register = on => {
  // Registered first, so it sees every tool call: a subagent's call stamps its
  // loop's last activity for the watchdog (at most once per 5 seconds), and the
  // call goes on unchanged.
  on('tool.call', async ($, e, next) => {
    await stamp($, e.agentId).catch(() => false)
    return next(e)
  }).catch(($, e, next) => next(e))

  // A loop's turn start stamps it at once (a teammate's running time counts
  // from it); a teammate's also refreshes the roster, which shows it running.
  on('turn.start', async ($, e, next) => {
    await stampTurn($, e.agentId).catch(() => false)
    const started = await next(e)
    if (e.agentId !== undefined && (await teammateOf($, e.agentId).catch(() => null))) await refreshTeam($).catch(() => null)
    return started
  }).catch(($, e, next) => next(e))

  on('session.start', async ($, e, next) => {
    if (!(await gate($))) {
      await startSession($).catch(() => undefined)
      resetTouched()
      resetStrip()
      // Awaited here, so the model has both tools listed by its first turn.
      await registerTools($).catch(() => undefined)
      await $.command
        .register({
          name: 'pass',
          description:
            'Open or close The Pass pane; pass replay <slice> steps through a slice; pass history prints progress per pie from the ledger; pass reconcile lists where the checklist and the ledger disagree; pass checks lists the latest check warnings.',
        })
        .catch(() => undefined)
      const hasChecklist = await reload($)
      await primeChecks($).catch(() => undefined)
      if (hasChecklist) await refreshTouched($).catch(() => null)
      // This session's place in the roadmap strip, and the other sessions of the project.
      if (hasChecklist) await pulseStrip($, true).catch(() => [])
      await watchChecklist($, () => reload($))
      await pollAgents($)
      // Every five seconds; the roster reads the ledger only when a teammate moved,
      // the touched files run git only when an edit, verdict or commit came since,
      // and the strip entry is written at most once per 10 seconds.
      await startPulse($, () => Promise.all([refreshTeam($), refreshTouchedIfDirty($), pulseStrip($)]))
      // Every 30 seconds: flags stalled agents; it warns and never stops one.
      await startWatchdog($)
      // Unasked, the engine places the pane only on a wide terminal; it waits undrawn below that.
      if (hasChecklist && e.isInteractive) void openPane($).catch(() => undefined)
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  // The watchdog stops with the session; a /clear keeps the process, so it starts again.
  on('session.end', async ($, e, next) => {
    const ended = await next(e)
    // This session leaves the other sessions' strips.
    await clearStrip($).catch(() => undefined)
    stopWatchdog()
    stopWakes()
    if (e.reason === 'clear' && !(await isLimited($))) await startWatchdog($).catch(() => undefined)
    return ended
  }).catch(($, e, next) => next(e))

  // Checks judge before the call from atoms only, always call next, and add any
  // warning to what the model reads after the result; the call is never refused.
  on('tool.call', { tool: ['Edit', 'Write'] }, async ($, e, next) => {
    const findings = await checkFileWrite($, e).catch(() => [])
    const ran = await next(e)
    if (isChecklistPath(e.file_path)) {
      if (!(await isLimited($))) await reload($).catch(() => false)
    } else if ((await captureEdit($, e, e.tool, ran).catch(() => null)) !== null) {
      // Observe only: the path and the role that edited it, never the content.
      await refreshTouchedSoon($).catch(() => null)
    }
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
    if (rows.length > 0) markTouched()
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

  // Read-only: the pie PR's evidence section from the shared ledger fold.
  on('tool.call', { tool: ['mcp__bytheslice__bts_pr_body', /^mcp__\w*bytheslice\w*__bts_pr_body$/] }, async ($, e) => ({ result: await servePrBody($, inputOf(e)) })).catch(() => ({
    result: 'bts_pr_body: the Pass could not build the evidence section; open the PR without it. Nothing was halted.',
  }))

  // A teammate's stand-in for ScheduleWakeup: arms one timer and answers at once.
  on('tool.call', { tool: ['mcp__bytheslice__bts_wake', /^mcp__\w*bytheslice\w*__bts_wake$/] }, async ($, e) => ({
    result: await serveWake($, inputOf(e), e.agentId),
  })).catch(() => ({
    result: 'not armed: the Pass could not arm that wake. Nothing was halted.',
  }))

  // Records and notifies, then returns at once: the skill's own HITL flow (ask in chat and stop) is what waits.
  on('tool.call', { tool: ['mcp__bytheslice__bts_hitl', /^mcp__\w*bytheslice\w*__bts_hitl$/] }, async ($, e) => ({ result: await serveHitl($, inputOf(e)) })).catch(() => ({
    result: 'not recorded: the Pass could not record that HITL item; ask the operator in chat anyway. Nothing was halted.',
  }))

  // The operator's own reply in chat answers the items the model was told to ask
  // there; the prompt goes in unchanged and its words are never read or kept.
  on('prompt.submit', async ($, e, next) => {
    const entered = await next(e)
    if (entered.drop === undefined && isOperatorReply(e)) await closeOnReply($).catch(() => 0)
    return entered
  }).catch(($, e, next) => next(e))

  // The spawn policy and the fix-loop cap warn: the spawn runs on the model and task
  // it asked for, and next's answer is returned untouched.
  on('agent.spawn', async ($, e, next) => {
    const judged = await checkSpawn($, e).catch(() => ({ findings: [], track: null }))
    const fix = await checkFixSpawn($, e).catch(() => ({ spawn: null, findings: [] }))
    const started = await next(e)
    await markSpawn($, e, started).catch(() => undefined)
    if (started.teammateId !== undefined) await refreshTeam($, { force: true }).catch(() => null)
    if (started.deny === undefined) {
      await countFix($, fix.spawn).catch(() => undefined)
      await trackSpawn($, started.agentId, judged.track).catch(() => undefined)
      await reportToModel($, [...fix.findings, ...judged.findings], e.parentAgentId ?? null).catch(() => [])
      // Past the fix cap the loop also gets a HITL inbox item; the spawn already ran.
      await raiseFixCap($, fix.spawn, fix.findings, e.parentAgentId ?? null).catch(() => null)
    }
    return started
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    await captureTurn($, e).catch(() => undefined)
    // A gate's verdict may make an earlier builder edit stale.
    if (e.agentId !== undefined) markTouched()
    // A teammate's turn is one usage row on its pie, and the roster counts it.
    if ((await captureTeammateTurn($, e).catch(() => null)) !== null) await refreshTeam($, { force: true }).catch(() => null)
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
    // It names no loop: with a team, the Skill tool call records whose start it was.
    if (!(await teamActive($).catch(() => false))) await captureSkill($, e.skill).catch(() => [])
    return prompt
  }).catch(($, e, next) => next(e))

  // In a teammate's loop the start is that teammate's: its pie, its address on the rows.
  on('tool.call', { tool: 'Skill' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny === undefined && ran.isError !== true) {
      await trackSkill($, e.skill).catch(() => null)
      const baker = await teammateOf($, e.agentId).catch(() => null)
      await captureSkill($, e.skill, baker ? { teammateId: baker.teammateId, pie: baker.pie } : null).catch(() => [])
      if (baker) await refreshTeam($, { force: true }).catch(() => null)
    }
    return ran
  }).catch(($, e, next) => next(e))

  // Observe only: a teammate going idle and a teammate's task done land in the
  // ledger once next let them happen (a settings hook beneath may keep the
  // teammate working, or refuse the completion: then nothing is recorded).
  on('classic.TeammateIdle', async ($, e, next) => {
    const out = await next(e)
    if (out.block === undefined) await recordIdle($, e).catch(() => null)
    return out
  }).catch(($, e, next) => next(e))

  on('classic.TaskCompleted', async ($, e, next) => {
    const out = await next(e)
    if (out.block === undefined) await recordDone($, e).catch(() => null)
    return out
  }).catch(($, e, next) => next(e))

  on('classic.UserPromptExpansion', async ($, e, next) => {
    const expanded = await next(e)
    await trackSkill($, e.command_name).catch(() => null)
    await captureSkill($, e.command_name).catch(() => [])
    return expanded
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'pass' }, async ($, e) => {
    const sub = e.args.trim().toLowerCase()
    if (sub === 'replay' || sub.startsWith('replay ')) return { text: await openReplay($, e.args.trim().slice(6)) }
    if (sub === 'reconcile') {
      await refreshLedger($)
      return { text: reconcileText(await read($, ledgerAtom)) }
    }
    if (sub === 'history') return { text: await historyText($) }
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

  on('ui.render', { component: 'Pane', requestId: REPLAY_PANE }, async ($, e) => drawReplay($, e)).catch(($, e, next) =>
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
