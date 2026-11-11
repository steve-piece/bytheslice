# Project Rules

<!-- bytheslice:feature-intake:start -->
## Feature intake (ByTheSlice)

New features in this project go through the ByTheSlice framework, including ones that arrive through `/goal`, `/loop`, a scheduled run or another skill.

1. **Document new features first.** A new feature or requirement is first documented with `/special-order`, which writes the pie, its slices, the stage files and the checklist rows. Never hand-write `docs/plans/stage_*.md`, and never add or rename pie or slice headings in `docs/plans/00_master_checklist.md`.
2. **Build slices through the bakers.** A slice already in the checklist is built through `/sell-slice` (one careful slice) or `/sell-pie` (a whole pie), so it gets the implementer, tester and verifier passes.
3. **Verify before the PR.** No PR for slice work without a `slice-verifier` pass in the Pass ledger (`.bytheslice/ledger.jsonl`); `/box-it-up` opens the pie PR.
4. **Enabled quality gates are binding.** When a gate this project runs fails (lint, typecheck, tests, build, e2e, design-system checks, accessibility including WCAG AA contrast, or anything CI or the pre-push hook runs), fix the code until it passes, even when the cause is a shared design token or a file the work only consumes. Never hand a failing gate to the operator as a decision, a follow-up or "out of scope". Escalate only a fix that is destructive or needs a secret, or a fix cap that ran out; a gate class listed in `gates.advisory` in `bytheslice.config.json` is reported instead of fixed.
5. **Everything else stays light.** Bug fixes of any size, refactors, research, review, debugging and one-off tasks need no special order: do them directly or with plain agents (general-purpose, Explore).

Use judgment: when a shortcut clearly serves the request better, take it and say why. Leaving a failing enabled gate unfixed is never one of those shortcuts.
<!-- bytheslice:feature-intake:end -->
