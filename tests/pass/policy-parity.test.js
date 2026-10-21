// tests/pass/policy-parity.test.js
// Holds the Pass spawn policy defaults (mod/policy.ts) equal to each registered agent's model frontmatter: one role per agent plugin.json registers.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const load = () => import(path.join(root, 'mod/policy.ts'));

// The frontmatter name and model of one agent file.
function frontmatter(file) {
  const text = fs.readFileSync(file, 'utf8');
  const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1] ?? '';
  const field = key => new RegExp(`^${key}:\\s*(.+?)\\s*$`, 'm').exec(front)?.[1]?.replace(/^["']|["']$/g, '');
  return { name: field('name'), model: field('model') };
}

// Every skills/**/agents/**/*.md, relative to the repo as plugin.json spells it.
function agentFiles(dir = path.join(root, 'skills'), inAgents = false) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...agentFiles(full, inAgents || entry.name === 'agents'));
    else if (inAgents && entry.name.endsWith('.md')) out.push(`./${path.relative(root, full).split(path.sep).join('/')}`);
  }
  return out;
}

const registered = () => JSON.parse(fs.readFileSync(path.join(root, '.claude-plugin/plugin.json'), 'utf8')).agents || [];

test('every registered agent file exists and has a name and a model', () => {
  const agents = registered();
  assert.ok(agents.length > 0);
  for (const rel of agents) {
    const file = path.join(root, rel);
    assert.ok(fs.existsSync(file), `${rel} is registered but missing`);
    const { name, model } = frontmatter(file);
    assert.ok(name, `${rel} has no name`);
    assert.ok(model, `${rel} has no model`);
  }
});

test('each registered role default equals its agent frontmatter model, one tier, and nothing else is listed', async () => {
  const { DEFAULT_ROLES } = await load();
  const names = [];
  for (const rel of registered()) {
    const { name, model } = frontmatter(path.join(root, rel));
    names.push(name);
    assert.deepEqual(
      DEFAULT_ROLES[name],
      [model],
      `${name}: the default ${JSON.stringify(DEFAULT_ROLES[name])} and ${rel} (model: ${model}) disagree`,
    );
  }
  assert.deepEqual(Object.keys(DEFAULT_ROLES).sort(), names.sort(), 'a default without a registered agent, or a registered agent without a default');
});

test('no agent file on disk, registered or not, disagrees with a default of its name', async () => {
  const { DEFAULT_ROLES } = await load();
  const files = agentFiles();
  assert.ok(files.length >= registered().length);
  for (const rel of files) {
    const { name, model } = frontmatter(path.join(root, rel));
    if (name === undefined || DEFAULT_ROLES[name] === undefined) continue;
    assert.deepEqual(DEFAULT_ROLES[name], [model], `${rel} (model: ${model}) disagrees with its default`);
  }
});
