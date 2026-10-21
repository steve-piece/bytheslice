// tests/kitchen/kitchen-words.test.js
// Verifies the activity log's plain-words lines: who, their role, the step and the slice, never prompts or final messages.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../../skills/open-kitchen/kitchen.html'), 'utf8');
const source = html.match(/<script id="kitchen-words">([\s\S]*?)<\/script>/)[1];
const window = {}; vm.runInNewContext(source, { window });
const words = window.kitchenWords;
const pies = [{ id: 'pie-5', pie: 5, title: 'The Pass', slices: [
  { number: '5.1', title: 'Pass pane and band' }, { number: '5.2', title: 'Ledger and status tool' }] }];
const ren = { id: 'implementer', name: 'Ren', crew: 'line', type: 'implementer', plugin: true };
const inez = { id: 'slice-verifier', name: 'Inez', crew: 'pass', type: 'slice-verifier', plugin: true };

test('start and finish lines name the person, their role, the step and the slice from the checklist', () => {
  const row = { label: 'P5 S5.2 build: ledger', type: 'bytheslice:implementer', pie: 5, slice: '5.2' };
  assert.equal(words.start({ character: ren, row, pies }), 'Ren (line cook, builds code) started building slice 5.2: ledger and status tool');
  assert.equal(words.finish({ character: ren, row, pies, ok: true }), 'Ren (line cook, builds code) finished building slice 5.2: ledger and status tool');
  assert.equal(words.finish({ character: inez, row: { label: 'P5 S5.1 verify: pass pane', type: 'bytheslice:slice-verifier' }, pies }),
    'Inez (inspector, runs the checks) finished verifying slice 5.1: pass pane and band');
  assert.equal(words.finish({ character: inez, row: { label: 'P5 S5.1 verify: pass pane' }, pies, ok: false }),
    'Inez (inspector, runs the checks) was sent back while verifying slice 5.1: pass pane and band');
});

test('the step falls back to the role and the slice to the row when the label has no tag', () => {
  assert.equal(words.start({ character: inez, row: { label: 'Check everything', type: 'bytheslice:slice-verifier', slice: '5.2', pie: 5 }, pies }),
    'Inez (inspector, runs the checks) started verifying slice 5.2: ledger and status tool');
  assert.equal(words.start({ character: ren, row: { label: 'P5 S5.9 build: new', type: 'implementer' }, pies }),
    'Ren (line cook, builds code) started building slice 5.9', 'an unknown slice still names its number');
});

test('helpers and temps get plain roles, and lines without a slice use the dispatch label', () => {
  const temp = { id: 'helper:pass:1', name: 'Temp 1', crew: 'pass', type: 'general-purpose', plugin: false };
  assert.equal(words.start({ character: temp, row: { label: 'Kitchen fixes: traffic' } }), 'Temp 1 (temp helper for general-purpose) started: Kitchen fixes: traffic');
  assert.equal(words.finish({ character: temp, row: {} }), 'Temp 1 (temp helper for general-purpose) finished work');
  const extra = { id: 'helper:line:1', name: 'line helper 1', crew: 'line', type: 'unknown-agent', plugin: true };
  assert.match(words.start({ character: extra, row: { label: 'P5 S5.2 fix: retry' }, pies }), /^line helper 1 \(line crew, builds code\) started fixing slice 5\.2/);
});

test('only the label, role, step and slice reach the line', () => {
  const row = { label: 'P5 S5.2 build: ledger', prompt: 'PRIVATE_SENTINEL', last_assistant_message: 'PRIVATE_SENTINEL' };
  for (const line of [words.start({ character: ren, row, pies }), words.finish({ character: ren, row, pies })]) assert.equal(line.includes('PRIVATE'), false);
  assert.equal(words.pieOf({ character: ren, row, pies }), 5);
});
