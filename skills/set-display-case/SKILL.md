---
name: set-display-case
description: Build the display case the pies will sit in — bootstrap your design system: tokens, Tailwind config, design rules, and the operator-only /library preview route. Run once before /sell-slice; also invocable standalone on any project.
user-invocable: true
triggers: ["/bytheslice:set-display-case", "/set-display-case", "set up the display case", "install the design system", "/bytheslice:init-design-system", "/init-design-system", "scaffold design system", "design-system stage"]
---

<!-- skills/set-display-case/SKILL.md -->
<!-- Daily-prep skill (run before /sell-slice). Pizza-shop framing: builds the display case every pre-made pie will sit in — tokens, Tailwind config, the /library preview route. Validates or generates a complete design system; runs standalone on any project (mode-detected). -->

# Set the Display Case — Design System Foundation

Validate or generate a complete design system before any feature work. Outputs canonical token files, writes design-system rules into the project rules file, and scaffolds the operator-only `/library` preview route.

This is a **daily-prep skill** — part of the run-once foundation phase that runs before any feature delivery. Also fully invocable standalone (no master checklist required) to bolt a design system onto any project. Mode is auto-detected from disk state.

---

## Mode detection

This skill runs in one of two modes, auto-detected at startup:

- **Standalone** — no `docs/plans/00_master_checklist.md` at the project root. Bolts a design system onto any project. Runs end-to-end, produces token files + Tailwind config + `/library` route, exits. No checklist coordination, no Prep-checkbox flip.
- **Sequential** — master checklist exists with a `## Prep` section. On completion, flip the `[ ] Display case built` row to `[x]` and surface: *"Display case ready. Next prep step: `/final-quality-check`."*

Honor an explicit `--standalone` or `--sequential` flag if passed; otherwise auto-detect from disk state.

## Reference Files

Read all of these before beginning:

| File | Purpose |
| --- | --- |
| [references/token-checklist.md](references/token-checklist.md) | Canonical token categories — gate blocks until all satisfied |
| [references/globals-css-template.md](references/globals-css-template.md) | Template for the project's CSS entry file (path detected via framework-detect.md, e.g. `app/globals.css` / `src/index.css` / `src/app.css` / `src/styles/global.css`) |
| [references/tailwind-config-template.md](references/tailwind-config-template.md) | Template for `tailwind.config.ts` output |
| [references/design-system-md-template.md](references/design-system-md-template.md) | Template for `docs/design-system.md` output |
| [references/claude-md-rules-block.md](references/claude-md-rules-block.md) | Rules block to append to the project rules file |
| [`../setup-shop/references/framework-detect.md`](../setup-shop/references/framework-detect.md) | Canonical stack list + per-framework CSS entry path. Read this before Step 1 so the right CSS path is detected without hardcoding `app/globals.css`. |

## Subagent Roster

| Step | Agent file | Model | Effort | Mode |
| --- | --- | --- | --- | --- |
| Mode A — Step 1 | [agents/bundle-validator.md](agents/bundle-validator.md) | sonnet | medium | readonly |
| Mode B — Step 1 | [agents/token-expander.md](agents/token-expander.md) | opus | high | write |
| Step 2 (always) | [agents/compliance-pre-check.md](agents/compliance-pre-check.md) | haiku | low | readonly |
| Step 6 (always) | [agents/library-route-scaffolder.md](agents/library-route-scaffolder.md) | sonnet | medium | write |

---

## Project Config (optional)

Honor these `bytheslice.config.json` keys when present (see [`skills/setup-shop/references/bytheslice-config-schema.md`](../../setup-shop/references/bytheslice-config-schema.md)):

- `mcps.shadcn`, `mcps.figma`, `mcps.magic` — declarative MCP availability for the bundle-validator and token-expander agents
- `modelTiers.tokenExpander`, `modelTiers.bundleValidator`, `modelTiers.compliancePreCheck` — override agent model tiers for THIS run

---

## Two Input Modes

### Mode A — Bundle-First (preferred)

The user has run a Claude Design session at `claude.ai/design` and provides a design bundle folder. Reference example: `https://github.com/steve-piece/Modern-Refactor-Design-System`.

