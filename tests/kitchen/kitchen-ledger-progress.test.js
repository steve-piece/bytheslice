// tests/kitchen/kitchen-ledger-progress.test.js
// Verifies the kitchen snapshot's progress: the shared ledger fold for a fixture ledger, an empty list without one, the 1 MiB tail read, and GET /state carrying it from the read-only loopback server.
'use strict';

const assert = require('node:assert/strict');
const { execFileSync, spawn } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs/promises');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { buildSnapshot, readKitchenState } = require('../../mcp/kitchen-state.js');

const repo = path.resolve(__dirname, '../..');
const SCRIPT = path.join(repo, 'scripts/ledger-summary.js');
const SERVER = path.join(repo, 'mcp/kitchen-server.js');
const LEDGER = require('node:fs').readFileSync(path.join(repo, 'tests/fixtures/pass/ledger.jsonl'), 'utf8');
const CHECKLIST = [
  '# Checklist', '',
  '## Pie 4 - Live Kitchen [x]    <!-- review: boundary -->',
  '### Slice 4.7 - Docs and release [x]', 'Status: Completed', '',
  '## Pie 5 - The Pass [ ]    <!-- review: boundary -->',
  '### Slice 5.1 - Pass pane and band [x]', 'Status: Completed',
  '### Slice 5.2 - Ledger and status tool [x]', 'Status: Completed',
  '### Slice 5.3 - Pass checks [ ]', 'Status: In Progress', '',
].join('\n');

async function project(t, ledger) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kitchen-ledger-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'docs/plans'), { recursive: true });
  await fs.mkdir(path.join(root, '.claude/.bytheslice-state/kitchen'), { recursive: true });
  await fs.writeFile(path.join(root, 'docs/plans/00_master_checklist.md'), CHECKLIST);
  if (ledger !== null) {
    await fs.mkdir(path.join(root, '.bytheslice'));
    await fs.writeFile(path.join(root, '.bytheslice/ledger.jsonl'), ledger);
  }
  return root;
}

test('buildSnapshot with a fixture ledger carries the same pies the script prints', async t => {
  const root = await project(t, LEDGER);
  const script = JSON.parse(execFileSync(process.execPath, [SCRIPT, '--root', root, '--format', 'json'], { encoding: 'utf8' }));
  const built = buildSnapshot({ root, checklist: CHECKLIST, ledger: LEDGER, now: Date.now() });
  assert.deepEqual(built.progress, script);
  assert.deepEqual(built.progress.pies.map(pie => [pie.n, pie.name, pie.slices.map(s => s.id)]), [
    [4, 'Live Kitchen', ['4.7']],
    [5, 'The Pass', ['5.1', '5.2', '5.3']],
  ]);
  const state = await readKitchenState(root);
  assert.deepEqual(state.progress, script);
});

test('without a ledger progress is an empty list, and the checklist still drives the pies', async t => {
  assert.deepEqual(buildSnapshot({ root: '/fixture', checklist: CHECKLIST, now: 1 }).progress, { pies: [] });
  const state = await readKitchenState(await project(t, null));
  assert.deepEqual(state.progress, { pies: [] });
  assert.equal(state.pies.length, 2);
});

test('a ledger past 1 MiB is read from its newest rows only', async t => {
  const filler = `${JSON.stringify({ v: 1, t: 1, sid: 'old', ev: 'note', pie: 2, slice: '2.1', data: { text: 'x'.repeat(900) } })}\n`;
  const big = filler.repeat(Math.ceil((1024 * 1024 + 4096) / filler.length)) + LEDGER;
  const state = await readKitchenState(await project(t, big));
  assert.ok(state.progress.pies.some(pie => pie.n === 5), 'the newest rows are read');
  const old = state.progress.pies.find(pie => pie.n === 2);
  assert.ok(!old || old.slices[0].notes.length < Math.ceil((1024 * 1024 + 4096) / filler.length), 'the oldest rows past the cap are not');
});

function get(port, url = '/state') {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: url, method: 'GET', timeout: 3000 }, res => {
      let body = '';
      res.setEncoding('utf8'); res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('timeout', () => req.destroy(new Error('timed out'))); req.on('error', reject); req.end();
  });
}

async function freePort() {
  const socket = net.createServer();
  socket.listen(0, '127.0.0.1'); await once(socket, 'listening');
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  return port;
}

test('GET /state from the loopback server includes progress', async t => {
  const root = await project(t, LEDGER);
  const env = { ...process.env, BTS_KITCHEN_PORT: String(await freePort()) };
  const child = spawn(process.execPath, [SERVER, '--project', root, '--serve-only'], { cwd: os.tmpdir(), stdio: ['pipe', 'pipe', 'pipe'], env });
  const exited = once(child, 'exit');
  t.after(async () => { if (child.exitCode === null) child.kill('SIGTERM'); await exited; });
  const portFile = path.join(root, '.claude/.bytheslice-state/kitchen/port');
  let port = 0;
  for (let i = 0; i < 250 && !port; i += 1) {
    try { port = Number((await fs.readFile(portFile, 'utf8')).trim()); } catch { await new Promise(resolve => setTimeout(resolve, 20)); }
  }
  assert.ok(port, 'the server wrote its port');
  const reply = await get(port);
  assert.equal(reply.status, 200);
  const state = JSON.parse(reply.body);
  assert.ok(state.progress.pies.length > 0);
  assert.deepEqual(state.progress.pies.find(pie => pie.n === 5).slices.map(s => s.id), ['5.1', '5.2', '5.3']);
});
