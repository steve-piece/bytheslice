// tests/lobby/server.test.js
// Exercises the lobby's protected loopback HTTP: trusted-request checks, exact routes, the POST /open allowlist, one start per root, and process discovery.
'use strict';

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs/promises');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');
const test = require('node:test');
const { createLobbyServer, bindLoopback } = require('../../mcp/lobby-server.js');
const { CHECKLIST_ACTIVE, sandbox, project, register } = require('./helpers.js');

const entry = path.resolve(__dirname, '../../mcp/lobby-server.js');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function request(port, { method = 'GET', url = '/state', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: url, method, headers, timeout: 3000 }, res => {
      let text = '';
      res.setEncoding('utf8'); res.on('data', chunk => { text += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: text }));
    });
    req.on('timeout', () => req.destroy(new Error('HTTP request timed out'))); req.on('error', reject);
    req.end(body);
  });
}

const open = (port, root, headers = {}) => request(port, {
  method: 'POST', url: '/open', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ root }),
});

/** A lobby bound on an ephemeral loopback port over a temp BTS_HOME with one registered project and a stubbed kitchen start. */
async function lobby(t, { ensureKitchen, page } = {}) {
  const { base, home } = await sandbox(t);
  const root = await project(base, 'registered', { checklist: CHECKLIST_ACTIVE });
  await register(home, [root]);
  const calls = [];
  const stub = ensureKitchen || (async options => { calls.push(options); return 'http://127.0.0.1:45678/'; });
  const server = createLobbyServer({ home, page: page || path.join(base, 'no-lobby.html'), ensureKitchen: stub });
  const port = await bindLoopback(server, 0);
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return { base, home, root, port, calls };
}

