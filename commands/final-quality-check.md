<!-- commands/final-quality-check.md -->
<!-- Slash command that loads the final-quality-check skill. Daily-prep skill; run before /sell-slice. Also invocable standalone on any project. -->

---
description: Install the quality line every pie passes through before going on display. Wires the production-grade CI/CD + E2E + design-system-compliance + visual-regression baseline on a dedicated chore branch. Run once before /sell-slice (part of the foundation prep phase); also invocable standalone to add CI to any project, or to repair/re-scaffold a drifted baseline. Use when the user says "install the quality line", "scaffold ci/cd", "set up CI", or "bootstrap quality gates".
---

# /final-quality-check

Load and follow the [`final-quality-check`](../skills/final-quality-check/SKILL.md) skill.

**Sub-skill of `/bytheslice:sell-slice`.** This skill is normally dispatched automatically when `sell-slice` encounters a `type: ci-cd` stage. Run it directly only when you need to re-scaffold or repair the CI/CD baseline outside the normal stage loop.

The skill bootstraps the CI/CD and E2E baseline that every later feature slice depends on:

1. Creates a dedicated `chore/final-quality-check` branch.
2. Installs and configures Playwright with `@feature`, `@regression-core`, and `@visual` tag suites.
3. Writes GitHub Actions workflows: `ci.yml`, `e2e.yml`, `e2e-coverage.yml`, `design-system-compliance.yml`, and (conditional) `db-schema-drift.yml`.
4. Configures Husky pre-push hooks and a PR template.
5. Writes ESLint + Stylelint config additions for design-system enforcement.
6. Runs a scoped, non-blocking shadscan accessibility discovery pass and reports its findings as unverified leads. Never a gate, never auto-fixed.
7. Provides a branch-protection setup script.
8. Opens a PR to `main` and verifies all checks pass before returning.

## Preconditions

- Working tree is clean on `main`.
- `gh` CLI is installed and authenticated.
- Stage 1 (design system gate) is complete (sell-slice handles ordering automatically).

## When to use this command

Use `/final-quality-check` directly as an escape hatch — for example, when CI has drifted and you want to re-establish the baseline outside the normal phased flow. The everyday entry point is `/bytheslice:sell-slice`, which runs this sub-skill automatically when the next pending stage has `type: ci-cd`. This skill writes infrastructure, not product code.
