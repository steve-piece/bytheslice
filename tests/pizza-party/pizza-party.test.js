// tests/pizza-party/pizza-party.test.js
// scripts/pizza-party.js: the ticket counts, a recorded run and the comparison table, against a throwaway BTS_HOME.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const SCRIPT = path.join(__dirname, '..', '..', 'scripts', 'pizza-party.js');
const { ticketCount } = require(SCRIPT);

const TICKET = [
  '# Order: Sample',
  '',
  '## Answers',
  '',
  '- **Host:** none: localhost',
  '',
  '## Decisions made without you',
  '',
  '- menu · picked magic-link auth · single private user',
  '- pizzas · 3 pies · small brief',
  '',
  '## Deferred',
  '',
  '- 3.2 · photo estimates · no vision provider',
  '',
  '## Progress',
  '',
  '- shop · done · scaffolded',
].join('\n');

test('the ticket counts list items under one section only', () => {
  assert.equal(ticketCount(TICKET, 'Decisions made without you'), 2);
  assert.equal(ticketCount(TICKET, 'Deferred'), 1);
  assert.equal(ticketCount(TICKET, 'Missing section'), 0);
});

test('a recorded run lands in the run log and the table compares runs of one brief', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'bts-party-'));
  const app = fs.mkdtempSync(path.join(os.tmpdir(), 'bts-app-'));
  fs.mkdirSync(path.join(app, 'docs', 'pizza-party'), { recursive: true });
  fs.writeFileSync(path.join(app, 'docs', 'pizza-party', 'order.md'), TICKET);
  const env = { ...process.env, BTS_HOME: home };
  const run = extra =>
    execFileSync(process.execPath, [SCRIPT, 'record', app, '--brief', 'sample-app', '--model', 'claude-sonnet-5-5', ...extra], { env, encoding: 'utf8' });
  const first = JSON.parse(run(['--outcome', 'shipped', '--url', 'http://localhost:3000', '--url-kind', 'localhost', '--acceptance', '9/10']));
  assert.equal(first.outcome, 'shipped');
  assert.equal(first.decisions, 2);
  assert.equal(first.deferred, 1);
  assert.equal(first.urlKind, 'localhost');
  run(['--outcome', 'nonsense']);
  const lines = fs.readFileSync(path.join(home, 'pizza-party', 'runs.jsonl'), 'utf8').trim().split('\n');
  assert.equal(lines.length, 2);
  assert.equal(JSON.parse(lines[1]).outcome, 'partial');
  const table = execFileSync(process.execPath, [SCRIPT, 'runs', '--brief', 'sample-app'], { env, encoding: 'utf8' });
  assert.match(table, /\| Date \| Brief \|/);
  assert.equal(table.trim().split('\n').length, 4);
  assert.match(table, /http:\/\/localhost:3000/);
  const none = execFileSync(process.execPath, [SCRIPT, 'runs', '--brief', 'other'], { env, encoding: 'utf8' });
  assert.match(none, /No pizza-party runs recorded for other/);
});

test('preflight names providers alphabetically and never prefers one', () => {
  const { PROVIDERS } = require(SCRIPT);
  for (const list of Object.values(PROVIDERS)) {
    const names = list.map(p => p.name);
    assert.deepEqual(names, [...names].sort());
  }
});
