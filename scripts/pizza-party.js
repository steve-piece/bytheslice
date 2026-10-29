#!/usr/bin/env node
// scripts/pizza-party.js
// /pizza-party's helper: `preflight` reports which tools and providers this machine has authorized (read-only, never a secret), `record` appends one run record to the machine-level run log, and `runs` prints the log as a table so runs of the same brief can be compared across models and plugin versions. Zero dependencies.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const HOME = process.env.BTS_HOME || path.join(os.homedir(), '.bytheslice');
const RUNS = path.join(HOME, 'pizza-party', 'runs.jsonl');
const TICKET = path.join('docs', 'pizza-party', 'order.md');

/**
 * Provider CLIs and the read-only command that succeeds only when one is
 * logged in. Order is alphabetical inside each kind: none is a default.
 */
const PROVIDERS = {
  hosts: [
    { name: 'cloudflare', bin: 'wrangler', args: ['whoami'] },
    { name: 'fly', bin: 'fly', args: ['auth', 'whoami'] },
    { name: 'netlify', bin: 'netlify', args: ['status'] },
    { name: 'railway', bin: 'railway', args: ['whoami'] },
    { name: 'render', bin: 'render', args: ['whoami'] },
    { name: 'vercel', bin: 'vercel', args: ['whoami'] },
  ],
  databases: [
    { name: 'neon', bin: 'neonctl', args: ['me'] },
    { name: 'supabase', bin: 'supabase', args: ['projects', 'list'] },
    { name: 'turso', bin: 'turso', args: ['auth', 'whoami'] },
  ],
};

/** True when a command exits 0 within the timeout; its output is never kept. */
function succeeds(bin, args, cwd) {
  const run = spawnSync(bin, args, { cwd, stdio: 'ignore', timeout: 8000, env: { ...process.env, CI: '1', NO_COLOR: '1' } });
  return run.status === 0;
}

function has(bin) {
  // `bin` is always one of this file's own constants, never input.
  return spawnSync('/bin/sh', ['-c', `command -v ${bin}`], { stdio: 'ignore' }).status === 0;
}

/** The folder itself, else its nearest existing parent: a check run in a missing folder fails before it starts. */
function existingDir(dir) {
  let at = dir;
  while (!fs.existsSync(at) && path.dirname(at) !== at) at = path.dirname(at);
  return at;
}

/** What this machine can do for an unattended build, as JSON on stdout. */
function preflight(root) {
  const target = path.resolve(root || process.cwd());
  // A new app's folder does not exist yet: the provider checks run from its nearest parent.
  const cwd = existingDir(target);
  const tools = {};
  for (const bin of ['git', 'node', 'pnpm', 'npm', 'gh', 'npx']) tools[bin] = has(bin);
  const out = {
    root: target,
    tools,
    github: tools.gh && succeeds('gh', ['auth', 'status'], cwd),
    hosts: [],
    databases: [],
    folder: { exists: fs.existsSync(target), empty: !fs.existsSync(target) || fs.readdirSync(target).filter(n => n !== '.DS_Store').length === 0 },
    checklist: fs.existsSync(path.join(target, 'docs', 'plans', '00_master_checklist.md')),
    ticket: fs.existsSync(path.join(target, TICKET)),
  };
  for (const [kind, list] of Object.entries(PROVIDERS)) {
    for (const p of list) {
      const installed = has(p.bin);
      out[kind].push({ name: p.name, cli: installed, authorized: installed && succeeds(p.bin, p.args, cwd) });
    }
  }
  process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
}

function args(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const m = /^--([\w-]+)$/.exec(argv[i]);
    if (m) {
      out[m[1]] = argv[i + 1] !== undefined && !argv[i + 1].startsWith('--') ? argv[(i += 1)] : true;
    } else if (out._ === undefined) out._ = argv[i];
  }
  return out;
}

