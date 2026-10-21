// mod/reconcile.ts
// The pass reconcile report: each slice where the checklist and the ledger disagree. It informs and never edits.

import type { PassMismatch, PassProjection } from './types'

const short = (sha: string | null): string => (sha === null ? 'no HEAD recorded' : sha.slice(0, 7))

/** One line per mismatch, in plain words. */
export function mismatchLine(m: PassMismatch): string {
  return m.kind === 'done-without-pass'
    ? `Slice ${m.slice} is [x] with no slice-verifier pass in the ledger${m.head === null ? '' : ` (last verdict at ${short(m.head)})`}`
    : `Slice ${m.slice} has a slice-verifier pass (${short(m.head)}) but is still [ ]`
}

/** `0 mismatches`, `1 mismatch`, `3 mismatches`. */
export function countLine(n: number): string {
  return `${n} mismatch${n === 1 ? '' : 'es'}`
}

/**
 * The reconcile report for a projection: each disagreement, then the count.
 * Slices done before the ledger (no rows of their own) are counted apart.
 */
export function reconcileText(projection: PassProjection | null): string {
  if (!projection || projection.pies.length === 0) {
    return ['Pass reconcile: no pies in the checklist to compare.', countLine(0)].join('\n')
  }
  const lines = ['Pass reconcile: checklist against .bytheslice/ledger.jsonl']
  for (const m of projection.mismatches) lines.push(`  ${mismatchLine(m)}`)
  const checked = projection.pies.reduce((sum, pie) => sum + pie.slices.length, 0)
  const before = projection.untracked > 0 ? `, ${projection.untracked} done before the ledger and not compared` : ''
  lines.push(`${countLine(projection.mismatches.length)} (${checked} slices read${before}). Nothing was changed.`)
  return lines.join('\n')
}
