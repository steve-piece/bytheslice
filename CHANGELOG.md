# Changelog

All notable changes to **🍕 ByTheSlice** are tracked here, slice by slice. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project sticks to [semver](https://semver.org/).

> [!NOTE]
> **Reading the menu:** *Added* = new toppings, *Changed* = recipe tweaks, *Removed* = pulled from the menu, *Fixed* = burnt slices reheated, *Deprecated* = day-old, going away soon.

---

## [5.0.0] — 2026-06-05

**The Pie release.** The flat 20–30 "stages" become a two-level **Pie / Slice** hierarchy: a **Pie** is a coherent chapter (3–8 slices) and the unit of `/loop` autonomy, HITL checkpoint, PR, context-refresh, and worktree; a **Slice** is yesterday's "stage" — one vertical deliverable. A new forefront command **`/sell-pie`** bakes one Pie autonomously with **context-separated dispatch** (the builder emits a build manifest; an independent `slice-tester` verifies behavior from the manifest + Exit criteria only, never the builder's reasoning; a `slice-verifier` runs every static gate exactly once plus a diff-derived under-declaration backstop). `/sell-slice` stays the high-touch single-slice tool, `/run-the-day` demotes to a thin pie chainer, `/box-it-up` re-scopes to pie-level git dynamics (per-slice commit+push, one PR + CI + merge at the pie boundary), and `/cook-pizzas` decomposes into Pies. Dual-read keeps every flat v4 `## Stage N` checklist working; `/sell-pie` refuses flat and `/cook-pizzas --repie` converts on explicit opt-in.

### Added

- **`/sell-pie`** *(new, forefront)* — a `/loop`-driven autonomous baker over one Pie: context-separated per-slice Workflow (builder → slice-tester → slice-verifier → fixer, the tester receiving only the build manifest + Exit criteria + design-system path), per-slice commit+push with no PR, stop at the pie boundary to open one `Pie N` PR via `/box-it-up`; refuses flat checklists (`/cook-pizzas --repie` hint), runs `/sell-slice` mode for `review: continuous` pies, and halts the loop on the four blocking HITL categories.
- **`slice-tester` agent** — type-routed behavioral tester (frontend rendered design-system match + affordance exercise; full-stack/backend seed-and-cleanup data-flow round-trips with hard non-prod guard, cleanup-in-finally, residue check; infrastructure probe-only), context-separated from the builder (manifest + Exit criteria + design-system path only), with the bidirectional-transition rule (every transition confirmed forward AND inverse on every surface before `pass`).
- **`slice-verifier` agent** — a single static-gate pass collapsing basic-checks-runner + the static half of aggregating-test-reviewer + ci-cd-guardrails; each atomic check runs once, with the manifest under-declaration backstop and CI-integrity check.
- **Pie/Slice frontmatter + templates.** Stage-frontmatter contract and plan templates now carry the v5 Pie/Slice hierarchy: `pie:<int>`, `slice:"<N.M>"`, and the `review: boundary|continuous` pie property, with a documented dual-read fallback (flat `## Stage N` still valid for v4) and the master-checklist template rewritten to nested `## Pie N` / `### Slice N.M` with per-slice Exit-criteria blocks.
- **Config: verify-once + flow knobs.** `bytheslice.config.json` gains `verification.{viewports,e2e}`, `flow.{autoApproveBuildPlan,libraryGate}`, and the `review` pie-default property; `modelTiers` gains `sliceTester`/`sliceVerifier`, with `ciCdGuardrails`/`basicChecksRunner`/`aggregatingTestReviewer` documented as deprecated aliases of `sliceVerifier`.
- **`loop-workflow-fallback-pattern.md`** reference documenting the manual fallback for the Claude-Code-only `/loop` and `Workflow` primitives (self-paced pie loop; in-context dispatch with orchestrator-side manual §App A/B/C schema validation).
- **`git-worktree-standard.md`** *(new reference)* — the cross-cutting multi-agent git-worktree standard: fresh-`main` setup (`git fetch origin` → `git worktree add … origin/main`), the two-level **one-worktree-per-Pie** topology (sequential slices in the shared pie worktree; `isolation:'worktree'` only for parallel overlapping writes), the runtime-isolation-gap mitigations (per-worktree dev-server port + non-prod-guarded `bts_test_run_id`-keyed DB seeding), merge/cleanup (preserve per-slice commits, `--ff-only` sync, `git worktree remove`/`prune` never `rm -rf`), and the boundary-PR template. Linked (not copied) by `/sell-pie`, `/sell-slice`, `/box-it-up`, and `/cook-pizzas`.

### Changed

