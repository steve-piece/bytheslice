#!/usr/bin/env node
// scripts/ledger-summary.js
// The one Pass ledger fold (per pie and slice: started, done, duration, fix loops, verdicts, commits, models, tokens, cost, warnings, HITL wait) as JSON, a text table or a PR evidence section; zero dependencies, read-only.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const LEDGER_DIR = '.bytheslice';
const LEDGER_FILE = 'ledger.jsonl';
const CHECKLIST = path.join('docs', 'plans', '00_master_checklist.md');
/** What the kitchen reads per snapshot: the newest 1 MiB of the ledger. */
const KITCHEN_MAX_BYTES = 1024 * 1024;
/** A decision note as the PR body quotes it. */
const NOTE_MAX = 300;
const FORMATS = new Set(['json', 'text', 'pr-body']);
const EVENTS = new Set([
  'pie.started', 'slice.started', 'slice.done', 'verdict', 'commit', 'push', 'merge',
  'hitl.raised', 'hitl.answered', 'note', 'usage', 'slice.rollup', 'warn', 'agent.stalled',
  'teammate.idle', 'teammate.done', 'edit',
]);

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const finite = value => typeof value === 'number' && Number.isFinite(value);
const SLICE_ID = /^\d+\.\d+$/;

/** Parses ledger text oldest first: a torn or foreign line is skipped, never thrown. */
function parseRows(text) {
  const rows = [];
  for (const line of String(text).split('\n')) {
    if (line.trim() === '') continue;
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    if (!object(row) || row.v !== 1 || !finite(row.t) || typeof row.sid !== 'string' || !EVENTS.has(row.ev)) continue;
    if (row.pie !== undefined && !Number.isSafeInteger(row.pie)) continue;
    if (row.slice !== undefined && (typeof row.slice !== 'string' || !SLICE_ID.test(row.slice))) continue;
    rows.push(row);
  }
  return rows;
}

/**
 * Reads the ledger text, or null when it is missing. With `maxBytes`, only
 * the newest bytes are read and the first (partial) line of the cut is dropped.
 */
function readLedgerText(file, maxBytes) {
  let fd;
  try {
    fd = fs.openSync(file, 'r');
  } catch {
    return null;
  }
  try {
    const size = fs.fstatSync(fd).size;
    const cap = Number.isSafeInteger(maxBytes) && maxBytes > 0 ? maxBytes : size;
    const start = Math.max(0, size - cap);
    const buffer = Buffer.alloc(size - start);
    let read = 0;
    while (read < buffer.length) {
      const n = fs.readSync(fd, buffer, read, buffer.length - read, start + read);
      if (n === 0) break;
      read += n;
    }
    const text = buffer.subarray(0, read).toString('utf8');
    return start > 0 ? text.slice(text.indexOf('\n') + 1) : text;
  } finally {
    fs.closeSync(fd);
  }
}

const roots = new Map();

function gitCommonDir(dir) {
  for (const argv of [['rev-parse', '--path-format=absolute', '--git-common-dir'], ['rev-parse', '--git-common-dir']]) {
    try {
      const out = execFileSync('git', argv, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 }).trim();
      if (out !== '') return path.resolve(dir, out);
    } catch {
      // Not a repository, or a git without --path-format: the next form, else none.
    }
  }
  return null;
}

/**
 * The ledger root for a directory, as the mod resolves it: the directory
 * itself when it holds a ledger, else the parent of its git common dir (the
 * primary checkout, shared by every worktree), else the directory.
 */
function resolveRoot(dir) {
  const start = path.resolve(dir || process.cwd());
  if (roots.has(start)) return roots.get(start);
  let root = start;
  if (!fs.existsSync(path.join(start, LEDGER_DIR, LEDGER_FILE))) {
    const common = gitCommonDir(start);
    if (common !== null && path.basename(common) === '.git') root = path.dirname(common);
  }
  roots.set(start, root);
  return root;
}

const ledgerFile = root => path.join(root, LEDGER_DIR, LEDGER_FILE);

const cleanName = s => s.replace(/<!--.*?-->/g, '').replace(/\[[ xX-]\]/g, '').replace(/~~/g, '').trim();

