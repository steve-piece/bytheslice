// tests/release/release-notes.test.js
// The current version has a changelog section the release workflow can publish, release text keeps the house style, and the version check orders versions.
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const { sectionOf, titleOf, plain } = require('../../scripts/release-notes.js');

const ROOT = path.join(__dirname, '..', '..');
const changelog = fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8');

test('the current version has a changelog section and a titled release', () => {
  const { version } = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const body = sectionOf(changelog, version);
  assert.ok(body, `CHANGELOG.md needs a ## [${version}] section before the bump merges`);
  assert.match(titleOf(version, body), new RegExp(`^v${version.replace(/\./g, '\\.')}`));
});

test('a section stops at the next heading or rule', () => {
  const text = '## [2.0.0] - x\n\n**Lead.** more\n\n### Fixed\n\n- a\n\n---\n\n## [1.0.0] - y\n\nold\n';
  assert.strictEqual(sectionOf(text, '2.0.0'), '**Lead.** more\n\n### Fixed\n\n- a');
  assert.strictEqual(titleOf('2.0.0', sectionOf(text, '2.0.0')), 'v2.0.0: Lead');
  assert.strictEqual(titleOf('1.0.0', sectionOf(text, '1.0.0')), 'v1.0.0');
  assert.strictEqual(sectionOf(text, '9.9.9'), null);
});

test('release text carries no em or en dashes', () => {
  assert.strictEqual(plain('a \u2014 b, pages 3\u20135, x \u2013 y'), 'a, b, pages 3 to 5, x, y');
});

test('the version check orders versions and reads every manifest version', () => {
  const { compare, versionsIn } = require('../../scripts/version-check.js');
  assert.strictEqual(compare('6.1.2', '6.1.1'), 1);
  assert.strictEqual(compare('6.10.0', '6.9.9'), 1);
  assert.strictEqual(compare('6.1.1', '6.1.1'), 0);
  assert.strictEqual(compare('5.9.0', '6.0.0'), -1);
  assert.deepStrictEqual(versionsIn('{"version": "1.2.3", "plugins": [{"version":"1.2.3"}]}'), ['1.2.3', '1.2.3']);
});
