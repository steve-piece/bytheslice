#!/usr/bin/env node
// hooks/workflow-nudge.js
// The workflow nudge: adds context, never refuses. On UserPromptSubmit, in a
// project with a master checklist, a /goal or a new-feature ask gets the intake
// rule (document with /special-order, build with /sell-slice or /sell-pie) and a
// "build Slice N.M" ask gets the /sell-slice route; with no checklist yet, an ask
// to build a whole app end to end gets the /pizza-party route. It is the one
// prompt hook ByTheSlice keeps: the model decides, the nudge only informs.
//
// `node workflow-nudge.js doctor [root]` prints whether the Feature intake rule
// is in the project rules file and whether the nudge is wired, for /setup-shop
// and /open-kitchen. `node workflow-nudge.js intake [root]` writes that rule
// (skills/setup-shop/references/feature-intake.md) into CLAUDE.md, or AGENTS.md
// when it is the only rules file, replacing an older copy in place.
//
// Hook contract: reads the hook JSON from stdin, always exits 0, prints at most
// one `additionalContext` object.

'use strict'

const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const CHECKLIST = path.join('docs', 'plans', '00_master_checklist.md')

// ---------------------------------------------------------------- utilities

function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8')
  } catch {
    return null
  }
}

function git(cwd, args) {
  try {
    return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 4000 }).trim()
  } catch {
    return null
  }
}

/** Where the project lives for this call: its checkout, the primary checkout and the checklist. */
function projectOf(cwd) {
  const top = git(cwd, ['rev-parse', '--show-toplevel'])
  let primary = null
  const common = git(cwd, ['rev-parse', '--path-format=absolute', '--git-common-dir'])
  if (common && path.basename(common) === '.git') primary = path.dirname(common)
  const roots = [...new Set([top, primary, process.env.CLAUDE_PROJECT_DIR, cwd].filter(Boolean))]
  // A worktree cut from origin holds no gitignored plans: the primary checkout's count.
  const root = roots.find(r => fs.existsSync(path.join(r, CHECKLIST))) ?? null
  return { cwd, top: top ?? cwd, primary: primary ?? top ?? cwd, roots, root, checklist: root ? path.join(root, CHECKLIST) : null }
}

// ---------------------------------------------------------------- prompts

/** An ask to build a whole app from scratch: the /pizza-party route when there is no checklist yet. */
function wantsWholeApp(prompt) {
  if (typeof prompt !== 'string' || /^\s*\/(?:[\w-]*bytheslice[\w-]*:)?pizza-party\b/.test(prompt)) return false
  return /\b(?:build|make|create|ship)\b[^.\n]{0,60}?\b(?:app|application|website|web app|product|saas)\b/i.test(prompt) && /\b(?:end[ -]to[ -]end|from scratch|production[ -]ready|all the way|fully|whole)\b/i.test(prompt)
}

const PARTY =
  'ByTheSlice: to build a whole app end to end, run /pizza-party with the brief. It asks every question once up front (AskUserQuestion), then sets up the project, writes the PRD and the pie/slice roadmap, builds every slice through the verified bakers, ships one PR and hands back a URL, without further stops.'

// A request opens the prompt: an optional softener, then the verb. A feature merely mentioned stays quiet.
const ASK =
  "^\\s*(?:(?:please|ok(?:ay)?|now|and|so)[,\\s]+)?(?:(?:let'?s|we (?:should|need to|want to|could)|i (?:want|need|would like|'d like) (?:you )?to|(?:can|could|would) you|go ahead and)\\s+)?"
const NEW_THING =
  '(?:new\\s+(?:[\\w-]+\\s+){0,2}?(?:features?|pies?|pipelines?|integrations?|capabilit(?:y|ies)|endpoints?|dashboards?|pages?|screens?|flows?|modules?|services?|requirements?)|(?:features?|pies?|pipelines?|requirements?|capabilit(?:y|ies)|integrations?))\\b'
