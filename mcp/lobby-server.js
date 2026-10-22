// mcp/lobby-server.js
// Serves the machine-level lobby on protected loopback HTTP: the page, every registered project's state, and an allowlisted kitchen start.
'use strict';

const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { lobbyHome, readLobby, readRegistry } = require('./lobby-state.js');

const PAGE = path.join(__dirname, '../skills/open-kitchen/lobby.html');
const OPEN_MAX_BYTES = 1024;
const KITCHEN_URL = /^http:\/\/127\.0\.0\.1:\d{1,5}\/$/;

// Loaded on first use so a copy without the opener still serves the page and /state.
function defaultEnsureKitchen(options) {
  return require('../skills/open-kitchen/open-kitchen.js').ensureKitchen(options);
}

function parseOptions(args) {
  let serveOnly = false;
  for (const arg of args) {
    if (arg === '--serve-only') serveOnly = true;
    else throw new Error('Unsupported lobby server option');
  }
  const rawPort = process.env.BTS_LOBBY_PORT || '4466';
  if (!/^\d+$/.test(rawPort) || Number(rawPort) < 1 || Number(rawPort) > 65535) throw new Error('Invalid lobby port');
  return { serveOnly, preferredPort: Number(rawPort), home: lobbyHome() };
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

// The same checks as the kitchen: only our own loopback host, and no cross-site origin or fetch.
function trustedRequest(req, port) {
  const hosts = [`127.0.0.1:${port}`, `localhost:${port}`];
  if (!hosts.includes(req.headers.host)) return false;
  if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) return false;
  const site = req.headers['sec-fetch-site'];
  // A top-level click from a kitchen (another 127.0.0.1 port) is same-site: allowed for the page document only.
  const pageNavigation = site === 'same-site' && req.method === 'GET' && req.url === '/'
    && req.headers['sec-fetch-mode'] === 'navigate' && req.headers['sec-fetch-dest'] === 'document';
  if (site && !['same-origin', 'none'].includes(site) && !pageNavigation) return false;
  return true;
}

/** The request body as text, or null once it passes `max` bytes (the rest is discarded, never buffered). */
function readBody(req, max) {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers['content-length']);
    if (Number.isFinite(declared) && declared > max) { req.resume(); resolve(null); return; }
    const chunks = [];
    let size = 0, over = false;
    req.on('data', chunk => {
      if (over) return;
      size += chunk.length;
      if (size > max) { over = true; chunks.length = 0; resolve(null); return; }
      chunks.push(chunk);
    });
    req.on('end', () => { if (!over) resolve(Buffer.concat(chunks).toString('utf8')); });
    req.on('error', reject);
  });
}

/**
 * The lobby HTTP server, not yet bound. Routes (exact paths, no query strings):
 *   GET /        the lobby page (503 while it is missing)
 *   GET /state   readLobby as JSON
 *   POST /open   {"root":"<abs>"}: start that registered project's kitchen, answer {"url":"http://127.0.0.1:<port>/"}
 * Every request must pass trustedRequest (403). Any other method on / or /state, and any method but POST on /open,
 * is 405. Options are injectable for tests: home, page, ensureKitchen, readState.
 */