**Detection:** Look for one of these indicators:
- A folder path the user provides containing CSS variables, a Tailwind config, or a design token JSON
- A GitHub URL pointing to a design system export
- Explicit statement that a Claude Design session was completed

**Flow:**
1. Read the bundle folder (dispatch `agents/bundle-validator.md`)
2. Validate token completeness (dispatch `agents/compliance-pre-check.md`)
3. If gaps found: report missing categories → prompt user to fill them via `ask_user_input_v0`
4. Canonicalize file paths and write output artifacts
5. Capture project-specific code patterns (Step 4 below)
6. Append rules block to project rules file
7. Copy bundle into `docs/design-bundle/` as audit trail

### Mode B — Brief-First (fallback)

No bundle provided. Skill generates the token system from a brand brief.

**Detection:** No bundle folder, no design export — only a brand description, colors, or a quick brief.

**Flow:**
1. Collect brand brief from user if not already in context (via `ask_user_input_v0`)
2. Dispatch `agents/token-expander.md` (opus, high effort) to generate a complete token system
3. Surface the generated token system to the user for approval via `ask_user_input_v0`
4. If user requests changes: apply them and re-surface (cap at 2 rounds; third round → HITL `creative_direction`)
5. Dispatch `agents/compliance-pre-check.md` to verify completeness on the approved tokens
6. Write output artifacts from approved token set
7. Capture project-specific code patterns (Step 4 below)
8. Append rules block to project rules file

---

## Step 1 — Detect Mode and Gather Inputs

Determine which mode applies from context. If ambiguous, ask:

> "Do you have a Claude Design export or existing design bundle to validate? Or should I generate the token system from a brand brief?"

Collect:
- **Bundle path** (Mode A) OR **brand brief** (Mode B) — required
- **Project rules file path** — CLAUDE.md or AGENTS.md (from `cook-pizzas` Q12, or ask)
- **Detected stack and CSS entry path** — run the detection algorithm from [`../setup-shop/references/framework-detect.md`](../setup-shop/references/framework-detect.md). The CSS entry path varies by stack: `app/globals.css` (next-app), `styles/globals.css` (next-pages), `src/index.css` (vite-react), `src/app.css` (sveltekit), `src/styles/global.css` (astro). If detection returns `unknown`, ask the user.
- **App shell?** — does the project include a sidebar/nav shell? (determines whether sidebar tokens are required)

---

## Step 2 — Token Validation Gate

Dispatch `agents/compliance-pre-check.md` after collecting or generating tokens.

The gate **refuses to complete** until every required token category from `references/token-checklist.md` is satisfied. No partial passes.

If any category is missing:
- Report which categories are absent with their required token names
- In Mode A: prompt the user to provide the missing values
- In Mode B: loop `token-expander` for the missing categories (counts toward the 2-round cap)

Do not proceed to artifact writing until `compliance-pre-check` returns `status: pass`.

---

## Step 3 — Write Output Artifacts

Once the gate passes, write these files in the target project:

| Artifact | Path | Notes |
| --- | --- | --- |
| CSS token file | per detected stack (see [`framework-detect.md`](../setup-shop/references/framework-detect.md)) | `app/globals.css` (next-app) / `styles/globals.css` (next-pages) / `src/index.css` (vite-react) / `src/app.css` (sveltekit) / `src/styles/global.css` (astro) |
| Tailwind config | `tailwind.config.ts` | Token bindings; extends theme |
| Design system doc | `docs/design-system.md` | Canonical human-readable reference |
| Bundle audit trail | `docs/design-bundle/` | Mode A only — copy of the Claude Design export |

Use the templates in `references/` as the structural basis. Fill in project-specific values.

---

## Step 4 — Capture Project-Specific Code Patterns

Prompt the user for these visual code patterns using `ask_user_input_v0`. Ask only if relevant to the project type (e.g., skip numeric column treatment for a marketing site). Present as `single_select` where possible.

**Always provide a recommended answer in available options.**

**Q-A — Variant library**
> "Which variant utility library will you use for component variants?"
> single_select: ["CVA (class-variance-authority)", "tv (tailwind-variants)", "None — plain className logic"]

