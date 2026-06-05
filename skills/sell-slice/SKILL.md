---
name: sell-slice
description: Sell a customer their slice — the high-touch single-slice delivery loop. Execute one slice from your master checklist as an interactive spine (prep gate · recon · build-plan auth · /goal · branch) + Workflow A (produce) + library gate + Workflow B (verify-once). Run me repeatedly, one fresh chat per slice. For autonomous whole-pie baking use /sell-pie.
user-invocable: true
triggers: ["/bytheslice:sell-slice", "/sell-slice", "sell a slice", "serve a customer", "bake the slice", "/bytheslice:deliver-stage", "/deliver-stage", "deliver the next stage", "ship the next slice", "work the checklist"]
---
<!-- skills/sell-slice/SKILL.md -->
<!-- The high-touch single-slice delivery loop. Pizza-shop framing: pull one pie off the rack, run it through the line, slice and serve to one customer. v5 shape: an interactive spine (prep gate · recon · build-plan auth · /goal · branch) wrapping Workflow A (produce — the builder/implementer emits the build manifest) + a human library gate + Workflow B (verify-once = state-illustrator → slice-tester → slice-verifier, with an off-context fix loop). Each static gate runs exactly once. /box-it-up is the handoff. For autonomous whole-roadmap baking, /sell-pie loops one Pie unattended; /sell-slice is the careful per-slice surface. -->

# /sell-slice — The High-Touch Single-Slice Delivery Loop

The agent loading this skill is the **orchestrator** for one slice of the master checklist. It reads plans, scopes the slice, dispatches subagents through **Workflow A (produce)** and **Workflow B (verify-once)**, merges their structured returns, and gates the slice on real verification before it is committed locally.

**The orchestrator does not write production code itself.** Every heavy step is a subagent or a sub-skill. The orchestrator routes structured artifacts; it never grades its own output.

Run `/sell-slice` → finish a slice → start a fresh chat → run again. Repeat until every row in `docs/plans/00_master_checklist.md` is `[x]`. For **autonomous whole-pie baking** (the v5 forefront), see [`/sell-pie`](../sell-pie/SKILL.md) — it loops one Pie unattended and stops at the pie boundary; `/sell-slice` is the careful, collaborative single-slice surface. For mid-flight feature additions, see [`/special-order`](../special-order/SKILL.md) (it feeds into `sell-slice`).

---

## Mode detection

`/sell-slice` is **sequential-only** — it requires a master checklist to know which slice to serve next. If `docs/plans/00_master_checklist.md` is missing, the skill stops and points the user at [`/cook-pizzas`](../cook-pizzas/SKILL.md) (to generate one) or [`/special-order`](../special-order/SKILL.md) (to add a slice to an existing project).

`/sell-slice` works on **both** layouts (dual-read):

