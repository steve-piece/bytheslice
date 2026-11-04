// mcp/kitchen-state.js
// Reads and folds privacy-limited kitchen activity, checklist state and the Pass ledger summary (progress over time, read-only) into a full project snapshot.
'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { execFile } = require('node:child_process');
// The shared ledger fold; an install without it (a skills-only copy) shows no progress rather than failing.
const ledgerSummary = (() => { try { return require('../scripts/ledger-summary.js'); } catch { return null; } })();

const EVENTS = new Set(['SessionStart', 'Stop', 'SubagentStart', 'SubagentStop',
  'PreToolUse', 'PostToolUse', 'UserPromptExpansion']);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const integer = value => Number.isSafeInteger(value) && value >= 0;
const text = (value, max = 160) => typeof value === 'string'
  ? Array.from(value.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim()).slice(0, max).join('') : '';

function sanitizeRow(value) {
  if (!object(value) || !EVENTS.has(value.ev) || !integer(value.t)) return null;
  const row = { t: value.t, ev: value.ev };
  const copyText = (key, max) => { const safe = text(value[key], max); if (safe) row[key] = safe; };
  copyText('sid');
  if (integer(value.pie)) row.pie = value.pie;
  if (typeof value.slice === 'string' && /^\d+\.\d+$/.test(value.slice)) row.slice = value.slice;
  if (value.ev === 'SubagentStart' || value.ev === 'SubagentStop') {
    copyText('agent'); copyText('aid');
  } else if (value.ev === 'PreToolUse' || value.ev === 'PostToolUse') {
    if (value.ev === 'PreToolUse' && text(value.skill)) copyText('skill', 120);
    else { copyText('agent'); copyText('label', 120); }
    if (value.ev === 'PostToolUse') {
      copyText('aid');
      for (const key of ['tok', 'ms']) if (integer(value[key])) row[key] = value[key];
      if (typeof value.ok === 'boolean') row.ok = value.ok;
    }
  } else if (value.ev === 'UserPromptExpansion') {
    copyText('skill', 120); copyText('src', 80);
  }
  return row;
}

function parseActivity(data) {
  const bytes = Buffer.isBuffer(data) ? data : Buffer.from(data || '');
  const cursor = bytes.lastIndexOf(10) + 1;
  const rows = [];
  for (const line of bytes.subarray(0, cursor).toString('utf8').split('\n')) {
    if (!line.trim()) continue;
    try { const row = sanitizeRow(JSON.parse(line)); if (row) rows.push(row); } catch { /* Skip damaged rows. */ }
  }
  return { rows, cursor };
}

function statusOf(line) {
  if (/\[[xX]\]|~~|\bStatus:\s*(?:Completed?|Done|Shipped)\b/i.test(line)) return 'done';
  if (/\bStatus:\s*(?:In Progress|Active|Running|Partial)\b|\[-\]/i.test(line)) return 'active';
  return 'open';
}

