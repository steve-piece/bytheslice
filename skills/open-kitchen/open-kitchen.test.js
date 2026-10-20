// skills/open-kitchen/open-kitchen.test.js
// Verify loopback server reuse, bounded startup, safe CLI errors, and project isolation for the kitchen opener.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { ensureKitchen, parsePort } = require('./open-kitchen');
const execute = promisify(execFile);
const portFile = root => path.join(root, '.claude', '.bytheslice-state', 'kitchen', 'port');

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
