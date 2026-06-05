# Plan Document Templates

## Stage Frontmatter Template

Every stage/slice file produced by `cook-pizzas` must begin with this YAML frontmatter. See `references/stage-frontmatter-contract.md` for full field definitions, the Pie/Slice fields, and the dual-read rule.

```yaml
---
stage: <int>
pie: <int>                # v5: which Pie this slice belongs to
slice: "<N.M>"            # v5: dotted slice id, e.g. "2.6" — quoted string
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

> **Dual-read.** A v4 flat file omits `pie`/`slice`/`review` and uses `## Stage N` headings — still contract-valid (`references/stage-frontmatter-contract.md` → "Dual-read"). v5 nested files carry all three and use `## Pie N` / `### Slice N.M` headings. `/cook-pizzas` emits nested; `--repie` converts a flat checklist on explicit opt-in. Plan files are never silently rewritten.

## Master Checklist Template

```markdown
<!-- docs/plans/00_master_checklist.md -->
<!-- Master checklist tracking all pies, slices, and completion criteria -->

# [Project Name] — Master Checklist

[One-sentence description of the project.]

---

## Prep — Pie 1: Foundations (run once before any feature work)

This is **Pie 1 — Foundations**: its four slices (1.1–1.4) are the run-once standalone skills the user invokes directly. The "Prep" gate IS Pie 1's completion tracker — not a separate concept. `/sell-slice` checks every box below before accepting any feature slice (feature work is Pie 2 onward). Each foundation skill flips its own checkbox on completion when invoked in sequential mode.

[ ] Slice 1.1 — Display case built       — run `/bytheslice:set-display-case` (design system, tokens, /library route)
[ ] Slice 1.2 — Quality line installed   — run `/bytheslice:final-quality-check` (CI/CD, E2E, design-system-compliance, visual-regression)
[ ] Slice 1.3 — Shop open                — run `/bytheslice:open-the-shop` (env vars, external service credentials)
[ ] Slice 1.4 — DB schema foundation     — run `/bytheslice:sell-slice` on `stage_4_db_schema_foundation.md` (only if backend in scope)

---

<!-- Feature pies start at Pie 2 — Pie 1 is Foundations (the Prep gate above). -->
## Pie N — [Pie Name]    <!-- review: boundary -->
**Pie scope:** [one line — the coherent chapter this pie delivers] | **MVP:** Yes | No | **Depends on:** Pies [list]
**Review:** boundary (autonomous; one HITL at the pie boundary) | continuous (forces /sell-slice mode for every slice)
**Linear milestone:** [id or —]

### Slice N.1 — [Slice Name]
**Type:** [type] | **Depends on:** Slices [list]

Completion criteria:
[ ] [criterion from frontmatter]
[ ] tests_passing
[ ] slice-tester pass (behavioral; per-affordance verdict + evidence)
[ ] slice-verifier pass (lint + typecheck + build + unit/integration + e2e-by-tag + design-system grep + CI-integrity + manifest backstop)
[ ] All unit tests added and passing
[ ] HITL items resolved (only if hitl_required: true)

Exit criteria:
[ ] [transcript-verifiable, binary, slice-specific — e.g. `pnpm test --filter @repo/x` exits 0]
[ ] [Route `/path` renders with no console errors (screenshot in transcript)]
[ ] [For each component this slice authored/modified: `/library/<slug>` approved at the Phase 4.5 gate before any production import — UI-touching slices only]

### Slice N.2 — [Slice Name]
**Type:** [type] | **Depends on:** Slices [list]

Completion criteria:
[ ] [criterion from frontmatter]
[ ] tests_passing
[ ] slice-tester pass
[ ] slice-verifier pass

Exit criteria:
[ ] [transcript-verifiable, binary, slice-specific]

---

<!-- Repeat ### Slice N.M for the pie's 3–8 slices, then repeat ## Pie N for each pie. -->
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

> The `<!-- review: boundary -->` comment on the `## Pie N` heading mirrors the pie's `review` frontmatter and is what the dual-read parser and `/sell-pie` key off. A `## Stage N` heading (no pie) is the v4 flat shape — still valid; `/sell-pie` refuses it and points at `/cook-pizzas --repie`.

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