- **`/sell-slice` restructured** to an interactive spine + Workflow A (produce, builder emits the build manifest) + human library gate + Workflow B (verify-once: state-illustrator → slice-tester → slice-verifier, each static gate run once, off-context fix loop); `implementer` now emits the Appendix-A build manifest and no longer owns the e2e ladder.
- **`/cook-pizzas` decomposes into Pies.** It now decomposes the PRD into a two-level Pie/Slice roadmap (coherent 3–8-slice Pies, each with a `review:` property), writes slices via a schema-validated `Workflow` (`parallel()` plan-writers → barrier → synthesizer consuming structured returns, no disk re-read), and adds `--repie` to convert a flat v4 checklist into Pies on explicit opt-in.
- **`/box-it-up` re-scoped pie-level.** Per slice it now commits + pushes only (no PR opened, so CI does not fire); at the pie boundary it opens one `Pie N` PR, runs CI once, gates the merge on HITL approval, merges preserving every per-slice commit (rebase/merge-commit, never squash), syncs `main --ff-only`, deletes the branch, and removes the pie worktree. Universal hand-rolled-branch closeout safety retained. `ask_user_input_v0` calls replaced by `needs_human` + `hitl_*` return fields.
- **`/run-the-day` demoted to a thin chainer** that sequences `/sell-pie` once per Pie across the whole master checklist (`--auto-mvp`/`--auto-all` now act as pie filters); it refuses flat v4 checklists, no longer dispatches the `stage-runner`/`pr-reviewer` agents (kept as deprecation-noted v4 shims) and no longer calls `ask_user_input_v0` — `/sell-pie` is the primary entry point.
- **Hooks reconciled with the v5 `/sell-pie` `/loop`:** deleted `commit-checklist-correlator.sh`, downgraded `stage-plan-guard.sh` from BLOCK to WARN, and added dual-read parsing for `## Stage N` and `## Pie N` / `### Slice N.M` checklists.
- **Worktrees now cut from the freshly-fetched `origin/main`, not local `main` (freshness fix).** `/sell-pie` (Phase 0) and `/sell-slice` (Phase 3) now run `git fetch origin` then `git worktree add -b <branch> <path> origin/main` so new pies/slices base on current remote `main` instead of a possibly-stale local `main`, per the new `git-worktree-standard.md`.

### Deprecated

- **`basic-checks-runner.md`, `aggregating-test-reviewer.md`, `ci-cd-guardrails.md`, `frontend/visual-reviewer.md`** (under `sell-slice/agents/`) and **`run-the-day/agents/stage-runner.md` + `pr-reviewer.md`** — shimmed with a one-line deprecation banner, content otherwise intact, retained for v4 back-compat through 5.1. `basic-checks-runner` / `aggregating-test-reviewer` (static half) / `ci-cd-guardrails` are replaced by `slice-verifier`; `frontend/visual-reviewer` and the behavioral half of `aggregating-test-reviewer` move to `slice-tester`; `stage-runner` / `pr-reviewer` are superseded by `/sell-pie` + `/box-it-up`.
- **Config keys `ciCdGuardrails` / `basicChecksRunner` / `aggregatingTestReviewer`** are now deprecated aliases of `sliceVerifier` (the forward-looking "a future v5 may rename them" note from v4 is realized here).

### Removed

- **`commit-checklist-correlator.sh`** hook deleted — its `PostToolUse`-on-`Bash` registration, README row, `scenarios.md` section, and `test.sh` block are removed. The per-slice commit no longer correlates against a checklist-closeout edit (the pie-boundary PR is the closeout in v5).
- **`stop-gate.sh` hook deleted** — `/loop` + the pie-completion `/goal` own loop continuation natively; the `.bytheslice-state/loop-active` sentinel and the `bts_loop_active` / `bts_loop_sentinel` helpers are removed with it. Its `Stop` registration, README row, `scenarios.md` section, and `test.sh` block are gone (the suite drops from 89 to 64 tests).
- **Three legacy foundation-stage writers** (`design-system-stage-writer`, `ci-cd-scaffold-stage-writer`, `env-setup-stage-writer`) deleted — unused since v4 (the design-system / CI/CD / env-setup foundations are run-once standalone skills), along with their `modelTiers` entries and tier-guide rows. The `references/canned-stages/` slice templates they once populated are retained (they define the foundations-Pie slices 1.1–1.3).

### Migration

**Existing v4 projects.** No action required to keep working. Flat `## Stage N` master checklists are dual-read — `/sell-slice` runs them unchanged and the hooks parse them via the new `bts_checklist_layout` detection. To adopt the Pie model, run `/cook-pizzas --repie` (explicit opt-in; never silent) to convert a flat checklist into nested `## Pie N` / `### Slice N.M`, then drive it with `/sell-pie`. `/sell-pie` and `/run-the-day` **refuse** a flat checklist with a `--repie` hint rather than auto-converting. Old config keys `ciCdGuardrails`/`basicChecksRunner`/`aggregatingTestReviewer` keep resolving as aliases of `sliceVerifier`. The four deprecated agents and the two `run-the-day` agents remain as shims through 5.1.

---

## [4.2.0] — 2026-05-21

**Lifecycle hooks, expanded.** The v4.1 hook set covered the obvious gates (preconditions, commit-on-main, the `/sell-slice` stop loop). v4.2 adds four more deterministic guards that catch the quieter failure modes — editing a frozen stage plan mid-delivery, shipping a production route without a library-preview sign-off, closing a stage without updating the master checklist, and losing orientation across a context compaction. The `Stop` gate also learns `/box-it-up`: it nudges until the slice's PR is actually merged. The regression suite grows from 34 to 100 tests; every new row in `scenarios.md` has a matching assertion.

### Added

