#!/usr/bin/env node
// hooks/workflow-guard.js
// The workflow guard: the one ByTheSlice hook that refuses a tool call. It keeps
// new work on the framework's road in a project with a master checklist:
//
//   PreToolUse Write|Edit|MultiEdit  plan files (docs/plans/stage_*.md, pie and
//                                    slice headings in the checklist) are written
//                                    by /special-order or /cook-pizzas only
//   PreToolUse Agent                 code-writing agents outside /sell-slice,
//                                    /sell-pie and /pizza-party are refused
//   PreToolUse Bash (and Cursor's    a plan file written from the shell is held to the
//   beforeShellExecution)            Write/Edit rule; `gh ... pr create` is refused
//                                    while a slice on the branch has no
//                                    slice-verifier pass
//   UserPromptSubmit                 a /goal or a new-feature ask gets the intake
//                                    rule as context, a "build Slice N.M" ask the
//                                    /sell-slice route (never refused)
//
// `enforcement` in bytheslice.config.json (or ~/.bytheslice/defaults.json) is
// "block" (the default) or "warn". BTS_ALLOW_BYPASS=1 in the environment Claude
// Code was launched with turns every refusal into a warning; it is the
// operator's switch, and the guard refuses an edit that sets it, or that sets
// `enforcement` to "warn", while enforcement is "block". ByTheSlice's own
// agents (`bytheslice:*`) pass untouched.
//
// `node workflow-guard.js doctor [root]` prints whether the Feature intake rule
// is in the project rules file, the enforcement mode and the hook wiring, for
// /setup-shop and /open-kitchen. `node workflow-guard.js intake [root]` writes
// that rule (skills/setup-shop/references/feature-intake.md) into CLAUDE.md, or
// AGENTS.md when it is the only rules file, replacing an older copy in place.
//
// Hook contract: reads the hook JSON from stdin, always exits 0. A refusal is a
// PreToolUse `permissionDecision: "deny"` (Cursor: `{"permission":"deny"}`); a
// warning is `additionalContext` for the model plus a `systemMessage`. Any
// error inside the guard lets the call through: it never refuses on a crash.

'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')

const CHECKLIST = path.join('docs', 'plans', '00_master_checklist.md')
const STAGE_FILE = /(^|[\\/])docs[\\/]plans[\\/]stage_[^\\/]*\.md$/
const CHECKLIST_FILE = /(^|[\\/])docs[\\/]plans[\\/]00_master_checklist\.md$/
const CONFIG_FILE = /(^|[\\/])bytheslice\.config\.json$/
const SETTINGS_FILE = /(^|[\\/])\.claude[\\/]settings(\.local)?\.json$/

/** ByTheSlice skills (the list the Pass tracks, mod/checks.ts SKILLS). */
const SKILLS = new Set([
  'sell-pie', 'sell-slice', 'box-it-up', 'cook-pizzas', 'special-order', 'pizza-party', 'inspect-display',
  'close-shop', 'setup-shop', 'set-display-case', 'open-the-shop', 'create-menu', 'final-quality-check',
])
/** The skills that write pies, slices and stage files. */
const PLANNERS = new Set(['special-order', 'cook-pizzas'])
/** The skills that build documented slices and may dispatch any agent. */
const BUILDERS = new Set(['sell-slice', 'sell-pie', 'pizza-party'])
/** Built-in agent types and whether they hold a write tool. */
const BUILTIN_WRITES = {
  'general-purpose': true, fork: true, 'statusline-setup': true, claude: true,
  explore: false, plan: false, 'claude-code-guide': false,
}
const WRITE_TOOLS = /^(Write|Edit|MultiEdit|NotebookEdit|\*)$/

const BYPASS_HELP =
  'Operator override only: set "enforcement": "warn" in bytheslice.config.json by hand, or relaunch Claude Code with BTS_ALLOW_BYPASS=1. Never set either yourself; ask the operator.'

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

/** Parses JSONC: line and block comments and trailing commas are dropped outside strings. */
function parseJsonc(text) {
  let out = ''
  let i = 0
  let str = false
  while (i < text.length) {
    const c = text[i]
    if (str) {
      out += c
      if (c === '\\') {
        out += text[i + 1] ?? ''
        i += 2
        continue
      }
      if (c === '"') str = false
      i += 1
    } else if (c === '"') {
      str = true
      out += c
      i += 1
    } else if (c === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i += 1
    } else if (c === '/' && text[i + 1] === '*') {
      i += 2
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i += 1
      i += 2
    } else {
      out += c
      i += 1
    }
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, '$1'))
}