function createLobbyServer({ home = lobbyHome(), page = PAGE, ensureKitchen = defaultEnsureKitchen,
  readState = () => readLobby({ home, now: Date.now() }) } = {}) {
  // One in-flight start per project root, so a double click spawns one kitchen.
  const starting = new Map();
  function openOnce(key) {
    let pending = starting.get(key);
    if (!pending) {
      pending = Promise.resolve()
        .then(() => ensureKitchen({ projectRoot: key }))
        .then(url => { if (typeof url !== 'string' || !KITCHEN_URL.test(url)) throw new Error('Unexpected kitchen URL'); return url; })
        .finally(() => { starting.delete(key); });
      starting.set(key, pending);
    }
    return pending;
  }

  // The allowlist: the realpath of the asked root must equal a registry entry's realpath. Nothing else is reachable.
  async function registeredRoot(root) {
    if (typeof root !== 'string' || root.length === 0 || root.length > 4096 || root.includes('\0') || !path.isAbsolute(root)) return null;
    let real;
    try { real = await fs.realpath(root); } catch { return null; }
    const entries = await readRegistry({ home, prune: false });
    return entries.some(entry => entry.key === real) ? real : null;
  }

  async function serve(req, res) {
    const reply = (code, message, type = 'text/plain; charset=utf-8') => {
      res.writeHead(code, responseHeaders(type)); res.end(message);
    };
    if (!trustedRequest(req, server.address()?.port)) return reply(403, 'Forbidden');
    if (req.url === '/open') {
      if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return reply(405, 'Method not allowed'); }
      const type = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
      if (type !== 'application/json') { res.setHeader('Connection', 'close'); req.resume(); return reply(415, 'Unsupported media type'); }
      const body = await readBody(req, OPEN_MAX_BYTES);
      if (body === null) { res.setHeader('Connection', 'close'); return reply(413, 'Payload too large'); }
      let input;
      try { input = JSON.parse(body); } catch { return reply(400, 'Bad request'); }
      const key = await registeredRoot(input !== null && typeof input === 'object' ? input.root : null);
      if (!key) return reply(404, 'Not found');
      try { return reply(200, JSON.stringify({ url: await openOnce(key) }), 'application/json; charset=utf-8'); }
      catch { return reply(502, 'Kitchen could not be opened'); }
    }
    if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return reply(405, 'Method not allowed'); }
    if (req.url === '/') {
      try { return reply(200, await fs.readFile(page), 'text/html; charset=utf-8'); }
      catch { return reply(503, 'Lobby page unavailable'); }
    }
    if (req.url === '/state') {
      try { return reply(200, JSON.stringify(await readState()), 'application/json; charset=utf-8'); }
      catch { return reply(503, 'Lobby state unavailable'); }
    }
    return reply(404, 'Not found');
  }

  const server = http.createServer((req, res) => { serve(req, res).catch(() => { res.destroy(); }); });
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  server.keepAliveTimeout = 1000;
  return server;
}

/** Bind 127.0.0.1 only, from the preferred port upward past any port in use. Answers the bound port. */
async function bindLoopback(server, preferredPort) {
  for (let candidate = preferredPort; candidate <= 65535; candidate++) {
    try {
      await new Promise((resolve, reject) => {
        const onError = error => { server.off('listening', onListening); reject(error); };
        const onListening = () => { server.off('error', onError); resolve(); };
        server.once('error', onError); server.once('listening', onListening);
        server.listen(candidate, '127.0.0.1');
      });
      return server.address().port;
    } catch (error) { if (error.code !== 'EADDRINUSE' || candidate === 0) throw error; }
  }
  throw new Error('No lobby port available');
}

// Without --serve-only the lobby lives as long as its stdin stays open (the kitchen's lifecycle); with it, until SIGTERM or SIGINT.
async function main() {
  const options = parseOptions(process.argv.slice(2));
  const server = createLobbyServer({ home: options.home });
  const port = await bindLoopback(server, options.preferredPort);
  const stateDir = path.join(options.home, 'lobby');
  const portFile = path.join(stateDir, 'port');
  const temporaryPortFile = path.join(stateDir, `.port-${process.pid}`);
  let closing = false;
  async function shutdown() {
    if (closing) return;
    closing = true;
    if (!options.serveOnly) process.stdin.destroy();
    // Stop accepting requests, drain existing handlers, then remove our own discovery file.
    await new Promise(resolve => { server.close(resolve); server.closeIdleConnections(); });
    try { if ((await fs.readFile(portFile, 'utf8')).trim() === String(port)) await fs.unlink(portFile); } catch { /* Already replaced or removed. */ }
  }
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
  try {
    await fs.mkdir(stateDir, { recursive: true, mode: 0o700 });
    await fs.writeFile(temporaryPortFile, `${port}\n`, { mode: 0o600 });
    await fs.rename(temporaryPortFile, portFile);
    if (closing) {
      if ((await fs.readFile(portFile, 'utf8')).trim() === String(port)) await fs.unlink(portFile);
      return;
    }
  } catch {
    await fs.unlink(temporaryPortFile).catch(() => {});
    await shutdown();
    throw new Error('Lobby discovery file unavailable');
  }
  if (!options.serveOnly) {
    process.stdin.on('end', shutdown);
    process.stdin.on('close', shutdown);
    process.stdin.on('error', shutdown);
    process.stdin.resume();
  }
}

if (require.main === module) {
  main().catch(() => { process.stderr.write('Lobby server could not start.\n'); process.exitCode = 1; });
}

module.exports = { createLobbyServer, bindLoopback, trustedRequest, parseOptions, responseHeaders };
