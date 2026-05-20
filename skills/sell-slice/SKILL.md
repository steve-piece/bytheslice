---
name: sell-slice
description: Sell a customer their slice — the everyday delivery loop. Execute one stage from your master checklist: spec review, implementation, testing, gates, commit. Run me repeatedly, one fresh chat per slice.
user-invocable: true
triggers: ["/bytheslice:sell-slice", "/sell-slice", "sell a slice", "serve a customer", "bake the slice", "/bytheslice:deliver-stage", "/deliver-stage", "deliver the next stage", "ship the next slice", "work the checklist"]
---
<!-- skills/sell-slice/SKILL.md -->
<!-- The everyday delivery loop. Pizza-shop framing: pull one pie off the rack, run it through the line, slice and serve to one customer. Reads the master checklist, picks the next Not-Started stage, dispatches subagents by stage type, runs basic checks + type-aware aggregating test review, and commits the slice locally. /box-it-up is the handoff. -->

# /sell-slice — The Everyday Delivery Loop

The agent loading this skill is the **orchestrator** for one stage of the master checklist. It reads plans, routes by stage `type:`, dispatches subagents, merges their structured outputs, and gates the PR on real verification.

**The orchestrator does not write production code itself.** Every heavy step is a subagent or a sub-skill.

Run `/sell-slice` → finish a slice → start a fresh chat → run again. Repeat until every row in `docs/plans/00_master_checklist.md` is `[x]`. For multi-stage autonomous delivery (experimental), see `/run-the-day`. For mid-flight feature additions, see `/special-order` (it feeds into `sell-slice`).

---

## Mode detection

`/sell-slice` is **sequential-only** — it requires a master checklist to know which stage to serve next. If `docs/plans/00_master_checklist.md` is missing, the skill stops and points the user at `/cook-pizzas` (to generate one) or `/special-order` (to add a stage to an existing project).

The Phase 0 Prep-section precondition (added in v4) further requires every `## Prep` checkbox to be `[x]` before any feature stage can run. See Phase 0 for the helpful-error message.

## Subagent Roster

Each subagent lives in its own file under `./agents/`. **Read the file before dispatching.**

### Core (every stage type)

| Phase | Agent file | Model | Effort | Mode |
|-------|-----------|-------|--------|------|
| 1 | [agents/discovery.md](agents/discovery.md) | haiku | medium | readonly |
| 1 | [agents/checklist-curator.md](agents/checklist-curator.md) | sonnet | medium | readonly |
| 1 | [agents/rules-loader.md](agents/rules-loader.md) | haiku | low | readonly |
| 4 (backend/full-stack/db-schema/infrastructure) | [agents/implementer.md](agents/implementer.md) | opus | xhigh | write |
| 5 | [agents/spec-reviewer.md](agents/spec-reviewer.md) | sonnet | medium | readonly |
| 5 | [agents/quality-reviewer.md](agents/quality-reviewer.md) | opus | high | readonly |
| 6 | [agents/basic-checks-runner.md](agents/basic-checks-runner.md) | haiku | low | write |
| 6 / 7 (on fail) | [agents/fix-attempter.md](agents/fix-attempter.md) | sonnet | high | write |
| 6 / 7 (on 2nd fail) | [agents/debug-instrumenter.md](agents/debug-instrumenter.md) | sonnet | high | write |
| 7 (frontend/full-stack/backend/db-schema) | [agents/aggregating-test-reviewer.md](agents/aggregating-test-reviewer.md) | sonnet | high | write |
| 8 | [agents/ci-cd-guardrails.md](agents/ci-cd-guardrails.md) | sonnet | medium | readonly |

### Frontend pipeline (Phase 4, `type: frontend`)

