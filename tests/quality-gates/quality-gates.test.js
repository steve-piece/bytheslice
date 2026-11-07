// tests/quality-gates/quality-gates.test.js
// Maintainer test: the binding-gates rule (gates.enforcement "fix") agrees everywhere it is stated: the config schema and example, the gate classes in quality-gates.md, the setup-shop elicitation, the Feature intake block (and the eval fixture's copy), and every conductor, tester, verifier, fixer and UI review agent that must route a failing enabled gate to the fix loop.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const readText = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const RULE = 'skills/sell-slice/references/quality-gates.md';
const SCHEMA = 'skills/setup-shop/references/bytheslice-config-schema.md';
const EXAMPLE = 'skills/setup-shop/references/bytheslice.config.example.json';
const INTAKE = 'skills/setup-shop/references/feature-intake.md';
const NEVER_ADVISORY = ['ci_integrity'];

// JSONC to JSON: drops // and /* */ comments outside strings, then trailing commas.
function parseJsonc(text) {
  let out = '';
  let inString = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      out += ch;
      if (ch === '\\') out += text[++i] ?? '';
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
    } else if (ch === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i += 1;
      out += '\n';
    } else if (ch === '/' && text[i + 1] === '*') {
      i = text.indexOf('*/', i + 2) + 1;
    } else {
      out += ch;
    }
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, '$1'));
}

// The gate classes in the first column of quality-gates.md's "Gate classes" table.
function ruleClasses() {
  const section = readText(RULE).split('## Gate classes')[1].split('\n## ')[0];
  return section
    .split('\n')
    .filter((line) => /^\|\s*`[a-z0-9-]+`\s*\|/.test(line))
    .map((line) => /^\|\s*`([a-z0-9-]+)`/.exec(line)[1]);
}

// The block between the Feature intake markers.
const intakeBlock = (text) => /<!-- bytheslice:feature-intake:start -->[\s\S]*?<!-- bytheslice:feature-intake:end -->/.exec(text)?.[0] ?? '';

test('the example config states the rule uncommented and parses as JSONC', () => {
  const config = parseJsonc(readText(EXAMPLE));
  assert.equal(config.gates?.enforcement, 'fix', 'bytheslice.config.example.json must carry "gates": { "enforcement": "fix" } uncommented');
});

