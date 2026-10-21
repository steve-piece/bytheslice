// tests/pass/ledger-summary.test.js
// Verifies the shared ledger fold: fixture totals and per-slice facts, a torn last line, a missing or empty ledger, the 1 MiB tail cut, and a PR body that names every slice and carries no file content.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const summary = require('../../scripts/ledger-summary.js');

const root = path.resolve(__dirname, '../..');
const SCRIPT = path.join(root, 'scripts/ledger-summary.js');
const FIXTURE = fs.readFileSync(path.join(root, 'tests/fixtures/pass/ledger.jsonl'), 'utf8');
const CHECKLIST = [
  '## Pie 4 - Live Kitchen [x]    <!-- review: boundary -->',
  '### Slice 4.7 - Docs and release [x]',
  '## Pie 5 - The Pass [ ]    <!-- review: boundary -->',
  '### Slice 5.1 - Pass pane and band [x]',
  '### Slice 5.2 - Ledger and status tool [x]',
  '### Slice 5.3 - Pass checks [ ]',
  '',
].join('\n');

function project(ledger, checklist = CHECKLIST) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bts-ledger-'));
  if (ledger !== null) {
    fs.mkdirSync(path.join(dir, '.bytheslice'));
    fs.writeFileSync(path.join(dir, '.bytheslice/ledger.jsonl'), ledger);
  }
  if (checklist !== null) {
    fs.mkdirSync(path.join(dir, 'docs/plans'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'docs/plans/00_master_checklist.md'), checklist);
  }
  return dir;
}

const run = (...args) => execFileSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });

test('the fixture folds into per-slice facts and totals', () => {
  const { summary: s, missing } = summary.summaryFor({ dir: project(FIXTURE) });
  assert.equal(missing, false);
  assert.deepEqual(s.pies.map(pie => [pie.n, pie.name, pie.slices.map(x => x.id)]), [
    [4, 'Live Kitchen', ['4.7']],
    [5, 'The Pass', ['5.1', '5.2', '5.3']],
  ]);
  assert.deepEqual(s.totals, {
    pies: 2, slices: 4, slicesDone: 3, durationMs: 47 * 60000, fixLoops: 1, tokens: 2365,
    costUsd: 2, warnings: 3, stalls: 1, hitlRaised: 1, hitlWaitMs: 6 * 60000,
  });
  const s52 = s.pies[1].slices[1];
  assert.equal(s52.name, 'Ledger and status tool');
  assert.equal(s52.durationMs, 29 * 60000);
  assert.equal(s52.fixLoops, 1);
  assert.deepEqual(s52.verdicts.map(v => [v.gate, v.overall, v.head.slice(0, 4)]), [
    ['slice-verifier', 'fail', 'cccc'],
    ['slice-verifier', 'pass', 'dddd'],
  ]);
  assert.deepEqual(s52.commits, ['dddd111122223333444455556666777788889999']);
  assert.deepEqual(s52.models, ['claude-sonnet-4-6']);
  assert.equal(s52.costUsd, 0.75);
  assert.deepEqual(s52.warnings, [{ code: 'push-without-verdict', n: 2 }, { code: 'commit-on-main', n: 1 }]);
  assert.deepEqual(s52.hitl, { raised: 1, open: 0, waitMs: 6 * 60000 });
  assert.equal(s.pies[0].mergedAt, 1760000000000 + 9 * 60000);
  assert.equal(s.pies[1].startedAt, 1760000000000 + 10 * 60000);
  assert.deepEqual(s.series.map(p => p.slicesDone), [1, 2, 3]);
});

test('--pie keeps one pie, and the CLI prints the same JSON', () => {
  const dir = project(FIXTURE);
  const out = JSON.parse(run('--root', dir, '--pie', '5', '--format', 'json'));
  assert.deepEqual(out.pies.map(pie => pie.n), [5]);
  assert.equal(out.totals.slices, 3);
  assert.equal(out.totals.costUsd, 1.5);
  assert.deepEqual(out, summary.summaryFor({ dir, pie: 5 }).summary);
});