| Step | Agent file | Model | Mode |
|------|-----------|-------|------|
| 4.1 | [agents/frontend/modern-ux-expert.md](agents/frontend/modern-ux-expert.md) | sonnet | write |
| 4.2 | [agents/frontend/layout-architect.md](agents/frontend/layout-architect.md) | sonnet | write |
| 4.3 (always) | [agents/frontend/block-composer.md](agents/frontend/block-composer.md) | sonnet | write |
| 4.4 (conditional on gaps) | [agents/frontend/component-crafter.md](agents/frontend/component-crafter.md) | sonnet | write |
| 4.5 (Library Preview Gate) | [agents/frontend/library-entry-writer.md](agents/frontend/library-entry-writer.md) | sonnet | write |
| 4.6 | [agents/frontend/state-illustrator.md](agents/frontend/state-illustrator.md) | sonnet | write |
| 4.7 | [agents/frontend/visual-reviewer.md](agents/frontend/visual-reviewer.md) | sonnet | readonly |

### Sub-skill dispatches (Phase 4, foundation stage types)

| Stage `type` | Sub-skill (path) |
|---|---|
| `design-system` | [`skills/set-display-case/SKILL.md`](../set-display-case/SKILL.md) |
| `ci-cd` | [`skills/final-quality-check/SKILL.md`](../final-quality-check/SKILL.md) |
| `env-setup` | [`skills/open-the-shop/SKILL.md`](../open-the-shop/SKILL.md) |

---

## Preconditions

> Enforced by `hooks/precheck-skill.sh` (UserPromptSubmit) **when hooks are active**. The hook BLOCKs if the checklist is missing and WARN-injects on dirty tree / incomplete Prep section. If `BTS_HOOKS_DISABLED=1` or Claude Code's `disableAllHooks` is set, the hook is observably off — run the three checks below inline via tools and proceed silently. The preconditions are required either way; only the enforcement layer is optional. Never narrate the checks in chat.

- `docs/plans/00_master_checklist.md` exists.
- One or more `docs/plans/stage_<n>_*.md` exist.
- Clean git working tree, OR explicit user OK to proceed dirty.
- Stage plan files (`docs/plans/stage_*.md`) are write-protected during this skill by `hooks/stage-plan-guard.sh` (BLOCK); production-route edits without a recorded library approval surface a warning via `hooks/library-gate-guard.sh`.

---

## Project Config

If `bytheslice.config.json` exists at the project root, the `rules-loader` agent (Phase 1) reads it and returns resolved values. Honor:

- `modelTiers.<agent>` — overrides the agent file's `model:` for THIS run
- `stages.maxTasksPerStage` — overrides the default cap of 6 (warn if user sets > 8)
- `mcps.*` — declarative MCP availability
- `visualReview.tools` / `visualReview.vizzly` — passed to `aggregating-test-reviewer`

See [`skills/setup-shop/references/bytheslice-config-schema.md`](../setup-shop/references/bytheslice-config-schema.md) for the full schema.

---

## Stage-Type Routing

Phase 4 routes the work based on the active stage's `type:` frontmatter:

| `type:` | Phase 4 path |
|---|---|
| `design-system` | Dispatch the `set-display-case` sub-skill. Skip Phase 4 internal implementer. |
| `ci-cd` | Dispatch the `final-quality-check` sub-skill. Skip Phase 4 internal implementer. |
| `env-setup` | Dispatch the `open-the-shop` sub-skill. Skip Phase 4 internal implementer. |
| `frontend` | Run the internal frontend pipeline (4.1 → 4.6). |
| `backend` | Dispatch the internal `implementer` agent. |
| `full-stack` | Dispatch the internal `implementer` agent (covers both UI and API code). |
| `db-schema` | Dispatch the internal `implementer` agent with DB context flag. Schema updated FIRST in `db/schema.sql` (or detected equivalent). |
| `infrastructure` | Dispatch the internal `implementer` agent. |

After Phase 4, Phases 5–9 run regardless of stage type (with type-aware depth in Phase 7).

---

## Workflow

### Phase 0 — Orientation

1. Read `docs/plans/00_master_checklist.md` and every `docs/plans/stage_*.md`.
2. **Prep-section precondition (v4).** If the master checklist has a `## Prep` section, verify every Prep checkbox is `[x]` before any feature stage can run. If any Prep box is `[ ]`, STOP and surface a helpful message:
   > *"Prep step '`<unchecked line>`' is still pending. Run `<the linked command>` first, then come back."*
   This precondition does NOT apply to legacy projects that pre-date v4 (no Prep section in the checklist) — those keep the v3 behavior where foundation stages live as `stage_1_*` / `stage_2_*` / `stage_3_*` plan files routed through Phase 4 (see Legacy path note in Phase 4 below).