test('the schema documents every gates key, and its advisory list matches the rule doc gate classes', () => {
  const schema = readText(SCHEMA);
  assert.match(schema, /### `gates`/);
  for (const key of ['enforcement', 'advisory', 'declared']) assert.match(schema, new RegExp(`\\*\\*\`${key}\`\\*\\*`), `schema documents gates.${key}`);
  assert.match(schema, /"gates": \{\s*\n\s*"enforcement": "fix"/, 'the schema JSONC block shows gates.enforcement "fix"');
  const advisoryLine = schema.split('\n').find((line) => line.startsWith('- **`advisory`**'));
  assert.ok(advisoryLine, 'schema has an advisory bullet');
  const listed = advisoryLine.split(': ')[1].split('. ')[0].match(/`([a-z0-9-]+)`/g).map((s) => s.slice(1, -1));
  assert.deepEqual([...listed].sort(), [...ruleClasses()].sort(), 'gates.advisory classes in the schema equal the quality-gates.md table');
  for (const key of NEVER_ADVISORY) assert.ok(!ruleClasses().includes(key), `${key} is never an advisory class`);
});

test('setup-shop tells the operator once that enabled gates are binding and offers only real classes', () => {
  const skill = readText('skills/setup-shop/SKILL.md');
  assert.match(skill, /\*\*Q-gates\*\* \(always asked/);
  assert.match(skill, /are binding\. When one fails, agents fix the code until it passes/);
  const options = /"Which classes are advisory\?"\n> multi_select: \[([^\]]+)\]/.exec(skill)?.[1];
  assert.ok(options, 'Q-gates follow-up lists the classes');
  const classes = new Set(ruleClasses());
  for (const option of options.match(/"([^"]+)"/g).map((s) => s.slice(1, -1))) assert.ok(classes.has(option), `${option} is a gate class`);
  assert.match(readText('skills/setup-shop/agents/config-generator.md'), /\*\*Always write `gates\.enforcement: "fix"`\*\*/);
  assert.match(readText('skills/sell-slice/agents/rules-loader.md'), /`gates\.enforcement`, `gates\.advisory`, `gates\.declared`/);
});

test('the Feature intake block carries the rule, and the eval fixture holds the same block', () => {
  const block = intakeBlock(readText(INTAKE));
  assert.match(block, /\*\*Enabled quality gates are binding\.\*\*/);
  assert.equal(intakeBlock(readText('evals/fixtures/slate-shop/CLAUDE.md')), block, 'evals/fixtures/slate-shop/CLAUDE.md copies the current block');
});

test('every agent and skill that handles a gate failure links the rule and routes it to the fix loop', () => {
  const linked = {
    'skills/sell-slice/SKILL.md': /\*\*A failing enabled gate is never a HITL\.\*\*/,
    'skills/sell-pie/SKILL.md': /\*\*A failing enabled gate never halts the loop as a question\.\*\*/,
    'skills/box-it-up/SKILL.md': /\*\*Every red check is a binding gate\.\*\*/,
    'skills/sell-slice/agents/slice-tester.md': /\*\*A failing enabled gate is a fix target, never a note\.\*\*/,
    'skills/sell-slice/agents/slice-verifier.md': /\*\*Every enabled-gate failure is a fix target\.\*\*/,
    'skills/sell-slice/agents/fix-attempter.md': /\*\*Fix enabled gates wherever the cause lives\.\*\*/,
    'skills/sell-slice/agents/frontend/ui-fix-attempter.md': /\*\*A failing gate is never an open design decision\.\*\*/,
    'skills/sell-slice/agents/frontend/break-ui-runner.md': /\*\*A gate failure is never Fragile, never a decision\.\*\*/,
    'skills/sell-slice/agents/frontend/design-critic.md': /\*\*A measured gate failure is a fix target, never a question\.\*\*/,
    'skills/box-it-up/agents/ci-fix-attempter.md': /\*\*Scope is no exemption\.\*\*/,
  };
  for (const [file, rule] of Object.entries(linked)) {
    const text = readText(file);
    assert.match(text, /quality-gates\.md/, `${file} links quality-gates.md`);
    assert.match(text, rule, `${file} states the binding rule`);
  }
});

test('no retired wording lets an enabled-gate failure become a warning or a question', () => {
  const verifier = readText('skills/sell-slice/agents/slice-verifier.md');
  assert.doesNotMatch(verifier, /Every result is a warning, never a failure/);
  assert.doesNotMatch(verifier, /whose findings are non-forcing warnings/);
  assert.match(verifier, /\*\*A utility `E1` is a lead until confirmed\.\*\*/, 'a semantic-utility E1 is confirmed against the config before it fails the gate');
  assert.match(verifier, /\*\*plus every file that held a `design_system` or `a11y_static` finding in the prior verdict\*\*/, 'a definition fix re-scans the consumers it resolved');
  assert.doesNotMatch(readText('skills/sell-slice/SKILL.md'), /Its `warnings` array \(the statics findings\) never fails the slice/);
  assert.match(readText('skills/sell-slice/SKILL.md'), /and not marked `advisory: true` is not a concern for the operator/, 'the library gate skips advisory findings');
  assert.doesNotMatch(readText('skills/box-it-up/agents/ci-fix-attempter.md'), /If the design system doesn't define the needed token, surface as HITL `creative_direction`\./);
  for (const file of ['skills/sell-slice/agents/frontend/break-ui-runner.md', 'skills/sell-slice/agents/frontend/design-critic.md']) {
    assert.match(readText(file), /gate: null \| accessibility \| design-system/, `${file} findings carry a gate tag`);
  }
});

test('the rule doc and the new eval case use no em or en dashes', () => {
  for (const file of [RULE, 'evals/failing-gate-gets-fixed/prompt.md', 'evals/failing-gate-gets-fixed/graders/fixed-not-deferred.md']) {
    assert.doesNotMatch(readText(file), /[–—]/, `${file} has no em or en dash`);
  }
});
