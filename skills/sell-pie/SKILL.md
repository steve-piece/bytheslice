---
name: sell-pie
description: Bake a whole Pie autonomously — the v5 forefront delivery loop. A /loop-driven baker that drives ONE Pie (a coherent 3–8-slice chapter) to "ready for review" without per-slice prompting; each slice runs the context-separated build→test→verify→fix Workflow, commits + pushes (no PR), and advances; when every slice is [x] it stops at the pie boundary and opens one PR via /box-it-up. Refuses flat v4 checklists (points you at /cook-pizzas --repie). For a continuous-review pie (review=continuous) it runs in high-touch /sell-slice mode. The four blocking HITL categories halt the loop instead of rescheduling. Use when the user runs /sell-pie, says "sell a pie", "bake the pie", "run the next pie", "loop the pie", or wants one whole chapter delivered hands-off. For a single careful slice use /sell-slice; for the whole roadmap use /run-the-day.
user-invocable: true
triggers: ["/bytheslice:sell-pie", "/sell-pie", "sell a pie", "bake the pie", "bake a pie", "run the next pie", "loop the pie", "bake the next pie", "/bytheslice:bake-pie", "/bake-pie", "deliver the pie"]
---
<!-- skills/sell-pie/SKILL.md -->
<!-- v5 forefront skill (spec §1.2, §1.3, §1.8, §1.11). Pizza-shop framing: a Pie is a chapter of 3–8 slices; /sell-pie is the autonomous baker that drives ONE pie off the rack to "ready for review", slice by slice, in one /loop. The /loop conductor holds ZERO implementation context: per slice it dispatches a Workflow (builder → slice-tester → slice-verifier → fixer) and passes the tester ONLY the build manifest + Exit criteria + design-system path — never the builder's reasoning — so the tester cannot rationalize the builder's choices. Per slice: commit + push, no PR (CI stays quiet). At the pie boundary (every slice [x]): hand off to /box-it-up to open one PR "Pie N", run CI once, merge preserving slice commits. Refuses flat v4 checklists (--repie hint). review: continuous forces /sell-slice mode. The four HITL categories halt the loop (do NOT reschedule the wake). The everyday single-slice tool is /sell-slice; the whole-roadmap chainer is /run-the-day. -->

# /sell-pie

In v5 a **Pie** is the unit of autonomy. A pie is a coherent chapter (e.g. "Database Scaffold", "Blog Editor") of **3–8 slices** with low cross-coupling. `/sell-pie` is a **`/loop`-driven autonomous baker** that drives **one** pie from `Not Started` to "ready for review" — slice by slice, in a single loop, without stopping for per-slice authorization.

The loop **conductor holds zero implementation context.** Per slice it dispatches a `Workflow` that routes structured artifacts between singular-goal subagents — **builder → `slice-tester` → `slice-verifier` → fixer** — and then commits + pushes that slice (**no PR, so CI stays quiet**). When **every** slice under the active Pie is `[x]`, the loop stops at the **pie boundary** and hands off to [`/box-it-up`](../box-it-up/SKILL.md), which opens **one** PR `Pie N`, runs CI **once**, and merges preserving every per-slice commit.

`/sell-pie` is the **forefront** delivery command in v5. Its siblings:

- [`/sell-slice`](../sell-slice/SKILL.md) — **one** careful slice, high-touch (build-plan + library gates intact). Use for sensitive or collaborative work. `/sell-pie` *delegates* to it for `review: continuous` pies and for the per-slice spine.
- [`/run-the-day`](../run-the-day/SKILL.md) — a thin chainer that loops `/sell-pie` across **every** pie for unattended whole-roadmap runs (`experimental`).
- [`/box-it-up`](../box-it-up/SKILL.md) — opens the boundary PR, runs CI once, merges, and cleans up the pie branch + worktree.

---

## Mode detection

`/sell-pie` is **always sequential over one pie** — it never parallelizes slices and never spans two pies in a single run. It resolves its mode before doing anything:

| Mode | How it's detected | What it does |
|------|-------------------|--------------|
| **autonomous** (default) | The master checklist is **nested** (`## Pie N` / `### Slice N.M`), the active Pie carries `review: boundary` (or omits the annotation and `review.default` is `boundary`), and every prior Pie is merged-or-authorized. | Run the `/loop` driver (Workflow below): loop the pie's slices, each through the per-slice Workflow, commit + push per slice, **one** HITL at the pie boundary. |
| **continuous** (high-touch) | Same as above but the active Pie carries `review: continuous` (Payments, Auth, real-data migrations), OR `review.default` is `continuous` for an unannotated pie. | **Drive each slice through `/sell-slice` in full** (build-plan + library gates live) instead of the autonomous per-slice Workflow. The pie still completes slice-by-slice; the human touch points of `/sell-slice` are preserved for the whole pie. |
| **refused** (flat checklist) | The master checklist is **flat** (`## Stage N`, no `## Pie N` / `### Slice N.M` headings) — a v4 project that was never re-pied. | **STOP.** `/sell-pie` does not run on a flat checklist. Surface the `--repie` hint (below). Never auto-rewrite the checklist. |

