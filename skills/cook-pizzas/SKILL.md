---
name: cook-pizzas
description: Cook the pre-made pies before the shop opens — transform a PRD into an ordered roadmap of 20–30 vertical-slice feature stages. Each plan file is one cooked pie sitting in the display case for customers to grab a slice of.
user-invocable: true
triggers: ["/bytheslice:cook-pizzas", "/cook-pizzas", "cook the pizzas", "make the pies", "prep the pies", "/bytheslice:plan-phases", "/plan-phases", "plan phases", "break into phases", "phased plan", "create a development plan", "decompose the prd"]
---

<!-- skills/cook-pizzas/SKILL.md -->
<!-- Pizza-shop framing: cook every pre-made pie that will sit in the display case (each plan file = one pie). PRD-to-master-checklist transformer with stage-writer agents per stage type. -->

# Cook the Pizzas — PRD to Phased Plans

Transform a finalized PRD into a complete, ordered set of implementation stages plus a project rules file.

## Mode detection

`/cook-pizzas` is **always the source of the master checklist**. It writes `docs/plans/00_master_checklist.md` (with the new Prep section) and the feature stage plan files. There is no upstream checklist for it to coordinate with — this skill produces the checklist.

If a master checklist already exists, `/cook-pizzas` refuses to overwrite it and points the user at `/special-order` (for adding features mid-flight) instead.

## Scope

**Input:** a finalized PRD file (output of `/create-menu` or equivalent). Not specs, briefs, questionnaires, or API docs — those feed `/create-menu`.

**Output:**
- `docs/plans/00_master_checklist.md` — includes a top **Prep section** pointing at the foundation skills (`/set-display-case`, `/final-quality-check`, `/open-the-shop`) that the user runs once before any feature stage
- `docs/plans/stage_4_db_schema_foundation.md` (canned, conditional on Q3 = Yes)
- `docs/plans/stage_5..N_<feature>.md` (20-30 vertical-slice feature stages)
- `CLAUDE.md` or `AGENTS.md` (per Q12) — the project rules file

> **v4 change:** `cook-pizzas` no longer emits canned plan files for the design-system, CI/CD, or env-setup foundation stages. Those are now run-once-before-service prep steps invoked directly via `/set-display-case`, `/final-quality-check`, `/open-the-shop`. The master checklist's Prep section is the canonical list. Existing projects with `stage_1_*`, `stage_2_*`, `stage_3_*` plan files still work — `/sell-slice` keeps a legacy routing path for those types.

## Project Config (optional)

Before Phase 1, check for `bytheslice.config.json` at the project root. Honor these keys (see [`skills/setup-shop/references/bytheslice-config-schema.md`](../setup-shop/references/bytheslice-config-schema.md) for the full schema):

- `rules.imports` — when non-empty, **skip Q9** (external rule-file imports) and use these URLs directly
- `stages.targetFeatureStages` — pass to phased-plan-writer to tune the splitter (default `"20-30"`; smaller band = larger slices)
- `stages.maxTasksPerStage` — pass to phased-plan-writer (default `6`; warn if user set `> 8`)
- `mcps.*` — pre-fills Q5 (Supabase MCP) and Q7 (design MCPs) so the elicitation skips already-answered questions

If a config-supplied answer covers a question, log a one-liner ("Q9 answered from bytheslice.config.json — skipping") and move to the next question.

## Phase 1: Context Elicitation

Ask each question with `ask_user_input_v0` before writing any files. Answers build the project rules file section by section.

**Always provide a recommended answer in available options.**

**Q1 — MVP scope**
> "Is this MVP-only (everything ships in Phase 1) or do you want an MVP + Phase 2 split?"
> single_select: ["MVP only — all stages are Phase 1", "MVP + Phase 2 — flag which stages are post-launch"]
> → sets `mvp:` on every stage frontmatter

**Q2 — Master checklist tracking**
> "Where should the master checklist live?"
> single_select: ["Local markdown only", "Mirror to Linear (requires Linear MCP)"]
> → if Linear: confirm Linear MCP is connected; skill writes milestone/issue stubs at the end

**Q3 — Database in scope?**
> Detect from PRD Section 4 (Technical Architecture). Present finding:
> "I see [the PRD indicates / no] database usage. Is a database in scope for this project?"
> single_select: ["Yes — include Stage 4 db-schema-foundation", "No — skip Stage 4"]

**Q4 — Database tooling** (only if Q3 = Yes)
> "Which database tooling?"
> single_select: ["Supabase", "Prisma", "Drizzle", "Other (I'll specify)"]
> → drives schema file format in stage 4 canned template