- **v5 nested** — `## Pie N` chapters containing `### Slice N.M` deliverables. `/sell-slice` serves one `### Slice N.M` at a time. (Whole-pie autonomous runs are `/sell-pie`'s job; `/sell-slice` stays at one slice even inside a nested checklist.)
- **v4 / legacy flat** — `## Stage N`. `/sell-slice` serves one stage at a time, exactly as it did pre-v5. (Unlike `/sell-pie`, which **refuses** a flat checklist, `/sell-slice` runs flat projects unchanged — no `--repie` required.)

Throughout this skill, "slice" means the active unit of work — a `### Slice N.M` on a nested checklist or a `## Stage N` on a flat one.

The Phase 0 Prep-section precondition further requires every `## Prep` checkbox to be `[x]` before any feature slice can run. See Phase 0 for the helpful-error message.

## Subagent Roster

Each subagent lives in its own file under `./agents/`. **Read the file before dispatching.**

### Core (every slice type)

| Stage | Agent file | Model | Effort | Mode |
|-------|-----------|-------|--------|------|
| Recon | [agents/discovery.md](agents/discovery.md) | haiku | medium | readonly |
| Recon | [agents/checklist-curator.md](agents/checklist-curator.md) | sonnet | medium | readonly |
| Recon | [agents/rules-loader.md](agents/rules-loader.md) | haiku | low | readonly |
| Workflow A — produce (backend/full-stack/db-schema/infrastructure) | [agents/implementer.md](agents/implementer.md) (the **builder** — emits the build manifest) | opus | xhigh | write |
| Workflow A — per-item review | [agents/spec-reviewer.md](agents/spec-reviewer.md) | sonnet | medium | readonly |
| Workflow A — per-item review | [agents/quality-reviewer.md](agents/quality-reviewer.md) | opus | high | readonly |
| Workflow B — verify-once (behavior) | [agents/slice-tester.md](agents/slice-tester.md) | sonnet | high | write |
| Workflow B — verify-once (static gates, each once) | [agents/slice-verifier.md](agents/slice-verifier.md) | sonnet | high | write |
| Fix loop (off-context) | [agents/fix-attempter.md](agents/fix-attempter.md) | sonnet | high | write |
| Fix loop (2nd fail) | [agents/debug-instrumenter.md](agents/debug-instrumenter.md) | sonnet | high | write |

### Frontend pipeline (Workflow A, `type: frontend`)

| Step | Agent file | Model | Mode |
|------|-----------|-------|------|
| UX strategy ‖ layout (parallel) | [agents/frontend/modern-ux-expert.md](agents/frontend/modern-ux-expert.md) | sonnet | write |
| UX strategy ‖ layout (parallel) | [agents/frontend/layout-architect.md](agents/frontend/layout-architect.md) | sonnet | write |
| Compose (always) | [agents/frontend/block-composer.md](agents/frontend/block-composer.md) | sonnet | write |
| Craft (conditional on gaps) | [agents/frontend/component-crafter.md](agents/frontend/component-crafter.md) | sonnet | write |
| Library Preview Gate | [agents/frontend/library-entry-writer.md](agents/frontend/library-entry-writer.md) | sonnet | write |
| State coverage (Workflow B entry) | [agents/frontend/state-illustrator.md](agents/frontend/state-illustrator.md) | sonnet | write |

> **Behavioral + rendered review is `slice-tester`'s job; static gates are `slice-verifier`'s.** The v4 frontend `visual-reviewer` is **deprecated** — its rendered design-system match folded into `slice-tester` and its console/network checks are part of the same behavioral pass.

### Deprecated / shimmed (NOT live-dispatched in v5 — retained for v4 back-compat through 5.1)

These three static verifiers collapsed into [`slice-verifier`](agents/slice-verifier.md) (C5), and the frontend visual reviewer folded into [`slice-tester`](agents/slice-tester.md). The orchestrator **does not dispatch** them; they remain on disk only so v4 flat projects mid-migration keep working.

| Deprecated agent | Replaced by |
|---|---|
| [agents/basic-checks-runner.md](agents/basic-checks-runner.md) | `slice-verifier` (lint / typecheck / build) |
| [agents/aggregating-test-reviewer.md](agents/aggregating-test-reviewer.md) | `slice-verifier` (static half) + `slice-tester` (behavioral / rendered half) |
| [agents/ci-cd-guardrails.md](agents/ci-cd-guardrails.md) | `slice-verifier` (CI-integrity check) |
| [agents/frontend/visual-reviewer.md](agents/frontend/visual-reviewer.md) | `slice-tester` (rendered design-system match + affordance UAT) |

### Sub-skill dispatches (Workflow A, foundation slice types — legacy v3 projects only)

| Slice `type` | Sub-skill (path) |
|---|---|
| `design-system` | [`skills/set-display-case/SKILL.md`](../set-display-case/SKILL.md) |
| `ci-cd` | [`skills/final-quality-check/SKILL.md`](../final-quality-check/SKILL.md) |
| `env-setup` | [`skills/open-the-shop/SKILL.md`](../open-the-shop/SKILL.md) |

---

## Preconditions

> Enforced by `hooks/precheck-skill.sh` (UserPromptSubmit) **when hooks are active**. The hook BLOCKs if the checklist is missing and WARN-injects on dirty tree / incomplete Prep section. If `BTS_HOOKS_DISABLED=1` or Claude Code's `disableAllHooks` is set, the hook is observably off — run the three checks below inline via tools and proceed silently. The preconditions are required either way; only the enforcement layer is optional. Never narrate the checks in chat.

- `docs/plans/00_master_checklist.md` exists.
- One or more `docs/plans/stage_<n>_*.md` exist (one slice plan reachable for the active unit).
- Clean git working tree, OR explicit user OK to proceed dirty.
- Slice/stage plan files (`docs/plans/stage_*.md`) are write-protected during this skill by `hooks/stage-plan-guard.sh` (WARN in v5 — downgraded from BLOCK); production-route edits without a recorded library approval surface a warning via `hooks/library-gate-guard.sh`.

---

## Project Config

If `bytheslice.config.json` exists at the project root, the `rules-loader` agent (recon) reads it and returns resolved values. Honor:

- `modelTiers.<agent>` — overrides the agent file's `model:` for THIS run (`sliceTester`, `sliceVerifier` are the v5 verification tiers; `ciCdGuardrails` / `basicChecksRunner` / `aggregatingTestReviewer` are deprecated aliases of `sliceVerifier`).
- `stages.maxTasksPerStage` — overrides the default cap of 6 (warn if user sets > 8).
- `verification.viewports` *(int[], default `[375, 1280]`)* — the widths `slice-tester` renders/screenshots `frontend` slices at (**C7**). Pass this to `slice-tester` instead of any hardcoded viewport list.
- `verification.e2e.{feature,regressionCore,visual}` *(each `"always" | "critical-only" | "off"`)* — threshold-gates which e2e suites `slice-verifier` runs by tag (**C10**). Pass the resolved values to `slice-verifier`; it gates before running anything.
- `flow.autoApproveBuildPlan` *(bool, default `false`)* — when `true`, skip the build-plan authorization stop (**C9** — also **always** auto under the `/sell-pie` loop).
- `flow.libraryGate` *(`"self-critique" | "human" | "off"`, default `"self-critique"`)* — controls the net-new-component library gate behavior (see Workflow A library gate).
- `mcps.*` — declarative MCP availability.
- `visualReview.tools` — ordered tooling priority passed to `slice-tester`.

See [`skills/setup-shop/references/bytheslice-config-schema.md`](../setup-shop/references/bytheslice-config-schema.md) for the full schema.

---

## Slice-Type Routing

Workflow A routes the work based on the active slice's `type:` frontmatter:

| `type:` | Workflow A path |
|---|---|
| `design-system` | Dispatch the `set-display-case` sub-skill (legacy v3 only). Skip the internal builder. |
| `ci-cd` | Dispatch the `final-quality-check` sub-skill (legacy v3 only). Skip the internal builder. |
| `env-setup` | Dispatch the `open-the-shop` sub-skill (legacy v3 only). Skip the internal builder. |
| `frontend` | Run the internal frontend pipeline (`modern-ux-expert ‖ layout-architect` → block-composer → component-crafter → library gate). |
| `backend` | Dispatch the internal `implementer` (builder). |
| `full-stack` | Dispatch the internal `implementer` (covers both UI and API code). |
| `db-schema` | Dispatch the internal `implementer` with DB context flag. Schema updated FIRST in `db/schema.sql` (or detected equivalent). |
| `infrastructure` | Dispatch the internal `implementer`. |

After Workflow A, **Workflow B** (verify-once) runs regardless of slice type, type-routed inside `slice-tester` (frontend = rendered + affordance UAT; full-stack/backend = seed-and-cleanup data-flow; infrastructure = probe/harness).

---

## Workflow availability (CC-only primitives)

`/goal` and `Workflow` (`parallel()` / `pipeline()`) are **Claude-Code-only** primitives. Detect availability up front; if either is absent (Cursor, `disableAllHooks`, workspace-trust not accepted, or any other reason the primitive surfaces), **fall back — do not silently drop the logic:**

- **`/goal` unavailable** → fall back to the manual goal-tracking pattern in [`../cook-pizzas/references/goal-fallback-pattern.md`](../cook-pizzas/references/goal-fallback-pattern.md) (Phase 2.5 below wires this in).
- **`Workflow` unavailable** → fall back to **in-context dispatch with orchestrator-side manual schema validation** per [`../cook-pizzas/references/loop-workflow-fallback-pattern.md`](../cook-pizzas/references/loop-workflow-fallback-pattern.md). Without `Workflow`'s built-in schema enforcement, the orchestrator MUST validate each subagent's structured return against its Appendix-A/B/C schema by hand before consuming it — otherwise enforcement is lost.

The house phrasing for any Workflow-backed step below is: *"Run as a `Workflow` (`parallel()` / `pipeline()`); if `Workflow` is unavailable, fall back per `loop-workflow-fallback-pattern.md`."*

---

## Workflow

The skill is an **interactive spine** (Phases 0–3) wrapping two Workflows and one human gate:

- **Spine:** prep gate (Phase 0) · recon (Phase 1) · build-plan auth (Phase 2, auto under loop / `flow.autoApproveBuildPlan`) · `/goal` (Phase 2.5) · branch (Phase 3).
- **Workflow A — produce** (Phase 4): build the slice + its unit tests; the builder emits the **build manifest**. Backend items pipeline / parallelize; frontend runs `modern-ux-expert ‖ layout-architect`.
- **Library gate** (Phase 4.5, human): net-new-component preview-first approval.
- **Workflow B — verify-once** (Phase 5): `state-illustrator → slice-tester → slice-verifier`, each static check exactly once, with an **off-context fix loop**.
- **Closeout** (Phase 6).

### Phase 0 — Orientation (interactive spine)

1. Read `docs/plans/00_master_checklist.md` and every `docs/plans/stage_*.md`. Detect the layout (nested `## Pie N` / `### Slice N.M` vs flat `## Stage N`) — dual-read; both are valid.
2. **Prep-section precondition.** If the master checklist has a `## Prep` section, verify every Prep checkbox is `[x]` before any feature slice can run. If any Prep box is `[ ]`, STOP and surface a helpful message:
   > *"Prep step '`<unchecked line>`' is still pending. Run `<the linked command>` first, then come back."*
   This precondition does NOT apply to legacy projects that pre-date the Prep section — those keep the v3 behavior where foundation stages live as `stage_1_*` / `stage_2_*` / `stage_3_*` plan files routed through Workflow A (see Legacy path note in Phase 4).
3. Identify the **active slice**: first slice/stage with status `Not Started` or `In Progress`, unless the user named one.
4. Confirm git state: `git status --short`, `git rev-parse --abbrev-ref HEAD`.
5. Detect `/goal` and `Workflow` availability (per "Workflow availability" above); note the fallback that will apply if either is absent.
6. Switch to **Plan Mode** before continuing.

### Phase 1 — Reconnaissance (parallel)

Dispatch in one batch:

1. `discovery` — codebase recon
2. `checklist-curator` — slice scoping + checklist diff proposal
3. `rules-loader` — project rules file + `bytheslice.config.json` resolution (returns the resolved `verification.*` and `flow.*` values Workflow B / the build-plan gate consume)

Merge their reports into the Build Plan in Phase 2.

### Phase 2 — Build Plan + User Authorization

Present a compact plan:

1. Active slice + slice name + slice `type:`
2. In-scope checklist items with acceptance tests (the slice's **Exit criteria**)
3. Out-of-scope items being deferred
4. Touched modules + blast-radius highlights
5. Sub-skill or pipeline that will run in Workflow A
6. Branch / worktree name
7. MCP availability + visual-review tools + resolved `verification.viewports` / `verification.e2e.*`
8. Forward-reference risks, open questions

**Build-plan authorization (C9 — auto-approve under loop).** End with **"Authorize this build plan? (yes / edits / cancel)"** and wait. Workflow A does not start until the user says yes.

**Skip this stop — proceed straight to Phase 2.5 — when EITHER:**
- this `/sell-slice` is running **under the `/sell-pie` loop** (the pie-level autonomy already authorized the run), OR
- `flow.autoApproveBuildPlan` is `true` in the resolved config.

In the auto-approve case, log a one-line note instead of stopping: *"Build plan auto-approved (`<reason: /sell-pie loop | flow.autoApproveBuildPlan>`); proceeding to Workflow A."* — then continue. The plan is still rendered for the record; only the human stop is skipped.

**Always provide a recommended answer in available options** when prompting.

If discovery surfaced ambiguous symbol locations, ask the user to clarify before re-dispatching, or proceed with their blessing (unless auto-approving, in which case proceed with the discovery default and note the assumption).

### Phase 2.5 — Set slice-completion goal (conditional)

After build-plan authorization (or auto-approval) and before Phase 3, the orchestrator considers setting a session-scoped `/goal` for this slice. The goal's prompt-based Stop hook keeps the orchestrator moving through Workflow A → library gate → Workflow B → closeout without per-turn user re-prompting; HITL gates (Library Preview HARD STOP in Phase 4.5, the off-context fix loop in Workflow B) still end turns naturally and the evaluator returns "not yet" until they resolve.

**Pre-check — parent goal coordination.** Invoke `/goal` with no argument to read the current session-goal state.

- **If a goal is already active**, this skill is running under `/sell-pie` (or another wrapper). The parent goal subsumes the per-slice condition. **Skip the slice-goal set** and continue to Phase 3. Log: `Parent session goal active (sell-pie); sell-slice will not set its own.`
- **If no goal is active**, proceed to set the slice-goal below.
- **If `/goal` is unavailable** (Cursor, workspace-trust not accepted, `disableAllHooks` / `allowManagedHooksOnly`, or any other reason the slash command surfaces), **fall back to the manual goal-tracking pattern** in [`../cook-pizzas/references/goal-fallback-pattern.md`](../cook-pizzas/references/goal-fallback-pattern.md). Do NOT silently continue without a goal — the fallback is "manual tracking," not "no tracking." On activation: (a) WebFetch [`https://code.claude.com/docs/en/goal.md`](https://code.claude.com/docs/en/goal.md) so the canonical evaluator pattern is in context, (b) build the same condition string this phase would have passed to `/goal`, (c) self-evaluate against the transcript after each phase completion (Workflow A → library gate → Workflow B → closeout), (d) surface a one-line progress note periodically. Log up front: *"`/goal` is unavailable (`<reason>`); falling back to manual goal-tracking against the Exit criteria — see [goal-fallback-pattern.md](../cook-pizzas/references/goal-fallback-pattern.md) for the protocol."*

**Goal condition.** The condition is **lifted from the active slice's `**Exit criteria:**` block** — the same block `/cook-pizzas` (or `/special-order`) wrote when the slice was scaffolded. The Exit-criteria contract (see [`../cook-pizzas/references/templates.md`](../cook-pizzas/references/templates.md) → "Exit-criteria contract") guarantees every line is transcript-verifiable, binary, and specific to this slice.

Build the `/goal` condition string in this exact order:

1. **Header** — one sentence: `Slice <SLICE_ID> (<slice name>) at <slice_file_path> is ready for review locally:`
2. **Lifted Exit criteria** — copy every bullet from the slice's `**Exit criteria:**` block verbatim, preserving order. If the slice is `backend` / `db-schema` / `infrastructure` with zero UI surface (or a pure internal refactor with no rendered-output delta), drop the Library Preview Gate line if present.
3. **Pipeline-level constraints** — append exactly these three lines:
   - `master checklist row for slice <SLICE_ID> in docs/plans/00_master_checklist.md shows Status: Completed`
   - `working tree clean on the slice branch with the slice committed locally; not yet pushed`
   - `Pause on any HITL bubble surfaced by the orchestrator (Library Preview Gate, fix-loop exhaustion, prd_ambiguity, external_credentials, destructive_operation, creative_direction)`
4. **Turn cap** — append: `Stop after 40 turns if not yet complete.`

**Missing Exit criteria block.** If the slice file does NOT have a well-formed `**Exit criteria:**` block (or it contains vague non-transcript-verifiable lines like "tests pass" or "looks good"), **do not invent one**. Surface as `prd_ambiguity` HITL: *"The slice plan at `<path>` is missing transcript-verifiable Exit criteria — `/goal` cannot be set with confidence. Re-open `/cook-pizzas` (or `/special-order`) to regenerate the slice with proper exit criteria per the contract, then re-authorize this build plan."* If the user explicitly chooses to skip, proceed without a goal and continue phase-by-phase under manual prompting.

Invoke `/goal <full condition string>`. Log: `Slice-completion goal set for slice <SLICE_ID> (lifted N lines from Exit criteria).`

**Clearing the goal:**
- On normal Phase 6 closeout, the evaluator auto-clears the goal once the condition is met — no action needed.
- On a HITL bubble where the user abandons the slice (e.g. answers "cancel" to a re-dispatch prompt), the orchestrator MUST invoke `/goal clear` before returning control.
- On fix-loop exhaustion in Workflow B, the orchestrator bubbles HITL with full evidence — the goal stays active so the loop resumes if the user resolves it. Only clear the goal if the user explicitly abandons the slice.

### Phase 3 — Branch / Worktree Setup

- Branch naming: `feat/stage-<n>-<scope>` | `fix/stage-<n>-<scope>` | `chore/stage-<n>-<scope>` (on a nested checklist, the slice commits land on the **pie branch** when running under `/sell-pie`; standalone `/sell-slice` uses the per-slice branch above).
- Prefer a git worktree per active slice/pie, cut from the **freshly-fetched `origin/main`** (never local `main`, which may be stale): `git fetch origin` then `git worktree add -b feat/stage-<n>-<scope> <path> origin/main`. Never implement directly on `main`/`master`. Worktree setup, isolation, merge, and cleanup follow [`../cook-pizzas/references/git-worktree-standard.md`](../cook-pizzas/references/git-worktree-standard.md).
- One checklist slice per commit; per-slice work does **not** open a PR (that is the pie boundary's job, handled by `/box-it-up`).

### Phase 4 — Workflow A (produce)

Per the routing table above. **The builder writes the slice + its unit tests and emits the build manifest** (§Appendix A); it does **not** behaviorally review its own work and does **not** run the e2e ladder.

#### `design-system` / `ci-cd` / `env-setup` — Legacy sub-skill dispatch (v3 projects only)

> **Note:** In v4/v5, foundation stages (design-system / ci-cd / env-setup) are no longer scaffolded as plan files by `/cook-pizzas`. New projects run `/set-display-case`, `/final-quality-check`, and `/open-the-shop` directly from the master checklist's Prep section — they don't pass through `/sell-slice`.
>
> This path exists for **legacy v3 projects** whose checklist still has `stage_1_*`, `stage_2_*`, `stage_3_*` plan files. In that case, `/sell-slice` loads the corresponding foundation skill end-to-end as a sub-skill, records the artifacts, and proceeds to Workflow B. One-line note to the user: *"Detected legacy `type: <X>` stage — dispatching `/<new-name>` as a sub-skill. v4/v5 projects skip this routing entirely."*

Load the corresponding sub-skill SKILL.md and follow it end-to-end. The sub-skill returns the structured contract; the orchestrator records the artifacts and proceeds to Workflow B.

#### `frontend` — Internal frontend pipeline

Run as a `Workflow`; if `Workflow` is unavailable, fall back per `loop-workflow-fallback-pattern.md`.

1. **`modern-ux-expert` ‖ `layout-architect`** — **Dispatch in one batch (parallel):** UX strategy (`docs/ux-spec-<slice>.md`, 2–3 best-in-class references) ‖ route files + layout components + breakpoint plan. They have no ordering dependency; run them together.
2. **`block-composer`** (always first among the compose step) → composes from shadcn blocks; reports `ui_coverage_percent`.
3. **`component-crafter`** (only if `block-composer` reports gaps) → token-only custom components.
4. **Library Preview Gate (Phase 4.5)** — see below.

The frontend producers do not write the four UI states or behaviorally verify — `state-illustrator` (Workflow B entry) fills the states and `slice-tester` does the rendered + affordance review.

#### `backend` / `full-stack` / `db-schema` / `infrastructure` — Internal builder

Run as a `Workflow` (`pipeline()` per item; independent items may `parallel()`); if `Workflow` is unavailable, fall back per `loop-workflow-fallback-pattern.md`. For each in-scope checklist item, in dependency order:

1. Dispatch the **implementer** (builder). For `db-schema` and `full-stack` involving DB: schema is updated FIRST in `db/schema.sql` (or detected equivalent) before any code. The builder returns its build report **and the build manifest**.
2. Dispatch **`spec-reviewer`** with the builder's output.
3. Dispatch **`quality-reviewer`** with both prior outputs.
4. If either reviewer returns `verdict: fail`, send findings back to a fresh builder dispatch and re-review. Repeat until both `pass`.
5. Apply the curator's checklist diff for this item: flip `[ ]` → `[x]` only after both reviewers pass AND Workflow B is green for the slice.
6. The builder commits its item on the slice branch using a conventional-commit message; the orchestrator does not flip checklist rows until verification passes.

**Independent items pipeline / parallelize.** Items with no data dependency on each other may run as `parallel()` builder dispatches; dependent items chain in a `pipeline()`. Merge the per-item manifests into one slice manifest before Workflow B (the slice-level manifest is what `slice-tester` and `slice-verifier` consume).

#### Phase 4.5 — Library Preview Gate (human gate — stays)

Non-skippable, preview-first HARD STOP. Behavior is governed by `flow.libraryGate` (default `"self-critique"`):

- `"human"` — always stop for explicit human approval of net-new components (the full v4 hard gate, below).
- `"self-critique"` *(default)* — the agent self-reviews net-new components against the design system and proceeds without a human stop **unless it flags a concern** (then it surfaces the self-critique block + preview URLs and stops). Net-new components and consumer-side edits to user-visible surfaces still always route through `library-entry-writer`; only the unconditional human stop relaxes.
- `"off"` — skip the gate entirely (sensible only when the design-system Pie front-loaded all component approval).

**Trigger.** The gate fires whenever a slice (a) authors a new component or block, OR (b) modifies any user-visible surface of an existing library component (props, copy, content, variants, states, or styles) as it appears in a production route. In the modify case, the existing `/library?tab=<id>` entry must be updated to reflect the change and re-approved before the production-route edit lands. Pure internal refactors with no rendered-output delta are exempt.

**Phase 0 — Should we even build this?** `library-entry-writer` runs the extend-vs-create gate first. If it returns `phase_0.build_decision: extend_existing` or `inline_in_consumer`, **stop** and surface the recommendation (`creative_direction` HITL). The orchestrator pivots the slice scope before any new entry is written.

Dispatch `library-entry-writer` with one of two **modes** per item:
- `mode: "new"` for every component / block emitted by the compose/craft steps → appends a fresh entry: one file under `_entries/<id>-entry.tsx`, plus registrations in `_registry/tabs.ts`, `_registry/stories.tsx`, and `_registry/entries.ts`, all rendering the full variants × states matrix.
- `mode: "modify"` for every existing library component whose user-visible surface changed under condition (b) → updates the existing `_entries/<id>-entry.tsx` in place with the delta, leaving the registry rows alone unless tags or name genuinely changed.

Both modes render all variants × all states (default / hover / focus / disabled / loading / empty / error / populated) AND wire the source-path copy buttons through `<EntryHeader sourcePath=…>` / `<EntrySection sourcePath=… sourceLines=…>`.

**Discover the dev port** before surfacing URLs. Check in order: `lsof -i -P | grep LISTEN | grep node` (already-serving ports), `package.json` `scripts.dev` declared port, framework-specific port hints (`next.config.js`, `proxy.ts`). If still ambiguous, ask the user.

**HARD STOP** (when `flow.libraryGate: "human"`, or `"self-critique"` flagged a concern). Surface a single Phase 4.5 prompt that embeds:
1. The **self-critique block** from `library-entry-writer`'s output contract — skipped states, untested edge cases, close-but-not-exact tokens, untested compositions — verbatim, per entry.
2. A **clickable preview URL block**, one line per entry, in the form `http://localhost:<port>/library?tab=<id>`, with a 1-line note on what's covered.
3. The explicit ask:
   > "Library is updated. Self-critique above, preview URLs below. Click through, leave comments on anything that needs changing, and tell me whether each entry is **approved**, needs **revision**, or should be **rejected** before I wire `<component name>` into `<production route>`."

**Do not start production wiring** until the user explicitly approves (in `"human"` mode) or the self-critique cleared without concern (in `"self-critique"` mode). The cost asymmetry (rewriting a story file vs. rewriting story file + routes + server actions + types + tests) is what makes the gate worth enforcing.

- On **approved** → import the component from the library into the production route(s) named by the slice spec (or, in the modify case, land the consumer-route edit). Continue to Workflow B.
- On **revision** → re-dispatch `component-crafter` with the user's notes, then re-run 4.5 for the revised component (fresh self-critique). Cap at 2 revision loops; on the 3rd round, surface as `creative_direction` HITL and stop.
- On **rejected** → remove the entry: delete `_entries/<id>-entry.tsx`, remove the id from `_registry/tabs.ts` (`LIBRARY_TABS`), remove the import + map row from `_registry/stories.tsx` (`STORIES`), and remove the sidebar row from `_registry/entries.ts`. Surface as `creative_direction` HITL.
- **No production-route imports happen before approval.** `library-entry-writer`'s output contract requires `production_imports_added: 0`.

**Hard rules:**
- `block-composer` MUST run and report before `component-crafter` is considered. Never skip block composition.
- The library gate is non-skippable for net-new components AND for consumer-side edits to a user-visible surface of an existing library component. Library-first applies even to single-component slices and to "small" copy/prop changes.

### Phase 5 — Workflow B (verify-once)

Run as a `pipeline()` `Workflow`; if `Workflow` is unavailable, fall back per `loop-workflow-fallback-pattern.md`. **Workflow B replaces v4's Phases 6/7/8** (basic checks + aggregating test review + CI/CD guardrails) with **two agents, each gate run exactly once.**

The pipeline is **`state-illustrator → slice-tester → slice-verifier`**, with an off-context fix loop:

#### 5.1 — `state-illustrator` (frontend / full-stack with UI only)

Dispatch `state-illustrator` to ensure every interactive production surface has loading / empty / error / success states. Skip for `backend` / `db-schema` / `infrastructure` with zero UI delta. (On a pure-backend slice, Workflow B starts at 5.2.)

#### 5.2 — `slice-tester` (behavioral verification)

Boot the dev server (frontend / full-stack) and dispatch [`slice-tester`](agents/slice-tester.md). **Context-separation rule (absolute):** pass the tester **only** the build manifest + the slice's Exit criteria + the design-system path (`docs/design-system.md`) + the dev-server URL + the slice type + the DB target. **Never pass the builder's context, reasoning, or chat** — the tester must falsify the manifest's claims, not trust the builder's narrative.

Pass through the config:
- **`verification.viewports`** *(C7)* — the widths the tester renders/screenshots `frontend` slices at. Do not hardcode a viewport list; use the resolved config (default `[375, 1280]`).
- **`visualReview.tools`** — the ordered browser tooling priority.

The tester type-routes (frontend = rendered design-system match + per-affordance exercise; full-stack/backend = seed-and-cleanup data-flow with success **and** error toasts and the **bidirectional rule** on every surface; infrastructure = probe/harness). It returns the Appendix-B verdict (per-affordance + transitions + seed outcome).

> **Seed-and-cleanup is the tester's.** It writes the cleanup script first, runs the **non-prod guard** (blocks + bubbles `destructive_operation` if the DB target is not demonstrably local/dev), seeds, runs round-trips, runs cleanup in a finally block, and asserts zero residue. The orchestrator never seeds the DB itself.

#### 5.3 — `slice-verifier` (static gates, each exactly once)

Dispatch [`slice-verifier`](agents/slice-verifier.md) with the **slice diff** (branch + base SHA), the **build manifest**, the resolved **`verification.e2e.*`** thresholds (C10), the package manager + script names, the workflow inventory, the slice type, and the list of **already-green checks** (e.g. lint/type/build the builder already passed) so they are **not re-run** (C5).

It runs each atomic check once: lint · typecheck · build · unit/integration · e2e by tag (threshold-gated per `verification.e2e` — **C10**) · design-system **static grep** (raw values / non-token — the static check only; the rendered match is the tester's) · CI-integrity (no existing gate weakened) · and the **manifest under-declaration backstop** (§1.4 — independently greps the diff for `action(` / `use server` / `onClick` / `<form` / route-file additions and **fails** if the manifest under-counts). It returns the Appendix-C verdict.

#### 5.4 — Off-context fix loop

If `slice-tester.overall == fail` OR `slice-verifier.overall == fail`, route the union of their `fix_targets` to the fixer **off-context** (the fixer gets the failing verdict + evidence, not the tester's or builder's full chat):

- 1st fail → `fix-attempter` with the failing verdict(s) + evidence → re-run **only the failed half** (re-dispatch `slice-tester` if a behavioral check failed; re-dispatch `slice-verifier` for the static checks the patch could plausibly have changed — `slice-verifier` carries already-green checks forward and re-runs only what changed, C5).
- 2nd fail → `debug-instrumenter` adds targeted `// INSTRUMENT` logging → re-run the failed verifier/tester → `fix-attempter` again with the richer evidence → re-run.
- Cap 3 total loops. On 3rd persistent failure → bubble HITL with full evidence (the goal stays active so the loop resumes if the user resolves it).

After green, if `debug-instrumenter` ran, strip `// INSTRUMENT` lines and commit a "remove debug instrumentation" sweep.

**Both verdicts must be `pass`** (or a half legitimately `skipped` for the slice type) before the slice is considered verified. Do not flip the slice's checklist rows or proceed to closeout until then.

### Phase 6 — Slice Closeout

When every in-scope item is `[x]` and Workflow B is green:

1. Flip slice status `In Progress` → `Completed` in `docs/plans/00_master_checklist.md` (commit this change on the slice branch).
2. Confirm the slice branch has every commit it needs and the working tree is clean (`git status --short` empty).
3. Walk the **Completion Checklist** (below). The slice is not "ready to ship" until every box up through §4 is `[x]`.
4. Report to the user using the **Progress Report Format**, ending with the **Handoff to `/box-it-up`** message.

**This skill stops here — at "slice committed locally, ready for review."** It does NOT push, open a PR, watch CI, merge, or clean up. That's [`/box-it-up`](../box-it-up/SKILL.md)'s job — re-scoped in v5 to the **pie boundary** (per-slice = commit + push only; PR + CI + merge happen once at pie completion). Running standalone, this hand-off is intentionally separated so you can run a manual visual UAT, do a local code review, or rebase against fresh main before deciding to ship.

#### Handoff to `/box-it-up`

End your final message with:

> Slice complete on branch `<branch>` — Workflow B green (`slice-tester` + `slice-verifier` both `pass`), master checklist updated, slice committed.
>
> **Next:** Review the diff at your pace (visual UAT, manual code review, anything else). When you're ready to ship, run [`/bytheslice:box-it-up`](../box-it-up/SKILL.md). Per-slice it commits + pushes only; at the **pie boundary** it opens one PR `Pie N`, runs CI once, pauses for your merge approval, then merges (preserving per-slice commits) + syncs main + cleans up the branch and worktree.
>
> If CI fails on the pie PR, `/box-it-up`'s `ci-fix-attempter` applies targeted fixes for up to 3 attempts before bubbling to you — so the hand-off is genuinely "review and walk away" if you want it.

---

## HITL Handling

If any subagent or sub-skill returns `needs_human: true`, the orchestrator pauses and uses `ask_user_input_v0` to prompt the user. The answer is appended to the relevant context (PRD Section 6 for `prd_ambiguity`, project rules for credentials, etc.), then the dispatch is repeated.

**Subagents NEVER prompt the user directly and NEVER call `ask_user_input_v0`.** They set `needs_human: true` + the `hitl_category` / `hitl_question` / `hitl_context` fields; **only the orchestrator** calls `ask_user_input_v0`. This is the v5 contract — the prompting boundary lives at the orchestrator.

The four blocking HITL categories halt the slice (they are not auto-resolvable): `prd_ambiguity`, `external_credentials`, `destructive_operation` (most commonly the `slice-tester`'s non-prod guard blocking a seed), `creative_direction` (library gate). Any project-specific categories from `hitl.additionalCategories` surface the same way.

---

## Progress Report Format

After each item and at slice closeout:

1. Checklist items completed (with file paths)
2. Files changed (grouped by package/app)
3. Verification results: builder gate (lint / typecheck / unit / smoke), `slice-tester` verdict (per-affordance + transitions + seed/cleanup outcome), `slice-verifier` verdict (each static gate + manifest backstop counts)
4. Subagent run summary (which roles ran, Workflow A review loops, Workflow B fix-loop activity)
5. Open risks / blockers
6. Next recommended slice
7. **Closing-narrative paragraph** (UI-touching slices only) — one paragraph telling the design story: what was built · why this shape over alternatives (one or two trade-offs) · what was deliberately left out · what reviewers should pay attention to. The PR body lifts this paragraph verbatim. Without it, future readers reverse-engineer the design from the diff.

---

## Hard Constraints

- **Build plan must be authorized** before any producer subagent runs — UNLESS running under the `/sell-pie` loop or `flow.autoApproveBuildPlan` is `true` (C9), in which case it is auto-approved and logged, not stopped.
- **One slice per commit; per-slice work opens no PR.** Never bundle multiple checklist items unless the user explicitly approves it in Phase 2. The PR is opened at the pie boundary by `/box-it-up`.
- **Context separation is absolute.** The `slice-tester` receives ONLY the build manifest + Exit criteria + design-system path (+ dev URL / type / DB target). Never pass it the builder's reasoning or chat. The tester falsifies; it does not trust.
- **Each static gate runs exactly once (C5).** `slice-verifier` carries already-green checks forward; never pay for the same lint/type/build/e2e twice across the slice.
- **Viewports come from `verification.viewports` (C7); e2e thresholds from `verification.e2e` (C10).** Never hardcode a viewport list or run an e2e suite the config gated `"off"`.
- **Checklist edits only after green gates.** Do not optimistically mark items done — flip `[ ]` → `[x]` only after both reviewers pass AND Workflow B is green.
- **Subagent prompts live in `./agents/*.md`.** This SKILL.md is workflow only — never inline subagent prompts here.
- **Never modify other slice plan files** during execution. Plans are static; deviations are noted inline in the checklist.
- **HITL bubbling is mandatory and orchestrator-only.** Subagents set `needs_human` + `hitl_*`; only the orchestrator calls `ask_user_input_v0`.
- **Always provide a recommended answer in available options** at every elicitation point.
- **Workflow B gates the output summary.** No "slice complete" report until both `slice-tester` and `slice-verifier` return `pass` (or a half is legitimately skipped for the slice type).
- **Strip `// INSTRUMENT` lines** before final commit if `debug-instrumenter` ran.
- **Deprecated agents are never live-dispatched.** `basic-checks-runner`, `aggregating-test-reviewer`, `ci-cd-guardrails`, and `frontend/visual-reviewer` are shims for v4 back-compat only — route through `slice-tester` / `slice-verifier`.
- **Session goal is set at most once per slice run, after Phase 2 authorization.** Phase 2.5 enforces the parent-goal pre-check; if `/sell-pie` already set a pie-level goal, the slice-level goal is skipped. Never overwrite an active parent goal with a narrower slice-level condition.
- **`Workflow` / `/goal` unavailable → fall back, never drop.** In-context dispatch with orchestrator-side manual schema validation when `Workflow` is absent; manual goal-tracking when `/goal` is absent.

---

## Completion Checklist

Run at the end of every slice. Do not report the slice "ready to ship" until every box up through §4 is `[x]`. Sections §5 (PR + CI) and §6 (cleanup) belong to `/box-it-up` (pie boundary) and are not this skill's responsibility.

### 1. Plan Tasks Complete

[ ] Every in-scope checklist item from the active `docs/plans/stage_<n>_*.md` is implemented.
[ ] Both `spec-reviewer` and `quality-reviewer` returned `verdict: pass` for each item.
[ ] The builder emitted a complete **build manifest** (§Appendix A) covering every route / affordance / serverAction / transition.
[ ] `slice-verifier` returned `overall: pass` — lint, typecheck, build, unit/integration, e2e (per `verification.e2e`), design-system static grep, CI-integrity, and the manifest under-declaration backstop all clear.
[ ] `slice-tester` returned `overall: pass` — every declared affordance exercised, every transition confirmed **both directions on every surface**, and (for data-flow slices) the seed cleaned up with zero residue.
[ ] No `[ ]` items remain in the active slice (deferred items moved out-of-scope with a note).
[ ] If `debug-instrumenter` ran, every `// INSTRUMENT` line was stripped before final commit.

### 1a. Library Preview Gate (frontend / full-stack with UI only)

Skip only if the slice is `type: backend`, `db-schema`, or `infrastructure` with zero UI changes, OR the slice is a pure internal refactor with no rendered-output delta in any production route.

[ ] `library-entry-writer` ran the Phase 0 extend-vs-create gate and reported `build_decision` for every dispatched item.
[ ] Every component / block delivered in this slice has a `/library?tab=<id>` entry with all variants and states (default / hover / focus / disabled / loading / empty / error / populated).
[ ] Every entry uses `<EntryHeader sourcePath=…>` and `<EntrySection sourcePath=… sourceLines=…>` so the page H1 and every state H3 render a working copy-Markdown-link button.
[ ] Every new entry is registered in all three registries (`_registry/tabs.ts` → `LIBRARY_TABS`, `_registry/stories.tsx` → `STORIES`, `_registry/entries.ts` → `entries`). Modify-case entries leave registry rows alone unless `name` / `tags` genuinely changed.
[ ] Every existing library component whose user-visible surface (props, copy, content, variants, states, or styles) changed in a production route has its `/library?tab=<id>` entry updated to reflect the change.
[ ] Library gate resolved per `flow.libraryGate`: in `"human"` mode the Phase 4.5 prompt embedded the self-critique block AND clickable preview URLs and the user approved before any production-route import; in `"self-critique"` mode the agent cleared its self-critique (or stopped on a flagged concern).
[ ] No component imported into a production route, and no user-visible consumer-side edit committed, without library-first review.
[ ] Closing-narrative paragraph (what was built · why this shape · what was left out · what reviewers should pay attention to) drafted for the PR description in §3 below.

### 2. Master Checklist Updated

[ ] Every completed item is flipped `[ ]` → `[x]` in `docs/plans/00_master_checklist.md`.
[ ] Slice status updated (`Not Started` → `In Progress` → `Completed`) to match reality.
[ ] Slice-level exit criteria boxes ticked where satisfied.
[ ] Inline notes added next to any item whose scope deviated from the plan.
[ ] Edits committed on the slice branch (not on `main`).

### 3. Slice Committed Locally (ready for review)

[ ] Branch follows naming: `feat/` | `fix/` | `chore/` + `stage-<n>-<scope>` (or the pie branch under `/sell-pie`).
[ ] Slice committed on the feature/pie branch (no uncommitted leftover changes).
[ ] `slice-verifier` returned `verdict: pass`, including its CI-integrity check (no existing workflow gate weakened) and the e2e coverage the pie-boundary CI will gate on.
[ ] One slice = one commit's worth of changes. No bundling unless the user authorized it in Phase 2. (Per-slice = commit + push; no PR yet.)

### 4. E2E / behavioral coverage (if applicable)

Skip only if the slice is documentation-only or has zero observable behavior change.

[ ] New behavior covered by a `@feature`-tagged E2E spec (run/gated per `verification.e2e.feature`).
[ ] Critical existing flows touched by this slice covered by `@regression-core` (per `verification.e2e.regressionCore`).
[ ] For data-flow slices, the `slice-tester` persisted the seed + cleanup pair under `tests/seeds/<slice>/` for pie-boundary CI reproducibility.
[ ] `.github/workflows/` feature gates trigger `on: pull_request` (so per-slice pushes stay cheap; CI fires once at the pie PR).

---

### Handed off to `/bytheslice:box-it-up` — NOT this skill's responsibility

The following sections live in [`/bytheslice:box-it-up`](../box-it-up/SKILL.md)'s Completion Checklist (now pie-scoped). They are listed here for cross-reference only; this skill does not run them.

#### 5. PR open + CI green (handled by `/box-it-up` at the pie boundary)
- Pie branch pushed to `origin`; one PR `Pie N` open against `main`; PR URL surfaced.
- `gh pr checks <pr> --watch` returned exit 0 on the latest head SHA (CI runs once, at the pie PR).
- If the auto-fix loop ran, the final attempt cleared green.

#### 6. Merge + Cleanup (handled by `/box-it-up` at the pie boundary)
- Merge authorized at the user gate; PR state is `MERGED` (per-slice commits preserved — rebase or merge-commit, not squash).
- Local `main` synced with `--ff-only`.
- Local + remote pie branch deleted.
- Worktree removed + pruned (one worktree per pie).
- `git status --short` empty; fully synced with `origin/main`.

---

## Model Override

Subagents use model aliases (`haiku`, `sonnet`, `opus`) that auto-resolve to the latest version per provider. Override the mapping globally with these env vars:

```
ANTHROPIC_DEFAULT_HAIKU_MODEL=<model-id>
ANTHROPIC_DEFAULT_SONNET_MODEL=<model-id>
ANTHROPIC_DEFAULT_OPUS_MODEL=<model-id>
CLAUDE_CODE_SUBAGENT_MODEL=<model-id>   # overrides all sub-agent tiers at once
```

Per-agent overrides live in `bytheslice.config.json` → `modelTiers` (`sliceTester`, `sliceVerifier` are the v5 verification tiers). See [`skills/setup-shop/references/model-tier-guide.md`](../setup-shop/references/model-tier-guide.md) for the full tier philosophy and per-provider alias resolution.
