---
name: special-order
description: Cook a slice with the customer's specifications on the spot — add new features mid-flight to an existing project. Auto-detects project type and extends the master checklist with new stages.
model: opus
effort: high
user-invocable: true
triggers: ["/bytheslice:special-order", "/special-order", "custom order", "off-menu request", "/bytheslice:add-feature", "/add-feature", "add a feature", "add features", "extend the app", "bolt on a feature", "what about adding"]
---

<!-- skills/special-order/SKILL.md -->
<!-- Mid-flight feature addition. Pizza-shop framing: a walk-in wants something not on today's menu — cook it on the spot and add it to the tray. Detects project state, assesses complexity, writes incremental stage files, hands off to /sell-slice. For non-ByTheSlice apps, redirects to /setup-shop. -->

# Special Order — Add Features Mid-Flight

Bolt new features onto an existing project without restarting from a fresh PRD. Used after `/bytheslice:run-the-day` has already shipped the original plan, OR for adding ByTheSlice to an existing non-ByTheSlice project.

The flow auto-detects which state the project is in and either runs the addition flow directly or redirects you to the right entry point first.

## Mode detection

`/special-order` is **always sequential** — its entire purpose is to extend an existing master checklist with new feature stages. The skill auto-detects:

- **Path A** — `docs/plans/00_master_checklist.md` exists. Append new feature stages to the existing checklist.
- **Path B** — `package.json` exists but no master checklist. Redirect the user to `/setup-shop` → `/create-menu` → `/cook-pizzas` first.
- **Path C** — no project on disk. Redirect to `/setup-shop` for bootstrap.

There is no standalone "produce a feature spec without a checklist" mode — that would just be `/create-menu` for a new project.

## Reference Files

| File | Purpose |
| --- | --- |
| [`skills/cook-pizzas/references/stage-frontmatter-contract.md`](../cook-pizzas/references/stage-frontmatter-contract.md) | YAML frontmatter shape every new stage file must match |
| [`skills/cook-pizzas/references/templates.md`](../cook-pizzas/references/templates.md) | Stage plan + master checklist templates |
| [`skills/cook-pizzas/references/canned-stages/auth-dev-mode-switcher-task.md`](../cook-pizzas/references/canned-stages/auth-dev-mode-switcher-task.md) | Auto-injected if any new feature is auth-tagged |
| [`skills/setup-shop/references/bytheslice-config-schema.md`](../setup-shop/references/bytheslice-config-schema.md) | Honors `stages.maxTasksPerStage` from `bytheslice.config.json` |

## Sub-agents

| When | File | Model | Effort |
|---|---|---|---|
| Step 1 (always) | [`agents/complexity-assessor.md`](agents/complexity-assessor.md) | `sonnet` | medium |
| Step 2 (always) | [`../cook-pizzas/agents/phased-plan-writer.md`](../cook-pizzas/agents/phased-plan-writer.md) | `sonnet` | medium |

