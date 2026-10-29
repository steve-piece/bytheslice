# Plan Document Templates

## Stage Frontmatter Template

Every stage/slice file produced by `cook-pizzas` must begin with this YAML frontmatter. See `references/stage-frontmatter-contract.md` for full field definitions, the Pie/Slice fields, and the dual-read rule.

```yaml
---
stage: <int>
pie: <int>                # v5: which Pie this slice belongs to
slice: "<N.M>"            # v5: dotted slice id, e.g. "2.6", a quoted string
review: boundary | continuous   # v5: inherited from the pie (boundary = autonomous; continuous = forces /sell-slice mode)
name: "<Title Case>"
type: design-system | ci-cd | env-setup | db-schema | frontend | backend | full-stack | infrastructure
mvp: true | false
depends_on: [<stage_ints>]
estimated_tasks: <int, 1-6>
hitl_required: false | true
hitl_reason: null | "prd_ambiguity" | "external_credentials" | "destructive_operation" | "creative_direction"
linear_milestone: null | "<id>"
completion_criteria:
  - tests_passing
  - <other criteria specific to stage type>
---
```

> **Dual-read.** A v4 flat file omits `pie`/`slice`/`review` and uses `## Stage N` headings; it is still contract-valid (`references/stage-frontmatter-contract.md` → "Dual-read"). v5 nested files carry all three and use `## Pie N` / `### Slice N.M` headings. `/cook-pizzas` emits nested; `--repie` converts a flat checklist on explicit opt-in. Plan files are never silently rewritten.

## Master Checklist Template

```markdown
<!-- docs/plans/00_master_checklist.md -->
<!-- Master checklist tracking all pies, slices, and completion criteria -->

# [Project Name]: Master Checklist

[One-sentence description of the project.]

---

## Prep (Pie 1 Foundations, run once before any feature work)

This is **Pie 1, Foundations**: its four slices (1.1 to 1.4) are the run-once standalone skills the user invokes directly. The "Prep" gate IS Pie 1's completion tracker, not a separate concept. `/sell-slice` checks every box below before accepting any feature slice (feature work is Pie 2 onward). Each foundation skill flips its own checkbox on completion when invoked in sequential mode.

- [ ] Slice 1.1, Display case built       : run `/bytheslice:set-display-case` (design system, tokens, /library route)
- [ ] Slice 1.2, Quality line installed   : run `/bytheslice:final-quality-check` (CI/CD, E2E, design-system-compliance, visual-regression)
- [ ] Slice 1.3, Shop open                : run `/bytheslice:open-the-shop` (env vars, external service credentials)
- [ ] Slice 1.4, DB schema foundation     : run `/bytheslice:sell-slice` on `stage_4_db_schema_foundation.md` (only if backend in scope)

---

<!-- Feature pies start at Pie 2; Pie 1 is Foundations (the Prep gate above). -->
## Pie N: [Pie Name]    <!-- review: boundary -->
**Pie scope:** [one line: the coherent chapter this pie delivers] | **MVP:** Yes | No | **Depends on:** Pies [list]
**Review:** boundary (autonomous; one HITL at the pie boundary) | continuous (forces /sell-slice mode for every slice)
**Linear milestone:** [id, or omit the line]
**User flow:**
1. [what the user does first] - Slice N.1
2. [the next thing the user does] - Slice N.2
3. [the step that finishes the flow] - Slice N.3

### Slice N.1: [Slice Name]
**Type:** [type] | **Depends on:** Slices [list]
**Status:** Not Started    <!-- In Progress | Completed | waiting until <YYYY-MM-DD>: <criterion> -->

Completion criteria:
- [ ] [criterion from frontmatter]
- [ ] tests_passing
- [ ] slice-tester pass (behavioral; per-affordance verdict + evidence)
- [ ] slice-verifier pass (gate tier 3, once at slice end: lint + typecheck + build + unit/integration + e2e-by-tag + design-system grep + CI-integrity + manifest backstop)
- [ ] All unit tests added and passing
- [ ] HITL items resolved (only if hitl_required: true)

Exit criteria:
- [ ] [transcript-verifiable, binary, slice-specific, e.g. `pnpm test --filter @repo/x` exits 0]
- [ ] [Route `/path` renders with no console errors (screenshot in transcript)]
- [ ] [Only if this slice owns a User flow step: slice-tester completed <flow step> end-to-end on /<route> with zero console errors (screenshot at 1280 in transcript)]
- [ ] [For each component this slice authored/modified: `/library/<slug>` approved at the Phase 4.5 gate before any production import (UI-touching slices only)]

### Slice N.2: [Slice Name]
**Type:** [type] | **Depends on:** Slices [list]

Completion criteria:
- [ ] [criterion from frontmatter]
- [ ] tests_passing
- [ ] slice-tester pass
- [ ] slice-verifier pass

Exit criteria:
- [ ] [transcript-verifiable, binary, slice-specific]

---

<!-- Repeat ### Slice N.M for each of the pie's slices (usually 3 to 8; a small app's pie may hold 1 or 2, never padded), then repeat ## Pie N for each pie. -->
<!-- The pie PR opens at the boundary (one PR per pie); per-slice work is commit + push only. -->

## MVP Summary

| Pie | Slice | Name | Type | Status |
|-----|-------|------|------|--------|
| 1 | 1.4 | DB Schema Foundation (conditional) | db-schema | [ ] |

## Phase 2 (Post-Launch)

| Pie | Slice | Name | Type | Status |
|-----|-------|------|------|--------|
| N | N.M | [Slice Name] | [type] | [ ] |
```

