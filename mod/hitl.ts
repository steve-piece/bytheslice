// mod/hitl.ts
// The Pass HITL inbox core: bts_hitl records a question or its answer in the ledger and returns at once; the operator's reply in chat, or the pane's button, answers it too.

import { atom, read } from 'claude-code'
import type { EngineInterface, PromptSubmitInput } from 'claude-code'

import { record } from './capture.ts'
import { readRows } from './ledger.ts'
import { notifyHitl } from './notify.ts'
import type { NotifyOutcome } from './notify.ts'
import { activePie, activeSlice } from './projection.ts'
import type { LedgerRow, PassHitlCategory, PassProjection } from './types'

const checklistAtom = atom({ plugin: 'bytheslice', key: 'pass.checklist' } as const, null)
const ledgerAtom = atom({ plugin: 'bytheslice', key: 'pass.ledger' } as const, null)

export const HITL_TOOL = 'bts_hitl'
/** The name a session lists the tool under (`mcp__<plugin>__<name>`); register.tsx matches it. */
export const HITL_LISTED = 'mcp__bytheslice__bts_hitl'
export const QUESTION_MAX = 1000
export const CONTEXT_MAX = 1000
export const ANSWER_MAX = 500
/** The categories the model raises in: the four the agents already use. */
export const CATEGORIES: readonly PassHitlCategory[] = ['prd_ambiguity', 'external_credentials', 'destructive_operation', 'creative_direction']
export const NEXT_STEP = 'Ask the operator this in chat now and stop; when they answer, call bts_hitl with { id, answer }.'
/** What an answer records when it came from the operator's reply in chat (never their words). */
export const REPLY_ANSWER = 'operator replied in chat'
export const PANE_ANSWER = 'marked answered in pane'
/** Prompt origins that are the operator's own words: the terminal, Remote Control, an SDK host (the desktop app), a Slack ping. */
export const HUMAN_ORIGINS: ReadonlySet<string> = new Set(['composer', 'bridge', 'sdk', 'slack-ping'])

/** Which way an answer arrived. */
export type HitlVia = 'tool' | 'reply' | 'pane'

/** What raising an item takes: the model's four categories, or `other` for the Pass's own. */
export type HitlRaise = {
  category: PassHitlCategory
  question: string
  context?: string | null
  slice?: string
  pie?: number
  source: 'agent' | 'pass'
  asked: 'chat' | 'pane'
  kind?: string
}

/** A bts_hitl call read: a raise, an answer, or why it is neither. */
export type HitlRequest =
  | { kind: 'raise'; raise: HitlRaise }
  | { kind: 'answer'; id: string; answer: string }
  | { kind: 'invalid'; text: string }

/** What a raise resolves: the new id, the row written (null when the ledger refused it) and what the notification did. */
export type HitlRaised = { id: string; row: LedgerRow | null; notify: NotifyOutcome }

const DESCRIPTION = [
  'Raises a HITL question for the operator in the Pass inbox, or records its answer. It never waits and never blocks.',
  'Raise: { category, question, context?, slice? }, category one of prd_ambiguity, external_credentials,',
  'destructive_operation, creative_direction. It records the question in .bytheslice/ledger.jsonl, shows it in the',
  'pane and the band, sends a native notification, and returns at once with { id, status: "open", next, notify }:',
  'then ask the operator in chat as the skill HITL flow says and stop.',
  'Answer: { id, answer }, answer a one-line summary of the decision (never a secret, never their message pasted whole).',
  "The operator's own reply in chat already marks the item answered in the inbox; your answer records the decision.",
].join(' ')

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

/** Text cut to `max` characters, trimmed; newlines kept. */
export function cut(text: string, max: number): string {
  const chars = Array.from(text.trim())
  return chars.length <= max ? chars.join('') : `${chars.slice(0, max - 1).join('').trimEnd()}…`
}

// Token shapes a decision summary should never carry: provider keys, tokens, private keys,
// and long mixed letter-and-digit runs. A match is redacted; the rest of the answer stays.
const SECRETS: readonly RegExp[] = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(-----END [A-Z ]*PRIVATE KEY-----|$)/g,
  /\b(sk|pk|rk)-[A-Za-z0-9_-]{16,}/g,
  /\bgh[pousr]_[A-Za-z0-9]{20,}/g,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\b(?=[A-Za-z0-9_-]*\d)(?=[A-Za-z0-9_-]*[A-Za-z])[A-Za-z0-9_-]{32,}\b/g,
]

/**
 * The answer a ledger row keeps: one line, at most 500 characters, secret
 * shapes redacted; for `external_credentials` nothing of it at all.
 */