**Refusal — flat checklist (hard stop, no auto-rewrite).** `/sell-pie`'s autonomy is the *pie*; a flat v4 checklist has no pies to loop. Detect a flat layout (no `## Pie N` headings; only `## Stage N`) and STOP with `needs_human: true`, `hitl_category: prd_ambiguity`:

> *"This project's master checklist is flat (v4 `## Stage N`), so `/sell-pie` has no pies to loop. Either run `/sell-slice` (it works on flat checklists, one stage at a time) — or convert to the two-level Pie/Slice structure with **`/cook-pizzas --repie`** (explicit, opt-in; it never silently rewrites your plans). Once the checklist is pied, re-run `/sell-pie`."*

Never convert the checklist yourself — `--repie` is the user's explicit opt-in (spec §1.3, dual-read). `/sell-pie` reads both layouts only far enough to detect the flat case and refuse; it does not edit plan files.

**Continuous-pie delegation.** When the active Pie's `review` resolves to `continuous`, `/sell-pie` does not run its own per-slice Workflow. Instead, for each slice in pie order, it invokes [`/sell-slice`](../sell-slice/SKILL.md) end-to-end (which keeps the build-plan authorization and Library Preview gate live). `/sell-pie` still owns the pie-level loop bookkeeping (which slice is next, when the pie is complete, the boundary handoff) and the pie-level `/goal`; it simply swaps the autonomous per-slice Workflow for high-touch `/sell-slice` runs. See spec §1.8: `review: continuous` forces `/sell-pie` into `/sell-slice` mode for that pie.

## Subagent Roster

