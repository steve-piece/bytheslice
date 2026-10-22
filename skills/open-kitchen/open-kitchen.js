// skills/open-kitchen/open-kitchen.js
// Reuse or start a project-matched loopback kitchen server, or the machine-level lobby, and return its verified local URL.
'use strict';

const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

function parsePort(value) {
  const text = String(value).trim();
  if (!/^\d{1,5}$/.test(text)) return null;
  const port = Number(text);
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : null;
}

async function readPort(projectRoot) {
  try {
    const file = path.join(projectRoot, '.claude', '.bytheslice-state', 'kitchen', 'port');
    const stat = await fs.stat(file);
    if (!stat.isFile() || stat.size > 32) return null;
    return parsePort(await fs.readFile(file, 'utf8'));
  } catch {
    return null;
  }
}

function readSnapshot(port, timeoutMs) {
  return new Promise(resolve => {
    let settled = false;
    const finish = result => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      resolve(result);
    };
    const request = http.get({
      hostname: '127.0.0.1', port, path: '/state',
      headers: { 'Cache-Control': 'no-cache', Accept: 'application/json' },
    }, response => {
      if (response.statusCode !== 200) {
        response.destroy();
        finish(null);
        return;
      }
      const chunks = [];
      let bytes = 0;
      response.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > 1024 * 1024) {
          request.destroy();
          finish(null);
        } else chunks.push(chunk);
      });
      response.on('end', () => {
        try { finish(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
        catch { finish(null); }
      });
      response.on('error', () => finish(null));
    });
    const deadline = setTimeout(() => {
      request.destroy();
      finish(null);
    }, Math.max(1, timeoutMs));
    request.on('error', () => finish(null));
  });
}

async function matchingServer(projectRoot, timeoutMs) {
  const port = await readPort(projectRoot);
  if (!port) return null;
  const snapshot = await readSnapshot(port, timeoutMs);
  if (!snapshot || snapshot.port !== port || typeof snapshot.project?.root !== 'string') return null;
  try {
    if (await fs.realpath(snapshot.project.root) !== projectRoot) return null;
  } catch {
    return null;
  }
  return `http://127.0.0.1:${port}/`;
}

async function ensureKitchen(options = {}) {
  let projectRoot;
  try {
    projectRoot = await fs.realpath(options.projectRoot || process.env.CLAUDE_PROJECT_DIR || process.cwd());
    if (!(await fs.stat(projectRoot)).isDirectory()) throw new Error();
  } catch {
    throw new Error('Kitchen project directory is unavailable.');
  }
  const timeoutMs = options.timeoutMs ?? 8000;
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000) {
    throw new Error('Kitchen startup timeout is invalid.');
  }
  const deadline = Date.now() + timeoutMs;
  const existing = await matchingServer(projectRoot, Math.min(500, timeoutMs));
  if (existing) return existing;

  const pluginRoot = path.resolve(options.pluginRoot || path.join(__dirname, '..', '..'));
  const server = path.join(pluginRoot, 'mcp', 'kitchen-server.js');
  try {
    await fs.access(server);
  } catch {
    throw new Error('Kitchen server is missing from this plugin installation.');
  }

  let failed = false;
  const child = spawn(process.execPath, [server, '--project', projectRoot, '--serve-only'], {
    cwd: projectRoot, detached: true, stdio: 'ignore', windowsHide: true,
  });
  child.on('error', () => { failed = true; });
  child.on('exit', () => { failed = true; });
  child.unref();

  while (Date.now() < deadline && !failed) {
    const ready = await matchingServer(projectRoot, Math.min(500, deadline - Date.now()));
    if (ready) return ready;
    await pause(Math.min(100, Math.max(0, deadline - Date.now())));
  }
  child.kill();
  throw new Error('Kitchen server did not become ready. Check the plugin installation and try again.');
}

/** The lobby home: $BTS_HOME, else ~/.bytheslice (lockstep with mcp/lobby-state.js and hooks/lib/lobby.sh). */
function lobbyHome() {
  return path.resolve(process.env.BTS_HOME || path.join(os.homedir(), '.bytheslice'));
}