export function answerText(category: string, raw: string): string {
  if (category === 'external_credentials') return '(not recorded: credentials category)'
  let text = raw.replace(/\s+/g, ' ').trim()
  for (const shape of SECRETS) text = text.replace(shape, '[redacted]')
  return cut(text, ANSWER_MAX)
}

/** A slice id given as `N.M`, or undefined. */
export function sliceId(value: unknown): string | undefined {
  return typeof value === 'string' && /^\d+\.\d+$/.test(value.trim()) ? value.trim() : undefined
}

/** Reads a bts_hitl input: `{ id, answer }` answers, `{ category, question, ... }` raises. Pure. */
export function parseHitl(input: unknown): HitlRequest {
  const value = isObject(input) ? input : {}
  if (typeof value.id === 'string' && value.id.trim() !== '') {
    const answer = typeof value.answer === 'string' ? value.answer.trim() : ''
    if (answer === '') return { kind: 'invalid', text: 'not recorded: an answer needs both id and answer.' }
    return { kind: 'answer', id: value.id.trim(), answer }
  }
  const category = typeof value.category === 'string' ? value.category.trim() : ''
  if (!(CATEGORIES as readonly string[]).includes(category)) {
    return {
      kind: 'invalid',
      text: `not raised: category must be one of ${CATEGORIES.join(', ')} (or pass { id, answer } to answer an item).`,
    }
  }
  const question = typeof value.question === 'string' ? value.question.trim() : ''
  if (question === '') return { kind: 'invalid', text: 'not raised: question is required.' }
  const context = typeof value.context === 'string' && value.context.trim() !== '' ? cut(value.context, CONTEXT_MAX) : null
  const slice = sliceId(value.slice)
  return {
    kind: 'raise',
    raise: {
      category: category as PassHitlCategory,
      question: cut(question, QUESTION_MAX),
      context,
      ...(slice === undefined ? {} : { slice }),
      source: 'agent',
      asked: 'chat',
    },
  }
}

/** A HITL id: `hitl-` with the time in base 36 and two random characters. */
export function newId(t: number): string {
  return `hitl-${Math.max(0, Math.floor(t)).toString(36)}${Math.random().toString(36).slice(2, 4).padEnd(2, '0')}`
}

/** True for a prompt the operator typed (or sent from Remote Control, an SDK host or Slack), not a command or a machine's. */
export function isOperatorReply(e: Pick<PromptSubmitInput, 'origin' | 'command' | 'isMeta'>): boolean {
  // An unstamped origin (never the engine's, only a bare call) is not counted as the operator's.
  const origin: { kind?: unknown } | undefined = e.origin
  return e.command === undefined && e.isMeta !== true && typeof origin?.kind === 'string' && HUMAN_ORIGINS.has(origin.kind)
}

async function nowOf($: EngineInterface): Promise<number> {
  try {
    return await $.clock.now()
  } catch {
    return Date.now()
  }
}

/**
 * Raises one item: notifies (natively when it is blocking, else a toast), then
 * appends `hitl.raised` `{ id, category, question, context, source, asked,
 * kind, notify }` on its slice. Halts nothing; resolves the id at once.
 */
export async function raiseHitl($: EngineInterface, raise: HitlRaise): Promise<HitlRaised> {
  const t = await nowOf($)
  const id = newId(t)
  const c = await read($, checklistAtom).catch(() => null)
  const slice = raise.slice ?? (raise.pie === undefined ? activeSlice(c)?.id : undefined)
  const pie = raise.pie ?? (slice !== undefined ? Number(slice.split('.')[0]) : activePie(c)?.n)
  const notify = await notifyHitl($, {
    id,
    category: raise.category,
    question: raise.question,
    asked: raise.asked,
    slice,
  }).catch((): NotifyOutcome => ({ isSent: false, reason: 'error' }))
  const row = await record($, {
    ev: 'hitl.raised',
    ...(pie === undefined || Number.isNaN(pie) ? {} : { pie }),
    ...(slice === undefined ? {} : { slice }),
    data: {
      id,
      category: raise.category,
      question: raise.question,
      ...(raise.context ? { context: raise.context } : {}),
      source: raise.source,
      asked: raise.asked,
      ...(raise.kind === undefined ? {} : { kind: raise.kind }),
      notify,
    },
  })
  return { id, row, notify }
}

/** What an answer came to: recorded or not, and the text the caller reads. */
export type HitlAnswered = { ok: boolean; text: string; waitedMs?: number }

/**
 * Records an answer as `hitl.answered` `{ id, answer, waitedMs, via }`. An id
 * the ledger never raised is refused with text. The first answer closes the
 * item; a later one is ignored, except that the model's own summary after the
 * operator's reply or a pane press is kept once (the decision, not the close).
 */
