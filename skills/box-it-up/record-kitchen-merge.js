// skills/box-it-up/record-kitchen-merge.js
// Records one confirmed pie PR merge as bounded local kitchen evidence without retaining PR payloads.
'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

async function recordKitchenMerge({ root, mode, pie, confirmation, now = Date.now() }) {
  if (mode !== 'pie') throw new TypeError('Merge evidence is only written in pie mode');
  if (!Number.isSafeInteger(pie) || pie <= 0) throw new TypeError('A positive pie number is required');
  const mergedAt = typeof confirmation?.mergedAt === 'string' &&
    /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(confirmation.mergedAt)
    ? Date.parse(confirmation.mergedAt) : NaN;
  if (confirmation?.state !== 'MERGED' || !Number.isSafeInteger(confirmation.number) || confirmation.number <= 0 ||
      !Number.isSafeInteger(mergedAt) || mergedAt < 0 || mergedAt > now) throw new TypeError('A confirmed MERGED PR with number and merge time is required');
  const project = path.resolve(root || process.env.CLAUDE_PROJECT_DIR || process.cwd());
  const dir = path.join(project, '.claude/.bytheslice-state/kitchen');
  const record = { v: 1, pie, pr: confirmation.number, mergedAt };
  await fs.mkdir(dir, { recursive: true });
  const temp = path.join(dir, `.merged-pie-${process.pid}.tmp`);
  try {
    await fs.writeFile(temp, JSON.stringify(record) + '\n', { mode: 0o600 });
    await fs.rename(temp, path.join(dir, 'merged-pie.json'));
  } finally { await fs.rm(temp, { force: true }); }
  return record;
}

async function main() {
  const args = process.argv.slice(2), allowed = new Set(['--mode', '--pie', '--project']);
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    if (!allowed.has(args[index]) || !args[index + 1] || options[args[index]] !== undefined) throw new TypeError('Expected --mode pie --pie N [--project ROOT]');
    options[args[index]] = args[index + 1];
  }
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
    if (Buffer.byteLength(input) > 512) throw new RangeError('Merge confirmation exceeds 512 bytes');
  }
  await recordKitchenMerge({ root: options['--project'], mode: options['--mode'], pie: Number(options['--pie']), confirmation: JSON.parse(input) });
}

if (require.main === module) main().catch(error => { console.error(error.stack || String(error)); process.exitCode = 1; });
module.exports = { recordKitchenMerge };
