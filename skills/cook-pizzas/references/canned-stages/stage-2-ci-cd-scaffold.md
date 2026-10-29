---
stage: 2
name: "CI/CD Scaffold"
type: ci-cd
slice: horizontal
mvp: true
depends_on: [1]
estimated_tasks: 1
hitl_required: false
hitl_reason: null
linear_milestone: null
completion_criteria:
  - tests_passing
  - ci_workflow_green_on_main
  - e2e_suite_passing
  - branch_protection_configured
---

<!-- docs/plans/stage_2_ci_cd_scaffold.md -->
<!-- Stage 2: bootstrap CI/CD + E2E baseline via final-quality-check skill -->

# Stage 2 — CI/CD Scaffold

**Goal:** Bootstrap CI/CD + E2E baseline before any feature work begins.

**Architecture:** This stage delegates entirely to the `final-quality-check` skill. It establishes Playwright suites (`@feature`, `@regression-core`), GitHub Actions workflows (`ci.yml`, `e2e.yml`), Husky `pre-push`, PR template, and branch-protection setup. Every later stage depends on this baseline.

**Lean variant (`quality.tier: lean`, or `auto` resolving to lean).** `final-quality-check` installs a line sized for a small app instead: Playwright with ONE `@smoke` spec over the app's main flow (`test:e2e:smoke`), a `ci.yml` running lint, typecheck, unit tests, build and the smoke spec, a husky `pre-push` running the same set, the lean PR template, and the branch-protection script listing the lean required checks. No `e2e.yml`, `e2e-coverage.yml`, `db-schema-drift.yml`, `@feature` / `@regression-core` / `@visual` suite or visual baselines. `design-system-compliance.yml` (and its lint additions) only when Stage 1 produced a design system. `final-quality-check`'s "Quality tier" section is the source of truth for how `auto` resolves.

**Ship-once delivery (`delivery.mode: ship-once`, set by `/pizza-party`).** The scaffold gets no PR of its own: it is one local commit on the current branch and travels with the app's one ship PR. The local gates run every command the generated CI workflows run (`ci.yml`, then `e2e.yml` at the standard tier, and any other generated pull-request workflow), so a green local run is the gate here; CI first runs on the ship PR. Branch protection is recorded as a reminder for after that PR merges. Under `run.unattended: true` nothing in this stage waits on a human; every choice made in the operator's place is a line in the order ticket.

**Architecture note (project-specific):** [project-specific — from Q8 and Q11]
- Architecture variant: single-app | monorepo (from Q8)
- Deployment target: Vercel | AWS | other (from Q11)
- Monorepo-specific: Turborepo pipeline config, workspace-aware test scripts

**Tech stack:**
- Playwright
- GitHub Actions
- Husky
- `gh` CLI
- [Turborepo pipeline — if monorepo]

**Dependencies from prior stages:**
- Stage 1 (design-system-gate): design-system-compliance CI check is added here

---

## Tasks

### Task 1: Run final-quality-check skill end-to-end

This stage's task list is not duplicated here. The single task is:

- [ ] Run the `final-quality-check` skill in full.

The skill's `SKILL.md` (Phases 0–6) is the source of truth for the work. Its completion checklist (embedded in `final-quality-check/SKILL.md`) is the source of truth for "done".

Additional CI jobs to add beyond the base scaffold:
- [ ] `design-system-compliance` job — validates no component uses hard-coded color values outside the token system
- [ ] `db-schema-drift` job — validates schema source matches applied migrations (only if Stage 4 is in scope)
- [ ] `visual` job — runs Playwright visual regression at 375 / 768 / 1280 / 1920 viewports

Under the lean variant, add none of these: the `design-system-compliance` job is part of the lean `ci.yml` only when a design system exists, and there is no `db-schema-drift` or `visual` job.

**Commit:** delegated to final-quality-check skill (conventional commits per task within that skill)

---

**Exit criteria:**
- Every completion criterion in `final-quality-check` skill is satisfied
- `design-system-compliance` CI job added, and green on the `final-quality-check` PR (CI runs it at the PR, gate tier 4)
- `.husky/pre-push` runs the slice tier (gate tier 2), not the full CI chain
- PR template present and references stage plans
- Branch protection configured on `main`

**Exit criteria (lean or ship-once variant, in place of the matching lines above):**
- Lean: `ci.yml` runs lint, typecheck, unit tests, build and `test:e2e:smoke`; exactly one `@smoke` spec exists; `.husky/pre-push` runs that same set; `design-system-compliance.yml` exists only if a design system does; none of `e2e.yml`, `e2e-coverage.yml`, `db-schema-drift.yml` was written
- Ship-once: the scaffold is one local commit (nothing pushed, no PR); every generated CI workflow's commands ran locally and are green; the branch-protection reminder is recorded for after the ship PR merges
