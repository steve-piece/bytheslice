// mcp/checklist-format.js
// The master checklist format check shared by the hooks and the kitchen MCP: the shapes the status parsers cannot count, each with its line number, plus the counts they do read. Warn only, zero dependencies.
'use strict';

const fs = require('node:fs');
const { parseChecklist, shopStatus } = require('./kitchen-state.js');

const RULES = Object.freeze({
  'table-only-pie': 'a pie lists its slices only in a table',
  'duplicate-slice': 'a slice is listed more than once',
  'unreadable-status': 'a status is written in a form the parsers do not read',
  'status-disagreement': 'a pie status and its slice statuses disagree',
  'unknown-status': 'a Status value is not one the parsers know',
  'missing-status': 'a slice has no status',
});

// The status words the parsers know. Anything else after `Status:` reads as open, silently.
const KNOWN = /^(?:completed?|done|shipped|merged|in[ -]progress|active|running|partial|in[ -]review|not[ -]started|open|pending|planned|to[ -]?do|queued|blocked|deferred|skipped|waiting|n\/a|not applicable)\b/i;
const STATUS_LINE = /^\s*(?:\*\*)?Status(?:\*\*)?:/i;
const LOOSE_STATUS = /^\s*(?:(?:[-*+]|\d+\.)\s+|>\s*)*[*_]*\s*Status\s*[*_]*\s*(?::|=|\u2013|\u2014|-\s)/i;
const HEADING = /^#{2,3}\s/;
const CHECK_EMOJI = /[\u2705\u2714\u2611\u2713]/;
const ODD_NOTE = /<!--\s*(?:status\s*(?:=|-|\u2013|\u2014)|(?:done|completed?|shipped)\s*-->)/i;

