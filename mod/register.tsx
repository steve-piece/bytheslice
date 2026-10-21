// mod/register.tsx
// The Pass hooks module, wiring only: version gate, checklist refresh triggers, the pass command, pane, band and prompt hint.

import type { EngineInterface, Register } from 'claude-code'

import { drawBand, hintProps, pushStatus } from './band.tsx'
import { gate, isChecklistPath, isLimited, refresh, watchChecklist } from './projection.ts'
import { drawPane, openPane, togglePane } from './rail.tsx'

// Every projection write goes through here, so the status line always follows it.
async function reload($: EngineInterface): Promise<boolean> {
  const c = await refresh($)
  pushStatus($, c)
  return c !== null
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    if (!(await gate($))) {
      await $.command
        .register({ name: 'pass', description: 'Open or close The Pass pane: where the pies and slices stand.' })
        .catch(() => undefined)
      const hasChecklist = await reload($)
      await watchChecklist($, () => reload($))
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

  on('command.run', { command: 'pass' }, async $ => ({ text: await togglePane($) })).catch(() => ({
    text: 'The Pass could not open or close its pane; nothing else changed.',
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