- **`stage-plan-guard.sh`** (`PreToolUse` on `Write`/`Edit`) — BLOCKs writes/edits to `docs/plans/stage_*.md` while `/sell-slice` is the current session's active skill. Stage plans are static during delivery; modifying one mid-slice is a sign the work has drifted from its spec. Points the operator at `/special-order` or `/cook-pizzas` to change a plan deliberately. Session-id guarded; fails open when state is missing or cross-session.
- **`library-gate-guard.sh`** (`PreToolUse` on `Write`/`Edit`) — WARN-injects (never blocks) when a `/sell-slice` run writes to a watched production route (`app/**`, `src/app/**`, `components/**`, `src/components/**`) without a recorded library-preview approval. Dormant until `library-approvals.json` exists — graceful degradation until the approval-writer ships (v4.2.2). Session-id guarded.
- **`commit-checklist-correlator.sh`** (`PostToolUse` on `Bash`) — after a `git commit` during `/sell-slice`, WARN-injects if the master checklist shows a `Completed` stage but the commit did not touch `docs/plans/00_master_checklist.md` (a likely skipped Phase 9 closeout). Session-id guarded.
- **`compact-snapshot.sh`** (`PreCompact`) — never blocks compaction (always exit 0). Writes `compact-snapshot.json` capturing session/skill/branch, last commit sha + subject, and the next up-to-3 unfinished checklist lines so the post-compaction turn can re-orient.
- **`/box-it-up` stop gating** in `stop-gate.sh` — if `/box-it-up` started in the current session but its PR is not `MERGED` (per `gh pr view`), BLOCKs once so the operator runs it through to merge. Missing `gh` fails open (can't check PR state without it).
- **66 new regression tests** in `test.sh` (34 → 100), covering every scenario for the four new hooks plus the `/box-it-up` stop path. New assertion helper `assert_not_contains` and `write_state` fixture helper.
- **Five new `scenarios.md` sections** documenting the contract for `stage-plan-guard`, `library-gate-guard`, `commit-checklist-correlator`, `compact-snapshot`, and the expanded `stop-gate` (both `/sell-slice` and `/box-it-up` paths).

### Changed

- **`hooks.json` registers the new hooks** across `Write`, `Edit`, `PostToolUse` (Bash), and `PreCompact` events. `stage-plan-guard` and `library-gate-guard` both run on the `Write` and `Edit` matchers.
- **`stop-gate.sh` handles two skills.** Refactored from a `/sell-slice`-only gate into a per-skill dispatch: `/sell-slice` blocks on a missing slice commit, `/box-it-up` blocks on an unmerged PR. Both remain session-id-scoped and re-entry-safe.
- **State schema documented** in `hooks/README.md` for `compact-snapshot.json` and `library-approvals.json` (the latter read-only until v4.2.2).

### Known gaps

- **`library-approvals.json` has no writer yet** (planned v4.2.2). `library-gate-guard.sh` reads it but nothing records approvals, so the gate stays dormant — intentional graceful degradation, not a bug. The Phase 4.5 library-preview approval flow will write this file once the approval-writer lands.

---

## [4.1.1] — 2026-05-19

**Hotfix.** v4.1.0 was tagged on GitHub but never published to npm — its `package.json` `files` allowlist did not include the new `hooks/` directory, so the npm tarball would have shipped without the hook infrastructure that `plugin.json` references. v4.1.1 fixes the allowlist; no code or skill changes. Treat v4.1.1 as the first usable npm release of the v4.1 series.

### Fixed

- `hooks` added to the `files` array in `package.json` so the hook scripts, `lib/checklist.sh`, `scenarios.md`, `test.sh`, `README.md`, and `hooks.json` are actually included in the published npm tarball. Without this fix, `plugin.json`'s `"hooks": "./hooks/hooks.json"` pointer would have resolved to a missing file in installed packages.

---

## [4.1.0] — 2026-05-19

**Hooks + framework decoupling.** Deterministic plugin hooks replace prose enforcement of preconditions across every skill — `/sell-slice` blocks when the master checklist is missing, `/box-it-up` refuses to run on `main`, `git commit` on `main` is blocked at the tool layer, and a `Stop` gate nudges `/sell-slice` to complete its commit loop. Framework support broadens from "Next.js only" to a canonical multi-stack contract — Next App Router and Pages Router, Vite + React, SvelteKit, Astro, and plain Node API are all detected and bootstrapped; non-Next stacks bubble HITL at the Phase 4.5 library-preview gate until per-framework templates land. GitNexus hard-coupling is removed.

### Added

- **`hooks/` infrastructure.** Four deterministic guard scripts:
  - `precheck-skill.sh` (`UserPromptSubmit`) — detects a `/bytheslice` slash command and runs per-skill preconditions: BLOCKs `/sell-slice` without a master checklist, BLOCKs `/box-it-up` on `main`/`master`, WARN-injects on dirty tree / missing `gh` auth / incomplete Prep section.
  - `shop-status.sh` (`SessionStart`) — injects a compact stage summary at session start (counts + next not-started row + Prep progress) when a checklist is present.
  - `pre-commit-guard.sh` (`PreToolUse` Bash matcher) — BLOCKs `git commit` on `main`/`master`; WARN-injects a staged-files summary on feature branches.
  - `stop-gate.sh` (`Stop`) — if `/sell-slice` started in the current session but no commit landed since the precheck, BLOCKs once so Claude completes the loop. Session-id-scoped: stale state from previous sessions never blocks.
- **`hooks/scenarios.md`** — canonical hook scenario contract. Every row is one (skill / state / expected) tuple the hooks must satisfy. The single source of truth that `test.sh` enforces and every `SKILL.md` `## Preconditions` section indirectly references.
- **`hooks/test.sh`** — 34-test regression suite. Each test sets up an isolated fixture under `$TMPDIR`, runs one hook with a synthetic JSON envelope, and asserts exit code + output substring. Pure bash, no deps beyond `git`.
- **`hooks/lib/checklist.sh`** — shared helpers (`bts_root`, `bts_checklist_path`, `bts_prep_counts`, `bts_branch`, `bts_tree_state`, `bts_session_id`, `bts_state_dir`, `bts_detect_skill`).
- **`hooks/README.md`** — hook reference, scenario-contract pointer, disable escape hatches (`BTS_HOOKS_DISABLED=1` per-session, `disableAllHooks` global).
- **`skills/setup-shop/references/framework-detect.md`** — new canonical stack contract. Supported-stacks table, detection algorithm, per-stack path map, bootstrap scaffolder list, per-skill branching matrix. Every skill that branches on framework reads this file instead of duplicating detection logic.
- **Multi-stack bootstrap support** in `/setup-shop`:
  - `vite-react` via `pnpm create vite@latest <name> -- --template react-ts` + Tailwind install
  - `sveltekit` via `pnpm create svelte@latest <name>` (interactive — skeleton + TS + Tailwind)
  - `astro` via `pnpm create astro@latest <name> -- --template minimal --typescript strict` + Tailwind add-on
  - `node-api` via `pnpm init` (framework-agnostic; `/sell-slice` runs backend / db-schema / infrastructure stages only)
- **`bootstrap-templates-catalog.md` framework-adapter status matrix** documenting which stack ✅ works end-to-end, which ⚠️ HITLs at the library-preview gate, and the contract for adding a new stack.
- **Per-session hook disable**: `export BTS_HOOKS_DISABLED=1` short-circuits every bytheslice hook in the current shell — useful for one-off experimental flows where the guards get in the way. Reverts on shell exit.

### Changed

- **CSS entry path parameterized** in `/set-display-case`. Reads from `framework-detect.md` instead of hardcoding `app/globals.css`. Per-stack: `app/globals.css` (next-app), `styles/globals.css` (next-pages), `src/index.css` (vite-react), `src/app.css` (sveltekit), `src/styles/global.css` (astro).
- **`library-route-scaffolder` is framework-aware.** New Step 0 framework gate bubbles HITL `prd_ambiguity` for non-`next-app` stacks with the framework's idiomatic conventions, instead of silently producing wrong files. Hardened against orchestrator-paraphrase attacks ("the user already said it's fine" is the HITL trigger, not a bypass).
- **`layout-architect` and `library-entry-writer` have matching framework gates.** Both bubble HITL for non-Next stacks at Step 0 / Step 0a, with strong anti-paraphrase language so a sibling agent or orchestrator framing cannot waive the gate. Pressure-tested four times against user-side, orchestrator-side, and orchestrator-paraphrase attacks.
- **`setup-shop` Q-bootstrap-stack expanded** from "Next.js only" single-option to a five-option select (Next App, Vite + React, SvelteKit, Astro, Node API). The question reflects the actual support matrix from `framework-detect.md`.
- **`discovery` agent simplified.** GitNexus fork removed from workflow — agent now uses Grep + Glob only. Output contract drops `index_freshness` and `discovery_method` fields.
- **SKILL.md Preconditions sections trimmed** across `sell-slice`, `box-it-up`, `inspect-display`, `run-the-day`. The inline prose ("If any precondition fails, stop and surface the gap") is replaced by a one-line pointer to `hooks/precheck-skill.sh`. The checks still run when hooks are disabled; the prose enforcement just lives in one place now.
- **`CLAUDE.md` slimmed** from 43 lines (GitNexus-focused) to 13 lines (bytheslice-focused project notes).

### Removed

- **GitNexus hard-coupling.** The GitNexus MCP itself remains available globally; bytheslice no longer assumes it's installed. Specifically removed:
  - `Q6 — GitNexus` from `/cook-pizzas` plan-mode questions
  - `gitnexus` key from `bytheslice-config-schema.md` mcps block and example config
  - `gitnexus` from `/setup-shop` Q-mcps options
  - GitNexus discovery fork from `sell-slice/agents/discovery.md`
  - GitNexus context from `rules-loader` and `rules-assembler` agent inputs/outputs
  - GitNexus rules pull (the `<!-- gitnexus:start -->...<!-- gitnexus:end -->` block) from `CLAUDE.md`
  - `.gitnexus` entry from `.gitignore` (replaced by `.claude/.bytheslice-state/`)

### Migration

**Existing v4.0 projects.** No action required. Hooks activate automatically once you upgrade to v4.1 and Claude Code re-reads the plugin manifest. The `Preconditions` sections of every `SKILL.md` still enforce checks when hooks are disabled, so nothing breaks if you opt out via `BTS_HOOKS_DISABLED=1` or `disableAllHooks`. If your project's `bytheslice.config.json` has an `mcps.gitnexus` key, it's harmless — the resolver now ignores it; you can remove it on your next config edit. Your existing `CLAUDE.md` is untouched by the upgrade; if you want the new slimmer notes, re-run `/setup-shop` Step 3 or edit by hand.

**New projects on non-Next.js stacks.** `/setup-shop` Q-bootstrap-stack now offers Vite + React, SvelteKit, Astro, Node API. Bootstrap + design system + CI/CD work end-to-end. The first time `/sell-slice` Phase 4.5 (Library Preview Gate) fires, the agents will bubble HITL with the framework's idiomatic conventions and ask whether to skip, approximate, or defer until the per-framework adapter ships.

---

## [4.0.0] — 2026-05-14

**The Pizza Shop release.** Every command is renamed to a kitchen action. Foundation skills get promoted out of being canned plan stages into being standalone, run-once-before-service prep commands. The master checklist gains a top "Prep" section. Every skill is independently invocable (auto-detected standalone vs sequential mode). `/goal` integration lands in `/run-the-day`'s auto modes and in `/sell-slice`'s Phase 2.5.

### Renamed

| v3 command | v4 command | What changed |
|---|---|---|
| `/setup` | **`/setup-shop`** | Renamed only. Same three-flow logic. |
| `/write-prd` | **`/create-menu`** | Renamed only. Same PRD generator. |
| `/plan-phases` | **`/cook-pizzas`** | Renamed AND reshaped — no longer emits stage 1–3 plan files; emits the master checklist's new Prep section instead. |
| `/init-design-system` | **`/set-display-case`** | Renamed AND promoted out of `skills/sub-disciplines/` to top-level. No longer auto-dispatched from `/sell-slice` in new projects; run it directly. Standalone-invocable on any project. |
| `/scaffold-ci-cd` | **`/final-quality-check`** | Same as above — promoted out of sub-disciplines, standalone-invocable. |
| `/setup-environment` | **`/open-the-shop`** | Same as above. The most HITL-heavy prep step. |
| `/deliver-stage` | **`/sell-slice`** | Renamed AND gains a Phase 0 precondition (every Prep checkbox must be `[x]` before any feature stage runs). Legacy v3 routing for `design-system`/`ci-cd`/`env-setup` stage types preserved for old projects. NEW Phase 2.5 sets a slice-completion `/goal` lifted from the stage file's Exit criteria block. |
| `/ship-pr` | **`/box-it-up`** | Renamed only. Same closeout flow (push → CI watch → merge → cleanup). |
| `/add-feature` | **`/special-order`** | Renamed only. Same mid-flight feature addition. New: Phase 4 verifies Exit-criteria contract on writer output. |
| `/run-pipeline` | **`/run-the-day`** | Renamed AND gains NEW Phase 0.5 — `--auto-*` modes set a session-scoped `/goal` whose condition encodes the pipeline's end state. |
| `/walk-platform` | **`/inspect-display`** | Renamed only. Same read-only cross-cutting audit. |
| `/review-pipeline` | **`/close-shop`** | Renamed only. Same post-execution retro. Bookends `/setup-shop`. |

### Changed

- **Foundation split.** `init-design-system`, `scaffold-ci-cd`, `setup-environment` moved from `skills/sub-disciplines/` to top-level under their new names. The `sub-disciplines/` directory is removed. These three skills are now invoked directly during daily prep, not as auto-dispatched sub-skills inside `/sell-slice`.
- **Master checklist gains a Prep section.** `cook-pizzas` now writes a top `## Prep` section above the feature stages. Each foundation skill flips its own checkbox when invoked in sequential mode (master checklist present). `sell-slice` Phase 0 refuses to start any feature stage until every Prep box is `[x]`. Existing v3 projects with `stage_1_*`/`stage_2_*`/`stage_3_*` plan files keep working via a documented legacy routing path.
- **Mode detection.** Every SKILL.md now has a `## Mode detection` section documenting whether the skill is standalone-only, sequential-only, or true dual-mode. Auto-detection is based on whether `docs/plans/00_master_checklist.md` exists. Standalone mode never assumes a parent orchestrator; sequential mode flips the corresponding Prep/Stage checkbox on completion.
- **`/goal` integration.** `/run-the-day` Phase 0.5 sets a session-scoped goal in `--auto-mvp` and `--auto-all` modes. `/sell-slice` Phase 2.5 sets a slice-completion goal lifted from the active stage file's Exit criteria block (after pre-checking for an active parent goal). Both honor a graceful fallback when `/goal` is unavailable.
- **Exit-criteria contract.** New section in `cook-pizzas/references/templates.md` codifying the rules every stage file's `**Exit criteria:**` block must follow — transcript-verifiable, binary, slice-specific — with concrete good/bad examples. `phased-plan-writer` agent enforces the contract; `special-order` re-dispatches writers on weak criteria.

### Added

- **`pizza-shop`** keyword in npm + plugin manifests.
- **Standalone invocability** as a property of every skill, not an accident. You can drop `/set-display-case` onto any project to bolt on a design system, or `/box-it-up` onto any feature branch.

### Backward compatibility (kept in v4.x.x, removed in v5.0.0)

- Every old slash command (`/bytheslice:deliver-stage`, `/deliver-stage`, etc.) remains in the new skill's `triggers:` array.
- Every old natural-language trigger phrase ("deliver the next stage", "ship the next slice", etc.) remains.
- Legacy `stage_1_design_system_gate.md` / `stage_2_ci_cd_scaffold.md` / `stage_3_env_setup_gate.md` plan files still route correctly through `/sell-slice`'s Phase 4 (now labeled "legacy v3 sub-skill dispatch").
- `bytheslice.config.json` keys keep their v3 names — `runPipeline.platformWalkEvery` is unchanged. A future v5 may rename them with deprecation aliases.

### Migration guide

**Existing v3 projects (master checklist already has `stage_1_*`/`stage_2_*`/`stage_3_*`):** no action required. Old slash commands still fire. Old plan files route through `/sell-slice`'s legacy path. Optionally migrate to v4 by deleting stages 1–3, adding a Prep section to the master checklist by hand, and running the three foundation skills directly.

**New v4 projects:** follow the Quick Start in the README. The sequence is `/setup-shop` → `/create-menu` → `/cook-pizzas` → `/set-display-case` → `/final-quality-check` → `/open-the-shop` → `/sell-slice` (loop with `/box-it-up`).

---

## [3.1.0] — 2026-05-13

### Added
- **`/bytheslice:walk-platform`** — cross-cutting visual walkthrough skill. Discovers every route in a running app, drives a live browser through each one, captures screenshots + console output, and surfaces a ranked report of what's broken, mocked, or empty across the **whole product** — not just the last slice. Read-only. Run before UAT, before a demo, or after a batch of `/ship-pr` runs. Complements (does not replace) `deliver-stage`'s per-slice `visual-reviewer`.
- **`run-pipeline` periodic platform-walk checkpoints** — autonomous multi-stage runs now pause every N stages (configurable via `runPipeline.walkPlatformCheckpointInterval` in `bytheslice.config.json`, default 5) to dispatch `/walk-platform` and surface any cross-cutting regressions before they pile up. HITL gate: operator reviews the walk report before the pipeline resumes.
- **Dev-mode auth bypass helpers** (`/bytheslice:plan-phases`) — opt-in localhost auth shortcuts for the design-system foundation stage so the `/library` route is reachable in fresh setups without a real session.

### Changed
- **GitHub repo + npm package + default local path are all `bytheslice`** — the rename from `stagecoach` (and the brief intermediate `stage-coach` / `@steve-piece/stagecoach` npm names) is now fully consistent across the repo URL, the published npm package, and the recommended local clone path. GitHub redirects the old `steve-piece/Stagecoach` URL.
- **README refresh** — pizza-themed Kitchen narrative, simplified FAQ, `walk-platform` row added to the skills table.

---

## [3.0.0] — 2026-05-07

Major restructure: subagent-driven everything, single delivery loop, real per-stage verification.

### Added
- **`/bytheslice:deliver-stage`** — the new everyday delivery loop. Replaces both `/ship-feature` and `/ship-frontend`. Reads the master checklist, picks the next `Not Started` stage, dispatches the right sub-skill or internal pipeline by `type:`, runs the per-stage review pipeline, and opens the PR. Run it once per slice, in a fresh chat, until the master checklist is done.
- **Phase 6 — basic-checks-runner** (lint / typecheck / build) gates the per-stage output summary. No "stage complete" report until these pass.
- **Phase 7 — aggregating-test-reviewer** with type-aware depth: full review (dev-server boot + Claude-in-Chrome browser UAT + visual diff against tokens) for `frontend` / `full-stack` slices; reduced review (CI gates only) for `backend` / `db-schema` / `infrastructure`; skipped for foundation stages where Phase 6 is sufficient.
- **fix-attempter agent** — first-pass targeted-fix when basic-checks or aggregating-review fails.
- **debug-instrumenter agent** — second-pass; adds `// INSTRUMENT`-marked logging into still-failing modules so the next fix-attempter dispatch has data. Orchestrator strips instrumentation after the green run.
- **`/bytheslice:ship-pr` — universal closeout skill** — takes any feature branch with locally-committed work and ships it through pre-flight safety checks → push → PR open (or reuse existing) → CI watch (with `ci-fix-attempter` auto-fix loop on red, capped at 3 attempts before HITL) → user-authorized merge gate → main sync + local and remote branch deletion + worktree removal. Decoupled from `/deliver-stage` and `/add-feature` so the operator can run a manual visual UAT or local code review between commit and PR. Hard rules verified under adversarial probe testing (6/6 pass): never ship from main, never force-push (even `--force-with-lease`), never auto-stash on cleanup, never modify a passing test to match wrong behavior, never silence a real lint failure with `eslint-disable`, reuse existing PRs rather than creating duplicates.
- **`/library` operator-only preview route** — `init-design-system` now scaffolds a Storybook-like in-app component preview at `app/(dashboard)/library/` (or detected route-group equivalent) after the design-system bootstrap. Left sidebar with search + entries, main pane showing every variant × every state, sidebar bottom rail theme toggle (Sun/Moon, persisted via `next-themes`). The route is audited out of every navigation surface (sidebar, top nav, mobile sheet, sitemap, robots, breadcrumbs) and seeded with a Buttons example. Owned by the new `library-route-scaffolder` agent.
- **Phase 4.5 — Library Preview Gate** in deliver-stage's frontend pipeline. Non-skippable. Fires when a stage either (a) authors a new component or block, OR (b) modifies any user-visible surface (props, copy, content, variants, states, styles) of an existing library component as it appears in a production route. Pure internal refactors with no rendered-output delta are exempt. Owned by the new `library-entry-writer` agent, dispatched in `mode: "new"` (append a fresh `/library/<slug>` entry) or `mode: "modify"` (update the existing entry's matrix with the delta). The orchestrator HITLs the user with `hitl_category: "creative_direction"` for explicit approval / revision (cap 2 loops) / rejection before any production-route import or consumer-side user-visible edit lands.
- **27 new subagents** authored across the plugin so every heavy workflow step has an owner: `rules-loader`, `basic-checks-runner`, `aggregating-test-reviewer`, `fix-attempter`, `debug-instrumenter`, `library-entry-writer` (deliver-stage); `ci-fix-attempter` (ship-pr); `scaffold-discovery`, `framework-detector`, `e2e-installer`, `workflow-writer`, `husky-installer`, `lint-config-writer`, `branch-protection-writer`, `local-gates-runner` (scaffold-ci-cd, which previously had zero); `env-scanner`, `github-secrets-scanner`, `checklist-generator` (setup-environment); `library-route-scaffolder` (init-design-system); `bootstrap-runner`, `config-generator`, `ci-cd-detector` (setup); `brief-analyzer`, `consistency-checker` (write-prd); `stage-decomposer`, `rules-assembler` (plan-phases); `proposal-drafter` (review-pipeline).
- **"Always provide a recommended answer"** directive added to every clarifying-question phase across the plugin (scaffold-ci-cd, setup, plan-phases, write-prd, add-feature, init-design-system, review-pipeline, deliver-stage Phase 2).

