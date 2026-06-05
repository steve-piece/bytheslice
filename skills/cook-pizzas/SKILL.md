---
name: cook-pizzas
description: Cook the pre-made pies before the shop opens — transform a PRD into an ordered roadmap of vertical-slice features, grouped into 3–8-slice Pies. Each Pie is a coherent chapter that bakes autonomously; each Slice is one vertical deliverable. Adds `--repie` to convert a flat v4 checklist into Pies on explicit opt-in.
user-invocable: true
triggers: ["/bytheslice:cook-pizzas", "/cook-pizzas", "cook the pizzas", "make the pies", "prep the pies", "/bytheslice:plan-phases", "/plan-phases", "plan phases", "break into phases", "phased plan", "create a development plan", "decompose the prd", "repie", "re-pie", "convert flat checklist to pies"]
---

<!-- skills/cook-pizzas/SKILL.md -->
<!-- Pizza-shop framing: cook every pre-made pie that will sit in the display case. v5 two-level decomposition — PRD → Pies (coherent 3–8-slice chapters) → Slices (vertical deliverables). Parallel slice writers run as a schema-validated Workflow; --repie converts a flat v4 checklist on explicit opt-in. -->

# Cook the Pizzas — PRD to Pie/Slice Roadmap

Transform a finalized PRD into a complete, ordered roadmap of **Pies** (coherent 3–8-slice chapters) and **Slices** (vertical deliverables), plus a project rules file. A pie is the unit of `/sell-pie` autonomy, the HITL checkpoint, the PR, the context-refresh, and the worktree; a slice is today's "stage" — one vertical thing, capped at ~6 tasks / ~15 files.

## Mode detection

`/cook-pizzas` runs in one of three modes. It is **always the source of the master checklist** — there is no upstream checklist for it to coordinate with; this skill produces the checklist.

| Mode | Trigger | Behavior |
|---|---|---|
| **fresh** (default) | `/cook-pizzas` with no master checklist present | Full PRD → Pie/Slice decomposition. Writes `docs/plans/00_master_checklist.md` (nested `## Pie N` / `### Slice N.M`, `review:` per pie) + the feature slice plan files + the project rules file. |
| **refuse** | `/cook-pizzas` (no `--repie`) when `docs/plans/00_master_checklist.md` already exists | Refuses to overwrite. Points the user at `/special-order` (add features mid-flight) — or, if the existing checklist is flat v4, at `--repie` to convert it. Writes nothing. |
| **repie** | `/cook-pizzas --repie` when a **flat v4** checklist exists | Explicit, opt-in conversion of a flat `## Stage N` checklist into nested `## Pie N` / `### Slice N.M` (see Phase R). Never runs silently; never triggered without the `--repie` flag. |

> A flat v4 checklist (`## Stage N` headings, frontmatter without `pie`/`slice`/`review`) stays contract-valid forever — `/sell-slice` runs on it as-is. Only `/sell-pie` refuses flat checklists, and the remedy is the explicit `--repie` conversion. Plan files are **never silently rewritten** (see [`references/stage-frontmatter-contract.md`](references/stage-frontmatter-contract.md) → "Dual-read").

## Subagent Roster

The two-level decomposition routes structured artifacts between singular-goal subagents. Phase 3's per-slice writers run as a `Workflow` (see Phase 3); the synthesizer consumes their **structured returns**, not re-read disk.

| Agent | Singular goal | Dispatched in | Returns |
|---|---|---|---|
| [`agents/stage-decomposer.md`](agents/stage-decomposer.md) | identify Pies, then Slices within each Pie; propose the roadmap for approval | Phase 2 (single, readonly) | proposed pie/slice tree + band compliance (no writes) |
| [`agents/rules-assembler.md`](agents/rules-assembler.md) | assemble the project rules file from elicitation answers | Phase 1.5 (single) | rules-file path + layering summary |
| [`agents/db-schema-stage-writer.md`](agents/db-schema-stage-writer.md) | write the canned db-schema slice (Slice 1.4) | Phase 3 Workflow (conditional, Q3 = Yes) | slice file path + structured frontmatter return |
| [`agents/phased-plan-writer.md`](agents/phased-plan-writer.md) | write **one** feature slice plan file | Phase 3 Workflow (`parallel()`, one per feature slice) | slice file path + `pie`/`slice`/`type`/`depends_on`/`tasks_count` + frontmatter return |
| [`agents/master-checklist-synthesizer.md`](agents/master-checklist-synthesizer.md) | aggregate the writers' structured returns into the nested master checklist | Phase 4 (single, after the Workflow barrier) | `00_master_checklist.md` path |