/** Pie and slice names from master checklist text; names only, nothing else is kept. */
function namesFromText(text) {
  const names = { pies: new Map(), slices: new Map() };
  let fenced = false;
  for (const raw of String(text || '').split('\n')) {
    if (/^\s*(```|~~~)/.test(raw)) { fenced = !fenced; continue; }
    if (fenced) continue;
    if (/^##\s+Prep\b/i.test(raw) && !names.pies.has(1)) names.pies.set(1, 'Foundations');
    const pie = /^##\s+(?:\[[ xX-]\]\s*)?(?:~~)?Pie\s+(\d+)\s*[-:\u2013\u2014]?\s*(.*)$/i.exec(raw);
    if (pie && !names.pies.has(Number(pie[1]))) names.pies.set(Number(pie[1]), cleanName(pie[2]));
    const slice = /^###\s+(?:\[[ xX-]\]\s*)?(?:~~)?Slice\s+(\d+\.\d+)\s*[-:\u2013\u2014]?\s*(.*)$/i.exec(raw);
    if (slice && !names.slices.has(slice[1])) names.slices.set(slice[1], cleanName(slice[2]));
  }
  return names;
}

/** Names from the first readable master checklist under the given directories. */
function readNames(dirs) {
  for (const dir of dirs) {
    try {
      return namesFromText(fs.readFileSync(path.join(dir, CHECKLIST), 'utf8'));
    } catch {
      // The next directory, else no names.
    }
  }
  return namesFromText('');
}

const pieOfRow = row => (Number.isSafeInteger(row.pie) ? row.pie : row.slice ? Number(row.slice.split('.')[0]) : null);
const bySliceId = (a, b) => {
  const [am, an] = a.split('.').map(Number);
  const [bm, bn] = b.split('.').map(Number);
  return am - bm || an - bn;
};
const round4 = n => Math.round(n * 10000) / 10000;

/** A usage row's tokens: input plus output (cache reads left out). */
function tokensOf(data) {
  const t = object(data) ? data.tokens : null;
  if (!object(t)) return 0;
  return (finite(t.input_tokens) ? t.input_tokens : 0) + (finite(t.output_tokens) ? t.output_tokens : 0);
}

function emptySlice(id, name) {
  return {
    id, name, startedAt: null, doneAt: null, durationMs: null, fixLoops: 0, verdicts: [], commits: [], models: [],
    tokens: 0, costUsd: null, warnings: [], stalls: 0, hitl: { raised: 0, open: 0, waitMs: 0 }, notes: [],
  };
}

/**
 * Folds ledger rows into `{ pies, totals, series }`. `pie` keeps one pie;
 * `names` lends pie and slice names. Metadata only: no ledger row carries a
 * file's content, and none is read here.
 */
function summarize(rows, opts = {}) {
  const only = Number.isSafeInteger(opts.pie) ? opts.pie : null;
  const names = opts.names || { pies: new Map(), slices: new Map() };
  const kept = rows.filter(row => only === null || pieOfRow(row) === only);
  const pies = new Map();
  const pieOf = n => {
    if (!pies.has(n)) pies.set(n, { n, name: names.pies.get(n) || null, startedAt: null, mergedAt: null, slices: new Map() });
    return pies.get(n);
  };
  const sliceOf = id => {
    const pie = pieOf(Number(id.split('.')[0]));
    if (!pie.slices.has(id)) {
      pie.slices.set(id, {
        view: emptySlice(id, names.slices.get(id) || null),
        firstRow: null, rollup: null, fails: 0, warn: new Map(), raised: new Map(), answered: new Set(),
      });
    }
    return pie.slices.get(id);
  };
  // Session cost is cumulative: each usage row adds its rise over the same session's previous one.
  const lastCost = new Map();
  let warnings = 0;
  for (const row of kept) {
    const pieN = pieOfRow(row);
    if (pieN !== null) pieOf(pieN);
    const data = object(row.data) ? row.data : {};
    if (row.ev === 'usage' && finite(data.costUsd)) {
      const delta = Math.max(0, data.costUsd - (lastCost.get(row.sid) || 0));
      lastCost.set(row.sid, data.costUsd);
      if (row.slice) {
        const s = sliceOf(row.slice).view;
        s.costUsd = (s.costUsd || 0) + delta;
      }
    }
    if (row.ev === 'pie.started' && pieN !== null) {
      const pie = pieOf(pieN);
      pie.startedAt = pie.startedAt === null ? row.t : Math.min(pie.startedAt, row.t);
    }
    if (row.ev === 'merge' && pieN !== null) pieOf(pieN).mergedAt = row.t;
    if (row.ev === 'warn') warnings += 1;
    if (!row.slice) continue;
    const entry = sliceOf(row.slice);
    const s = entry.view;
    entry.firstRow = entry.firstRow === null ? row.t : Math.min(entry.firstRow, row.t);
    if (row.ev === 'slice.started') s.startedAt = s.startedAt === null ? row.t : Math.min(s.startedAt, row.t);
    else if (row.ev === 'slice.done') s.doneAt = s.doneAt === null ? row.t : s.doneAt;
    else if (row.ev === 'verdict' && (data.gate === 'slice-tester' || data.gate === 'slice-verifier')) {
      const overall = data.overall === 'pass' || data.overall === 'fail' ? data.overall : 'unparsed';
      s.verdicts.push({ gate: data.gate, overall, head: typeof data.head === 'string' ? data.head : null, t: row.t });
      if (overall === 'fail') entry.fails += 1;
    } else if (row.ev === 'commit') {
      if (typeof data.sha === 'string' && !s.commits.includes(data.sha)) s.commits.push(data.sha);
    } else if (row.ev === 'usage') {
      if (typeof data.model === 'string' && data.model !== '' && !s.models.includes(data.model)) s.models.push(data.model);
      s.tokens += tokensOf(data);
    } else if (row.ev === 'slice.rollup') entry.rollup = data;
    else if (row.ev === 'warn') {
      if (typeof data.code === 'string' && data.code !== '') entry.warn.set(data.code, (entry.warn.get(data.code) || 0) + 1);
    } else if (row.ev === 'agent.stalled') s.stalls += 1;
    else if (row.ev === 'hitl.raised') {
      if (typeof data.id === 'string' && !entry.raised.has(data.id)) entry.raised.set(data.id, row.t);
    } else if (row.ev === 'hitl.answered') {
      if (typeof data.id === 'string' && entry.raised.has(data.id) && !entry.answered.has(data.id)) {
        entry.answered.add(data.id);
        s.hitl.waitMs += Math.max(0, row.t - entry.raised.get(data.id));
      }
    } else if (row.ev === 'note' && typeof data.text === 'string' && data.text.trim() !== '') {
      s.notes.push({ t: row.t, text: data.text });
    }
  }
  const outPies = [...pies.values()].sort((a, b) => a.n - b.n).map(pie => {
    const slices = [...pie.slices.keys()].sort(bySliceId).map(id => {
      const { view: s, firstRow, rollup, fails, warn, raised, answered } = pie.slices.get(id);
      // A slice with no slice.started row (one started before the ledger) counts from its first row.
      if (s.startedAt === null) s.startedAt = firstRow;
      // A rollup counted fix-attempter starts from the activity log; without one, each failed verdict is one loop.
      s.fixLoops = rollup && finite(rollup.fixLoops) ? rollup.fixLoops : fails;
      if (rollup && finite(rollup.tokens)) s.tokens += rollup.tokens;
      s.durationMs = s.startedAt !== null && s.doneAt !== null ? Math.max(0, s.doneAt - s.startedAt) : null;
      s.costUsd = s.costUsd === null ? null : round4(s.costUsd);
      s.warnings = [...warn.entries()].map(([code, n]) => ({ code, n })).sort((a, b) => b.n - a.n || a.code.localeCompare(b.code));
      s.hitl.raised = raised.size;
      s.hitl.open = raised.size - answered.size;
      return s;
    });
    const firstSlice = slices.reduce((min, s) => (s.startedAt !== null && (min === null || s.startedAt < min) ? s.startedAt : min), null);
    return { n: pie.n, name: pie.name, startedAt: pie.startedAt === null ? firstSlice : pie.startedAt, mergedAt: pie.mergedAt, slices };
  });
  const all = outPies.flatMap(pie => pie.slices);
  const costs = all.filter(s => s.costUsd !== null);
  const done = all.filter(s => s.doneAt !== null).sort((a, b) => a.doneAt - b.doneAt);
  return {
    pies: outPies,
    totals: {
      pies: outPies.length,
      slices: all.length,
      slicesDone: done.length,
      durationMs: all.reduce((sum, s) => sum + (s.durationMs || 0), 0),
      fixLoops: all.reduce((sum, s) => sum + s.fixLoops, 0),
      tokens: all.reduce((sum, s) => sum + s.tokens, 0),
      costUsd: costs.length === 0 ? null : round4(costs.reduce((sum, s) => sum + s.costUsd, 0)),
      warnings,
      stalls: all.reduce((sum, s) => sum + s.stalls, 0),
      hitlRaised: all.reduce((sum, s) => sum + s.hitl.raised, 0),
      hitlWaitMs: all.reduce((sum, s) => sum + s.hitl.waitMs, 0),
    },
    series: done.map((s, i) => ({ t: s.doneAt, slicesDone: i + 1 })),
  };
}

/** A duration as `45s`, `12m` or `2h 05m`; `-` when unknown. */
function duration(ms) {
  if (!finite(ms)) return '-';
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

const money = usd => (finite(usd) ? `$${usd.toFixed(2)}` : '-');
const latest = (s, gate) => s.verdicts.filter(v => v.gate === gate).reduce((a, v) => (a === null || v.t >= a.t ? v : a), null);
const pieTitle = pie => `Pie ${pie.n}${pie.name ? ` ${pie.name}` : ''}`;

/** The pass history table: one block per pie, one row per slice (done, duration, fix loops, verifier, cost). */
function formatText(summary) {
  if (!summary.pies || summary.pies.length === 0) return 'No ledger rows yet: bake a pie with the Pass mod loaded.';
  const lines = [];
  for (const pie of summary.pies) {
    const done = pie.slices.filter(s => s.doneAt !== null).length;
    const costed = pie.slices.filter(s => s.costUsd !== null);
    const fixes = pie.slices.reduce((sum, s) => sum + s.fixLoops, 0);
    const cost = costed.length === 0 ? 'no cost' : money(costed.reduce((sum, s) => sum + s.costUsd, 0));
    lines.push(`${pieTitle(pie)} · ${done} of ${pie.slices.length} slices done · fix loops ${fixes} · ${cost}`);
    const rows = [['slice', 'done', 'duration', 'fix', 'verifier', 'cost']];
    for (const s of pie.slices) {
      const v = latest(s, 'slice-verifier');
      rows.push([s.id, s.doneAt !== null ? 'yes' : 'no', duration(s.durationMs), String(s.fixLoops), v ? v.overall : '-', money(s.costUsd)]);
    }
    const widths = rows[0].map((_, i) => Math.max(...rows.map(r => r[i].length)));
    for (const r of rows) lines.push(`  ${r.map((value, i) => value.padEnd(widths[i])).join('  ').trimEnd()}`);
  }
  const t = summary.totals;
  if (t) lines.push(`Total · ${t.slicesDone} of ${t.slices} slices done · ${duration(t.durationMs)} · fix loops ${t.fixLoops} · ${t.costUsd === null ? 'no cost' : money(t.costUsd)}`);
  return lines.join('\n');
}

const cell = value => String(value).replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ');
const oneLine = (value, max) => {
  const chars = Array.from(String(value).replace(/\s+/g, ' ').trim());
  return chars.length <= max ? chars.join('') : `${chars.slice(0, max - 3).join('').trimEnd()}...`;
};

/** The PR evidence section in Markdown: a slice table, a warnings line per code, HITL waits and decision notes. */
function formatPrBody(summary) {
  const lines = ['_Generated from `.bytheslice/ledger.jsonl` by `scripts/ledger-summary.js`; do not edit by hand._', ''];
  if (!summary.pies || summary.pies.length === 0) {
    lines.push('No ledger rows for this pie: it was baked without the Pass mod, so there is no ledger evidence.');
    return lines.join('\n');
  }
  for (const pie of summary.pies) {
    lines.push(`### ${cell(pieTitle(pie))}`, '');
    lines.push('| Slice | Verifier at commit | Tester | Fix loops | Models | Duration | Cost |');
    lines.push('|---|---|---|---|---|---|---|');
    for (const s of pie.slices) {
      const v = latest(s, 'slice-verifier');
      const tester = latest(s, 'slice-tester');
      const verifier = v ? `${v.overall}${v.head ? ` @ \`${v.head.slice(0, 7)}\`` : ''}` : 'none';
      lines.push(`| ${cell(`${s.id}${s.name ? ` ${s.name}` : ''}`)} | ${verifier} | ${tester ? tester.overall : 'none'} | ${s.fixLoops} | ${cell(s.models.join(', ') || '-')} | ${duration(s.durationMs)} | ${money(s.costUsd)} |`);
    }
    lines.push('');
    const codes = new Map();
    for (const s of pie.slices) {
      for (const w of s.warnings) {
        const entry = codes.get(w.code) || { n: 0, slices: [] };
        entry.n += w.n;
        entry.slices.push(s.id);
        codes.set(w.code, entry);
      }
    }
    if (codes.size === 0) lines.push('**Warnings:** none');
    else {
      lines.push('**Warnings** (every check warns; none blocked):');
      for (const [code, entry] of [...codes.entries()].sort((a, b) => b[1].n - a[1].n || a[0].localeCompare(b[0]))) {
        lines.push(`- \`${cell(code)}\`: ${entry.n} (${entry.slices.join(', ')})`);
      }
    }
    const waits = pie.slices.filter(s => s.hitl.raised > 0);
    if (waits.length === 0) lines.push('', '**HITL waits:** none');
    else {
      lines.push('', '**HITL waits:**');
      for (const s of waits) {
        const open = s.hitl.open > 0 ? `, ${s.hitl.open} still open` : '';
        lines.push(`- ${s.id}: ${s.hitl.raised} raised, ${duration(s.hitl.waitMs)} waited${open}`);
      }
    }
    const notes = pie.slices.flatMap(s => s.notes.map(note => ({ id: s.id, text: note.text })));
    if (notes.length > 0) {
      lines.push('', '**Decision notes:**');
      for (const note of notes) lines.push(`- ${note.id}: ${oneLine(note.text, NOTE_MAX)}`);
    }
    lines.push('');
  }
  const t = summary.totals;
  if (t) lines.push(`**Totals:** ${t.slicesDone} of ${t.slices} slices done, ${duration(t.durationMs)}, ${t.fixLoops} fix loops, ${t.stalls} stalls, ${t.costUsd === null ? 'no cost recorded' : money(t.costUsd)}.`);
  return lines.join('\n').trimEnd();
}