### Changed
- **`/ship-feature` and `/ship-frontend` are gone.** They're replaced by `/bytheslice:deliver-stage`. The frontend pipeline (modern-ux-expert → layout-architect → block-composer → component-crafter → state-illustrator → visual-reviewer) lives under `skills/deliver-stage/agents/frontend/` and runs as Phase 4 of `deliver-stage` when the active stage has `type: frontend`.
- **Foundation skills are now sub-skills of `deliver-stage`.** Physically moved under `skills/sub-disciplines/` (`init-design-system`, `scaffold-ci-cd`, `setup-environment`). They remain user-invocable as escape hatches; documentation everywhere now labels them "Sub-skill of `/bytheslice:deliver-stage`."
- **`/run-pipeline` is now explicitly experimental.** It no longer duplicates stage-routing logic; its `stage-runner` agent is a thin wrapper that invokes `/bytheslice:deliver-stage` per stage. Same artifacts, same Phase 6/7 gates, regardless of whether you run `deliver-stage` directly or through `run-pipeline`. README diagram now shows `run-pipeline` as a dashed sidecar.
- **`scaffold-ci-cd` SKILL.md slimmed from 275 lines to ~190** — the workflow is now an orchestrator that dispatches eight specialized agents instead of inlining detection, template-writing, husky install, eslint config, and branch-protection logic.
- **`setup-environment` SKILL.md now dispatches `env-scanner` / `github-secrets-scanner` / `checklist-generator`** instead of inlining the scanning and checklist-rendering logic.
- **`/bytheslice:add-feature` now hands off to `/bytheslice:deliver-stage`** (was: `/ship-feature`). Also commits new plan files on a `chore/add-stages-<lo>-<hi>` branch and offers `/ship-pr` as the chore-PR option.
- **`/bytheslice:deliver-stage` Phase 9 trimmed** — now stops at "slice committed locally, ready for review" with an explicit handoff to `/ship-pr`. Completion Checklist sections §1–§4 are this skill's responsibility; §5 (PR + CI green) and §6 (merge + cleanup) are explicitly handed off to `/ship-pr`. Replaces the prior monolithic Phase 9 that bundled commit-through-cleanup in a single non-pausable run, giving the operator a real review/UAT window between commit and ship.

