// skills/open-kitchen/kitchen-live.test.js
// Verify visible-only snapshot polling, stable delivery hooks, recovery, and gesture-only loopback browser handoff.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, 'kitchen.html'), 'utf8');
const source = html.match(/<script id="kitchen-live">([\s\S]*?)<\/script>/)[1];
const flush = () => new Promise(resolve => setImmediate(resolve));
const state = port => ({ project: { root: '/fixture/project' }, port, cursor: 12, pies: [] });

function viewer({ hidden = false, hostname = '127.0.0.1', fetcher, driver } = {}) {
  const listeners = {};
  const clicks = {};
  const timers = new Map();
  const calls = [];
  const opened = [];
  const events = [];
  const button = { disabled: true, addEventListener: (name, fn) => { clicks[name] = fn; } };
  const document = {
    visibilityState: hidden ? 'hidden' : 'visible',
    getElementById: () => button,
    addEventListener: (name, fn) => { listeners[name] = fn; },
  };
  const window = {
    liveDriver: driver,
    open: (...args) => opened.push(args),
    dispatchEvent: event => events.push(event),
  };
  let timerId = 0;
  vm.runInNewContext(source, {
    document, window, location: { protocol: 'http:', hostname }, AbortController,
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    setTimeout: (fn, delay) => { const id = ++timerId; timers.set(id, { fn, delay }); return id; },
    clearTimeout: id => timers.delete(id),
    fetch: async (...args) => {
      calls.push(args);
      return fetcher ? fetcher(...args) : { ok: true, json: async () => state(4477) };
    },
  });
  return {
    window, button, document, calls, opened, events, timers,
    click: () => clicks.click(),
    visibility: value => { document.visibilityState = value; listeners.visibilitychange(); },
    tick: () => {
      const next = [...timers].find(([, timer]) => timer.delay === 3000);
      assert.ok(next, 'visible polling has a three-second timer');
      timers.delete(next[0]);
      next[1].fn();
    },
  };
}

test('delivers an uncached full snapshot without opening a browser automatically', async () => {
  let delivered;
  const page = viewer({ driver: snapshot => { delivered = snapshot; } });
  await flush();
  assert.equal(page.calls.length, 1);
  assert.equal(page.calls[0][0], '/state');
  assert.equal(page.calls[0][1].cache, 'no-store');
  assert.equal(page.calls[0][1].credentials, 'omit');
  assert.equal(page.calls[0][1].redirect, 'error');
  assert.equal(page.window.kitchenLive.snapshot.port, 4477);
  assert.equal(delivered, page.window.kitchenLive.snapshot);
  assert.equal(page.events[0].type, 'kitchen:state');
  assert.equal(page.events[0].detail, delivered);
  assert.equal(page.button.disabled, false);
  assert.equal(page.opened.length, 0);
  page.click();
  assert.deepEqual(page.opened, [['http://127.0.0.1:4477/', '_blank', 'noopener']]);
});

test('hidden pages make no request and visibility resumes polling immediately', async () => {
  const page = viewer({ hidden: true });
  assert.equal(page.calls.length, 0);
  page.click();
  assert.equal(page.opened.length, 0);
  page.visibility('visible');
  await flush();
  assert.equal(page.calls.length, 1);
  page.tick();
  await flush();
  assert.equal(page.calls.length, 2);
  page.visibility('hidden');
  assert.equal(page.timers.size, 0);
});

test('hiding the page aborts an in-flight request and discards its result', async () => {
  let resolveResponse;
  const page = viewer({ fetcher: () => new Promise(resolve => { resolveResponse = resolve; }) });
  assert.equal(page.calls.length, 1);
  page.visibility('hidden');
  assert.equal(page.calls[0][1].signal.aborted, true);
  resolveResponse({ ok: true, json: async () => state(4477) });
  await flush();
  assert.equal(page.window.kitchenLive.snapshot, null);
  assert.equal(page.timers.size, 0);
});

test('invalid data and failed requests preserve the last valid snapshot and recover', async () => {
  const results = [state(4477), state(0), new Error('offline'), state(4480)];
  const applied = [];
  const page = viewer({
    driver: { applySnapshot: snapshot => applied.push(snapshot) },
    fetcher: async () => {
      const result = results.shift();
      if (result instanceof Error) throw result;
      return { ok: true, json: async () => result };
    },
  });
  await flush();
  for (let index = 0; index < 2; index++) {
    page.tick();
    await flush();
    assert.equal(page.window.kitchenLive.snapshot.port, 4477);
  }
  page.tick();
  await flush();
  assert.equal(page.window.kitchenLive.snapshot.port, 4480);
  assert.equal(applied.length, 2);
  page.click();
  assert.deepEqual(page.opened, [['http://127.0.0.1:4480/', '_blank', 'noopener']]);
});

test('non-loopback mockups do not poll or open an external address', async () => {
  const page = viewer({ hostname: 'example.test' });
  await flush();
  page.click();
  assert.equal(page.calls.length, 0);
  assert.equal(page.opened.length, 0);
  assert.equal(page.timers.size, 0);
});
