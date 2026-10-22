// mcp/lobby-state.js
// The machine-level lobby feed: registry read and prune, per-project progress from the kitchen parser, and one derived state per project.
'use strict';

const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parseChecklist } = require('./kitchen-state.js');
// The shared ledger fold; an install without it (a skills-only copy) counts no open HITL rather than failing.
const ledgerSummary = (() => { try { return require('../scripts/ledger-summary.js'); } catch { return null; } })();
// The kitchen liveness check; without it every kitchenUrl is null and the page starts kitchens through POST /open.
const opener = (() => { try { return require('../skills/open-kitchen/open-kitchen.js'); } catch { return null; } })();

/** A signal older than this is a crashed session's leftover, never a live one (crash cleanup, not an idle timer). */
const SIGNAL_MAX_AGE_MS = 24 * 60 * 60 * 1000;
/** How long one poll waits on a project's kitchen before reporting kitchenUrl null. */
const KITCHEN_PROBE_MS = 300;
const STATES = ['needs-you', 'active', 'done', 'inactive'];
const WAITING = new Set(['permission', 'idle']);
const REGISTRY_MAX_BYTES = 1024 * 1024;
const REGISTRY_MAX_PROJECTS = 200;
const CHECKLIST_MAX_BYTES = 2 * 1024 * 1024;
const SIGNAL_MAX_BYTES = 4096;
const SIGNAL_MAX_FILES = 2000;
const SIGNAL_FILE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}\.json$/;

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const cleanText = (value, max = 160) => typeof value === 'string'
  ? Array.from(value.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim()).slice(0, max).join('') : '';

/** The lobby home: $BTS_HOME, else ~/.bytheslice (lockstep with hooks/lib/lobby.sh). */
function lobbyHome() {
  return path.resolve(process.env.BTS_HOME || path.join(os.homedir(), '.bytheslice'));
}

async function realpathOr(file) {
  try { return await fs.realpath(file); } catch { return path.resolve(file); }
}

/** A signal that can still describe a live session: well formed and no older than 24 hours. */
function freshSignal(signal, now) {
  return object(signal) && Number.isFinite(signal.t) && now - signal.t <= SIGNAL_MAX_AGE_MS;
}

/** Whether every pie is done: an array of parsed pies, or a {done,total} count. */
function allPiesDone(pies) {
  if (Array.isArray(pies)) return pies.length > 0 && pies.every(pie => object(pie) && pie.status === 'done');
  if (object(pies)) return Number.isSafeInteger(pies.total) && pies.total > 0 && pies.done === pies.total;
  return false;
}

/**
 * One state per project, pure: needs-you > active > done > inactive.
 * Needs you: open HITL, or any live signal waiting (permission or idle). Active: any live signal working or
 * with subagents running. Done: at least one pie and every pie done. Else inactive. Signals older than 24 hours
 * are ignored so a session that died without a Stop cannot pin the project. `now` defaults to the clock.
 */
function deriveState({ openHitl = 0, signals = [], pies = [], now = Date.now() } = {}) {
  const live = (Array.isArray(signals) ? signals : []).filter(signal => freshSignal(signal, now));
  if ((Number.isFinite(openHitl) && openHitl > 0) || live.some(signal => WAITING.has(signal.waiting))) return 'needs-you';
  if (live.some(signal => signal.working === true || (Number.isFinite(signal.subagents) && signal.subagents > 0))) return 'active';
  if (allPiesDone(pies)) return 'done';
  return 'inactive';
}

/** Every session signal under the home dir, with `root` resolved to its physical path. Damaged files are skipped. */
async function readSignals(home) {
  const dir = path.join(home, 'signals');
  const names = await fs.readdir(dir).catch(() => []);
  const roots = new Map();
  const signals = await Promise.all(names.filter(name => SIGNAL_FILE.test(name)).slice(0, SIGNAL_MAX_FILES).map(async name => {
    try {
      const file = path.join(dir, name);
      const stat = await fs.lstat(file);
      if (!stat.isFile() || stat.size > SIGNAL_MAX_BYTES) return null;
      const signal = JSON.parse(await fs.readFile(file, 'utf8'));
      if (!object(signal) || signal.v !== 1 || typeof signal.root !== 'string' || !path.isAbsolute(signal.root) ||
          !Number.isFinite(signal.t)) return null;
      if (!roots.has(signal.root)) roots.set(signal.root, realpathOr(signal.root));
      return { sid: typeof signal.sid === 'string' ? signal.sid : name.slice(0, -5), root: await roots.get(signal.root),
        t: signal.t, working: signal.working === true,
        subagents: Number.isSafeInteger(signal.subagents) && signal.subagents > 0 ? signal.subagents : 0,
        waiting: WAITING.has(signal.waiting) ? signal.waiting : null };
    } catch { return null; }
  }));
  return signals.filter(Boolean);
}