The per-slice Workflow routes structured artifacts between four singular-goal subagents. **Read each file in full before dispatching; pass the file's body as the prompt.** All four live under `/sell-slice`'s `agents/` directory (they are shared with `/sell-slice`'s Workflow A/B — `/sell-pie` reuses them, it does not fork them).

| Step | Agent file | Singular goal | Receives | Returns | Model | Effort |
|------|-----------|---------------|----------|---------|-------|--------|
| build | [../sell-slice/agents/implementer.md](../sell-slice/agents/implementer.md) | implement the slice + its **unit tests**; make it compile/run; **never** behaviorally review its own work | slice plan, design system | code, unit tests, **build manifest** (§Appendix A), smoke result | opus | xhigh |
| test | [../sell-slice/agents/slice-tester.md](../sell-slice/agents/slice-tester.md) | independently verify behavior | **build manifest + Exit criteria + design-system path only** (+ dev URL / slice type / DB target) | per-affordance verdict + evidence (§Appendix B) | sonnet | high |
| verify | [../sell-slice/agents/slice-verifier.md](../sell-slice/agents/slice-verifier.md) | static gates, each exactly once + the manifest under-declaration backstop | slice diff, build manifest, resolved `verification.*`, workflow inventory | one verdict (§Appendix C) | sonnet | high |
| fix | [../sell-slice/agents/fix-attempter.md](../sell-slice/agents/fix-attempter.md) | smallest fix for **one** failing behavior | failing verdict + evidence (**off-context** — not the builder's or tester's chat) | targeted patch | sonnet | high |

`debug-instrumenter` ([../sell-slice/agents/debug-instrumenter.md](../sell-slice/agents/debug-instrumenter.md)) backs the fixer on a second failure (targeted `// INSTRUMENT` logging), exactly as in `/sell-slice` Phase 5.4.

For the foundation slice types and the frontend producer pipeline that a slice may route through, `/sell-pie` defers entirely to `/sell-slice`'s routing — it does not re-implement it. For model-override paths, see [`../setup-shop/references/model-tier-guide.md`](../setup-shop/references/model-tier-guide.md).

> **Subagent prompts live in `./agents/*.md` (under `/sell-slice`).** This SKILL.md is loop logic only — never inline a subagent prompt here.

---

## Inputs and Preconditions

> Pre-enforced by the plugin hooks in `hooks/` (`precheck-skill.sh` / `bts_detect_skill` learns `sell-pie`) **when hooks are active**. If `BTS_HOOKS_DISABLED=1` or `disableAllHooks` is set, run the checklist-exists, prior-pie, and git-state checks inline via tools and proceed silently. The preconditions are required either way; only the enforcement layer is optional. Never narrate the checks in chat.

- `docs/plans/00_master_checklist.md` exists and is **nested** (`## Pie N` / `### Slice N.M`). A flat checklist triggers the refusal above.
- Every stage/slice file referenced by the active Pie has a `docs/plans/stage_<n>_*.md` plan file, each carrying `pie` / `slice` / `review` frontmatter (see [`../cook-pizzas/references/stage-frontmatter-contract.md`](../cook-pizzas/references/stage-frontmatter-contract.md)) and a well-formed `**Exit criteria:**` block.
- **An active Pie exists** — a `## Pie N` whose slices are not all `[x]`.
- **Every prior Pie is merged-or-authorized.** Each `## Pie M` with `M < N` is either `Completed` in the checklist (its boundary PR merged) or the user explicitly authorized starting this pie ahead of it. `/sell-pie` does not start Pie N while Pie N-1 is unmerged unless the user OKs it (`prd_ambiguity` HITL otherwise).
- Clean git working tree; the pie branch `pie-<n>-<scope>` exists or will be cut from the freshly-fetched `origin/main` (`git fetch origin` then `git worktree add -b pie-<n>-<scope> <path> origin/main`) into **one worktree per pie** — never from local `main`, which may be stale. Never bake directly on `main` / `master`. Worktree setup, isolation, merge, and cleanup follow [`../cook-pizzas/references/git-worktree-standard.md`](../cook-pizzas/references/git-worktree-standard.md).

## Project Config

At session start, resolve `bytheslice.config.json` (precedence: env → config → project rules → defaults; see [`../setup-shop/references/bytheslice-config-schema.md`](../setup-shop/references/bytheslice-config-schema.md)) and log the resolved values once. The keys `/sell-pie` consumes:

- **`review.default`** — `boundary` (default) | `continuous`. Fills the gap for a pie with no `<!-- review: ... -->` annotation. **A pie's own annotation always wins.** Governs the loop (autonomous vs `/sell-slice` mode).
- **`flow.autoApproveBuildPlan`** — irrelevant to the loop's decision (the build-plan stop is **always** auto-approved under the `/sell-pie` loop); the per-slice `/sell-slice` reads it only in standalone runs.
- **`flow.libraryGate`** — `self-critique` (default) | `human` | `off`. The Library Preview gate still fires for **net-new components** inside an autonomous pie (the one event-driven design HITL, spec §1.8); honored by the per-slice Workflow / `/sell-slice`.
- **`verification.viewports`** *(C7)* and **`verification.e2e.*`** *(C10)* — passed through to `slice-tester` (viewports) and `slice-verifier` (e2e thresholds). Never hardcode these.

---

## Slice-Type Routing

`/sell-pie` does **not** route per slice type itself — that is `/sell-slice`'s job (and the per-slice Workflow reuses it). Every slice, regardless of `type:`, is driven through the same per-slice Workflow (autonomous mode) or the same `/sell-slice` invocation (continuous mode); the slice's `type:` frontmatter routes the producer pipeline and the `slice-tester`'s test mode internally (`frontend` = rendered design-system match + per-affordance exercise; `full-stack` / `backend` = seed-and-cleanup data-flow; `infrastructure` = probe/harness). See [`../sell-slice/SKILL.md`](../sell-slice/SKILL.md) "Slice-Type Routing".

---

## Workflow availability (CC-only primitives)

`/loop` and `Workflow` (`parallel()` / `pipeline()`) are **Claude-Code-only** primitives. `/sell-pie` is built on both: `/loop` is the conductor that wakes per slice; `Workflow` carries the per-slice build→test→verify→fix dispatch with schema enforcement. Detect availability **up front**; if either is absent (Cursor, `disableAllHooks`, workspace-trust not accepted, or any other reason the primitive surfaces), **fall back — do not silently drop the logic** (spec §1.11):

- **`/loop` unavailable** → `/sell-pie` **self-paces** over the pie's ≤8 slices in a single context (one continuous run rather than scheduled wakes). It still drives the same per-slice Workflow per slice, in order, and stops at the pie boundary. Use a session-scoped `/goal` (or its manual fallback) as the continuation driver instead of the loop's scheduler.
- **`Workflow` unavailable** → fall back to **in-context dispatch with orchestrator-side manual schema validation** per [`../cook-pizzas/references/loop-workflow-fallback-pattern.md`](../cook-pizzas/references/loop-workflow-fallback-pattern.md). Without `Workflow`'s built-in schema enforcement, the conductor MUST validate each subagent's structured return against its Appendix-A / B / C schema **by hand** before consuming it — otherwise enforcement is lost.
- **`/goal` unavailable** (the loop's per-pie completion condition) → fall back to the manual goal-tracking pattern in [`../cook-pizzas/references/goal-fallback-pattern.md`](../cook-pizzas/references/goal-fallback-pattern.md).

On activation of either fallback, WebFetch the canonical docs the fallback reference names and log the reason to the user (per `loop-workflow-fallback-pattern.md`). The house phrasing for any Workflow-backed step below is: *"Run as a `Workflow` (`parallel()` / `pipeline()`); if `Workflow` is unavailable, fall back per `loop-workflow-fallback-pattern.md`."*

> **Open item (carried from the spec):** confirm the canonical `/loop` + `Workflow` doc URLs in `loop-workflow-fallback-pattern.md`; if they are absent, that reference degrades to in-repo guidance. `/sell-pie` always reaches the fallback **through** that reference — it does not embed its own copy of the detection logic.

---

## Workflow

`/sell-pie` is the **`/loop` driver** over one pie. The conductor holds **zero implementation context**: it reads structured returns, routes them, and never itself writes feature code, behaviorally tests, or grades a slice. The shape:

> **read checklist → pick the active Pie → if `review: continuous` run `/sell-slice` mode → else loop the pie's slices (per-slice Workflow: builder → tester → verifier → fixer; commit + push; no PR) → on all slices `[x]` stop → open the Pie PR via `/box-it-up`.**

### Phase 0 — Set up the loop (once, at the top)

1. Read `docs/plans/00_master_checklist.md`. **Detect the layout.** If flat (`## Stage N`, no `## Pie N`), **refuse** per Mode detection (`--repie` hint) and stop. Do not edit the checklist.
2. Identify the **active Pie**: the first `## Pie N` whose slices are not all `[x]` (unless the user named a pie). Read its `review` annotation (`<!-- review: boundary | continuous -->`), falling back to `review.default`.
3. **Prior-pie check.** Confirm every `## Pie M` (`M < N`) is `Completed` or explicitly authorized to skip ahead. If a prior pie is unmerged and the user has not OK'd proceeding, STOP (`prd_ambiguity` HITL).
4. Confirm git state (`git status --short`, `git rev-parse --abbrev-ref HEAD`). Ensure the pie branch `pie-<n>-<scope>` exists; if not, cut it from the **freshly-fetched `origin/main`** (never local `main`, which may be stale) into **one worktree per pie**: `git fetch origin` then `git worktree add -b pie-<n>-<scope> <path> origin/main`. Never bake on `main`. Setup, isolation, merge, and cleanup follow [`../cook-pizzas/references/git-worktree-standard.md`](../cook-pizzas/references/git-worktree-standard.md).
5. **Detect `/loop`, `Workflow`, `/goal` availability** (per "Workflow availability"); note the fallback that will apply if any is absent.
6. **Set the pie-completion `/goal`** (the loop's continuation condition): a session-scoped condition whose target is *"every `### Slice N.M` under `## Pie N` is `[x]` (Workflow B green per slice), the pie branch has every per-slice commit pushed, and no HITL bubble is outstanding; stop at the pie boundary without opening the PR (that is `/box-it-up`'s job)."* Lift each slice's `**Exit criteria:**` into the condition so the loop knows what "done" means per slice. If `/goal` is unavailable, use the manual fallback (`goal-fallback-pattern.md`). This pie-level goal **subsumes** any per-slice goal — when `/sell-slice` runs under this loop (continuous mode, or the per-slice spine), it detects the active parent goal and does **not** set its own (see `/sell-slice` Phase 2.5).
7. **If `review` resolved to `continuous`,** skip Phase 1's autonomous Workflow and run **Phase 1-C** (continuous mode) instead.

### Phase 1 — Loop the slices (autonomous mode — `review: boundary`)

`/loop` wakes the conductor once per slice. Each wake handles **the next `Not Started` / `In Progress` slice** of the active pie, in checklist order, then advances. **Run the per-slice steps as a `Workflow` (`pipeline()`); if `Workflow` is unavailable, fall back per `loop-workflow-fallback-pattern.md` (with orchestrator-side manual schema validation).**

For the active slice `N.M`:

1. **Spine (delegated, auto-authorized).** Establish the slice's execution context the same way `/sell-slice` does — recon (`discovery ‖ checklist-curator ‖ rules-loader`), build plan, branch — but **the build-plan authorization stop is auto-approved** because the pie-level autonomy already authorized the run (C9). Log a one-line note (*"Build plan auto-approved (/sell-pie loop); proceeding."*); do not stop. The per-slice `/goal` is **skipped** (the parent pie goal is active).
   - Running the slice under the loop is equivalent to running `/sell-slice` with build-plan auth auto-approved and the slice-goal suppressed. `/sell-pie` may invoke `/sell-slice` directly for the spine + Workflow A/B, or drive the Workflow steps itself — either way it reuses `/sell-slice`'s agents and gates; it never forks them.
2. **Workflow A — produce.** Dispatch the **builder** ([../sell-slice/agents/implementer.md](../sell-slice/agents/implementer.md)) for each in-scope checklist item (DB-schema-first for `db-schema` / `full-stack`; `frontend` runs the producer pipeline). The builder writes the slice + its **unit tests**, makes it compile/run + smoke-pass, and **emits the build manifest** (§Appendix A). Merge per-item manifests into one **slice manifest**. Independent items may `parallel()`; dependent items `pipeline()`.
3. **Library Preview gate (event-driven, net-new only).** If the slice authors a net-new component or block (or changes a user-visible surface of a library component), fire the Library Preview gate per `flow.libraryGate` (the one design HITL that survives inside an autonomous pie — spec §1.8). On `self-critique` (default) it proceeds unless the agent flags a concern; on `human` it stops for approval; on `off` it skips. A surfaced concern is a `creative_direction` HITL that **halts the loop**.
4. **Workflow B — verify-once** (`state-illustrator → slice-tester → slice-verifier`, off-context fix loop). **Run as a `pipeline()` `Workflow`; if `Workflow` is unavailable, fall back per `loop-workflow-fallback-pattern.md`.**
   - **`state-illustrator`** (frontend / full-stack with UI only) fills loading / empty / error / success states.
   - **`slice-tester`** — boot the dev server (frontend / full-stack) and dispatch [../sell-slice/agents/slice-tester.md](../sell-slice/agents/slice-tester.md). **CONTEXT SEPARATION (absolute): the conductor passes the tester ONLY the build manifest + the slice's Exit criteria + the design-system path** (`docs/design-system.md`) **+ the dev-server URL + the slice type + the DB target. NEVER the builder's context, reasoning, or chat.** This is the core of `/sell-pie`: the tester must *falsify* the manifest's claims, not trust the builder's narrative — independence is the whole point. Pass through `verification.viewports` (C7) and `visualReview.tools`. The tester type-routes and returns the Appendix-B verdict. Seed-and-cleanup (full-stack / backend) is the tester's: it writes the cleanup script **first**, runs the **non-prod guard** (blocks + bubbles `destructive_operation` if the DB target is not demonstrably local/dev), seeds, round-trips, runs cleanup in a finally block, and asserts zero residue. **The conductor never seeds the DB itself.**
   - **`slice-verifier`** — dispatch [../sell-slice/agents/slice-verifier.md](../sell-slice/agents/slice-verifier.md) with the slice diff (branch + base SHA), the slice manifest, resolved `verification.e2e.*` (C10), the package manager + script names, the workflow inventory, the slice type, and the **already-green checks** so they are not re-run (C5). It runs each static gate once and the **manifest under-declaration backstop** (§1.4 — independently greps the diff for `action(` / `use server` / `onClick` / `<form` / route-file additions and **fails** if the manifest under-counts). Returns the Appendix-C verdict.
   - **Off-context fix loop.** If `slice-tester.overall == fail` OR `slice-verifier.overall == fail`, route the union of `fix_targets` to the **fixer off-context** (it gets the failing verdict + evidence, **not** the builder's or tester's chat). 1st fail → `fix-attempter` → re-run only the failed half. 2nd → `debug-instrumenter` adds `// INSTRUMENT` logging → re-run → `fix-attempter` with richer evidence → re-run. **Cap 3 loops.** On the 3rd persistent failure → **halt the loop** with a `prd_ambiguity` (or the most specific) HITL carrying full evidence. After green, strip `// INSTRUMENT` lines if `debug-instrumenter` ran.
   - **Both verdicts must be `pass`** (or a half legitimately `skipped` for the slice type) before the slice is verified.
5. **Mark + commit + push (no PR).** Flip the slice's `### Slice N.M` row `[ ]` → `[x]` (and its status → `Completed`) in `docs/plans/00_master_checklist.md`. Then invoke **[`/box-it-up --slice`](../box-it-up/SKILL.md)**: it commits the slice on the pie branch with the v5 convention **`feat(pie-N): N.M — <slice name>`** (including the closing-narrative paragraph in the body for UI-touching slices) and **pushes** — **no PR is opened, so CI does not fire.** Per-slice pushes stay cheap.
6. **Advance.** If more slices remain `[ ]` in the active pie, let the loop wake for the next one (or, self-paced, continue in-context to the next slice). If **every** slice is `[x]`, go to Phase 2 (pie boundary). Do **not** start a slice in a *different* pie — `/sell-pie` bakes one pie then stops.

> **Per-slice `hitl_required` still fires inside an autonomous pie.** A slice whose frontmatter sets `hitl_required: true` (e.g. an `external_credentials` slice) halts the loop at that slice even though the pie is `review: boundary` (spec §1.8). The pie-level autonomy authorizes the *run*; it does not suppress a slice's own declared blocking dependency.

### Phase 1-C — Continuous mode (`review: continuous`)

When the active Pie resolves to `continuous` (Payments, Auth, real-data migrations), do **not** run the autonomous per-slice Workflow. For each slice in pie order:

1. Invoke [`/sell-slice`](../sell-slice/SKILL.md) **end-to-end** for that slice — its build-plan authorization stop and Library Preview gate stay **live** (high-touch). The pie-level `/goal` is active, so `/sell-slice` skips its own slice-goal (Phase 2.5 parent-goal pre-check).
2. When `/sell-slice` reports the slice "ready for review locally" (committed on the pie branch), invoke `/box-it-up --slice` to push it (still no PR).
3. Advance to the next slice. When every slice is `[x]`, go to Phase 2.

Continuous mode trades autonomy for the full per-slice human touch points; `/sell-pie` keeps only the pie-level bookkeeping and the boundary handoff.

### Phase 2 — Pie boundary (stop + open the PR via `/box-it-up`)

Reached only when **every** `### Slice N.M` under the active `## Pie N` is `[x]` and each slice's Workflow B was green. This is the **one** HITL the loop never auto-approves (spec §1.8 — the pie-boundary checkpoint).

1. Confirm pie completeness: every slice `[x]`, the pie branch has every per-slice commit pushed, working tree clean.
2. **Hand off to [`/box-it-up`](../box-it-up/SKILL.md)** (pie-completion mode). `/box-it-up` opens **one** PR `Pie N: <name>`, runs CI **once** (the only CI run for the whole pie — per-slice pushes opened no PR), pauses for the **merge-authorization HITL**, then merges **preserving every per-slice commit** (rebase or merge-commit, **never squash**), syncs `main` `--ff-only`, deletes the branch, and **removes the pie worktree**. If CI fails, `/box-it-up`'s `ci-fix-attempter` applies targeted fixes for up to 3 attempts before bubbling to the human.
3. **Clear loop state.** Let the pie-completion `/goal` auto-clear (or clear it manually in the fallback). The loop ends here — `/sell-pie` does not roll into the next pie. The next pie starts in a **fresh chat** with a fresh worktree (for unattended whole-roadmap chaining, that is `/run-the-day`'s job).
4. Emit the Progress Report (below) ending with the boundary handoff status.

> `/sell-pie` **opens no PR itself** and **watches no CI itself** — it stops at the boundary and delegates the entire PR/CI/merge/cleanup lifecycle to `/box-it-up`. This keeps the loop's git surface to exactly "commit + push per slice."

---

## HITL Handling

`/sell-pie` is the **`/loop` conductor** — the top-level surface of its own run. When a subagent or sub-skill returns `needs_human: true`, or the pie boundary is reached, the conductor **halts the loop and surfaces the prompt to the human**. **It does NOT reschedule the wake** to "try again later" past a blocking HITL — the human's answer is what resumes the loop.

**The four blocking HITL categories halt the loop** (they are genuine blocking dependencies / the kept checkpoint — spec §1.8; not auto-resolvable, not rescheduled):

| Category | Typical trigger in `/sell-pie` |
|---|---|
| `prd_ambiguity` | flat checklist (refusal); a prior pie unmerged without OK; missing/weak Exit criteria; fix-loop exhausted after 3 attempts; ambiguous slice scope. |
| `external_credentials` | a slice's `hitl_required` for secrets / OAuth / 3rd-party setup; `gh` not authenticated at the boundary (via `/box-it-up`). |
| `destructive_operation` | the `slice-tester`'s **non-prod guard** blocking a seed (DB target not demonstrably local/dev); a would-be force-push / merge-conflict pull at the boundary (via `/box-it-up`). |
| `creative_direction` | the Library Preview gate surfacing a net-new-component concern; boundary `ci-fix-attempter` exhausting its 3 attempts (via `/box-it-up`). |

Any project-specific categories from `hitl.additionalCategories` surface the same way.

**Agents never call `ask_user_input_v0`.** Every subagent and sub-skill sets `needs_human: true` + the `hitl_category` / `hitl_question` / `hitl_context` fields in its return; `/sell-pie`, as the conductor, reads those fields and surfaces the prompt to the human (and emits the same fields in its **own** return contract when it hands control back to a parent — e.g. `/run-the-day`). On resolution, the conductor appends the answer to the relevant context and resumes the loop at the slice (or boundary) that halted; it never silently advances past an unresolved HITL.

---

## Progress Report Format

At each loop wake (per slice) and at the pie boundary:

1. **Pie + slice state** — active Pie `N — <name>` (`review:` mode), slice `N.M — <name>` (`type:`), slices `[x]` of total in the pie.
2. Checklist items completed this slice (with file paths); files changed (grouped by package/app).
3. **Verification results** — builder gate (lint / typecheck / unit / smoke), `slice-tester` verdict (per-affordance + transitions **both directions on every surface** + seed/cleanup residue), `slice-verifier` verdict (each static gate + manifest backstop counts).
4. Subagent run summary (Workflow A producers, Workflow B fix-loop activity, Library-gate outcome if it fired).
5. Per-slice commit (`feat(pie-N): N.M — <name>` SHA) + push confirmation (**no PR**).
6. Open risks / blockers; next slice (or "pie boundary reached → handing off to `/box-it-up`").
7. **Closing-narrative paragraph** (UI-touching slices only) — one paragraph: what was built · why this shape (one or two trade-offs) · what was deliberately left out · what reviewers should watch. `/box-it-up` lifts it verbatim into the per-slice commit body and the boundary PR.

At the boundary, end with the `/box-it-up` handoff status (PR `Pie N` opened, CI running once, awaiting merge approval — or the merge result if `/box-it-up` completed in the same turn).

---

## Hard Constraints

- **One pie per run, then stop.** `/sell-pie` bakes exactly one Pie to the boundary and stops. It never starts a slice in a different pie, never spans two pies, never rolls into the next pie. Whole-roadmap chaining is `/run-the-day`.
- **Refuse flat checklists — never auto-rewrite.** A flat (`## Stage N`) checklist is a `prd_ambiguity` refusal with the `/cook-pizzas --repie` hint. `/sell-pie` never converts the checklist itself; `--repie` is the user's explicit opt-in.
- **Context separation is absolute.** The conductor passes the `slice-tester` ONLY the build manifest + Exit criteria + design-system path (+ dev URL / slice type / DB target). NEVER the builder's reasoning or chat. The tester falsifies the manifest; it does not trust the builder. This is the reason the loop exists.
- **The conductor holds zero implementation context.** It reads structured returns and routes them. It never writes feature code, never behaviorally tests, never grades a slice, never seeds a DB. The builder builds; the tester tests; the verifier gates; the fixer fixes — `/sell-pie` only conducts.
- **Per slice: commit + push, no PR.** Each cleared slice is committed (`feat(pie-N): N.M — <name>`) and pushed to the pie branch via `/box-it-up --slice`. **No PR is opened mid-pie, so CI does not fire.** CI runs exactly **once per pie**, at the boundary.
- **Stop at the pie boundary; delegate the PR to `/box-it-up`.** When every slice is `[x]`, hand off to `/box-it-up` to open the one PR `Pie N`, run CI once, take the merge-authorization HITL, merge preserving per-slice commits (never squash), sync main, and clean up. `/sell-pie` opens no PR and watches no CI itself.
- **`review: continuous` ⇒ `/sell-slice` mode.** A `continuous` pie runs each slice through high-touch `/sell-slice` (build-plan + library gates live), not the autonomous per-slice Workflow.
- **Build-plan stop is auto-approved under the loop (C9); per-slice `hitl_required` still fires.** The pie-level autonomy authorizes the run, so the per-slice build-plan authorization is auto-approved and logged, not stopped — but a slice whose frontmatter sets `hitl_required: true` still halts the loop.
- **The four HITL categories halt the loop — never reschedule past them.** `prd_ambiguity` / `external_credentials` / `destructive_operation` / `creative_direction` stop the loop and surface to the human; the human's answer resumes it. Do not silently advance or re-wake past an unresolved HITL.
- **Each static gate runs exactly once (C5); viewports from `verification.viewports` (C7); e2e thresholds from `verification.e2e` (C10).** Pass the already-green checks to `slice-verifier` so they are not re-paid; never hardcode a viewport list or run an e2e suite gated `"off"`.
- **Never seed a production DB.** The `slice-tester`'s non-prod guard is blocking; if the DB target is not demonstrably local/dev, it bubbles `destructive_operation` and the loop halts. The conductor never bypasses it.
- **Checklist edits only after green gates.** Flip `[ ]` → `[x]` only after both `slice-tester` and `slice-verifier` return `pass`. Never optimistically mark a slice done. Never edit a *different* slice's plan file.
- **One worktree per pie; never bake on `main`.** The pie branch lives in its own worktree; `/box-it-up` removes it at the boundary.
- **Workflow / loop / goal unavailable → fall back, never drop.** In-context dispatch with orchestrator-side manual schema validation when `Workflow` is absent (`loop-workflow-fallback-pattern.md`); self-pace over ≤8 slices when `/loop` is absent; manual goal-tracking when `/goal` is absent (`goal-fallback-pattern.md`).
- **Subagent prompts live in `./agents/*.md` (under `/sell-slice`).** This SKILL.md is loop logic only — never inline a subagent prompt here.
- **Deprecated agents are never live-dispatched.** `basic-checks-runner`, `aggregating-test-reviewer`, `ci-cd-guardrails`, and `frontend/visual-reviewer` are v4 shims; route through `slice-tester` / `slice-verifier`.
- **Always provide a recommended answer in available options** at every elicitation point the conductor surfaces.

---

## Completion Checklist

Walk this at the pie boundary. Do not report the pie "ready to ship" (handed to `/box-it-up`) until every box is `[x]`.

### 1. Pie loop ran clean

[ ] Master checklist is nested; the active Pie was identified; no flat-checklist refusal.
[ ] Every prior Pie was `Completed` (or the user authorized skipping ahead).
[ ] The pie-completion `/goal` (or its manual fallback) was set.
[ ] `review` mode resolved correctly (autonomous per-slice Workflow vs `/sell-slice` continuous mode).

### 2. Every slice delivered

[ ] Every `### Slice N.M` under the active Pie is `[x]` (status `Completed`).
[ ] For each slice: the builder emitted a complete **build manifest** (§Appendix A).
[ ] For each slice: `slice-tester` returned `overall: pass` — every declared affordance exercised, every transition confirmed **both directions on every surface**, and (data-flow slices) the seed cleaned up with **zero residue**.
[ ] For each slice: `slice-verifier` returned `overall: pass` — lint / typecheck / build / unit-integration / e2e (per `verification.e2e`) / design-system static grep / CI-integrity / manifest under-declaration backstop all clear.
[ ] The `slice-tester` received **only** the manifest + Exit criteria + design-system path (+ dev URL / type / DB target) — never the builder's context.
[ ] If `debug-instrumenter` ran on any slice, every `// INSTRUMENT` line was stripped before that slice's commit.

### 3. Git state per slice

[ ] Each slice committed on the pie branch with `feat(pie-N): N.M — <name>` (closing-narrative paragraph in the body for UI slices).
[ ] Each slice pushed to the pie branch — **no PR opened, no CI fired** mid-pie.
[ ] Working tree clean on the pie branch; one worktree per pie.

### 4. Boundary handoff

[ ] Pie completeness confirmed (every slice `[x]`, all commits pushed).
[ ] Handed off to `/box-it-up` (pie-completion mode) to open the one PR `Pie N`, run CI once, take the merge HITL, merge preserving slice commits, sync main, and clean up branch + worktree.
[ ] Pie-completion goal cleared/auto-cleared.
[ ] Final Progress Report emitted with the boundary handoff status.

---

## Triggers

Follow this skill whenever the user:

- runs `/sell-pie` (autonomous, one whole pie)
- says "sell a pie", "bake the pie", "bake the next pie", "run the next pie", "loop the pie", "deliver the pie"
- has a nested (Pie/Slice) master checklist and wants one whole chapter delivered hands-off

Redirects:

- If the checklist is **flat** (v4 `## Stage N`), refuse and point at `/cook-pizzas --repie` (convert) or `/sell-slice` (works on flat, one stage at a time).
- If the user wants **one careful slice** (sensitive / collaborative), use [`/sell-slice`](../sell-slice/SKILL.md).
- If the user wants the **whole roadmap** unattended, use [`/run-the-day`](../run-the-day/SKILL.md) (it chains `/sell-pie` across every pie).
- At the **pie boundary**, the PR/CI/merge/cleanup is [`/box-it-up`](../box-it-up/SKILL.md)'s job — `/sell-pie` hands off.

---

## Sub-agent return contract

When `/sell-pie` is invoked by a parent orchestrator (e.g. `/run-the-day` chaining pies), it returns structured fields. It never prompts the user directly when run as a sub-agent — the parent reads `needs_human` + `hitl_*` and surfaces any question. (Run standalone as the top-level `/loop` conductor, it surfaces the prompt itself.)

```yaml
status: complete | failed | needs_human
pie: "<N>"                       # the pie this run baked
summary: <one paragraph — pie name + review mode; slices delivered (count); per-slice verification high-level; boundary state (handed to /box-it-up: PR opened / CI / merged), or where the loop halted>
slices_completed: <int>
slices_total: <int>
artifacts:
  - <pie branch name>
  - <per-slice commit SHAs>
  - <boundary PR url (once /box-it-up opened it)>
needs_human: false | true
hitl_category: null | "prd_ambiguity" | "external_credentials" | "destructive_operation" | "creative_direction"
hitl_question: null | "<plain-language question>"
hitl_context: null | "<what triggered this — e.g. flat-checklist refusal, non-prod guard blocked a seed, fix-loop exhausted, pie-boundary merge approval>"
```
