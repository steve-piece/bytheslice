---
name: final-quality-check
description: "Install the quality line every pie passes through before going on display: wire CI/CD, E2E testing, design-system compliance, and visual-regression gates. Run once before /sell-slice; also invocable standalone on any project."
user-invocable: true
triggers: ["/bytheslice:final-quality-check", "/final-quality-check", "install the quality line", "wire the inspection station", "/bytheslice:scaffold-ci-cd", "/scaffold-ci-cd", "scaffold ci/cd", "set up ci", "bootstrap quality gates", "ci-cd stage"]
---
<!-- skills/final-quality-check/SKILL.md -->
<!-- Daily-prep skill (run before /sell-slice). Pizza-shop framing: install the quality line every pie crosses before landing on the display tray. Orchestrator-only: dispatches nine specialized agents to bootstrap the production-grade CI/CD + E2E + design-system-compliance + visual-regression baseline on a dedicated chore branch. Mode-detected (standalone vs sequential). -->

# Final Quality Check: CI/CD + Verification Baseline

This skill is the orchestrator for the CI/CD baseline. It does not write workflows itself; it **dispatches nine specialized agents** that each own one slice of the scaffold work. The orchestrator's job is detection, sequencing, user-input gating, and walking the completion checklist.

## Mode detection

This skill runs in one of two modes, auto-detected at startup:

- **Standalone**: no `docs/plans/00_master_checklist.md` at the project root. Adds CI/CD + E2E + design-system-compliance + visual-regression baseline to any project. Runs end-to-end, exits. No checklist coordination.
- **Sequential**: master checklist exists with a `## Prep` section. On completion, flip the `[ ] Quality line installed` row to `[x]` and surface: *"Quality line ready. Next prep step: `/open-the-shop`."*

Honor an explicit `--standalone` or `--sequential` flag if passed; otherwise auto-detect from disk state.

## Quality tier

`quality.tier` in `bytheslice.config.json` sets how heavy a line this run installs. Resolve it once, before Phase 0, and pass the resolved value to every Phase 3 and Phase 4 agent as `quality_tier`.

| Value | What it installs |
|---|---|
| `"standard"` (default) | Today's full line: sub-blocks A through H as written, the `@feature`, `@regression-core` and `@visual` suites with visual baselines, `e2e.yml`, `e2e-coverage.yml`, `design-system-compliance.yml`, and the full Completion Checklist. |
| `"lean"` | A line sized for a small app. CI runs lint, typecheck, unit tests, build, and ONE Playwright smoke spec (`@smoke`) over the app's main flow. No visual baselines, no `@visual` or `@regression-core` suite, no `e2e.yml`, no `e2e-coverage.yml`. `design-system-compliance.yml` and sub-block E's lint additions stay only when a design system exists (`docs/design-system.md` is present, or the Prep row for Slice 1.1 is `[x]`). The husky `pre-push` hook runs the same lean set. |
| `"auto"` | Resolves to `lean` when the master checklist has at most 3 feature pies (Pie 2 onward) and no payments work (no pie or slice about payments, checkout, billing or subscriptions, and no payments provider in PRD Section 4 or any `.env.example`); otherwise `standard`. With no master checklist (standalone mode) it resolves to `standard`. `/pizza-party` sets `auto`. |

Log the resolved tier as one line (for example `quality tier: lean (auto: 2 feature pies, no payments)`). When `docs/pizza-party/order.md` exists, append the same line to its "Decisions made without you" section.

The lean templates live beside the standard ones in [references/scaffold-artifact-templates.md](references/scaffold-artifact-templates.md) under "Lean tier". Lean never drops lint, typecheck, unit tests, build or the smoke spec; it only leaves out the suites a small app does not need.

## Unattended runs (`run.unattended: true`)

When `bytheslice.config.json` sets `run.unattended: true` (`/pizza-party` does), nothing in this skill waits on a human: the operator accepted that risk by launching the run. The order ticket is `docs/pizza-party/order.md`; every choice made in the operator's place is appended to its "Decisions made without you" section as one line (the point, the option taken, why).