async function readLobbyPort(home) {
  try {
    const file = path.join(home, 'lobby', 'port');
    const stat = await fs.stat(file);
    if (!stat.isFile() || stat.size > 32) return null;
    return parsePort(await fs.readFile(file, 'utf8'));
  } catch {
    return null;
  }
}

/** The lobby's URL when its port file names a 127.0.0.1 listener whose GET /state answers a projects array, else null. */
async function matchingLobby(home, timeoutMs) {
  const port = await readLobbyPort(home);
  if (!port) return null;
  const snapshot = await readSnapshot(port, timeoutMs);
  if (!snapshot || typeof snapshot !== 'object' || !Array.isArray(snapshot.projects)) return null;
  return `http://127.0.0.1:${port}/`;
}

/**
 * Reuse the running lobby or start the plugin's lobby server (mcp/lobby-server.js --serve-only) detached, waiting
 * at most `timeoutMs` (8 s by default). Answers only `http://127.0.0.1:<port>/`. Options are injectable for tests:
 * home (default lobbyHome()), pluginRoot, timeoutMs.
 */
async function ensureLobby(options = {}) {
  const home = path.resolve(options.home || lobbyHome());
  const timeoutMs = options.timeoutMs ?? 8000;
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000) {
    throw new Error('Lobby startup timeout is invalid.');
  }
  const deadline = Date.now() + timeoutMs;
  const existing = await matchingLobby(home, Math.min(500, timeoutMs));
  if (existing) return existing;

  const pluginRoot = path.resolve(options.pluginRoot || path.join(__dirname, '..', '..'));
  const server = path.join(pluginRoot, 'mcp', 'lobby-server.js');
  try {
    await fs.access(server);
  } catch {
    throw new Error('Lobby server is missing from this plugin installation.');
  }

  let failed = false;
  const child = spawn(process.execPath, [server, '--serve-only'], {
    cwd: pluginRoot, env: { ...process.env, BTS_HOME: home }, detached: true, stdio: 'ignore', windowsHide: true,
  });
  child.on('error', () => { failed = true; });
  child.on('exit', () => { failed = true; });
  child.unref();

  while (Date.now() < deadline && !failed) {
    const ready = await matchingLobby(home, Math.min(500, deadline - Date.now()));
    if (ready) return ready;
    await pause(Math.min(100, Math.max(0, deadline - Date.now())));
  }
  child.kill();
  throw new Error('Lobby server did not become ready. Check the plugin installation and try again.');
}

const USAGE = 'Usage: node open-kitchen.js [--project <project-root> | --lobby]';

async function main(args) {
  let url;
  if (args.length === 1 && args[0] === '--lobby') url = await ensureLobby();
  else if (args.length === 0 || (args.length === 2 && args[0] === '--project' && args[1])) url = await ensureKitchen({ projectRoot: args[1] });
  else throw new Error(USAGE);
  process.stdout.write(`${url}\n`);
}

if (require.main === module) {
  const args = process.argv.slice(2);
  main(args).catch(error => {
    const safeMessages = [
      'Kitchen project directory is unavailable.',
      'Kitchen startup timeout is invalid.',
      'Kitchen server is missing from this plugin installation.',
      'Kitchen server did not become ready. Check the plugin installation and try again.',
      'Lobby startup timeout is invalid.',
      'Lobby server is missing from this plugin installation.',
      'Lobby server did not become ready. Check the plugin installation and try again.',
      USAGE,
    ];
    const fallback = args.includes('--lobby') ? 'Lobby could not be opened.' : 'Kitchen could not be opened.';
    process.stderr.write(`${safeMessages.includes(error.message) ? error.message : fallback}\n`);
    process.exitCode = 1;
  });
}

// matchingServer is shared with the lobby (mcp/lobby-state.js), which probes each registered project's kitchen.
module.exports = { ensureKitchen, ensureLobby, parsePort, readPort, matchingServer, matchingLobby, lobbyHome };