test('a torn last line is skipped, never thrown', () => {
  const torn = `${FIXTURE}{"v":1,"t":1760009999999,"sid":"s2","ev":"slice.do`;
  const s = summary.summaryFor({ dir: project(torn) }).summary;
  assert.equal(s.totals.slices, 4);
  assert.equal(s.totals.slicesDone, 3);
  assert.equal(summary.parseRows('not json\n{"v":2,"t":1,"sid":"s","ev":"note"}\n').length, 0);
});

test('a missing ledger exits 0 with { "pies": [] }, and an empty one folds to nothing', () => {
  const none = project(null, null);
  assert.equal(run('--root', none, '--format', 'json'), '{"pies":[]}\n');
  assert.match(run('--root', none, '--format', 'text'), /^No ledger rows yet/);
  assert.match(run('--root', none, '--format', 'pr-body'), /no ledger evidence/);
  const empty = summary.summaryFor({ dir: project('') }).summary;
  assert.deepEqual(empty.pies, []);
  assert.equal(empty.totals.slices, 0);
  assert.deepEqual(empty.series, []);
});

test('the kitchen read keeps only the newest bytes and drops the cut line', () => {
  const dir = project(FIXTURE);
  const file = path.join(dir, '.bytheslice/ledger.jsonl');
  const lines = FIXTURE.trimEnd().split('\n');
  const tail = lines.slice(-3).join('\n').length + 10;
  const text = summary.readLedgerText(file, tail);
  assert.deepEqual(summary.parseRows(text).map(row => row.ev), lines.slice(-3).map(line => JSON.parse(line).ev));
  assert.equal(summary.readLedgerText(path.join(dir, 'nope.jsonl')), null);
});

test('pr-body names every slice with its verifier commit and carries no file content', () => {
  const dir = project(FIXTURE);
  const body = run('--root', dir, '--pie', '5', '--format', 'pr-body');
  for (const id of ['5.1', '5.2', '5.3']) assert.match(body, new RegExp(`^\\| ${id.replace('.', '\\.')} `, 'm'));
  assert.match(body, /\| 5\.2 Ledger and status tool \| pass @ `dddd111` \| none \| 1 \| claude-sonnet-4-6 \| 29m \| \$0\.75 \|/);
  assert.match(body, /^- `push-without-verdict`: 2 \(5\.2\)$/m);
  assert.match(body, /^- 5\.2: 1 raised, 6m waited$/m);
  assert.match(body, /^- 5\.1: chose tee -a for appends$/m);
  assert.doesNotMatch(body, /4\.7/);
  assert.doesNotMatch(body, /new_string|old_string|file_text|"content"|mod\/rail\.tsx/);
});

test('text prints one table per pie with duration, fix loops and cost', () => {
  const text = run('--root', project(FIXTURE), '--format', 'text');
  assert.match(text, /^Pie 5 The Pass · 2 of 3 slices done · fix loops 1 · \$1\.50$/m);
  assert.match(text, /^ {2}5\.2 {4}yes {3}29m {7}1 {4}pass {6}\$0\.75$/m);
  assert.match(text, /^Total · 3 of 4 slices done · 47m · fix loops 1 · \$2\.00$/m);
});

test('a bad argument exits 2 with a usage line', () => {
  assert.throws(() => run('--format', 'yaml'), error => error.status === 2 && /usage:/.test(String(error.stderr)));
});

test('box-it-up Phase 2 writes the bts_pr_body output under ## Evidence after the --fill content', () => {
  const skill = fs.readFileSync(path.join(root, 'skills/box-it-up/SKILL.md'), 'utf8');
  const phase2 = skill.slice(skill.indexOf('### Phase 2'), skill.indexOf('### Phase 3'));
  assert.match(phase2, /when `bts_pr_body` is available, write its output into the PR body under `## Evidence` after the `--fill` content; the section is generated, do not edit it by hand/);
  const retro = fs.readFileSync(path.join(root, 'skills/close-shop/agents/retrospective-reviewer.md'), 'utf8');
  assert.match(retro, /^## Ledger metrics$/m);
  assert.match(retro, /scripts\/ledger-summary\.js --root <project_path> --format json/);
});
