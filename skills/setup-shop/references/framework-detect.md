# Framework Detection — Canonical Reference

Single source of truth for which frontend stacks ByTheSlice supports, how to detect each one, and what their idiomatic paths look like. Every skill that branches on framework (setup-shop, set-display-case, library-route-scaffolder, layout-architect, library-entry-writer) reads this file and matches behavior to the table below — *do not duplicate detection logic in skill prose*.

## Supported stacks (v4.1)

| Stack | Tested end-to-end? | Notes |
|---|---|---|
| Next.js (App Router) | ✅ Primary | Full coverage across `/setup-shop`, `/set-display-case`, `/sell-slice` frontend pipeline |
| Next.js (Pages Router) | ⚠️ Detection only | Bootstrap + design-system work; Phase 4.5 library-preview templates not yet adapted — bubble HITL |
| Vite + React | ⚠️ Detection only | Same — library-preview templates not yet adapted |
| SvelteKit | ⚠️ Detection only | Same |
| Astro | ⚠️ Detection only | Same |
| Plain Node API (no UI) | ✅ Backend stages only | Frontend pipeline auto-skips; `/sell-slice` runs `backend` / `db-schema` / `infrastructure` stages normally |
| Other | ❌ | Bubble HITL `prd_ambiguity` asking the user to pick one of the above |

"Tested end-to-end" means the foundation skills run without HITL bubbles. "Detection only" means bytheslice will recognize the stack and run agnostic stages, but the Phase 4.5 library-preview templates assume Next App Router until per-framework adapters land.

## Detection algorithm

Run in this order; first match wins:

1. Check `package.json` `dependencies` and `devDependencies`:

   | Dep present | Stack |
   |---|---|
   | `next` + `app/` directory exists | `next-app` |
   | `next` + `pages/` directory exists, no `app/` | `next-pages` |
   | `@sveltejs/kit` | `sveltekit` |
   | `astro` | `astro` |
   | `vite` + `react` (or `react-dom`) | `vite-react` |
   | none of the above, but `express` / `fastify` / `koa` / `hono` | `node-api` |

2. If `package.json` ambiguous, fall back to config files:

   | File at repo root | Stack |
   |---|---|
   | `next.config.{js,mjs,ts}` | `next-app` or `next-pages` (re-check directory) |
   | `svelte.config.{js,mjs,ts}` | `sveltekit` |
   | `astro.config.{mjs,ts}` | `astro` |
   | `vite.config.{js,mjs,ts}` (no Next/Svelte/Astro) | `vite-react` |

3. Monorepos (`turbo.json` or `pnpm-workspace.yaml`): run the algorithm per-app under `apps/*` and return a map `{ [app-path]: stack }`. Each app stands on its own.

4. If nothing matches: return `unknown` and bubble HITL `prd_ambiguity` asking the user which stack applies.

## Per-stack path map

The canonical paths each stack uses. Skills should read this map instead of hardcoding.

| Stack | CSS entry | Library route location | Theme primitive | Page-file convention |
|---|---|---|---|---|
| `next-app` | `app/globals.css` or `src/app/globals.css` | `app/(<group>)/library/` or `app/library/` | `next-themes` | `page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx` |
| `next-pages` | `styles/globals.css` | `pages/library/index.tsx` | `next-themes` | `pages/<route>.tsx` + `_app.tsx` |
| `vite-react` | `src/index.css` or `src/main.css` | depends on router — `src/routes/library/` (react-router v6+ file-based) or a `<Library/>` route in `App.tsx` | custom (CSS class on `<html>`) or `next-themes`-style hook | depends on routing choice |
| `sveltekit` | `src/app.css` | `src/routes/library/+page.svelte` | `mode-watcher` or custom | `+page.svelte` + `+layout.svelte` |
| `astro` | `src/styles/global.css` | `src/pages/library.astro` | `astro-themes` or custom | `.astro` files with frontmatter |
| `node-api` | n/a | n/a | n/a | n/a |

## Bootstrap scaffolder per stack

For `/setup-shop` Step 1 Phase 2 (Q-bootstrap-stack):

| Stack | Scaffold command |
|---|---|
| `next-app` | `pnpm dlx create-next-app@latest <name> --typescript --app --tailwind --turbopack --eslint --import-alias "@/*" --use-pnpm` |
| `vite-react` | `pnpm create vite@latest <name> -- --template react-ts` then `pnpm add -D tailwindcss postcss autoprefixer && pnpm dlx tailwindcss init -p` |
| `sveltekit` | `pnpm create svelte@latest <name>` (interactive — accept defaults: skeleton + TS + Tailwind add-on) |
| `astro` | `pnpm create astro@latest <name> -- --template minimal --typescript strict --no-install --no-git` then `pnpm add -D @astrojs/tailwind && pnpm astro add tailwind` |
| `node-api` | `pnpm init` + the user's framework of choice (express / hono / fastify) — bytheslice does not opinionate the API framework |

## Where each skill branches on stack

| Skill | What changes per stack |
|---|---|
| `/setup-shop` Step 1 | Bootstrap scaffolder command (table above) |
| `/set-display-case` Step 3 | CSS entry path (table above) |
| `/set-display-case` Step 6 (library-route-scaffolder) | Route location, page-file extension, theme primitive |
| `/sell-slice` Phase 4 frontend pipeline (layout-architect, library-entry-writer) | Page-file convention. **Bubble HITL for non-`next-app` stacks until per-framework templates land** (Tier L work) |
| `/inspect-display` (platform-walker) | Already framework-aware; uses framework-specific route globs |
| `/final-quality-check` (framework-detector) | Already framework-aware for E2E selection |

## How to add a new stack

1. Add the row to the **Supported stacks** table above with a realistic "tested?" status.
2. Add detection signals to **Detection algorithm**.
3. Add the path map row.
4. Add a scaffolder command (or document why one is intentionally omitted).
5. Walk the **Where each skill branches** table and add per-skill behavior — at minimum the HITL fallback if templates aren't ready.

A new stack does not require touching skill prose — it requires touching this file and (eventually) the per-skill adapter logic.
