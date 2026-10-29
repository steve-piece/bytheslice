// tests/model-tiers/model-tiers.test.js
// Maintainer test: every place that states an agent's model tier or effort (the model-tier guide, SKILL.md rosters, the config schema example, the Pass role defaults) agrees with the agent's own frontmatter, and every opus agent runs at effort medium.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const readText = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const TIERS = new Set(['haiku', 'sonnet', 'opus']);
const OPUS_EFFORT = 'medium';

// One frontmatter field, unquoted.
function field(front, key) {
  return new RegExp(`^${key}:\\s*(.+?)\\s*$`, 'm').exec(front)?.[1]?.replace(/^["']|["']$/g, '');
}

// name -> { model, effort, file } for every agent plugin.json registers.
const agents = new Map();
for (const rel of JSON.parse(readText('.claude-plugin/plugin.json')).agents.map((a) => a.replace(/^\.\//, ''))) {
  const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(readText(rel))?.[1] ?? '';
  agents.set(field(front, 'name'), { model: field(front, 'model'), effort: field(front, 'effort'), file: rel });
}

// A table cell without backticks, bold or surrounding space.
const clean = (cell) => cell.replace(/[`*]/g, '').trim();
const cells = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|');

// Every markdown table in `text` whose header has a Model column, as rows of
// { line, agent, model, effort }; `agentOf` names the agent a row is about.
function tierRows(text, agentOf) {
  const rows = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    if (!/^\s*\|/.test(lines[i]) || !/^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] ?? '')) continue;
    const head = cells(lines[i]).map((c) => clean(c).toLowerCase());
    const modelAt = head.indexOf('model');
    if (modelAt < 0) continue;
    const effortAt = head.indexOf('effort');
    for (let j = i + 2; j < lines.length && /^\s*\|/.test(lines[j]); j += 1) {
      const row = cells(lines[j]);
      const agent = agentOf(row, head);
      if (!agent) continue;
      rows.push({
        line: j + 1,
        agent,
        model: clean(row[modelAt] ?? '').toLowerCase(),
        effort: effortAt < 0 ? null : clean(row[effortAt] ?? '').toLowerCase(),
      });
    }
    i += 1;
  }
  return rows;
}

// The agent a roster row links to: the basename of its agents/**/*.md link.
const linkedAgent = (row) => /agents\/(?:[\w-]+\/)*([\w-]+)\.md/.exec(row.join('|'))?.[1] ?? null;

// Disagreements between stated rows and the frontmatter, one message each.
function drift(where, rows) {
  const out = [];
  for (const { line, agent, model, effort } of rows) {
    const truth = agents.get(agent);
    if (!truth) {
      out.push(`${where}:${line} names ${agent}, which plugin.json does not register`);
      continue;
    }
    if (model !== truth.model) out.push(`${where}:${line} ${agent}: model ${model}, frontmatter says ${truth.model} (${truth.file})`);
    if (effort !== null && effort !== truth.effort) {
      out.push(`${where}:${line} ${agent}: effort ${effort}, frontmatter says ${truth.effort} (${truth.file})`);
    }
    if (model === 'opus' && effort !== null && effort !== OPUS_EFFORT) {
      out.push(`${where}:${line} ${agent}: opus runs at effort ${OPUS_EFFORT}, not ${effort}`);
    }
  }
  return out;
}

test('every registered agent names a known tier and an effort, and every opus agent runs at medium', () => {
  assert.ok(agents.size > 0);
  for (const [name, { model, effort, file }] of agents) {
    assert.ok(TIERS.has(model), `${file} (${name}) has model ${model}`);
    assert.ok(effort, `${file} (${name}) has no effort`);
  }
  const loud = [...agents].filter(([, a]) => a.model === 'opus' && a.effort !== OPUS_EFFORT).map(([n, a]) => `${n} (${a.effort})`);
  assert.deepEqual(loud, [], `opus agents not at effort ${OPUS_EFFORT}`);
});

test('the model-tier guide lists every registered agent with its frontmatter tier and effort', () => {
  const guide = 'skills/setup-shop/references/model-tier-guide.md';
  const rows = tierRows(readText(guide), (row, head) => {
    const at = head.indexOf('agent');
    // "phased-plan-writer (incremental mode)" is phased-plan-writer.
    return at < 0 ? null : /^[\w-]+/.exec(clean(row[at] ?? ''))?.[0] ?? null;
  });
  assert.ok(rows.length > 0, `${guide} has no per-agent table`);
  assert.deepEqual(drift(guide, rows), []);
  const listed = new Set(rows.map((r) => r.agent));
  assert.deepEqual([...agents.keys()].filter((n) => !listed.has(n)), [], `agents missing from ${guide}`);
});

test('every SKILL.md roster table with a Model column agrees with the frontmatter', () => {
  const skills = fs.readdirSync(path.join(root, 'skills')).filter((s) => fs.existsSync(path.join(root, 'skills', s, 'SKILL.md')));
  const seen = new Set();
  const problems = [];
  for (const skill of skills) {
    const rel = `skills/${skill}/SKILL.md`;
    const rows = tierRows(readText(rel), linkedAgent);
    if (rows.length > 0) seen.add(skill);
    problems.push(...drift(rel, rows));
  }
  assert.deepEqual(problems, []);
  for (const skill of ['special-order', 'sell-slice', 'sell-pie', 'final-quality-check', 'set-display-case']) {
    assert.ok(seen.has(skill), `no roster table with a Model column found in skills/${skill}/SKILL.md`);
  }
});

test('the modelTiers example in the config schema states each agent at its frontmatter tier', () => {
  const schema = 'skills/setup-shop/references/bytheslice-config-schema.md';
  const block = /"modelTiers":\s*\{([\s\S]*?)\}/.exec(readText(schema))?.[1];
  assert.ok(block, `${schema} has no modelTiers block`);
  const problems = [];
  for (const [, key, tier] of block.matchAll(/"(\w+)":\s*"(\w+)"/g)) {
    const name = key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
    const truth = agents.get(name);
    if (!truth) problems.push(`${schema}: modelTiers.${key} names no registered agent`);
    else if (tier !== truth.model) problems.push(`${schema}: modelTiers.${key} is ${tier}, frontmatter says ${truth.model}`);
  }
  assert.deepEqual(problems, []);
});

test('the Pass role defaults in mod/policy.ts give each agent its frontmatter tier', async () => {
  const { DEFAULT_ROLES } = await import(path.join(root, 'mod/policy.ts'));
  const problems = [];
  for (const [name, { model }] of agents) {
    if (JSON.stringify(DEFAULT_ROLES[name]) !== JSON.stringify([model])) {
      problems.push(`${name}: DEFAULT_ROLES ${JSON.stringify(DEFAULT_ROLES[name])}, frontmatter says ${model}`);
    }
  }
  assert.deepEqual(problems, []);
});
