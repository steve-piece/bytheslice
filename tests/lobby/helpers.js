// tests/lobby/helpers.js
// Temp BTS_HOME and fixture-project builders shared by the lobby state and server tests; never touches the real ~/.bytheslice.
'use strict';

const fs = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const CHECKLIST_ACTIVE = `# Master Checklist

## Prep [x]
- [x] Slice 1.1 Display case

## Pie 2 - Done pie [x]
### Slice 2.1 - First [x]
### Slice 2.2 - Second [x]

## Pie 3 - Current [ ]
Status: In progress
### Slice 3.1 - Shipped [x]
### Slice 3.2 - Building [-]
### Slice 3.3 - Later [ ]
`;

const CHECKLIST_DONE = `# Master Checklist

## Pie 1 - Only [x]
### Slice 1.1 - One [x]
### Slice 1.2 - Two [x]
`;

/** A temp base dir (realpath, so /var and /private/var agree) holding a BTS_HOME; removed after the test. */
async function sandbox(t) {
  const base = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'bts-lobby-')));
  t.after(() => fs.rm(base, { recursive: true, force: true }));
  const home = path.join(base, 'home');
  await fs.mkdir(path.join(home, 'signals'), { recursive: true });
  return { base, home };
}

/** A fixture project folder with an optional master checklist and Pass ledger rows. */
async function project(base, name, { checklist = null, ledger = null } = {}) {
  const root = path.join(base, name);
  await fs.mkdir(path.join(root, 'docs/plans'), { recursive: true });
  if (checklist !== null) await fs.writeFile(path.join(root, 'docs/plans/00_master_checklist.md'), checklist);
  if (ledger !== null) {
    await fs.mkdir(path.join(root, '.bytheslice'), { recursive: true });
    await fs.writeFile(path.join(root, '.bytheslice/ledger.jsonl'), ledger.map(row => JSON.stringify(row)).join('\n') + '\n');
  }
  return root;
}

async function register(home, roots) {
  const projects = roots.map((root, index) => ({ root, name: path.basename(root), addedAt: 1000 + index }));
  await fs.writeFile(path.join(home, 'projects.json'), JSON.stringify({ v: 1, projects }));
}

async function signal(home, sid, fields) {
  await fs.writeFile(path.join(home, 'signals', `${sid}.json`),
    JSON.stringify({ v: 1, sid, working: false, subagents: 0, waiting: null, ...fields }));
}

const hitlRows = (raised, answered = []) => [
  ...raised.map((id, index) => ({ v: 1, t: 1000 + index, sid: 'session', ev: 'hitl.raised', pie: 3, slice: '3.2', data: { id } })),
  ...answered.map((id, index) => ({ v: 1, t: 2000 + index, sid: 'session', ev: 'hitl.answered', pie: 3, slice: '3.2', data: { id } })),
];

/** A fake kitchen answering GET /state for `root`, its port written to the project's kitchen port file. */
async function fakeKitchen(t, root, { claimRoot = root } = {}) {
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ port: server.address().port, project: { root: claimRoot } }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const port = server.address().port;
  const dir = path.join(root, '.claude/.bytheslice-state/kitchen');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'port'), `${port}\n`);
  return port;
}

module.exports = { CHECKLIST_ACTIVE, CHECKLIST_DONE, sandbox, project, register, signal, hitlRows, fakeKitchen };