> Foundations Pie slices 1.1–1.3 (design-system, CI/CD, env-setup) are not written here — they are delivered by the run-once standalone skills `/set-display-case`, `/final-quality-check`, `/open-the-shop`, with their slice definitions in [`references/canned-stages/`](references/canned-stages/). Only Slice 1.4 (db-schema) gets a generated plan file (`db-schema-stage-writer`). cook-pizzas dispatches no foundation *writers* — the three legacy foundation-stage writers were removed in v5.

## Inputs / Preconditions

> **Hook enforcement.** Skill preconditions (no existing checklist in fresh mode; git tree state; the `--repie` opt-in) are enforced by plugin hooks in `hooks/`. `stage-plan-guard.sh` is a **WARN** in v5 (it no longer blocks). The dual-read parser in `hooks/lib/checklist.sh` recognizes both `## Stage N` and `## Pie N` / `### Slice N.M`. The hook output replaces the precondition prose that used to be repeated here.

**Input:** a finalized PRD file (output of `/create-menu` or equivalent). Not specs, briefs, questionnaires, or API docs — those feed `/create-menu`.

**Output (fresh mode):**
- `docs/plans/00_master_checklist.md` — **Pie 1 — Foundations** tracked via the `## Prep` gate at the top (its slices 1.1–1.3 are the foundation skills `/set-display-case`, `/final-quality-check`, `/open-the-shop` the user runs once before any feature work), then the nested **feature Pies 2+** roadmap with `review:` per pie.
- `docs/plans/stage_4_db_schema_foundation.md` (canned, conditional on Q3 = Yes — this is **Slice 1.4** of Pie 1 — Foundations; the on-disk filename is unchanged for dual-read).
- `docs/plans/stage_<N>_<feature>.md` — the feature slices, grouped into Pies 2+.
- `CLAUDE.md` or `AGENTS.md` (per Q12) — the project rules file.

> **v5 change:** the flat 20–30 "stages" become a **two-level Pie/Slice structure**. The four foundation stages are the early slices of **Pie 1** (the foundations pie, `review: boundary`, slices `1.1`–`1.4`); their on-disk filenames are unchanged. `/special-order` appends a **new Pie**. Existing flat-v4 projects keep working untouched; `--repie` converts them only on explicit opt-in.

## Project Config (optional)

Before Phase 1, check for `bytheslice.config.json` at the project root. Honor these keys (see [`skills/setup-shop/references/bytheslice-config-schema.md`](../setup-shop/references/bytheslice-config-schema.md) for the full schema):

- `rules.imports` — when non-empty, **skip Q9** (external rule-file imports) and use these URLs directly
- `stages.targetFeatureStages` — pass to `stage-decomposer` to tune the splitter (default `"20-30"` feature slices; smaller band = larger slices)
- `stages.maxTasksPerStage` — pass to the writers (default `6`; warn if user set `> 8`)
- `mcps.*` — pre-fills Q5 (Supabase MCP) and Q7 (design MCPs) so the elicitation skips already-answered questions

If a config-supplied answer covers a question, log a one-liner ("Q9 answered from bytheslice.config.json — skipping") and move to the next question.

## Workflow

### Phase 1: Context Elicitation (interactive — stays inline)

Elicitation is interactive and runs in the orchestrator's own turn — it is **not** delegated to a subagent. Ask each question with `ask_user_input_v0` before writing any files. Answers build the project rules file section by section.

> The "never call `ask_user_input_v0`" rule in Appendix D applies to **dispatched subagents** (writers, the decomposer), which surface blocking ambiguity via `needs_human` + `hitl_*` instead. The orchestrator skill itself owns all human prompts — including this elicitation.