/** The raw registry list, or null when projects.json is absent or damaged. */
async function readRegistryList(file) {
  try {
    const stat = await fs.stat(file);
    if (!stat.isFile() || stat.size > REGISTRY_MAX_BYTES) return null;
    const data = JSON.parse(await fs.readFile(file, 'utf8'));
    return object(data) && Array.isArray(data.projects) ? data : null;
  } catch { return null; }
}

/** False only when the folder is known gone (missing, or no longer a directory); a permission error keeps it. */
async function folderExists(root) {
  try { return (await fs.stat(root)).isDirectory(); } catch (error) {
    return !['ENOENT', 'ENOTDIR'].includes(error.code);
  }
}

/**
 * Take the writers' mutex the hooks share (<home>/.lock holding the owner's pid, see hooks/lib/lobby.sh).
 * Gives up after about 200 ms and returns null; a pruning poll then simply waits for the next one.
 */
async function withRegistryLock(home, fn) {
  const lock = path.join(home, '.lock');
  for (let attempt = 0; attempt < 10; attempt++) {
    try { await fs.mkdir(lock); } catch (error) {
      if (error.code !== 'EEXIST') return null;
      await pause(20);
      continue;
    }
    try {
      await fs.writeFile(path.join(lock, 'pid'), `${process.pid}\n`, { mode: 0o600 });
      return await fn();
    } finally {
      await fs.rm(path.join(lock, 'pid'), { force: true }).catch(() => {});
      await fs.rmdir(lock).catch(() => {});
    }
  }
  return null;
}

/** Re-read projects.json under the lock and drop entries whose folder is gone (atomic temp file plus rename, mode 0600). */
async function pruneRegistry(home) {
  const file = path.join(home, 'projects.json');
  return withRegistryLock(home, async () => {
    const data = await readRegistryList(file);
    if (!data) return false;
    const kept = [];
    for (const entry of data.projects) {
      if (object(entry) && typeof entry.root === 'string' && path.isAbsolute(entry.root) && await folderExists(entry.root)) kept.push(entry);
    }
    if (kept.length === data.projects.length) return false;
    const temporary = path.join(home, `.tmp.lobby-${process.pid}-${Math.random().toString(36).slice(2, 10)}`);
    try {
      await fs.writeFile(temporary, `${JSON.stringify({ ...data, v: 1, projects: kept })}\n`, { mode: 0o600 });
      await fs.rename(temporary, file);
      return true;
    } catch {
      await fs.unlink(temporary).catch(() => {});
      return false;
    }
  });
}

/**
 * The registered projects as [{ root, name, key }], `key` being the realpath of the primary checkout. A damaged or
 * absent projects.json gives an empty list. Entries whose folder is gone are dropped and, with `prune` (the default),
 * rewritten out of projects.json. Duplicates by realpath keep the first entry.
 */
async function readRegistry({ home = lobbyHome(), prune = true } = {}) {
  const data = await readRegistryList(path.join(home, 'projects.json'));
  if (!data) return [];
  const candidates = data.projects.filter(entry => object(entry) && typeof entry.root === 'string' && path.isAbsolute(entry.root))
    .slice(0, REGISTRY_MAX_PROJECTS);
  const alive = await Promise.all(candidates.map(entry => folderExists(entry.root)));
  if (prune && alive.some(present => !present)) await pruneRegistry(home);
  const keys = await Promise.all(candidates.map((entry, index) => alive[index] ? realpathOr(entry.root) : null));
  const seen = new Set();
  const entries = [];
  candidates.forEach((entry, index) => {
    const key = keys[index];
    if (!key || seen.has(key)) return;
    seen.add(key);
    entries.push({ root: entry.root, name: cleanText(entry.name) || path.basename(key), key });
  });
  return entries;
}

async function readChecklist(root) {
  try {
    const file = path.join(root, 'docs/plans/00_master_checklist.md');
    const stat = await fs.stat(file);
    if (!stat.isFile() || stat.size > CHECKLIST_MAX_BYTES) return '';
    return await fs.readFile(file, 'utf8');
  } catch { return ''; }
}

// Open HITL per ledger, cached on the ledger's size and mtime so an unchanged ledger is not re-folded every poll.
const hitlCache = new Map();
function readOpenHitl(root) {
  if (!ledgerSummary) return 0;
  const file = ledgerSummary.ledgerFile(root);
  let stat;
  try { stat = fsSync.statSync(file); } catch { hitlCache.delete(file); return 0; }
  const hit = hitlCache.get(file);
  if (hit && hit.size === stat.size && hit.mtimeMs === stat.mtimeMs) return hit.open;
  let open = 0;
  try {
    const text = ledgerSummary.readLedgerText(file, ledgerSummary.KITCHEN_MAX_BYTES);
    if (text !== null) {
      for (const pie of ledgerSummary.summarize(ledgerSummary.parseRows(text)).pies) {
        for (const slice of pie.slices) open += slice.hitl.open;
      }
    }
  } catch { open = 0; }
  if (hitlCache.size > REGISTRY_MAX_PROJECTS * 2) hitlCache.clear();
  hitlCache.set(file, { size: stat.size, mtimeMs: stat.mtimeMs, open });
  return open;
}

