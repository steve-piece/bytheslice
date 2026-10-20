// skills/open-kitchen/open-kitchen.js
// Reuse or start a project-matched loopback kitchen server and return its verified local URL.
'use strict';

const fs = require('node:fs/promises');
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

async function main(args) {
  if (args.length && (args.length !== 2 || args[0] !== '--project' || !args[1])) {
    throw new Error('Usage: node open-kitchen.js [--project <project-root>]');
  }
  const url = await ensureKitchen({ projectRoot: args[1] });
  process.stdout.write(`${url}\n`);
}

if (require.main === module) {
  main(process.argv.slice(2)).catch(error => {
    const safeMessages = [
      'Kitchen project directory is unavailable.',
      'Kitchen startup timeout is invalid.',
      'Kitchen server is missing from this plugin installation.',
      'Kitchen server did not become ready. Check the plugin installation and try again.',
      'Usage: node open-kitchen.js [--project <project-root>]',
    ];
    process.stderr.write(`${safeMessages.includes(error.message) ? error.message : 'Kitchen could not be opened.'}\n`);
    process.exitCode = 1;
  });
}

module.exports = { ensureKitchen, parsePort };
