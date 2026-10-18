// mcp/kitchen-state.js
// Reads and folds privacy-limited kitchen activity and checklist state into a full project snapshot.
'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

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
  if (/\[[xX]\]|~~|\bStatus:\s*(?:Completed|Done|Shipped)\b/i.test(line)) return 'done';
  if (/\bStatus:\s*(?:In Progress|Active|Running)\b|\[-\]/i.test(line)) return 'active';
  return 'open';
}

function titleOf(value) {
  return text(value.replace(/<!--.*?-->/g, '').replace(/\[[ xX-]\]/g, '')
    .replace(/~~/g, '').replace(/\bStatus:.*$/i, '').replace(/^\s*[:.-]\s*/, ''), 240);
}

function parseChecklist(markdown) {
  const pies = [];
  let current = null, slice = null, prep = false, fenced = false;
  const prepChecks = [];
  let prepStatus = 'open';
  for (const raw of (markdown || '').split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(raw)) { fenced = !fenced; continue; }
    if (fenced) continue;
    const line = raw.replace(/<!--.*?-->/g, '').trimEnd();
    if (/^##\s+Prep\b/i.test(line)) {
      prep = true; slice = null;
      prepStatus = statusOf(line);
      const number = Number(/\bPie\s+(\d+)/i.exec(line)?.[1] || 1);
      current = { id: `pie-${number}`, pie: number, title: 'Foundations', status: statusOf(line), single: false, slices: [] };
      pies.push(current);
      continue;
    }
    const pieMatch = /^##\s+(?:\[[ xX-]\]\s*)?(?:~~)?Pie\s+(\d+)\b(.*)$/i.exec(line);
    const standalone = /^##\s+(?:\[[ xX-]\]\s*)?(?:~~)?(?:Slice\s+(\d+\.\d+)|Stage\s+(\d+))\b(.*)$/i.exec(line);
    if (pieMatch) {
      prep = false; slice = null;
      current = { id: `pie-${pieMatch[1]}`, pie: Number(pieMatch[1]), title: titleOf(pieMatch[2]),
        status: statusOf(line), single: /\bsingle(?:[ -]slice)?\b/i.test(line), slices: [] };
      pies.push(current); continue;
    }
    if (standalone) {
      prep = false;
      const number = standalone[1] || standalone[2];
      const legacy = Boolean(standalone[2]);
      const pie = Number(number.split('.')[0]);
      slice = { id: `${legacy ? 'stage' : 'slice'}-${number}`, number, title: titleOf(standalone[3]), status: statusOf(line) };
      current = { id: `standalone-${slice.id}`, pie, title: slice.title, status: slice.status, single: true, slices: [slice] };
      pies.push(current); continue;
    }
    if (/^##\s/.test(line)) { current = null; slice = null; prep = false; continue; }
    if (prep && /^\s*(?:-\s*)?\[[ xX]\]/.test(line)) {
      prepChecks.push(/\[[xX]\]|\bn\/?a\b|not applicable/i.test(line));
    }
    const sliceMatch = /^###\s+(?:\[[ xX-]\]\s*)?(?:~~)?Slice\s+(\d+\.\d+)\b(.*)$/i.exec(line)
      || (prep ? /^\s*(?:-\s*)?\[[ xX]\]\s+Slice\s+(\d+\.\d+)\b(.*)$/i.exec(line) : null);
    if (sliceMatch) {
      const number = sliceMatch[1];
      slice = { id: `slice-${number}`, number, title: titleOf(sliceMatch[2]), status: statusOf(line) };
      if (!current || current.pie !== Number(number.split('.')[0])) {
        current = { id: `standalone-slice-${number}`, pie: Number(number.split('.')[0]),
          title: slice.title, status: slice.status, single: true, slices: [] };
        pies.push(current);
      }
      current.slices.push(slice); continue;
    }
    if (/^###\s/.test(line)) slice = null;
    if (/^\s*(?:\*\*)?Status(?:\*\*)?:/i.test(line)) {
      const status = statusOf(line.replace(/\*\*/g, ''));
      if (slice) slice.status = status;
      else if (current) current.status = status;
      if (prep) prepStatus = status;
    }
  }
  for (const pie of pies) {
    if (pie.slices.length === 1) pie.single = true;
    if (pie.status === 'done') { for (const item of pie.slices) item.status = 'done'; }
    else if (pie.slices.length && pie.slices.every(item => item.status === 'done')) pie.status = 'done';
    else if (pie.slices.some(item => item.status === 'active')) pie.status = 'active';
  }
  return { pies, prepComplete: prepStatus === 'done' || (prepChecks.length > 0 && prepChecks.every(Boolean)) };
}

function foldActivity(inputRows, now = Date.now()) {
  const rows = inputRows.map(sanitizeRow).filter(Boolean);
  let active = new Map(), dispatches = [], session = null, opened = false, lastStop = null;
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
      active = new Map(); dispatches = []; session = sid; opened = false; lastStop = null;
    }
    if (row.skill && (row.ev === 'PreToolUse' || row.ev === 'UserPromptExpansion')) {
      finishSkill(skillKey(row), row.t);
      runningSkills.set(skillKey(row), { name: row.skill, status: 'active', startedAt: row.t, sid });
    }
    if (row.ev === 'Stop') finishSkill(skillKey(row), row.t);
    // Only the newest session contributes live actors. History remains in recent and skills.
    if (session !== null && sid !== session) continue;
    if (row.ev === 'PreToolUse' && row.agent) dispatches.push({ ...row });
    if (row.ev === 'SubagentStart' && row.aid) {
      const dispatch = dispatches.find(item => item.agent === row.agent && !item.provisionalAid && !item.confirmedAid);
      if (dispatch) dispatch.provisionalAid = row.aid;
      active.set(row.aid, { ...row });
      if (/(?:^|:)(?:implementer|fix-attempter|slice-tester|slice-verifier|block-composer|component-crafter|layout-architect)$/.test(row.agent || '')) opened = true;
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
  return {
    active: actors,
    skills: [...runningSkills.values(), ...finishedSkills.slice(-20)],
    recent: rows.slice(-50),
    phase: lastStop !== null && now - lastStop > 600000 && actors.length === 0 && runningSkills.size === 0
      ? 'after-hours' : opened ? 'open' : 'dawn',
  };
}

function buildSnapshot({ root, checklist = '', markers = {}, rows = [], cursor = 0, port = null, now }) {
  const parsed = parseChecklist(checklist);
  const activity = foldActivity(rows, now);
  for (const pie of parsed.pies) {
    for (const slice of pie.slices) {
      if (slice.status !== 'done' && activity.active.some(agent => agent.slice === slice.number)) slice.status = 'active';
    }
    if (pie.status !== 'done' && (pie.slices.some(slice => slice.status === 'active') ||
        activity.active.some(agent => agent.pie === pie.pie))) pie.status = 'active';
  }
  const markerNames = ['config', 'prd', 'checklist', 'designSystem', 'workflows', 'prePush'];
  const built = parsed.prepComplete || markerNames.every(key => markers[key]);
  return { project: { root, name: path.basename(root), setup: built ? 'built' : markerNames.some(key => markers[key]) ? 'partial' : 'none' },
    pies: parsed.pies, ...activity, cursor, port };
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

async function readKitchenState(root, { since, port = null, now = Date.now() } = {}) {
  if (since !== undefined && !integer(since)) throw new TypeError('since must be a nonnegative integer');
  root = path.resolve(root);
  const dir = path.join(root, '.claude/.bytheslice-state/kitchen');
  const checklistPath = path.join(root, 'docs/plans/00_master_checklist.md');
  const [rotation, current, checklist, config, checklistExists, designSystem, workflows, prePush, docs] = await Promise.all([
    readFileOrEmpty(path.join(dir, 'activity.1.jsonl')), readFileOrEmpty(path.join(dir, 'activity.jsonl')),
    readFileOrEmpty(checklistPath), exists(path.join(root, 'bytheslice.config.json')), exists(checklistPath),
    exists(path.join(root, 'docs/design-system.md')), exists(path.join(root, '.github/workflows')),
    exists(path.join(root, '.husky/pre-push')), fs.readdir(path.join(root, 'docs')).catch(() => []),
  ]);
  const previous = parseActivity(rotation), latest = parseActivity(current);
  return buildSnapshot({ root, checklist: checklist.toString('utf8'),
    markers: { config, checklist: checklistExists, designSystem, workflows, prePush, prd: docs.some(name => /^prd-.*\.md$/.test(name)) },
    rows: [...previous.rows, ...latest.rows], cursor: latest.cursor, port, now });
}

module.exports = { sanitizeRow, parseActivity, parseChecklist, foldActivity, buildSnapshot, readKitchenState };