// The words between the verb and the thing never name a test, a fix or a doc.
const GAP = '(?:(?!\\b(?:tests?|specs?|fix(?:es)?|bugs?|docs?|readme|typos?|lint|about|describe)\\b)[^.\\n?!]){0,40}?'
const FEATURE_ASK = new RegExp(`${ASK}(?:add|build|implement|create|introduce|develop|set up)\\b${GAP}\\b${NEW_THING}`, 'i')
const BAKER_COMMAND = /^\s*\/(?:[\w-]*bytheslice[\w-]*:)?(special-order|sell-slice|sell-pie|cook-pizzas|box-it-up|pizza-party|setup-shop|create-menu)\b/

/**
 * A new-feature ask: a prompt that opens by asking to add, build or create a new feature, pie,
 * pipeline or similar, or a `/goal` whose text does. Questions, fixes and a bare `/goal` stay quiet.
 */
function wantsNewWork(prompt) {
  if (typeof prompt !== 'string' || BAKER_COMMAND.test(prompt)) return false
  const goal = /^\s*\/goal\b/i.test(prompt)
  const body = prompt.replace(/^\s*\/goal\b/i, '').trim()
  if (goal) {
    if (body === '') return false
    if (FEATURE_ASK.test(body)) return true
    return !/\b(?:fix|bug|flaky|typos?|green|refactor|rename|investigate|debug)\b/i.test(body) && /\b(?:features?|pies?|pipelines?|requirements?|capabilit(?:y|ies)|integrations?)\b/i.test(body)
  }
  if (/\?\s*$/.test(body) && !/^(?:can|could|would) you\b/i.test(body)) return false
  return FEATURE_ASK.test(body)
}

