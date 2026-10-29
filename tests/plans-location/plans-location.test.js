// tests/plans-location/plans-location.test.js
// Maintainer test: gitignored plans resolve to the primary checkout from a worktree, and every closeout that flips the checklist points at that rule.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const standard = read('skills/cook-pizzas/references/git-worktree-standard.md');
const snippet = standard.match(/### Where the plans live[\s\S]*?```bash\n([\s\S]*?)```/)[1];

const git = (cwd, ...args) => execFileSync('git', args, { cwd, stdio: 'pipe' }).toString().trim();

function repo(ignored) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'bts-plans-')));
  const primary = path.join(dir, 'primary');
  fs.mkdirSync(path.join(primary, 'docs/plans'), { recursive: true });
  git(primary, 'init', '-q', '-b', 'main');
  if (ignored) fs.writeFileSync(path.join(primary, '.gitignore'), 'docs/plans/\n');
  fs.writeFileSync(path.join(primary, 'docs/plans/00_master_checklist.md'), '## Pie 1\n');
  git(primary, 'add', '-A');
  git(primary, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'init');
  const wt = path.join(dir, 'wt');
  git(primary, 'worktree', 'add', '-q', '-b', 'slice', wt);
  return { dir, primary, wt };
}

function resolvePlans(wt) {
  return execFileSync('bash', ['-c', `${snippet}\nprintf '%s' "$PLANS"`], {
    cwd: wt, env: { ...process.env, WORKTREE_PATH: wt },
  }).toString();
}

test('gitignored plans resolve to the primary checkout, which is the only copy', () => {
  const { dir, primary, wt } = repo(true);
  try {
    assert.equal(fs.existsSync(path.join(wt, 'docs/plans/00_master_checklist.md')), false);
    assert.equal(resolvePlans(wt), path.join(primary, 'docs/plans'));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('tracked plans resolve to the worktree copy', () => {
  const { dir, wt } = repo(false);
  try {
    assert.equal(resolvePlans(wt), path.join(wt, 'docs/plans'));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('merge-per-slice marks gitignored plans only after the merge', () => {
  const m = read('skills/sell-pie/SKILL.md').match(/### Phase 1-M[\s\S]*?(?=\n### )/)[0];
  assert.match(m, /\$PLANS/);
  assert.match(m, /Gitignored plans \(the default\):\*\* do not mark yet/);
  assert.match(m, /Once the closeout reports the merge, make step 3's mark in `\$PLANS\/00_master_checklist\.md`/);
});

test('every skill that flips the checklist from a worktree links the plans rule', () => {
  for (const f of ['sell-pie', 'sell-slice', 'box-it-up', 'pizza-party']) {
    assert.match(read(`skills/${f}/SKILL.md`), /git-worktree-standard\.md`?, "Where the plans live"/, f);
  }
});
