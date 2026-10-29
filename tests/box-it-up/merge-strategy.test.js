// tests/box-it-up/merge-strategy.test.js
// Covers pick-merge-strategy.js: an empty slice commit forces a merge commit, since GitHub's rebase-merge would drop it; slice-merge and ship PRs always take one.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { emptyCommits, pickMergeStrategy } = require('../../skills/box-it-up/pick-merge-strategy');

const SCRIPT = path.join(__dirname, '../../skills/box-it-up/pick-merge-strategy.js');
const ALL = { rebaseMergeAllowed: true, mergeCommitAllowed: true, squashMergeAllowed: true };

function repo(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bts-merge-strategy-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', ['-c', 'user.email=t@e', '-c', 'user.name=t', ...args], { cwd: dir, encoding: 'utf8' }).trim();
  git('init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(dir, 'a.txt'), 'a\n');
  git('add', 'a.txt');
  git('commit', '-q', '-m', 'base');
  git('branch', 'base');
  git('checkout', '-q', '-b', 'pie-9-test');
  return { dir, git };
}

function commitFile(r, name, subject) {
  fs.writeFileSync(path.join(r.dir, name), subject + '\n');
  r.git('add', name);
  r.git('commit', '-q', '-m', subject);
}

test('a branch with only content commits rebases', (t) => {
  const r = repo(t);
  commitFile(r, 'b.txt', 'feat(pie-9): 9.1 task 1 b');
  assert.deepEqual(emptyCommits(r.dir, 'base'), []);
  assert.equal(pickMergeStrategy({ empty: [], repo: ALL }).strategy, 'rebase');
});

test('an empty slice-close commit forces a merge commit', (t) => {
  const r = repo(t);
  commitFile(r, 'b.txt', 'feat(pie-9): 9.1 task 1 b');
  r.git('commit', '-q', '--allow-empty', '-m', 'feat(pie-9): 9.1 Slice One');
  const sha = r.git('rev-parse', 'HEAD');
  assert.deepEqual(emptyCommits(r.dir, 'base'), [sha]);
  assert.deepEqual(pickMergeStrategy({ empty: [sha], repo: ALL }), { strategy: 'merge', reason: 'empty-commits' });
});

test('empty commits with merge commits disallowed need the operator', () => {
  const result = pickMergeStrategy({ empty: ['abc'], repo: { rebaseMergeAllowed: true, mergeCommitAllowed: false } });
  assert.deepEqual(result, { strategy: 'none', reason: 'empty-commits-need-merge-commit' });
});

test('rebase disallowed falls back to a merge commit', () => {
  assert.equal(pickMergeStrategy({ empty: [], repo: { rebaseMergeAllowed: false, mergeCommitAllowed: true } }).strategy, 'merge');
});

test('a squash-only repo picks nothing', () => {
  assert.deepEqual(pickMergeStrategy({ empty: [], repo: { squashMergeAllowed: true } }), { strategy: 'none', reason: 'squash-only' });
});

test('a merge commit on the branch is not counted as empty', (t) => {
  const r = repo(t);
  r.git('checkout', '-q', '-b', 'side', 'base');
  commitFile(r, 'c.txt', 'side work');
  r.git('checkout', '-q', 'pie-9-test');
  r.git('merge', '-q', '--no-ff', '-m', 'merge side', 'side');
  assert.deepEqual(emptyCommits(r.dir, 'base'), []);
});

test('the CLI prints one JSON line with the empty commits', (t) => {
  const r = repo(t);
  r.git('commit', '-q', '--allow-empty', '-m', 'feat(pie-9): 9.2 Slice Two');
  const out = execFileSync('node', [SCRIPT, '--base', 'base', '--project', r.dir], { input: JSON.stringify(ALL), encoding: 'utf8' });
  const lines = out.trim().split('\n');
  assert.equal(lines.length, 1);
  const parsed = JSON.parse(lines[0]);
  assert.equal(parsed.strategy, 'merge');
  assert.equal(parsed.emptyCommits.length, 1);
});

test('the CLI fails quietly on a bad argument', () => {
  assert.throws(() => execFileSync('node', [SCRIPT, '--nope', 'x'], { input: '{}', stdio: ['pipe', 'pipe', 'pipe'] }), (error) => {
    assert.equal(error.status, 1);
    assert.equal(String(error.stdout), '');
    assert.equal(String(error.stderr), 'Merge strategy could not be picked.\n');
    return true;
  });
});

test('a ship PR always takes a merge commit, even when rebase is allowed', () => {
  assert.deepEqual(pickMergeStrategy({ empty: [], repo: ALL, mode: 'ship' }), { strategy: 'merge', reason: 'merge-commit-required' });
  assert.deepEqual(pickMergeStrategy({ empty: [], repo: ALL, mode: 'slice-merge' }), { strategy: 'merge', reason: 'merge-commit-required' });
});

test('a ship PR on a repo without merge commits picks nothing', () => {
  const result = pickMergeStrategy({ empty: ['abc'], repo: { rebaseMergeAllowed: true, squashMergeAllowed: true }, mode: 'ship' });
  assert.deepEqual(result, { strategy: 'none', reason: 'merge-commits-disallowed' });
});

test('an unknown mode is refused', () => {
  assert.throws(() => pickMergeStrategy({ empty: [], repo: ALL, mode: 'squash' }), TypeError);
});

test('the CLI picks a merge commit for a ship branch holding pie merge commits', (t) => {
  const r = repo(t);
  r.git('checkout', '-q', '-b', 'pie-9-a', 'base');
  commitFile(r, 'd.txt', 'feat(pie-9): 9.1 Slice One');
  r.git('checkout', '-q', 'pie-9-test');
  r.git('merge', '-q', '--no-ff', '-m', 'merge(pie-9): Pie 9 into ship/app', 'pie-9-a');
  const out = execFileSync('node', [SCRIPT, '--base', 'base', '--project', r.dir, '--mode', 'ship'], { input: JSON.stringify(ALL), encoding: 'utf8' });
  const parsed = JSON.parse(out.trim());
  assert.equal(parsed.strategy, 'merge');
  assert.equal(parsed.reason, 'merge-commit-required');
  assert.deepEqual(parsed.emptyCommits, []);
});

test('the CLI fails quietly on an unknown mode', () => {
  assert.throws(() => execFileSync('node', [SCRIPT, '--mode', 'squash'], { input: '{}', stdio: ['pipe', 'pipe', 'pipe'] }), (error) => {
    assert.equal(error.status, 1);
    assert.equal(String(error.stdout), '');
    return true;
  });
});