/** The slice a prompt opens by asking to build (`implement Slice 2.2`, `build slice 3.1`), or null. */
function sliceToBuild(prompt) {
  if (typeof prompt !== 'string' || /^\s*\//.test(prompt)) return null
  return new RegExp(`${ASK}(?:implement|build|code|start|work on|do|finish)\\b[^.\\n]{0,40}?\\bslice\\s+(\\d+\\.\\d+)\\b`, 'i').exec(prompt)?.[1] ?? null
}

/** A turn that carries an agent's report or a task notice, not the person's words. */
const relayed = prompt => typeof prompt === 'string' && /<task-notification>|<agent-message\b|\[SYSTEM NOTIFICATION|\[Subagent hand-back\]/.test(prompt)

const bakerContext = id =>
  `ByTheSlice: Slice ${id} is documented in the master checklist, so it is usually built through /sell-slice ${id} (or /sell-pie for its whole pie), which runs implementer, slice-tester and slice-verifier and records the verifier pass the PR evidence reads.`

const INTAKE =
  'ByTheSlice feature intake: a new feature or requirement in this project is first documented with /special-order (it writes the pie, slices, stage files and checklist rows), then built with /sell-slice or /sell-pie; this holds for /goal runs too. Only new features need this: bug fixes, refactors, research, review, debugging and one-off tasks can use plain agents (general-purpose, Explore) or direct edits with no special order.'

function say(obj) {
  process.stdout.write(`${JSON.stringify(obj)}\n`)
}

// ---------------------------------------------------------------- intake

const INTAKE_START = '<!-- bytheslice:feature-intake:start -->'
const INTAKE_END = '<!-- bytheslice:feature-intake:end -->'
const INTAKE_SOURCE = path.join(__dirname, '..', 'skills', 'setup-shop', 'references', 'feature-intake.md')

/**
 * The rules file the intake block goes in: AGENTS.md when it exists and CLAUDE.md is missing or only
 * imports it (`@AGENTS.md`, as create-next-app scaffolds), else CLAUDE.md (created when missing).
 */
function rulesFileOf(root) {
  const claude = path.join(root, 'CLAUDE.md')
  const agents = path.join(root, 'AGENTS.md')
  if (!fs.existsSync(agents)) return claude
  const text = readText(claude)
  return text === null || /^\s*@AGENTS\.md\s*$/m.test(text) ? agents : claude
}

/** Writes the Feature intake block into the project rules file; prints what it did. */
function intake(rootArg) {
  // The folder named is the project: never climb to an enclosing repo's rules file.
  const root = path.resolve(rootArg || process.cwd())
  const source = readText(INTAKE_SOURCE) ?? ''
  const from = source.indexOf(INTAKE_START)
  const to = source.indexOf(INTAKE_END)
  if (from === -1 || to < from) {
    process.stdout.write(`Feature intake: not written (no block between the markers in ${INTAKE_SOURCE})\n`)
    process.exitCode = 1
    return
  }
  const block = source.slice(from, to + INTAKE_END.length)
  const file = rulesFileOf(root)
  const before = readText(file)
  let after
  if (before === null) after = `# Project Rules\n\n${block}\n`
  else {
    const a = before.indexOf(INTAKE_START)
    const b = before.indexOf(INTAKE_END)
    after = a !== -1 && b > a ? `${before.slice(0, a)}${block}${before.slice(b + INTAKE_END.length)}` : `${before.replace(/\s*$/, '')}\n\n${block}\n`
  }
  const name = path.basename(file)
  if (after === before) return process.stdout.write(`Feature intake: unchanged in ${name}\n`)
  fs.writeFileSync(file, after)
  process.stdout.write(`Feature intake: ${before === null ? 'created' : before.includes(INTAKE_START) ? 'updated in' : 'added to'} ${name}\n`)
}

// ---------------------------------------------------------------- doctor

/** The report /setup-shop and /open-kitchen print: intake rule, nudge wiring, checklist. */
function doctor(rootArg) {
  const root = path.resolve(rootArg || process.cwd())
  const project = projectOf(root)
  const lines = []
  const rules = ['CLAUDE.md', 'AGENTS.md'].map(name => path.join(root, name)).filter(file => fs.existsSync(file))
  const holder = rules.find(file => (readText(file) ?? '').includes(INTAKE_START))
  lines.push(
    holder
      ? `Feature intake: present in ${path.basename(holder)}`
      : `Feature intake: MISSING from ${rules.length === 0 ? 'CLAUDE.md (no rules file)' : rules.map(f => path.basename(f)).join(' and ')}; run /setup-shop to add it`,
  )
  let wired = false
  try {
    const hooks = JSON.parse(readText(path.join(__dirname, 'hooks.json'))).hooks
    wired = (hooks.UserPromptSubmit ?? []).some(group => group.hooks.some(h => h.command.includes('/hooks/workflow-nudge.sh')))
  } catch {
    wired = false
  }
  lines.push(wired ? 'Hooks: workflow nudge active on UserPromptSubmit (context only, never refuses)' : 'Hooks: workflow nudge NOT wired in hooks/hooks.json')
  lines.push(`Checklist: ${project.checklist ? path.relative(root, project.checklist) || project.checklist : 'none yet (the nudge stays quiet until /cook-pizzas writes one)'}`)
  process.stdout.write(`${lines.join('\n')}\n`)
}

// ---------------------------------------------------------------- main

function main() {
  if (process.argv[2] === 'doctor') return doctor(process.argv[3])
  if (process.argv[2] === 'intake') return intake(process.argv[3])
  let input = {}
  try {
    input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}')
  } catch {
    input = {}
  }
  if (input.hook_event_name !== 'UserPromptSubmit' || relayed(input.prompt)) return
  const cwd = typeof input.cwd === 'string' && input.cwd !== '' ? input.cwd : process.cwd()
  const project = projectOf(cwd)
  const context = text => say({ hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: text } })
  if (!project.checklist) return wantsWholeApp(input.prompt) ? context(PARTY) : undefined
  const slice = sliceToBuild(input.prompt)
  if (slice !== null) return context(bakerContext(slice))
  if (wantsNewWork(input.prompt)) context(INTAKE)
}

try {
  main()
} catch {
  // A crash adds no context and never stops the prompt.
}