### Migration
- `/ship-feature` → `/bytheslice:deliver-stage` (drop-in for backend/full-stack/db-schema/infrastructure stages).
- `/ship-frontend` → `/bytheslice:deliver-stage` (auto-routes to the frontend pipeline when the stage has `type: frontend`).
- Existing `/run-pipeline` invocations continue to work; the only behavioral change is that each stage now runs through `deliver-stage`'s Phase 6/7 verifications.
- Foundation-skill commands (`/init-design-system`, `/scaffold-ci-cd`, `/setup-environment`) still work as escape hatches; the documented entry point is `deliver-stage`, which dispatches them automatically by stage type.

---

## [2.2.1] — 2026-05-05

### Changed
- **GitHub repo renamed** from `steve-piece/phased-dev-workflow` to `steve-piece/bytheslice`. GitHub redirects the old URL, but every plugin manifest, README, and skill reference now points to the canonical new URL.
- **Default plugin path renamed** from `~/phased-dev-workflow` to `~/bytheslice` (used by `/bytheslice:review-pipeline` to locate the plugin repo for retrospective PRs). If you kept your local clone at `~/phased-dev-workflow`, set the env var override below.
- **Env var renamed:** `PHASED_DEV_PLUGIN_PATH` → `BYTHESLICE_PLUGIN_PATH`. Used to override the default plugin path for `review-pipeline`. Set in your shell rc:
  ```sh
  export BYTHESLICE_PLUGIN_PATH="$HOME/wherever/your/clone/lives"
  ```
