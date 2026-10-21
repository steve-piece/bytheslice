// mod/checklist.ts
// Pure parser of docs/plans/00_master_checklist.md into the Pass projection (pies, slices, Prep counts), ported from mcp/kitchen-state.js.

import type { PassChecklist, PassLayout, PassPie } from './types'

type Status = 'done' | 'active' | 'open'
type SliceDraft = { id: string; name: string; status: Status }
type PieDraft = {
  n: number
  name: string
  review: PassPie['review']
  status: Status
  slices: SliceDraft[]
}

const EMPTY: PassChecklist = { pies: [], prep: null, layout: 'empty' }

// The module runs without Node, so this ports parseChecklist in mcp/kitchen-state.js
// instead of importing it; tests/pass/parity.test.js keeps the two from drifting.
const clean = (value: string, max = 240): string =>
  Array.from(value.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim()).slice(0, max).join('')

function statusOf(line: string): Status {
  if (/\[[xX]\]|~~|\bStatus:\s*(?:Completed|Done|Shipped)\b/i.test(line)) return 'done'
  if (/\bStatus:\s*(?:In Progress|Active|Running)\b|\[-\]/i.test(line)) return 'active'
  return 'open'
}

function titleOf(value: string): string {
  return clean(
    value
      .replace(/<!--.*?-->/g, '')
      .replace(/\[[ xX-]\]/g, '')
      .replace(/~~/g, '')
      .replace(/\bStatus:.*$/i, '')
      .replace(/^\s*[:.-]\s*/, ''),
  )
}

const reviewOf = (value: string | undefined): PassPie['review'] | null =>
  value === undefined ? null : value.toLowerCase() === 'continuous' ? 'continuous' : 'boundary'

function parse(markdown: string): PassChecklist {
  const pies: PieDraft[] = []
  let current: PieDraft | null = null
  let slice: SliceDraft | null = null
  let prep = false
  let fenced = false
  let sawPie = false
  let sawStage = false
  let prepCounts: { done: number; total: number } | null = null

  for (const raw of markdown.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(raw)) {
      fenced = !fenced
      continue
    }
    if (fenced) continue
    const annotated = reviewOf(/<!--\s*review:\s*(boundary|continuous)\s*-->/i.exec(raw)?.[1])
    const line = raw.replace(/<!--.*?-->/g, '').trimEnd()

    if (/^##\s+Prep\b/i.test(line)) {
      prep = true
      slice = null
      prepCounts = prepCounts ?? { done: 0, total: 0 }
      const n = Number(/\bPie\s+(\d+)/i.exec(line)?.[1] ?? 1)
      current = { n, name: 'Foundations', review: annotated ?? 'boundary', status: statusOf(line), slices: [] }
      pies.push(current)
      continue
    }

    const pieMatch = /^##\s+(?:\[[ xX-]\]\s*)?(?:~~)?Pie\s+(\d+)\b(.*)$/i.exec(line)
    const standalone = /^##\s+(?:\[[ xX-]\]\s*)?(?:~~)?(?:Slice\s+(\d+\.\d+)|Stage\s+(\d+))\b(.*)$/i.exec(line)
    if (pieMatch) {
      sawPie = true
      prep = false
      slice = null
      current = {
        n: Number(pieMatch[1]),
        name: titleOf(pieMatch[2] ?? ''),
        review: annotated ?? 'boundary',
        status: statusOf(line),
        slices: [],
      }
      pies.push(current)
      continue
    }
    if (standalone) {
      prep = false
      const isStage = standalone[2] !== undefined
      if (isStage) sawStage = true
      const number = standalone[1] ?? standalone[2] ?? '0'
      slice = { id: number, name: titleOf(standalone[3] ?? ''), status: statusOf(line) }
      current = {
        n: Number(number.split('.')[0]),
        name: slice.name,
        review: annotated ?? 'boundary',
        status: slice.status,
        slices: [slice],
      }
      pies.push(current)
      continue
    }
    if (/^##\s/.test(line)) {
      current = null
      slice = null
      prep = false
      continue
    }

    if (prep && prepCounts && /^\s*(?:-\s*)?\[[ xX]\]/.test(line)) {
      prepCounts.total += 1
      if (/\[[xX]\]/.test(line)) prepCounts.done += 1
    }

    // The review mode sits on the pie header or in the preamble before its first slice.
    if (current && slice === null) {
      const named = reviewOf(/^\s*\*\*Review:?\*\*:?\s*(boundary|continuous)\b/i.exec(line)?.[1])
      const review = annotated ?? named
      if (review) current.review = review
    }

    const sliceMatch =
      /^###\s+(?:\[[ xX-]\]\s*)?(?:~~)?Slice\s+(\d+\.\d+)\b(.*)$/i.exec(line) ??
      (prep ? /^\s*(?:-\s*)?\[[ xX]\]\s+Slice\s+(\d+\.\d+)\b(.*)$/i.exec(line) : null)
    if (sliceMatch) {
      const id = sliceMatch[1] ?? ''
      slice = { id, name: titleOf(sliceMatch[2] ?? ''), status: statusOf(line) }
      const n = Number(id.split('.')[0])
      if (!current || current.n !== n) {
        current = { n, name: slice.name, review: 'boundary', status: slice.status, slices: [] }
        pies.push(current)
      }
      current.slices.push(slice)
      continue
    }
    if (/^###\s/.test(line)) slice = null

    if (/^\s*(?:\*\*)?Status(?:\*\*)?:/i.test(line)) {
      const status = statusOf(line.replace(/\*\*/g, ''))
      if (slice) slice.status = status
      else if (current) current.status = status
    }
  }

  const done = pies.map((pie): PassPie => {
    let status = pie.status
    if (status === 'done') for (const item of pie.slices) item.status = 'done'
    else if (pie.slices.length > 0 && pie.slices.every(item => item.status === 'done')) status = 'done'
    return {
      n: pie.n,
      name: pie.name,
      review: pie.review,
      done: status === 'done',
      slices: pie.slices.map(item => ({ id: item.id, name: item.name, done: item.status === 'done' })),
    }
  })

  const layout: PassLayout = sawStage && !sawPie ? 'stage' : done.length > 0 ? 'pie' : 'empty'
  return { pies: layout === 'stage' ? [] : done, prep: prepCounts, layout }
}

/**
 * Parses the master checklist. A malformed heading is skipped, never thrown;
 * a flat v4 `## Stage N` file answers `pies: []` with `layout: 'stage'`.
 */
export function parseChecklist(markdown: string): PassChecklist {
  if (typeof markdown !== 'string') return EMPTY
  try {
    return parse(markdown)
  } catch {
    return EMPTY
  }
}
