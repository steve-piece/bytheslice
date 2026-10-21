// tests/kitchen/kitchen-installer.test.js
// Proves copied plugin payloads run the kitchen transport and hooks while skills mode remains selective.
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

const repoRoot = path.resolve(__dirname, '../..');
const cli = path.join(repoRoot, 'bin/bytheslice.js');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

function install(root, extra = []) {
  const result = spawnSync(process.execPath, [cli, 'install', '--mode', 'plugin', '--target', 'both',
    '--claude-dir', path.join(root, 'claude-plugins'), '--cursor-dir', path.join(root, 'cursor-plugins'), ...extra], {
    cwd: root, encoding: 'utf8', timeout: 15000,
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

async function temporary(run) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'kitchen-installer-')));
  try { await run(root); }
  finally { await fs.rm(root, { recursive: true, force: true }); }
  await assert.rejects(fs.access(root));
}

function get(port, route) {
  return new Promise((resolve, reject) => {
    const request = http.get({ hostname: '127.0.0.1', port, path: route, timeout: 2000 }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { body += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, body }));
      response.on('error', reject);
    });
    request.on('error', reject);
    request.on('timeout', () => request.destroy(new Error('Installed kitchen request timed out')));
  });
}

async function runtimeSmoke(pluginRoot, projectRoot, serverArgs) {
  const socket = net.createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const preferredPort = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  const child = spawn(process.execPath, [...serverArgs, '--project', projectRoot], {
    cwd: projectRoot, env: { ...process.env, BTS_KITCHEN_PORT: String(preferredPort) },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let output = '', errors = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { errors += chunk; });
  const exited = once(child, 'exit');
  const portFile = path.join(projectRoot, '.claude/.bytheslice-state/kitchen/port');
  try {
    let port;
    for (let attempt = 0; attempt < 250; attempt++) {
      try { port = Number((await fs.readFile(portFile, 'utf8')).trim()); } catch { /* Not ready. */ }
      if (port) break;
      assert.equal(child.exitCode, null, errors);
      await pause(20);
    }
    assert.ok(port, 'Copied runtime publishes project discovery');
    const page = await get(port, '/');
    assert.equal(page.status, 200);
    assert.equal(page.body, await fs.readFile(path.join(pluginRoot, 'skills/open-kitchen/kitchen.html'), 'utf8'));
    const state = await get(port, '/state');
    assert.equal(state.status, 200);
    const snapshot = JSON.parse(state.body);
    assert.equal(snapshot.project.root, projectRoot);
    assert.equal(snapshot.project.setup, 'built');
    assert.ok(snapshot.active.some(agent => agent.aid === 'installed-cook'));

    const helper = require(path.join(pluginRoot, 'skills/open-kitchen/open-kitchen.js'));
    assert.equal(await helper.ensureKitchen({ projectRoot, timeoutMs: 1000 }), `http://127.0.0.1:${port}/`);

    child.stdin.end([
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: {
        protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'installer-test', version: '1.0.0' },
      } },
      { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'kitchen_state', arguments: {} } },
    ].map(message => JSON.stringify(message)).join('\n') + '\n');
    const [code] = await exited;
    assert.equal(code, 0, errors);
    assert.equal(errors, '');
    const replies = output.trim().split('\n').map(line => JSON.parse(line));
    assert.equal(replies[0].result.serverInfo.name, 'bytheslice-kitchen');
    assert.equal(replies[1].result.structuredContent.project.root, projectRoot);
    assert.ok(replies[1].result.structuredContent.active.some(agent => agent.aid === 'installed-cook'));
    await assert.rejects(fs.access(portFile));
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
    await exited;
  }
}