/** The bare ByTheSlice skill name of a skill or command name, or null for any other. */
function skillName(name) {
  if (typeof name !== 'string') return null
  const bare = name.trim().replace(/^\//, '').replace(/^[\w-]*bytheslice[\w-]*:/, '')
  return SKILLS.has(bare) ? bare : null
}

/** The registered ByTheSlice agent names, from the plugin manifest beside this hook. */
function ownAgents() {
  const names = new Set()
  const manifest = readText(path.join(__dirname, '..', '.claude-plugin', 'plugin.json'))
  try {
    for (const entry of JSON.parse(manifest ?? '{}').agents ?? []) names.add(path.basename(entry, '.md'))
  } catch {
    // An unreadable manifest leaves only the `bytheslice:` prefix to go by.
  }
  return names
}

/** True for an agent type ByTheSlice ships: `bytheslice:<name>`, or a bare registered name. */
function isOwnAgent(type) {
  if (typeof type !== 'string' || type === '') return false
  if (/^[\w-]*bytheslice[\w-]*:/.test(type)) return true
  return ownAgents().has(type)
}

// ---------------------------------------------------------------- project

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

/** `{ mode: "block" | "warn", source, bypass }` from the env, the project config and the defaults. */
function enforcementOf(project) {
  const bypass = process.env.BTS_ALLOW_BYPASS === '1'
  const files = [
    ...project.roots.map(r => path.join(r, 'bytheslice.config.json')),
    path.join(process.env.BTS_HOME || path.join(os.homedir(), '.bytheslice'), 'defaults.json'),
  ]
  for (const file of files) {
    const text = readText(file)
    if (text === null) continue
    try {
      const value = parseJsonc(text).enforcement
      if (value === 'warn' || value === 'block') return { mode: bypass ? 'warn' : value, source: file, bypass }
    } catch {
      // A malformed config keeps the default: block.
    }
  }
  return { mode: bypass ? 'warn' : 'block', source: 'default', bypass }
}

/** The latest ByTheSlice skill this session started, read from the kitchen activity log. */
function activeSkill(project, sessionId) {
  if (typeof sessionId !== 'string' || sessionId === '') return null
  let best = null
  for (const root of new Set([...project.roots, project.primary])) {
    for (const name of ['activity.1.jsonl', 'activity.jsonl']) {
      const text = readText(path.join(root, '.claude', '.bytheslice-state', 'kitchen', name))
      if (text === null) continue
      for (const line of text.split('\n')) {
        if (!line.includes(sessionId) || !line.includes('"skill"')) continue
        try {
          const row = JSON.parse(line)
          const skill = row.sid === sessionId ? skillName(row.skill) : null
          if (skill !== null && (best === null || row.t >= best.t)) best = { t: row.t, skill }
        } catch {
          // A torn line is skipped.
        }
      }
    }
  }
  return best?.skill ?? null
}

// ---------------------------------------------------------------- checklist

/** The pie, slice and stage headings of checklist text, as `kind id title` keys (boxes and strikes ignored). */
function headings(text) {
  const keys = new Set()
  for (const line of (text ?? '').split(/\r?\n/)) {
    const m = /^\s*(#{2,3})\s+(?:\[[ xX-]\]\s*)?(?:~~)?\s*(Pie|Slice|Stage)\s+(\d+(?:\.\d+)?)\b(.*)$/i.exec(line)
    if (!m) continue
    const title = m[4]
      .replace(/<!--.*?-->/g, '')
      .replace(/\[[ xX-]\]/g, '')
      .replace(/~~/g, '')
      .replace(/^[\s:.\-|]+/, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase()
    keys.add(`${m[2].toLowerCase()} ${m[3]} ${title}`)
  }
  return keys
}

/** The text a Write, Edit or MultiEdit leaves in a file, or null when it cannot be told. */
function textAfter(tool, input, before) {
  if (tool === 'Write') return typeof input.content === 'string' ? input.content : null
  const edits = tool === 'MultiEdit' ? input.edits : [input]
  if (!Array.isArray(edits)) return null
  let text = before ?? ''
  for (const edit of edits) {
    if (typeof edit?.old_string !== 'string' || typeof edit?.new_string !== 'string') return null
    if (edit.old_string === '' ? text !== '' : !text.includes(edit.old_string)) return null
    text = edit.replace_all === true ? text.split(edit.old_string).join(edit.new_string) : text.replace(edit.old_string, () => edit.new_string)
  }
  return text
}

/** Headings a checklist change adds or renames: present after, absent before. */
function addedHeadings(tool, input, before) {
  const after = textAfter(tool, input, before)
  if (after !== null) {
    const was = headings(before)
    return [...headings(after)].filter(key => !was.has(key))
  }
  // The edit does not apply to the file as read: judge its own strings.
  const edits = tool === 'MultiEdit' && Array.isArray(input.edits) ? input.edits : [input]
  const added = []
  for (const edit of edits) {
    const was = headings(edit?.old_string)
    for (const key of headings(edit?.new_string ?? edit?.content)) if (!was.has(key)) added.push(key)
  }
  return added
}

/** Slice ids of each pie in the checklist. */
function slicesByPie(text) {
  const pies = new Map()
  let pie = null
  for (const line of (text ?? '').split(/\r?\n/)) {
    const p = /^\s*##\s+(?:\[[ xX-]\]\s*)?(?:~~)?\s*Pie\s+(\d+)\b/i.exec(line)
    if (p) {
      pie = Number(p[1])
      pies.set(pie, [])
      continue
    }
    const s = /^\s*###\s+(?:\[[ xX-]\]\s*)?(?:~~)?\s*Slice\s+(\d+\.\d+)\b/i.exec(line)
    if (s && pie !== null) pies.get(pie).push(s[1])
  }
  return pies
}

// ---------------------------------------------------------------- judges

/** A refusal or warning: `{ rule, text }`; a `soft` one only ever warns. */
const finding = (rule, text, soft = false) => ({ rule, text, soft })

function judgeWrite(input, ctx) {
  const tool = input.tool_name
  const ti = input.tool_input ?? {}
  const file = typeof ti.file_path === 'string' ? path.resolve(ctx.project.cwd, ti.file_path) : null
  if (file === null) return null
  const writer = input.agent_type

  // The operator's switches: an edit that loosens enforcement or sets the bypass.
  if (ctx.enforcement.mode === 'block' && (CONFIG_FILE.test(file) || SETTINGS_FILE.test(file))) {
    const after = textAfter(tool, ti, readText(file)) ?? `${ti.content ?? ''}${ti.new_string ?? ''}`
    const loosens = CONFIG_FILE.test(file)
      ? (() => {
          try {
            return parseJsonc(after).enforcement === 'warn'
          } catch {
            return /"enforcement"\s*:\s*"warn"/.test(after)
          }
        })()
      : /BTS_ALLOW_BYPASS|BTS_HOOKS_DISABLED/.test(after) && !/BTS_ALLOW_BYPASS|BTS_HOOKS_DISABLED/.test(readText(file) ?? '')
    if (loosens) {
      return finding(
        'operator-switch',
        `${path.basename(file)}: turning ByTheSlice enforcement off (enforcement "warn", BTS_ALLOW_BYPASS or BTS_HOOKS_DISABLED) is the operator's call, made by hand outside the agent. Ask the operator.`,
      )
    }
    return null
  }

  if (!ctx.project.checklist) return null
  if (isOwnAgent(writer) || PLANNERS.has(ctx.skill)) return null

  if (STAGE_FILE.test(file)) {
    const exists = fs.existsSync(file)
    // Delivery skills append build notes to an existing stage file by design.
    if (exists && ctx.skill !== null) return null
    const name = path.basename(file)
    return finding(
      'plan-file',
      `${exists ? 'Editing' : 'Creating'} ${name} by hand skips the framework: stage files are written by /special-order (new work) or /cook-pizzas (the roadmap), so complexity-assessor and phased-plan-writer size and plan the slices. Run /special-order with the feature request instead.`,
    )
  }

  if (CHECKLIST_FILE.test(file)) {
    const added = addedHeadings(tool, ti, readText(file))
    if (added.length === 0) return null
    const shown = added.slice(0, 4).map(key => key.split(' ').slice(0, 2).join(' ').replace(/^\w/, c => c.toUpperCase()))
    return finding(
      'plan-heading',
      `Adding or renaming checklist headings (${shown.join(', ')}${added.length > 4 ? ', ...' : ''}) by hand skips the framework: new pies and slices come from /special-order, which also writes their stage files. Run /special-order with the feature request instead. Ticking a box or editing a slice body is fine.`,
    )
  }
  return null
}

/** Where an agent type's definition file is, or null. */
function agentFile(type, project) {
  const [plugin, name] = type.includes(':') ? type.split(/:(.*)/s) : [null, type]
  if (plugin === null) {
    for (const dir of [...project.roots.map(r => path.join(r, '.claude', 'agents')), path.join(os.homedir(), '.claude', 'agents')]) {
      const file = path.join(dir, `${name}.md`)
      if (fs.existsSync(file)) return file
    }
    return null
  }
  // A plugin agent: an agents/**/<name>.md under a folder of the plugin's name, in the plugin cache.
  const base = path.join(os.homedir(), '.claude', 'plugins')
  const stack = [[base, 0, false]]
  while (stack.length > 0) {
    const [dir, depth, inPlugin] = stack.pop()
    let entries
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.git')) continue
      const full = path.join(dir, entry.name)
      if (entry.isFile() && inPlugin && entry.name === `${name}.md` && full.split(path.sep).includes('agents')) return full
      if (entry.isDirectory() && depth < 9) stack.push([full, depth + 1, inPlugin || entry.name === plugin])
    }
  }
  return null
}

/** The tool names a definition's frontmatter lists, or null when it lists none (all tools). */
function frontmatterList(text, key) {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text ?? '')
  if (!fm) return null
  const lines = fm[1].split(/\r?\n/)
  const at = lines.findIndex(line => new RegExp(`^${key}\\s*:`).test(line))
  if (at === -1) return null
  const inline = lines[at].replace(new RegExp(`^${key}\\s*:`), '').trim()
  if (inline !== '') return inline.replace(/^\[|\]$/g, '').split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean)
  const items = []
  for (const line of lines.slice(at + 1)) {
    const m = /^\s+-\s*(.+)$/.exec(line)
    if (!m) break
    items.push(m[1].trim().replace(/^["']|["']$/g, ''))
  }
  return items
}

/** Whether an agent type can write files: `true`, `false`, or `null` when its definition was not found. */
function writesCode(type, project) {
  const t = typeof type === 'string' && type !== '' ? type : 'general-purpose'
  const builtin = BUILTIN_WRITES[t.toLowerCase()]
  if (builtin !== undefined) return builtin
  const file = agentFile(t, project)
  if (file === null) return null
  const text = readText(file)
  const tools = frontmatterList(text, 'tools')
  const denied = new Set(frontmatterList(text, 'disallowedTools') ?? [])
  if (tools === null) return ![...['Write', 'Edit', 'MultiEdit', 'NotebookEdit']].every(tool => denied.has(tool))
  return tools.some(tool => WRITE_TOOLS.test(tool.split('(')[0]) && !denied.has(tool))
}

function judgeAgent(input, ctx) {
  if (!ctx.project.checklist) return null
  const type = input.tool_input?.subagent_type
  if (isOwnAgent(type) || isOwnAgent(input.agent_type) || BUILDERS.has(ctx.skill)) return null
  const writes = writesCode(type, ctx.project)
  if (writes === false) return null
  const shown = typeof type === 'string' && type !== '' ? type : 'general-purpose'
  const why = writes === null ? `(its definition was not found, so it is taken as one that can write)` : '(it has write tools)'
  return finding(
    'adhoc-agent',
    `Dispatching ${shown} ${why} outside /sell-slice or /sell-pie skips the framework: documented slices are built through /sell-slice (one careful slice) or /sell-pie (a whole pie), which run implementer, slice-tester and slice-verifier. New work is documented with /special-order first. Read-only agents (Explore, Plan) are fine.`,
  )
}

// A plan file named in a shell command, and the shell forms that write one.
const PLAN_REF = /(?:[^\s'"<>|;&()=]*\/)?docs\/plans\/(?:stage_[^\s'"<>|;&()]*|00_master_checklist\.md)/g
const REDIRECT_TO = />>?\s*['"]?([^\s'"<>|;&()]+)/g
const TEE_TO = /\btee\b((?:\s+-[a-z]+)*\s+['"]?[^\s'"|;&()]+)/g
const IN_PLACE = /\b(?:sed|perl|ruby)\b[^|;&\n]*\s-[a-zA-Z]*i/
const FILE_OPS = /(?:^|\s)(?:cp|mv|install|touch|truncate|rm|ln|dd)\s/
const SCRIPT_WRITE = /\b(?:python3?|node|ruby|perl|deno|bun)\b[\s\S]*(?:open\([^)]*['"][wa]|writeFile|appendFile|write_text|\.write\()/

/** The plan files one shell command writes: a redirect or tee into one, an in-place edit, a copy or move onto one, a script that opens one to write. */
function planWritesOf(command) {
  if (typeof command !== 'string' || !command.includes('docs/plans/')) return []
  const written = new Set()
  for (const segment of command.split(/&&|\|\||;|\n|\|/)) {
    const refs = segment.match(PLAN_REF) ?? []
    if (refs.length === 0) continue
    for (const m of segment.matchAll(REDIRECT_TO)) if (/docs\/plans\//.test(m[1])) written.add(m[1])
    for (const m of segment.matchAll(TEE_TO)) for (const ref of m[1].match(PLAN_REF) ?? []) written.add(ref)
    if (/(?:^|\s)(?:cp|mv|install|ln)\s/.test(segment)) {
      // A copy, move or link writes only its last operand.
      const last = segment.trim().split(/\s+/).pop()?.replace(/^['"]|['"]$/g, '') ?? ''
      if (/docs\/plans\/(?:stage_|00_master_checklist\.md)/.test(last)) written.add(last)
    } else if (IN_PLACE.test(segment) || FILE_OPS.test(segment) || SCRIPT_WRITE.test(segment)) {
      for (const ref of refs) written.add(ref)
    }
  }
  return [...written]
}

/** A plan file written from the shell, under the same exemptions as a Write or Edit (the shell cannot be diffed for headings). */
function judgeShellPlanWrite(input, ctx) {
  if (!ctx.project.checklist) return null
  if (isOwnAgent(input.agent_type) || PLANNERS.has(ctx.skill)) return null
  const written = planWritesOf(input.tool_input?.command)
  if (written.length === 0) return null
  const cwd = commandDir(input.tool_input.command, ctx.project.cwd)
  // During a ByTheSlice skill the shell may append to an existing plan file or tick the checklist.
  if (ctx.skill !== null && written.every(file => fs.existsSync(path.resolve(cwd, file)))) return null
  const names = [...new Set(written.map(file => path.basename(file)))]
  return finding(
    'plan-shell-write',
    `Writing ${names.join(', ')} from the shell skips the framework, the same as writing it with Write or Edit: stage files and checklist pies and slices come from /special-order (new work) or /cook-pizzas. Run /special-order with the feature request instead.`,
  )
}

/** True for a `gh ... pr create` (including `gh as <user> pr create`). */
const isPrCreate = command => typeof command === 'string' && /(^|[\s;&|(`])gh\b[^;&|\n]*?\bpr\s+create\b/.test(command)

/** The base branch the PR targets: `--base`/`-B`, else origin's default, else main or master. */
function baseOf(command, dir) {
  const given = /(?:--base[=\s]+|-B\s+)["']?([^\s"';&|]+)/.exec(command)?.[1]
  const candidates = given ? [`origin/${given}`, given] : []
  const head = git(dir, ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD'])
  if (head) candidates.push(head)
  candidates.push('origin/main', 'main', 'origin/master', 'master')
  return candidates.find(ref => git(dir, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]) !== null) ?? null
}

/** Slice ids a commit subject names: `feat(pie-N): N.M ...`, `Slice N.M`, `[N.M]`. */
function slicesIn(subject) {
  const ids = new Set()
  for (const re of [/\(pie-\d+\):\s*(\d+\.\d+)\b/gi, /\bslice\s+(\d+\.\d+)\b/gi, /\[(\d+\.\d+)\]/g]) {
    for (const m of subject.matchAll(re)) ids.add(m[1])
  }
  return ids
}

/** Slice ids with a slice-verifier pass in the ledger, or null when there is no ledger at all. */
function verifiedSlices(project) {
  const ok = new Set()
  let found = false
  for (const root of new Set([project.primary, ...project.roots])) {
    const text = readText(path.join(root, '.bytheslice', 'ledger.jsonl'))
    if (text === null) continue
    found = true
    for (const line of text.split('\n')) {
      if (!line.includes('slice-verifier')) continue
      try {
        const row = JSON.parse(line)
        if (row.ev === 'verdict' && row.data?.gate === 'slice-verifier' && row.data?.overall === 'pass' && typeof row.slice === 'string') ok.add(row.slice)
      } catch {
        // A torn line is skipped.
      }
    }
  }
  return found ? ok : null
}

/** The repository a command runs in: a leading `cd <dir> &&`, else the hook cwd. */
function commandDir(command, cwd) {
  const m = /^\s*(?:cd|pushd)\s+(?:"([^"]+)"|'([^']+)'|([^\s;&|]+))\s*&&/.exec(command)
  const raw = m ? (m[1] ?? m[2] ?? m[3]) : null
  if (!raw || raw.includes('$')) return cwd
  return path.resolve(cwd, raw.replace(/^~(?=$|\/)/, os.homedir()))
}

function judgePr(command, ctx) {
  if (!isPrCreate(command)) return null
  const dir = commandDir(command, ctx.project.cwd)
  const project = dir === ctx.project.cwd ? ctx.project : projectOf(dir)
  if (!project.checklist) return null
  const base = baseOf(command, dir)
  if (base === null) return null
  const log = git(dir, ['log', '--format=%s', `${base}..HEAD`])
  if (log === null || log === '') return null
  const ids = new Set()
  for (const subject of log.split('\n')) for (const id of slicesIn(subject)) ids.add(id)
  // A pie branch whose commits name no slice: every slice of that pie is in the PR.
  const branch = git(dir, ['rev-parse', '--abbrev-ref', 'HEAD']) ?? ''
  const pie = /(^|\/)pie[-/](\d+)/.exec(branch)
  if (ids.size === 0 && pie) for (const id of slicesByPie(readText(project.checklist)).get(Number(pie[2])) ?? []) ids.add(id)
  if (ids.size === 0) return null
  const verified = verifiedSlices(project)
  const sorted = [...ids].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  // No ledger at all: the Pass never ran here (Cursor, an older Claude Code), so verdicts cannot be read.
  if (verified === null) {
    return finding(
      'pr-unverified',
      `No Pass ledger (.bytheslice/ledger.jsonl) to check ${sorted.length === 1 ? 'Slice' : 'Slices'} ${sorted.join(', ')} against, so their slice-verifier runs cannot be confirmed. Make sure each ran through /sell-slice or /sell-pie before this PR.`,
      true,
    )
  }
  const missing = sorted.filter(id => !verified.has(id))
  if (missing.length === 0) return null
  return finding(
    'pr-unverified',
    `This PR skips slice verification: ${missing.length === 1 ? 'Slice' : 'Slices'} ${missing.join(', ')} ${missing.length === 1 ? 'has' : 'have'} commits on ${branch || 'this branch'} but no slice-verifier pass in the Pass ledger (.bytheslice/ledger.jsonl). Run each through /sell-slice (or /sell-pie) so slice-tester and slice-verifier run, then open the PR with /box-it-up.`,
  )
}

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
  `ByTheSlice: Slice ${id} is documented in the master checklist, so it is built through /sell-slice ${id} (or /sell-pie for its whole pie), which runs implementer, slice-tester and slice-verifier. Do not implement it directly: the Pass refuses to mark a slice done without a slice-verifier pass, and the guard refuses its PR.`

const INTAKE =
  'ByTheSlice feature intake: this project plans work through the framework. Before writing any code for a new feature, requirement or multi-file fix, document it with /special-order (it writes the pie, slices, stage files and checklist rows), then build it with /sell-slice or /sell-pie. This holds for /goal runs, loops and other skills too.'

// ---------------------------------------------------------------- output

function say(obj) {
  process.stdout.write(`${JSON.stringify(obj)}\n`)
}

function answer(found, ctx, event) {
  if (process.env.BTS_HOST === 'cursor') {
    if (!found) return say({ permission: 'allow' })
    if (ctx.enforcement.mode === 'block' && !found.soft) {
      const text = `BLOCKED [bytheslice ${found.rule}] ${found.text} ${BYPASS_HELP}`
      return say({ permission: 'deny', user_message: text, agent_message: text })
    }
    const text = `WARN [bytheslice ${found.rule}] ${found.text} ${found.soft ? 'It went ahead.' : `Enforcement is warn${ctx.enforcement.bypass ? ' (operator bypass)' : ''}, so it went ahead.`}`
    return say({ permission: 'allow', user_message: text, agent_message: text })
  }
  if (!found) return
  if (ctx.enforcement.mode === 'block' && !found.soft) {
    const text = `BLOCKED [bytheslice ${found.rule}] ${found.text} ${BYPASS_HELP}`
    return say({
      systemMessage: `ByTheSlice refused a ${event} call (${found.rule}).`,
      hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: text },
    })
  }
  const text = `WARN [bytheslice ${found.rule}] ${found.text} ${found.soft ? 'The call went ahead.' : `Enforcement is warn${ctx.enforcement.bypass ? ' (operator bypass, BTS_ALLOW_BYPASS=1)' : ''}, so the call went ahead.`}`
  say({ systemMessage: text, hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: text } })
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

/** The report /setup-shop and /open-kitchen print: intake rule, enforcement, wiring. */
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
  const enforcement = enforcementOf(project)
  lines.push(
    `Enforcement: ${enforcement.mode}${enforcement.bypass ? ' (BTS_ALLOW_BYPASS=1 is set: every refusal is a warning)' : ''} (${enforcement.source === 'default' ? 'default' : path.relative(root, enforcement.source) || enforcement.source})`,
  )
  let wired = []
  try {
    const hooks = JSON.parse(readText(path.join(__dirname, 'hooks.json'))).hooks
    for (const [event, groups] of Object.entries(hooks)) {
      for (const group of groups) {
        if (group.hooks.some(h => h.command.includes('/hooks/workflow-guard.sh'))) wired.push(group.matcher ? `${event} ${group.matcher}` : event)
      }
    }
  } catch {
    wired = []
  }
  const off = process.env.BTS_HOOKS_DISABLED === '1'
    ? 'BTS_HOOKS_DISABLED=1 is set'
    : ['settings.json', 'settings.local.json'].some(name => /"disableAllHooks"\s*:\s*true/.test(readText(path.join(root, '.claude', name)) ?? ''))
      ? 'disableAllHooks is true in .claude settings'
      : null
  lines.push(
    wired.length === 0
      ? 'Hooks: workflow guard NOT wired in hooks/hooks.json'
      : `Hooks: workflow guard ${off ? `wired but OFF (${off})` : 'active'} on ${wired.join(', ')}`,
  )
  lines.push(`Checklist: ${project.checklist ? path.relative(root, project.checklist) || project.checklist : 'none yet (the guard stays quiet until /cook-pizzas writes one)'}`)
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
  const cursor = process.env.BTS_HOST === 'cursor'
  const cwd = typeof input.cwd === 'string' && input.cwd !== '' ? input.cwd : process.cwd()
  const project = projectOf(cwd)
  const ctx = { project, enforcement: enforcementOf(project), skill: null }

  if (cursor) return answer(judgeShellPlanWrite({ tool_input: { command: input.command } }, ctx) ?? judgePr(input.command, ctx), ctx, 'shell')

  const event = input.hook_event_name
  if (event === 'UserPromptSubmit') {
    if (!project.checklist) {
      if (wantsWholeApp(input.prompt)) say({ hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: PARTY } })
      return
    }
    const slice = sliceToBuild(input.prompt)
    if (slice !== null) return say({ hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: bakerContext(slice) } })
    if (!wantsNewWork(input.prompt)) return
    return say({ hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: INTAKE } })
  }
  if (event !== 'PreToolUse') return
  ctx.skill = activeSkill(project, input.session_id)
  const tool = input.tool_name
  if (tool === 'Write' || tool === 'Edit' || tool === 'MultiEdit') return answer(judgeWrite(input, ctx), ctx, tool)
  if (tool === 'Agent' || tool === 'Task') return answer(judgeAgent(input, ctx), ctx, tool)
  if (tool === 'Bash') return answer(judgeShellPlanWrite(input, ctx) ?? judgePr(input.tool_input?.command, ctx), ctx, tool)
}

try {
  main()
} catch {
  // Never refuse on a crash: Cursor still needs its answer.
  if (process.env.BTS_HOST === 'cursor') process.stdout.write('{"permission":"allow"}\n')
}