**Q5 — Supabase MCP installed?** (only if Q4 = Supabase)
> "Is the Supabase MCP installed in this workspace?"
> single_select: ["Yes", "No — I'll set it up manually"]
> → if Yes: appends Supabase security baseline from `references/architecture-conventions.md` to project rules file

**Q7 — Design MCPs**
> "Which design MCPs are available? (These inform the design-system-gate stage and frontend-design skill.)"
> multi_select: ["shadcn MCP", "Magic MCP (21st.dev)", "Figma MCP", "None"]
> → list is written into the project rules file and passed as context to design-system-stage-writer

**Q8 — Architecture variant**
> "Is this a single app or a monorepo?"
> single_select: ["Single app (one deployable at the project root)", "Monorepo (multiple apps + shared packages)"]
> follow-up if monorepo: "Which workspace tooling?" single_select: ["Turborepo + pnpm", "Turborepo + npm", "Nx", "Plain pnpm workspaces", "Other"]
> → reads from `references/architecture-conventions.md` and injects the matching Variant A or B section into the project rules file under `## Architecture Conventions (baseline)`

**Q9 — Project rules to import (code style + internal organization)**
> "Paste any paths or URLs to external rule files you want imported (naming conventions, type-vs-interface preferences, folder organization, server-action patterns, etc.). Leave blank to skip."
> text_input
> → merged into the project rules file under `## Architecture Conventions (project-specific)` with precedence: workflow baseline > project rules > external rules

**Q10 — Auth provider**
> If PRD Section 2 or 4 specifies an auth provider, use that. Otherwise ask:
> "Which auth provider?"
> single_select: ["Clerk", "Auth.js / NextAuth", "Supabase Auth", "Lucia", "None / custom", "Other (I'll specify)"]
> → drives auth feature stage scope; if auth present, phased-plan-writer injects the dev-mode auth helpers task — bundling localhost auto-login (opt-in via `DEV_AUTH_BYPASS`) + seeded-user switcher banner (see `references/canned-stages/auth-dev-mode-switcher-task.md`)

**Q11 — Deployment target**
> "Deployment target? (Default: Vercel)"
> single_select: ["Vercel", "AWS", "Fly.io", "Other (I'll specify)"]

**Q12 — Rules file format**
> "Which project rules file format?"
> single_select: ["CLAUDE.md", "AGENTS.md"]
> → writes the project rules file to the chosen path

After all answers, assemble and write the project rules file before dispatching stage writers.

### Layering precedence (document in project rules file header)

```
Priority 1 (highest): ByTheSlice baseline (web standards, security, framework facts)
Priority 2: project-specific rules (imported via Q9)
Priority 3 (lowest): external rule files
```

## Phase 2: Stage Identification

Read the PRD. Map every feature from Section 2 (Functional Requirements) to stages:

1. Every PRD feature defaults to **≥2 stages**: (a) shell stage — route, layout, empty/loading/error states; (b) data stage — queries, mutations, polish, edge cases
2. Stage count target: **20-30 feature stages** for a typical PRD
3. Mark each stage as MVP (`mvp: true`) or Phase 2 (`mvp: false`) per Q1
4. Present the proposed stage list to the user for approval before writing any files

## Phase 3: Dispatch Stage Writers (parallel)

Dispatch stage-writer sub-agents in parallel. Each writes exactly one file.

| Stage | Sub-agent | Canned? | Condition |
|-------|-----------|---------|-----------|
| 4 (db-schema) | `db-schema-stage-writer` | Yes | Q3 = Yes only |
| 5..N (features) | `phased-plan-writer` | No | One per feature stage |

> **v4 change:** the foundation stages (design-system, ci-cd, env-setup) are no longer emitted as plan files here. They live as standalone, run-once skills (`/set-display-case`, `/final-quality-check`, `/open-the-shop`) referenced from the master checklist's Prep section (Phase 4 below). The legacy writers (`design-system-stage-writer`, `ci-cd-scaffold-stage-writer`, `env-setup-stage-writer`) remain in `agents/` for backward-compat repair on old projects but are NOT dispatched in the v4 flow.

Supply each agent with:
- Stage number, short name, output path, one-sentence goal, `mvp:` flag
- Scope: features/subtasks from stage identification step
- Context: PRD excerpts (or absolute path), tech stack, prior-stage dependencies
- Elicitation answers (Q1–Q12) as context
- Absolute path to the project rules file

## Phase 4: Master Checklist (last)