**Always provide a recommended answer in available options.**

**Q1 — MVP scope**
> "Is this MVP-only (everything ships in Phase 1) or do you want an MVP + Phase 2 split?"
> single_select: ["MVP only — all slices are Phase 1", "MVP + Phase 2 — flag which slices are post-launch"]
> → sets `mvp:` on every slice frontmatter

**Q2 — Master checklist tracking**
> "Where should the master checklist live?"
> single_select: ["Local markdown only", "Mirror to Linear (requires Linear MCP)"]
> → if Linear: confirm Linear MCP is connected; skill writes milestone/issue stubs at the end (one milestone per **pie**, see Phase 5)

**Q3 — Database in scope?**
> Detect from PRD Section 4 (Technical Architecture). Present finding:
> "I see [the PRD indicates / no] database usage. Is a database in scope for this project?"
> single_select: ["Yes — include the db-schema-foundation slice (Slice 1.4)", "No — skip it"]

**Q4 — Database tooling** (only if Q3 = Yes)
> "Which database tooling?"
> single_select: ["Supabase", "Prisma", "Drizzle", "Other (I'll specify)"]
> → drives schema file format in the db-schema canned template

**Q5 — Supabase MCP installed?** (only if Q4 = Supabase)
> "Is the Supabase MCP installed in this workspace?"
> single_select: ["Yes", "No — I'll set it up manually"]
> → if Yes: appends Supabase security baseline from `references/architecture-conventions.md` to project rules file

**Q7 — Design MCPs**
> "Which design MCPs are available? (These inform the design-system slice and frontend-design skill.)"
> multi_select: ["shadcn MCP", "Magic MCP (21st.dev)", "Figma MCP", "None"]
> → list is written into the project rules file and passed as context to the writers

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
> → drives the auth feature slice scope; if auth present, `phased-plan-writer` injects the dev-mode auth helpers task — bundling localhost auto-login (opt-in via `DEV_AUTH_BYPASS`) + seeded-user switcher banner (see `references/canned-stages/auth-dev-mode-switcher-task.md`)

**Q11 — Deployment target**
> "Deployment target? (Default: Vercel)"
> single_select: ["Vercel", "AWS", "Fly.io", "Other (I'll specify)"]

**Q12 — Rules file format**
> "Which project rules file format?"
> single_select: ["CLAUDE.md", "AGENTS.md"]
> → writes the project rules file to the chosen path

#### Layering precedence (document in project rules file header)

```
Priority 1 (highest): ByTheSlice baseline (web standards, security, framework facts)
Priority 2: project-specific rules (imported via Q9)
Priority 3 (lowest): external rule files
```

### Phase 1.5: Assemble the project rules file

After all answers, dispatch `rules-assembler` to write the project rules file (CLAUDE.md or AGENTS.md per Q12) before any slice writers run. Run as a single dispatch: **Dispatch `rules-assembler`. Supply the elicitation answers, the architecture variant, and the layering precedence. Wait for the return.**

### Phase 2: Pie & Slice Identification

Read the PRD. **Dispatch `stage-decomposer`** (single, readonly). It produces the proposed two-level roadmap the user reviews **before** any plan files are written. Wait for the return.

The decomposer works top-down:

1. **Foundations → Pie 1.** The canned foundation slices are the early slices of **Pie 1** (`review: boundary`):
   - Slice 1.1 — design-system gate
   - Slice 1.2 — CI/CD scaffold
   - Slice 1.3 — env-setup gate
   - Slice 1.4 — db-schema foundation (only if Q3 = Yes)
