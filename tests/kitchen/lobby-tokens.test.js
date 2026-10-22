// tests/kitchen/lobby-tokens.test.js
// Keeps lobby.html on the kitchen's design tokens: same :root values, the same frosted .pill, and no raw colors outside :root.
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const read = name => fs.readFileSync(path.join(__dirname, '../../skills/open-kitchen', name), 'utf8');
const kitchen = read('kitchen.html');
const lobby = read('lobby.html');
const style = html => /<style>([\s\S]*?)<\/style>/.exec(html)[1];
const rootBlock = html => /:root\s*\{([^}]*)\}/.exec(style(html))[1];
const squash = value => value.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').trim();

/** Every `--name: value;` in the first :root block, values whitespace-normalized. */
function tokens(html) {
  const map = new Map();
  for (const [, name, value] of squash(rootBlock(html)).matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) map.set(name, value.trim());
  return map;
}

/** The declarations of the first `.pill{...}` rule as a property map, var() resolved against `values`. */
function pill(html, values) {
  const body = new RegExp('(?:^|[}\\s])\\.pill\\{([^}]*)\\}').exec(style(html))[1];
  const resolve = value => value.replace(/var\(--([\w-]+)\)/g, (_, name) => {
    assert.ok(values.has(name), `.pill uses --${name}, which :root declares`);
    return values.get(name);
  });
  return Object.fromEntries(body.split(';').map(part => part.trim()).filter(Boolean).map(part => {
    const at = part.indexOf(':');
    return [part.slice(0, at).trim(), resolve(part.slice(at + 1).trim()).replace(/\s+/g, ' ')];
  }));
}

const SHARED = ['cream', 'card', 'ink', 'ink-soft', 'accent', 'accent-soft', 'sage', 'sage-soft', 'mustard', 'mustard-soft',
  'dusty', 'dusty-soft', 'bad', 'bad-soft', 'display', 'body', 'shadow'];

test('lobby.html declares every kitchen :root token with the same value', () => {
  const ours = tokens(lobby), theirs = tokens(kitchen);
  for (const name of SHARED) assert.ok(theirs.has(name), `kitchen.html still declares --${name}`);
  for (const [name, value] of theirs) assert.equal(ours.get(name), value, `--${name} matches kitchen.html`);
  assert.match(rootBlock(lobby), /color-scheme\s*:\s*light/);
});

test('the lobby .pill resolves to the kitchen .pill', () => {
  assert.deepEqual(pill(lobby, tokens(lobby)), pill(kitchen, tokens(kitchen)));
});

test('lobby.html holds no raw color outside its :root block', () => {
  const root = rootBlock(lobby);
  const rest = lobby.replace(root, '');
  const raw = [...rest.matchAll(/#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?)\(/gi)].map(match => match[0]);
  assert.deepEqual(raw, [], 'colors come from tokens only');
  assert.doesNotMatch(lobby, /var\(--[\w-]+\s*,/, 'no var() fallbacks hide a missing token');
});

test('lobby.html sets /state text with textContent, never innerHTML', () => {
  const script = /<script>([\s\S]*?)<\/script>/.exec(lobby)[1];
  assert.doesNotMatch(script, /\.innerHTML|\.outerHTML|insertAdjacentHTML|document\.write/);
});
