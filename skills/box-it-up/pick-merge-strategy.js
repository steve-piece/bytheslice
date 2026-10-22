// skills/box-it-up/pick-merge-strategy.js
// Picks the pie PR merge strategy that keeps every slice commit: GitHub's rebase-merge drops empty commits, so a branch holding one merges with a merge commit.
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

function pickMergeStrategy({ empty, repo }) {
  const rebase = repo?.rebaseMergeAllowed === true, merge = repo?.mergeCommitAllowed === true;
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
  const args = process.argv.slice(2), allowed = new Set(['--base', '--project']);
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    if (!allowed.has(args[index]) || !args[index + 1] || options[args[index]] !== undefined) throw new TypeError('Expected [--base REF] [--project ROOT] with gh repo view JSON on stdin');
    options[args[index]] = args[index + 1];
  }
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
    if (Buffer.byteLength(input) > 1024) throw new RangeError('Repo settings exceed 1024 bytes');
  }
  const cwd = options['--project'] || process.cwd();
  const empty = emptyCommits(cwd, options['--base'] || 'origin/main');
  const result = { ...pickMergeStrategy({ empty, repo: JSON.parse(input) }), emptyCommits: empty };
  process.stdout.write(JSON.stringify(result) + '\n');
}

if (require.main === module) {
  main().catch(() => {
    process.stderr.write('Merge strategy could not be picked.\n');
    process.exitCode = 1;
  });
}

module.exports = { emptyCommits, pickMergeStrategy };