3. Identify the **active stage**: first stage with status `Not Started` or `In Progress`, unless the user named one.
4. Confirm git state: `git status --short`, `git rev-parse --abbrev-ref HEAD`.
5. Switch to **Plan Mode** before continuing.

### Phase 1 — Reconnaissance (parallel)

Dispatch all three subagents in a **single tool batch**:

1. `discovery` — codebase recon
2. `checklist-curator` — slice scoping + checklist diff proposal
3. `rules-loader` — project rules file + `bytheslice.config.json` resolution

Merge their reports into the Build Plan in Phase 2.

### Phase 2 — Build Plan + User Authorization

Present a compact plan:

1. Active stage + slice name + stage `type:`
2. In-scope checklist items with acceptance tests
3. Out-of-scope items being deferred
4. Touched modules + blast-radius highlights
5. Sub-skill or pipeline that will dispatch in Phase 4
6. Branch / worktree name
7. MCP availability + visual-review tools
8. Forward-reference risks, open questions

End with: **"Authorize this build plan? (yes / edits / cancel)"** and wait. Phase 4 does not start until the user says yes.

**Always provide a recommended answer in available options** when prompting.

If discovery surfaced ambiguous symbol locations, ask the user to clarify before re-dispatching, or proceed with their blessing.

### Phase 2.5 — Set slice-completion goal (conditional)

After the user authorizes the build plan and before Phase 3 begins, the orchestrator considers setting a session-scoped `/goal` for this slice. The goal's prompt-based Stop hook keeps the orchestrator moving through Phases 3 → 9 without requiring per-turn user re-prompting; HITL gates (Library Preview HARD STOP in Phase 4.5, fix-attempter / debug-instrumenter loops in Phases 6–7, ci-cd-guardrails iteration in Phase 8) still end turns naturally and the evaluator returns "not yet" until they resolve.

**Pre-check — parent goal coordination.** Invoke `/goal` with no argument to read the current session-goal state.

