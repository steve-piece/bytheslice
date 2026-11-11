// mod/checklist.ts
// Pure parser of docs/plans/00_master_checklist.md into the Pass projection (pies, slices with their type, Prep counts), ported from mcp/kitchen-state.js.

import type { PassChecklist, PassLayout, PassPie } from './types'

type Status = 'done' | 'active' | 'open'
type SliceDraft = { id: string; name: string; status: Status; type?: string }
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
  if (/\[[xX]\]|~~|\bStatus:\s*(?:Completed?|Done|Shipped)\b/i.test(line)) return 'done'
  if (/\bStatus:\s*(?:In Progress|Active|Running|Partial)\b|\[-\]/i.test(line)) return 'active'
  return 'open'
}

// A heading's status may sit in an HTML comment (`### Slice 3.1 <!-- Status: Completed -->`): read it, never strip it.
const notedStatus = (raw: string, line: string): Status =>
  statusOf(`${line} ${(raw.match(/<!--\s*Status:.*?-->/gi) ?? []).join(' ')}`)
const RANK: Record<Status, number> = { open: 0, active: 1, done: 2 }
const cellsOf = (line: string): string[] =>
  line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => cell.trim())
const plainCell = (cell: string): string =>
  cell.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\*\*|`/g, '').trim()
// A table cell's status: a box or strike, or a status word with or without a `Status:` prefix.
const cellStatus = (cell: string): Status =>
  statusOf(/\bStatus:/i.test(cell) ? cell : `Status: ${cell.replace(/^[^\w[~]+/, '')}`)
type Row = { id: string; name: string; status: Status }

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
  // The furthest status a repeated slice already had from its earlier entries: a later entry never lowers it.
  let floor: Status | null = null
  let prep = false
  let fenced = false
  let sawPie = false
  let sawStage = false
  let prepCounts: { done: number; total: number } | null = null
  let table: { header: string[] } | null = null
  const tables = new Map<PieDraft, Row[]>()
  const real = new Set<PieDraft>()

  for (const raw of markdown.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(raw)) {
      fenced = !fenced
      table = null
      continue
    }
    if (fenced) continue
    const annotated = reviewOf(/<!--\s*review:\s*(boundary|continuous)\s*-->/i.exec(raw)?.[1])
    const line = raw.replace(/<!--.*?-->/g, '').trimEnd()
    if (!/^\s*\|/.test(line)) table = null

    if (/^##\s+Prep\b/i.test(line)) {
      prep = true
      slice = null
      prepCounts = prepCounts ?? { done: 0, total: 0 }
      const n = Number(/\bPie\s+(\d+)/i.exec(line)?.[1] ?? 1)
      current = { n, name: 'Foundations', review: annotated ?? 'boundary', status: notedStatus(raw, line), slices: [] }
      pies.push(current)
      continue
    }

    const pieMatch = /^##\s+(?:\[[ xX-]\]\s*)?(?:~~)?Pie\s+(\d+)\b(.*)$/i.exec(line)
    const standalone = /^##\s+(?:\[[ xX-]\]\s*)?(?:~~)?(?:Slice\s+(\d+\.\d+[a-z]?)|Stage\s+(\d+))\b(.*)$/i.exec(line)
    if (pieMatch) {
      sawPie = true
      prep = false
      slice = null
      current = {
        n: Number(pieMatch[1]),
        name: titleOf(pieMatch[2] ?? ''),
        review: annotated ?? 'boundary',
        status: notedStatus(raw, line),
        slices: [],
      }
      pies.push(current)
      real.add(current)
      continue
    }
    if (standalone) {
      prep = false
      const isStage = standalone[2] !== undefined
      if (isStage) sawStage = true
      const number = standalone[1] ?? standalone[2] ?? '0'
      floor = null
      slice = { id: number, name: titleOf(standalone[3] ?? ''), status: notedStatus(raw, line) }
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
      /^###\s+(?:\[[ xX-]\]\s*)?(?:~~)?Slice\s+(\d+\.\d+[a-z]?)\b(.*)$/i.exec(line) ??
      (prep ? /^\s*(?:-\s*)?\[[ xX]\]\s+Slice\s+(\d+\.\d+[a-z]?)\b(.*)$/i.exec(line) : null)
    if (sliceMatch) {
      const id = sliceMatch[1] ?? ''
      const status = notedStatus(raw, line)
      const n = Number(id.split('.')[0])
      if (!current || current.n !== n) {
        current = { n, name: titleOf(sliceMatch[2] ?? ''), review: 'boundary', status, slices: [] }
        pies.push(current)
      }
      // A slice listed twice (a Prep line and its own heading) is one slice: keep the furthest status.
      const existing = current.slices.find(item => item.id === id)
      if (existing) {
        floor = existing.status
        if (RANK[status] > RANK[existing.status]) existing.status = status
        slice = existing
        continue
      }
      floor = null
      slice = { id, name: titleOf(sliceMatch[2] ?? ''), status }
      current.slices.push(slice)
      continue
    }
    if (/^###\s/.test(line)) slice = null

    // A pie that lists its slices only in a markdown table: the rows count once the pie has no slice headings.
    if (current && real.has(current) && /^\s*\|/.test(line)) {
      const cells = cellsOf(line)
      if (!table) table = { header: cells.map(cell => plainCell(cell).toLowerCase()) }
      else if (!cells.every(cell => /^:?-{2,}:?$/.test(cell))) {
        const { header } = table
        let idAt = header.indexOf('slice')
        if (idAt < 0) idAt = cells.findIndex(cell => /^\d+\.\d+[a-z]?$/.test(plainCell(cell)))
        const id = idAt >= 0 ? plainCell(cells[idAt] ?? '') : ''
        if (/^\d+\.\d+[a-z]?$/.test(id) && Number(id.split('.')[0]) === current.n) {
          const statusAt = header.findIndex(cell => /^(?:status|implementation|state|progress)$/.test(cell))
          const titleAt = header.findIndex(cell => /deliverable|name|title/.test(cell))
          const rows = tables.get(current) ?? []
          tables.set(current, rows)
          rows.push({
            id,
            name: titleOf(plainCell(cells[titleAt >= 0 ? titleAt : idAt + 1] ?? '')),
            status: statusAt >= 0 ? cellStatus(plainCell(cells[statusAt] ?? '')) : statusOf(line),
          })
        }
      }
    }

    // A slice's `**Type:** frontend | **Plan:** ...` line names what kind of slice it is.
    const typed = slice ? /^\s*\*\*Type:?\*\*:?\s*([A-Za-z][\w-]*)/i.exec(line)?.[1] : undefined
    if (slice && typed) slice.type = typed.toLowerCase()

    if (/^\s*(?:\*\*)?Status(?:\*\*)?:/i.test(line)) {
      const status = statusOf(line.replace(/\*\*/g, ''))
      if (slice) slice.status = floor && RANK[floor] > RANK[status] ? floor : status
      else if (current) current.status = status
    }
  }

  for (const pie of pies) {
    const rows = tables.get(pie)
    if (pie.slices.length > 0 || !rows) continue
    for (const row of rows) if (!pie.slices.some(item => item.id === row.id)) pie.slices.push({ ...row })
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
      slices: pie.slices.map(item => ({
        id: item.id,
        name: item.name,
        done: item.status === 'done',
        ...(item.type === undefined ? {} : { type: item.type }),
      })),
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