# Slice N.M — [Slice Name]

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

[Explanation of what to do.]

\`\`\`ts
// path/to/file.ts
// Full implementation — no pseudo-code, no // TODO
\`\`\`

**Step 2: [Step description]**

\`\`\`bash
pnpm test
\`\`\`

**Commit:**
\`\`\`bash
# v5 per-slice commit convention (one commit per slice, pushed to the pie branch — no PR until the pie boundary):
git commit -m "feat(pie-N): N.M — [slice name]"
\`\`\`

---

### Task 2: [Task Title]

[Same structure as Task 1]

---

**Exit criteria:**
- `pnpm test` passes (or the project's resolved test command exits 0)
- Route `/path` renders without errors (capture screenshot proof in the transcript)
- [Other testable, binary condition — see the contract below]
```

### Exit-criteria contract (consumed by `/goal`)

The **Exit criteria** block is the single source of truth for "what it means for this slice to be done." `/bytheslice:sell-slice` Phase 2.5 lifts this block verbatim into the session-scoped `/goal` condition, where a fast model (default Haiku) checks it between turns.

Every line MUST be:

1. **Transcript-verifiable from the conversation.** The evaluator does not run commands or read files independently — only what Claude has already surfaced in the transcript counts as evidence. Write criteria that Claude's own output can demonstrate (a command's exit code that lands in the transcript, a subagent's structured `verdict: pass`, a file path Claude has read).
2. **Binary.** Each criterion is either met or not met. No partial credit, no "looks good."
3. **Specific to this slice.** Avoid generic platitudes like "no regressions" — name the routes, files, or test suites that prove the slice's intent.

Good examples (transcript-verifiable, binary, specific):

- ``pnpm test --filter @repo/auth`` exits 0 with all suites green
- `tsc --noEmit` exits 0 with no errors
- `gh pr checks <pr-number> --watch` returns exit 0 on the merged head SHA
- `slice-verifier` agent returns `overall: pass` (lint/typecheck/build/unit-integration/e2e-by-tag/design-system/ci-integrity all green, manifest backstop clean) for this slice
- `slice-tester` agent returns `overall: pass` with a per-affordance verdict for every declared affordance in the build manifest
- `quality-reviewer` and `spec-reviewer` agents both return `verdict: pass` for every in-scope task
- `library-entry-writer` reports `production_imports_added: 0` until user approval; then user explicitly approved each entry at the Phase 4.5 gate
- Route `/dashboard/billing` renders with no console errors (screenshot captured in transcript)
- `db/schema.sql` updated and `supabase db diff` shows the new `subscriptions` table with RLS policies present

Bad examples (vague, non-transcript-verifiable, generic):

- "Auth works correctly" → unmeasurable; what command proves it?
- "No regressions" → too broad; which routes / suites?
- "Code quality is high" → subjective; not binary
- "Ship-ready" → meta; not a criterion
- "Tests pass" without naming the test command → too generic

### Library Preview Gate criterion (UI-touching slices only)

For any slice whose `type:` is `frontend`, `full-stack`, or a `backend`/`db-schema` slice that touches a production-route's user-visible surface, the Exit criteria block MUST include:

- For every component or block this slice authored or modified: `/library/<slug>` entry rendered all variants × states, user explicitly approved at the Phase 4.5 gate before any production-route import landed

Drop this line only for pure internal refactors with no rendered-output delta in any production route (`sell-slice` Phase 2.5 trims it accordingly).

## Canned Stage Templates

The four foundation stage templates live in `references/canned-stages/`. In v5 they are the slices of **Pie 1** (the foundations pie, `review: boundary` — slices `1.1`–`1.4`); their on-disk filenames are unchanged for dual-read back-compat. Do not duplicate them here — reference them directly:

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
<!-- Stage 5: auth shell — sign-in/sign-up routes, layout, loading and error states -->
```

## Checkbox format rule

Always use `[ ]` — no leading dash. Never write `- [ ]`.

Correct: `[ ] task description`
Incorrect: `- [ ] task description`
