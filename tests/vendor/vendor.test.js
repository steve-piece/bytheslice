// tests/vendor/vendor.test.js
// Maintainer test: the vendored UI review skills keep their licenses and pinned commits, ship no launcher or executable, and stay unregistered.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const vendor = path.join(root, 'skills/sell-slice/references/vendor');
const walk = (d) => fs.readdirSync(d, { withFileTypes: true })
  .flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));

const PINS = {
  'break-ui': {
    commit: '2d228630ba1446365f614a108cb8252f1feda202',
    files: ['SKILL.md', 'CATALOG.md', 'LICENSE'],
    license: /MIT License[\s\S]*Copyright \(c\) 2026 Emil Kowalski/,
  },
  impeccable: {
    commit: 'd34c87e1a00989ae8dbdd7f6b30b70f23319e860',
    files: ['SKILL.src.md', 'LICENSE', 'NOTICE.md', 'reference/critique.md', 'reference/mode-operate.md',
      'reference/mode-read.md', 'reference/mode-persuade.md', 'reference/craft-floor.md'],
    license: /Apache License[\s\S]*Version 2\.0/,
  },
};

test('each vendored skill has exactly its pinned files, with its license', () => {
  for (const [dir, pin] of Object.entries(PINS)) {
    const base = path.join(vendor, dir);
    const present = walk(base).map((f) => path.relative(base, f).split(path.sep).join('/')).sort();
    assert.deepEqual(present, [...pin.files].sort(), `${dir} holds files beyond its pinned list`);
    assert.match(fs.readFileSync(path.join(base, 'LICENSE'), 'utf8'), pin.license);
  }
});

test('the vendor README records each upstream commit', () => {
  const readme = fs.readFileSync(path.join(vendor, 'README.md'), 'utf8');
  for (const pin of Object.values(PINS)) assert.ok(readme.includes(pin.commit), `README is missing ${pin.commit}`);
});

test('no launcher, script folder or executable file is vendored', () => {
  for (const file of walk(vendor)) {
    const rel = path.relative(vendor, file);
    assert.ok(!/(^|\/)scripts(\/|$)/.test(rel), `${rel} sits in a scripts folder`);
    assert.ok(/\.md$|(^|\/)LICENSE$/.test(rel), `${rel} is not a markdown or LICENSE file`);
    assert.equal(fs.statSync(file).mode & 0o111, 0, `${rel} is executable`);
  }
});

test('no vendored file is registered as a skill or an agent', () => {
  const plugin = JSON.parse(fs.readFileSync(path.join(root, '.claude-plugin/plugin.json'), 'utf8'));
  assert.ok(!plugin.agents.some((a) => a.includes('/references/vendor/')));
  for (const skill of fs.readdirSync(path.join(root, 'skills'))) {
    assert.ok(!['break-ui', 'impeccable'].includes(skill), `skills/${skill} would register a vendored skill`);
  }
});