- **`package.json` `name`** renamed `phased-dev-workflow` → `bytheslice` for consistency with the plugin manifest and repo.

### Migration
If you renamed your local clone to `~/bytheslice`, no env var needed. If you kept it at `~/phased-dev-workflow` (or anywhere else), add `BYTHESLICE_PLUGIN_PATH` to your shell rc with the absolute path. The old `PHASED_DEV_PLUGIN_PATH` env var is no longer read.

---

## [2.2.0] — 2026-05-05

### Added
- **`/bytheslice:add-feature`** — bolt new features onto an existing project after the original PRD-to-app run is complete. Auto-detects whether the project is ByTheSlice-built (`docs/plans/00_master_checklist.md` present), an existing app needing setup first, or a fresh folder needing bootstrap. For ByTheSlice projects, runs the `complexity-assessor` subagent (single-stage vs multi-stage), surfaces the proposed breakdown for authorization, then dispatches `phased-plan-writer` in incremental mode to write the new stage files. Hands off to `/bytheslice:ship-feature` or `/bytheslice:run-pipeline` for delivery.
- **`phased-plan-writer` incremental mode** — same agent now operates in two modes: `plan-phases` mode (original PRD run, stages 5+) or `incremental` mode (any stage number, complexity-assessor output as primary input, no PRD context required).
- **Setup Step 3 — CI/CD Baseline Check** — Flow B and Flow C now check the four CI/CD baseline markers (`ci.yml`, `design-system-compliance.yml`, husky `pre-push`, PR template) and offer to scaffold via `/bytheslice:scaffold-ci-cd` if missing. Makes ByTheSlice viable for non-PRD-to-app workflows.

