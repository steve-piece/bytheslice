// hooks/checklist-check.js
// Two warn-only checklist hooks, run by checklist-check.sh: `edit` (PostToolUse) runs the shared format check after an edit to the master checklist; `pr` (PreToolUse Bash) warns when `gh pr create` opens a slice-related PR that leaves the checklist unchanged. Both add context and exit 0; neither ever blocks.
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

function emit(event, context) {
  process.stdout.write(`${JSON.stringify({ hookSpecificOutput: { hookEventName: event, additionalContext: context } })}\n`);
}

const dirOf = input => (typeof input.cwd === 'string' && fs.existsSync(input.cwd) ? input.cwd : process.cwd());

// The same report again in one session is noise: remember the last one per session and checklist.
function isRepeat(input, file, report) {
  const key = crypto.createHash('sha1').update(`${input.session_id || ''}\0${file}`).digest('hex').slice(0, 16);
  const mark = path.join(os.tmpdir(), `bytheslice-format-${key}`);
  const digest = crypto.createHash('sha1').update(report).digest('hex');
  try { if (fs.readFileSync(mark, 'utf8') === digest) return true; } catch { /* First report this session. */ }
  try { fs.writeFileSync(mark, digest); } catch { /* A read-only temp dir only loses the dedupe. */ }
  return false;
}

function onEdit(input) {
  const target = input.tool_input && (input.tool_input.file_path || input.tool_input.path);
  if (typeof target !== 'string' || !CHECKLIST_FILE.test(target)) return;
  const file = path.isAbsolute(target) ? target : path.resolve(dirOf(input), target);
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
  const git = gitIn(dirOf(input));
  const top = git('rev-parse', '--show-toplevel');
  if (!top) return;
  const base = baseRef(command, git);
  const home = plansHome(top, git, base);
  if (!home || !base) return;
  const fork = git('merge-base', base, 'HEAD');
  if (!fork) return;
  const changed = (git('diff', '--name-only', `${fork}..HEAD`) || '').split('\n').filter(Boolean);
  if (!changed.length || changed.includes(REL)) return;
  if (!home.tracked && home.dir) {
    // A gitignored checklist never shows in the diff: an edit since the branch's first commit counts as an update.
    const first = Number((git('log', '--format=%ct', `${fork}..HEAD`) || '').split('\n').filter(Boolean).pop() || 0);
    try { if (first && fs.statSync(path.join(home.dir, REL)).mtimeMs / 1000 >= first) return; } catch { return; }
  }
  const subjects = (git('log', '--format=%s', `${fork}..HEAD`) || '').split('\n').filter(Boolean);
  const reason = sliceReason(changed, subjects, git('rev-parse', '--abbrev-ref', 'HEAD'), planTexts(home, git, base));
  if (!reason) return;
  emit('PreToolUse', [
    `[bytheslice checklist] This PR leaves ${REL} unchanged, but it looks slice-related: ${reason}.`,
    'Update the checklist first: set the `**Status:**` line of each slice this PR delivers or changes (and its pie heading when the pie is now complete), commit that on this branch, then open the PR.',
    'If this PR changes no slice, go ahead as planned. This is a warning only; nothing is blocked.',
  ].join('\n'));
}

if (require.main === module) {
  try {
    const mode = process.argv[2];
    const input = readInput();
    if (mode === 'edit') onEdit(input);
    else if (mode === 'pr') onPr(input);
  } catch { /* A warning hook never fails its tool call. */ }
  process.exit(0);
}

module.exports = { PR_CREATE, sliceReason, baseRef };