> **User flow (optional, one block per pie).** The `**User flow:**` line sits in the pie block, after the pie's header lines and before its first `### Slice` heading, followed by 3 to 7 numbered items. Each item is one step the user takes and ends with ` - Slice N.M`, naming the slice that owns it (a plain hyphen with a space on each side, never an em or en dash). Steps are numbered list items and never `### Slice` headings: `hooks/lib/checklist.sh` counts slices from `### Slice N.M` headings, so a step written as a heading would double-count every slice in the pie. A pie with no user-facing flow (a backend-only pie) omits the block. The owning slice's plan carries the step as its one user-outcome Exit line (see "Exit-criteria contract" below).

> The `<!-- review: boundary -->` comment on the `## Pie N` heading mirrors the pie's `review` frontmatter and is what the dual-read parser and `/sell-pie` key off. A `## Stage N` heading (no pie) is the v4 flat shape, still valid; `/sell-pie` refuses it and points at `/cook-pizzas --repie`.

## Feature Slice Plan Template (feature pies)

```markdown
---
stage: N
pie: <int>
slice: "<N.M>"
review: boundary | continuous
name: "Slice Name"
type: frontend | backend | full-stack | infrastructure
mvp: true | false
depends_on: [<prior_stage_ints>]
estimated_tasks: <1-6>
hitl_required: false | true
hitl_reason: null | "prd_ambiguity" | "external_credentials" | "destructive_operation" | "creative_direction"
linear_milestone: null | "<id>"
completion_criteria:
  - tests_passing
  - route_renders_without_error
  - visual_review_passed
---

<!-- docs/plans/stage_N_short_name.md -->
<!-- Slice N.M: [Brief semantic description for search] -->

# Slice N.M: [Slice Name]

**Goal:** [One sentence describing the deliverable.]

**Architecture:** [How this slice fits into the overall system. 2-4 sentences.]

**Tech stack:**
- [Framework / library]
- [Relevant tool]

**Dependencies from prior slices:**
- Slice X.Y: [package / table / component / env var assumed to exist]

---

## Tasks

### Task 1: [Task Title]

**Files:**
- Create: `path/to/new-file.ts`
- Modify: `path/to/existing-file.ts`

**Step 1: [Step description]**

[What this step builds, in prose: the behavior, its states, its edge cases, its authorization rule. No implementation body.]

**Contract:**

\`\`\`ts
// path/to/file.ts
export type Thing = { id: string; name: string; status: "draft" | "live" };
export function listThings(input: { limit?: number }): Promise<Thing[]>;
\`\`\`

**Tests to write** (one line per case, no bodies):
- returns an empty array when no rows exist
- rejects `limit` above 100 with a validation error

**Step 2: [Step description]**

\`\`\`bash
# Gate tier 2, before the task commit: this task's own tests, the build, and DB tests only if the schema or migrations changed.
pnpm test path/to/new-file.test.ts && pnpm build
\`\`\`

**Commit:**
\`\`\`bash
# v5 task commit convention: commit + push at every task boundary (swap feat for fix/chore/docs to match the task).
# The slice's last commit is feat(pie-N): N.M [slice name]. One slice per PR boundary, task commits inside.
git commit -m "feat(pie-N): N.M task 1 [task title]"
\`\`\`

---

### Task 2: [Task Title]

[Same structure as Task 1]

---

**Exit criteria:**
- The slice's own tests exit 0: `pnpm test <the test files this plan names>` (gate tier 2)
- `slice-verifier` returns `overall: pass` for this slice (gate tier 3, the one full local run)
- Route `/path` renders without errors (capture screenshot proof in the transcript)
- [Other testable, binary condition, see the contract below]
```