### Changed
- **Skills renamed to verb-first scheme** (with `sp-` prefix dropped):
  - `prd-generator` → `write-prd`
  - `prd-to-phased-plans` → `plan-phases`
  - `sp-design-system-gate` → `init-design-system`
  - `sp-environment-setup-gate` → `setup-environment`
  - `sp-ci-cd-scaffold` → `scaffold-ci-cd`
  - `sp-frontend-design` → `ship-frontend`
  - `sp-feature-delivery` → `ship-feature`
  - `the-orchestrator` → `run-pipeline`
  - `phased-dev-retrospective` → `review-pipeline`
- **`bootstrap` skill folded into the new `setup` umbrella.** Standalone `bootstrap` skill removed; functionality is now Step 1 of `/bytheslice:setup`. Auto-detects whether you're starting fresh (Flow B) or in an existing project (Flow C).
- **First-time-install flow added to `setup`.** Flow A creates `~/.bytheslice/defaults.json` so future projects can opt in to your machine-wide defaults via a single Group 1 question instead of re-answering the per-section setup questions.
- **References relocated.** `references/model-tier-guide.md`, `references/bytheslice-config-schema.md`, and the root-level `bytheslice.config.example.json` all moved to `skills/setup/references/`.

### Migration
If you have local docs or scripts referencing the old paths or skill names, update them. Per-project `bytheslice.config.json` files from v2.1 don't need changes — the schema is unchanged. If you have a ByTheSlice project that already shipped its plan, run `/bytheslice:add-feature` to extend it.

