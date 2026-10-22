// tests/kitchen/kitchen-server.test.js
// Exercises MCP snapshots, protected loopback HTTP, port discovery, collision recovery, and shutdown.
'use strict';

const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs/promises');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { checklist, activity } = require('../fixtures/kitchen/data.js');

const server = path.resolve(__dirname, '../../mcp/kitchen-server.js');
const request = (id, method, params) => ({ jsonrpc: '2.0', id, method, params });
const initialize = version => request(1, 'initialize', {
  protocolVersion: version, capabilities: {}, clientInfo: { name: 'kitchen-test', version: '1.0.0' },
});
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kitchen-server-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const dir = path.join(root, '.claude/.bytheslice-state/kitchen');
  await fs.mkdir(dir, { recursive: true });
  await fs.mkdir(path.join(root, 'docs/plans'), { recursive: true });
  await fs.writeFile(path.join(root, 'docs/plans/00_master_checklist.md'), checklist);
  await fs.writeFile(path.join(dir, 'activity.jsonl'), activity.map(row => JSON.stringify(row)).join('\n') + '\n');
  return { root, dir, portFile: path.join(dir, 'port') };
}

async function freePort() {
  const socket = net.createServer();
  socket.listen(0, '127.0.0.1'); await once(socket, 'listening');
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  return port;
}

async function start(t, data, { serveOnly = false, preferredPort, args, env = {} } = {}) {
  const child = spawn(process.execPath, [server, ...(args || ['--project', data.root]), ...(serveOnly ? ['--serve-only'] : [])], {
    cwd: os.tmpdir(), env: { ...process.env, BTS_KITCHEN_PORT: String(preferredPort || await freePort()), ...env },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stdout = '', stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk; });
  child.stderr.on('data', chunk => { stderr += chunk; });
  const exited = once(child, 'exit');
  t.after(async () => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM'); await exited; });
  let port;
  for (let attempt = 0; attempt < 250; attempt++) {
    try { port = Number((await fs.readFile(data.portFile, 'utf8')).trim()); if (port) break; } catch { /* Not ready. */ }
    if (child.exitCode !== null) assert.fail('Kitchen server exited before discovery');
    await delay(20);
  }
  assert.ok(port, 'Server discovery file must become ready');
  return { child, port, exited, stdout: () => stdout, stderr: () => stderr };
}

function get(port, url = '/state', headers = {}, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: url, method, headers, timeout: 3000 }, res => {
      let body = '';
      res.setEncoding('utf8'); res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('timeout', () => req.destroy(new Error('HTTP request timed out'))); req.on('error', reject); req.end();
  });
}

function send(child, messages) { child.stdin.write(messages.map(message => typeof message === 'string' ? message : JSON.stringify(message)).join('\n') + '\n'); }
function replies(session) { return session.stdout().trim().split('\n').filter(Boolean).map(line => JSON.parse(line)); }

async function waitReplies(session, count) {
  for (let attempt = 0; attempt < 250; attempt++) {
    if (replies(session).length >= count) return replies(session);
    await delay(20);
  }
  assert.fail('MCP response timed out');
}

test('stdio handshake exposes one read-only tool and drains full snapshot requests before EOF shutdown', async t => {
  const data = await fixture(t), session = await start(t, data);
  send(session.child, [initialize('2025-11-25'), { jsonrpc: '2.0', method: 'notifications/initialized' },
    request(2, 'tools/list'), request('state', 'tools/call', { name: 'kitchen_state', arguments: { since: 999999 } }), request(4, 'ping')]);
  session.child.stdin.end();
  const [code] = await session.exited;
  assert.equal(code, 0); assert.equal(session.stderr(), '');
  const output = replies(session);
  assert.equal(output.length, 4);
  assert.equal(output[0].result.protocolVersion, '2025-11-25');
  assert.deepEqual(output[0].result.capabilities, { tools: {} });
  assert.equal(output[1].result.tools.length, 1);
  assert.equal(output[1].result.tools[0].annotations.readOnlyHint, true);
  assert.deepEqual(output[1].result.tools[0].inputSchema.properties.since, { type: 'integer', minimum: 0 });
  const state = JSON.parse(output[2].result.content[0].text);
  assert.deepEqual(state, output[2].result.structuredContent);
  assert.equal(state.project.root, data.root); assert.equal(state.project.setup, 'built'); assert.equal(state.port, session.port);
  assert.equal(state.pies.find(pie => pie.pie === 4).slices.length, 3);
  assert.equal(state.active[0].aid, 'cook');
  assert.deepEqual(output[3].result, {});
  await assert.rejects(fs.access(data.portFile));
  await assert.rejects(get(session.port));
});