2. **Features → Slices.** Every PRD Section 2 feature defaults to **≥2 slices**: (a) shell slice — route, layout, empty/loading/error states; (b) data slice — queries, mutations, polish, edge cases. Tiny features (e.g. a static page) may be one slice.
3. **Group Slices into Pies.** Bundle low-cross-coupling slices into **coherent chapters of 3–8 slices** (e.g. "Blog Editor" = the editor frontend slice + the server-actions slice + the publish-flow slice). Each Pie is the unit of `/sell-pie` autonomy, the PR, the worktree, and the HITL checkpoint. Foundations are Pie 1 (tracked via the `## Prep` gate); feature pies are Pie 2 onward.
4. **Set `review:` per pie.** Default every pie to `review: boundary` (autonomous; one HITL at the pie boundary). Flag a pie `review: continuous` (forces `/sell-pie` into `/sell-slice` mode for the whole pie) when it is sensitive: **Payments, Auth, real-data migrations**, or anything the PRD marks high-risk. The decomposer proposes the `review:` value per pie; the user confirms it at approval.
5. **Tag each slice:** `mvp:` per Q1; `type:` (`design-system | ci-cd | env-setup | db-schema | frontend | backend | full-stack | infrastructure`); `depends_on:` — only lower-numbered slices, never forward references. Within a pie, a slice's `slice` id is `"<pie>.<index>"` (e.g. `"2.6"`).
6. **Band check.** Target **20–30 feature slices** total (honor `stages.targetFeatureStages`); each pie holds 3–8 slices. Cross-check PRD Section 7 (Out of Scope) — never propose work the PRD excludes.

**Present the proposed Pie/Slice tree to the user for approval before writing any files** — pies with their `review:` annotation, slices nested under each pie with type and `depends_on`. The user can re-bundle pies, re-split slices, or override any `review:` value here.

### Phase 3: Write the Slices — schema-validated Workflow