### Contract, not implementation

Plan files carry the interface between slices and leave the implementation to the builder. See `agents/phased-plan-writer.md` "Code budget" for the full rule. In short: code fences hold commands, schema DDL, exported signatures and type shapes (about 15 lines each), and byte-exact config fragments. They never hold component, route, action, hook, utility, or test bodies; those are prose (behavior, states, edge cases, named test cases). A slice plan should land under roughly 400 lines with fences well under a fifth of them.

### Gate tiers (what an Exit criterion may demand)

Generated plans follow the delivery loop's four gate tiers (`skills/sell-slice/SKILL.md` "Gate tiers"). A slice never demands the full gate ladder per task or per commit.

| Tier | When | What runs |
|---|---|---|
| 1 | While coding (builder) | Lint on changed files, the whole-project incremental typecheck, the colocated unit tests of changed files |
| 2 | Before each commit (every task boundary) | The slice's own tests named in this plan, the build, DB tests only when the diff touches the schema or migrations |
| 3 | Once at slice end, before any PR | `slice-verifier`: the full local suite, one time |
| 4 | At the PR | CI: the full suite (`@regression-core`, `@visual`, audit, schema drift, design-system-compliance) |

So a task's **Commit** step runs tier 2 only, and the Exit criteria name the slice's own tests (tier 2) and the `slice-verifier` verdict (tier 3). They never name a CI-only check (tier 4): that runs at the PR, which in the default delivery mode is the pie's, not the slice's.

### Exit-criteria contract (consumed by `/goal`)

The **Exit criteria** block is the single source of truth for "what it means for this slice to be done." `/bytheslice:sell-slice` Phase 2.5 lifts this block verbatim into the session-scoped `/goal` condition, where a fast model (default Haiku) checks it between turns.

Every line MUST be (a line marked `(date-gated, on or after YYYY-MM-DD)` is the one exception to "now"; see "Calendar-gated criteria" below):

1. **Transcript-verifiable from the conversation.** The evaluator does not run commands or read files independently: only what Claude has already surfaced in the transcript counts as evidence. Write criteria that Claude's own output can demonstrate (a command's exit code that lands in the transcript, a subagent's structured `verdict: pass`, a file path Claude has read).
2. **Binary.** Each criterion is either met or not met. No partial credit, no "looks good."
3. **Specific to this slice.** Avoid generic platitudes like "no regressions"; name the routes, files, or test suites that prove the slice's intent.

Good examples (transcript-verifiable, binary, specific):

- ``pnpm test --filter @repo/auth`` exits 0 with all suites green
- `tsc --noEmit` exits 0 with no errors
- `slice-verifier` agent returns `overall: pass` (gate tier 3: lint/typecheck/build/unit-integration/e2e-by-tag/design-system/ci-integrity all green, manifest backstop clean) for this slice
- `slice-tester` agent returns `overall: pass` with a per-affordance verdict for every declared affordance in the build manifest
- `quality-reviewer` and `spec-reviewer` agents both return `verdict: pass` for every in-scope task
- `library-entry-writer` reports `production_imports_added: 0` until user approval; then user explicitly approved each entry at the Phase 4.5 gate
- Route `/dashboard/billing` renders with no console errors (screenshot captured in transcript)
- `slice-tester completed <flow step> end-to-end on /<route> with zero console errors (screenshot at 1280 in transcript)`: the one sanctioned user-outcome line, written only by a `frontend` or `full-stack` slice that owns a step in its pie's `User flow`, with `<flow step>` taken from that step. One line or none: a slice that owns no step writes none (`agents/phased-plan-writer.md` "User-outcome line")
- `db/schema.sql` updated and `supabase db diff` shows the new `subscriptions` table with RLS policies present

