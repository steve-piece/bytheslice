---
name: sell-pie
description: "Bake a whole Pie autonomously - the v5 forefront delivery loop. A /loop-driven baker that drives ONE Pie (a coherent chapter, usually 3 to 8 slices) to \"ready for review\" without per-slice prompting; each slice runs the context-separated build→test→verify→fix Workflow, commits + pushes (no PR), and advances; when every slice is [x] it stops at the pie boundary and opens one PR via /box-it-up. Refuses flat v4 checklists (points you at /cook-pizzas --repie). For a continuous-review pie (review=continuous) it runs in high-touch /sell-slice mode. Opt-in merge-per-slice delivery (delivery.mode, or an explicit autonomous-delivery run instruction) instead gives each slice its own branch, PR and green-CI merge; opt-in ship-once delivery (delivery.mode, set by /pizza-party) merges each pie into one local ship branch on local gates only and ships one PR at the end. The four blocking HITL categories halt the loop instead of rescheduling (an unattended ship-once run defers the slice instead). Use when the user runs /sell-pie, says \"sell a pie\", \"bake the pie\", \"run the next pie\", \"loop the pie\", or wants one whole chapter delivered hands-off. For a single careful slice use /sell-slice; for the whole app end to end use /pizza-party."
user-invocable: true
triggers: ["/bytheslice:sell-pie", "/sell-pie", "sell a pie", "bake the pie", "bake a pie", "run the next pie", "loop the pie", "bake the next pie", "/bytheslice:bake-pie", "/bake-pie", "deliver the pie"]
---
<!-- skills/sell-pie/SKILL.md -->
<!-- v5 forefront skill (spec §1.2, §1.3, §1.8, §1.11). Pizza-shop framing: a Pie is a chapter of usually 3 to 8 slices (a small app's pie may hold 1 or 2); /sell-pie is the autonomous baker that drives ONE pie off the rack to "ready for review", slice by slice, in one /loop. The /loop conductor holds ZERO implementation context: per slice it dispatches a Workflow (builder → slice-tester → slice-verifier → fixer) and passes the tester ONLY the build manifest + Exit criteria + design-system path - never the builder's reasoning - so the tester cannot rationalize the builder's choices. Per slice: commit + push, no PR (CI stays quiet). At the pie boundary (every slice [x]): hand off to /box-it-up to open one PR "Pie N", run CI once, merge preserving slice commits. Refuses flat v4 checklists (--repie hint). review: continuous forces /sell-slice mode. The four HITL categories halt the loop (do NOT reschedule the wake). Opt-in ship-once delivery merges each pie into a local ship branch (local gates only) and ships one PR after the last pie. The everyday single-slice tool is /sell-slice; the end-to-end chainer is /pizza-party. -->

# /sell-pie

In v5 a **Pie** is the unit of autonomy. A pie is a coherent chapter (e.g. "Database Scaffold", "Blog Editor") of **usually 3 to 8 slices** with low cross-coupling; a small app's pie may hold 1 or 2, since `/cook-pizzas` right-sizes the roadmap and never pads. `/sell-pie` is a **`/loop`-driven autonomous baker** that drives **one** pie from `Not Started` to "ready for review" - slice by slice, in a single loop, without stopping for per-slice authorization.

The loop **conductor holds zero implementation context.** Per slice it dispatches a `Workflow` that routes structured artifacts between singular-goal subagents - **builder → `slice-tester` → `slice-verifier` → fixer** - and then commits + pushes that slice (**no PR, so CI stays quiet**). When **every** slice under the active Pie is `[x]`, the loop stops at the **pie boundary** and hands off to [`/box-it-up`](../box-it-up/SKILL.md), which opens **one** PR `Pie N`, runs CI **once**, and merges preserving every per-slice commit.

That is the default `pie-pr` delivery mode. **Merge-per-slice mode** (opt-in, see "Delivery mode" below) swaps the git lifecycle: each slice gets its own branch and worktree cut from fresh `main`, its own PR `Slice N.M: <name>`, and merges on green CI with a merge commit before the next slice starts. **Ship-once mode** (opt-in, the mode `/pizza-party` runs) keeps the per-pie branch and worktree but bases every pie on one long-lived local ship branch instead of `main`: all gates are local, no pie is pushed or opened as a PR, `/box-it-up --pie-local` merges each finished pie into the ship branch, and `/box-it-up --ship` opens the **one** PR ship branch to `main` after the last pie. Build, test, verify and fix are identical in all three modes.

`/sell-pie` is the **forefront** delivery command in v5. Its siblings:

- [`/sell-slice`](../sell-slice/SKILL.md) - **one** careful slice, high-touch (build-plan + library gates intact). Use for sensitive or collaborative work. `/sell-pie` *delegates* to it for `review: continuous` pies and for the per-slice spine.
- [`/pizza-party`](../pizza-party/SKILL.md) - the end-to-end chainer: one interview, then every pie through `/sell-pie` under ship-once delivery with `run.unattended: true`, one PR, deploy.
- [`/box-it-up`](../box-it-up/SKILL.md) - opens the boundary PR, runs CI once, merges, and cleans up the pie branch + worktree.

---

## Mode detection

`/sell-pie` is **always sequential over one pie** - it never parallelizes slices and never spans two pies in a single run. It resolves its mode before doing anything:

| Mode | How it's detected | What it does |
|------|-------------------|--------------|
| **autonomous** (default) | The master checklist is **nested** (`## Pie N` / `### Slice N.M`), the active Pie carries `review: boundary` (or omits the annotation and `review.default` is `boundary`), and every prior Pie is merged-or-authorized. | Run the `/loop` driver (Workflow below): loop the pie's slices, each through the per-slice Workflow, commit + push per slice, **one** HITL at the pie boundary. |
| **continuous** (high-touch) | Same as above but the active Pie carries `review: continuous` (Payments, Auth, real-data migrations), OR `review.default` is `continuous` for an unannotated pie. **Never under ship-once delivery** (see below). | **Drive each slice through `/sell-slice` in full** (build-plan + library gates live) instead of the autonomous per-slice Workflow. The pie still completes slice-by-slice; the human touch points of `/sell-slice` are preserved for the whole pie. |
| **refused** (flat checklist) | The master checklist is **flat** (`## Stage N`, no `## Pie N` / `### Slice N.M` headings) - a v4 project that was never re-pied. | **STOP.** `/sell-pie` does not run on a flat checklist. Surface the `--repie` hint (below). Never auto-rewrite the checklist. |

**Refusal - flat checklist (hard stop, no auto-rewrite).** `/sell-pie`'s autonomy is the *pie*; a flat v4 checklist has no pies to loop. Detect a flat layout (no `## Pie N` headings; only `## Stage N`) and STOP with `needs_human: true`, `hitl_category: prd_ambiguity`:

> *"This project's master checklist is flat (v4 `## Stage N`), so `/sell-pie` has no pies to loop. Either run `/sell-slice` (it works on flat checklists, one stage at a time) - or convert to the two-level Pie/Slice structure with **`/cook-pizzas --repie`** (explicit, opt-in; it never silently rewrites your plans). Once the checklist is pied, re-run `/sell-pie`."*

Never convert the checklist yourself - `--repie` is the user's explicit opt-in (spec §1.3, dual-read). `/sell-pie` reads both layouts only far enough to detect the flat case and refuse; it does not edit plan files.

**Continuous-pie delegation.** When the active Pie's `review` resolves to `continuous`, `/sell-pie` does not run its own per-slice Workflow. Instead, for each slice in pie order, it invokes [`/sell-slice`](../sell-slice/SKILL.md) end-to-end (which keeps the build-plan authorization and Library Preview gate live). `/sell-pie` still owns the pie-level loop bookkeeping (which slice is next, when the pie is complete, the boundary handoff) and the pie-level `/goal`; it simply swaps the autonomous per-slice Workflow for high-touch `/sell-slice` runs. See spec §1.8: `review: continuous` forces `/sell-pie` into `/sell-slice` mode for that pie. **Exception, ship-once delivery:** a `review: continuous` pie bakes hands-off through the autonomous per-slice Workflow (Phase 1), exactly like a boundary pie. The operator chose hands-off delivery for Auth and Payments too when they chose ship-once; log it once: *"Pie N is review: continuous; baking hands-off under ship-once."*

### Delivery mode (how slices reach `main`)

Resolve once in Phase 0, after the review mode:

| Delivery mode | When | Git lifecycle |
|---|---|---|
| **`pie-pr`** (default) | Neither the run instruction nor `delivery.mode` asks for merge per slice; **always** for a `review: continuous` pie. | One pie branch in one worktree; each slice commits + pushes with no PR; `/box-it-up` opens one PR `Pie N` at the boundary, CI once, operator approves the merge. |
| **`merge-per-slice`** | The operator's run instruction explicitly asks for autonomous delivery ("merge each slice", "deliver it to main without me"), or `delivery.mode` is `"merge-per-slice"`. Invoking `/sell-pie` on its own is not such an instruction. | Per slice, in checklist order: branch `pie-N-sN.M-<scope>` cut from fresh `origin/main` into its own worktree, build/test/verify, commit, PR `Slice N.M: <name>`, CI, up to 3 `ci-fix-attempter` rounds, merge on green with a merge commit, cleanup from the primary checkout. See Phase 1-M. |
| **`ship-once`** | `delivery.mode` is `"ship-once"` (`/pizza-party` sets it), or the run instruction explicitly asks to ship the whole build as one PR. | One local ship branch (`delivery.shipBranch`, default `ship/<repo dir name>`) cut once from fresh `origin/main`; per pie, branch `pie-<n>-<scope>` cut from the ship branch into one worktree, per-task commits **with no push**, local gates only; at the boundary `/box-it-up --pie-local` re-runs the full local check and merges the pie into the ship branch with `git merge --no-ff`; after the last pie `/box-it-up --ship` pushes the ship branch, opens one PR to `main`, watches CI once and merges on green. See Phase 1-S. |

**The run instruction wins for that run**, in either direction (an instruction asking for one PR per pie overrides a `merge-per-slice` or `ship-once` config). A `review: continuous` pie uses `pie-pr` under the default and merge-per-slice modes, whatever the config or instruction says; under `ship-once` it bakes hands-off like a boundary pie (see Continuous-pie delegation). Log the resolved mode once: *"Delivery: <mode> (<reason: run instruction | delivery.mode>)."*

### Unattended runs (`run.unattended`)

`run.unattended: true` (`/pizza-party` sets it alongside ship-once) means **nothing waits on a human**. It applies only when delivery resolves to `ship-once`; under `pie-pr` or `merge-per-slice` it is ignored and logged once (those modes keep their human gates). Interactive runs (`run.unattended` false, the default) behave exactly as described everywhere else in this skill.

Under an unattended ship-once run, every point that would raise a HITL instead **defers** and continues:

- **Defer the slice.** Leave its row `[ ]` and set `**Status:** deferred: <reason>` in `$PLANS/00_master_checklist.md`. Record a blocker `{slice: "N.M", reason, attempts}` (attempts = the local fix loops or fix rounds used) and one `bts_note`. If the slice already committed tasks on the pie branch, keep that work on a local branch `deferred/pie-N-sN.M` and reset the pie branch to the slice's start SHA (from the run log start line) inside the pie worktree, so no unverified slice commit ever reaches the ship branch (the workflow guard refuses the final PR otherwise). The pie branch is local and never pushed under ship-once, so the reset rewrites nothing remote.
- **Defer its dependents.** Every later slice that `depends_on` a deferred slice is deferred too (reason `depends on deferred N.M`) without being built.
- **Continue** with the next runnable slice, then the boundary. A pie whose slices are all `[x]` or deferred is finished for this run: `/box-it-up --pie-local` merges what was verified. A pie-level blocker (the pie-local check exhausted its rounds, a merge into the ship branch failed) is `{pie: "N", reason, attempts}`.
- **Return** `status: complete_with_deferrals` with the `blocked` list (Sub-agent return contract) and never ask. The `/pizza-party` conductor decides what happens next (one replan through `/special-order`, then defer and report).

What defers: an exhausted 3-loop local fix cap, a repeated-signature bail, an empty-manifest or `needs_human` agent return, the non-prod guard, a `hitl_required` slice or an approval the `/pizza-party` interview did not answer (resolve each approval-batch item from the interview answers passed in the run instruction; never auto-accept terms, credentials or a destructive operation), the soft time budget hit on a slice that did not advance since the last check-in (one that did advance takes the "extend" answer automatically, once per check-in). What becomes a note instead: a Library Preview concern (`flow.libraryGate: human` reads as `self-critique`), design-critic leftovers (Phase 2 step 1b). An incomplete prior pie is recorded as a pie blocker and the run proceeds (the `/pizza-party` conductor chose the order). A slice left `waiting until <YYYY-MM-DD>` (calendar-gated) is not deferred: its commits passed `slice-verifier`, so they stay on the pie branch and merge with the pie; its row stays `[ ]` and it is listed in `blocked` with reason `waiting until <date>`. **Fix caps never rise:** deferral replaces the halt, never an extra attempt.

## Subagent Roster

Every dispatch description (Agent tool `description`, Workflow `label`) starts with `P<pie> S<slice> <step>:` (for example `P4 S4.2 build: kitchen server`); `<step>` is `prep`, `build`, `test`, `verify`, `fix`, `plate`, or `review`.

The per-slice Workflow routes structured artifacts between four singular-goal subagents, each a **registered plugin agent** dispatched by type: `agent(inputs, {agentType: "bytheslice:<name>"})`. The prompt carries ONLY that stage's declared inputs; the platform loads the definition (role prompt, model, effort, tool allowlist) itself. All four definitions live under `/sell-slice`'s `agents/` directory (shared with `/sell-slice`'s Workflow A/B, not forked). **Fallback** (Cursor, or any host without plugin-agent registration): Read the file and dispatch it per [`loop-workflow-fallback-pattern.md`](../cook-pizzas/references/loop-workflow-fallback-pattern.md) "Agent shape on the fallback path": its frontmatter goes first as a header (model tier and effort, the normalized tool allowlist, the read-only line for an agent without write tools, the no-git-writes line), then its body, then the inputs; log one self-check line per dispatch in the run log.

**Only the conductor writes to git**, on the registered and the fallback path alike, and that includes `git add`. The builder, fixers and `library-entry-writer` (and `ci-fix-attempter` inside `/box-it-up`) return `files_changed`; at every task boundary and at the slice's final commit the conductor stage exactly the paths agents returned in `files_changed` (plus the checklist when it changed) with `git add -- <paths>`, never `git add -A` or `git add .`; check `git status --short` shows nothing unexpected (an unexpected file is reported, not swept in); then commit and push.

| Step | Agent file | Singular goal | Receives | Returns | Model | Effort |
|------|-----------|---------------|----------|---------|-------|--------|
| build | [../sell-slice/agents/implementer.md](../sell-slice/agents/implementer.md) | implement the slice + its **unit tests**; make it compile/run; **never** behaviorally review its own work | slice plan, design system | code, unit tests, **build manifest** (§Appendix A), smoke result | opus | medium |
| test | [../sell-slice/agents/slice-tester.md](../sell-slice/agents/slice-tester.md) | independently verify behavior | **build manifest + Exit criteria + design-system path only** (+ dev URL / slice type / DB target) | per-affordance verdict + evidence (§Appendix B) | sonnet | high |
| verify | [../sell-slice/agents/slice-verifier.md](../sell-slice/agents/slice-verifier.md) | static gates, each exactly once + the manifest under-declaration backstop | slice diff, build manifest, resolved `verification.*`, workflow inventory | one verdict (§Appendix C) | sonnet | high |
| fix | [../sell-slice/agents/fix-attempter.md](../sell-slice/agents/fix-attempter.md) | smallest fix for **one** failing behavior | failing verdict + evidence (**off-context** - not the builder's or tester's chat) | targeted patch | sonnet | high |

`debug-instrumenter` ([../sell-slice/agents/debug-instrumenter.md](../sell-slice/agents/debug-instrumenter.md)) backs the fixer on a second failure (targeted `// INSTRUMENT` logging), exactly as in `/sell-slice` Phase 5.4.

The UI review agents are `/sell-slice`'s too: [`break-ui-runner`](../sell-slice/agents/frontend/break-ui-runner.md) (sonnet, per slice with data-bound UI, Workflow B), [`design-critic`](../sell-slice/agents/frontend/design-critic.md) (sonnet, the library gate and once per pie at the boundary, Phase 2 step 1b) and [`ui-fix-attempter`](../sell-slice/agents/frontend/ui-fix-attempter.md) (opus, the fixer whenever a target comes from either review). Both reviewers wrap vendored third-party skills ([`../sell-slice/references/vendor/`](../sell-slice/references/vendor/README.md)) and never gate a merge on their own.

For the foundation slice types and the frontend producer pipeline that a slice may route through, `/sell-pie` defers entirely to `/sell-slice`'s routing - it does not re-implement it. One consequence is load-bearing here: on `type: frontend` the `build` row above **does not run**, and [`state-illustrator`](../sell-slice/agents/frontend/state-illustrator.md) emits the build manifest instead, at the Workflow B entry. For model-override paths, see [`../setup-shop/references/model-tier-guide.md`](../setup-shop/references/model-tier-guide.md).

> **Subagent prompts live in `./agents/*.md` (under `/sell-slice`).** This SKILL.md is loop logic only - never inline a subagent prompt here.

---

## Inputs and Preconditions

> This skill checks its own preconditions inline at the start, via tools (checklist exists, prior pies merged-or-authorized, git state). If one fails, raise the problem to the operator as a question with a recommended next step, never a refusal; a flat checklist is handled by Mode detection above. If the master checklist is missing, ask (AskUserQuestion, Accept or Decline) whether to set up ByTheSlice. Never narrate passing checks in chat. No ByTheSlice hook blocks a prompt.

- `docs/plans/00_master_checklist.md` exists and is **nested** (`## Pie N` / `### Slice N.M`). A flat checklist triggers the refusal above.
- Every stage/slice file referenced by the active Pie has a `docs/plans/stage_<n>_*.md` plan file, each carrying `pie` / `slice` / `review` frontmatter (see [`../cook-pizzas/references/stage-frontmatter-contract.md`](../cook-pizzas/references/stage-frontmatter-contract.md)) and a well-formed `**Exit criteria:**` block.
- **An active Pie exists** - a `## Pie N` whose slices are not all `[x]`.
- **Every prior Pie is merged-or-authorized.** Each `## Pie M` with `M < N` is either `Completed` in the checklist (its boundary PR merged) or the user explicitly authorized starting this pie ahead of it. `/sell-pie` does not start Pie N while Pie N-1 is unmerged unless the user OKs it (`prd_ambiguity` HITL otherwise).
- **Merge-per-slice mode:** clean primary checkout on `main`, synced with `origin/main`; `gh` authenticated; the repo allows merge commits. No pie branch is cut; each slice gets its own branch and worktree (Phase 1-M).
- **Ship-once mode:** clean primary checkout on the ship branch (`delivery.shipBranch`), or on `main` synced with `origin/main` before the ship branch exists (Phase 0 cuts it). Prior pies count as merged when they are merged into the ship branch (`git merge-base --is-ancestor`), not `main`. `gh` authentication is needed only for the final `/box-it-up --ship` step, never per pie.
- Default `pie-pr` mode: clean git working tree; the pie branch `pie-<n>-<scope>` exists or will be cut from the freshly-fetched `origin/main` (`git fetch origin` then `git worktree add -b pie-<n>-<scope> <path> origin/main`) into **one worktree per pie** - never from local `main`, which may be stale. Never bake directly on `main` / `master`. Worktree setup, isolation, merge, and cleanup follow [`../cook-pizzas/references/git-worktree-standard.md`](../cook-pizzas/references/git-worktree-standard.md).

## Project Config

At session start, resolve `bytheslice.config.json` (precedence: env → config → project rules → defaults; see [`../setup-shop/references/bytheslice-config-schema.md`](../setup-shop/references/bytheslice-config-schema.md)) and log the resolved values once. The keys `/sell-pie` consumes:

- **`review.default`** - `boundary` (default) | `continuous`. Fills the gap for a pie with no `<!-- review: ... -->` annotation. **A pie's own annotation always wins.** Governs the loop (autonomous vs `/sell-slice` mode).
- **`flow.autoApproveBuildPlan`** - irrelevant to the loop's decision (the build-plan stop is **always** auto-approved under the `/sell-pie` loop); the per-slice `/sell-slice` reads it only in standalone runs.
- **`flow.libraryGate`** - `self-critique` (default) | `human` | `off`. The Library Preview gate still fires for **net-new components** inside an autonomous pie (the one event-driven design HITL, spec §1.8); honored by the per-slice Workflow / `/sell-slice`.
- **`delivery.mode`** - `pie-pr` (default) | `merge-per-slice` | `ship-once`. Picks the git lifecycle (see "Delivery mode"); a run instruction overrides it for that run. A `review: continuous` pie uses `pie-pr` under the first two and bakes hands-off under `ship-once`.
- **`delivery.shipBranch`** - string, default `ship/<repo dir name>` (the primary checkout's directory name). The long-lived local ship branch under `ship-once`; ignored by the other modes.
- **`run.unattended`** - boolean, default `false`. Under `ship-once` only: nothing waits on a human; every would-be HITL defers the slice and the run continues (see "Unattended runs"). `/pizza-party` sets it.
- **`delivery.sliceBudgetHours`** - number, default `3`; `0` = off. The soft wall-clock budget per slice (see "Soft time budget" under Phase 1).
- **`verification.viewports`** *(C7, default `[375, 768, 1280]`)* and **`verification.e2e.*`** *(C10)* - passed through to `slice-tester` (viewports; it screenshots only at 768 and 1280) and `slice-verifier` (e2e thresholds). Never hardcode these. Under `quality.tier: lean` the thresholds do not apply: the verifier's only e2e gate is `test:e2e:smoke`.

---

## Slice-Type Routing

`/sell-pie` does **not** route per slice type itself - that is `/sell-slice`'s job (and the per-slice Workflow reuses it). Every slice, regardless of `type:`, is driven through the same per-slice Workflow (autonomous mode) or the same `/sell-slice` invocation (continuous mode); the slice's `type:` frontmatter routes the producer pipeline and the `slice-tester`'s test mode internally (`frontend` = rendered design-system match + per-affordance exercise; `full-stack` / `backend` = seed-and-cleanup data-flow; `infrastructure` = probe/harness). See [`../sell-slice/SKILL.md`](../sell-slice/SKILL.md) "Slice-Type Routing".

---

## Workflow availability (CC-only primitives)

`/loop` and `Workflow` (`parallel()` / `pipeline()`) are **Claude-Code-only** primitives. `/sell-pie` is built on both: `/loop` is the conductor that wakes per slice; `Workflow` carries the per-slice build→test→verify→fix dispatch with schema enforcement. Detect availability **up front**; if either is absent (Cursor, `disableAllHooks`, workspace-trust not accepted, or any other reason the primitive surfaces), **fall back - do not silently drop the logic** (spec §1.11):

- **`/loop` unavailable** → `/sell-pie` **self-paces** over the pie's ≤8 slices in a single context (one continuous run rather than scheduled wakes). It still drives the same per-slice Workflow per slice, in order, and stops at the pie boundary. Use a session-scoped `/goal` (or its manual fallback) as the continuation driver instead of the loop's scheduler.
- **`Workflow` unavailable** → fall back to **in-context dispatch with orchestrator-side manual schema validation** per [`../cook-pizzas/references/loop-workflow-fallback-pattern.md`](../cook-pizzas/references/loop-workflow-fallback-pattern.md). Without `Workflow`'s built-in schema enforcement, the conductor MUST validate each subagent's structured return against its Appendix-A / B / C schema **by hand** before consuming it - otherwise enforcement is lost.
- **`/goal` unavailable** (the loop's per-pie completion condition) → fall back to the manual goal-tracking pattern in [`../cook-pizzas/references/goal-fallback-pattern.md`](../cook-pizzas/references/goal-fallback-pattern.md).

On activation of either fallback, WebFetch the canonical docs the fallback reference names and log the reason to the user (per `loop-workflow-fallback-pattern.md`). The house phrasing for any Workflow-backed step below is: *"Run as a `Workflow` (`parallel()` / `pipeline()`); if `Workflow` is unavailable, fall back per `loop-workflow-fallback-pattern.md`."*

> **Open item (carried from the spec):** confirm the canonical `/loop` + `Workflow` doc URLs in `loop-workflow-fallback-pattern.md`; if they are absent, that reference degrades to in-repo guidance. `/sell-pie` always reaches the fallback **through** that reference - it does not embed its own copy of the detection logic.

---

## Workflow

At every phase boundary, if the `bts_status` tool is available call it instead of re-reading the checklist; if it is not, read the checklist as before.

`/sell-pie` is the **`/loop` driver** over one pie. The conductor holds **zero implementation context**: it reads structured returns, routes them, and never itself writes feature code, behaviorally tests, or grades a slice. The shape:

> **read checklist → pick the active Pie → if `review: continuous` run `/sell-slice` mode → else loop the pie's slices (per-slice Workflow: builder → tester → verifier → fixer; commit + push; no PR) → on all slices `[x]` stop → open the Pie PR via `/box-it-up`.** In merge-per-slice mode each slice instead runs in its own worktree and merges through its own PR before the next one starts (Phase 1-M). In ship-once mode the pie branch is cut from the local ship branch, nothing is pushed per slice, and the boundary merges the pie into the ship branch locally (Phase 1-S).

### Phase 0 - Set up the loop (once, at the top)

1. Read `docs/plans/00_master_checklist.md`. **Detect the layout.** If flat (`## Stage N`, no `## Pie N`), **refuse** per Mode detection (`--repie` hint) and stop. Do not edit the checklist.
2. Identify the **active Pie**: the first `## Pie N` whose slices are not all `[x]` (unless the user named a pie); in an unattended ship-once run, the first pie with a slice that is neither `[x]` nor `deferred:`. Read its `review` annotation (`<!-- review: boundary | continuous -->`), falling back to `review.default`.
3. **Prior-pie check.** Confirm every `## Pie M` (`M < N`) is `Completed` or explicitly authorized to skip ahead. If a prior pie is unmerged and the user has not OK'd proceeding, STOP (`prd_ambiguity` HITL). Under ship-once "merged" means merged into the ship branch; an unattended ship-once run records an incomplete prior pie as a pie blocker and proceeds instead of stopping.
4. **Resolve the delivery mode** (see "Delivery mode"). In `merge-per-slice` mode, confirm the primary checkout is clean, on `main`, and synced (`git pull --ff-only`), check `gh repo view --json mergeCommitAllowed` (false: halt with a `prd_ambiguity` HITL and ask), cut **no** pie branch, and skip the rest of this step: the conductor stays on `main` between slices and cuts one slice worktree per slice in Phase 1-M.
   In `ship-once` mode, resolve the ship branch name (`delivery.shipBranch`, default `ship/<basename of $PRIMARY>`). If it does not exist yet, confirm the primary checkout is clean and on `main`, then cut it once from the freshly-fetched remote: `git -C "$PRIMARY" fetch origin` then `git -C "$PRIMARY" switch -c <ship-branch> origin/main` (`/pizza-party` normally cut it already). If it exists, confirm the primary checkout is clean and on it. Then cut the pie branch from the **local ship branch**, not `origin/main`: `git -C "$PRIMARY" worktree add -b pie-<n>-<scope> <path> <ship-branch>`. Resolve `$PLANS` per [`git-worktree-standard.md`](../cook-pizzas/references/git-worktree-standard.md) (the pie worktree holds no gitignored plans). Skip the `pie-pr` paragraph below.
   Default `pie-pr` mode: confirm git state (`git status --short`, `git rev-parse --abbrev-ref HEAD`). Ensure the pie branch `pie-<n>-<scope>` exists; if not, cut it from the **freshly-fetched `origin/main`** (never local `main`, which may be stale) into **one worktree per pie**: `git fetch origin` then `git worktree add -b pie-<n>-<scope> <path> origin/main`. Never bake on `main`. Setup, isolation, merge, and cleanup follow [`../cook-pizzas/references/git-worktree-standard.md`](../cook-pizzas/references/git-worktree-standard.md).
5. **Detect `/loop`, `Workflow`, `/goal` availability** (per "Workflow availability"); note the fallback that will apply if any is absent.
6. **Set the pie-completion `/goal`** (the loop's continuation condition): a session-scoped condition whose target is *"every `### Slice N.M` under `## Pie N` is `[x]` (Workflow B green per slice), the pie branch has every per-slice commit pushed, and no HITL bubble is outstanding; stop at the pie boundary without opening the PR (that is `/box-it-up`'s job)."* In `merge-per-slice` mode the target instead reads *"every `### Slice N.M` under `## Pie N` is `[x]` and merged to `main` through its own green-CI PR, every slice branch and worktree is cleaned up, and no HITL bubble is outstanding."* In `ship-once` mode it reads *"every `### Slice N.M` under `## Pie N` is `[x]` (or `deferred:` in an unattended run), the pie branch carries every per-task and per-slice commit locally, and no HITL bubble is outstanding; stop at the pie boundary and hand off to `/box-it-up --pie-local`."* Lift each slice's `**Exit criteria:**` into the condition so the loop knows what "done" means per slice. If `/goal` is unavailable, use the manual fallback (`goal-fallback-pattern.md`). This pie-level goal **subsumes** any per-slice goal - when `/sell-slice` runs under this loop (continuous mode, or the per-slice spine), it detects the active parent goal and does **not** set its own (see `/sell-slice` Phase 2.5).
7. **If `review` resolved to `continuous`** (and delivery is not `ship-once`), skip Phase 1's autonomous Workflow and run **Phase 1-C** (continuous mode) instead. Under `ship-once` a continuous pie runs Phase 1 like any other.

### Phase 1 - Loop the slices (autonomous mode - `review: boundary`)

`/loop` wakes the conductor once per slice. Each wake handles **the next `Not Started` / `In Progress` slice** of the active pie, in checklist order, then advances. **Calendar-gated slices:** a slice whose `**Status:**` reads `waiting until <YYYY-MM-DD>: <criterion>` is skipped while the date is ahead, together with every slice that `depends_on` it; the loop takes the next independent slice instead. On or after the date, the waiting slice is picked up first and the run only checks its date-gated criterion, then closes it (flip `[x]`, commit; in merge-per-slice mode through a small slice PR, since `main` takes no direct commits). **Run the per-slice steps as a `Workflow` (`pipeline()`); if `Workflow` is unavailable, fall back per `loop-workflow-fallback-pattern.md` (with orchestrator-side manual schema validation).**

For the active slice `N.M`:

1. **Spine (delegated, auto-authorized).** Append the slice's start line (slice id, start time) to the run log `.claude/.bytheslice-state/run-log.md`; the soft time budget counts from it. Establish the slice's execution context the same way `/sell-slice` does - recon (`discovery ‖ checklist-curator ‖ rules-loader`), build plan, branch - but **the build-plan authorization stop is auto-approved** because the pie-level autonomy already authorized the run (C9). Log a one-line note (*"Build plan auto-approved (/sell-pie loop); proceeding."*); do not stop. The per-slice `/goal` is **skipped** (the parent pie goal is active).
   - Running the slice under the loop is equivalent to running `/sell-slice` with build-plan auth auto-approved and the slice-goal suppressed. `/sell-pie` may invoke `/sell-slice` directly for the spine + Workflow A/B, or drive the Workflow steps itself - either way it reuses `/sell-slice`'s agents and gates; it never forks them.
2. **Workflow A - produce.** Dispatch the **builder** (`bytheslice:implementer`, [definition](../sell-slice/agents/implementer.md)) for each in-scope checklist item (DB-schema-first for `db-schema` / `full-stack`; `frontend` runs the producer pipeline in `/sell-slice`'s order: `modern-ux-expert` writes `docs/ux-spec-<slice>.md`, then `layout-architect` runs serial, only after `modern-ux-expert` returns, because it reads that spec in full and appends `## Breakpoint Plan` to it; never dispatch the two together). The builder writes the slice + its **unit tests**, runs gate tiers 1 and 2 (see `/sell-slice` "Gate tiers": lint on changed files, incremental typecheck and colocated unit tests while coding; the task's own tests, build, and DB tests only when the schema or migrations changed before each commit), and **emits the build manifest** (§Appendix A); on `type: frontend` no builder is dispatched, so no manifest comes from this step and **`state-illustrator`** emits it at step 4 below. **On `type: frontend`, pass the slice's Exit criteria verbatim in every frontend producer's input contract** (the producer pipeline here, `library-entry-writer` at step 3 and `state-illustrator` at step 4): withholding the builder's reasoning from the tester is the point of context separation; withholding the shared standard from the builder never was. The `slice-tester` input list does not change. Merge per-item manifests into one **slice manifest**. Independent items may `parallel()`; dependent items `pipeline()`. **Clean tree at every task boundary:** when a `### Task K` clears its reviews on a green tier 2, the conductor stages the builder's `files_changed` selectively and commits it as `feat(pie-N): N.M task K <task name>` and push (pie branch by default, slice branch in merge-per-slice mode; ship-once commits on the pie branch and **does not push**), before the next task starts.
3. **Library Preview gate (event-driven, net-new only).** If the slice authors a net-new component or block (or changes a user-visible surface of a library component), fire the Library Preview gate per `flow.libraryGate` (the one design HITL that survives inside an autonomous pie - spec §1.8). On `self-critique` (default) it proceeds unless the agent flags a concern; on `human` it stops for approval; on `off` it skips. A surfaced concern is a `creative_direction` HITL that **halts the loop**.
4. **Workflow B - verify-once** (`state-illustrator → break-ui-runner → slice-tester → slice-verifier`, off-context fix loop). **Run as a `pipeline()` `Workflow`; if `Workflow` is unavailable, fall back per `loop-workflow-fallback-pattern.md`.**
   - **`state-illustrator`** (frontend / full-stack with UI only) fills loading / empty / error / success states. **On `type: frontend` it is also the build-manifest emitter** (§Appendix A): pass it the slice id, the slice type and the implemented-files list, and take `build_manifest` off its return as **the** slice manifest for the two agents below. It derives that manifest from the files on disk, and `slice-verifier` re-derives its own count from the diff independently, so this is one emission plus one independent check, not two opinions. The manifest stays in the conversation (no file holds it); the state files in its `files_changed` are staged like any agent's. **Fallback, `mode: "manifest-only"`:** when the build plan lists zero interactive surfaces for a `frontend` slice, dispatch it in that mode; it skips the state work and returns `build_manifest` alone (routes and components declared, affordances empty), and if its `summary` says the files on disk are not display-only, re-dispatch it in `full` mode. On `full-stack` the builder already emitted the manifest at step 2, so merge the affordances and transitions `state-illustrator` returns (retry buttons, empty-state calls to action, dismiss controls) into it before dispatching the tester, or the backstop counts them in the diff and reports an under-declaration the builder never caused. If it returns `needs_human`, or returns `complete` with an empty `build_manifest` on a frontend slice, that is a `prd_ambiguity` HITL that **halts the loop**; it is an operator question and consumes none of the 3 local fix loops. Never run the tester against nothing.
   - **`break-ui-runner`** (frontend / full-stack with data-bound UI only, as [`/sell-slice` 5.1b](../sell-slice/SKILL.md) defines it) - `state-illustrator` scaffolds the dev-only `?data=demo|worst|empty|one|many` switch on data-bound surfaces (tables, lists, cards, badges, avatars, breadcrumbs); boot the dev server and dispatch `bytheslice:break-ui-runner` ([definition](../sell-slice/agents/frontend/break-ui-runner.md)) on `sonnet` with the manifest, the `data_switch`, the dev URL and the evidence folder `.claude/.bytheslice-state/evidence/<N.M>/break-ui/`, never the builder's chat. It measures at 1440, 768 and 390 with DOM reads and returns findings plus a report. `Broken` and `Ugly` findings join the fix loop as `fix_targets` (no counter of their own); `Fragile` findings and its decisions are non-forcing warnings, listed in the Progress Report, with its recommendation applied by default. Record one `bts_note` with the counts and report path. Skip it, and say why, when `data_switch` is `null`.
   - **`slice-tester`** - boot the dev server (frontend / full-stack) and dispatch `bytheslice:slice-tester` ([definition](../sell-slice/agents/slice-tester.md)). **CONTEXT SEPARATION (absolute): the conductor passes the tester ONLY the build manifest (on `frontend`, `state-illustrator`'s; otherwise the builder's) + the slice's Exit criteria + the design-system path** (`docs/design-system.md`) **+ the dev-server URL + the slice type + the DB target. NEVER the builder's context, reasoning, or chat.** This is the core of `/sell-pie`: the tester must *falsify* the manifest's claims, not trust the builder's narrative - independence is the whole point. Pass through `verification.viewports` (C7) and `visualReview.tools`. The tester type-routes and returns the Appendix-B verdict. Seed-and-cleanup (full-stack / backend) is the tester's: it writes the cleanup script **first**, runs the **non-prod guard** (blocks + bubbles `destructive_operation` if the DB target is not demonstrably local/dev), seeds, round-trips, runs cleanup in a finally block, and asserts zero residue. **The conductor never seeds the DB itself.**
   - **`slice-verifier`** - dispatch `bytheslice:slice-verifier` ([definition](../sell-slice/agents/slice-verifier.md)) with the slice diff (branch + base SHA), the slice manifest (on `frontend`, `state-illustrator`'s), resolved `verification.e2e.*` (C10), the resolved `quality.tier` and `delivery.mode`, the package manager + script names, the workflow inventory, and the slice type. This is gate tier 3: the full local suite, run once per slice (the builder's narrower tier 1 and 2 results never substitute for it). It runs each static gate once and the **manifest under-declaration backstop** (§1.4 - independently greps the diff for `action(` / `use server` / `onClick` / `<form` / route-file additions and **fails** if the manifest under-counts). Returns the Appendix-C verdict. On a `frontend` slice a declared total of zero is `needs_human` (`prd_ambiguity`), never `pass`: it **halts the loop** as an operator question and consumes none of the 3 local fix loops.
   - **Off-context fix loop.** If `slice-tester.overall == fail` OR `slice-verifier.overall == fail` OR `break-ui-runner` returned a `Broken` or `Ugly` finding, route the union of `fix_targets` to the **fixer off-context** (it gets the failing verdict + evidence, **not** the builder's or tester's chat). When any target comes from `break-ui-runner`, that loop's fixer is `bytheslice:ui-fix-attempter` ([definition](../sell-slice/agents/frontend/ui-fix-attempter.md), the same role on `opus`) in place of `fix-attempter`, and `break-ui-runner` re-checks in `mode: "recheck"` after it. 1st fail → `fix-attempter` → re-run only the failed half. **Re-verification hard rule:** pass `slice-verifier` its prior verdict plus the fix's `files_changed`; it carries green checks forward, re-runs only the gates that fix could change (its choice, from the fix diff), and reports them in `rerun: [{gate, reason}]`. The full suite never re-runs after any fix (1st, 2nd or 3rd). 2nd → `debug-instrumenter` adds `// INSTRUMENT` logging, the failing check runs once to capture it → `fix-attempter` with richer evidence → re-verify. 3rd → `fix-attempter` with the full evidence (every prior verdict, the instrumentation output, both earlier patches) → re-verify. **Fix cap: 3 local loops** (a loop is one fix dispatch plus its re-verify), counted per slice and separate from the 3 CI fix rounds per PR in `/box-it-up`. Still failing after the 3rd → **halt the loop** with a `prd_ambiguity` (or the most specific) HITL carrying full evidence. The cap is non-overridable by the run instruction (see Hard Constraints). After green, strip `// INSTRUMENT` lines if `debug-instrumenter` ran.
   - **Repeated signature and regressions** (as [`/sell-slice` 5.4](../sell-slice/SKILL.md) defines them). Build each failing verdict's signature from its first `fix_targets` entry, `normalize(first_error_line) + " | " + file + " | " + check_key` (a plain string held in the conversation, never hashed or persisted), and pass the one the last patch aimed at to `fix-attempter` as `previous_signature`. Before starting loop 2 or 3 (before `debug-instrumenter`), an equal signature means the identical failure survived a fix: do not start the loop; **halt the loop** with a HITL (`bail_reason: repeated_signature`). The bail uses up the loop it stopped and never resets or extends the cap. Check for a regression first: a gate or tester check green before the last patch and red after it means the conductor restores that patch (its `files_changed` paths back to the last commit; a committed patch is reverted with a new commit) before any new fix, and the next `fix-attempter` dispatch gets the regressed gates, the restored paths and `previous_signature: null`. A revert refunds no loop.
   - **Both verdicts must be `pass`** (or a half legitimately `skipped` for the slice type) before the slice is verified.
5. **Mark + commit + push.** In `merge-per-slice` mode, follow Phase 1-M step 3 instead of this step. In `ship-once` mode this step runs as written except that `/box-it-up --slice` commits without pushing (Phase 1-S). Default mode (no PR): flip the slice's `### Slice N.M` row `[ ]` → `[x]` (and its status → `Completed`) in `$PLANS/00_master_checklist.md` (the primary checkout's copy when the plans are gitignored, per [`git-worktree-standard.md`, "Where the plans live"](../cook-pizzas/references/git-worktree-standard.md)). If everything is green except a date-gated criterion whose date is ahead, set the status to `waiting until <YYYY-MM-DD>: <criterion>` instead and leave the row `[ ]`; the commit and push below still happen. Then invoke **[`/box-it-up --slice`](../box-it-up/SKILL.md)**: it makes the slice's **final commit** on the pie branch with the v5 convention **`feat(pie-N): N.M <slice name>`** (the checklist flip plus any fix-loop patches and the state files in `state-illustrator`'s `files_changed`, which the conductor stages too, with the closing-narrative paragraph in the body for UI-touching slices; an `--allow-empty` commit when nothing is left to stage, since the checklist is gitignored by default) and **pushes** - **no PR is opened, so CI does not fire.** Per-slice pushes stay cheap. The slice may not end with an untracked or modified file it created.
6. **Advance.** If more runnable slices remain `[ ]` in the active pie, let the loop wake for the next one (or, self-paced, continue in-context to the next slice). If **every** slice is `[x]`, go to Phase 2 (pie boundary). If the only open slices are waiting on a date (or depend on one that is), **stop**: clear the pie goal, schedule no wake, and report each waiting slice with its date and criterion (`status: waiting`). Nothing keeps a loop alive to wait; the next `/sell-pie` run on or after the date resumes the pie. Do **not** start a slice in a *different* pie - `/sell-pie` bakes one pie then stops.

#### Soft time budget (`delivery.sliceBudgetHours`)

Each slice has a soft wall-clock budget, `delivery.sliceBudgetHours` (default `3`; `0` turns it off). It counts from the slice's start line in the run log and includes CI time (merge-per-slice mode waits on CI inside the slice). It excludes time spent waiting on the operator: the conductor writes each HITL ask and its answer to the run log and subtracts those windows. The conductor checks the elapsed time whenever an agent returns. When the budget is hit it never interrupts a running agent: it lets the current agent finish, then halts the loop with one `prd_ambiguity` check-in carrying the slice's progress (tasks committed, gates green, fix loops used), the current blocker, and two options: **extend** (adds another `sliceBudgetHours`; recommended when the slice advanced since the last check-in) or **stop** (the slice stays `In Progress` with its task commits pushed; the next run resumes it). The budget is soft: it never fails a slice, never skips one, and never raises or lowers the fix cap.

> **Per-slice `hitl_required` still fires inside an autonomous pie.** A slice whose frontmatter sets `hitl_required: true` (e.g. an `external_credentials` slice) halts the loop at that slice even though the pie is `review: boundary` (spec §1.8), as one question in that slice's approval batch (see HITL Handling). An unattended ship-once run defers that slice instead (see "Unattended runs"). The pie-level autonomy authorizes the *run*; it does not suppress a slice's own declared blocking dependency.

### Phase 1-M - Merge-per-slice delivery (`delivery.mode: merge-per-slice`)

Same per-slice build / test / verify / fix as Phase 1; only the git lifecycle changes. Slices run **strictly in checklist order**. Never start slice N.M+1 before N.M has merged when N.M+1 depends on it (and since every slice is cut from fresh `main`, the loop simply runs them one after another). Never use an integration branch.

**Plans.** Before the first slice, resolve `$PLANS` per [`git-worktree-standard.md`, "Where the plans live"](../cook-pizzas/references/git-worktree-standard.md). With gitignored plans (the default) a slice worktree has no `docs/plans/`, so every checklist read, every stage-plan path handed to an agent, and every flip below uses `$PLANS` in the primary checkout.

For the active slice `N.M`:

1. **Cut the slice worktree from fresh `main`.** From the primary checkout: `git -C "$PRIMARY" fetch origin`, then `git -C "$PRIMARY" worktree add -b pie-N-sN.M-<scope> <path> origin/main`. Run the slice in that worktree. Append the slice's start line to the run log `.claude/.bytheslice-state/run-log.md`.
2. **Build, test, verify, fix** exactly as Phase 1 steps 1-4, inside the slice worktree. Hand every agent the stage plan as an absolute `$PLANS/stage_<n>_*.md` path, never a worktree-relative one.
3. **Mark + commit + push.** Task commits are already pushed (one per `### Task K`). The mark is the slice's `### Slice N.M` row `[ ]` → `[x]` (status `Completed`), or, when only a date-gated criterion with a future date is unmet, `**Status:** waiting until <YYYY-MM-DD>: <criterion>` with the row left `[ ]` (the code still merges, the slice stays open). **Tracked plans:** make the mark on the slice branch and commit it with the slice's final commit. **Gitignored plans (the default):** do not mark yet; step 6 marks `$PLANS` after the merge. The final commit is `feat(pie-N): N.M <slice name>`, carrying any fix-loop patches, closing narrative in the body for UI slices, `--allow-empty` when nothing is left to stage. Push the slice branch. The tree must be clean: no untracked or modified file the slice created.
4. **Close out internally.** Run [`/box-it-up`](../box-it-up/SKILL.md)'s **Merge-per-slice closeout** (`--merge-slice` mode) yourself, passing the branch, the worktree path, the slice id and name, and whether this is the pie's last slice. Do not type `/box-it-up` as a prompt: the conductor sits on `main` between slices by design, and a typed `/box-it-up` on `main` would stop to ask about the branch. The closeout opens PR `Slice N.M: <name>`, waits for CI, runs up to **3** `ci-fix-attempter` rounds on red, merges on green with a **merge commit**, and cleans up from the primary checkout (`pull --ff-only`, `worktree remove`, `branch -d`, remote delete, `worktree prune`). There is **no per-slice merge approval**.
5. **CI still red after 3 rounds → halt the loop** with the closeout's HITL. Never skip the slice, never merge it red, never start the next slice.
6. **Mark (gitignored plans), then advance.** Once the closeout reports the merge, make step 3's mark in `$PLANS/00_master_checklist.md` (no commit), then re-read that file to pick the next slice. A slice that halted before merging keeps `[ ]`, so the next run resumes it. The next slice is cut from the freshly synced `main`. After the pie's last slice merges, the closeout writes the kitchen merge record once (`record-kitchen-merge.js --mode pie --pie N`, never per slice), and the conductor sends the operator **one** notice listing every slice PR and merge SHA from the run log. That notice replaces the Phase 2 boundary handoff.

### Phase 1-S - Ship-once delivery (`delivery.mode: ship-once`)

Same per-slice build / test / verify / fix as Phase 1, in one pie worktree per pie; only the base branch, the push and the boundary change. Slices run strictly in checklist order inside the pie worktree that Phase 0 cut from the ship branch.

**Plans.** Before the first slice, resolve `$PLANS` per [`git-worktree-standard.md`, "Where the plans live"](../cook-pizzas/references/git-worktree-standard.md). With gitignored plans (the default) every checklist read, every stage-plan path handed to an agent, and every flip uses `$PLANS` in the primary checkout, which sits on the ship branch.

For the active slice `N.M`:

1. **Record the start.** Append the slice's start line to the run log `.claude/.bytheslice-state/run-log.md` with the pie branch's current SHA (the slice start SHA an unattended deferral resets to).
2. **Build, test, verify, fix** exactly as Phase 1 steps 1-4. `slice-verifier`'s tier-3 full local suite is the slice gate; there is no CI per slice or per pie.
3. **Mark + commit, no push.** Task commits land on the pie branch at each task boundary, unpushed. Flip the slice row in `$PLANS/00_master_checklist.md` exactly as Phase 1 step 5, then run `/box-it-up --slice`, which makes the final `feat(pie-N): N.M <slice name>` commit (`--allow-empty` when nothing is left to stage) and **skips the push** under ship-once. The tree must be clean.
4. **Fix cap exhausted, or any other HITL.** Interactive: halt the loop as Phase 1 does. Unattended (`run.unattended: true`): defer the slice per "Unattended runs", reset the pie branch to the slice start SHA (the work kept on `deferred/pie-N-sN.M`), and continue with the next runnable slice.
5. **Advance.** When every slice is `[x]` (or deferred, unattended), go to Phase 2, which hands off to `/box-it-up --pie-local` instead of opening a PR.

### Phase 1-C - Continuous mode (`review: continuous`)

When the active Pie resolves to `continuous` (Payments, Auth, real-data migrations), do **not** run the autonomous per-slice Workflow. For each slice in pie order:

1. Invoke [`/sell-slice`](../sell-slice/SKILL.md) **end-to-end** for that slice - its build-plan authorization stop and Library Preview gate stay **live** (high-touch). The pie-level `/goal` is active, so `/sell-slice` skips its own slice-goal (Phase 2.5 parent-goal pre-check).
2. When `/sell-slice` reports the slice "ready for review" (task commits and the final slice commit pushed on the pie branch), invoke `/box-it-up --slice` to confirm the clean tree and push any straggler (still no PR).
3. Advance to the next slice. When every slice is `[x]`, go to Phase 2.

Continuous mode trades autonomy for the full per-slice human touch points; `/sell-pie` keeps only the pie-level bookkeeping and the boundary handoff.

### Phase 2 - Pie boundary (stop + open the PR via `/box-it-up`, or merge locally under ship-once)

Reached only when **every** `### Slice N.M` under the active `## Pie N` is `[x]` and each slice's Workflow B was green. A slice waiting on a date is not `[x]`, so a pie with one is not complete and never reaches this phase. In the default `pie-pr` mode this is the **one** HITL the loop never auto-approves (spec §1.8 - the pie-boundary checkpoint). **Merge-per-slice mode skips this phase** except step 1b: every slice already merged in Phase 1-M, so the pie ends with the single finish notice instead of a boundary PR, and the pie design critique runs once on `main` before that notice, its P0 and P1 findings raised as follow-up questions in the notice rather than fixed on a branch. **Ship-once mode has no human checkpoint here:** the operator authorized the merge by choosing ship-once, so step 1b fixes its findings without asking and step 2 merges the pie into the ship branch locally.

1. Confirm pie completeness: every slice `[x]`, the pie branch has every per-slice commit pushed, working tree clean. Under ship-once nothing is pushed: confirm every slice is `[x]` (or `deferred:` in an unattended run) and the pie worktree is clean.
1b. **Pie design critique (once per pie, before `/box-it-up`).** Skip when no slice in the pie touched a rendered route. Otherwise boot the dev server, pick the pie's **main surfaces** (at most 5: the routes its user flow lands on, not every route the pie touched) and dispatch `bytheslice:design-critic` ([definition](../sell-slice/agents/frontend/design-critic.md)) on `sonnet` with `scope: "pie"`, those URLs, the context files (`PRODUCT.md` / `DESIGN.md`, or the design-system rules file) and the evidence folder `.claude/.bytheslice-state/evidence/pie-<N>/design-critique/`. It runs in no-launcher mode only (never the impeccable binary) and returns a score per surface, ranked findings and open questions. This runs **here, not per slice**: per slice it costs too much and repeats itself. Then:
   - Record one `bts_note`: `design critique pie <N>: <score>/<max> per surface, P0 <n>, P1 <n>, report <path>`, so the PR evidence section carries it.
   - **P0 or P1 findings** go to the operator as one batched `creative_direction` HITL with the report path, each finding one short question (fix now on this pie branch, or defer to a follow-up slice), recommended answer first. The loop halts on it like any blocking HITL. A finding the operator sends to "fix now" is fixed by `ui-fix-attempter` (opus) with the finding as its `fix_target`, re-verified by `slice-verifier` (only the gates the fix could change) and committed as `fix(pie-N): design critique <finding id>`; these fix rounds count against no slice's local cap, and at most 3 run before the remaining findings are deferred. P2 and P3 findings and the critic's `open_questions` are listed in the handoff and the PR body, and never stop the boundary.
   - **Ship-once:** no batch goes to the operator. Every P0 and P1 finding goes straight to `ui-fix-attempter` (opus) as a `fix_target`, re-verified by `slice-verifier` (only the gates the fix could change) and committed on the pie branch as `fix(pie-N): design critique <finding id>`, for at most **3** rounds (the same cap, counted against no slice). Findings still open after round 3 are recorded with one `bts_note` each (`design critique pie <N> deferred: <finding id> <one line>`) and listed in the ship PR body; they never halt the loop, interactive or unattended.
   - The critique never blocks the PR by itself: with no P0 or P1, or once the operator has answered, continue to step 2.
2. **Hand off to [`/box-it-up`](../box-it-up/SKILL.md)** (pie-completion mode). `/box-it-up` opens **one** PR `Pie N: <name>`, runs CI **once** (the only CI run for the whole pie - per-slice pushes opened no PR), pauses for the **merge-authorization HITL**, then merges **preserving every per-slice commit** (rebase or merge-commit, **never squash**), syncs `main` `--ff-only`, deletes the branch, and **removes the pie worktree**. If CI fails, `/box-it-up`'s `ci-fix-attempter` applies targeted fixes for up to 3 attempts before bubbling to the human.
   **Ship-once:** hand off to [`/box-it-up --pie-local`](../box-it-up/SKILL.md) instead. It confirms a `slice-verifier` pass for every non-deferred slice of the pie, re-runs the full local check once on the pie branch (up to 3 `fix-attempter` rounds on red), merges the pie into the ship branch with `git merge --no-ff` (every slice commit preserved), flips the pie to `Completed` in `$PLANS`, and removes the pie worktree and branch. No PR, no push, no human gate. Then, if this was the **last** pie (every pie in the checklist is now `Completed`, or `[x]`/deferred in an unattended run): an interactive run invokes `/box-it-up --ship` to push the ship branch and open, CI-check and merge the one PR to `main`; an unattended run does **not** ship, it returns `ship_ready: true` so the `/pizza-party` conductor can replan deferred slices first and then run `/box-it-up --ship` itself.
3. **Clear loop state.** Let the pie-completion `/goal` auto-clear (or clear it manually in the fallback). The loop ends here - `/sell-pie` does not roll into the next pie. The next pie starts in a **fresh chat** with a fresh worktree (for unattended end-to-end chaining, that is `/pizza-party`'s job).
4. Emit the Progress Report (below) ending with the boundary handoff status.

> `/sell-pie` **opens no PR itself** and **watches no CI itself** - it stops at the boundary and delegates the entire PR/CI/merge/cleanup lifecycle to `/box-it-up`. This keeps the loop's git surface to exactly "commit + push per slice" (under ship-once, "commit per slice", and the local pie merge is `/box-it-up --pie-local`'s).

---

## HITL Handling

`/sell-pie` is the **`/loop` conductor** - the top-level surface of its own run. When a subagent or sub-skill returns `needs_human: true`, or the pie boundary is reached, the conductor **halts the loop and surfaces the prompt to the human**. **It does NOT reschedule the wake** to "try again later" past a blocking HITL - the human's answer is what resumes the loop.

When raising a HITL and the `bts_hitl` tool is available, also call it; when the operator answers, call it again with the answer (`{ id, answer }`). It records the question, shows it in the Pass inbox and notifies; it never waits, so the stop-and-ask flow above still does.

**Unattended ship-once runs never halt.** With `run.unattended: true` under ship-once, every row below defers the slice (or records a pie blocker) and the loop continues, per "Unattended runs"; nothing is asked, and `bts_hitl` is not raised. The rest of this section describes interactive runs, which are unchanged.

**The four blocking HITL categories halt the loop** (they are genuine blocking dependencies / the kept checkpoint - spec §1.8; not auto-resolvable, not rescheduled):

| Category | Typical trigger in `/sell-pie` |
|---|---|
| `prd_ambiguity` | flat checklist (refusal); a prior pie unmerged without OK; missing/weak Exit criteria; fix-loop exhausted after 3 attempts; ambiguous slice scope; merge-per-slice mode on a repo that disallows merge commits; the soft slice time budget was hit (check-in: extend or stop). |
| `external_credentials` | a slice's `hitl_required` for secrets / OAuth / 3rd-party setup; `gh` not authenticated at the boundary (via `/box-it-up`). |
| `destructive_operation` | the `slice-tester`'s **non-prod guard** blocking a seed (DB target not demonstrably local/dev); a would-be force-push / merge-conflict pull at the boundary (via `/box-it-up`). |
| `creative_direction` | the Library Preview gate surfacing a net-new-component concern; `ci-fix-attempter` exhausting its 3 attempts (at the boundary, or on a slice PR in merge-per-slice mode, via `/box-it-up`). |

Any project-specific categories from `hitl.additionalCategories` surface the same way.

**Batched approvals.** Per slice, right after recon (the first point they are all known), the conductor collects every approval the slice needs (migrations to apply, live data loads, size exceptions, terms or licences, credentials, a `hitl_required` dependency, and the build plan when it is not auto-approved) into **one batch** of short questions: one decision per question, each with a recommended answer. The loop halts once for the batch, not once per approval. With nothing to approve, it does not halt. An approval that surfaces mid-slice joins the next batch rather than halting alone, unless the slice cannot continue without it. **Exception:** the Library Preview gate stays its own mid-slice stop (it needs built output). Unforeseeable blocking events (fix cap exhausted, the non-prod guard, a rejected push) still halt when they happen. Return the batch in `hitl_questions`.

**Agents never call `ask_user_input_v0`.** Every subagent and sub-skill sets `needs_human: true` + the `hitl_category` / `hitl_question` / `hitl_context` fields in its return; `/sell-pie`, as the conductor, reads those fields and surfaces the prompt to the human (and emits the same fields in its **own** return contract when it hands control back to a parent - e.g. `/pizza-party`). On resolution, the conductor appends the answer to the relevant context and resumes the loop at the slice (or boundary) that halted; it never silently advances past an unresolved HITL.

---

## Progress Report Format

At each loop wake (per slice) and at the pie boundary:

1. **Pie + slice state** - active Pie `N - <name>` (`review:` mode), slice `N.M - <name>` (`type:`), slices `[x]` of total in the pie.
2. Checklist items completed this slice (with file paths); files changed (grouped by package/app).
3. **Verification results** - builder tiers 1-2 (while coding; before each task commit), `slice-tester` verdict (per-affordance + transitions **both directions on every surface** + seed/cleanup residue), `slice-verifier` verdict (each static gate + manifest backstop counts + its non-forcing `warnings`, listed), `break-ui-runner` counts by severity and report path (or why it was skipped).
4. Subagent run summary (Workflow A producers, Workflow B fix-loop activity, Library-gate outcome if it fired).
5. Task commits (`feat(pie-N): N.M task K <name>`) and the final slice commit (`feat(pie-N): N.M <name>` SHA) + push confirmation (**no PR**), or in merge-per-slice mode the slice PR URL, CI rounds and merge commit SHA, or in ship-once mode the local commit SHAs (nothing pushed) and any deferral with its reason.
6. Open risks / blockers; next slice (or "pie boundary reached → handing off to `/box-it-up`").
7. **Closing-narrative paragraph** (UI-touching slices only) - one paragraph: what was built · why this shape (one or two trade-offs) · what was deliberately left out · what reviewers should watch. `/box-it-up` lifts it verbatim into the per-slice commit body and the boundary PR.

At the boundary, give the pie design critique's score per surface, its P0/P1 answers and its report path, then list every slice's `slice-verifier` `warnings` and `break-ui-runner` `Fragile` findings in one block (they never failed a slice, so this is the operator's first look at them), then end with the `/box-it-up` handoff status (PR `Pie N` opened, CI running once, awaiting merge approval - or the merge result if `/box-it-up` completed in the same turn). Under ship-once, end instead with the pie-local result (local check rounds, the ship-branch merge commit SHA, deferred slices and design findings) and, after the last pie, the ship PR state or `ship_ready`.

---

## Hard Constraints

- **One pie per run, then stop.** `/sell-pie` bakes exactly one Pie to the boundary and stops. It never starts a slice in a different pie, never spans two pies, never rolls into the next pie. End-to-end chaining is `/pizza-party`.
- **Refuse flat checklists - never auto-rewrite.** A flat (`## Stage N`) checklist is a `prd_ambiguity` refusal with the `/cook-pizzas --repie` hint. `/sell-pie` never converts the checklist itself; `--repie` is the user's explicit opt-in.
- **Context separation is absolute.** The conductor passes the `slice-tester` ONLY the build manifest (the builder's, or `state-illustrator`'s on `frontend`) + Exit criteria + design-system path (+ dev URL / slice type / DB target). NEVER the builder's reasoning or chat. The tester falsifies the manifest; it does not trust the builder. This is the reason the loop exists.
- **Only the conductor makes git writes, `git add` included,** on the registered and fallback paths alike. Agents return `files_changed`; the conductor stages them selectively, commits and pushes. Never `git add -A`.
- **The conductor holds zero implementation context.** It reads structured returns and routes them. It never writes feature code, never behaviorally tests, never grades a slice, never seeds a DB. The builder builds; the tester tests; the verifier gates; the fixer fixes - `/sell-pie` only conducts.
- **Clean tree at every task boundary.** Each `### Task K` ends with a `feat(pie-N): N.M task K <task name>` commit and a push; the slice ends with one `feat(pie-N): N.M <slice name>` commit and no untracked or modified file it created. One slice per PR boundary, task commits inside.
- **Per slice: commit + push, no PR (default `pie-pr` mode).** Each cleared slice closes with its final commit (`feat(pie-N): N.M <name>`) and is pushed to the pie branch via `/box-it-up --slice`. **No PR is opened mid-pie, so CI does not fire.** CI runs exactly **once per pie**, at the boundary. **Exception, merge-per-slice mode:** each slice opens its own PR, CI runs per slice, and the slice merges on green with a merge commit (Phase 1-M). Never an integration branch, never a squash, never a red merge.
- **Merge-per-slice is opt-in, and the run instruction wins.** Only an explicit autonomous-delivery run instruction or `delivery.mode: "merge-per-slice"` turns it on; `review: continuous` pies never use it.
- **Ship-once is opt-in; every gate is local until the one ship PR.** Only `delivery.mode: "ship-once"` (set by `/pizza-party`) or an explicit run instruction turns it on. Every pie branch is cut from the local ship branch, never pushed and never opened as a PR; `/box-it-up --pie-local` merges it into the ship branch with `git merge --no-ff` (never squash, never rebase) after the full local check passes, with no human gate. CI runs once, on the ship PR that `/box-it-up --ship` opens after the last pie. A `review: continuous` pie bakes hands-off under ship-once.
- **Unattended means nothing waits on a human, and nothing unverified ships.** Under ship-once with `run.unattended: true`, every would-be HITL defers the slice (`deferred: <reason>`, row left `[ ]`), its commits leave the pie branch (kept on `deferred/pie-N-sN.M`), its dependents defer too, and the run returns `status: complete_with_deferrals` with the `blocked` list. An unattended run never runs `/box-it-up --ship` itself; it returns `ship_ready: true`. Interactive runs keep every halt.
- **Stop at the pie boundary; delegate the PR to `/box-it-up` (default mode).** When every slice is `[x]`, hand off to `/box-it-up` to open the one PR `Pie N`, run CI once, take the merge-authorization HITL, merge preserving per-slice commits (never squash), sync main, and clean up. `/sell-pie` opens no PR and watches no CI itself.
- **`review: continuous` ⇒ `/sell-slice` mode.** A `continuous` pie runs each slice through high-touch `/sell-slice` (build-plan + library gates live), not the autonomous per-slice Workflow.
- **Build-plan stop is auto-approved under the loop (C9); per-slice `hitl_required` still fires.** The pie-level autonomy authorizes the run, so the per-slice build-plan authorization is auto-approved and logged, not stopped - but a slice whose frontmatter sets `hitl_required: true` still halts the loop.
- **Fix cap: 3 local fix loops and 3 CI fix rounds, separate counters, never overridden by a run instruction** (ship-once adds the 3 pie-local check rounds and the 3 design-critique rounds, each its own counter, each equally fixed; an unattended deferral replaces the halt and never grants an attempt). "Continue until verified", "never stop", "fully automated" or an autonomous-delivery instruction do not grant attempts; on exhaustion the loop halts with a HITL, and only the operator's explicit reply there can grant more.
- **The slice time budget is soft.** At `delivery.sliceBudgetHours` (wall-clock from the run log start line, CI included, operator waits excluded) the conductor lets the current agent finish, then checks in once (`prd_ambiguity`: extend or stop). It never kills an agent, fails a slice, or touches the fix cap; `0` turns it off.
- **The four HITL categories halt the loop - never reschedule past them.** `prd_ambiguity` / `external_credentials` / `destructive_operation` / `creative_direction` stop the loop and surface to the human; the human's answer resumes it. Do not silently advance or re-wake past an unresolved HITL.
- **Gates run by tier (C5); viewports from `verification.viewports` (C7); e2e thresholds from `verification.e2e` (C10).** Tier 1 while coding, tier 2 before each commit, tier 3 once per slice in `slice-verifier`, tier 4 in CI at the PR (`/sell-slice` "Gate tiers"). Never demand the full ladder per task or per commit, never bypass the `pre-push` hook with `--no-verify`, never hardcode a viewport list or run an e2e suite gated `"off"`.
- **No proof ledgers.** The conductor and its agents never write artifact hashes, source freezes, fingerprint files, leases, or per-step proof files. The allowed evidence (verdicts, failure-only Playwright traces, one 768px and one 1280px screenshot per new UI surface, a checklist note of 3 lines or fewer per slice, the one run log) and the operational state files that stay are listed in `/sell-slice` "Evidence, not proof ledgers". The Pass mod ledger (`docs/pass-mod-spec.md`) is the one sanctioned completion record and the explicit exception.
- **Never seed a production DB.** The `slice-tester`'s non-prod guard is blocking; if the DB target is not demonstrably local/dev, it bubbles `destructive_operation` and the loop halts. The conductor never bypasses it.
- **Checklist edits only after green gates.** Flip `[ ]` → `[x]` only after both `slice-tester` and `slice-verifier` return `pass`. Never optimistically mark a slice done. Never edit a *different* slice's plan file.
- **One worktree per pie (default and ship-once) or per slice (merge-per-slice); never bake on `main` or on the ship branch.** Under ship-once the primary checkout holds the ship branch and only `/box-it-up --pie-local` writes to it (the pie merge commit). The pie branch lives in its own worktree and `/box-it-up` removes it at the boundary. In merge-per-slice mode each slice branch gets its own worktree, removed from the primary checkout right after that slice merges; the conductor itself sits on `main` only between slices and never builds there.
- **Workflow / loop / goal unavailable → fall back, never drop.** In-context dispatch with orchestrator-side manual schema validation when `Workflow` is absent (`loop-workflow-fallback-pattern.md`); self-pace over ≤8 slices when `/loop` is absent; manual goal-tracking when `/goal` is absent (`goal-fallback-pattern.md`).
- **Subagent prompts live in `./agents/*.md` (under `/sell-slice`).** This SKILL.md is loop logic only - never inline a subagent prompt here.
- **Always provide a recommended answer in available options** at every elicitation point the conductor surfaces.

---

## Completion Checklist

Walk this at the pie boundary. Do not report the pie "ready to ship" (handed to `/box-it-up`) until every box is `[x]`.

### 1. Pie loop ran clean

- [ ] Master checklist is nested; the active Pie was identified; no flat-checklist refusal.
- [ ] Every prior Pie was `Completed` (or the user authorized skipping ahead).
- [ ] The pie-completion `/goal` (or its manual fallback) was set.
- [ ] `review` mode resolved correctly (autonomous per-slice Workflow vs `/sell-slice` continuous mode).

### 2. Every slice delivered

- [ ] Every `### Slice N.M` under the active Pie is `[x]` (status `Completed`).
- [ ] For each slice: the builder (`implementer`, or `state-illustrator` on `type: frontend`) emitted a complete **build manifest** (§Appendix A). A `frontend` slice with an empty manifest halts the loop as `prd_ambiguity`; it never passes.
- [ ] For each slice: `slice-tester` returned `overall: pass` - every declared affordance exercised, every transition confirmed **both directions on every surface**, and (data-flow slices) the seed cleaned up with **zero residue**.
- [ ] For each slice: every task commit landed on a green tier 2.
- [ ] For each slice: `slice-verifier` returned `overall: pass` on its one tier-3 run - lint / typecheck / build / unit-integration / e2e (per `verification.e2e`; lean: the `@smoke` spec only; ship-once: every command `ci.yml` and, at the standard tier, `e2e.yml` run, in full) / design-system static grep / CI-integrity / manifest under-declaration backstop all clear.
- [ ] The `slice-tester` received **only** the manifest + Exit criteria + design-system path (+ dev URL / type / DB target) - never the builder's context.
- [ ] If `debug-instrumenter` ran on any slice, every `// INSTRUMENT` line was stripped before that slice's commit.

### 3. Git state per slice (default `pie-pr` mode)

- [ ] Each task committed and pushed at its boundary (`feat(pie-N): N.M task K <name>`); each slice closed with `feat(pie-N): N.M <name>` (closing-narrative paragraph in the body for UI slices).
- [ ] Each slice pushed to the pie branch - **no PR opened, no CI fired** mid-pie.
- [ ] Working tree clean on the pie branch (no untracked or modified file a slice created); one worktree per pie.

### 3-M. Git state per slice (merge-per-slice mode instead of §3 and §4)

- [ ] Each slice ran in its own worktree on `pie-N-sN.M-<scope>`, cut from fresh `origin/main`.
- [ ] Each slice PR `Slice N.M: <name>` merged on green CI with a merge commit (at most 3 CI fix rounds).
- [ ] Each slice's worktree and branch removed (local + remote) from the primary checkout; `main` synced `--ff-only`.
- [ ] Kitchen merge record written once, after the last slice; one finish notice sent to the operator.

### 3-S. Git state per slice (ship-once mode instead of §3 and §4)

- [ ] The ship branch existed (or was cut once from fresh `origin/main`) and the pie branch was cut from it into one worktree.
- [ ] Each task and slice committed on the pie branch; **nothing pushed**, no PR opened, no CI fired.
- [ ] Every slice `[x]` with a `slice-verifier` pass, or (unattended only) `deferred: <reason>` with its commits off the pie branch and a `blocked` entry.
- [ ] Pie design critique ran once (or was skipped); P0/P1 findings got at most 3 `ui-fix-attempter` rounds, leftovers recorded with `bts_note`.
- [ ] Handed off to `/box-it-up --pie-local`: full local check green (at most 3 fix rounds), pie merged into the ship branch with `--no-ff`, pie worktree and branch removed.
- [ ] After the last pie: interactive runs ran `/box-it-up --ship`; unattended runs returned `ship_ready: true`.

### 4. Boundary handoff

- [ ] Pie completeness confirmed (every slice `[x]`, all commits pushed).
- [ ] Pie design critique ran once (step 1b) on the pie's main surfaces, or was skipped because no slice touched a rendered route; its P0/P1 findings were answered by the operator and its score was recorded with `bts_note`.
- [ ] Handed off to `/box-it-up` (pie-completion mode) to open the one PR `Pie N`, run CI once, take the merge HITL, merge preserving slice commits, sync main, and clean up branch + worktree.
- [ ] Pie-completion goal cleared/auto-cleared.
- [ ] Final Progress Report emitted with the boundary handoff status.

---

## Triggers

Follow this skill whenever the user:

- runs `/sell-pie` (autonomous, one whole pie)
- says "sell a pie", "bake the pie", "bake the next pie", "run the next pie", "loop the pie", "deliver the pie"
- has a nested (Pie/Slice) master checklist and wants one whole chapter delivered hands-off

Redirects:

- If the checklist is **flat** (v4 `## Stage N`), refuse and point at `/cook-pizzas --repie` (convert) or `/sell-slice` (works on flat, one stage at a time).
- If the user wants **one careful slice** (sensitive / collaborative), use [`/sell-slice`](../sell-slice/SKILL.md).
- If the user wants the **whole app built end to end** unattended, use [`/pizza-party`](../pizza-party/SKILL.md) (one interview, then every pie through `/sell-pie` under ship-once, one PR, deploy).
- At the **pie boundary**, the PR/CI/merge/cleanup is [`/box-it-up`](../box-it-up/SKILL.md)'s job - `/sell-pie` hands off.

---

## Sub-agent return contract

When `/sell-pie` is invoked by a parent orchestrator (e.g. `/pizza-party` chaining pies), it returns structured fields. It never prompts the user directly when run as a sub-agent - the parent reads `needs_human` + `hitl_*` and surfaces any question. (Run standalone as the top-level `/loop` conductor, it surfaces the prompt itself.)

```yaml
status: complete | complete_with_deferrals | failed | needs_human | waiting   # waiting: only date-gated slices remain open; complete_with_deferrals: unattended ship-once deferred at least one slice or pie step
pie: "<N>"                       # the pie this run baked
delivery: pie-pr | merge-per-slice | ship-once
unattended: false | true         # run.unattended as resolved (true only under ship-once)
ship_branch: null | "<ship/...>" # ship-once only
ship_ready: false | true         # ship-once: this was the last pie and the ship branch is ready for /box-it-up --ship (unattended runs return this instead of shipping)
blocked: [] | [{slice: "<N.M>", reason: "<one line>", attempts: <int>} | {pie: "<N>", reason: "<one line>", attempts: <int>}]   # unattended ship-once deferrals; empty otherwise
summary: <one paragraph - pie name + review mode; slices delivered (count); per-slice verification high-level; boundary state (handed to /box-it-up: PR opened / CI / merged), or where the loop halted>
slices_completed: <int>
slices_total: <int>
waiting_slices: [] | [{slice: "<N.M>", until: "<YYYY-MM-DD>", criterion: "<text>"}]
artifacts:
  - <pie branch name>
  - <per-slice final commit SHAs>
  - <boundary PR url (once /box-it-up opened it), or every slice PR url in merge-per-slice mode, or the ship-branch merge commit SHA (and the ship PR url after --ship) in ship-once mode>
needs_human: false | true
hitl_category: null | "prd_ambiguity" | "external_credentials" | "destructive_operation" | "creative_direction"
hitl_question: null | "<plain-language question>"
hitl_context: null | "<what triggered this - e.g. flat-checklist refusal, non-prod guard blocked a seed, fix-loop exhausted, pie-boundary merge approval>"
hitl_questions: null | [{question: "<under ~10 words, one decision>", options: ["<1-4 words>"], recommended: "<option>"}]   # the slice's approval batch, when one is pending
```