test('/state host-header 403', async t => {
  const { port } = await lobby(t);
  for (const host of ['evil.test', `evil.test:${port}`, `127.0.0.1:${port + 1}`]) {
    const res = await request(port, { headers: { Host: host } });
    assert.equal(res.status, 403, host);
    assert.equal(res.body, 'Forbidden');
  }
  assert.equal((await request(port, { headers: { Origin: 'http://evil.test' } })).status, 403, 'cross-origin');
  assert.equal((await request(port, { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403, 'cross-site fetch');
  assert.equal((await request(port, { headers: { Host: `localhost:${port}` } })).status, 200, 'localhost is our own host');
});

test('/state serves the lobby JSON with the protective headers', async t => {
  const { port, root } = await lobby(t);
  const res = await request(port);
  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'], /^application\/json/);
  assert.equal(res.headers['cache-control'], 'no-store');
  assert.equal(res.headers['x-frame-options'], 'DENY');
  assert.equal(res.headers['x-content-type-options'], 'nosniff');
  assert.match(res.headers['content-security-policy'], /frame-ancestors 'none'/);
  const data = JSON.parse(res.body);
  assert.equal(data.v, 1);
  assert.ok(Number.isFinite(data.generatedAt));
  assert.equal(data.projects.length, 1);
  const [row] = data.projects;
  assert.deepEqual(Object.keys(row).sort(), ['active', 'activePie', 'activeSlice', 'key', 'kitchenUrl', 'name', 'path', 'pies',
    'root', 'sessions', 'slices', 'state'].sort());
  assert.equal(row.key, root);
  assert.ok(['needs-you', 'active', 'done', 'inactive'].includes(row.state));
});

test('GET / serves the lobby page, 503 while it is missing', async t => {
  const missing = await lobby(t);
  const res = await request(missing.port, { url: '/' });
  assert.equal(res.status, 503);
  assert.equal(res.body, 'Lobby page unavailable');
  const page = path.join(missing.base, 'lobby.html');
  await fs.writeFile(page, '<!doctype html><title>Lobby</title>');
  const present = await lobby(t, { page });
  const served = await request(present.port, { url: '/' });
  assert.equal(served.status, 200);
  assert.match(served.headers['content-type'], /^text\/html/);
  assert.equal(served.body, '<!doctype html><title>Lobby</title>');
});

test('exact paths only, and every other method is 405', async t => {
  const { port } = await lobby(t);
  for (const url of ['/state?x=1', '/state/', '/../state', '/lobby.html', '/open/']) {
    assert.equal((await request(port, { url })).status, 404, url);
  }
  for (const [method, url, allow] of [['POST', '/state', 'GET'], ['PUT', '/', 'GET'], ['DELETE', '/state', 'GET'],
    ['POST', '/anything', 'GET'], ['GET', '/open', 'POST'], ['PUT', '/open', 'POST']]) {
    const res = await request(port, { method, url });
    assert.equal(res.status, 405, `${method} ${url}`);
    assert.equal(res.headers.allow, allow);
  }
});

test('POST /open accepts a registered root', async t => {
  const { port, root, calls } = await lobby(t);
  const res = await open(port, root);
  assert.equal(res.status, 200);
  assert.deepEqual(JSON.parse(res.body), { url: 'http://127.0.0.1:45678/' });
  assert.deepEqual(calls, [{ projectRoot: root }]);
  const charset = await request(port, { method: 'POST', url: '/open', headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ root }) });
  assert.equal(charset.status, 200, 'a charset parameter is still JSON');
});

test('POST /open rejects /etc', async t => {
  const { port, calls } = await lobby(t);
  const res = await open(port, '/etc');
  assert.equal(res.status, 404);
  assert.equal(res.body, 'Not found');
  assert.equal(calls.length, 0);
});

test('POST /open rejects a registered root plus /..', async t => {
  const { port, root, calls } = await lobby(t);
  for (const asked of [`${root}/..`, path.join(root, 'docs', '..', '..'), `${root}/docs`, 'registered', '', null, 42]) {
    assert.equal((await open(port, asked)).status, 404, String(asked));
  }
  assert.equal(calls.length, 0);
});

test('POST /open rejects a symlink to an unregistered folder', async t => {
  const { base, port, root, calls } = await lobby(t);
  const stranger = await project(base, 'stranger', { checklist: CHECKLIST_ACTIVE });
  const sneaky = path.join(base, 'looks-registered');
  await fs.symlink(stranger, sneaky);
  assert.equal((await open(port, sneaky)).status, 404);
  assert.equal(calls.length, 0);
  // A link to the registered folder itself resolves to the same realpath, so it is the registered project.
  const alias = path.join(base, 'alias');
  await fs.symlink(root, alias);
  assert.equal((await open(port, alias)).status, 200);
  assert.deepEqual(calls, [{ projectRoot: root }]);
});

test('POST /open rejects a non-JSON content type', async t => {
  const { port, root, calls } = await lobby(t);
  for (const type of ['text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data; boundary=x', undefined]) {
    const headers = type ? { 'Content-Type': type } : {};
    const res = await request(port, { method: 'POST', url: '/open', headers, body: JSON.stringify({ root }) });
    assert.equal(res.status, 415, String(type));
  }
  assert.equal(calls.length, 0);
});

test('POST /open rejects an oversize body', async t => {
  const { port, root, calls } = await lobby(t);
  const body = JSON.stringify({ root, pad: 'x'.repeat(2048) });
  const res = await request(port, { method: 'POST', url: '/open', headers: { 'Content-Type': 'application/json' }, body });
  assert.equal(res.status, 413);
  const chunked = await request(port, { method: 'POST', url: '/open',
    headers: { 'Content-Type': 'application/json', 'Transfer-Encoding': 'chunked' }, body });
  assert.equal(chunked.status, 413, 'a body with no declared length is still capped');
  assert.equal(calls.length, 0);
  assert.equal((await request(port, { method: 'POST', url: '/open', headers: { 'Content-Type': 'application/json' }, body: '{bad' })).status, 400);
});

test('double POST /open spawns once', async t => {
  let calls = 0;
  const ensureKitchen = async () => { calls++; await delay(150); return 'http://127.0.0.1:45999/'; };
  const { port, root } = await lobby(t, { ensureKitchen });
  const [first, second] = await Promise.all([open(port, root), open(port, root)]);
  assert.equal(calls, 1, 'one in-flight start per root');
  assert.deepEqual([first.status, second.status], [200, 200]);
  assert.equal(JSON.parse(first.body).url, 'http://127.0.0.1:45999/');
  assert.equal(JSON.parse(second.body).url, 'http://127.0.0.1:45999/');
  await open(port, root);
  assert.equal(calls, 2, 'a settled start is not cached, so a later click checks again');
});

test('POST /open answers 502 when the kitchen cannot be opened', async t => {
  const failing = await lobby(t, { ensureKitchen: async () => { throw new Error('/secret/path detail'); } });
  const res = await open(failing.port, failing.root);
  assert.equal(res.status, 502);
  assert.equal(res.body, 'Kitchen could not be opened');
  const offsite = await lobby(t, { ensureKitchen: async () => 'http://evil.test/' });
  assert.equal((await open(offsite.port, offsite.root)).status, 502, 'never hands back a non-loopback URL');
});

async function freePort() {
  const socket = net.createServer();
  socket.listen(0, '127.0.0.1'); await once(socket, 'listening');
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  return port;
}

function spawnLobby(t, home, { args = ['--serve-only'], env = {} } = {}) {
  const child = spawn(process.execPath, [entry, ...args], { env: { ...process.env, BTS_HOME: home, ...env }, stdio: ['pipe', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk; });
  child.stderr.on('data', chunk => { stderr += chunk; });
  const exited = once(child, 'exit');
  t.after(async () => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM'); await exited; });
  return { child, exited, stdout: () => stdout, stderr: () => stderr };
}

async function waitPort(file, child) {
  for (let attempt = 0; attempt < 250; attempt++) {
    try { const port = Number((await fs.readFile(file, 'utf8')).trim()); if (port) return port; } catch { /* Not ready. */ }
    if (child.exitCode !== null) assert.fail('Lobby server exited before discovery');
    await delay(20);
  }
  return assert.fail('Lobby discovery file never appeared');
}

test('--serve-only writes a 0600 port file, walks past a busy port, prints nothing and removes the file on SIGTERM', async t => {
  const { base, home } = await sandbox(t);
  const root = await project(base, 'served', { checklist: CHECKLIST_ACTIVE });
  await register(home, [root]);
  const busy = net.createServer();
  busy.listen(await freePort(), '127.0.0.1'); await once(busy, 'listening');
  t.after(() => new Promise(resolve => busy.close(resolve)));
  const preferred = busy.address().port;
  const session = spawnLobby(t, home, { env: { BTS_LOBBY_PORT: String(preferred) } });
  const portFile = path.join(home, 'lobby', 'port');
  const port = await waitPort(portFile, session.child);
  assert.ok(port > preferred, 'walked up past the busy port');
  assert.equal((await fs.stat(portFile)).mode & 0o777, 0o600);
  const state = JSON.parse((await request(port)).body);
  assert.equal(state.projects[0].key, root);
  assert.equal((await open(port, '/etc')).status, 404);
  session.child.kill('SIGTERM');
  await session.exited;
  assert.equal(session.stdout(), '');
  await assert.rejects(fs.access(portFile), 'the discovery file is removed on shutdown');
});

test('shutdown leaves a port file that names another lobby', async t => {
  const { home } = await sandbox(t);
  const session = spawnLobby(t, home, { env: { BTS_LOBBY_PORT: String(await freePort()) } });
  const portFile = path.join(home, 'lobby', 'port');
  await waitPort(portFile, session.child);
  await fs.writeFile(portFile, '1\n');
  session.child.kill('SIGINT');
  await session.exited;
  assert.equal(await fs.readFile(portFile, 'utf8'), '1\n');
});

test('without --serve-only the lobby stops when its stdin closes', async t => {
  const { home } = await sandbox(t);
  const session = spawnLobby(t, home, { args: [], env: { BTS_LOBBY_PORT: String(await freePort()) } });
  const portFile = path.join(home, 'lobby', 'port');
  await waitPort(portFile, session.child);
  session.child.stdin.end();
  const [code] = await session.exited;
  assert.equal(code, 0);
  await assert.rejects(fs.access(portFile));
});

test('a bad option or port prints only the safe failure line and exits 1', async t => {
  const { home } = await sandbox(t);
  for (const [args, env] of [[['--serve-only', '--project', '/etc'], {}], [['--serve-only'], { BTS_LOBBY_PORT: '70000' }],
    [['--serve-only'], { BTS_LOBBY_PORT: 'abc' }]]) {
    const session = spawnLobby(t, home, { args, env });
    const [code] = await session.exited;
    assert.equal(code, 1);
    assert.equal(session.stdout(), '');
    assert.equal(session.stderr(), 'Lobby server could not start.\n');
  }
});
