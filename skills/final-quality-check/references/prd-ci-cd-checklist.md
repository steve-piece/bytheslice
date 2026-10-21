# PRD CI/CD Checklist (Required)

These rules govern how master-checklist updates, CI gates, and PR shape interact across every ByTheSlice run. The orchestrator surfaces these as guardrails to every stage skill that touches CI workflows or the master checklist; final-quality-check itself enforces them when scaffolding the baseline.

- [ ] Before any phased-plan integration run, update `docs/plans/00_master_checklist.md` with current stage status and exact in-scope checklist items.

- [ ] After any phased-plan integration run, immediately update `docs/plans/00_master_checklist.md` with completion status, notes, and verification outcomes.

- [ ] CI must gate merges on: lint, typecheck, unit/integration tests, `@feature` E2E, `@regression-core` E2E, `@visual` E2E, design-system-compliance, and (if applicable) db-schema-drift.

- [ ] Do not mark checklist items complete until that slice's local gates are green: tier 2 (its own tests, build, DB tests when the schema or migrations changed) at every commit, and tier 3 (`slice-verifier`, the full local suite, once at slice end). CI (tier 4) gates the PR: the pie PR by default, the slice PR in merge-per-slice mode.

- [ ] Expand CI/E2E coverage when shared routes, components, schemas, or APIs are modified; include both changed-flow and regression-core tests.

- [ ] Preserve deterministic pipelines: pinned runtime/package manager, reproducible install command, and explicit test commands in workflow steps.

- [ ] Upload failure artifacts (trace/video/report/logs) for all E2E failures and treat missing artifacts as a failed run.

- [ ] Any CI/CD extension must keep CI as the full suite and the local `pre-push` hook as the slice tier (lint, typecheck, unit tests, build, DB tests when the schema or migrations change), with every required check documented in repository workflow files. Never bypass the hook with `--no-verify`; a red hook is fixed, not skipped.

- [ ] Keep one scoped checklist slice per PR whenever possible; avoid bundling unrelated stage tasks in one delivery.

- [ ] If stage file instructions conflict with checklist status, stop and clarify scope before implementation.

- [ ] Never wire shadscan into a gate: no `--fail-under` in `.husky/pre-push`, no shadscan step in any CI workflow, no shadscan check in branch protection, and never run `shadscan setup` (its only effect is writing pre-commit hooks). The score is heavily penalized by deliberate architecture choices (not using shadcn, dark-theme-only with no theme toggle, no command menu) and by a false-positive rate around one in three, so gating on it would block correct work.

- [ ] Never run shadscan `--apply`. It launches a coding agent against unfiltered findings, which at this false-positive rate would produce wrong changes.

- [ ] Treat every shadscan finding as a lead to verify against source, never as fact. Discard any finding whose file path is inside the operator-only `/library` showcase route before acting on it: those entries are mockups by design, and shadscan has no ignore, exclude, or rule-waiver mechanism, so it scans and scores them as production code.

## shadscan false-positive classes (confirmed)

Three failure modes are confirmed and reproducible. When a finding matches one of these, the burden of proof is on the finding, not on the code.

**Dependency sniffing.** The rule's real pass condition is a `package.json` lookup. It fails "toast provider present" when `sonner` or Radix Toast is absent from dependencies, even with a working hand-rolled provider mounted in the app shell. Its own evidence admitted the provider was mounted, then failed the rule anyway.

**Named-helper indirection.** It cannot follow a guard extracted into a named function. It reported a missing typing-target guard on a global hotkey when that exact guard existed as an `isTypingTarget()` helper called one line above.

**Unresolved components.** When it cannot resolve a custom component it gives up and reports failure. It failed "async action pending state" on a component using `useTransition` and `disabled={pending}`, with evidence literally reading "could not be resolved".

Evidence that contradicts its own verdict is the strongest tell. Read the cited file before changing anything.