Bad examples (vague, non-transcript-verifiable, generic):

- "Auth works correctly" → unmeasurable; what command proves it?
- "No regressions" → too broad; which routes / suites?
- "Code quality is high" → subjective; not binary
- "Looks good", "feels intuitive" → taste, not a check; a user outcome uses the one sanctioned `slice-tester completed <flow step>` line above
- "Ship-ready" → meta; not a criterion
- "Tests pass" without naming the test command → too generic
- "`gh pr checks` green", "`@regression-core` passes", "`db-schema-drift` CI job green" → CI-only (gate tier 4); CI runs at the PR, not per slice

### Calendar-gated criteria (the one allowed exception to "verifiable now")

Some criteria can only be checked after a date (a 7-day retention number, a scheduled job's first real run, a vendor's go-live). Write such a line **marked as date-gated**, with the earliest date it can be checked:

- `(date-gated, on or after 2026-11-03) the nightly export job's first scheduled run wrote rows to exports.daily`

Rules: use it only when no earlier check exists; every other line stays verifiable now. When the rest of the slice is green but a date-gated line's date is still ahead, the slice is not done: its `**Status:**` line in the master checklist reads `waiting until <YYYY-MM-DD>: <criterion>` and its row stays `[ ]`. The delivery loop skips it and moves on to the next slice that does not `depends_on` it, or stops if there is none; nothing keeps a loop alive to wait. The next `/sell-pie` run on or after the date checks the criterion and closes the slice. A pie with a waiting slice is not complete, so its boundary PR cannot open. In merge-per-slice mode the slice's code is merged; only the slice stays open.

### Library Preview Gate criterion (UI-touching slices only)

For any slice whose `type:` is `frontend`, `full-stack`, or a `backend`/`db-schema` slice that touches a production-route's user-visible surface, the Exit criteria block MUST include:

- For every component or block this slice authored or modified: `/library/<slug>` entry rendered all variants × states, user explicitly approved at the Phase 4.5 gate before any production-route import landed

Drop this line only for pure internal refactors with no rendered-output delta in any production route (`sell-slice` Phase 2.5 trims it accordingly).

## Canned Stage Templates

The four foundation stage templates live in `references/canned-stages/`. In v5 they are the slices of **Pie 1** (the foundations pie, `review: boundary`, slices `1.1` to `1.4`); their on-disk filenames are unchanged for dual-read back-compat. Do not duplicate them here; reference them directly:

- `references/canned-stages/stage-1-design-system-gate.md`     (Slice 1.1)
- `references/canned-stages/stage-2-ci-cd-scaffold.md`          (Slice 1.2)
- `references/canned-stages/stage-3-env-setup-gate.md`          (Slice 1.3)
- `references/canned-stages/stage-4-db-schema-foundation.md`    (Slice 1.4)
- `references/canned-stages/auth-dev-mode-switcher-task.md` (injected into auth-tagged slices)

## Naming Conventions

- Master checklist: `00_master_checklist.md`
- Stage plans: `stage_N_short_name.md` where `short_name` is lowercase with underscores
- Stage numbers are sequential starting at 1
- All files go in `docs/plans/`
- Auth-tagged stages: name contains `auth`, `login`, `session`, `rbac`, or `permission`

## Header Comment Convention

Every generated plan file starts with two HTML comment lines:
1. Relative file path
2. Brief description optimized for semantic search

```markdown
<!-- docs/plans/stage_5_user_auth_shell.md -->
<!-- Stage 5: auth shell (sign-in/sign-up routes, layout, loading and error states) -->
```

## Checkbox format rule

Always write checkboxes as GitHub Flavored Markdown task-list items: a list marker, then the box, one item per line.

Correct: `- [ ] task description`
Incorrect: `[ ] task description` (no list marker: GitHub and every CommonMark renderer treat this as plain text, so consecutive boxes fold into one paragraph and read horizontally)

A label line such as `Completion criteria:` may sit directly above the list with no blank line; a bullet list can interrupt a paragraph. Never put two boxes on one line, and never nest a box inside a table cell. The plugin hooks (`hooks/lib/checklist.sh`) still count legacy bare `[ ]` lines from checklists generated before this rule changed, so old projects keep working without a rewrite.
