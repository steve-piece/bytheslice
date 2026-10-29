// tests/ui-sources/ui-sources.test.js
// scripts/ui-sources.js offline: the operator's preferences come first and in order, and the directory keeps only healthy, sizeable React registries, best ranked first.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { healthy, preferences, sourceOf } = require('../../scripts/ui-sources.js');

const reg = (name, score, items, rank, extra = {}) => ({
  name,
  url: `https://${name.slice(1)}.dev/r/{name}.json`,
  description: extra.description ?? 'React components',
  health: { status: extra.status ?? 'healthy', score, hidden: false },
  ranking: { score: rank, itemCount: items },
});

test('the directory keeps healthy, sizeable React registries, best ranked first', () => {
  const list = [
    reg('@small', 99, 5, 99),
    reg('@sick', 99, 500, 98, { status: 'degraded' }),
    reg('@low', 80, 500, 97),
    reg('@vue-kit', 99, 500, 96, { description: 'Vue components' }),
    reg('@b', 95, 200, 50),
    reg('@a', 95, 900, 90),
  ];
  assert.deepEqual(healthy(list, 10, null).map(r => r.namespace), ['@a', '@b']);
  assert.deepEqual(healthy(list, 1, null).map(r => r.namespace), ['@a']);
  assert.deepEqual(healthy([...list, reg('@forms', 95, 60, 10, { description: 'Form blocks' })], 10, 'form').map(r => r.namespace), ['@forms']);
});

test('a ui.registries entry is a namespace or an object with an item template', () => {
  assert.deepEqual(sourceOf('@magicui', 'x'), { namespace: '@magicui', from: 'x' });
  assert.equal(sourceOf('magicui', 'x'), null);
  assert.equal(sourceOf({ name: 'kit', item: 'https://k.dev/r/{name}.json' }, 'x').item, 'https://k.dev/r/{name}.json');
});

test('project config wins over defaults, and components.json registries follow', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'bts-ui-home-'));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bts-ui-app-'));
  const prev = process.env.BTS_HOME;
  process.env.BTS_HOME = home;
  try {
    // ui-sources.js reads BTS_HOME at load; reload it for this test.
    delete require.cache[require.resolve('../../scripts/ui-sources.js')];
    const fresh = require('../../scripts/ui-sources.js');
    fs.writeFileSync(path.join(home, 'defaults.json'), '{ "ui": { "registries": ["@defaults-kit"] } }');
    fs.writeFileSync(path.join(root, 'components.json'), JSON.stringify({ registries: { '@acme': 'https://acme.dev/r/{name}.json' } }));
    assert.deepEqual(fresh.preferences(root).sources.map(s => s.namespace), ['@defaults-kit', '@acme']);
    fs.writeFileSync(path.join(root, 'bytheslice.config.json'), '{\n  // mine\n  "ui": { "registries": ["@project-kit"], },\n}');
    assert.deepEqual(fresh.preferences(root).sources.map(s => s.namespace), ['@project-kit', '@acme']);
  } finally {
    if (prev === undefined) delete process.env.BTS_HOME;
    else process.env.BTS_HOME = prev;
  }
});

test('with no preferences there are no operator sources', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bts-ui-empty-'));
  assert.deepEqual(preferences(root).sources.filter(s => s.from !== '~/.bytheslice/defaults.json'), []);
});
