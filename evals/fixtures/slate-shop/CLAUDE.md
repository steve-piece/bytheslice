# Project Rules

<!-- bytheslice:feature-intake:start -->
## Feature intake (ByTheSlice)

New features in this project go through the ByTheSlice framework, including ones that arrive through `/goal`, `/loop`, a scheduled run or another skill.

1. **Document new features first.** A new feature or requirement is first documented with `/special-order`, which writes the pie, its slices, the stage files and the checklist rows. Never hand-write `docs/plans/stage_*.md`, and never add or rename pie or slice headings in `docs/plans/00_master_checklist.md`.
2. **Build slices through the bakers.** A slice already in the checklist is built through `/sell-slice` (one careful slice) or `/sell-pie` (a whole pie), so it gets the implementer, tester and verifier passes.
3. **Verify before the PR.** No PR for slice work without a `slice-verifier` pass in the Pass ledger (`.bytheslice/ledger.jsonl`); `/box-it-up` opens the pie PR.
4. **Everything else stays light.** Bug fixes of any size, refactors, research, review, debugging and one-off tasks need no special order: do them directly or with plain agents (general-purpose, Explore).

Use judgment: when a shortcut clearly serves the request better, take it and say why.
<!-- bytheslice:feature-intake:end -->