export async function answerHitl($: EngineInterface, id: string, answer: string, via: HitlVia): Promise<HitlAnswered> {
  const rows = await readRows($)
  const raised = rows.find(row => row.ev === 'hitl.raised' && row.data?.id === id)
  if (!raised) {
    const open = rows
      .filter(row => row.ev === 'hitl.raised' && typeof row.data?.id === 'string')
      .map(row => String(row.data?.id))
      .filter(known => !rows.some(row => row.ev === 'hitl.answered' && row.data?.id === known))
    const list = open.length === 0 ? 'none are open' : `open: ${open.slice(-5).join(', ')}`
    return { ok: false, text: `not recorded: no HITL item has id ${id} (${list}).` }
  }
  const category = typeof raised.data?.category === 'string' ? raised.data.category : 'other'
  const answers = rows.filter(row => row.ev === 'hitl.answered' && row.data?.id === id)
  const first = answers[0]
  let waitedMs: number
  if (first) {
    const summarized = answers.some(row => row.data?.via === 'tool' || row.data?.via === undefined)
    if (via !== 'tool' || summarized) {
      return { ok: false, text: `already answered (${String(first.data?.via ?? 'tool')}); nothing changed.` }
    }
    waitedMs = Math.max(0, first.t - raised.t)
  } else {
    waitedMs = Math.max(0, (await nowOf($)) - raised.t)
  }
  const row = await record($, {
    ev: 'hitl.answered',
    ...(raised.pie === undefined ? {} : { pie: raised.pie }),
    ...(raised.slice === undefined ? {} : { slice: raised.slice }),
    data: { id, answer: via === 'tool' ? answerText(category, answer) : answer, waitedMs, via },
  })
  if (!row) return { ok: false, text: 'not recorded: the ledger could not be written. Nothing was halted.' }
  return { ok: true, text: JSON.stringify({ id, status: 'answered', waitedMs }), waitedMs }
}

/**
 * The operator replied in chat: every open item the model was told to ask
 * there, raised before now, is answered `via: 'reply'`; the reply's words are
 * never read or kept. Items only the pane showed stay open. Resolves how many.
 */
export async function closeOnReply($: EngineInterface): Promise<number> {
  const projection: PassProjection | null = await read($, ledgerAtom).catch(() => null)
  const open = projection?.hitl?.open ?? []
  if (open.length === 0) return 0
  const now = await nowOf($)
  let closed = 0
  for (const item of open) {
    if (item.asked !== 'chat' || item.t > now) continue
    const done = await answerHitl($, item.id, REPLY_ANSWER, 'reply')
    if (done.ok) closed += 1
  }
  return closed
}

/** The pane's button: answers one item `via: 'pane'`. */
export function markAnswered($: EngineInterface, id: string): Promise<HitlAnswered> {
  return answerHitl($, id, PANE_ANSWER, 'pane')
}

/**
 * Serves bts_hitl: a raise resolves `{ id, status: 'open', next, notify }` as
 * JSON text at once (`notify` says whether a native notification went, or why
 * not); an answer resolves its record.
 */
export async function serveHitl($: EngineInterface, input: unknown): Promise<string> {
  const request = parseHitl(input)
  if (request.kind === 'invalid') return request.text
  if (request.kind === 'answer') return (await answerHitl($, request.id, request.answer, 'tool')).text
  const raised = await raiseHitl($, request.raise)
  if (!raised.row) return `not raised: the ledger could not be written; ask the operator in chat anyway. Nothing was halted.`
  const notified = raised.notify.isSent ? `sent (${raised.notify.channel})` : `not sent: ${raised.notify.reason} (toast shown)`
  return JSON.stringify({ id: raised.id, status: 'open', next: NEXT_STEP, notify: notified })
}

/** Registers bts_hitl with its schema in the prompt's tool list; resolves the listed name. */
export async function registerHitl($: EngineInterface): Promise<string> {
  const listed = await $.tool.register({
    name: HITL_TOOL,
    description: DESCRIPTION,
    inputSchema: {
      type: 'object',
      properties: {
        category: { type: 'string', enum: [...CATEGORIES], description: 'Raise: the HITL category.' },
        question: { type: 'string', description: `Raise: the question for the operator, up to ${QUESTION_MAX} characters.` },
        context: { type: 'string', description: 'Raise: what triggered it, briefly. Never a secret.' },
        slice: { type: 'string', description: 'Raise: the slice id, N.M; the active slice when left out.' },
        id: { type: 'string', description: 'Answer: the id the raise returned.' },
        answer: { type: 'string', description: 'Answer: a one-line summary of the decision. Never a secret.' },
      },
      additionalProperties: false,
    },
    isDeferred: false,
  })
  return listed.tool
}