**Q-B — Status indicator pattern**
> "How should status/state indicators look throughout the UI?"
> single_select: ["Soft pill badges", "Outlined badges", "Icon-only indicators", "None yet — decide per component"]

**Q-C — Numeric column treatment** (skip for marketing sites)
> "How should numbers in data tables be rendered?"
> single_select: ["tabular-nums (fixed-width, aligned)", "Proportional (default)", "No data tables in this project"]

**Q-D — Icon library**
> "Which icon library?"
> single_select: ["Lucide", "Phosphor", "Radix Icons", "Heroicons", "Custom / project-specific"]

**Q-E — Default text size for data-dense UI** (skip for marketing sites)
> "What default text size for data-dense views (tables, sidebars, forms)?"
> single_select: ["text-sm (14px)", "text-base (16px)", "No data-dense UI in this project"]

**Rules for code-pattern capture:**
- If the user answers "None yet", "No data tables", "No data-dense UI", or an equivalent non-answer: **omit that entry from the rules block entirely**. Do not invent defaults.
- Only the explicitly chosen patterns are written into the "Project-specific code patterns" subsection.

---

## Step 5 — Append Rules Block to Project Rules File

Read `references/claude-md-rules-block.md` as the template. Fill in:
- Token catalog path: `docs/design-system.md`
- Project-specific code patterns from Step 4 (only the answered ones)

Append the completed block to the project rules file (CLAUDE.md or AGENTS.md). Do not overwrite existing content — append only.

---

## Step 6 — Scaffold the `/library` Preview Route

Dispatch [`agents/library-route-scaffolder.md`](agents/library-route-scaffolder.md). Pass:
- Project root path
- **Detected stack** (one of: `next-app`, `next-pages`, `vite-react`, `sveltekit`, `astro`, `unknown`) — from [`framework-detect.md`](../setup-shop/references/framework-detect.md). The scaffolder uses this to pick the right route convention and theme primitive.
- Detected route-entry directory (per stack — `app/` for next-app, `pages/` for next-pages, `src/routes/` for sveltekit, etc.)
- `docs/design-system.md` path
- CSS entry path (per detected stack)
- Project rules file path
- Theme primitive already installed? (read from `package.json` — `next-themes` for Next, `mode-watcher` for SvelteKit, custom class-based for Vite + React, etc.)

The agent generates an operator-only Storybook-like preview route at `app/(dashboard)/library/` (or the detected route-group equivalent — falls back to `app/library/` if no route groups exist). The route uses **`?tab=<id>` query-param routing**: one page route reads `searchParams.tab`, validates it against a typed `LIBRARY_TABS` tuple, and dispatches to the matching component from a `STORIES` registry. Each entry is **one file** under `_entries/<id>-entry.tsx` (no folder-per-entry). Adding a new entry means appending in three places — `LIBRARY_TABS`, `STORIES`, and `entries` (sidebar metadata) — and TypeScript enforces that the tuple and the dispatch map stay in lockstep (`Record<LibraryTab, ComponentType>`).

