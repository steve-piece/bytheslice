# Project Rules

<!-- bytheslice:feature-intake:start -->
## Feature intake (ByTheSlice, enforced)

New work in this project goes through the ByTheSlice framework. These rules hold for every request, including work that arrives through `/goal`, `/loop`, a scheduled run or another skill.

1. **Document first.** Any new feature, requirement, or fix that touches more than one file is first documented with `/special-order`, which writes the pie, its slices, the stage files and the checklist rows. Never hand-write `docs/plans/stage_*.md`, and never add or rename pie or slice headings in `docs/plans/00_master_checklist.md`.
2. **Build through the bakers.** A documented slice is implemented only through `/sell-slice` (one careful slice) or `/sell-pie` (a whole pie), never through ad-hoc Agent fan-out.
3. **Verify before the PR.** No PR for slice work without a `slice-verifier` pass in the Pass ledger (`.bytheslice/ledger.jsonl`); `/box-it-up` opens the pie PR.
4. **Small fixes stay small.** A fix inside one file may be made directly.

The workflow guard hook enforces rules 1 to 3 (`"enforcement": "block"`, the default, in `bytheslice.config.json`). Only the operator loosens it, by setting `"enforcement": "warn"` by hand or relaunching with `BTS_ALLOW_BYPASS=1`. An agent never sets either.
<!-- bytheslice:feature-intake:end -->