test('supports old MCP clients and negotiates unsupported versions', async t => {
  const data = await fixture(t), session = await start(t, data);
  send(session.child, [initialize('2024-11-05'), request(2, 'tools/call', { name: 'kitchen_state' }), initialize('unsupported')]);
  const output = await waitReplies(session, 3);
  assert.equal(output[0].result.protocolVersion, '2024-11-05');
  assert.equal(Object.hasOwn(output[1].result, 'structuredContent'), false);
  assert.equal(output[2].result.protocolVersion, '2025-11-25');
});

test('rejects invalid since and malformed requests without leaking inputs or breaking stdio', async t => {
  const data = await fixture(t), session = await start(t, data);
  send(session.child, [request(0, 'tools/list'), '{', '[]', initialize('2025-11-25'), request(2, 'unknown'),
    request(3, 'tools/call', { name: 'other' }),
    ...[-1, 0.5, '0', null].map((since, index) => request(4 + index, 'tools/call', { name: 'kitchen_state', arguments: { since } })),
    request(8, 'tools/call', { name: 'kitchen_state', arguments: { prompt: 'PRIVATE_SENTINEL' } }),
    { jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: 8 } }, request(9, 'ping')]);
  const output = await waitReplies(session, 12);
  assert.deepEqual(output.map(reply => reply.error?.code ?? 'ok'), [
    -32000, -32700, -32600, 'ok', -32601, -32602, -32602, -32602, -32602, -32602, -32602, 'ok',
  ]);
  assert.equal(session.stdout().includes('PRIVATE_SENTINEL'), false);
});

test('HTTP serves exact page and state routes on loopback with same-origin protections', async t => {
  const data = await fixture(t), session = await start(t, data, { serveOnly: true });
  session.child.stdin.end();
  const page = await get(session.port, '/');
  assert.equal(page.status, 200);
  assert.match(page.headers['content-type'], /text\/html/);
  assert.equal(page.body, await fs.readFile(path.resolve(__dirname, '../../skills/open-kitchen/kitchen.html'), 'utf8'));
  const fromLobby = await get(session.port, '/?lobby=4466&idle=1');
  assert.equal(fromLobby.status, 200, 'the lobby hand-off query string still serves the page');
  assert.equal(fromLobby.body, page.body);
  const state = await get(session.port);
  assert.equal(state.status, 200);
  assert.equal(state.headers['access-control-allow-origin'], undefined);
  assert.equal(state.headers['cache-control'], 'no-store');
  assert.equal(JSON.parse(state.body).project.root, data.root);
  assert.equal(JSON.parse(state.body).pies.find(pie => pie.pie === 4).slices[1].number, '4.2');
  for (const url of ['/activity.jsonl', '/../../package.json', '/state?since=1', '/state/', '/.env']) assert.equal((await get(session.port, url)).status, 404);
  assert.equal((await get(session.port, '/state', {}, 'POST')).status, 405);
  assert.equal((await get(session.port, '/state', { Host: 'attacker.invalid' })).status, 403);
  assert.equal((await get(session.port, '/state', { Origin: 'https://attacker.invalid' })).status, 403);
  assert.equal((await get(session.port, '/state', { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
  assert.equal((await get(session.port, '/state', { Origin: `http://127.0.0.1:${session.port}`, 'Sec-Fetch-Site': 'same-origin' })).status, 200);
  const listeners = spawnSync('lsof', ['-nP', '-a', '-p', String(session.child.pid), '-iTCP', '-sTCP:LISTEN'], { encoding: 'utf8' });
  assert.equal(listeners.status, 0);
  assert.match(listeners.stdout, new RegExp(`127\\.0\\.0\\.1:${session.port} \\(LISTEN\\)`));
  assert.equal(listeners.stdout.includes(`*:${session.port}`), false);
  assert.equal(session.stdout(), ''); assert.equal(session.stderr(), '');
});

test('recovers from an occupied port and removes discovery on signal shutdown', async t => {
  const data = await fixture(t);
  const occupied = net.createServer(); occupied.listen(0, '127.0.0.1'); await once(occupied, 'listening');
  t.after(() => new Promise(resolve => occupied.close(resolve)));
  const session = await start(t, data, { serveOnly: true, preferredPort: occupied.address().port });
  assert.ok(session.port > occupied.address().port);
  assert.equal((await get(session.port)).status, 200);
  session.child.kill('SIGTERM'); await session.exited;
  await assert.rejects(fs.access(data.portFile));
  await assert.rejects(get(session.port));
});

test('uses CLAUDE_PROJECT_DIR when no explicit project argument is given', async t => {
  const data = await fixture(t), session = await start(t, data, { serveOnly: true, args: [], env: { CLAUDE_PROJECT_DIR: data.root } });
  assert.equal(JSON.parse((await get(session.port)).body).project.root, data.root);
});