`phased-plan-writer` runs in **incremental mode** for this skill (no PRD context — receives the user's feature description + complexity-assessor output + existing-stages context directly). See its incremental-mode block.

## Project Config

Honor these `bytheslice.config.json` keys when present (see [`skills/setup-shop/references/bytheslice-config-schema.md`](../setup-shop/references/bytheslice-config-schema.md)):

- `stages.maxTasksPerStage` — passed to phased-plan-writer for the new stage(s)
- `modelTiers.complexityAssessor` — overrides this skill's complexity-assessor model
- `hitl.additionalCategories` — additional bubble-up categories the assessor may use

## Flow Detection

Run this detection before doing any work. It picks one of three paths.

```
1. Does docs/plans/00_master_checklist.md exist?
   Yes → Path A (ByTheSlice-built project — proceed with feature addition)
   No  → continue to step 2

2. Does package.json exist in the working directory?
   Yes → Path B (existing app, not ByTheSlice — redirect to /bytheslice:setup-shop
                  for config + CI/CD baseline before re-invoking special-order)
   No  → Path C (no project on disk — redirect to /bytheslice:setup-shop for
                  full bootstrap before any feature work)
```

Announce which path applies and why before continuing.

---

## Path A — ByTheSlice-built project (assess → write stages → handoff)

### Phase 0 — Orientation

1. Read `docs/plans/00_master_checklist.md` — get the list of every existing stage and its status.
2. Read every `docs/plans/stage_*.md` quickly (frontmatter only — `name`, `type`, `slice`, `mvp`, `depends_on`, `completion_criteria`).
3. Find the highest existing stage number. New stages will start at `<highest> + 1`.
4. Read the original PRD at `docs/prd-*.md` if present — useful for the "don't drift outside scope" check, but NOT required.
5. Read `bytheslice.config.json` at the project root if present.
6. Read the project rules file (`CLAUDE.md` or `AGENTS.md`).
7. Confirm git state: `git status --short`, `git rev-parse --abbrev-ref HEAD`. Should be clean and on `main`.
8. Switch to **Plan Mode**.

### Phase 1 — Feature elicitation (Plan Mode)

Ask the user with `ask_user_input_v0`, one question at a time.

**Always provide a recommended answer in available options.**

**Q-features**
> "What feature(s) do you want to add? List each as a one-line summary. (You can paste multiple — one per line.)"
> text_input: multiline

**Q-relationship**
> "For each feature: is it brand-new, or does it extend something already built?"
> single_select: ["All brand-new", "All extending existing features", "Mix — I'll annotate per-feature"]
> If "Mix": follow-up text input asking the user to label each feature line as `[new]` or `[ext: <existing-feature>]`.

**Q-conventions**
> "Should the new feature(s) follow the existing patterns (project rules file + recent stage conventions), or do you have new patterns to introduce?"
> single_select: ["Follow existing conventions", "Introduce new patterns (I'll specify in next step)"]
> If "Introduce new": follow-up text input asking the user to describe.

**Q-mvp-band**
> "Mark new stages as `mvp: true` (Phase 1 / immediate ship) or `mvp: false` (Phase 2 / later batch)?"
> single_select: ["mvp: true — ship immediately", "mvp: false — batch as Phase 2", "Mix — let me annotate per-feature"]

**Q-pr-style**
> "Open PRs against `main` directly, or against an integration branch?"
> single_select: ["main (one PR per stage, default)", "integration branch (specify name in next step)"]

Confirm answers before proceeding.

### Phase 2 — Complexity assessment

Dispatch `bytheslice:complexity-assessor` ([definition](agents/complexity-assessor.md); fallback on hosts without plugin agents: Read the file and pass its body as the prompt). Pass:
- The user's feature list (from Q-features) plus annotations
- The relationship answer (Q-relationship) per feature
- The `mvp:` band per feature (Q-mvp-band)
- The conventions choice (Q-conventions)
- The current highest stage number
- Frontmatter excerpts from the most-recent 3-5 stages (for pattern matching)
- The `bytheslice.config.json` (esp. `stages.maxTasksPerStage`)
- The project rules file path
- The PRD path if present (read-only)

The assessor returns a per-feature recommendation: single-stage or multi-stage, with proposed stage names, types, slices, dependencies, and estimated tasks.

### Phase 3 — Surface assessment + user authorization

Render the assessor's output as a compact table:

```
┌──────────────────┬────────────┬────────┬────────────────────────────────┐
│ Feature          │ Complexity │ Stages │ Stage names (proposed)         │
├──────────────────┼────────────┼────────┼────────────────────────────────┤
│ Reviews on       │ multi      │ 2      │ stage_28 reviews-shell         │
│ product page     │            │        │ stage_29 reviews-data          │
├──────────────────┼────────────┼────────┼────────────────────────────────┤
│ CSV export       │ single     │ 1      │ stage_30 admin-csv-export      │
└──────────────────┴────────────┴────────┴────────────────────────────────┘
```

End with: **"Authorize this stage breakdown? (yes / edits / cancel)"** and wait. Do not proceed until the user says yes.

If the user requests edits, re-dispatch the assessor with the user's feedback. Cap at 2 re-assessment rounds; on round 3 → bubble HITL `prd_ambiguity`.

### Phase 4 — Write stage files

Dispatch `bytheslice:phased-plan-writer` ONCE PER NEW STAGE in **incremental mode** ([definition](../cook-pizzas/agents/phased-plan-writer.md); fallback: read-and-paste). Pass:
- Stage number, short name, output path (`docs/plans/stage_<N>_<slug>.md`)
- One-sentence goal
- `mvp:` flag from Q-mvp-band
- Scope: in-scope tasks list (≤ `stages.maxTasksPerStage`, default 6)
- Context: feature description + complexity-assessor rationale + relationship to existing features + similar-stage frontmatter for pattern matching
- Auth-tagged? If yes, the writer auto-injects the dev-mode auth helpers task — localhost auto-login (opt-in via `DEV_AUTH_BYPASS`) + user switcher banner, as one combined task (per [`auth-dev-mode-switcher-task.md`](../cook-pizzas/references/canned-stages/auth-dev-mode-switcher-task.md))
- Dependencies: stages this new feature depends on (from `depends_on:` frontmatter — usually `[]` or just the design-system + db-schema foundation stages already built)
- The project rules file path

Dispatch all per-stage writers in parallel where independent; sequentially where one stage depends on another being defined first.

**Verify Exit-criteria contract before accepting each writer's output.** Every new stage file's body MUST end with an `**Exit criteria:**` block where each bullet is transcript-verifiable, binary, and specific to the slice (per [`../cook-pizzas/references/templates.md`](../cook-pizzas/references/templates.md) → "Exit-criteria contract (consumed by `/goal`)"). This block is what `/bytheslice:sell-slice` Phase 2.5 lifts into the session-scoped `/goal` — vague lines like "tests pass" or "looks good" break the goal evaluator. If a writer's output has weak Exit criteria, re-dispatch with a critique citing the contract. Cap at 2 re-write rounds; on round 3 → bubble HITL `prd_ambiguity`.

### Phase 5 — Update master checklist

Append the new stages to `docs/plans/00_master_checklist.md`:

```markdown
## Stage 28 — reviews-shell
Status: Not Started
Type: frontend
Slice: vertical
MVP: true
Depends on: 1, 4
Completion criteria:
  - tests_passing
  - <other criteria from the new stage frontmatter>

## Stage 29 — reviews-data
Status: Not Started
[etc.]
```

Use the same checklist row format as the existing stages in the file. Do NOT alter completed stages' rows.

### Phase 6 — Commit + Handoff

1. **Stage and commit the new plan files** on a `chore/add-stages-<lo>-<hi>` branch (e.g. `chore/add-stages-28-30` for three new stages 28–30):
   - Create the branch off `main`: `git checkout -b chore/add-stages-<lo>-<hi>`
   - Stage every new `docs/plans/stage_<n>_*.md` file plus the modified `docs/plans/00_master_checklist.md`
   - Conventional commit: `chore: add stages <lo>-<hi> (<feature names>)` with a body listing each new stage and its `type:` / `mvp:` flag
   - Working tree should be clean on the branch after this commit
2. **Do NOT push or open a PR from this skill.** That's `/bytheslice:box-it-up`'s responsibility — keeping the same separation as `/sell-slice`.
3. Print the handoff message:

> Stage(s) added to `docs/plans/00_master_checklist.md` and committed on branch `chore/add-stages-<lo>-<hi>`:
> - `stage_28_reviews-shell.md` (frontend, mvp)
> - `stage_29_reviews-data.md` (full-stack, mvp)
> - `stage_30_admin-csv-export.md` (backend, mvp)
>
> **Next steps (pick one):**
> - **Ship the plan changes as a chore PR first** (recommended for clean separation): run `/bytheslice:box-it-up`. The plan-only PR opens, CI runs (lint / link-check on the new files), you approve merge, the chore branch is cleaned up. Then start a fresh chat and run `/bytheslice:sell-slice` to ship the first new stage.
> - **Skip the chore PR — start delivery immediately**: switch back to `main` (`git checkout main`), then run `/bytheslice:sell-slice`. The first slice's PR will mix the new plan files with the implementation.
> - **Multi-stage autonomous delivery (experimental)**: `/bytheslice:run-the-day` drives every new stage end-to-end with per-stage approval pauses. Best for batches you want shipped without per-stage babysitting.
>
> All new stages will go through the full CI gate (`@feature` + `@regression-core` + `@visual` + design-system-compliance + db-schema-drift if applicable). Visual + design-system-compliance gates require the project to have already run `/bytheslice:final-quality-check` — if absent, the orchestrator will surface that and ask whether to scaffold first.

Return.

---

## Path B — Existing app, not ByTheSlice-built

**Detection:** `package.json` exists, `docs/plans/` does NOT exist.

Print to the user:

> This project has a `package.json` but no `docs/plans/` — it wasn't built with ByTheSlice.
>
> Before adding features through ByTheSlice, run `/bytheslice:setup-shop` first. It will:
> 1. Drop in a per-project `bytheslice.config.json` (Step 2 of Setup)
> 2. Check for CI/CD baseline and offer to scaffold it via `/bytheslice:final-quality-check` if missing (Step 3 of Setup, new in v2.2)
>
> After setup completes, re-invoke `/bytheslice:special-order` and I'll detect the new state and proceed with Path A — but note: without an existing `docs/plans/` and a master checklist of completed work, I'll be working with a much narrower context. You may want to first run `/bytheslice:create-menu` against the EXISTING app's known surface area to give the complexity assessor better grounding.

Bubble HITL:

```yaml
status: needs_human
summary: Existing project detected (has package.json) but not ByTheSlice-built (no docs/plans/). Redirecting to /bytheslice:setup-shop before feature addition can proceed.
artifacts: []
needs_human: true
hitl_category: prd_ambiguity
hitl_question: "Run /bytheslice:setup-shop first to add the config + CI/CD baseline, then re-invoke /bytheslice:special-order?"
hitl_context: "No docs/plans/00_master_checklist.md found in working directory; package.json present at <path>."
```

Then return.

---

## Path C — No project on disk

**Detection:** Neither `package.json` nor `docs/plans/` exists.

Print:

> No project detected in this directory. Run `/bytheslice:setup-shop` first — it will scaffold a fresh Next.js single-app or Turborepo monorepo (Flow B) and drop in the per-project config. Once a project exists, run `/bytheslice:create-menu` for new builds, or `/bytheslice:special-order` once you have a master checklist to extend.

Bubble HITL:

```yaml
status: needs_human
summary: No project on disk. Redirecting to /bytheslice:setup-shop for project bootstrap.
artifacts: []
needs_human: true
hitl_category: prd_ambiguity
hitl_question: "Run /bytheslice:setup-shop to scaffold a new project, then run /bytheslice:create-menu to start the full PRD-to-app flow?"
hitl_context: "Working directory has no package.json and no docs/plans/."
```

Then return.

---

## Hard Constraints

- **Never invent a master checklist.** Only Path A operates on existing `docs/plans/`. Paths B and C ALWAYS redirect to setup.
- **Never alter completed stage rows.** special-order only APPENDS new stages. Existing stages are read-only context.
- **One slice per PR is still the rule.** Pass `pr_style` from Q-pr-style to phased-plan-writer; default is one PR per stage.
- **Honor `stages.maxTasksPerStage`** from `bytheslice.config.json` (default 6). The complexity-assessor uses this when proposing breakdowns.
- **Auth-tagged stages must inject the dev-mode auth helpers task** — one combined task with two sub-bullets (localhost auto-login + user switcher banner) that ship together. This is mandatory per [`auth-dev-mode-switcher-task.md`](../cook-pizzas/references/canned-stages/auth-dev-mode-switcher-task.md). The phased-plan-writer handles this in incremental mode the same way it does in cook-pizzas mode.
- **Out-of-scope guard.** If the user proposes features that contradict the original PRD's "Out of Scope" section (Section 7), surface as HITL `prd_ambiguity` BEFORE writing any stage files.

---

## Completion Checklist

[ ] Detection ran and announced the chosen path
[ ] (Path A only) Phase 0 orientation complete (master checklist read, recent stages scanned, git state clean)
[ ] (Path A only) Plan-mode question gate ran (Q-features, Q-relationship, Q-conventions, Q-mvp-band, Q-pr-style)
[ ] (Path A only) Complexity assessor dispatched and returned
[ ] (Path A only) Assessment surfaced to user; user authorization received
[ ] (Path A only) phased-plan-writer dispatched once per new stage (incremental mode)
[ ] (Path A only) Master checklist updated with new stage rows (existing rows untouched)
[ ] (Path A only) New plan files + master-checklist update committed on a `chore/add-stages-<lo>-<hi>` branch (no push, no PR — handed off to `/bytheslice:box-it-up`)
[ ] (Path A only) Handoff message printed with the three next-step options (`/box-it-up` for plan-only chore PR / direct `/sell-slice` / `/run-the-day` for batch)
[ ] (Path B only) HITL bubble surfaced; user redirected to /bytheslice:setup-shop
[ ] (Path C only) HITL bubble surfaced; user redirected to /bytheslice:setup-shop for bootstrap

---

## Sub-agent return contract

```yaml
status: complete | failed | needs_human
summary: <one paragraph>
artifacts:
  - <list every new stage file path created>
  - docs/plans/00_master_checklist.md (if Path A and updated)
needs_human: false | true
hitl_category: null | "prd_ambiguity" | "external_credentials" | "destructive_operation" | "creative_direction"
hitl_question: null | "<plain-language question>"
hitl_context: null | "<what triggered this>"
```