/** The project's kitchen URL when its port file names a kitchen that answers /state for this very root, else null. */
async function probeKitchen(key) {
  if (!opener || typeof opener.matchingServer !== 'function') return null;
  try { return await opener.matchingServer(key, KITCHEN_PROBE_MS); } catch { return null; }
}

/**
 * One project's lobby row. Reads the master checklist through the kitchen parser (never readKitchenState: no git,
 * no route scan), open HITL from the Pass ledger, this project's own signals and a short kitchen liveness probe.
 *
 * Row: { key, root, path, name, pies:{done,total}, slices:{done,total}, active, activePie, activeSlice, sessions,
 * state, kitchenUrl }. key, root and path are the same realpath of the primary checkout. active is null, or
 * { pie, slice } for the first pie the parser marks active and its first active slice: pie is
 * { number, name } (the parser's pie number and title, e.g. { number: 7, name: 'Lobby' }) and slice is
 * { number, name } (the parser's slice number and title, e.g. { number: '7.3', name: 'Lobby server and state' })
 * or null when no slice of that pie is active. activePie and activeSlice mirror active.pie and active.slice (null
 * when there is none). sessions counts this project's signals seen within the last 24 hours. kitchenUrl is
 * `http://127.0.0.1:<port>/` or null.
 */
async function readProject(entry, { home = lobbyHome(), now = Date.now(), signals, probe = probeKitchen } = {}) {
  const key = typeof entry.key === 'string' ? entry.key : await realpathOr(entry.root);
  const declared = path.resolve(entry.root || key);
  const [markdown, allSignals, kitchenUrl] = await Promise.all([
    readChecklist(key),
    Array.isArray(signals) ? signals : readSignals(home),
    Promise.resolve().then(() => probe(key)).catch(() => null),
  ]);
  const parsed = parseChecklist(markdown).pies;
  const slices = parsed.flatMap(pie => pie.slices);
  const activeEntry = parsed.find(pie => pie.status === 'active');
  const activeSliceEntry = activeEntry?.slices.find(slice => slice.status === 'active');
  const active = activeEntry ? {
    pie: { number: activeEntry.pie, name: activeEntry.title },
    slice: activeSliceEntry ? { number: activeSliceEntry.number, name: activeSliceEntry.title } : null,
  } : null;
  const mine = allSignals.filter(signal => signal.root === key || signal.root === declared);
  const live = mine.filter(signal => freshSignal(signal, now));
  const state = deriveState({ openHitl: readOpenHitl(key), signals: mine, pies: parsed, now });
  return {
    key, root: key, path: key,
    name: cleanText(entry.name) || path.basename(key),
    pies: { done: parsed.filter(pie => pie.status === 'done').length, total: parsed.length },
    slices: { done: slices.filter(slice => slice.status === 'done').length, total: slices.length },
    active, activePie: active ? active.pie : null, activeSlice: active ? active.slice : null,
    sessions: live.length, state,
    kitchenUrl: typeof kitchenUrl === 'string' && /^http:\/\/127\.0\.0\.1:\d{1,5}\/$/.test(kitchenUrl) ? kitchenUrl : null,
  };
}

/**
 * The whole lobby: { v:1, generatedAt, projects }. Reads and prunes the registry, reads every signal once, then
 * reads each project (kitchens probed concurrently). Concurrent sessions roll up into one row per project through
 * deriveState, never a row per session. Order: needs-you, active, done, inactive, then name.
 */
async function readLobby({ home = lobbyHome(), now = Date.now(), probe = probeKitchen } = {}) {
  const [entries, signals] = await Promise.all([readRegistry({ home }), readSignals(home)]);
  const projects = await Promise.all(entries.map(entry => readProject(entry, { home, now, signals, probe })));
  projects.sort((a, b) => STATES.indexOf(a.state) - STATES.indexOf(b.state) ||
    a.name.localeCompare(b.name) || a.key.localeCompare(b.key));
  return { v: 1, generatedAt: now, projects };
}

module.exports = {
  SIGNAL_MAX_AGE_MS, KITCHEN_PROBE_MS, STATES,
  lobbyHome, deriveState, readSignals, readRegistry, readProject, readLobby, probeKitchen,
};