- **If a goal is already active**, this skill is running under `/run-the-day --auto-mvp` or `--auto-all` (or another wrapper). The plan-level goal subsumes the per-slice condition. **Skip the slice-goal set** and continue to Phase 3. Log a one-line note to the user: `Parent session goal active (run-the-day); sell-slice will not set its own.`
- **If no goal is active**, proceed to set the slice-goal below.
- **If `/goal` is unavailable** (running in Cursor, workspace trust dialog not accepted, `disableAllHooks` set at any settings level, `allowManagedHooksOnly` in managed settings, or any other reason the slash command surfaces), **fall back to the manual goal-tracking pattern** documented in [`../cook-pizzas/references/goal-fallback-pattern.md`](../cook-pizzas/references/goal-fallback-pattern.md). Do NOT silently continue without a goal — the fallback is "manual tracking," not "no tracking." On activation: (a) WebFetch [`https://code.claude.com/docs/en/goal.md`](https://code.claude.com/docs/en/goal.md) so the canonical evaluator pattern is in context, (b) build the same condition string this phase would have passed to `/goal`, (c) self-evaluate against the transcript after each phase completion (Phases 3 → 9), (d) surface a one-line progress note every ~5 phases. Log up front: *"`/goal` is unavailable (<reason>); falling back to manual goal-tracking against the Exit criteria — see [goal-fallback-pattern.md](../cook-pizzas/references/goal-fallback-pattern.md) for the protocol."*

**Goal condition.** The condition is **lifted from the active stage file's `**Exit criteria:**` block** — the same block `/bytheslice:cook-pizzas` (or `/bytheslice:special-order`) wrote when the stage was scaffolded. The Exit-criteria contract (see [`../cook-pizzas/references/templates.md`](../cook-pizzas/references/templates.md) → "Exit-criteria contract (consumed by `/goal`)") guarantees every line is transcript-verifiable, binary, and specific to this slice.

Build the `/goal` condition string in this exact order:

1. **Header** — one sentence: `Slice for stage <STAGE_N> (<stage name>) at <stage_file_path> is ready for review locally:`
2. **Lifted Exit criteria** — copy every bullet from the stage file's `**Exit criteria:**` block verbatim, preserving order. If the stage is `backend` / `db-schema` / `infrastructure` with zero UI surface (or a pure internal refactor with no rendered-output delta), drop the Library Preview Gate line if present.
3. **Pipeline-level constraints** — append exactly these three lines:
   - `master checklist row for stage <STAGE_N> in docs/plans/00_master_checklist.md shows Status: Completed`
   - `working tree clean on the slice branch with the slice committed locally; not yet pushed`
   - `Pause on any HITL bubble surfaced via ask_user_input_v0 (Library Preview Gate, fix-loop exhaustion, prd_ambiguity, external_credentials, destructive_operation, creative_direction)`
4. **Turn cap** — append: `Stop after 40 turns if not yet complete.`

**Missing Exit criteria block.** If the stage file does NOT have a well-formed `**Exit criteria:**` block (or it contains vague non-transcript-verifiable lines like "tests pass" or "looks good"), **do not invent one**. Surface as `prd_ambiguity` HITL: *"The stage plan at `<path>` is missing transcript-verifiable Exit criteria — `/goal` cannot be set with confidence. Re-open `/bytheslice:cook-pizzas` (or `/bytheslice:special-order`) to regenerate the stage with proper exit criteria per the contract, then re-authorize this build plan."* If the user explicitly chooses to skip, proceed without a goal and continue phase-by-phase under manual prompting.

Invoke `/goal <full condition string>`. Log a one-line summary to the user: `Slice-completion goal set for stage <STAGE_N> (lifted N lines from Exit criteria).`

**Clearing the goal:**
- On Phase 9 normal closeout, the evaluator auto-clears the goal once the condition is met — no action needed.
- On a HITL bubble where the user chooses to abandon the slice (e.g. answers "cancel" to a re-dispatch prompt), the orchestrator MUST invoke `/goal clear` before returning control so the next conversation is not nagged by a stale goal.
- On the 3rd persistent failure in any fix loop (Phase 6 or Phase 7), the orchestrator bubbles HITL with full evidence — the goal remains active so that, if the user resolves the failure and tells the orchestrator to continue, the loop picks back up naturally. Only clear the goal if the user explicitly abandons the slice.

### Phase 3 — Branch / Worktree Setup

- Branch naming: `feat/stage-<n>-<scope>` | `fix/stage-<n>-<scope>` | `chore/stage-<n>-<scope>`
- Prefer a git worktree per active slice. Never implement directly on `main`/`master`.
- One checklist slice per PR.

### Phase 4 — Stage-Type Routing

Per the routing table above:

#### `design-system` / `ci-cd` / `env-setup` — Legacy sub-skill dispatch (v3 projects only)

> **v4 note:** In v4, the foundation stages (design-system / ci-cd / env-setup) are no longer scaffolded as plan files by `/cook-pizzas`. New projects run `/set-display-case`, `/final-quality-check`, and `/open-the-shop` directly from the master checklist's Prep section — they don't pass through `/sell-slice` at all.
>
> This routing path exists for **legacy v3 projects** whose master checklist still has `stage_1_*`, `stage_2_*`, `stage_3_*` plan files. In that case, `/sell-slice` loads the corresponding foundation skill (`/set-display-case`, `/final-quality-check`, `/open-the-shop`) end-to-end as a sub-skill, records the artifacts, and proceeds to Phase 5 — same behavior as v3. The user gets a one-line note: *"Detected legacy `type: <X>` stage — dispatching `/<new-name>` as a sub-skill. v4 projects skip this routing entirely (foundations are run-once before feature work)."*

Load the corresponding sub-skill SKILL.md and follow it end-to-end. The sub-skill returns the structured contract; the orchestrator records the artifacts and proceeds to Phase 5.

#### `frontend` — Internal frontend pipeline

Run sequentially:

1. **4.1 — `modern-ux-expert`** → outputs `docs/ux-spec-<slice>.md` (UX strategy with 2–3 best-in-class references)
2. **4.2 — `layout-architect`** → route files, layout components, breakpoint plan
3. **4.3 — `block-composer`** (always first) → composes from shadcn blocks; reports `ui_coverage_percent`
4. **4.4 — `component-crafter`** (only if `block-composer` reports gaps) → token-only custom components
5. **4.5 — Library Preview Gate** (non-skippable, preview-first HARD STOP):
   - **Trigger.** Library preview gate is non-skippable and fires whenever a stage (a) authors a new component or block, OR (b) modifies any user-visible surface of an existing library component (props, copy, content, variants, states, or styles) as it appears in a production route. In the modify case, the existing `/library?tab=<id>` entry must be updated to reflect the change and re-approved before the production-route edit lands. Pure internal refactors with no rendered-output delta are exempt.
   - **Phase 0 — Should we even build this?** `library-entry-writer` runs the extend-vs-create gate first. If it returns `phase_0.build_decision: extend_existing` or `inline_in_consumer`, **stop** and surface the recommendation via `ask_user_input_v0` (or bubble HITL `creative_direction`). The orchestrator pivots the slice scope before any new entry is written.
   - Dispatch `library-entry-writer` with one of two **modes** per item:
     - `mode: "new"` for every component / block emitted by 4.3 and 4.4 → appends a fresh entry: one file under `_entries/<id>-entry.tsx`, plus registrations in `_registry/tabs.ts`, `_registry/stories.tsx`, and `_registry/entries.ts`, all rendering the full variants × states matrix.
     - `mode: "modify"` for every existing library component whose user-visible surface changed under condition (b) → updates the existing `_entries/<id>-entry.tsx` file in place with the delta (copy / prop / content / variant / state / style change), leaving the registry rows alone unless tags or name genuinely changed.
   - Both modes render all variants × all states (default / hover / focus / disabled / loading / empty / error / populated) AND wire the source-path copy buttons through `<EntryHeader sourcePath=…>` / `<EntrySection sourcePath=… sourceLines=…>`.
   - **Discover the dev port** before surfacing URLs. Check in order: `lsof -i -P | grep LISTEN | grep node` (already-serving ports), `package.json` `scripts.dev` declared port, framework-specific port hints (`next.config.js`, `proxy.ts`). If still ambiguous, ask the user.
   - **HARD STOP.** Surface a single Phase 4.5 prompt that embeds:
     1. The **self-critique block** from `library-entry-writer`'s output contract — skipped states, untested edge cases, close-but-not-exact tokens, untested compositions — verbatim, per entry.
     2. A **clickable preview URL block**, one line per entry, in the form `http://localhost:<port>/library?tab=<id>`, with a 1-line note on what's covered.
     3. The explicit ask:
        > "Library is updated. Self-critique above, preview URLs below. Click through, leave comments on anything that needs changing, and tell me whether each entry is **approved**, needs **revision**, or should be **rejected** before I wire `<component name>` into `<production route>`."
   - **Do not start production wiring** until the user explicitly approves. Even if the request sounded straightforward, even if the design feels right, even if the user is in a hurry — stop here. The cost asymmetry (rewriting a story file vs. rewriting story file + routes + server actions + types + tests) is what makes the gate worth enforcing.
   - On **approved** → import the component from the library into the production route(s) named by the stage spec (or, in the modify case, land the consumer-route edit). Continue to Phase 4.6.
   - On **revision** → re-dispatch `component-crafter` with the user's notes, then re-run 4.5 for the revised component (with a fresh self-critique). Cap at 2 revision loops; on the 3rd round, surface as HITL `creative_direction` and stop.
   - On **rejected** → remove the entry: delete `_entries/<id>-entry.tsx`, remove the id from `_registry/tabs.ts` (`LIBRARY_TABS`), remove the import + map row from `_registry/stories.tsx` (`STORIES`), and remove the sidebar row from `_registry/entries.ts`. Surface as HITL `creative_direction` for the user to redirect.
   - **No production-route imports happen before approval.** `library-entry-writer`'s output contract requires `production_imports_added: 0`.
6. **4.6 — `state-illustrator`** → ensures every interactive surface has loading / empty / error / success states (in production routes; the library version was already populated by 4.5)
7. **4.7 — `visual-reviewer`** (loops on fail) → pass: continue; fail: re-dispatch the responsible producer with the critique. Cap 2 retry loops; on third failure HITL `creative_direction`.

**Hard rules:**
- `block-composer` MUST run and report before `component-crafter` is considered. Never skip block composition.
- **Library preview gate is non-skippable and fires whenever a stage (a) authors a new component or block, OR (b) modifies any user-visible surface of an existing library component (props, copy, content, variants, states, or styles) as it appears in a production route. In the modify case, the existing `/library?tab=<id>` entry must be updated to reflect the change and re-approved before the production-route edit lands. Pure internal refactors with no rendered-output delta are exempt.** Library-first applies even to single-component stages and to "small" consumer-side edits like copy or prop changes.

#### `backend` / `full-stack` / `db-schema` / `infrastructure` — Internal implementer

For each in-scope checklist item, in dependency order:

1. Dispatch the **implementer** (for `db-schema` and `full-stack` involving DB: schema is updated FIRST in `db/schema.sql` or detected equivalent before any code).
2. Dispatch the **spec reviewer** with the implementer's output.
3. Dispatch the **quality reviewer** with both prior outputs.
4. If either reviewer returns `verdict: fail`, send findings back to a fresh implementer dispatch and re-review. Repeat until both `pass`.
5. Apply the curator's checklist diff for this item: flip `[ ]` → `[x]` only after both reviewers pass AND local gates ran green.
6. Commit on the slice branch using the implementer's conventional-commit message.

### Phase 5 — Per-item review loop

For frontend / sub-skill paths, dispatch `spec-reviewer` and `quality-reviewer` against the produced artifacts. Loop the same way (fail → re-dispatch responsible producer → re-review).

### Phase 6 — Pre-summary basic checks (NEW)

Dispatch `basic-checks-runner` to run lint → typecheck → build sequentially.

- `overall: pass` → continue to Phase 7.
- `overall: fail` (1st time) → dispatch `fix-attempter` with the report + slice diff. Re-run `basic-checks-runner`.
- Still failing (2nd time) → dispatch `debug-instrumenter` to add targeted logging. Re-run `basic-checks-runner` (now with extra telemetry). Then dispatch `fix-attempter` again with the new richer report. Re-run `basic-checks-runner`.
- Cap 3 total loops. On 3rd persistent failure → bubble HITL with full evidence.

After green, the orchestrator runs the strip pattern from `debug-instrumenter` (if it ran) to remove `// INSTRUMENT` lines, then commits a "remove debug instrumentation" sweep.

### Phase 7 — Aggregating test review (NEW — TYPE-AWARE)

Dispatch `aggregating-test-reviewer`. Pass the stage type so the agent picks the right depth:

- **`frontend` / `full-stack`** → FULL review: dev server boot, CI gates, Claude-in-Chrome UAT, visual diff against tokens
- **`backend` / `db-schema` / `infrastructure`** → REDUCED review: CI gates only, no browser UAT, no visual diff
- **`design-system` / `ci-cd` / `env-setup`** → SKIP this phase (basic-checks-runner is sufficient for foundation stages)

Same fix loop as Phase 6:

- 1st fail → `fix-attempter` with full report → re-run aggregating-test-reviewer
- 2nd fail → `debug-instrumenter` → re-run aggregating-test-reviewer → `fix-attempter` → re-run
- Cap 3 total loops. On 3rd persistent failure → bubble HITL with full evidence.

### Phase 8 — CI/CD Guardrails

Dispatch `ci-cd-guardrails` with the slice diff + workflow inventory + E2E inventory + acceptance test. Wait for its structured verdict.

- `verdict: fail` with `infrastructure_intact: false` → run `final-quality-check` sub-skill, then re-dispatch.
- `verdict: fail` with `workflow_violations` → send violations back to implementer to remove regressions, then re-dispatch.
- Missing E2E coverage → send proposed specs back to implementer to apply, then re-dispatch.
- **Do not open the PR until verdict is `pass`.**

### Phase 9 — Stage Closeout

When every in-scope item is `[x]`:

1. Flip stage status `In Progress` → `Completed` in `docs/plans/00_master_checklist.md` (commit this change on the slice branch).
2. Confirm the slice branch has every commit it needs and the working tree is clean (`git status --short` empty).
3. Walk the **Completion Checklist** (below). The slice is not "ready to ship" until every box up through §4 is `[x]`.
4. Report to the user using the **Progress Report Format**, ending with the **Handoff to `/box-it-up`** message.

**This skill stops here — at "slice committed locally, ready for review."** It does NOT push, open a PR, watch CI, merge, or clean up. That's `/bytheslice:box-it-up`'s job, intentionally separated so you can run a manual visual UAT, do a local code review, or rebase against fresh main before deciding to ship.

#### Handoff to `/box-it-up`

End your final message with:

> Slice complete on branch `<branch>` — every gate passed locally, master checklist updated, slice committed.
>
> **Next:** Review the diff at your pace (visual UAT, manual code review, anything else). When you're ready to ship, run `/bytheslice:box-it-up`. It will run pre-flight safety checks, push, open the PR, watch CI (with an auto-fix loop on red), pause for your merge approval, and on approval merge + sync main + delete local and remote branch + remove the worktree.
>
> If CI fails on the PR, `/box-it-up`'s `ci-fix-attempter` agent applies targeted fixes for up to 3 attempts before bubbling to you — so this hand-off is genuinely "review and walk away" if you want it to be.

---

## HITL Handling

If any subagent or sub-skill returns `needs_human: true`, the orchestrator pauses and uses `ask_user_input_v0` to prompt the user. The answer is appended to the relevant context (PRD Section 6 for `prd_ambiguity`, project rules for credentials, etc.), then the dispatch is repeated.

Subagents NEVER prompt the user directly. Only the orchestrator calls `ask_user_input_v0`.

---

## Progress Report Format

After each task and at stage closeout:

1. Checklist items completed (with file paths)
2. Files changed (grouped by package/app)
3. Tests run and results (lint, types, unit, integration, E2E by tag, browser UAT)
4. Subagent run summary (which roles ran, how many review loops, fix-attempter / debug-instrumenter activity)
5. Open risks / blockers
6. Next recommended slice
7. **Closing-narrative paragraph** (UI-touching stages only) — one paragraph telling the design story: what was built · why this shape over alternatives (one or two trade-offs made) · what was deliberately left out · what reviewers should pay attention to. The PR body lifts this paragraph verbatim. Without it, future readers reverse-engineer the design from the diff.

---

## Hard Constraints

- **Build plan must be authorized** by the user before any producer subagent runs (Phase 4 onward).
- **One slice per PR.** Never bundle multiple checklist items unless the user explicitly approves it in Phase 2.
- **Checklist edits only after green gates.** Do not optimistically mark items done.
- **Subagent prompts live in `./agents/*.md`.** This SKILL.md is workflow only — never inline subagent prompts here.
- **Never modify other stage plan files** during execution. Plans are static; deviations are noted inline in the checklist.
- **HITL bubbling is mandatory.** Subagents never prompt the user directly. Only the orchestrator calls `ask_user_input_v0`.
- **Always provide a recommended answer in available options** at every elicitation point.
- **Phase 6 (basic-checks) and Phase 7 (aggregating-test-review) gate the output summary.** No "stage complete" report until both pass (or are intentionally skipped per stage type).
- **Strip `// INSTRUMENT` lines** before final commit if `debug-instrumenter` ran.
- **Session goal is set at most once per slice run, after Phase 2 authorization.** Phase 2.5 enforces the parent-goal pre-check; if `/run-the-day` already set a plan-level goal, the slice-level goal is skipped. Never overwrite an active parent goal with a narrower slice-level condition.

---

## Completion Checklist

Run at the end of every slice. Do not report the slice "ready to ship" until every box up through §4 is `[x]`. Sections §5 (PR + CI) and §6 (cleanup) belong to `/bytheslice:box-it-up` and are not this skill's responsibility.

### 1. Plan Tasks Complete

[ ] Every in-scope checklist item from the active `docs/plans/stage_<n>_*.md` is implemented.
[ ] Both `spec-reviewer` and `quality-reviewer` returned `verdict: pass` for each item.
[ ] Local gates green: lint, typecheck, build (Phase 6 `basic-checks-runner`).
[ ] Aggregating test review passed for non-foundation stages (Phase 7).
[ ] No `[ ]` items remain in the active slice (deferred items moved out-of-scope with a note).
[ ] If `debug-instrumenter` ran, every `// INSTRUMENT` line was stripped before final commit.

### 1a. Library Preview Gate (frontend / full-stack with UI only)

Skip only if the stage is `type: backend`, `db-schema`, or `infrastructure` with zero UI changes, OR the stage is a pure internal refactor with no rendered-output delta in any production route.

[ ] `library-entry-writer` ran the Phase 0 extend-vs-create gate and reported `build_decision` for every dispatched item.
[ ] Every component / block delivered in this stage has a `/library?tab=<id>` entry with all variants and states (default / hover / focus / disabled / loading / empty / error / populated).
[ ] Every entry uses `<EntryHeader sourcePath=…>` and `<EntrySection sourcePath=… sourceLines=…>` so the page H1 and every state H3 render a working copy-Markdown-link button.
[ ] Every new entry is registered in all three registries (`_registry/tabs.ts` → `LIBRARY_TABS`, `_registry/stories.tsx` → `STORIES`, `_registry/entries.ts` → `entries`). Modify-case entries leave registry rows alone unless `name` / `tags` genuinely changed.
[ ] Every existing library component whose user-visible surface (props, copy, content, variants, states, or styles) changed in a production route has its `/library?tab=<id>` entry updated to reflect the change.
[ ] Phase 4.5 HITL prompt embedded the self-critique block AND clickable preview URLs before the user-approval ask.
[ ] User-approved each component at the library preview gate before any production-route import or consumer-side edit landed.
[ ] No component imported into a production route, and no user-visible consumer-side edit committed, without library-first review.
[ ] Closing-narrative paragraph (one paragraph: what was built · why this shape · what was left out · what reviewers should pay attention to) drafted for the PR description in §3 below.

### 2. Master Checklist Updated

[ ] Every completed item is flipped `[ ]` → `[x]` in `docs/plans/00_master_checklist.md`.
[ ] Stage status updated (`Not Started` → `In Progress` → `Completed`) to match reality.
[ ] Stage-level exit criteria boxes ticked where satisfied.
[ ] Inline notes added next to any item whose scope deviated from the plan.
[ ] Edits committed on the slice branch (not on `main`).

### 3. Slice Committed Locally (ready for review)

[ ] Branch follows naming: `feat/` | `fix/` | `chore/` + `stage-<n>-<scope>`.
[ ] Slice committed on the feature branch (no uncommitted leftover changes).
[ ] `ci-cd-guardrails` returned `verdict: pass` (the slice has the E2E coverage CI will gate on).
[ ] One slice = one PR worth of changes. No bundling unless the user authorized it in Phase 2.

### 4. E2E Tests Added (if applicable)

Skip only if the slice is documentation-only or has zero observable behavior change.

[ ] New behavior covered by a `@feature`-tagged E2E spec.
[ ] Critical existing flows touched by this slice covered by `@regression-core`.
[ ] `.github/workflows/ci.yml` and `e2e.yml` exist and reference the new specs.
[ ] Failure artifacts (trace / video / report) upload step is present in the workflow.
[ ] New specs run green locally before the slice is considered ready to ship.

---

### Handed off to `/bytheslice:box-it-up` — NOT this skill's responsibility

The following sections live in [`/bytheslice:box-it-up`](../box-it-up/SKILL.md)'s Completion Checklist. They are listed here for cross-reference only; this skill does not run them.

#### 5. PR open + CI green (handled by `/box-it-up` Phase 1–3)
- Branch pushed to `origin`; PR open against `main`; PR URL surfaced.
- `gh pr checks <pr> --watch` returned exit 0 on the latest head SHA.
- If the auto-fix loop ran, the final attempt cleared green.

#### 6. Merge + Cleanup (handled by `/box-it-up` Phase 4–5)
- Merge authorized at the user gate; PR state is `MERGED`.
- Local `main` synced with `--ff-only`.
- Local + remote slice branch deleted.
- Worktree removed + pruned (if used).
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

See [`skills/setup-shop/references/model-tier-guide.md`](../setup-shop/references/model-tier-guide.md) for the full tier philosophy and per-provider alias resolution.