// Checklist grammar shared with mcp/checklist-format.js. A slice id may carry one letter (`9.2a`).
const SLICE_HEADING = /^###\s+(?:\[[ xX-]\]\s*)?(?:~~)?Slice\s+(\d+\.\d+[a-z]?)\b(.*)$/i;
const PREP_SLICE = /^\s*(?:-\s*)?\[[ xX]\]\s+Slice\s+(\d+\.\d+[a-z]?)\b(.*)$/i;
const PIE_HEADING = /^##\s+(?:\[[ xX-]\]\s*)?(?:~~)?Pie\s+(\d+)\b(.*)$/i;
const STANDALONE_HEADING = /^##\s+(?:\[[ xX-]\]\s*)?(?:~~)?(?:Slice\s+(\d+\.\d+[a-z]?)|Stage\s+(\d+))\b(.*)$/i;
const STATUS_LINE = /^\s*(?:\*\*)?Status(?:\*\*)?:/i;
// A heading's status may sit in an HTML comment (`### Slice 3.1 <!-- Status: Completed -->`): read it, never strip it.
const STATUS_NOTE = /<!--\s*Status:.*?-->/gi;
const notedStatus = (raw, line) => statusOf(`${line} ${(raw.match(STATUS_NOTE) || []).join(' ')}`);
const explicitOn = (raw, line) => /\[[ xX-]\]|~~|\bStatus:/i.test(line) || /<!--\s*Status:/i.test(raw);
const RANK = { open: 0, active: 1, done: 2 };
const cellsOf = line => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => cell.trim());
const plainCell = cell => cell.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\*\*|`/g, '').trim();
// A table cell's status: a box or strike, or a status word with or without a `Status:` prefix.
const cellStatus = cell => statusOf(/\bStatus:/i.test(cell) ? cell : `Status: ${cell.replace(/^[^\w[~]+/, '')}`);

function titleOf(value) {
  return text(value.replace(/<!--.*?-->/g, '').replace(/\[[ xX-]\]/g, '')
    .replace(/~~/g, '').replace(/\bStatus:.*$/i, '').replace(/^\s*[:.-]\s*/, ''), 240);
}

// Facts a checklist row states in plain text: a commit range or commit, a date, the plan file and a one-line summary.
const COMMIT_RANGE = /\b([0-9a-f]{7,40}\.\.[0-9a-f]{7,40})\b/;
const COMMIT_ONE = /\b(?:commit|in|at)\s+`?([0-9a-f]{7,40})\b/i;
function rowFacts(target, line) {
  if (/^\s*(?:\*\*)?Status(?:\*\*)?:/i.test(line)) {
    const commit = COMMIT_RANGE.exec(line)?.[1] || COMMIT_ONE.exec(line)?.[1];
    const date = /\b(20\d\d-[01]\d-[0-3]\d)\b/.exec(line)?.[1];
    if (commit && !target.commit) target.commit = commit;
    if (date && !target.date) target.date = date;
    return;
  }
  const plan = /\*\*Plan:\*\*\s*\[[^\]]*\]\((?:\.\/)?([\w.-]+\.md)\)/.exec(line);
  if (plan && !target.plan) target.plan = plan[1];
  const scope = /^\s*\*\*Pie scope:\*\*\s*(.+?)(?:\s+\|\s+\*\*|$)/.exec(line);
  if (scope && !target.summary) { target.summary = text(scope[1].replace(/`/g, ''), 240); return; }
  if (!target.summary && line.trim() && !/^\s*(?:\*\*|<!--|[-*|#>[]|\d+\.|Status\b|---)/i.test(line)) target.summary = text(line.replace(/\*\*|`/g, ''), 240);
}

/**
 * Parses the master checklist into pies and slices. Pass an empty object as `meta` to also collect what
 * mcp/checklist-format.js validates: each pie's heading line and declared status, each slice's line and
 * own status, every slice occurrence (duplicates included), the scoped lines, and which pies came from a table.
 */
function parseChecklist(markdown, meta = null) {
  const pies = [];
  let current = null, slice = null, prep = false, fenced = false, table = null;
  const prepChecks = [];
  let prepStatus = 'open';
  const prepPieceExemptions = {};
  const tables = new Map(), pieInfo = new Map(), sliceInfo = new Map();
  if (meta) Object.assign(meta, { pies: [], occurrences: [], scoped: [] });
  const track = (pie, at, raw, line, kind) => pieInfo.set(pie, { line: at, kind, explicit: explicitOn(raw, line),
    heading: line.replace(/^##\s+/, '').trim() });
  const lines = (markdown || '').split(/\r?\n/);
  for (let index = 0; index < lines.length; index++) {
    const raw = lines[index], at = index + 1;
    if (/^\s*(```|~~~)/.test(raw)) { fenced = !fenced; table = null; continue; }
    if (fenced) continue;
    const exemption = /<!--\s*kitchen-piece-exemption:\s*([a-z, ]+)\s*\|\s*(.+?)\s*-->/.exec(raw);
    if (exemption) {
      const evidence = text(exemption[2], 240);
      for (const piece of exemption[1].split(',').map(value => value.trim())) {
        if (Object.hasOwn(PIECE_MARKERS, piece) && evidence) prepPieceExemptions[piece] = evidence;
      }
    }
    const line = raw.replace(/<!--.*?-->/g, '').trimEnd();
    if (!/^\s*\|/.test(line)) table = null;
    if (/^##\s+Prep\b/i.test(line)) {
      prep = true; slice = null;
      prepStatus = notedStatus(raw, line);
      const number = Number(/\bPie\s+(\d+)/i.exec(line)?.[1] || 1);
      current = { id: `pie-${number}`, pie: number, title: 'Foundations', status: prepStatus, single: false, slices: [] };
      pies.push(current); track(current, at, raw, line, 'prep');
      if (meta) meta.scoped.push({ line: at, raw });
      continue;
    }
    const pieMatch = PIE_HEADING.exec(line);
    const standalone = STANDALONE_HEADING.exec(line);
    if (pieMatch) {
      prep = false; slice = null;
      current = { id: `pie-${pieMatch[1]}`, pie: Number(pieMatch[1]), title: titleOf(pieMatch[2]),
        status: notedStatus(raw, line), single: /\bsingle(?:[ -]slice)?\b/i.test(line), slices: [] };
      pies.push(current); track(current, at, raw, line, 'pie');
      if (meta) meta.scoped.push({ line: at, raw });
      continue;
    }
    if (standalone) {
      prep = false;
      const number = standalone[1] || standalone[2];
      const legacy = Boolean(standalone[2]);
      const pie = Number(number.split('.')[0]);
      slice = { id: `${legacy ? 'stage' : 'slice'}-${number}`, number, title: titleOf(standalone[3]), status: notedStatus(raw, line) };
      current = { id: `standalone-${slice.id}`, pie, title: slice.title, status: slice.status, single: true, slices: [slice] };
      pies.push(current); track(current, at, raw, line, legacy ? 'stage' : 'standalone');
      sliceInfo.set(slice, { line: at, kind: 'heading', explicit: explicitOn(raw, line) });
      if (meta) { meta.occurrences.push({ number, line: at, kind: legacy ? 'stage' : 'heading' }); meta.scoped.push({ line: at, raw }); }
      continue;
    }
    if (/^##\s/.test(line)) { current = null; slice = null; prep = false; continue; }
    if (meta && current) meta.scoped.push({ line: at, raw });
    if (prep && /\bn\/a\b|not applicable/i.test(line) && (/\[[xX]\]/.test(line) || prepStatus === 'done')) {
      // Match the named Prep item, never an unrelated exception in its explanation.
      const label = line.split(':')[0];
      if (/\bdisplay[ -]case\b|\bset-display-case\b/i.test(label)) prepPieceExemptions.case = text(line, 240);
      if (/\bshop open\b|\bopen-the-shop\b/i.test(label)) prepPieceExemptions.safe = text(line, 240);
    }
    if (prep && /^\s*(?:-\s*)?\[[ xX]\]/.test(line)) {
      prepChecks.push(/\[[xX]\]|\bn\/?a\b|not applicable/i.test(line));
    }
    const sliceMatch = SLICE_HEADING.exec(line) || (prep ? PREP_SLICE.exec(line) : null);
    if (sliceMatch) {
      const number = sliceMatch[1];
      const status = notedStatus(raw, line);
      const explicit = explicitOn(raw, line);
      if (meta) meta.occurrences.push({ number, line: at, kind: /^###/.test(line) ? 'heading' : 'bullet' });
      if (!current || current.pie !== Number(number.split('.')[0])) {
        current = { id: `standalone-slice-${number}`, pie: Number(number.split('.')[0]),
          title: titleOf(sliceMatch[2]), status, single: true, slices: [] };
        pies.push(current); track(current, at, raw, line, 'standalone');
      }
      // A slice listed twice (a Prep line and its own heading) is one slice: keep the furthest status.
      const existing = current.slices.find(item => item.number === number);
      if (existing) {
        if (RANK[status] > RANK[existing.status]) existing.status = status;
        if (explicit) sliceInfo.get(existing).explicit = true;
        slice = existing;
        continue;
      }
      slice = { id: `slice-${number}`, number, title: titleOf(sliceMatch[2]), status };
      current.slices.push(slice);
      sliceInfo.set(slice, { line: at, kind: /^###/.test(line) ? 'heading' : 'bullet', explicit });
      continue;
    }
    if (/^###\s/.test(line)) slice = null;
    // A pie that lists its slices only in a markdown table: the rows count once the pie has no slice headings.
    if (current && pieInfo.get(current)?.kind === 'pie' && /^\s*\|/.test(line)) {
      const cells = cellsOf(line);
      if (!table) table = { header: cells.map(cell => plainCell(cell).toLowerCase()) };
      else if (!cells.every(cell => /^:?-{2,}:?$/.test(cell))) {
        const { header } = table;
        let idAt = header.indexOf('slice');
        if (idAt < 0) idAt = cells.findIndex(cell => /^\d+\.\d+[a-z]?$/.test(plainCell(cell)));
        const number = idAt >= 0 ? plainCell(cells[idAt] || '') : '';
        if (/^\d+\.\d+[a-z]?$/.test(number) && Number(number.split('.')[0]) === current.pie) {
          const statusAt = header.findIndex(cell => /^(?:status|implementation|state|progress)$/.test(cell));
          const titleAt = header.findIndex(cell => /deliverable|name|title/.test(cell));
          const statusCell = statusAt >= 0 ? plainCell(cells[statusAt] || '') : null;
          const rows = tables.get(current) || [];
          tables.set(current, rows);
          rows.push({ number, line: at, statusCell, title: titleOf(plainCell(cells[titleAt >= 0 ? titleAt : idAt + 1] || '')),
            status: statusCell !== null ? cellStatus(statusCell) : statusOf(line),
            explicit: statusCell !== null ? statusCell !== '' : /\[[ xX-]\]|~~|\bStatus:/i.test(line) });
        }
      }
    }
    if (!prep && (slice || current)) rowFacts(slice || current, line);
    if (STATUS_LINE.test(line)) {
      const status = statusOf(line.replace(/\*\*/g, ''));
      if (slice) { slice.status = status; sliceInfo.get(slice).explicit = true; }
      else if (current) { current.status = status; pieInfo.get(current).explicit = true; }
      if (prep) prepStatus = status;
    }
  }
  for (const pie of pies) {
    const rows = tables.get(pie);
    const tableOnly = pie.slices.length === 0 && Boolean(rows && rows.length);
    if (tableOnly) {
      for (const row of rows) {
        if (meta) meta.occurrences.push({ number: row.number, line: row.line, kind: 'table' });
        if (pie.slices.some(item => item.number === row.number)) continue;
        const item = { id: `slice-${row.number}`, number: row.number, title: row.title, status: row.status };
        pie.slices.push(item);
        sliceInfo.set(item, { line: row.line, kind: 'table', explicit: row.explicit, statusCell: row.statusCell });
      }
    }
    const declared = pie.status, own = pie.slices.map(item => item.status);
    if (pie.slices.length === 1) pie.single = true;
    if (pie.status === 'done') { for (const item of pie.slices) item.status = 'done'; }
    else if (pie.slices.length && pie.slices.every(item => item.status === 'done')) pie.status = 'done';
    else if (pie.slices.some(item => item.status === 'active')) pie.status = 'active';
    if (meta) {
      meta.pies.push({ ...pieInfo.get(pie), pie: pie.pie, title: pie.title, declared, status: pie.status, tableOnly,
        tableLine: tableOnly ? rows[0].line : null,
        slices: pie.slices.map((item, i) => ({ ...sliceInfo.get(item), number: item.number, own: own[i], status: item.status })) });
    }
  }
  return { pies, prepComplete: prepStatus === 'done' || (prepChecks.length > 0 && prepChecks.every(Boolean)), prepPieceExemptions };
}

// The counts the SessionStart hook prints (hooks/shop-status.sh reads them through mcp/checklist-format.js):
// the checklist parse before any activity overlay, so a body `**Status:** Completed` line and a heading's
// `<!-- Status: ... -->` note count, and a pie rolls up from its slices. Prep counts boxes, as the hook does.
function shopStatus(markdown) {
  const { pies } = parseChecklist(markdown);
  const count = items => {
    const done = items.filter(item => item.status === 'done').length;
    return { done, total: items.length, open: items.length - done };
  };
  let inPrep = false, prepDone = 0, prepTotal = 0;
  for (const line of (markdown || '').split(/\r?\n/)) {
    if (/^## +Prep(?:\s|$)/.test(line)) { inPrep = true; continue; }
    if (/^## /.test(line)) inPrep = false;
    if (inPrep && /^\s*(?:-\s*)?\[[ xX]\]/.test(line)) { prepTotal++; if (/\[[xX]\]/.test(line)) prepDone++; }
  }
  return { prep: { done: prepDone, total: prepTotal }, pies: count(pies), slices: count(pies.flatMap(pie => pie.slices)) };
}

function mergeEvidence(value) {
  if (!object(value) || value.v !== 1 || !integer(value.pie) || value.pie === 0 ||
      !integer(value.pr) || value.pr === 0 || !integer(value.mergedAt)) return null;
  return { v: 1, pie: value.pie, pr: value.pr, mergedAt: value.mergedAt };
}

function foldActivity(inputRows, now = Date.now(), { mergedPie = null, activePie = null } = {}) {
  const rows = inputRows.map(sanitizeRow).filter(Boolean);
  let active = new Map(), dispatches = [], session = null, sessionStartedAt = null, opened = false, lastStop = null;
  let currentPie = activePie;
  const runningSkills = new Map(), finishedSkills = [];
  const skillKey = row => row.sid || '';
  const finishSkill = (key, time) => {
    const skill = runningSkills.get(key);
    if (skill) { finishedSkills.push({ ...skill, status: 'done', endedAt: time }); runningSkills.delete(key); }
  };
  for (const row of rows) {
    const sid = row.sid || '';
    if (row.ev === 'SessionStart') {
      for (const key of runningSkills.keys()) finishSkill(key, row.t);
      active = new Map(); dispatches = []; session = sid; sessionStartedAt = row.t; opened = false; lastStop = null; currentPie = activePie;
    }
    if (row.skill && (row.ev === 'PreToolUse' || row.ev === 'UserPromptExpansion')) {
      finishSkill(skillKey(row), row.t);
      runningSkills.set(skillKey(row), { name: row.skill, status: 'active', startedAt: row.t, sid });
    }
    if (row.ev === 'Stop') finishSkill(skillKey(row), row.t);
    // Only the newest session contributes live actors. History remains in recent and skills.
    if (session !== null && sid !== session) continue;
    if (integer(row.pie) && row.pie > 0) currentPie = row.pie;
    if (row.ev === 'PreToolUse' && row.agent) dispatches.push({ ...row });
    if (row.ev === 'SubagentStart' && row.aid) {
      const dispatch = dispatches.find(item => item.agent === row.agent && !item.provisionalAid && !item.confirmedAid);
      if (dispatch) dispatch.provisionalAid = row.aid;
      active.set(row.aid, { ...row });
      if (/(?:^|:)(?:implementer|fix-attempter|slice-tester|slice-verifier|block-composer|component-crafter|layout-architect|plater|debug-instrumenter|state-illustrator)$/.test(row.agent || '')) opened = true;
    }
    if (row.ev === 'PostToolUse' && row.aid) {
      const dispatch = dispatches.find(item => !item.confirmedAid && item.agent === row.agent && item.label === row.label);
      if (dispatch) dispatch.confirmedAid = row.aid;
      if (typeof row.ok === 'boolean') active.delete(row.aid);
    }
    if (row.ev === 'SubagentStop' && row.aid) active.delete(row.aid);
    if (row.ev === 'Stop') lastStop = row.t;
  }
  // Late rows from a previous session cannot leave a skill running forever either.
  for (const [key, skill] of runningSkills) {
    if (session !== null && key !== session) finishSkill(key, skill.startedAt);
  }
  const actors = [...active.values()].map(row => {
    const dispatch = dispatches.find(item => item.confirmedAid === row.aid)
      || dispatches.find(item => item.provisionalAid === row.aid && !item.confirmedAid);
    return { aid: row.aid, type: row.agent || 'unknown', label: dispatch?.label || '',
      pie: dispatch?.pie ?? row.pie ?? null, slice: dispatch?.slice ?? row.slice ?? null,
      startedAt: row.t, sid: row.sid || '' };
  });
  const merged = mergeEvidence(mergedPie);
  const confirmedMerge = merged && sessionStartedAt !== null && merged.mergedAt >= sessionStartedAt &&
    merged.mergedAt <= now && merged.pie === currentPie;
  return {
    session: { id: session, startedAt: sessionStartedAt, pie: currentPie },
    active: actors,
    skills: [...runningSkills.values(), ...finishedSkills.slice(-20)],
    recent: rows.slice(-50),
    phase: confirmedMerge || (lastStop !== null && now - lastStop > 600000 && actors.length === 0 && runningSkills.size === 0)
      ? 'after-hours' : opened ? 'open' : 'dawn',
  };
}

// The step an agent is on, from the dispatch label convention (`P5 S5.2 build: ...`) or, without one, from its role.
const STEPS = ['build', 'test', 'verify', 'fix', 'commit', 'review', 'plan'];
const STEP_OF_TYPE = { implementer: 'build', 'block-composer': 'build', 'component-crafter': 'build', 'layout-architect': 'build',
  'state-illustrator': 'build', plater: 'build', 'slice-tester': 'test', 'slice-verifier': 'verify', 'local-gates-runner': 'verify',
  'fix-attempter': 'fix', 'debug-instrumenter': 'fix', 'spec-reviewer': 'review', 'quality-reviewer': 'review' };
function stepOf(agent) {
  const labelled = /\bS\d+\.\d+\s+([a-z]+)\b/i.exec(agent.label || '')?.[1]?.toLowerCase();
  if (STEPS.includes(labelled)) return labelled;
  return STEP_OF_TYPE[String(agent.type || '').replace(/^bytheslice:/, '')] || null;
}

// Tasks committed per slice, from the 5.3.0 task-boundary subjects `feat(pie-N): N.M task K <name>`, counted once per task.
const TASK_SUBJECT = /^feat\(pie-(\d+)\):\s+(\d+\.\d+)\s+task\s+(\d+)\b/i;
function taskProgress(subjects, number, total) {
  if (!Array.isArray(subjects) || !Number.isSafeInteger(total) || total < 1) return null;
  const pie = number.split('.')[0], done = new Set();
  for (const subject of subjects) {
    const hit = TASK_SUBJECT.exec(subject || '');
    if (!hit || hit[1] !== pie || hit[2] !== number) continue;
    const task = Number(hit[3]);
    // A task number past the plan's count means the plan and the history disagree: report nothing rather than guess.
    if (task < 1 || task > total) return null;
    done.add(task);
  }
  return { done: done.size, total };
}

// Top-level checkbox lines in a slice plan are its tasks.
function countPlanTasks(markdown) {
  let fenced = false, count = 0;
  for (const line of String(markdown || '').split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) { fenced = !fenced; continue; }
    if (!fenced && /^- \[[ xX]\]\s/.test(line)) count++;
  }
  return count;
}

const PIECE_MARKERS = { walls: 'config', menu: 'prd', tickets: 'checklist', case: 'designSystem',
  safe: 'envCheck', oven: 'workflows', alarm: 'prePush', locks: 'branchProtection' };

// The Pass ledger as progress over time: the shared fold of scripts/ledger-summary.js, names from the checklist. No ledger is no pies.
function progressOf(ledger, checklist) {
  if (typeof ledger !== 'string' || !ledgerSummary) return { pies: [] };
  return ledgerSummary.summarize(ledgerSummary.parseRows(ledger), { names: ledgerSummary.namesFromText(checklist) });
}

function buildSnapshot({ root, checklist = '', markers = {}, rows = [], cursor = 0, port = null, now, mergedPie = null, planTasks = {}, taskSubjects = null, ledger = null }) {
  const parsed = parseChecklist(checklist);
  const activity = foldActivity(rows, now, { mergedPie, activePie: parsed.pies.find(pie => pie.status === 'active')?.pie ?? null });
  for (const pie of parsed.pies) {
    for (const slice of pie.slices) {
      const working = activity.active.filter(agent => agent.slice === slice.number).sort((a, b) => b.startedAt - a.startedAt);
      if (slice.status !== 'done' && working.length) slice.status = 'active';
      if (slice.status !== 'done') {
        const step = working.map(stepOf).find(Boolean);
        if (step) slice.step = step;
        const progress = taskProgress(taskSubjects, slice.number, slice.plan ? planTasks[slice.plan] : null);
        if (progress) slice.progress = progress;
      }
    }
    if (pie.status !== 'done' && (pie.slices.some(slice => slice.status === 'active') ||
        activity.active.some(agent => agent.pie === pie.pie))) pie.status = 'active';
  }
  // Completed Prep applies only the named exceptions; these never claim file presence.
  const pieces = Object.fromEntries(Object.entries(PIECE_MARKERS).map(([piece, marker]) => {
    const present = Boolean(markers[marker] || (piece === 'case' && markers.library));
    const evidence = parsed.prepComplete ? parsed.prepPieceExemptions[piece] : null;
    const applicable = present || !evidence;
    return [piece, { present, applicable, source: present ? marker === 'designSystem' && !markers[marker] ? 'library' : marker
      : applicable ? 'missing' : 'completed-prep', ...(!applicable ? { evidence } : {}) }];
  }));
  const built = parsed.prepComplete || Object.values(pieces).every(piece => piece.present);
  return { project: { root, name: path.basename(root), setup: built ? 'built' : Object.values(pieces).some(piece => piece.present) ? 'partial' : 'none', pieces },
    pies: parsed.pies, shopStatus: shopStatus(checklist), checklistProblems: checklistProblems(checklist),
    ...activity, cursor, port, progress: progressOf(ledger, checklist) };
}

// The format check the hooks print (mcp/checklist-format.js, required late: it requires this file). [] without it.
function checklistProblems(markdown) {
  try { return require('./checklist-format.js').validateChecklist(markdown); } catch { return []; }
}

async function readFileOrEmpty(file) {
  try { return await fs.readFile(file); } catch (error) {
    if (['ENOENT', 'ENOTDIR', 'EACCES', 'EISDIR'].includes(error.code)) return Buffer.alloc(0);
    throw error;
  }
}

async function exists(file) {
  try { await fs.access(file); return true; } catch { return false; }
}

// Inspect route filenames only. Do not read application source, env files, or follow symlinks.
async function hasLibraryRoute(root) {
  const queue = ['app', 'pages', 'src', 'apps'].map(name => ({ dir: path.join(root, name), parts: [name] }));
  let visited = 0;
  while (queue.length && visited < 4000) {
    const { dir, parts } = queue.shift();
    const directory = await fs.lstat(dir).catch(() => null);
    if (!directory?.isDirectory()) continue;
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (++visited > 4000) break;
      if (entry.name.startsWith('.') || ['node_modules', 'dist', 'build', 'vendor'].includes(entry.name)) continue;
      const route = [...parts, entry.name];
      if (entry.isFile() && ((parts.includes('pages') && (/^library\.(?:[cm]?[jt]sx?|vue)$/.test(entry.name) ||
          (parts.includes('library') && /^index\.(?:[cm]?[jt]sx?|vue)$/.test(entry.name)))) ||
          (parts.includes('app') && parts.includes('library') && /^page\.[cm]?[jt]sx?$/.test(entry.name)) ||
          (parts.includes('routes') && parts.includes('library') && /^\+page\.svelte$/.test(entry.name)))) return true;
      if (entry.isDirectory() && route.length < 9) queue.push({ dir: path.join(dir, entry.name), parts: route });
    }
  }
  return false;
}

// Metadata is a tiny allowlisted local record, never a PR lookup or activity-log inference.
async function readMergeEvidence(file) {
  try {
    const stat = await fs.lstat(file);
    if (!stat.isFile() || stat.size > 512) return null;
    return mergeEvidence(JSON.parse(await fs.readFile(file, 'utf8')));
  } catch { return null; }
}

// Plan files are read only by the name a checklist row links, only inside docs/plans, and only as regular files.
async function readPlanTasks(root, names) {
  const dir = path.join(root, 'docs/plans'), out = {};
  await Promise.all([...new Set(names)].filter(name => /^[\w.-]+\.md$/.test(name)).slice(0, 64).map(async name => {
    try {
      const file = path.join(dir, name), stat = await fs.lstat(file);
      if (!stat.isFile() || stat.size > 512 * 1024) return;
      out[name] = countPlanTasks(await fs.readFile(file, 'utf8'));
    } catch { /* A missing plan simply has no measured progress. */ }
  }));
  return out;
}

// Read-only: commit subjects that follow the task-boundary convention, on any local branch (a pie is built on its own branch,
// often in another worktree). Cached briefly so the three second poll does not run git every time. Null when git is unavailable.
const subjectCache = new Map();
function readTaskSubjects(root, now = Date.now()) {
  const hit = subjectCache.get(root);
  if (hit && now - hit.at < 15000) return hit.value;
  const value = new Promise(resolve => {
    execFile('git', ['log', '--branches', '--format=%s', '-E', '--grep=^feat\\(pie-[0-9]+\\): [0-9]+\\.[0-9]+ task [0-9]+', '-n', '2000'],
      { cwd: root, timeout: 2500, maxBuffer: 1024 * 1024, windowsHide: true },
      (error, stdout) => resolve(error ? null : stdout.split('\n').filter(Boolean)));
  });
  subjectCache.set(root, { at: now, value });
  return value;
}

// Read-only, once per snapshot: the newest 1 MiB of the project's Pass ledger (the primary checkout's, shared by its worktrees), or null.
function readLedger(root) {
  if (!ledgerSummary) return null;
  try {
    return ledgerSummary.readLedgerText(ledgerSummary.ledgerFile(ledgerSummary.resolveRoot(root)), ledgerSummary.KITCHEN_MAX_BYTES);
  } catch { return null; }
}

async function readKitchenState(root, { since, port = null, now = Date.now() } = {}) {
  if (since !== undefined && !integer(since)) throw new TypeError('since must be a nonnegative integer');
  root = path.resolve(root);
  const dir = path.join(root, '.claude/.bytheslice-state/kitchen');
  const checklistPath = path.join(root, 'docs/plans/00_master_checklist.md');
  const [rotation, current, checklist, config, checklistExists, designSystem, workflows, prePush, docs, envCheck, branchProtection, library, mergedPie] = await Promise.all([
    readFileOrEmpty(path.join(dir, 'activity.1.jsonl')), readFileOrEmpty(path.join(dir, 'activity.jsonl')),
    readFileOrEmpty(checklistPath), exists(path.join(root, 'bytheslice.config.json')), exists(checklistPath),
    exists(path.join(root, 'docs/design-system.md')), exists(path.join(root, '.github/workflows')),
    exists(path.join(root, '.husky/pre-push')), fs.readdir(path.join(root, 'docs'), { withFileTypes: true }).catch(() => []),
    exists(path.join(root, '.claude/.bytheslice-state/env-check-passed')),
    exists(path.join(root, 'scripts/setup-branch-protection.sh')), hasLibraryRoute(root),
    readMergeEvidence(path.join(dir, 'merged-pie.json')),
  ]);
  const previous = parseActivity(rotation), latest = parseActivity(current);
  const markdown = checklist.toString('utf8');
  const plans = parseChecklist(markdown).pies.flatMap(pie => pie.slices).filter(slice => slice.status !== 'done' && slice.plan).map(slice => slice.plan);
  const [planTasks, taskSubjects] = plans.length ? await Promise.all([readPlanTasks(root, plans), readTaskSubjects(root, now)]) : [{}, null];
  return buildSnapshot({ root, checklist: markdown, planTasks, taskSubjects,
    markers: { config, checklist: checklistExists, designSystem, workflows, prePush, envCheck, branchProtection, library, prd: docs.some(entry => entry.isFile() && /^prd-.*\.md$/.test(entry.name)) },
    rows: [...previous.rows, ...latest.rows], cursor: latest.cursor, port, now, mergedPie, ledger: readLedger(root) });
}

module.exports = { shopStatus, mergeEvidence, sanitizeRow, parseActivity, parseChecklist, foldActivity, buildSnapshot, readKitchenState,
  stepOf, taskProgress, countPlanTasks };
