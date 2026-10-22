// mcp/kitchen-server.js
// Serves read-only kitchen snapshots over stdio MCP and a protected loopback HTTP page, plus a verified redirect to the lobby.
'use strict';

const { createInterface } = require('node:readline');
const http = require('node:http');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { readKitchenState } = require('./kitchen-state.js');

const PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const TOOL = {
  name: 'kitchen_state',
  description: 'Read the full kitchen snapshot of project setup, checklist, and privacy-limited activity.',
  inputSchema: {
    type: 'object',
    properties: { since: { type: 'integer', minimum: 0 } },
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
};

let protocolVersion;
let projectRoot;
let port;

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function fail(id, code, message) {
  send({ jsonrpc: '2.0', id, error: { code, message } });
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

async function handle(line) {
  let request;
  try {
    request = JSON.parse(line);
  } catch {
    fail(null, -32700, 'Parse error');
    return;
  }

  const hasId = isObject(request) && Object.hasOwn(request, 'id');
  const validId = hasId && (typeof request.id === 'string' || Number.isInteger(request.id));
  if (!isObject(request) || request.jsonrpc !== '2.0' ||
      typeof request.method !== 'string' || (hasId && !validId) ||
      (request.params !== undefined && !isObject(request.params))) {
    fail(validId ? request.id : null, -32600, 'Invalid Request');
    return;
  }

  // Notifications, including initialized and cancelled, never receive responses.
  if (!hasId) return;
  const { id, method, params = {} } = request;
  let result;

  if (method === 'initialize') {
    if (typeof params.protocolVersion !== 'string' ||
        !isObject(params.capabilities) || !isObject(params.clientInfo)) {
      fail(id, -32602, 'Invalid initialize parameters');
      return;
    }
    protocolVersion = PROTOCOL_VERSIONS.includes(params.protocolVersion)
      ? params.protocolVersion : PROTOCOL_VERSIONS[0];
    result = {
      protocolVersion,
      capabilities: { tools: {} },
      serverInfo: { name: 'bytheslice-kitchen', version: '1.0.0' },
    };
  } else if (method === 'ping') {
    result = {};
  } else if (!protocolVersion) {
    fail(id, -32000, 'Server not initialized');
    return;
  } else if (method === 'tools/list') {
    result = { tools: [TOOL] };
  } else if (method === 'tools/call') {
    if (params.name !== TOOL.name) {
      fail(id, -32602, 'Unknown tool');
      return;
    }
    const input = params.arguments === undefined ? {} : params.arguments;
    if (!isObject(input) || Object.keys(input).some(key => key !== 'since') ||
        (Object.hasOwn(input, 'since') && (!Number.isSafeInteger(input.since) || input.since < 0))) {
      fail(id, -32602, 'Expected an object with an optional nonnegative integer since');
      return;
    }
    let snapshot;
    try { snapshot = await readKitchenState(projectRoot, { since: input.since, port }); }
    catch { fail(id, -32603, 'Kitchen state unavailable'); return; }
    result = { content: [{ type: 'text', text: JSON.stringify(snapshot) }], isError: false };
    if (protocolVersion === '2025-06-18' || protocolVersion === '2025-11-25') {
      result.structuredContent = snapshot;
    }
  } else {
    fail(id, -32601, 'Method not found');
    return;
  }
  send({ jsonrpc: '2.0', id, result });
}

function parseOptions(args) {
  let root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  let serveOnly = false;
  for (let index = 0; index < args.length; index++) {
    if (args[index] === '--serve-only') serveOnly = true;
    else if (args[index] === '--project' && args[index + 1] && !args[index + 1].startsWith('--')) root = args[++index];
    else throw new Error('Unsupported kitchen server option');
  }
  const rawPort = process.env.BTS_KITCHEN_PORT || '4477';
  if (!/^\d+$/.test(rawPort) || Number(rawPort) < 1 || Number(rawPort) > 65535) throw new Error('Invalid kitchen port');
  return { root: path.resolve(root), serveOnly, preferredPort: Number(rawPort) };
}

function responseHeaders(type) {
  return {
    'Content-Type': type,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Content-Security-Policy': "frame-ancestors 'none'; base-uri 'none'; form-action 'none'; connect-src 'self'",
  };
}

function trustedRequest(req) {
  const hosts = [`127.0.0.1:${port}`, `localhost:${port}`];
  if (!hosts.includes(req.headers.host)) return false;
  if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) return false;
  const site = req.headers['sec-fetch-site'];
  // A top-level click from the lobby (another 127.0.0.1 port) is same-site: allowed for the page document only.
  const pageNavigation = site === 'same-site' && req.method === 'GET' && (req.url === '/' || req.url.startsWith('/?'))
    && req.headers['sec-fetch-mode'] === 'navigate' && req.headers['sec-fetch-dest'] === 'document';
  if (site && !['same-origin', 'none'].includes(site) && !pageNavigation) return false;
  return true;
}

/** The lobby home: $BTS_HOME, else ~/.bytheslice (lockstep with mcp/lobby-state.js and hooks/lib/lobby.sh). */
function lobbyHome() {
  return path.resolve(process.env.BTS_HOME || path.join(os.homedir(), '.bytheslice'));
}

/** True when 127.0.0.1:<lobbyPort> answers GET /state with a JSON object holding a projects array, within 500 ms. */
function lobbyAnswers(lobbyPort) {
  return new Promise(resolve => {
    let settled = false;
    const finish = result => { if (!settled) { settled = true; clearTimeout(deadline); resolve(result); } };
    const request = http.get({ hostname: '127.0.0.1', port: lobbyPort, path: '/state',
      headers: { 'Cache-Control': 'no-cache', Accept: 'application/json' } }, response => {
      if (response.statusCode !== 200) { response.destroy(); finish(false); return; }
      const chunks = [];
      let bytes = 0;
      response.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > 1024 * 1024) { request.destroy(); finish(false); } else chunks.push(chunk);
      });
      response.on('end', () => {
        try {
          const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          finish(data !== null && typeof data === 'object' && Array.isArray(data.projects));
        } catch { finish(false); }
      });
      response.on('error', () => finish(false));
    });
    const deadline = setTimeout(() => { request.destroy(); finish(false); }, 500);
    request.on('error', () => finish(false));
  });
}