const label = number => `Slice ${number}`;
const valuesIn = raw => [...raw.matchAll(/\bStatus:\s*(?:\*\*|__)?\s*([^,;(|<\n]*)/gi)]
  .map(match => match[1].replace(/\*\*|__|-->/g, '').replace(/[.\s]+$/, '').trim());

/**
 * Every format problem in a master checklist, sorted by line: `{ rule, line, message }`.
 * Never throws; a string that is not a checklist answers [].
 */
function validateChecklist(markdown) {
  if (typeof markdown !== 'string' || !markdown.trim()) return [];
  const meta = {};
  try { parseChecklist(markdown, meta); } catch { return []; }
  const problems = [];
  const add = (rule, line, message) => problems.push({ rule, line, message });
  // A pie that reads as open only because its own Status line holds an unknown value draws that one problem, not two.
  const unknownBefore = pie => meta.scoped.some(({ line, raw }) => line >= pie.line && line < pie.slices[0].line &&
    STATUS_LINE.test(raw) && valuesIn(raw.replace(/<!--.*?-->/g, '')).some(value => !value || !KNOWN.test(value)));

  for (const pie of meta.pies) {
    const name = pie.kind === 'prep' ? 'Prep' : `Pie ${pie.pie}`;
    if (pie.tableOnly) {
      add('table-only-pie', pie.tableLine, `${name} lists its slices only in a table; give each one a \`### Slice N.M\` heading with a \`**Status:**\` line`);
      for (const slice of pie.slices) {
        const value = (slice.statusCell || '').replace(/^\[[ xX~-]\]\s*/, '').replace(/^Status:\s*/i, '');
        if (!slice.explicit) add('missing-status', slice.line, `${label(slice.number)} has no status in its table row`);
        else if (value && !KNOWN.test(value) && !/^~~/.test(value)) {
          add('unknown-status', slice.line, `${label(slice.number)} status "${value.slice(0, 60)}" is not a known value (Completed, In Progress, Not Started, Partial)`);
        }
      }
    }
    for (const slice of pie.slices) {
      if (slice.kind === 'heading' && !slice.explicit) {
        add('missing-status', slice.line, `${label(slice.number)} has no status; add a \`**Status:**\` line (Not Started, In Progress or Completed)`);
      }
    }
    if (pie.kind !== 'pie' && pie.kind !== 'prep') continue;
    if (!pie.explicit || pie.slices.length === 0) continue;
    const open = pie.slices.filter(slice => slice.own !== 'done');
    if (pie.declared === 'done' && open.length) {
      const named = open.slice(0, 4).map(slice => `${slice.number} (line ${slice.line}, ${slice.own})`).join(', ');
      add('status-disagreement', pie.line, `${name} is marked done but ${open.length === 1 ? 'Slice' : 'Slices'} ${named}${open.length > 4 ? ' and more' : ''} ${open.length === 1 ? 'is' : 'are'} not; the counts treat every slice in it as done`);
    } else if (pie.declared !== 'done' && open.length === 0 && !unknownBefore(pie)) {
      add('status-disagreement', pie.line, `${name} is marked ${pie.declared === 'active' ? 'in progress' : 'open'} but all ${pie.slices.length} of its slices are done; mark the pie Completed`);
    }
  }

  const seen = new Map();
  for (const item of meta.occurrences) {
    if (item.kind === 'stage') continue;
    const first = seen.get(item.number);
    if (first) add('duplicate-slice', item.line, `${label(item.number)} is listed again (first at line ${first}); keep one entry so it counts once`);
    else seen.set(item.number, item.line);
  }

  for (const { line, raw } of meta.scoped) {
    const bare = raw.replace(/<!--.*?-->/g, '');
    const heading = HEADING.test(raw);
    if (!heading && !STATUS_LINE.test(bare) && LOOSE_STATUS.test(bare)) {
      add('unreadable-status', line, 'this status line is not read: write it as `**Status:** <value>` at the start of its own line');
      continue;
    }
    if (heading && CHECK_EMOJI.test(bare) && !/\[[ xX-]\]|~~|\bStatus:/i.test(raw)) {
      add('unreadable-status', line, 'a check emoji is not a status; use `[x]` or a `<!-- Status: Completed -->` note on the heading');
    }
    if (ODD_NOTE.test(raw)) add('unreadable-status', line, 'this status note is not read: write it as `<!-- Status: <value> -->`');
    if (heading || STATUS_LINE.test(bare) || /<!--\s*Status:/i.test(raw)) {
      for (const value of valuesIn(heading ? raw : STATUS_LINE.test(bare) ? bare : raw)) {
        if (!value) add('unknown-status', line, 'a `Status:` with no value reads as open');
        else if (!KNOWN.test(value)) add('unknown-status', line, `status "${value.slice(0, 60)}" is not a known value (Completed, In Progress, Not Started, Partial); it reads as open`);
      }
    }
  }

  return problems.sort((a, b) => a.line - b.line || a.rule.localeCompare(b.rule));
}

/** The pie and slice counts the shop status prints, from the same parse the kitchen and the Pass use. */
function checklistCounts(markdown) {
  const text = typeof markdown === 'string' ? markdown : '';
  const meta = {};
  parseChecklist(text, meta);
  const { pies, slices } = shopStatus(text);
  const next = meta.pies.find(pie => pie.kind === 'pie' && pie.status !== 'done');
  return { pies: { done: pies.done, total: pies.total }, slices: { done: slices.done, total: slices.total },
    nextOpenPie: next ? next.heading : null };
}

const MAX_LINES = 20;

/** The context text a hook adds for `problems`; empty when there are none. */
function formatReport(problems, where = 'docs/plans/00_master_checklist.md') {
  if (!problems.length) return '';
  const shown = problems.slice(0, MAX_LINES).map(p => `  - line ${p.line} ${p.rule}: ${p.message}`);
  if (problems.length > MAX_LINES) shown.push(`  - and ${problems.length - MAX_LINES} more`);
  return [
    `[bytheslice checklist format] ${where}: ${problems.length} ${problems.length === 1 ? 'problem' : 'problems'} the status counts cannot read.`,
    ...shown,
    `To repair: start a separate subagent session (the Agent tool, its own context) that fixes only these lines in ${where}, so the pie and slice counts read true. Do not stop your current task for it. If your work has nothing to do with slices, keep going and leave this for later.`,
  ].join('\n');
}

function main(argv) {
  const [mode, file, ...rest] = argv;
  const where = rest[0] === '--label' && rest[1] ? rest[1] : 'docs/plans/00_master_checklist.md';
  let markdown = '';
  try { markdown = fs.readFileSync(file, 'utf8'); } catch { return 0; }
  if (mode === 'check') {
    const report = formatReport(validateChecklist(markdown), where);
    if (report) process.stdout.write(`${report}\n`);
  } else if (mode === 'counts') {
    const { pies, slices, nextOpenPie } = checklistCounts(markdown);
    process.stdout.write(`pies ${pies.done} ${pies.total}\nslices ${slices.done} ${slices.total}\nnext ${nextOpenPie || ''}\n`);
  }
  return 0;
}

if (require.main === module) {
  try { main(process.argv.slice(2)); } catch { /* A format check never fails its caller. */ }
  process.exit(0);
}

module.exports = { RULES, KNOWN, validateChecklist, checklistCounts, formatReport };
