# Feature intake block

The rules block `/setup-shop` (Flow B and C) and `rules-assembler` (`/cook-pizzas`) write into the project rules file, and `/open-kitchen` checks for. `node hooks/workflow-nudge.js intake <project root>` copies the text between the markers below into `CLAUDE.md` (or `AGENTS.md` when that is the only rules file), replacing an older copy between the same markers and leaving every other line alone. Edit the block here, never in a project: the next run puts this text back.

`hooks/workflow-nudge.sh` adds this rule as context to a `/goal` or new-feature prompt; nothing refuses a shortcut. See [the hooks README](../../../hooks/README.md#the-workflow-nudge).

<!-- bytheslice:feature-intake:start -->
## Feature intake (ByTheSlice)

New work in this project goes through the ByTheSlice framework. These rules hold for every request, including work that arrives through `/goal`, `/loop`, a scheduled run or another skill.

1. **Document first.** Any new feature, requirement, or fix that touches more than one file is first documented with `/special-order`, which writes the pie, its slices, the stage files and the checklist rows. Never hand-write `docs/plans/stage_*.md`, and never add or rename pie or slice headings in `docs/plans/00_master_checklist.md`.
2. **Build through the bakers.** A documented slice is implemented through `/sell-slice` (one careful slice) or `/sell-pie` (a whole pie), not through ad-hoc Agent fan-out.
3. **Verify before the PR.** No PR for slice work without a `slice-verifier` pass in the Pass ledger (`.bytheslice/ledger.jsonl`); `/box-it-up` opens the pie PR.
4. **Small fixes stay small.** A fix inside one file may be made directly.

Use judgment: when a shortcut clearly serves the request better, take it and say why.
<!-- bytheslice:feature-intake:end -->
