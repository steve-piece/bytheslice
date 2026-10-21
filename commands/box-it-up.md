<!-- commands/box-it-up.md -->
<!-- Slash command that loads the box-it-up skill: the pie-level closeout, re-scoped for v5. Two call shapes: per slice (--slice, called by /sell-pie's loop) it commits + pushes only, no PR so CI stays quiet; at the pie boundary it opens one PR "Pie N", watches CI's single run (auto-fix loop on red), takes the merge-approval HITL, merges preserving every per-slice commit (never squash), syncs main, deletes the branch, and removes the pie worktree. Pizza-shop framing: the pie cooled slice by slice, box it and hand it over. -->

---
description: Box the pie and hand it across the counter. Two call shapes. Per slice (/box-it-up --slice, how /sell-pie's loop calls it after each slice clears its gates) it commits the slice on the pie branch and pushes; no PR is opened, so CI stays quiet. At the pie boundary (the default, when every slice in the active Pie is [x]) it runs pre-flight safety checks, opens one PR "Pie N" against main (or reuses an existing open PR), watches CI's single run for the pie (dispatching ci-fix-attempter to push targeted fixes on red, capped at 3 attempts), pauses for your merge approval, merges preserving every per-slice commit (rebase preferred, merge commit fallback, never squash), syncs main fast-forward-only, deletes the local + remote branch, and removes the pie worktree. A hand-rolled branch with no checklist ships through the same closeout (universal mode, project-default merge strategy). Use when the user runs /box-it-up, says "box up the pie", "close out the pie", "ship the pr", or "ship this branch", or when /sell-pie hands off at the boundary.
---

# /box-it-up

Load and follow the [`box-it-up`](../skills/box-it-up/SKILL.md) skill.

In v5 a **Pie** (a coherent chapter of 3 to 8 slices) is the unit of PR, CI, and review, and `/box-it-up` carries both halves of the pie's git lifecycle. It stays a **separate** skill so you can review the whole pie locally, run a manual visual UAT, or rebase against fresh main before deciding to ship the boundary PR.

The skill resolves one of four modes, then runs it:

1. **Mode detection.** `--slice` selects per-slice mode (how `/sell-pie`'s loop calls it). The default is pie-completion, detected when the current branch maps to a `pie-<n>-<scope>` checklist row and every `### Slice N.M` under it is `[x]`; boxing a pie with unfinished slices is refused (HITL, never a silent partial ship). A branch with no checklist mapping gets the universal closeout instead.
2. **Per-slice mode (commit + push only).** Makes the slice's final commit on the pie branch (its task commits are already pushed, one per `### Task K`) using the v5 convention (`feat(pie-N): N.M` plus the slice name; fix/chore/docs when the diff says so, closing-narrative paragraph included for UI slices) and pushes. **No PR is opened, so CI does not fire.** Returns immediately so the loop advances to the next slice.
3. **Pre-flight safety checks (boundary).** Not on `main`, worktree state captured, no accidental reuse of an already-merged branch, existing open PR detected for reuse, `gh` authenticated, pie completeness confirmed.
4. **One PR, one CI run.** Opens the PR titled `Pie N: <name>` with a body lifted from the accumulated slice commits (or reuses the existing PR), then watches CI settle. On red, dispatches the `ci-fix-attempter` subagent, which returns `files_changed` and a proposed commit message; the skill stages those paths selectively, commits and pushes. Capped at 3 rounds per PR (and 30 minutes of watching per round) before bubbling HITL. The CI cap is separate from the 3 local fix loops per slice, and no run instruction ("continue until CI is green", "never stop", "fully automated") raises it; only your explicit reply at the HITL does.
5. **Merge authorization gate.** When CI is green you pick: approve and merge now, hold for manual review (merge via the GitHub UI when ready, then re-run `/box-it-up --resume` for cleanup), or cancel. The merge **preserves every per-slice commit**: rebase preferred, merge commit as fallback, never squash for a pie (a squash-only repo bubbles HITL instead of silently collapsing the history).
6. **Cleanup + report.** The Pie's checklist flip to Completed is committed on the pie branch before the PR opens, so it reaches `main` with the merge. After the merge, every cleanup step runs from the primary checkout: `pull --ff-only`, `worktree remove` (the worktree was created upstream by `/sell-pie`, never here), `branch -d`, remote branch delete, `worktree prune`. Then it confirms a clean tree fully synced with `origin/main`, and reports PR URL, merge strategy + SHA, preserved slice-commit count, and CI attempt count.

7. **Merge-per-slice closeout** (`--merge-slice`, opt-in). Run internally by the `/sell-pie` or `/sell-slice` conductor when `delivery.mode` resolves to `merge-per-slice`, never for a `review: continuous` pie. One PR `Slice N.M: <name>` per slice, CI, up to 3 `ci-fix-attempter` rounds (still red halts the loop; a slice is never skipped or merged red), a merge commit on green with no human merge gate, and the same primary-checkout cleanup. The kitchen merge record is written once, after the pie's last slice.

A pie with a slice still `waiting until <YYYY-MM-DD>` (a calendar-gated criterion) is not complete, so boxing it is refused with the date.

## Preconditions

The skill checks these inline at the start and raises a failed one as a question, never a refusal.

- Working tree on a feature branch (not `main` / `master`); for a v5 pie, `pie-<n>-<scope>`. On `main`, the skill says so and asks; the merge-per-slice closeout runs from `main` by design.
- **Per-slice mode:** the slice's changes are committed locally or present as uncommitted changes the skill should commit. `gh` is not required (no PR work).
- **Pie-completion / universal mode:** `gh` CLI installed and authenticated, and the repository has an `origin` remote.

## When to use this command

- **Per slice, you rarely type it yourself:** `/sell-pie`'s loop invokes `/box-it-up --slice` after each slice clears its gates. Invoking it standalone mid-pie ("box up the slice") is fine and does the same commit + push.
- **At the pie boundary,** when every slice in the active Pie is `[x]` and you've reviewed the pie locally (whether `/sell-pie` baked it or repeated `/sell-slice` runs did).
- **For any hand-rolled feature branch** that never touched the ByTheSlice delivery loop: the pre-flight checks and closeout pattern are universal.

If you want the boundary PR open but paused for an external code review, pick the **Hold** option at the merge-authorization gate. The skill exits with the PR open; merge it via the GitHub UI when ready, then re-run `/box-it-up --resume` to finish cleanup.
