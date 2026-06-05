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

[ ] Run the `final-quality-check` skill in full.

The skill's `SKILL.md` (Phases 0–6) is the source of truth for the work. Its completion checklist (embedded in `final-quality-check/SKILL.md`) is the source of truth for "done".

Additional CI jobs to add beyond the base scaffold:
[ ] `design-system-compliance` job — validates no component uses hard-coded color values outside the token system
[ ] `db-schema-drift` job — validates schema source matches applied migrations (only if Stage 4 is in scope)
[ ] `visual` job — runs Playwright visual regression at 375 / 768 / 1280 / 1920 viewports

**Commit:** delegated to final-quality-check skill (conventional commits per task within that skill)

---

**Exit criteria:**
- Every completion criterion in `final-quality-check` skill is satisfied
- `design-system-compliance` CI job added and green on the branch
- PR template present and references stage plans
- Branch protection configured on `main`