test('full plugin installs provide self-contained kitchen runtimes for both hosts', { timeout: 30000 }, async () => {
  await temporary(async root => {
    install(root);
    for (const [host, pluginRoot] of [
      ['claude', path.join(root, 'claude-plugins/bytheslice')],
      ['cursor', path.join(root, 'cursor-plugins/local/bytheslice')],
    ]) {
      const manifestDir = host === 'claude' ? '.claude-plugin' : '.cursor-plugin';
      const manifest = JSON.parse(await fs.readFile(path.join(pluginRoot, manifestDir, 'plugin.json'), 'utf8'));
      const logo = await fs.readFile(path.join(pluginRoot, manifest.icon || manifest.logo));
      assert.deepEqual([...logo.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
      const readme = await fs.readFile(path.join(pluginRoot, 'README.md'), 'utf8');
      assert.ok(readme.includes('assets/brand/logo.png'));
      assert.ok(readme.includes('docs/architecture.md'));
      for (const reference of ['assets/brand/logo.png', 'docs/architecture.md', 'docs/agents.md', 'docs/pass-mod-spec.md']) {
        assert.deepEqual(await fs.readFile(path.join(pluginRoot, reference)), await fs.readFile(path.join(repoRoot, reference)));
      }
      await fs.access(path.join(pluginRoot, 'commands/open-kitchen.md'));
      const hooks = JSON.parse(await fs.readFile(path.join(pluginRoot, 'hooks/hooks.json'), 'utf8'));
      for (const groups of Object.values(hooks.hooks)) {
        for (const group of groups) {
          for (const hook of group.hooks) {
            const commandPath = /\$\{CLAUDE_PLUGIN_ROOT\}\/([^"\s]+)/.exec(hook.command)?.[1];
            assert.ok(commandPath, 'Hook command resolves relative to copied plugin');
            await fs.access(path.join(pluginRoot, commandPath));
          }
        }
      }
      // The Pass hooks module ships with the Claude copy only; Cursor reads just the "hooks" key.
      assert.deepEqual(hooks.modules, ['../mod/register.tsx']);
      const passModule = path.join(pluginRoot, 'hooks', hooks.modules[0]);
      if (host === 'claude') await fs.access(passModule);
      else await assert.rejects(fs.access(path.join(pluginRoot, 'mod')));
      const projectRoot = path.join(root, `${host}-project`);
      const stateDir = path.join(projectRoot, '.claude/.bytheslice-state/kitchen');
      await fs.mkdir(stateDir, { recursive: true });
      await fs.mkdir(path.join(projectRoot, 'docs/plans'), { recursive: true });
      await fs.writeFile(path.join(projectRoot, 'docs/plans/00_master_checklist.md'), checklist);
      await fs.writeFile(path.join(stateDir, 'activity.jsonl'), activity.map(row => JSON.stringify(row)).join('\n') + '\n');
      const hookResult = spawnSync('bash', [path.join(pluginRoot, 'hooks/kitchen-log.sh')], {
        cwd: projectRoot, encoding: 'utf8', timeout: 5000,
        env: { ...process.env, CLAUDE_PROJECT_DIR: projectRoot, BTS_HOOKS_DISABLED: '0' },
        input: JSON.stringify({ hook_event_name: 'SubagentStart', session_id: 'current',
          agent_id: 'installed-cook', agent_type: 'bytheslice:implementer', cwd: projectRoot }),
      });
      assert.equal(hookResult.error, undefined);
      assert.equal(hookResult.status, 0);
      assert.equal(hookResult.stdout, '');
      assert.equal(hookResult.stderr, '');
      const rows = (await fs.readFile(path.join(stateDir, 'activity.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line));
      assert.equal(rows.at(-1).aid, 'installed-cook', 'Copied hook resolves its checklist library and writes an event');
      const args = host === 'claude'
        ? manifest.mcpServers.kitchen.args.map(arg => arg.replace('${CLAUDE_PLUGIN_ROOT}', pluginRoot))
        : [path.join(pluginRoot, 'mcp/kitchen-server.js')];
      await runtimeSmoke(pluginRoot, projectRoot, args);
    }
    const repeated = install(root);
    assert.equal((repeated.match(/created: 0/g) || []).length, 2);
    assert.equal((repeated.match(/updated: 0/g) || []).length, 2);
  });
});

test('plugin dry run leaves both explicitly owned destinations absent', async () => {
  await temporary(async root => {
    assert.match(install(root, ['--dry-run']), /Plugin install DRY RUN/);
    await assert.rejects(fs.access(path.join(root, 'claude-plugins')));
    await assert.rejects(fs.access(path.join(root, 'cursor-plugins')));
  });
});

test('skills mode copies selected open-kitchen files and command without full plugin wiring', async () => {
  await temporary(async root => {
    const skillsRoot = path.join(root, 'selected-skills');
    const result = install(root, ['--mode', 'skills', '--skill', 'open-kitchen', '--skills-dir', skillsRoot]);
    assert.match(result, /Skills install APPLIED/);
    await fs.access(path.join(skillsRoot, 'skills/open-kitchen/open-kitchen.js'));
    await fs.access(path.join(skillsRoot, 'commands/open-kitchen.md'));
    for (const missing of ['mcp', 'hooks', 'assets', '.claude-plugin', '.cursor-plugin', 'skills/sell-slice']) {
      await assert.rejects(fs.access(path.join(skillsRoot, missing)));
    }
    const { ensureKitchen } = require(path.join(skillsRoot, 'skills/open-kitchen/open-kitchen.js'));
    await assert.rejects(ensureKitchen({ projectRoot: root }), /Kitchen server is missing from this plugin installation/);
    await assert.rejects(fs.access(path.join(root, 'claude-plugins')));
    await assert.rejects(fs.access(path.join(root, 'cursor-plugins')));
  });
});
