// hooks/checklist-check.js
// Two warn-only checklist hooks, run by checklist-check.sh: `edit` (PostToolUse) runs the shared format check after an edit to the master checklist; `pr` (PreToolUse Bash) warns when `gh pr create` opens a slice-related PR that leaves the checklist unchanged. Both add context and exit 0; neither ever blocks.
// With BTS_HOST=cursor both run on Cursor's postToolUse and answer {"additional_context": ...}, the one Cursor output the agent is documented to read on an allowed call; so on Cursor the PR warning arrives just after the PR opens and asks for a follow-up checklist commit.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { validateChecklist, formatReport } = require('../mcp/checklist-format.js');

const REL = 'docs/plans/00_master_checklist.md';
const CHECKLIST_FILE = /(^|[\\/])docs[\\/]plans[\\/]00_master_checklist\.md$/;
// `gh pr create`, `gh pr new`, and the `gh as <user> pr create` form, with any -R/--repo before `pr`.
const PR_CREATE = /(?:^|[\s;&|(`'"])gh(?:\s+as\s+[\w.-]+)?(?:\s+(?:-R|--repo)(?:=|\s+)\S+)*\s+pr\s+(?:create|new)(?=\s|$|[;&|)`'"])/;
// Commit subjects and branch names that say which pie or slice the work belongs to.
const SLICE_WORDS = /\bpie[- ]?\d+\b|\bslice\s+\d+\.\d+|\(pie-\d+\)|\b\d+\.\d+[a-z]?\s+task\s+\d+/i;
const SLICE_BRANCH = /(^|\/)(?:pie|slice)[-/]?\d/i;
const PLAN_FILE = /^docs\/plans\/(?:stage|pie)_[^/]+\.md$/;
const DOC_ONLY = /\.(?:md|mdx|txt)$|^\.github\/|(?:^|\/)(?:pnpm-lock\.yaml|package-lock\.json|yarn\.lock|bun\.lockb?)$/;

function readInput() {
  try { return JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch { return {}; }
}

const CURSOR = process.env.BTS_HOST === 'cursor';
let emitted = false;

function emit(event, context) {
  emitted = true;
  const out = CURSOR ? { additional_context: context } : { hookSpecificOutput: { hookEventName: event, additionalContext: context } };
  process.stdout.write(`${JSON.stringify(out)}\n`);
}

// The folder the call ran in: the hook's cwd, else Cursor's first workspace root. Null when the input
// names folders and none exists; this process's folder only when the input names none.
function dirOf(input) {
  const roots = Array.isArray(input.workspace_roots) ? input.workspace_roots : [];
  const named = [input.cwd, ...roots].filter(dir => typeof dir === 'string' && dir);
  if (!named.length) return process.cwd();
  return named.find(dir => fs.existsSync(dir)) || null;
}

// The edited file: Claude Code sends file_path; Cursor tools name it file_path, path or target_file.
function editedFile(input) {
  const ti = input.tool_input && typeof input.tool_input === 'object' ? input.tool_input : {};
  return [ti.file_path, ti.path, ti.target_file, ti.filePath, input.file_path].find(v => typeof v === 'string' && CHECKLIST_FILE.test(v)) || null;
}

// The same report again in one session is noise: remember the last one per session and checklist.
function isRepeat(input, file, report) {
  const key = crypto.createHash('sha1').update(`${input.session_id || input.conversation_id || ''}\0${file}`).digest('hex').slice(0, 16);
  const mark = path.join(os.tmpdir(), `bytheslice-format-${key}`);
  const digest = crypto.createHash('sha1').update(report).digest('hex');
  try { if (fs.readFileSync(mark, 'utf8') === digest) return true; } catch { /* First report this session. */ }
  try { fs.writeFileSync(mark, digest); } catch { /* A read-only temp dir only loses the dedupe. */ }
  return false;
}

function onEdit(input) {
  const target = editedFile(input);
  if (!target) return;
  const dir = dirOf(input);
  if (!path.isAbsolute(target) && !dir) return;
  const file = path.isAbsolute(target) ? target : path.resolve(dir, target);
  let markdown;
  try { markdown = fs.readFileSync(file, 'utf8'); } catch { return; }
  const report = formatReport(validateChecklist(markdown), REL);
  if (report && !isRepeat(input, file, report)) emit('PostToolUse', report);
}

function gitIn(dir) {
  return (...args) => {
    try {
      return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 4000 }).trim();
    } catch { return null; }
  };
}

// The PR's base: --base/-B when given (its origin ref when one exists), else origin's default branch.
function baseRef(command, git) {
  const named = /(?:^|\s)(?:--base|-B)(?:=|\s+)['"]?([\w./-]+)/.exec(command)?.[1];
  const candidates = named ? [`origin/${named}`, named]
    : [git('symbolic-ref', '-q', '--short', 'refs/remotes/origin/HEAD'), 'origin/main', 'origin/master', 'main', 'master'];
  return candidates.find(ref => ref && git('rev-parse', '-q', '--verify', `${ref}^{commit}`)) || null;
}

// The PR's head: --head/-H when given (an `owner:branch` form drops the owner; the local branch, else its
// origin ref), else this checkout's HEAD. `name` is the branch name the slice words are read from.
function headRef(command, git) {
  const named = /(?:^|\s)(?:--head|-H)(?:=|\s+)['"]?([\w./:-]+)/.exec(command)?.[1];
  if (!named) return { ref: 'HEAD', name: git('rev-parse', '--abbrev-ref', 'HEAD') };
  const branch = named.includes(':') ? named.slice(named.indexOf(':') + 1) : named;
  const ref = [`refs/heads/${branch}`, `refs/remotes/origin/${branch}`].find(candidate => git('rev-parse', '-q', '--verify', `${candidate}^{commit}`));
  return ref ? { ref, name: branch } : null;
}

// Where the checklist and the slice plans live: this checkout, else the primary checkout (a gitignored
// docs/plans/ exists only there), else the project dir. Null when the project has no checklist at all.
function plansHome(top, git, base) {
  const common = git('rev-parse', '--path-format=absolute', '--git-common-dir');
  const dirs = [top, common && common.replace(/[\\/]\.git$/, ''), process.env.CLAUDE_PROJECT_DIR].filter(Boolean);
  const local = dirs.find(dir => fs.existsSync(path.join(dir, REL)));
  if (local) return { dir: local, tracked: git('ls-files', '--error-unmatch', REL) !== null };
  if (base && git('cat-file', '-e', `${base}:${REL}`) !== null) return { dir: null, tracked: true };
  return null;
}

function planTexts(home, git, base) {
  if (home.dir) {
    const dir = path.join(home.dir, 'docs/plans');
    try {
      return fs.readdirSync(dir).filter(name => PLAN_FILE.test(`docs/plans/${name}`))
        .map(name => { try { return fs.readFileSync(path.join(dir, name), 'utf8'); } catch { return ''; } });
    } catch { return []; }
  }
  const names = (git('ls-tree', '--name-only', base, 'docs/plans/') || '').split('\n').filter(name => PLAN_FILE.test(name));
  return names.map(name => git('show', `${base}:${name}`) || '');
}

// Why the branch looks slice-related, or null. Code files a slice plan names, a plan edit, or pie/slice words.
function sliceReason(changed, subjects, branch, plans) {
  const code = changed.filter(file => !DOC_ONLY.test(file));
  const named = code.filter(file => plans.some(plan => plan.includes(file)));
  if (named.length) return `it changes ${named.slice(0, 3).join(', ')}${named.length > 3 ? ` and ${named.length - 3} more` : ''}, named in the slice plans`;
  const plan = changed.find(file => PLAN_FILE.test(file));
  if (plan) return `it edits the slice plan ${plan}`;
  const subject = subjects.find(line => SLICE_WORDS.test(line));
  if (subject && code.length) return `its commit "${subject.slice(0, 80)}" names a pie or slice`;
  if (SLICE_BRANCH.test(branch || '') && code.length) return `its branch ${branch} is a pie or slice branch`;
  return null;
}

function onPr(input) {
  const command = input.tool_input && input.tool_input.command;
  if (typeof command !== 'string' || !PR_CREATE.test(command)) return;
  const dir = dirOf(input);
  if (!dir) return;
  const git = gitIn(dir);
  const top = git('rev-parse', '--show-toplevel');
  if (!top) return;
  const base = baseRef(command, git);
  const home = plansHome(top, git, base);
  if (!home || !base) return;
  const head = headRef(command, git);
  if (!head) return;
  const fork = git('merge-base', base, head.ref);
  if (!fork) return;
  const changed = (git('diff', '--name-only', `${fork}..${head.ref}`) || '').split('\n').filter(Boolean);
  if (!changed.length || changed.includes(REL)) return;
  if (!home.tracked && home.dir) {
    // A gitignored checklist never shows in the diff: an edit since the branch's first commit counts as an update.
    const first = Number((git('log', '--format=%ct', `${fork}..${head.ref}`) || '').split('\n').filter(Boolean).pop() || 0);
    try { if (first && fs.statSync(path.join(home.dir, REL)).mtimeMs / 1000 >= first) return; } catch { return; }
  }
  const subjects = (git('log', '--format=%s', `${fork}..${head.ref}`) || '').split('\n').filter(Boolean);
  const reason = sliceReason(changed, subjects, head.name, planTexts(home, git, base));
  if (!reason) return;
  const fix = 'set the `**Status:**` line of each slice this PR delivers or changes (and its pie heading when the pie is now complete)';
  emit('PreToolUse', (CURSOR ? [
    `[bytheslice checklist] This PR left ${REL} unchanged, but it looks slice-related: ${reason}.`,
    `Update the checklist now: ${fix}, commit that on this branch and push, so the open PR carries it.`,
    'If this PR changes no slice, nothing more is needed. This is a warning only; nothing was blocked.',
  ] : [
    `[bytheslice checklist] This PR leaves ${REL} unchanged, but it looks slice-related: ${reason}.`,
    `Update the checklist first: ${fix}, commit that on this branch, then open the PR.`,
    'If this PR changes no slice, go ahead as planned. This is a warning only; nothing is blocked.',
  ]).join('\n'));
}

if (require.main === module) {
  try {
    const mode = process.argv[2];
    const input = readInput();
    if (mode === 'edit') onEdit(input);
    else if (mode === 'pr') onPr(input);
  } catch { /* A warning hook never fails its tool call. */ }
  if (CURSOR && !emitted) process.stdout.write('{}\n');  // Cursor reads JSON on every exit.
  process.exit(0);
}

module.exports = { PR_CREATE, sliceReason, baseRef, headRef, editedFile };
