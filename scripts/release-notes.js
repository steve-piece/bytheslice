#!/usr/bin/env node
// scripts/release-notes.js
// Prints one version's CHANGELOG.md section as GitHub release notes, or with `--title` its release title (`v6.1.1: <the section's bold lead>`). The release workflow and any backfill read the changelog through this one place. Zero dependencies.
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const CHANGELOG = path.join(__dirname, '..', 'CHANGELOG.md');

// Release text follows the house style: no em or en dashes.
const plain = text => text.replace(/\s*\u2014\s*/g, ', ').replace(/(\d)\s*\u2013\s*(\d)/g, '$1 to $2').replace(/\s*\u2013\s*/g, ', ');

/** The body under `## [<version>]`, up to the next `## ` heading or `---` rule; null when the version has none. */
function sectionOf(text, version) {
  const lines = text.split('\n');
  const at = lines.findIndex(line => line.startsWith(`## [${version}]`));
  if (at === -1) return null;
  const body = [];
  for (const line of lines.slice(at + 1)) {
    if (/^## /.test(line) || /^---\s*$/.test(line)) break;
    body.push(line);
  }
  return body.join('\n').trim();
}

/** `v<version>: <bold lead>` when the section opens with one, else `v<version>`. */
function titleOf(version, body) {
  const lead = /^\*\*(.+?)\*\*/.exec(body ?? '')?.[1]?.replace(/[.:]\s*$/, '').trim();
  return plain(lead ? `v${version}: ${lead}` : `v${version}`);
}

function main(argv) {
  const version = (argv.find(arg => !arg.startsWith('--')) ?? '').replace(/^v/, '');
  if (version === '') {
    process.stderr.write('usage: release-notes.js <version> [--title]\n');
    process.exitCode = 2;
    return;
  }
  const body = sectionOf(fs.readFileSync(CHANGELOG, 'utf8'), version);
  if (body === null) {
    process.stderr.write(`CHANGELOG.md has no ## [${version}] section\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`${argv.includes('--title') ? titleOf(version, body) : plain(body)}\n`);
}

if (require.main === module) main(process.argv.slice(2));

module.exports = { sectionOf, titleOf, plain };