Once the user approves the roadmap, write every slice plan file in parallel. **Run as a `Workflow` (`parallel()` of one plan-writer per slice, a barrier, then the Phase 4 synthesizer consumes the writers' structured returns — no disk re-read). If `Workflow` is unavailable, fall back per [`references/loop-workflow-fallback-pattern.md`](references/loop-workflow-fallback-pattern.md).**

> Each plan-writer writes **exactly one** file (disjoint paths), so this fan-out needs **no** worktree isolation. Only parallel file-mutating work with overlapping paths uses `isolation:'worktree'` per [`references/git-worktree-standard.md`](references/git-worktree-standard.md) §1 — most ByTheSlice fan-out (including these writers) is disjoint-file and needs none.

| Slice | Writer | Canned? | Condition |
|---|---|---|---|
| 1.4 (db-schema) | `db-schema-stage-writer` | Yes | Q3 = Yes only |
| feature slices (Pies 2+) | `phased-plan-writer` | No | one `parallel()` branch per feature slice |

**Workflow shape:**

1. **`parallel()` fan-out** — one branch per slice. Each writer writes **exactly one** file and returns a **structured envelope** (its slice's `path`, `pie`, `slice`, `name`, `type`, `depends_on`, `tasks_count`, `hitl_required`, plus the standard `status`/`needs_human`/`hitl_*`). The schema is the writer's Output Contract in `agents/phased-plan-writer.md` (and `agents/db-schema-stage-writer.md` for 1.4).
2. **Barrier** — the Workflow waits for every branch. The orchestrator **validates each return against the writer Output Contract schema** before proceeding. Under the in-context fallback (no `Workflow`), the orchestrator performs this schema validation **manually** — enforcement is otherwise lost (see the fallback ref).
3. **Synthesizer step** (Phase 4) — receives the **collection of structured returns** as its input and aggregates them. It does **not** re-read the slice files from disk; the returns are the source of truth for the checklist rows.

Supply each writer with:
- Slice metadata: `pie`, `slice` id (`"<N.M>"`), short name, output path, one-sentence goal, `mvp:` flag, the pie's `review:` value (inherited by every slice in the pie)
- Scope: features/subtasks for this slice from the approved roadmap
- Context: PRD excerpts (or absolute path), tech stack, prior-slice dependencies
- Elicitation answers (Q1–Q12) as context
- Absolute path to the project rules file

> Writers emit `pie`/`slice`/`review` per the frontmatter contract in [`references/stage-frontmatter-contract.md`](references/stage-frontmatter-contract.md). A writer that hits a blocking ambiguity sets `hitl_required: true` + the matching `hitl_reason` in frontmatter and returns `needs_human` with `hitl_category`/`hitl_context` — it never calls `ask_user_input_v0`. The orchestrator surfaces the prompt (see HITL Handling).

### Phase 4: Master Checklist (last — consumes structured returns)

After the Workflow barrier, **dispatch `master-checklist-synthesizer`** with the **collection of writer returns** (not file paths to re-read). It:

1. Writes **Pie 1 — Foundations** as the `## Prep` gate at the top — the gate IS Pie 1's completion tracker, with one checkbox per foundation slice 1.1–1.4 (always in this order):
   ```
   ## Prep — Pie 1: Foundations (run once before any feature work)
   [ ] Slice 1.1 — Display case built       — run /set-display-case
   [ ] Slice 1.2 — Quality line installed   — run /final-quality-check
   [ ] Slice 1.3 — Shop open                — run /open-the-shop
   [ ] Slice 1.4 — DB schema foundation     — run /sell-slice on Slice 1.4 (handled internally; only if backend in scope)
   ```
   Drop the last line if Q3 = No (no DB). The heading MUST keep `## Prep` as its first word so `hooks/lib/checklist.sh` `bts_prep_counts` matches it.
2. Builds the **feature Pies 2+** roadmap from the structured returns: `## Pie N — <name>` (with the `<!-- review: boundary|continuous -->` annotation mirroring each pie's `review`), then `### Slice N.M — <name>` blocks with completion criteria + the per-slice Exit-criteria contract.
3. Writes the rest of `docs/plans/00_master_checklist.md`.
4. Uses `[ ]` checkbox format (no leading dash).

See [`references/templates.md`](references/templates.md) for the exact nested checklist template, including the `## Prep` gate (Pie 1 — Foundations) and the `review:` annotation.

### Phase 5: Linear stubs (if Q2 = Linear)

If the user chose Linear mirroring:
1. Create one Linear milestone **per Pie** using the Linear MCP (the pie is the PR unit, so it maps to a milestone).
2. Write milestone IDs back into each slice file's `linear_milestone:` frontmatter field (every slice in a pie shares the pie's milestone).

### Phase R: `--repie` — convert a flat v4 checklist to Pies (explicit opt-in only)

Runs **only** when invoked as `/cook-pizzas --repie` against an existing **flat v4** checklist. This is the sole path that mutates existing plan files, and it is never silent or automatic.

1. **Confirm the conversion explicitly.** State plainly what will change: flat `## Stage N` headings → nested `## Pie N` / `### Slice N.M`; frontmatter gains `pie`, `slice: "<N.M>"`, `review:`. Show the proposed pie groupings (which stages bundle into which pie, and each pie's `review:` value) and the file-by-file diff plan. **Wait for the user to approve** before writing anything.
2. **Group the existing stages into Pies.** Apply the same bundling heuristic as Phase 2 step 3: coherent 3–8-slice chapters, low cross-coupling. Foundation stages 1–4 become Pie 1's slices 1.1–1.4. Renumber the rest into pies, preserving each stage's original `stage:` integer (kept for back-compat + stable sort) and original on-disk filename.
3. **Set `review:` per pie.** Default `boundary`; flag Payments / Auth / real-data-migration pies `continuous`. The user confirms each at step 1.
4. **Rewrite frontmatter + headings in place.** For each plan file, add `pie`, `slice`, `review` (do **not** remove `stage:` — dual-read keeps it). Update the master checklist headings to the nested shape. Preserve every existing Exit-criteria block verbatim; each slice keeps its own.
5. **Verify dual-read.** After the rewrite, confirm both the flat (`stage`) and nested (`pie`/`slice`) keys are present and consistent (a slice's `slice` leading number equals its `pie`). Report the conversion summary.

> If no flat checklist exists, or one already nested (carries `pie`/`slice`), `--repie` is a no-op: report that nothing needs converting. `--repie` never creates new slices or features — it only re-groups what is already there. For *adding* features, point the user at `/special-order`.

## HITL Handling

The orchestrator owns every human prompt; subagents never call `ask_user_input_v0`.

- **Interactive elicitation (Phase 1)** and the **roadmap approval (Phase 2)** / **`--repie` confirmation (Phase R)** are first-class orchestrator prompts via `ask_user_input_v0`.
- **Subagent-surfaced HITL.** When `stage-decomposer` or a Phase 3 writer returns `needs_human: true`, halt that branch and surface the agent's `hitl_question` to the user with its `hitl_category` (`prd_ambiguity` | `external_credentials` | `destructive_operation` | `creative_direction`) and `hitl_context`. Resolve, then re-dispatch only the affected branch.
- A writer that hits the 6-task / ~15-file slice cap returns `hitl_required: true` / `hitl_reason: prd_ambiguity` proposing a split — surface it and re-bundle into the pie before continuing.

## Progress Report Format

Lead with the verdict, then the structure:

- **Phase 1–1.5:** "Elicitation complete (12 Qs); project rules file written to `<path>`."
- **Phase 2:** "Proposed roadmap: `<P>` pies / `<S>` feature slices. Pies needing your eyes: `<continuous pies>`. Approve to write?"
- **Phase 3 (Workflow):** "Writing `<S>` slices in parallel via Workflow… barrier reached; `<n>` returns schema-valid, `<m>` flagged HITL."
- **Phase 4:** "Master checklist written: `docs/plans/00_master_checklist.md` — `<P>` pies; Pie 1 — Foundations as the `## Prep` gate at top, feature Pies 2+ below."
- **`--repie`:** "Converted `<n>` flat stages → `<P>` pies. Dual-read verified."

## Architecture conventions reference

This skill's `references/architecture-conventions.md` is the **opinion-free baseline** injected into every project's rules file (universal web standards, performance facts, stack-conditional security baselines, framework-version syntactic facts, and the Variant A/B structural split). Opinionated rules (naming, type-vs-interface, file organization, server-action patterns) are NOT in that file — they enter via Q9 imports and design-system code patterns. Document this clearly in the project rules file header.

## Output structure

```
docs/
├── plans/
│   ├── 00_master_checklist.md             (## Prep gate = Pie 1 — Foundations, then nested ## Pie N / ### Slice N.M for feature Pies 2+)
│   ├── stage_4_db_schema_foundation.md    (Slice 1.4 of Pie 1 — conditional on Q3 = Yes; filename unchanged)
│   └── stage_N_<feature>.md               (feature slices, grouped into Pies 2+)
└── (existing PRD)
CLAUDE.md or AGENTS.md (per Q12)
```

> The `## Prep` gate IS Pie 1 — Foundations; its slices 1.1–1.3 point the user at the standalone foundation skills (`/set-display-case`, `/final-quality-check`, `/open-the-shop`). Those run once each before any `/sell-pie` or `/sell-slice` invocation. They are NOT plan files; they are skills the user invokes directly.

## Key principles

- **Two levels:** Pies are coherent 3–8-slice chapters with low cross-coupling (the unit of autonomy, PR, worktree, HITL); Slices are vertical deliverables (UI + route + data + tests for one user-facing thing).
- **Hard cap per slice:** 6 tasks, ~15 files, completable in one Claude session.
- **One PR per Pie** (not per slice): per-slice work is commit + push to the pie branch; the PR opens at the pie boundary via `/box-it-up`.
- **`review:` is a pie property:** `boundary` (default, autonomous) vs `continuous` (forces `/sell-slice` mode). Sensitive pies (Payments, Auth, real-data migrations) are `continuous`.
- **No forward references:** a slice may only reference packages, tables, or components built in prior slices.
- **Exit criteria are testable AND transcript-verifiable:** every line in a slice's `**Exit criteria:**` block must be verifiable by reading the conversation alone — a command's exit code, a subagent's `overall: pass`, a captured screenshot, a file path Claude has read. This block is lifted verbatim into the `/goal` condition by `/sell-slice` Phase 2.5 and is what `slice-tester` derives its bespoke plan from. See [`references/templates.md`](references/templates.md) → "Exit-criteria contract (consumed by `/goal`)".
- **Design HITL is front-loaded** to the design-system slice (Pie 1) so feature pies compose pre-approved components and rarely stop for design.
- **Auth slices always get the dev-mode auth helpers task** — one combined task bundling localhost auto-login (opt-in via `DEV_AUTH_BYPASS`) + seeded-user switcher banner; both sub-bullets ship together (see `references/canned-stages/auth-dev-mode-switcher-task.md`).
- **Never silently rewrite plan files.** Flat v4 checklists stay valid; conversion to pies happens only via explicit `--repie`.

## CC-only primitives + Cursor fallback

`Workflow` (Phase 3's parallel writers + barrier) is a Claude-Code-only primitive, as is `/loop` (which `/sell-pie` drives the baked pies with). When either is unavailable — running in Cursor, hooks disabled, or any other reason — follow [`references/loop-workflow-fallback-pattern.md`](references/loop-workflow-fallback-pattern.md): detect availability → if absent, WebFetch the canonical docs → fall back to **in-context dispatch with orchestrator-side manual schema validation** of each writer return (enforcement is otherwise lost). Do NOT silently drop the Workflow's schema validation in fallback mode.

## Slice frontmatter contract

Every slice file uses the contract in [`references/stage-frontmatter-contract.md`](references/stage-frontmatter-contract.md) — including the v5 `pie`, `slice`, and `review` fields and the dual-read rule. See also [`references/templates.md`](references/templates.md).

## Hard Constraints

- **fresh mode never overwrites** an existing master checklist — refuse and redirect (to `/special-order`, or to `--repie` for a flat checklist).
- **`--repie` is the only mutating path** and runs only on explicit `--repie` + user confirmation. Never auto-convert; never create new slices.
- **Writers write exactly one file each** and return structured envelopes; the synthesizer consumes returns, not disk.
- **Schema-validate every writer return** at the Workflow barrier (manually in the in-context fallback).
- **No `- [ ]` checkboxes** in generated files — use `[ ]` only.
- **No platform-specific references** — use "project rules file", not "cursor rules" or "claude rules".
- **No forward references** in any slice's `depends_on`.
- **Subagents never call `ask_user_input_v0`** — they set `needs_human` + `hitl_*`; the orchestrator prompts.

## Completion checklist

[ ] All 12 elicitation questions answered and answers written to project rules file
[ ] Project rules file assembled with correct layering: baseline → Q9 imports → design-system patterns
[ ] Pie/Slice roadmap presented to user and approved (pies, `review:` per pie, slices nested with type + `depends_on`)
[ ] db-schema slice (Slice 1.4) plan file written if Q3 = Yes
[ ] All feature slice files written via the Phase 3 Workflow (`parallel()` writers, barrier)
[ ] Every writer return schema-validated against the Output Contract (manually if `Workflow` unavailable)
[ ] All slice files include valid YAML frontmatter per `references/stage-frontmatter-contract.md` (incl. `pie`/`slice`/`review`)
[ ] Master checklist synthesized from the structured returns (not disk re-read): Pie 1 — Foundations as the `## Prep` gate at top, then feature Pies 2+ as nested `## Pie N` / `### Slice N.M` with `review:` annotations
[ ] Linear stubs created if Q2 = Linear (one milestone per pie; `linear_milestone` fields populated)
[ ] (`--repie` only) Flat checklist converted on explicit opt-in; dual-read verified; no new slices invented
[ ] No `- [ ]` checkboxes in generated files (all use `[ ]` format)
[ ] No platform-specific references in generated files

## Return contract

```yaml
status: complete | failed | needs_human
summary: <one paragraph — N pies / S feature slices written, or the --repie conversion result>
mode: fresh | refuse | repie
artifacts:
  - docs/plans/00_master_checklist.md
  - <slice plan file paths>
  - <project rules file path>
pies: <int>
feature_slices: <int>
needs_human: false | true
hitl_category: null | "prd_ambiguity" | "external_credentials" | "destructive_operation" | "creative_direction"
hitl_question: null | "<plain-language question if a writer or the decomposer was blocked>"
hitl_context: null | "<what triggered this>"
```
