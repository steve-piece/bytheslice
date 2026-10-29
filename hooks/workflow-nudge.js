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

/** A new-feature ask: a /goal, or words that ask for a new feature, pie or pipeline. */
function wantsNewWork(prompt) {
  if (typeof prompt !== 'string') return false
  if (/^\s*\/(?:[\w-]*bytheslice[\w-]*:)?(special-order|sell-slice|sell-pie|cook-pizzas|box-it-up|pizza-party|setup-shop|create-menu)\b/.test(prompt)) return false
  if (/^\s*\/goal\b/i.test(prompt)) return true
  return /\b(new|add(?:ing)?|build(?:ing)?|implement(?:ing)?|create|introduce|ship|set up)\b[^.\n]{0,60}?\b(features?|pies?|pipelines?|requirements?|capabilit(?:y|ies)|integrations?|endpoints?|pages?|screens?|flows?|modules?|services?)\b/i.test(prompt)
}

/** The slice a prompt asks to build (`implement Slice 2.2`, `build slice 3.1`), or null. */
function sliceToBuild(prompt) {
  if (typeof prompt !== 'string' || /^\s*\//.test(prompt)) return null
  return /\b(?:implement|build|code|ship|start|work on|do|finish)\b[^.\n]{0,40}?\bslice\s+(\d+\.\d+)\b/i.exec(prompt)?.[1] ?? null
}

const bakerContext = id =>
  `ByTheSlice: Slice ${id} is documented in the master checklist, so it is usually built through /sell-slice ${id} (or /sell-pie for its whole pie), which runs implementer, slice-tester and slice-verifier and records the verifier pass the PR evidence reads.`

const INTAKE =
  'ByTheSlice feature intake: this project plans work through the framework. Before writing any code for a new feature, requirement or multi-file fix, document it with /special-order (it writes the pie, slices, stage files and checklist rows), then build it with /sell-slice or /sell-pie. This holds for /goal runs, loops and other skills too.'

function say(obj) {
  process.stdout.write(`${JSON.stringify(obj)}\n`)
}

// ---------------------------------------------------------------- intake

const INTAKE_START = '<!-- bytheslice:feature-intake:start -->'
const INTAKE_END = '<!-- bytheslice:feature-intake:end -->'
const INTAKE_SOURCE = path.join(__dirname, '..', 'skills', 'setup-shop', 'references', 'feature-intake.md')

/** The rules file the intake block goes in: CLAUDE.md, else an existing AGENTS.md, else a new CLAUDE.md. */
function rulesFileOf(root) {
  const claude = path.join(root, 'CLAUDE.md')
  const agents = path.join(root, 'AGENTS.md')
  return !fs.existsSync(claude) && fs.existsSync(agents) ? agents : claude
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
  if (input.hook_event_name !== 'UserPromptSubmit') return
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