/**
 * The summary for a directory: resolves the ledger root, reads the ledger
 * (its newest `maxBytes` when given) and folds it. A missing ledger answers
 * `{ pies: [] }` with `missing: true` beside it.
 */
function summaryFor(opts = {}) {
  const dir = path.resolve(opts.dir || process.cwd());
  const root = resolveRoot(dir);
  const text = readLedgerText(ledgerFile(root), opts.maxBytes);
  if (text === null) return { root, missing: true, summary: { pies: [] } };
  const names = readNames([...new Set([dir, root])]);
  return { root, missing: false, summary: summarize(parseRows(text), { pie: opts.pie, names }) };
}

function parseArgs(argv) {
  const out = { format: 'json', dir: null, pie: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const value = () => {
      const next = argv[i + 1];
      if (next === undefined) throw new Error(`${arg} needs a value`);
      i += 1;
      return next;
    };
    if (arg === '--root') out.dir = value();
    else if (arg === '--pie') {
      const n = Number(value());
      if (!Number.isSafeInteger(n) || n < 0) throw new Error('--pie takes a pie number');
      out.pie = n;
    } else if (arg === '--format') {
      out.format = value();
      if (!FORMATS.has(out.format)) throw new Error('--format takes json, text or pr-body');
    } else throw new Error(`unknown argument ${arg}`);
  }
  return out;
}

function main(argv, write = text => process.stdout.write(text)) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (error) {
    process.stderr.write(`ledger-summary: ${error.message}\nusage: ledger-summary.js [--root <dir>] [--pie <n>] --format json|text|pr-body\n`);
    return 2;
  }
  const { summary } = summaryFor({ dir: args.dir, pie: args.pie });
  if (args.format === 'json') write(`${JSON.stringify(summary)}\n`);
  else if (args.format === 'text') write(`${formatText(summary)}\n`);
  else write(`${formatPrBody(summary)}\n`);
  return 0;
}

module.exports = {
  KITCHEN_MAX_BYTES, LEDGER_DIR, LEDGER_FILE,
  parseRows, readLedgerText, resolveRoot, ledgerFile, namesFromText, readNames, summarize, summaryFor,
  formatText, formatPrBody, duration, parseArgs, main,
};

if (require.main === module) process.exitCode = main(process.argv.slice(2));
