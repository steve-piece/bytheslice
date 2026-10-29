#!/usr/bin/env node
// scripts/version-check.js
// The pull request gate behind .github/workflows/version-check.yml: every PR to main ships a new version. It fails unless package.json carries a version above the base branch's, every manifest carries the same one, CHANGELOG.md has its section, and no tag for it exists yet. Zero dependencies.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { sectionOf } = require('./release-notes.js');

const ROOT = path.join(__dirname, '..');
const MANIFESTS = ['.claude-plugin/plugin.json', '.claude-plugin/marketplace.json', '.cursor-plugin/plugin.json', '.cursor-plugin/marketplace.json'];

const git = args => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

/** -1, 0 or 1 for two x.y.z versions. */
function compare(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i += 1) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0) ? 1 : -1;
  return 0;
}

/** Every `"version": "..."` value in a manifest's text. */
const versionsIn = text => [...text.matchAll(/"version"\s*:\s*"([^"]+)"/g)].map(m => m[1]);

/** The problems with the working tree's version against the base ref; empty when it may merge. */
function problems(baseRef) {
  const out = [];
  const head = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
  if (!/^\d+\.\d+\.\d+$/.test(head)) return [`package.json version "${head}" is not x.y.z`];
  let base = null;
  try {
    base = JSON.parse(git(['show', `${baseRef}:package.json`])).version;
  } catch {
    out.push(`cannot read package.json at ${baseRef}`);
  }
  if (base !== null && compare(head, base) <= 0) {
    out.push(`package.json is ${head}, not above ${base} on ${baseRef}: bump the version (patch for fixes and docs, minor for features, major for breaking changes)`);
  }
  for (const file of MANIFESTS) {
    const stale = versionsIn(fs.readFileSync(path.join(ROOT, file), 'utf8')).filter(v => v !== head);
    if (stale.length > 0) out.push(`${file} carries ${stale.join(', ')}, not ${head}`);
  }
  if (sectionOf(fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8'), head) === null) {
    out.push(`CHANGELOG.md has no ## [${head}] section`);
  }
  let tagged = '';
  try {
    tagged = git(['tag', '--list', `v${head}`]);
  } catch {
    // No tags readable: the tag check passes.
  }
  if (tagged !== '') out.push(`tag v${head} already exists: pick the next version`);
  return out;
}

function main(argv) {
  const baseRef = argv[0] || 'origin/main';
  const found = problems(baseRef);
  if (found.length === 0) {
    process.stdout.write('Version check passed.\n');
    return;
  }
  process.stdout.write(`Version check failed:\n${found.map(p => `- ${p}`).join('\n')}\n`);
  process.exitCode = 1;
}

if (require.main === module) main(process.argv.slice(2));

module.exports = { compare, versionsIn, problems };
