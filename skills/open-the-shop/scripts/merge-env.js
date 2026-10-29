#!/usr/bin/env node
// skills/open-the-shop/scripts/merge-env.js
// Merges provider-tooling env output into a .env.local without ever printing a value. Fills only keys the .env.example lists that are missing, empty or placeholder in the target; prints key names only.
'use strict';

const fs = require('node:fs');

const PLACEHOLDER = [
  /^x{3,}$/i, /your[_-]key[_-]here/i, /^<.*>$/, /^todo$/i, /^replace_me$/i, /^changeme$/i,
  /^insert_here$/i, /^paste_here$/i, /^sk-\.+$/, /^(pk|sk|rk)_test_x+$/i,
];

function usage(msg) {
  if (msg) process.stderr.write(`merge-env: ${msg}\n`);
  process.stderr.write('usage: merge-env.js --example <.env.example> --target <.env.local> --source <file|-> [--map FROM=TO ...] [--consume]\n');
  process.exit(2);
}

function parseArgs(argv) {
  const out = { map: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--consume') out.consume = true;
    else if (a === '--map') {
      const [from, to] = String(argv[++i] || '').split('=');
      if (!from || !to) usage('--map needs FROM=TO');
      out.map[from] = to;
    } else if (['--example', '--target', '--source'].includes(a)) out[a.slice(2)] = argv[++i];
    else usage(`unknown argument ${a}`);
  }
  if (!out.example || !out.target || !out.source) usage('missing a required argument');
  return out;
}

// KEY=VALUE lines; comments, blanks and `export ` prefixes handled; surrounding quotes stripped.
function parseEnv(text) {
  const env = new Map();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/^\s*export\s+/, '').trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    const key = (eq === -1 ? line : line.slice(0, eq)).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let val = eq === -1 ? '' : line.slice(eq + 1).trim();
    if (/^(['"]).*\1$/.test(val)) val = val.slice(1, -1);
    env.set(key, val);
  }
  return env;
}

const unusable = (v) => v === undefined || v === '' || PLACEHOLDER.some((re) => re.test(v));

function main() {
  const args = parseArgs(process.argv.slice(2));
  const example = parseEnv(fs.readFileSync(args.example, 'utf8'));
  const targetText = fs.existsSync(args.target) ? fs.readFileSync(args.target, 'utf8') : '';
  const target = parseEnv(targetText);
  const sourceText = args.source === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(args.source, 'utf8');
  const source = parseEnv(sourceText);
  for (const [from, to] of Object.entries(args.map)) if (source.has(from)) source.set(to, source.get(from));

  const written = [];
  const stillMissing = [];
  const lines = targetText ? targetText.replace(/\n?$/, '\n').split('\n').slice(0, -1) : [];
  for (const key of example.keys()) {
    if (!unusable(target.get(key))) continue;
    const val = source.get(key);
    if (unusable(val)) { stillMissing.push(key); continue; }
    const quoted = /[\s#"'$`\\]/.test(val) ? `"${val.replace(/(["\\$`])/g, '\\$1')}"` : val;
    const idx = lines.findIndex((l) => l.replace(/^\s*export\s+/, '').trim().startsWith(`${key}=`));
    if (idx === -1) lines.push(`${key}=${quoted}`); else lines[idx] = `${key}=${quoted}`;
    written.push(key);
  }
  if (written.length) fs.writeFileSync(args.target, `${lines.join('\n')}\n`, { mode: 0o600 });
  if (args.consume && args.source !== '-') fs.rmSync(args.source, { force: true });

  // Key names only, never a value.
  process.stdout.write(`${JSON.stringify({ target: args.target, written, still_missing: stillMissing })}\n`);
}

main();