After ALL stage files are written, dispatch `master-checklist-synthesizer`. It:

1. Writes a top **Prep section** with these run-once checkboxes (always in this order):
   ```
   ## Prep — run once before any feature work
   [ ] Display case built       — run /set-display-case
   [ ] Quality line installed   — run /final-quality-check
   [ ] Shop open                — run /open-the-shop
   [ ] DB schema foundation     — run /sell-slice (handled internally on stage 4)
   ```
   Drop the last line if Q3 = No (no DB).
2. Scans every feature stage file's frontmatter `completion_criteria`
3. Writes the rest of `docs/plans/00_master_checklist.md` — stage rows for 4 (if DB) and 5..N
4. Uses `[ ]` checkbox format (no leading dash)

See `references/templates.md` for the exact checklist template, including the new Prep section format.

## Phase 5: Linear stubs (if Q2 = Linear)

If the user chose Linear mirroring:
1. Create one Linear milestone per stage using the Linear MCP
2. Write milestone IDs back into each stage file's `linear_milestone:` frontmatter field

## Architecture conventions reference

This skill's `references/architecture-conventions.md` is the **opinion-free baseline** injected into every project's rules file. It contains only:
- Universal web standards (WCAG, semantic HTML, browser standards)
- Performance facts (measurable, framework-agnostic)
- Security baselines conditional on stack (Supabase RLS when DB = Supabase)
- Framework-version syntactic facts (e.g., Next.js 16+ async params)
- Structural project variants (Variant A single-app / Variant B monorepo)

Opinionated rules (naming, type-vs-interface, file organization, server-action patterns) are NOT in that file. They enter the project via Q9 (user-imported external rule files) and design-system code patterns. Document this clearly in the project rules file header.

## Output structure

```
docs/
├── plans/
│   ├── 00_master_checklist.md             (Prep section at top, then stages)
│   ├── stage_4_db_schema_foundation.md    (conditional on Q3 = Yes)
│   └── stage_N_<feature>.md               (20-30 feature stages)
└── (existing PRD)
CLAUDE.md or AGENTS.md (per Q12)
```

> The Prep section in the master checklist points the user at the standalone foundation skills (`/set-display-case`, `/final-quality-check`, `/open-the-shop`). Those run once each before any `/sell-slice` invocation. They are NOT plan files; they are skills the user invokes directly.

## Key principles

- **Vertical slices for feature stages**: each stage ships UI + route + data + tests for one user-facing thing
- **Hard cap**: 6 tasks per stage, max ~10-15 files changed, completable in one Claude session
- **One PR per stage**: stages are independently reviewable and mergeable
- **No forward references**: stages may only reference packages, tables, or components built in prior stages
- **Exit criteria are testable AND transcript-verifiable**: every line in a stage's `**Exit criteria:**` block must be something a fast model could verify by reading the conversation alone — a specific command's exit code, a subagent's `verdict: pass`, a captured screenshot, a file path Claude has read. Write "`pnpm test --filter @repo/auth` exits 0" not "tests pass"; write "`quality-reviewer` returned `verdict: pass`" not "code quality is high". This block is the single source of truth that `/bytheslice:sell-slice` Phase 2.5 lifts verbatim into the session-scoped `/goal` condition. See `references/templates.md` → "Exit-criteria contract (consumed by `/goal`)" for the full contract and good/bad examples.
- **Auth stages always get the dev-mode auth helpers task** — one combined task bundling localhost auto-login (opt-in via `DEV_AUTH_BYPASS`) + seeded-user switcher banner; both sub-bullets ship together (see `references/canned-stages/auth-dev-mode-switcher-task.md`)

## Stage frontmatter contract

Every stage file uses the contract in `references/stage-frontmatter-contract.md`. See also `references/templates.md`.

## Completion checklist

[ ] All 12 elicitation questions answered and answers written to project rules file
[ ] Project rules file assembled with correct layering: baseline → Q9 imports → design system patterns
[ ] Stage list presented to user and approved
[ ] Stage 4 (db-schema) plan file written if Q3 = Yes
[ ] All feature stage files written (stages 5..N)
[ ] All stage files include valid YAML frontmatter per `references/stage-frontmatter-contract.md`
[ ] Master checklist generated with Prep section at the top pointing at the foundation skills
[ ] Linear stubs created if Q2 = Linear (linear_milestone fields populated)
[ ] No `- [ ]` checkboxes in generated files (all use `[ ]` format)
[ ] No platform-specific references in generated files (use "project rules file" not "cursor rules")
