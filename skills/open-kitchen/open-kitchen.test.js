// skills/open-kitchen/open-kitchen.test.js
// Verify loopback server reuse, bounded startup, safe CLI errors, and project isolation for the kitchen and lobby opener.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const net = require('node:net');
const { execFile, spawnSync } = require('node:child_process');
const { promisify } = require('node:util');
const { ensureKitchen, ensureLobby, parsePort } = require('./open-kitchen');
const execute = promisify(execFile);
const portFile = root => path.join(root, '.claude', '.bytheslice-state', 'kitchen', 'port');
const lobbyPortFile = home => path.join(home, 'lobby', 'port');
const opener = path.join(__dirname, 'open-kitchen.js');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function fixture(t) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'bts-kitchen-opener-'));
  const project = path.join(base, 'project with spaces');
  const plugin = path.join(base, 'plugin');
  await fs.mkdir(project);
  await fs.mkdir(path.join(plugin, 'mcp'), { recursive: true });
  t.after(async () => {
    try {
      const pid = Number(await fs.readFile(path.join(project, 'server.pid'), 'utf8'));
      if (Number.isInteger(pid) && pid > 0) process.kill(pid, 'SIGTERM');
    } catch {}
    await fs.rm(base, { recursive: true, force: true });
  });
  return { base, project, plugin };
}

async function serve(t, root, extra = {}) {
  const server = http.createServer((request, response) => {
    assert.equal(request.url, '/state');
    assert.equal(request.headers['cache-control'], 'no-cache');
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ project: { root }, port: server.address().port, ...extra }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  return server.address().port;
}

async function writePort(project, value) {
  await fs.mkdir(path.dirname(portFile(project)), { recursive: true });
  await fs.writeFile(portFile(project), value);
}

const fakeServer = `// mcp/kitchen-server.js
// Test fixture for the detached project-specific loopback server startup contract.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const args = process.argv.slice(2);
if (args[0] !== '--project' || args[2] !== '--serve-only') process.exit(2);
const root = args[1];
fs.writeFileSync(path.join(root, 'server.pid'), String(process.pid));
const server = http.createServer((request, response) => {
  response.setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify({ project: { root }, port: server.address().port }));
});
server.listen(0, '127.0.0.1', () => {
  const directory = path.join(root, '.claude', '.bytheslice-state', 'kitchen');
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'port'), String(server.address().port));
});
`;

test('port parser accepts only integer TCP ports', () => {
  assert.equal(parsePort('4477\n'), 4477);
  for (const value of ['', '0', '-1', '65536', '4477/path', '4.5', 'http://example.test', '1e3']) {
    assert.equal(parsePort(value), null);
  }
});

test('reuses a healthy matching project without needing a server installation', async t => {
  const { project, base } = await fixture(t);
  const port = await serve(t, project);
  await writePort(project, String(port));
  const url = await ensureKitchen({ projectRoot: project, pluginRoot: path.join(base, 'missing') });
  assert.equal(url, `http://127.0.0.1:${port}/`);
});

test('a canonical project alias reuses the same server', async t => {
  const { project, base } = await fixture(t);
  const alias = path.join(base, 'alias');
  await fs.symlink(project, alias, 'dir');
  const port = await serve(t, project);
  await writePort(project, String(port));
  assert.equal(await ensureKitchen({ projectRoot: alias }), `http://127.0.0.1:${port}/`);
});

test('starts a detached server after a malformed or stale port file', async t => {
  const { project, plugin } = await fixture(t);
  await writePort(project, 'http://untrusted.example/state');
  await fs.writeFile(path.join(plugin, 'mcp', 'kitchen-server.js'), fakeServer);
  const url = await ensureKitchen({ projectRoot: project, pluginRoot: plugin, timeoutMs: 3000 });
  assert.match(url, /^http:\/\/127\.0\.0\.1:\d+\/$/);
  assert.equal(await ensureKitchen({ projectRoot: project, pluginRoot: plugin }), url);
});

test('does not reuse another project when its port appears in the requested project', async t => {
  const { project, plugin, base } = await fixture(t);
  const other = path.join(base, 'other-project');
  await fs.mkdir(other);
  const otherPort = await serve(t, other);
  await writePort(project, String(otherPort));
  await fs.writeFile(path.join(plugin, 'mcp', 'kitchen-server.js'), fakeServer);
  const url = await ensureKitchen({ projectRoot: project, pluginRoot: plugin, timeoutMs: 3000 });
  assert.notEqual(url, `http://127.0.0.1:${otherPort}/`);
});

test('rejects a snapshot whose top-level port disagrees with the local listener', async t => {
  const { project, base } = await fixture(t);
  const port = await serve(t, project, { port: 0 });
  await writePort(project, String(port));
  await assert.rejects(ensureKitchen({ projectRoot: project, pluginRoot: path.join(base, 'missing') }),
    { message: 'Kitchen server is missing from this plugin installation.' });
});

test('startup fails safely and promptly when the child exits', async t => {
  const { project, plugin } = await fixture(t);
  await fs.writeFile(path.join(plugin, 'mcp', 'kitchen-server.js'),
    '// mcp/kitchen-server.js\n// Test fixture for a failed server startup.\nprocess.exit(1);\n');
  const before = Date.now();
  await assert.rejects(ensureKitchen({ projectRoot: project, pluginRoot: plugin, timeoutMs: 1000 }),
    { message: 'Kitchen server did not become ready. Check the plugin installation and try again.' });
  assert.ok(Date.now() - before < 1500);
});

test('CLI stdout contains only the verified local URL', async t => {
  const { project } = await fixture(t);
  const port = await serve(t, project);
  await writePort(project, String(port));
  const result = await execute(process.execPath, [path.join(__dirname, 'open-kitchen.js'), '--project', project]);
  assert.equal(result.stdout, `http://127.0.0.1:${port}/\n`);
  assert.equal(result.stderr, '');
});

test('CLI errors do not echo invalid project arguments', async t => {
  const { base } = await fixture(t);
  const missing = path.join(base, 'private-input-do-not-echo');
  await assert.rejects(execute(process.execPath, [path.join(__dirname, 'open-kitchen.js'), '--project', missing]),
    error => error.stdout === '' && error.stderr === 'Kitchen project directory is unavailable.\n');
});

// The lobby entry (--lobby). Every case uses a temp BTS_HOME, never the real ~/.bytheslice.

async function lobbyFixture(t) {
  const base = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'bts-lobby-opener-')));
  const home = path.join(base, 'lobby home');
  const plugin = path.join(base, 'plugin');
  await fs.mkdir(path.join(plugin, 'mcp'), { recursive: true });
  t.after(async () => {
    try {
      const pid = Number(await fs.readFile(path.join(home, 'server.pid'), 'utf8'));
      if (Number.isInteger(pid) && pid > 0) process.kill(pid, 'SIGTERM');
    } catch {}
    await fs.rm(base, { recursive: true, force: true });
  });
  return { base, home, plugin };
}

