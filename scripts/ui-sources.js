#!/usr/bin/env node
// scripts/ui-sources.js
// Resolves where the UI phase looks for pre-built components, blocks and pages: the operator's own registry preferences first (bytheslice.config.json or ~/.bytheslice/defaults.json `ui.registries`, then the project's components.json `registries`), and otherwise the public shadcn registry directory (https://ui.shadcn.com/r/registries.json), keeping its healthy, highest-ranked registries. Prints JSON: the ordered sources and the exact `npx shadcn search` command to run over them. Read-only apart from a one-day cache of the directory.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const DIRECTORY = 'https://ui.shadcn.com/r/registries.json';
const HOME = process.env.BTS_HOME || path.join(os.homedir(), '.bytheslice');
const CACHE = path.join(HOME, 'cache', 'shadcn-registries.json');
const CACHE_MS = 24 * 60 * 60 * 1000;
/** How many directory registries a search covers when the operator named none. */
const DEFAULT_TOP = 25;
/** The lowest directory health score kept. */
const MIN_HEALTH = 90;
/** Directory registries smaller than this are left out of a default search (single-purpose kits). */
const MIN_ITEMS = 30;

/** Parses JSONC: comments and trailing commas dropped outside strings. */
function parseJsonc(text) {
  let out = '';
  let str = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (str) {
      out += c;
      if (c === '\\') out += text[(i += 1)] ?? '';
      else if (c === '"') str = false;
    } else if (c === '"') {
      str = true;
      out += c;
    } else if (c === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i += 1;
      out += '\n';
    } else if (c === '/' && text[i + 1] === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i += 1;
      i += 1;
    } else out += c;
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, '$1'));
}

function readJsonc(file) {
  try {
    return parseJsonc(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/** A `ui.registries` entry as a source: a namespace string (`@magicui`) or `{ name, item, catalog?, theme?, notes? }`. */
function sourceOf(entry, from) {
  if (typeof entry === 'string' && /^@[\w.-]+$/.test(entry.trim())) return { namespace: entry.trim(), from };
  if (entry && typeof entry === 'object' && typeof entry.item === 'string') {
    return {
      name: entry.name ?? entry.item,
      namespace: typeof entry.namespace === 'string' ? entry.namespace : null,
      item: entry.item,
      ...(entry.catalog ? { catalog: entry.catalog } : {}),
      ...(entry.theme ? { theme: entry.theme } : {}),
      ...(entry.notes ? { notes: entry.notes } : {}),
      from,
    };
  }
  return null;
}

/** The operator's own preferences, in precedence order: project config, machine defaults, components.json. */
function preferences(root) {
  const sources = [];
  let ui = {};
  for (const [file, from] of [
    [path.join(root, 'bytheslice.config.json'), 'bytheslice.config.json'],
    [path.join(HOME, 'defaults.json'), '~/.bytheslice/defaults.json'],
  ]) {
    const config = readJsonc(file);
    if (!config?.ui) continue;
    ui = { ...config.ui, ...ui };
    if (Array.isArray(config.ui.registries) && config.ui.registries.length > 0 && sources.length === 0) {
      for (const entry of config.ui.registries) {
        const source = sourceOf(entry, from);
        if (source) sources.push(source);
      }
    }
  }
  const components = readJsonc(path.join(root, 'components.json'));
  for (const [namespace, value] of Object.entries(components?.registries ?? {})) {
    if (sources.some(s => s.namespace === namespace)) continue;
    const item = typeof value === 'string' ? value : value?.url;
    if (typeof item === 'string') sources.push({ name: namespace, namespace, item, from: 'components.json' });
  }
  return { sources, ui };
}

async function directory(refresh) {
  try {
    if (!refresh && Date.now() - fs.statSync(CACHE).mtimeMs < CACHE_MS) return JSON.parse(fs.readFileSync(CACHE, 'utf8'));
  } catch {
    // No usable cache: fetch below.
  }
  const response = await fetch(DIRECTORY, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`${DIRECTORY} answered ${response.status}`);
  const list = await response.json();
  fs.mkdirSync(path.dirname(CACHE), { recursive: true });
  fs.writeFileSync(CACHE, JSON.stringify(list));
  return list;
}

/** The directory's healthy registries, best ranked first; `match` keeps those whose name or description contains a word of it. */
function healthy(list, top, match) {
  const words = (match ?? '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(w => w.length > 2);
  return list
    .filter(r => r?.health?.status === 'healthy' && !r.health.hidden && (r.health.score ?? 0) >= MIN_HEALTH && (r.ranking?.itemCount ?? 0) >= MIN_ITEMS && typeof r.name === 'string')
    // React projects only: kits for other frameworks would install code the app cannot use.
    .filter(r => !/\b(?:vue|svelte|angular|solid|qwik|nuxt|astro)\b/i.test(`${r.name} ${r.description ?? ''}`))
    .filter(r => words.length === 0 || words.some(w => `${r.name} ${r.description ?? ''}`.toLowerCase().includes(w)))
    .sort((a, b) => (b.ranking?.score ?? 0) - (a.ranking?.score ?? 0) || (b.ranking?.itemCount ?? 0) - (a.ranking?.itemCount ?? 0))
    .slice(0, top)
    .map(r => ({ namespace: r.name, item: r.url, homepage: r.homepage, description: r.description, items: r.ranking?.itemCount ?? null, from: 'shadcn directory' }));
}

function args(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const m = /^--([\w-]+)$/.exec(argv[i]);
    if (m) out[m[1]] = argv[i + 1] !== undefined && !argv[i + 1].startsWith('--') ? argv[(i += 1)] : true;
    else if (out._ === undefined) out._ = argv[i];
  }
  return out;
}

async function main(argv) {
  const opts = args(argv);
  const root = path.resolve(opts.root ?? opts._ ?? process.cwd());
  const { sources, ui } = preferences(root);
  const out = { root, policy: '', sources, directory: DIRECTORY };
  const useDirectory = opts['no-directory'] !== true && ui.useDirectory !== false;
  if (sources.length > 0) {
    out.policy = 'operator preferences first, then the shadcn directory';
  } else {
    out.policy = 'no operator preference: the shadcn directory';
  }
  if (useDirectory) {
    try {
      const top = Number(opts.top ?? ui.directoryTop ?? DEFAULT_TOP);
      const kept = healthy(await directory(opts.refresh === true), top, typeof opts.match === 'string' ? opts.match : null);
      for (const r of kept) if (!out.sources.some(s => s.namespace === r.namespace)) out.sources.push(r);
    } catch (error) {
      out.directoryError = String(error.message ?? error).split('\n')[0];
    }
  }
  const namespaces = out.sources.filter(s => s.namespace).map(s => s.namespace);
  out.search =
    namespaces.length === 0
      ? null
      : `npx shadcn@latest search ${namespaces.join(' ')} -q "<surface>" -t block,ui --json`;
  out.install = 'npx shadcn@latest add <addCommandArgument from the search, or the full item URL> --yes (pipe `yes n |` in front so a no-TTY overwrite prompt never aborts it; never --overwrite)';
  process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
}

if (require.main === module) {
  main(process.argv.slice(2)).catch(error => {
    process.stderr.write(`ui-sources: ${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = { healthy, preferences, sourceOf, parseJsonc };