---

## [2.1.0] — 2026-05-04

### Added
- **`bootstrap` skill (Stage 0)** — optional on-ramp that scaffolds a new Next.js single-app or Turborepo monorepo, drops in `bytheslice.config.json`, and creates a gitignored `ROADMAP.local.md`. *(Folded into the `setup` umbrella in 2.2.0.)*
- **`bytheslice.config.json` personalization layer** — optional per-project file at the project root; overrides plugin defaults declaratively (model tiers, stage shape, MCPs, visual-review tooling, HITL categories, external rule imports).

### Changed
- **`sc-` prefix removed from slash commands.** When the plugin is published to the marketplace, commands are auto-namespaced under `bytheslice:` (e.g., `/bytheslice:write-prd`). The bare form (`/write-prd`) also works in local dev.

---

## [2.0.0] — 2026-05-04

### Added
- **`init-design-system`** (formerly `sp-design-system-gate`) — Stage 1 design-system gate. Bundle-first or brief-first.
- **`setup-environment`** (formerly `sp-environment-setup-gate`) — Stage 3 env-setup gate. Scans `.env.example`, generates manual provisioning checklist, env-verifier sub-agent confirms keys without logging values.
- **`ship-frontend`** (formerly `sp-frontend-design`) — type:frontend pipeline. 6 sub-agents: modern-ux-expert → layout-architect → block-composer (mandatory first) → component-crafter (conditional) → state-illustrator → visual-reviewer. Hardcoded visual-review tooling priority (Claude in Chrome > Chrome DevTools MCP > Playwright > Vizzly).
- **`review-pipeline`** (formerly `phased-dev-retrospective`, experimental) — cross-stage friction detection.
- **HITL bubbling architecture** — sub-agents NEVER prompt the user directly. They return structured `needs_human` fields with category + question. The orchestrator is the only surface that calls `ask_user_input_v0`.
- **Model alias system** — `haiku`, `sonnet`, `opus` aliases everywhere (no version pins). Per-tier overrides via `ANTHROPIC_DEFAULT_*_MODEL` and `CLAUDE_CODE_SUBAGENT_MODEL` env vars.
- **Embedded completion checklists** inside each SKILL.md (separate `*-checklist.md` reference files removed for cross-platform compatibility).
- **Opinion-free architecture-conventions baseline** at `skills/plan-phases/references/architecture-conventions.md` — only universal web standards, performance facts, conditional security baselines, conditional framework-version syntactic facts, structural project variants. NO naming conventions, type-vs-interface, internal organization rules — those come from the user via plan-phases elicitation Q9.
- **Stage routing in run-pipeline** — orchestrator reads each stage file's `type:` frontmatter and dispatches to the correct skill.
- **Plugin manifest renamed to `bytheslice`**, version bumped to `2.0.0`.

### Changed
- **Stage 1 is now the design-system gate** (was CI/CD scaffold in v1). CI/CD scaffold is now Stage 2.
- **20–30 vertical-slice feature stages** is the new target (was loose in v1).
- **6-task hard cap per stage**, completable in one fresh agent session.
- **Linear is now optional** — gathered via question gate in `plan-phases`, not in the main flow.

### Removed
- `skill-mcp-scout` sub-agent — MCPs are now defined in the phased plan and read from the project rules file.
- All hardcoded model version references in skill / agent files.
- `cursor`-specific and `claude`-specific bare references throughout — replaced with generic "project rules file" or inline "(cursor or claude rules file)".

### Migration from v1

If you have an existing v1 project:

[ ] Re-run `/bytheslice:plan-phases` against your existing PRD to regenerate stage files with v2 frontmatter.
[ ] If you had already completed v1 Stage 1 (CI/CD scaffold), mark `stage_2_ci_cd_scaffold.md` as completed in the master checklist before running the orchestrator.
[ ] If your project does not need a design system, you can stub Stage 1 by completing `stage_1_design_system_gate.md` manually with a minimal token set.
[ ] Update any custom sub-agents to return the standard HITL fields (`needs_human`, `hitl_category`, `hitl_question`, `hitl_context`) instead of prompting the user directly.

---

## [1.0.0] — 2026-04

Initial release. PRD generation, phased planning, and CI/CD hardening skills.