The route renders:
- Left sidebar: search input + entry list. Each row is `<Link href="/library?tab=<id>">`.
- Main pane: the selected entry's variants and states (default / hover / focus / disabled / loading / empty / error / populated).
- Sidebar bottom rail: a Sun/Moon theme toggle (`aria-label="Toggle theme"`, persisted across reloads via `next-themes` or the project's existing theme primitive).
- **Source-path copy buttons** next to every page H1 and every state H3 — click writes a Markdown link to the clipboard (e.g. `[Disabled](components/ui/button.tsx:42-58)`), so when the operator pastes the payload into a Claude Code chat it renders as a clickable link to the exact file (and optional line range) they want changed. The button is a one-file client island (`_components/entry-source-copy.tsx`) used by the server-renderable `<EntryHeader>` / `<EntrySection>` helpers in `_components/entry-frame.tsx`.

The agent also **audits and excludes the route from every navigation surface**: app-sidebar, top-nav, mobile sheet, breadcrumbs, `app/sitemap.ts` (or `sitemap.xml`), `robots.txt` (or `app/robots.ts`), and any `<Link href="/library">` references in production code.

The route is seeded with one example entry — `buttons` (visited at `/library?tab=buttons`, the default tab) — rendering every variant from the design-system rules across every state, with the source-path affordance wired through. Subsequent components are added by `library-entry-writer` during `/sell-slice` Phase 4.5 (Library Preview Gate); every new or modified entry follows the same `EntryHeader sourcePath=… / EntrySection sourcePath=… sourceLines=…` convention.

If the agent surfaces an HITL bubble (existing `/library` route, multiple parallel route groups, pages-router project, or stray internal links to `/library`), bubble it up via this skill's return contract. Do not silently overwrite production routes or guess at navigation conventions.

---

## Step 7 — Return Contract

After all artifacts are written and the rules block is appended, return:

```yaml
status: complete | failed | needs_human
summary: <one paragraph — mode used, token categories validated, artifacts written, rules block appended>
artifacts:
  - <path to globals.css written>
  - <path to tailwind.config.ts written>
  - docs/design-system.md
  - docs/design-bundle/ (Mode A only)
  - <path to project rules file updated>
needs_human: false | true
hitl_category: null | "prd_ambiguity" | "external_credentials" | "destructive_operation" | "creative_direction"
hitl_question: null | "<plain-language question if blocked>"
hitl_context: null | "<what triggered this>"
```

**HITL triggers for this skill:**
- Token completeness cannot be resolved after 2 rounds (Mode B) → `creative_direction`
- User provides conflicting brand direction → `creative_direction`
- Bundle path does not exist or cannot be read → `needs_human: true`, `hitl_category: prd_ambiguity`

This skill does NOT call `ask_user_input_v0` for HITL resolution — it bubbles up the structured contract and the orchestrator (or standalone skill at end-of-turn) prompts the user.

---

## Completion Checklist

[ ] Input mode determined (bundle-first or brief-first)
[ ] Bundle validated OR token system generated and user-approved
[ ] `compliance-pre-check` returned `status: pass` for all token categories
[ ] Sidebar tokens included if project has an app shell
[ ] Dark mode tokens defined for every color token
[ ] `app/globals.css` (or `src/app/globals.css`) written with all token definitions
[ ] `tailwind.config.ts` written with token bindings
[ ] `docs/design-system.md` written with canonical token reference
[ ] `docs/design-bundle/` populated (Mode A only)
[ ] Project-specific code patterns captured (only non-null answers written)
[ ] Design-system rules block appended to project rules file (CLAUDE.md or AGENTS.md)
[ ] `/library` route generated with `?tab=<id>` query-param routing and rendering at least one example entry
[ ] `_registry/tabs.ts` (`LIBRARY_TABS` + `LibraryTab` + `isLibraryTab`), `_registry/entries.ts` (sidebar metadata), and `_registry/stories.tsx` (`STORIES: Record<LibraryTab, ComponentType>`) all scaffolded and TypeScript-coherent
[ ] `<EntryHeader>` / `<EntrySection>` / `<EntryStage>` server helpers + `<EntrySourceCopy>` client island scaffolded in `_components/`
[ ] Seed Buttons entry lives at `_entries/buttons-entry.tsx`, declares a `SOURCE` const, and passes it through `<EntryHeader sourcePath=…>` and every `<EntrySection sourcePath=…>` so the page H1 and every state H3 render a working copy-Markdown-link button
[ ] `/library` excluded from every navigation surface (sidebar, top nav, mobile sheet, sitemap, robots)
[ ] Theme toggle present at sidebar bottom and persists across reloads
[ ] No `- [ ]` checkbox syntax used in any output file — only `[ ]`
[ ] No platform-specific bare references ("cursor rules", "claude rules") in any output
[ ] Return contract YAML emitted

---

## Open Items / Known Limitations

- **The `/library` route is operator-only.** It is intentionally excluded from every navigation surface and from sitemap/robots. If multi-tenancy is added to the project later, gate the route behind a feature flag or a `NEXT_PUBLIC_ENABLE_LIBRARY` env var to prevent end-tenant access. The route's `layout.tsx` and `page.tsx` carry a top-of-file comment documenting this.
- **App Router only.** The library-route-scaffolder targets the Next.js App Router (`app/` or `src/app/`). Pages-router projects bubble HITL `prd_ambiguity` instead of generating a route.
