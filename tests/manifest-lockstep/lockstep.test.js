// tests/manifest-lockstep/lockstep.test.js
// Maintainer test: agent files match plugin.json agents[], the five manifests agree on name/version/description, and every SKILL.md description is quoted.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const read = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const walk = (d) => fs.readdirSync(path.join(root, d), { withFileTypes: true })
  .flatMap((e) => (e.isDirectory() ? walk(`${d}/${e.name}`) : [`${d}/${e.name}`]));
const skills = fs.readdirSync(path.join(root, 'skills'));
const agentFiles = skills.filter((s) => fs.existsSync(path.join(root, 'skills', s, 'agents')))
  .flatMap((s) => walk(`skills/${s}/agents`)).filter((f) => f.endsWith('.md'));
const registered = read('.claude-plugin/plugin.json').agents.map((a) => a.replace(/^\.\//, ''));

test('every agent file is registered in plugin.json agents[]', () => {
  assert.deepEqual(agentFiles.filter((f) => !registered.includes(f)), []);
});

test('every agents[] entry exists on disk', () => {
  assert.deepEqual(registered.filter((f) => !fs.existsSync(path.join(root, f))), []);
});

test('name, version and description agree across the manifests (name and version for package.json)', () => {
  const [claude, cursor] = [read('.claude-plugin/plugin.json'), read('.cursor-plugin/plugin.json')];
  const markets = ['.claude-plugin/marketplace.json', '.cursor-plugin/marketplace.json'].map((p) => read(p).plugins[0]);
  const pkg = read('package.json');
  for (const m of [cursor, ...markets]) {
    assert.deepEqual([m.name, m.version, m.description], [claude.name, claude.version, claude.description]);
  }
  assert.deepEqual([pkg.name, pkg.version], [claude.name, claude.version]);
});

test('every SKILL.md frontmatter description is quoted', () => {
  for (const s of skills.filter((d) => fs.existsSync(path.join(root, 'skills', d, 'SKILL.md')))) {
    const fm = /^---\n([\s\S]*?)\n---/.exec(fs.readFileSync(path.join(root, 'skills', s, 'SKILL.md'), 'utf8'));
    assert.match(fm?.[1] ?? '', /^description: (".*"|'.*')$/m, `skills/${s}/SKILL.md description is not quoted`);
  }
});