- **Phase 1** asks nothing. Each question takes its recommended answer, recorded in the ticket.
- **Every point that would ask or return `needs_human`** takes the safest working option instead and continues: a custom or legacy full-chain `.husky/pre-push`, a conflicting existing workflow, an existing `scripts/setup-branch-protection.sh`, a non-empty `.stylelintrc.json`, user-edited content between the rules-file markers, or a project with no ESLint config. Keep the existing file untouched, skip the artifact that would overwrite it, and record the skip. A `framework: unknown` profile is treated as a Node app with E2E skipped, and recorded.
- **Destructive operations on shared resources the operator did not name** (branch protection, remote branch deletion, repository settings) are skipped and recorded, never asked about.
- The branch-protection reminder (Phase 6 step 5) goes into the ticket instead of the chat.

Without `run.unattended`, every prompt and HITL in this skill behaves exactly as written.

## Ship-once delivery (`delivery.mode: "ship-once"`)

Under ship-once the whole app ships in one PR at the end, so the scaffold does not get a PR of its own. The scaffold is committed locally and travels with the app's one PR.

- **Phase 2:** no `chore/final-quality-check` branch. Scaffold on the current branch (the run's local ship branch). The rule against committing on `main` / `master` still holds: if HEAD is on either, create `chore/final-quality-check` locally first and record it.
- **Phase 5** becomes one local commit on the current branch (`chore: install quality line (<tier> tier)`). No push, no PR, no CI wait, no merge.
- **Phase 6** skips the `main` sync and the branch and remote cleanup; it walks the ship-once rows of the Completion Checklist instead.
- **Local and CI agree.** Phase 4 (and `slice-verifier` at every later slice end, and `/box-it-up`'s pie-local check at every pie boundary) executes every command the generated CI workflows run for the resolved tier, never a subset: every `run:` step of `ci.yml` and, under the `standard` tier, of `e2e.yml` too (the `@feature`, `@regression-core` and `@visual` suites in full, with no `verification.e2e` threshold narrowing them). A lean app has no `e2e.yml`; its `ci.yml` already holds the one smoke spec. A green local run is the real gate here; CI runs those same commands once on the app's one PR. Under `pie-pr` and `merge-per-slice` nothing here changes. Every other generated workflow that runs on pull requests (`e2e-coverage.yml`, `db-schema-drift.yml`, `design-system-compliance.yml`, when present) runs too, so nothing can fail only in CI on the ship PR.
- `gh` is not needed until that final PR.

## Reference Files

| File | Purpose |
| --- | --- |
| [references/scaffold-artifact-templates.md](references/scaffold-artifact-templates.md) | Verbatim file templates for every CI/CD artifact (workflows, husky hook, PR template, regex sweep script, etc.). Every implementer agent reads this before writing. |
| [references/prd-ci-cd-checklist.md](references/prd-ci-cd-checklist.md) | **Project-wide runtime guardrails**, not scaffold-time setup. Master-checklist updates, CI gate alignment, deterministic pipelines, slice-per-PR rule, failure-artifact upload; these apply to every agent on every PR. Sub-block H of Phase 3 appends this content into the project rules file (CLAUDE.md / AGENTS.md) so every later stage skill picks it up automatically. |

## Subagent Roster

Each agent is a **registered plugin agent**: dispatch by type `bytheslice:<name>` (Agent tool `subagent_type`, or `Workflow` `agentType`), passing only the task inputs as the prompt. The files under `./agents/` carry the role prompt plus enforced model/effort/tools. Fallback (Cursor, or a host without plugin-agent registration): Read the file and dispatch it per [`loop-workflow-fallback-pattern.md`](../cook-pizzas/references/loop-workflow-fallback-pattern.md) "Agent shape on the fallback path": its frontmatter goes first as a header (model tier and effort, the normalized tool allowlist, the read-only line for an agent without write tools, the no-git-writes line), then its body, then the inputs; log one self-check line per dispatch in the run log.

| Phase | Agent file | Model | Effort | Mode |
|-------|-----------|-------|--------|------|
| 0 | [agents/scaffold-discovery.md](agents/scaffold-discovery.md) | opus | medium | readonly |
| 0 | [agents/framework-detector.md](agents/framework-detector.md) | haiku | low | readonly |
| 3A | [agents/e2e-installer.md](agents/e2e-installer.md) | sonnet | medium | write |
| 3B | [agents/workflow-writer.md](agents/workflow-writer.md) | sonnet | medium | write |
| 3C | [agents/husky-installer.md](agents/husky-installer.md) | haiku | low | write |
| 3E | [agents/lint-config-writer.md](agents/lint-config-writer.md) | haiku | low | write |
| 3F | [agents/a11y-discovery-runner.md](agents/a11y-discovery-runner.md) | sonnet | medium | readonly |
| 3G | [agents/branch-protection-writer.md](agents/branch-protection-writer.md) | haiku | low | write |
| 4 | [agents/local-gates-runner.md](agents/local-gates-runner.md) | sonnet | medium | write |

The PR template (Phase 3D) is small enough that the orchestrator writes it directly from the templates file; no agent is needed.

## Inputs and Preconditions

- Repository exists with at least one app or package directory.
- Clean git working tree on `main`, OR explicit user OK to proceed dirty.
- `gh` CLI installed and authenticated (needed for PR + branch protection; not needed under ship-once until the app's final PR).
- A package manager (`pnpm` preferred) installed.

## Scenarios

| State | Action |
|---|---|
| Fully built (every scaffold artifact present and CI green) | Stop. Report "baseline already in place". Recommend `/bytheslice:sell-slice` for the next slice. |
| Partially built (some artifacts present, others missing) | Run discovery, dispatch only the agents that fill the gaps; never overwrite existing artifacts without surfacing to the user. |
| Not yet started (clean repo, no `.github/workflows/`) | Run the full pipeline end-to-end. |

`scaffold-discovery` reports `already_present_scaffold_artifacts`; the orchestrator uses that list to decide which Phase 3 sub-blocks to dispatch.

## Workflow

### Phase 0: Discovery (parallel)

Dispatch in one batch:

1. `scaffold-discovery`: package manager, framework, monorepo tooling, existing workflows, DB presence
2. `framework-detector`: E2E framework choice + target apps

### Phase 1: Clarifying Questions (Plan Mode)

Before any write, switch to **Plan Mode** and ask up to 5 focused questions:

1. Which app(s) are critical paths for E2E?
2. Should CI run on PR only, or PR + push to `main`?
3. Which suites are required blockers (`@feature`, `@regression-core`, `@visual`, full)?
4. Are deployments gated on green E2E checks?
5. Any restricted environments/secrets needed in CI?

**Always provide a recommended answer in available options.**

Wait for answers before continuing. Under `run.unattended: true`, skip the prompt: take each recommended answer and record it in the order ticket's "Decisions made without you" section (see "Unattended runs").

### Phase 2: Branch Setup

- Create a dedicated branch: `chore/final-quality-check`. Under ship-once, stay on the current branch instead (see "Ship-once delivery").
- Never scaffold CI directly on `main` / `master`.
- Keep this PR minimal: baseline quality + smoke E2E only. No product features.

### Phase 3: Implementation (sub-blocks A through H, sequential)

Each sub-block dispatches its agent, waits for the structured return, and commits before moving to the next.

| Block | Agent | What it produces |
|---|---|---|
| A | `e2e-installer` | Playwright installed, scripts in package.json, baseline @feature/@regression-core/@visual specs, `tests/visual/baselines/` |
| B | `workflow-writer` | `.github/workflows/{ci,e2e,e2e-coverage,design-system-compliance,db-schema-drift}.yml` |
| C | `husky-installer` | `.husky/pre-push` with the slice-tier gate chain (gate tier 2); offers to swap a legacy full-chain hook |
| D | (orchestrator direct) | `.github/pull_request_template.md` from the templates file |
| E | `lint-config-writer` | eslint-plugin-tailwindcss config additions, `.stylelintrc.json`, `.gitignore` updates |
| F | `a11y-discovery-runner` | Scoped shadscan accessibility findings, written into the stage report as UNVERIFIED LEADS. Writes no project files. Non-blocking. |
| G | `branch-protection-writer` | `scripts/setup-branch-protection.sh` (executable) |
| H | (orchestrator direct) | Project rules file (CLAUDE.md / AGENTS.md) "CI/CD Operational Rules" section populated from `references/prd-ci-cd-checklist.md` |

**Lean tier changes per block** (pass `quality_tier: lean` to each agent; the block letters do not change):

| Block | Lean output |
|---|---|
| A | Playwright installed, `test:e2e` and `test:e2e:smoke` scripts, ONE `@smoke` spec over the app's main flow, a single-project `playwright.config.ts`. No `@feature` / `@regression-core` / `@visual` specs, no `tests/visual/baselines/`. Skipped when `framework-detector` returns skip-E2E. `check:design-system` only when a design system exists. |
| B | `.github/workflows/ci.yml` from the lean template (lint, typecheck, unit-tests, build, e2e-smoke), plus `design-system-compliance.yml` only when a design system exists. No `e2e.yml`, `e2e-coverage.yml` or `db-schema-drift.yml`. |
| C | `.husky/pre-push` from the lean template: the same lean set CI runs. |
| D | The PR template's lean checklist (no `@regression-core` or `@visual` rows). |
| E | Runs only when a design system exists; otherwise only the `.gitignore` additions are written. |
| F, H | Unchanged. |
| G | The script lists the lean required checks only. |

**Sub-block lettering is strictly sequential, and stays that way.** Blocks are labeled in execution order with no gaps, no suffixes, and no insertions like `E2` or `F-bis`. Inserting a block in the middle means relettering every block after it and updating every reference (this roster, the Subagent Roster table's `3<letter>` phase column, the review-pass rule, the Final Output Format, and the Completion Checklist). That renaming cost is deliberate: it keeps "which block runs when" readable straight off the letter.

**Past Z, the sequence continues `A2` through `Z2`, then `A3` through `Z3`, and so on.** The digit is a generation counter, never an insertion marker: `A2` means the twenty-seventh block, not "a second block wedged next to A". Never reach for a numbered suffix before Z is actually used.

After each sub-block that writes project files (A through E, and G), run a spec-compliance + code-quality review pass (reuse `sell-slice/agents/spec-reviewer.md` and `sell-slice/agents/quality-reviewer.md`). Fix findings before moving to the next sub-block. Sub-blocks F and H are exempt: F writes no project files, and H is a deterministic file write.

#### Sub-block F: Accessibility discovery pass (shadscan)

Runs immediately after the design-system compliance block (E), before G. Dispatch `a11y-discovery-runner`.

**This is discovery, not a gate.** It produces no score threshold, no CI check, no pre-push step, and no commit. Its entire output is a section in the stage report labeled UNVERIFIED LEADS. If it returns `status: skipped` or `failed`, log the reason and continue to G. It can never block the quality line.

The agent runs exactly two scoped commands (package-manager `dlx` equivalent substituted):

```bash
pnpm dlx @shadscan/cli --category accessibility --no-interactive --no-roast
```

```bash
pnpm dlx @shadscan/cli --category foundation --no-interactive --no-roast
```

**Only these two categories.** On the codebase this pass was calibrated against, `accessibility` and `foundation` carried nearly all the true signal: four genuine bugs that lint, typecheck, test, build, and E2E all missed. `states` scored 0 percent with every failure a false positive, `interaction` was about half product-opinion, and `forms` was mixed. Do not widen the scope.

**Library showcase route filtering is mandatory.** shadscan has no ignore, exclude, or rule-waiver mechanism; its `setup` subcommand only writes pre-commit hooks and does not configure scope. So the operator-only `/library` route scaffolded by `/set-display-case` gets scanned and scored as production code even though every entry there is a mockup by design. On the calibration run, 5 of 21 evidence rows pointed at `/library` entries. The agent discards every finding whose file path contains the library showcase route segment before reporting, and reports the discarded count so the drop is visible rather than silent. Pass the detected library route path to the agent as an input.

**Never run `--apply`.** It launches a coding agent against unfiltered findings, which at roughly a one-in-three false-positive rate would produce wrong changes. Never run `--fail-under`, and never run `shadscan setup`.

The reported score is recorded as context only. It is heavily penalized by deliberate architecture choices (not using shadcn, dark-theme-only with no theme toggle, no command menu) on top of the false-positive rate, so it is not a quality signal and must never become one. The permanent version of that rule lands in the project rules file via sub-block H.

*Future interface note:* shadscan ships an `mcp` subcommand exposing read-only `scan`, `list_projects`, and `explain_rule` tools over stdio. If a later slice wants an agent consuming findings directly instead of parsing CLI output, that is the better interface. Do not wire it here.

#### Sub-block H: Append CI/CD operational rules to the project rules file

The orchestrator (no subagent dispatch; this is a small, deterministic write similar to sub-block D's PR template):

1. Locate the project rules file. If `cook-pizzas` ran first, the file already exists at `CLAUDE.md` or `AGENTS.md` per Q12, with a placeholder section labeled "CI/CD Operational Rules" (marked as populated by `final-quality-check`) written by the `rules-assembler` agent.
2. If the placeholder is present, replace its body with the contents of `references/prd-ci-cd-checklist.md` (preserving the `- [ ]` task-list checkbox format verbatim: these are runtime gates the user and every agent walk on every PR, not one-time scaffold checks).
3. If the placeholder is absent (e.g. the project skipped `cook-pizzas` and ran `/final-quality-check` directly as an escape hatch), append a new section to the project rules file:
   ```markdown
   <!-- bytheslice: ci-cd-operational-rules-start -->
   ## CI/CD Operational Rules

   These rules govern how master-checklist updates, CI gates, and PR shape interact across every ByTheSlice run. They apply to every agent on every PR, not only to the one-time CI/CD scaffolding.

   <!-- contents of references/prd-ci-cd-checklist.md, verbatim -->
   <!-- bytheslice: ci-cd-operational-rules-end -->
   ```
4. **Idempotent re-runs.** If the section markers already exist, replace the body in place; never duplicate the section. User-edited content between the markers should be surfaced as a conflict via HITL `destructive_operation` rather than overwritten silently.
5. If neither `CLAUDE.md` nor `AGENTS.md` exists at the project root, create `CLAUDE.md` with just this section plus a one-line precedence header. Surface to the user that a fuller rules file should ideally be assembled by `/cook-pizzas`.
6. The reference file carries the **shadscan triage rules** (never gate on the score, treat every finding as a lead, the three confirmed false-positive classes, discard library-showcase paths). They travel into the project rules automatically as part of the verbatim copy, which is what makes them apply to every later slice and not just to this run.

### Phase 4: Local Verification Gates

Dispatch `local-gates-runner` to run lint, typecheck, design-system check, unit/integration, and all three E2E suites. The first run also generates initial visual baselines.

Under the lean tier it runs the lean set instead: lint, typecheck, `check:design-system` (only when a design system exists), unit tests, build, and `test:e2e:smoke`. No baselines are generated.

If any gate fails, fix on the same branch before proceeding. This one-time run covers the full local suite; afterwards the Husky `pre-push` hook enforces only the slice tier (gate tier 2: lint, typecheck, unit tests, build, DB tests when the schema or migrations change) on every push, and CI runs the full suite at each PR (tier 4). `--no-verify` is never the answer to a red hook.

### Phase 5: PR + CI/CD

Under ship-once, this whole phase is one local commit on the current branch; see "Ship-once delivery".

1. Push `chore/final-quality-check` to remote.
2. Open the PR via `git-commit-push-pr` / `new-branch-and-pr` skill if available; otherwise `gh pr create`. PR description must list every artifact created.
3. Wait for CI to complete. If any required check fails, patch on the same branch and push until green.
4. Once CI is green, merge.

### Phase 6: Closeout

Under ship-once, skip steps 1 to 4 (there is no merge or branch to clean up) and do steps 5 and 6.

1. After merge, update local `main`: `git checkout main && git pull --ff-only origin main`.
2. Delete the local branch: `git branch -d chore/final-quality-check`.
3. Delete the remote branch if not auto-deleted: `git push origin --delete chore/final-quality-check`.
4. Verify `git status` is clean on `main`.
5. Remind the user (once) to run `scripts/setup-branch-protection.sh` to enable required status checks on `main`.
6. Walk the **Completion Checklist** below and confirm every box is `[x]`.

## Final Output Format

After Phase 6, report:

1. Files created / updated (grouped: workflows, husky, pr template, scripts, tests, eslint/stylelint, package.json scripts).
2. The resolved quality tier and why (`auto` shows its feature-pie count and the payments finding), CI triggers, and required status checks.
3. Local verification commands and outcomes.
4. Confirmed presence of all scaffold artifacts (see checklist below).
5. PR URL and merged commit SHA (under ship-once: the local commit SHA and branch).
6. Recommended next E2E flows to add (handed to `sell-slice`).
7. Reminder: run `scripts/setup-branch-protection.sh` once to enable required status checks on `main`.
8. **Accessibility discovery pass (shadscan): UNVERIFIED LEADS.** A dedicated section carrying the sub-block F return verbatim: each lead's rule, file, line, shadscan's own evidence text, and its `known_fp_class` tag; the count of library-showcase findings discarded; and the reported score marked informational. Head the section with the standing caveat that nothing in it is verified and roughly one in three shadscan failures is a false positive or product-opinion. If the pass was skipped, say so and why. This section never affects whether the run is considered done.

## Hard Constraints

- **Never scaffold CI directly on `main` / `master`.** Use `chore/final-quality-check`, or the current non-`main` branch under ship-once.
- **Lean is smaller, never empty.** Lint, typecheck, unit tests and build run in CI at every tier, and lean keeps its one smoke spec in CI and in the pre-push hook wherever the app has a browser surface.
- **Under `run.unattended: true`, never wait on a human.** Take the safest working option, record it in the order ticket, and continue (see "Unattended runs").
- **Never weaken or remove existing workflows.** This skill adds; it does not subtract. If existing workflows conflict, surface to the user and stop.
- **Completion checklist is mandatory.** The scaffold is not "done" until every box is `[x]`.
- **Sub-skill contract.** When invoked as a `type: ci-cd` stage by `sell-slice`, this skill is the entire stage. After completion, mark the stage `Completed` in `docs/plans/00_master_checklist.md`.
- **shadscan is never a gate.** Never wire `--fail-under` into `.husky/pre-push` or any CI workflow, never run `shadscan setup` (it writes pre-commit hooks), and never add a shadscan step to `ci.yml`, `design-system-compliance.yml`, or the branch-protection required checks. The score is heavily penalized by deliberate architecture choices and by false positives; gating on it would block correct work.
- **Never run shadscan `--apply`.** It launches a coding agent against unfiltered findings, which at this false-positive rate would produce wrong changes.
- **Subagent prompts live in `./agents/*.md`.** This SKILL.md is workflow only; never inline subagent prompts here.
- **No platform-specific rule references.** Do not write "cursor rules" or "claude rules"; use "rules file (cursor or claude)" if the distinction matters, or simply "project rules file".

## Triggers

Follow this skill whenever the user:

- runs `/final-quality-check` (escape hatch)
- says "scaffold ci/cd", "set up CI", "bootstrap quality gates", "set up Playwright + GitHub Actions"
- has `sell-slice` reach a `type: ci-cd` stage in the master checklist (auto-dispatch)

If the repo already has the baseline, stop and recommend `/bytheslice:sell-slice` instead.

---

## Completion Checklist

Run this checklist at the end of every run. Do **not** consider the scaffold "done" until every box is `[x]`.

Sections 1 to 6 below describe the **standard tier** with the default PR delivery. Under the **lean tier**, walk "Lean tier rows" in place of sections 1 to 3; under **ship-once**, walk "Ship-once rows" in place of sections 4 to 6. Section 3.5 applies to every combination. An artifact or prompt skipped under `run.unattended: true` counts as checked once its line is in the order ticket's "Decisions made without you" section.

### Lean tier rows

- [ ] Resolved tier logged (and recorded in the order ticket when one exists).
- [ ] `.husky/pre-push` exists, is executable, and runs the lean set from the lean template (lint, typecheck, test, build, `test:e2e:smoke`, DB tests only when the schema or migrations change).
- [ ] `.github/pull_request_template.md` exists with the lean checklist.
- [ ] `.github/workflows/ci.yml` exists from the lean template (lint, typecheck, unit-tests, build, e2e-smoke).
- [ ] `.github/workflows/design-system-compliance.yml`, `.eslintrc.json` tailwindcss additions and `.stylelintrc.json` exist IF a design system exists, and are absent otherwise.
- [ ] No `e2e.yml`, `e2e-coverage.yml`, `db-schema-drift.yml`, `@regression-core` spec, `@visual` spec or `tests/visual/baselines/` was written.
- [ ] `package.json` has `test:e2e` and `test:e2e:smoke` (plus `check:design-system` when a design system exists).
- [ ] Exactly one `@smoke` spec exists and walks the app's main flow (skip when `framework-detector` returned skip-E2E, and say so).
- [ ] `scripts/setup-branch-protection.sh` exists, is executable, and lists the lean required checks.
- [ ] `.gitignore` excludes `playwright-report/`, `test-results/`, `.playwright/`.
- [ ] The rules-file "CI/CD Operational Rules" section and the no-shadscan-gate grep are done as in section 1.
- [ ] Local lean set green: lint, typecheck, `check:design-system` (if present), test, build, `test:e2e:smoke`.

### Ship-once rows

- [ ] All work happened on the current non-`main` branch (or a local `chore/final-quality-check` created because HEAD was on `main`).
- [ ] The scaffold is one local commit on that branch; nothing was pushed, no PR was opened, nothing was merged.
- [ ] The local gates ran every command the generated `ci.yml` and (standard tier) `e2e.yml` run, not a subset, and all passed.
- [ ] The branch-protection reminder is in the order ticket (or the chat when there is no ticket), for after the app's final PR merges.
- [ ] If invoked as a `type: ci-cd` stage, the master-checklist row is flipped to `Completed`.

### 1. Scaffold Artifacts Present

- [ ] `.husky/pre-push` exists, is executable, and runs the slice tier (lint, typecheck, test, build, DB tests only when the schema or migrations change), not the full CI chain. `check:design-system` and the e2e suites run in CI (tier 4).
- [ ] `.github/pull_request_template.md` exists with E2E attestation, design-system-compliance, and visual-diff checklist items.
- [ ] `.github/workflows/ci.yml` exists (full job order: typecheck → lint → design-system-compliance → unit tests → integration tests → @feature → @regression-core → @visual → db-schema-drift if applicable → build).
- [ ] `.github/workflows/design-system-compliance.yml` exists (regex sweep → eslint-plugin-tailwindcss → stylelint).
- [ ] `.github/workflows/e2e.yml` exists (`@feature` + `@regression-core` + `@visual` jobs with artifact upload on failure).
- [ ] `.github/workflows/e2e-coverage.yml` exists (path-diff job named `E2E / coverage-check`; blocks on unreviewed visual diffs).
- [ ] `.github/workflows/db-schema-drift.yml` exists IF project has DB, is absent if no DB detected.
- [ ] `scripts/setup-branch-protection.sh` exists and is executable (includes all new required checks).
- [ ] `.eslintrc.json` (or equivalent) has `eslint-plugin-tailwindcss` config additions.
- [ ] `.stylelintrc.json` exists with CSS-file token checks.
- [ ] `.gitignore` excludes `playwright-report/`, `test-results/`, `.playwright/`, and Vizzly diff artifacts.
- [ ] Project rules file (`CLAUDE.md` or `AGENTS.md`) has a "CI/CD Operational Rules" section populated verbatim from `references/prd-ci-cd-checklist.md`, delimited by the `<!-- bytheslice: ci-cd-operational-rules-{start,end} -->` markers, so every later stage skill picks up the runtime guardrails automatically.
- [ ] That same section carries the shadscan triage rules (score is never a gate, every finding is a lead, the three false-positive classes, discard library-showcase paths).
- [ ] No `--fail-under`, no `shadscan` step, and no `shadscan setup` hook appears anywhere in `.husky/pre-push`, `.github/workflows/*`, or `scripts/setup-branch-protection.sh`. Grep to confirm.

### 2. Test Suites and Scripts Present

- [ ] `package.json` (root) has scripts: `test:e2e`, `test:e2e:feature`, `test:e2e:regression`, `test:e2e:visual`, `check:design-system`.
- [ ] At least one `@feature`-tagged smoke spec exists.
- [ ] At least one `@regression-core`-tagged sentinel spec exists.
- [ ] Canary `@visual` tests exist, one per viewport (375 / 768 / 1280 / 1920).
- [ ] `tests/visual/baselines/` directory is committed (may be empty on first scaffold; Vizzly populates on first run).
- [ ] Playwright (or detected E2E framework) is installed and lockfile updated.
- [ ] If a monorepo task runner exists (`turbo.json` / `nx.json`), the new E2E tasks are wired into it.

### 3. Local Gates Green

- [ ] `pnpm lint` (or detected equivalent) passes.
- [ ] `pnpm typecheck` passes.
- [ ] `pnpm check:design-system` passes.
- [ ] `pnpm test` (unit/integration) passes.
- [ ] `pnpm test:e2e:feature` passes locally.
- [ ] `pnpm test:e2e:regression` passes locally.
- [ ] `pnpm test:e2e:visual` passes locally (baselines generated or confirmed up-to-date).
- [ ] Husky `pre-push` hook fires on push (verify with a dry-run or trial push).

### 3.5 Accessibility Discovery Pass (non-blocking)

Every box here is about the pass having *run and been reported honestly*. None of them is about the pass having *passed*, because there is nothing to pass.

- [ ] `a11y-discovery-runner` was dispatched after sub-block E, or its `skipped` status and reason are recorded.
- [ ] Exactly two scoped commands were run: `--category accessibility` and `--category foundation`. No unscoped run, no `states` / `interaction` / `forms`.
- [ ] `--apply` was never run. `--fail-under` was never run. `shadscan setup` was never run.
- [ ] Findings whose path contains the library showcase route were discarded, and the discarded count is stated in the report.
- [ ] The stage report has an "Accessibility discovery pass (shadscan): UNVERIFIED LEADS" section, with each lead carrying shadscan's own evidence text and a `known_fp_class` tag.
- [ ] The reported score appears only as informational context, never compared against a threshold.
- [ ] No shadscan finding was auto-fixed, and no shadscan finding blocked the run.

### 4. PR Created and Submitted

- [ ] All work happened on branch `chore/final-quality-check`, never on `main`.
- [ ] PR opened via `git-commit-push-pr` / `new-branch-and-pr` skill or `gh pr create`.
- [ ] PR description lists every artifact created.
- [ ] PR is targeted at `main` and is **not** draft.

### 5. CI/CD Passing on the PR

- [ ] All required GitHub Actions checks have completed (no `pending` / `queued`).
- [ ] Every required check is green. No skipped checks counted as passing.
- [ ] If any check failed: read failing job logs, patch on `chore/final-quality-check`, push, repeat until all checks pass.
- [ ] Final CI run reflects the latest commit on the PR head, not a stale SHA.

### 6. Branch Cleanup and Return to Main

Only after CI is fully green and the PR is merged.

- [ ] PR merged into `main`.
- [ ] Local `main` updated: `git checkout main && git pull --ff-only origin main`.
- [ ] Confirm scaffold commits are present on `main` (`git log --oneline | head`).
- [ ] Local `chore/final-quality-check` branch deleted: `git branch -d chore/final-quality-check`.
- [ ] Remote `chore/final-quality-check` deleted: `git push origin --delete chore/final-quality-check` (skip if auto-deleted).
- [ ] If a worktree was used: `git worktree remove <path>` and `git worktree prune`.
- [ ] Final `git status` shows clean tree on `main`.
- [ ] User reminded once to run `scripts/setup-branch-protection.sh`.
- [ ] If invoked as a `type: ci-cd` stage by `sell-slice`, `docs/plans/00_master_checklist.md` row flipped to `Completed`.

### Done Criteria

The scaffold is delivered **only** when (under ship-once, items 2 to 4 read: committed on the current branch with the local gates green):

1. Every section that applies to the resolved tier and delivery mode is fully checked.
2. The orchestrator is back on `main` with a clean working tree.
3. All scaffold artifacts are present and committed on `main`.
4. CI passed on the merged PR head SHA.