/** Counts the list items under one `## <heading>` of the order ticket. */
function ticketCount(text, heading) {
  const at = text.search(new RegExp(`^##\\s+${heading}`, 'mi'));
  if (at === -1) return 0;
  const section = text.slice(at).split(/\n(?=##\s)/)[0];
  return section
    .split('\n')
    .slice(1)
    .filter(line => /^\s*[-*]\s+\S/.test(line)).length;
}

/** The ledger totals for a project, through scripts/ledger-summary.js; null without a ledger. */
function ledgerTotals(root) {
  try {
    const json = execFileSync(process.execPath, [path.join(__dirname, 'ledger-summary.js'), '--root', root, '--format', 'json'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 20000,
    });
    return JSON.parse(json).totals ?? null;
  } catch {
    return null;
  }
}

/** Appends one run record to ~/.bytheslice/pizza-party/runs.jsonl and prints it. */
function record(opts) {
  const root = path.resolve(opts.root || process.cwd());
  const ticket = fs.existsSync(path.join(root, TICKET)) ? fs.readFileSync(path.join(root, TICKET), 'utf8') : '';
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  const startedAt = Number(opts.started) || null;
  const row = {
    v: 1,
    t: Date.now(),
    brief: opts.brief || path.basename(root),
    app: path.basename(root),
    plugin: pkg.version,
    model: opts.model || null,
    outcome: ['shipped', 'partial', 'failed'].includes(opts.outcome) ? opts.outcome : 'partial',
    url: typeof opts.url === 'string' ? opts.url : null,
    urlKind: ['deployed', 'artifact', 'localhost'].includes(opts['url-kind']) ? opts['url-kind'] : null,
    wallMs: startedAt ? Date.now() - startedAt : null,
    decisions: ticketCount(ticket, 'Decisions made without you'),
    deferred: ticketCount(ticket, 'Deferred'),
    acceptance: opts.acceptance || null,
    ledger: ledgerTotals(root),
  };
  fs.mkdirSync(path.dirname(RUNS), { recursive: true });
  fs.appendFileSync(RUNS, `${JSON.stringify(row)}\n`, { mode: 0o600 });
  process.stdout.write(`${JSON.stringify(row, null, 2)}\n`);
}

/** Prints the run log as a table, newest first; `--brief <id>` keeps one brief. */
function runs(opts) {
  const text = fs.existsSync(RUNS) ? fs.readFileSync(RUNS, 'utf8') : '';
  const rows = text
    .split('\n')
    .filter(Boolean)
    .flatMap(line => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    })
    .filter(row => opts.brief === undefined || row.brief === opts.brief)
    .sort((a, b) => b.t - a.t);
  if (rows.length === 0) return process.stdout.write(`No pizza-party runs recorded${opts.brief ? ` for ${opts.brief}` : ''} (${RUNS}).\n`);
  const hours = ms => (ms === null || ms === undefined ? '' : (ms / 3600000).toFixed(1));
  const lines = [
    '| Date | Brief | Plugin | Model | Outcome | Hours | Cost | Slices done | Fix loops | Decisions | Deferred | Acceptance | URL |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|',
  ];
  for (const r of rows) {
    const l = r.ledger || {};
    lines.push(
      `| ${new Date(r.t).toISOString().slice(0, 10)} | ${r.brief} | ${r.plugin} | ${r.model ?? ''} | ${r.outcome} | ${hours(r.wallMs)} | ${
        l.costUsd === null || l.costUsd === undefined ? '' : `$${l.costUsd.toFixed(2)}`
      } | ${l.slicesDone ?? ''}/${l.slices ?? ''} | ${l.fixLoops ?? ''} | ${r.decisions} | ${r.deferred} | ${r.acceptance ?? ''} | ${r.url ?? ''} |`,
    );
  }
  process.stdout.write(`${lines.join('\n')}\n`);
}

function main(argv) {
  const [command, ...rest] = argv;
  const opts = args(rest);
  if (command === 'preflight') return preflight(opts._);
  if (command === 'record') return record({ ...opts, root: opts.root ?? opts._ });
  if (command === 'runs') return runs(opts);
  process.stderr.write(
    'usage: pizza-party.js preflight [root] | record [root] --brief <id> --outcome shipped|partial|failed [--url <u> --url-kind deployed|artifact|localhost --model <m> --started <ms> --acceptance <n/m>] | runs [--brief <id>]\n',
  );
  process.exitCode = 2;
}

if (require.main === module) main(process.argv.slice(2));

module.exports = { ticketCount, PROVIDERS, RUNS };
