// mod/history.ts
// pass history: the per-pie progress table from scripts/ledger-summary.js --format text (slices, duration, fix loops, verifier, cost), run read-only through node.

import type { EngineInterface } from 'claude-code'

import { ledgerPath } from './ledger.ts'
import { SUMMARY_SCRIPT } from './tools.ts'

/**
 * The pass history text: the ledger script's table for every pie, or one line
 * naming what is missing (the ledger, node). Read-only.
 */
export async function historyText($: EngineInterface): Promise<string> {
  let ledger: string
  try {
    ledger = await ledgerPath($)
  } catch {
    return 'Pass history: the ledger path could not be resolved.'
  }
  if (!(await $.fs.exists(ledger).catch(() => false))) return `Pass history: no ledger at ${ledger} yet. Bake a pie with the Pass mod loaded.`
  let cwd = '.'
  try {
    cwd = await $.session.cwd()
  } catch {
    // The script resolves the ledger from the process directory.
  }
  const script = `${$.plugin.root.replace(/\/$/, '')}/${SUMMARY_SCRIPT}`
  try {
    const run = await $.process.run(['node', script, '--root', cwd, '--format', 'text'], { cwd, timeoutMs: 20000 })
    if (run.exitCode === 127) return 'Pass history: node was not found on PATH, so the table could not be built.'
    if (run.exitCode !== 0) return `Pass history: ${SUMMARY_SCRIPT} exited ${run.exitCode}.`
    return `Pass history (from the ledger):\n${run.stdout.trimEnd()}`
  } catch {
    return 'Pass history: node could not be started, so the table could not be built.'
  }
}