async function serveJson(t, body) {
  const server = http.createServer((request, response) => {
    assert.equal(request.url, '/state');
    assert.equal(request.headers['cache-control'], 'no-cache');
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify(typeof body === 'function' ? body(server.address().port) : body));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  return server.address().port;
}

async function writeLobbyPort(home, value) {
  await fs.mkdir(path.dirname(lobbyPortFile(home)), { recursive: true });
  await fs.writeFile(lobbyPortFile(home), value);
}

const fakeLobby = `// mcp/lobby-server.js
// Test fixture for the detached machine-level lobby startup contract.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
if (process.argv.slice(2).join(' ') !== '--serve-only' || !process.env.BTS_HOME) process.exit(2);
const home = process.env.BTS_HOME;
fs.mkdirSync(home, { recursive: true });
fs.writeFileSync(path.join(home, 'server.pid'), String(process.pid));
const server = http.createServer((request, response) => {
  response.setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify({ v: 1, projects: [] }));
});
server.listen(0, '127.0.0.1', () => {
  fs.mkdirSync(path.join(home, 'lobby'), { recursive: true });
  fs.writeFileSync(path.join(home, 'lobby', 'port'), String(server.address().port));
});
`;

test('lobby: reuses a running lobby without needing a server installation', async t => {
  const { home, base } = await lobbyFixture(t);
  const port = await serveJson(t, { v: 1, projects: [{ key: '/x' }] });
  await writeLobbyPort(home, `${port}\n`);
  assert.equal(await ensureLobby({ home, pluginRoot: path.join(base, 'missing') }), `http://127.0.0.1:${port}/`);
});

test('lobby: starts one detached under the given BTS_HOME when absent, then reuses it', async t => {
  const { home, plugin } = await lobbyFixture(t);
  await fs.writeFile(path.join(plugin, 'mcp', 'lobby-server.js'), fakeLobby);
  const url = await ensureLobby({ home, pluginRoot: plugin, timeoutMs: 3000 });
  assert.match(url, /^http:\/\/127\.0\.0\.1:\d+\/$/);
  assert.equal(url, `http://127.0.0.1:${(await fs.readFile(lobbyPortFile(home), 'utf8')).trim()}/`);
  assert.equal(await ensureLobby({ home, pluginRoot: plugin }), url);
});

test('lobby: a malformed port file or a listener without a projects array is never reused', async t => {
  const { home, plugin } = await lobbyFixture(t);
  await fs.writeFile(path.join(plugin, 'mcp', 'lobby-server.js'), fakeLobby);
  const kitchenPort = await serveJson(t, port => ({ port, project: { root: '/somewhere' } }));
  await writeLobbyPort(home, String(kitchenPort));
  const url = await ensureLobby({ home, pluginRoot: plugin, timeoutMs: 3000 });
  assert.notEqual(url, `http://127.0.0.1:${kitchenPort}/`);
  for (const value of ['http://untrusted.example/state', '0', '65536', '4466/x']) {
    await writeLobbyPort(home, value);
    await assert.rejects(ensureLobby({ home, pluginRoot: path.join(plugin, 'missing') }),
      { message: 'Lobby server is missing from this plugin installation.' }, value);
  }
});

test('lobby: startup fails safely and promptly when the child exits, and rejects a bad timeout', async t => {
  const { home, plugin } = await lobbyFixture(t);
  await fs.writeFile(path.join(plugin, 'mcp', 'lobby-server.js'),
    '// mcp/lobby-server.js\n// Test fixture for a failed lobby startup.\nprocess.exit(1);\n');
  const before = Date.now();
  await assert.rejects(ensureLobby({ home, pluginRoot: plugin, timeoutMs: 1000 }),
    { message: 'Lobby server did not become ready. Check the plugin installation and try again.' });
  assert.ok(Date.now() - before < 1500);
  for (const timeoutMs of [0, -1, 60001, Number.NaN]) {
    await assert.rejects(ensureLobby({ home, pluginRoot: plugin, timeoutMs }), { message: 'Lobby startup timeout is invalid.' });
  }
});

test('CLI --lobby stdout contains only the verified lobby URL', async t => {
  const { home } = await lobbyFixture(t);
  const port = await serveJson(t, { v: 1, projects: [] });
  await writeLobbyPort(home, String(port));
  const result = await execute(process.execPath, [opener, '--lobby'], { env: { ...process.env, BTS_HOME: home } });
  assert.equal(result.stdout, `http://127.0.0.1:${port}/\n`);
  assert.equal(result.stderr, '');
});

test('CLI rejects --lobby combined with --project or anything else, without echoing input', async t => {
  const { home, base } = await lobbyFixture(t);
  const secret = path.join(base, 'private-input-do-not-echo');
  const usage = 'Usage: node open-kitchen.js [--project <project-root> | --lobby]\n';
  for (const args of [['--lobby', '--project', secret], ['--project', secret, '--lobby'], ['--lobby', secret], ['--lobby', '--lobby']]) {
    await assert.rejects(execute(process.execPath, [opener, ...args], { env: { ...process.env, BTS_HOME: home } }),
      error => error.code === 1 && error.stdout === '' && error.stderr === usage, args.join(' '));
  }
  await assert.rejects(fs.access(lobbyPortFile(home)), 'nothing was started');
});

test('CLI --lobby starts the real lobby server under a temp BTS_HOME and prints one URL line', async t => {
  const { home } = await lobbyFixture(t);
  const probe = net.createServer();
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const preferred = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const result = await execute(process.execPath, [opener, '--lobby'],
    { env: { ...process.env, BTS_HOME: home, BTS_LOBBY_PORT: String(preferred) }, timeout: 15000 });
  assert.match(result.stdout, /^http:\/\/127\.0\.0\.1:\d+\/\n$/);
  assert.equal(result.stderr, '');
  const port = Number(/:(\d+)\//.exec(result.stdout)[1]);
  const listeners = spawnSync('lsof', ['-nP', '-t', `-iTCP:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8' });
  const pid = Number(listeners.stdout.trim().split('\n')[0]);
  assert.ok(Number.isInteger(pid) && pid > 0 && pid !== process.pid, 'the detached lobby is listening');
  t.after(() => { try { process.kill(pid, 'SIGTERM'); } catch {} });
  const state = await new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: '/state' }, response => {
      let body = '';
      response.setEncoding('utf8'); response.on('data', chunk => { body += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, body }));
    }).on('error', reject);
  });
  assert.equal(state.status, 200);
  assert.deepEqual(JSON.parse(state.body).projects, []);
  assert.equal((await fs.stat(lobbyPortFile(home))).mode & 0o777, 0o600);
  process.kill(pid, 'SIGTERM');
  for (let attempt = 0; attempt < 100; attempt++) {
    try { await fs.access(lobbyPortFile(home)); } catch { return; }
    await delay(20);
  }
  assert.fail('the lobby removes its port file on SIGTERM');
});
