// skills/box-it-up/pick-merge-strategy.js
// Picks the PR merge strategy that keeps every slice commit: GitHub's rebase-merge drops empty commits, so a branch holding one merges with a merge commit; slice-merge and ship PRs always take a merge commit.
'use strict';

const { execFileSync } = require('node:child_process');

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

// Non-merge commits in base..HEAD whose tree equals their first parent's tree.
function emptyCommits(cwd, base) {
  const list = git(cwd, ['rev-list', '--no-merges', '--reverse', `${base}..HEAD`]);
  if (!list) return [];
  return list.split('\n').filter((sha) => git(cwd, ['rev-parse', `${sha}^{tree}`]) === git(cwd, ['rev-parse', `${sha}^^{tree}`]));
}

const MODES = new Set(['pie', 'slice-merge', 'ship']);

function pickMergeStrategy({ empty, repo, mode = 'pie' }) {
  if (!MODES.has(mode)) throw new TypeError('Mode must be pie, slice-merge or ship');
  const rebase = repo?.rebaseMergeAllowed === true, merge = repo?.mergeCommitAllowed === true;
  // A slice PR and the ship PR (which carries the pie merge commits) never rebase or squash.
  if (mode !== 'pie') {
    return merge
      ? { strategy: 'merge', reason: 'merge-commit-required' }
      : { strategy: 'none', reason: 'merge-commits-disallowed' };
  }
  if (empty.length > 0) {
    return merge
      ? { strategy: 'merge', reason: 'empty-commits' }
      : { strategy: 'none', reason: 'empty-commits-need-merge-commit' };
  }
  if (rebase) return { strategy: 'rebase', reason: 'linear-history' };
  if (merge) return { strategy: 'merge', reason: 'rebase-disallowed' };
  return { strategy: 'none', reason: 'squash-only' };
}

async function main() {
  const args = process.argv.slice(2), allowed = new Set(['--base', '--project', '--mode']);
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    if (!allowed.has(args[index]) || !args[index + 1] || options[args[index]] !== undefined) throw new TypeError('Expected [--base REF] [--project ROOT] [--mode pie|slice-merge|ship] with gh repo view JSON on stdin');
    options[args[index]] = args[index + 1];
  }
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
    if (Buffer.byteLength(input) > 1024) throw new RangeError('Repo settings exceed 1024 bytes');
  }
  const cwd = options['--project'] || process.cwd();
  const mode = options['--mode'] || 'pie';
  if (!MODES.has(mode)) throw new TypeError('Mode must be pie, slice-merge or ship');
  const empty = emptyCommits(cwd, options['--base'] || 'origin/main');
  const result = { ...pickMergeStrategy({ empty, repo: JSON.parse(input), mode }), emptyCommits: empty };
  process.stdout.write(JSON.stringify(result) + '\n');
}

if (require.main === module) {
  main().catch(() => {
    process.stderr.write('Merge strategy could not be picked.\n');
    process.exitCode = 1;
  });
}

module.exports = { emptyCommits, pickMergeStrategy };