/** The lobby URL, http://127.0.0.1:<port>/, when its port file names a live lobby; else null. Never another host. */
async function lobbyUrl() {
  let lobbyPort;
  try {
    const file = path.join(lobbyHome(), 'lobby', 'port');
    const stat = await fs.stat(file);
    if (!stat.isFile() || stat.size > 32) return null;
    const text = (await fs.readFile(file, 'utf8')).trim();
    if (!/^\d{1,5}$/.test(text)) return null;
    lobbyPort = Number(text);
  } catch { return null; }
  if (!Number.isInteger(lobbyPort) || lobbyPort < 1 || lobbyPort > 65535 || lobbyPort === port) return null;
  return await lobbyAnswers(lobbyPort) ? `http://127.0.0.1:${lobbyPort}/` : null;
}

async function serve(req, res) {
  const reply = (code, message, type = 'text/plain; charset=utf-8') => {
    res.writeHead(code, responseHeaders(type)); res.end(message);
  };
  if (!trustedRequest(req)) return reply(403, 'Forbidden');
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return reply(405, 'Method not allowed'); }
  // Exact paths avoid exposing any other file or accepting traversal and query parameters. The page alone may carry a
  // query string (?lobby=<port>&idle=1 from the lobby); the server never reads it and always answers the same file.
  if (req.url === '/' || req.url.startsWith('/?')) {
    try {
      const html = await fs.readFile(path.join(__dirname, '../skills/open-kitchen/kitchen.html'));
      return reply(200, html, 'text/html; charset=utf-8');
    } catch { return reply(503, 'Kitchen page unavailable'); }
  }
  if (req.url === '/state') {
    try { return reply(200, JSON.stringify(await readKitchenState(projectRoot, { port })), 'application/json; charset=utf-8'); }
    catch { return reply(503, 'Kitchen state unavailable'); }
  }
  // The way to the lobby from any kitchen, with or without ?lobby=: 302 to the running lobby, else 404.
  if (req.url === '/lobby') {
    const target = await lobbyUrl();
    if (!target) return reply(404, 'Lobby not running');
    res.writeHead(302, { ...responseHeaders('text/plain; charset=utf-8'), Location: target });
    return res.end('Found');
  }
  return reply(404, 'Not found');
}

async function listen(server, preferredPort) {
  for (let candidate = preferredPort; candidate <= 65535; candidate++) {
    try {
      await new Promise((resolve, reject) => {
        const onError = error => { server.off('listening', onListening); reject(error); };
        const onListening = () => { server.off('error', onError); resolve(); };
        server.once('error', onError); server.once('listening', onListening);
        server.listen(candidate, '127.0.0.1');
      });
      return candidate;
    } catch (error) { if (error.code !== 'EADDRINUSE') throw error; }
  }
  throw new Error('No kitchen port available');
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  projectRoot = options.root;
  if (!(await fs.stat(projectRoot)).isDirectory()) throw new Error('Project directory unavailable');
  const server = http.createServer((req, res) => { serve(req, res).catch(() => { res.destroy(); }); });
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  server.keepAliveTimeout = 1000;
  port = await listen(server, options.preferredPort);
  const stateDir = path.join(projectRoot, '.claude/.bytheslice-state/kitchen');
  const portFile = path.join(stateDir, 'port');
  const temporaryPortFile = path.join(stateDir, `.port-${process.pid}`);
  let input, closing = false, pending = Promise.resolve();
  async function shutdown() {
    if (closing) return;
    closing = true;
    input?.close();
    if (!options.serveOnly) process.stdin.destroy();
    // Stop accepting requests, drain existing HTTP handlers, then remove our own discovery file.
    await new Promise(resolve => { server.close(resolve); server.closeIdleConnections(); });
    try { if ((await fs.readFile(portFile, 'utf8')).trim() === String(port)) await fs.unlink(portFile); } catch { /* Already replaced or removed. */ }
  }
  process.once('SIGTERM', () => { pending.then(shutdown); });
  process.once('SIGINT', () => { pending.then(shutdown); });
  process.stdout.on('error', () => { pending.then(shutdown); });
  try {
    await fs.mkdir(stateDir, { recursive: true });
    await fs.writeFile(temporaryPortFile, `${port}\n`, { mode: 0o600 });
    await fs.rename(temporaryPortFile, portFile);
    if (closing) {
      if ((await fs.readFile(portFile, 'utf8')).trim() === String(port)) await fs.unlink(portFile);
      return;
    }
  } catch {
    await fs.unlink(temporaryPortFile).catch(() => {});
    await shutdown();
    throw new Error('Kitchen discovery file unavailable');
  }
  if (!options.serveOnly) {
    input = createInterface({ input: process.stdin, crlfDelay: Infinity });
    input.on('line', line => {
      pending = pending.then(() => handle(line)).catch(() => { fail(null, -32603, 'Kitchen request failed'); });
    });
    input.on('close', () => { pending.then(shutdown); });
  }
}

main().catch(() => { process.stderr.write('Kitchen server could not start.\n'); process.exitCode = 1; });
