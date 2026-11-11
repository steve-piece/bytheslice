# Other sessions on the same pie (the collision check)

Two chats can bake the same pie without knowing about each other: the checklist each worktree reads is cut from `main`, so a slice built on an unmerged branch, sitting in an open PR, or claimed by a chat that went quiet still reads "Not Started". A start therefore checks for other work before it cuts a branch or writes code. `/sell-pie` and `/sell-slice` both run this check; it is the same rule in both.

## The check

Run it in the preflight, after `git fetch --prune origin` (remote branches are only as fresh as the last fetch) and **before** cutting any branch or worktree:

1. Call `bts_claim { pie, slice, goal }` with the slice about to start (leave `slice` out to claim the whole pie at a `/sell-pie` start) and a one-line `goal` saying what this run is about to do. It lists every other piece of work on it and records the claim in the shared ledger; with other work there it records only a **contested** claim, which states intent and counts as nobody's claim, so a mistaken start never stands against the rightful holder.
2. Without the Pass mod (`bts_claim` is not listed), check by hand: `git branch -a --list '*pie-<n>-*'`, `git log --oneline --branches --remotes --not origin/main --grep='(pie-<n>):'`, `gh pr list --state open --search 'Pie <n>'`, and `git worktree list`.

## What counts as other work

- **Another session's claim or ledger rows** for the pie or slice (the ledger is shared by every worktree of the project). Reported `live`, `stale` (running, no activity for 6 hours), `idle` (no running session seen; its chat may still be open) or `ended`. A stale or ended claim is never silently overridden and never silently honored: it is listed for the operator to decide.
- **Commits on another branch**, local or remote, whose subjects name the slice (`feat(pie-N): N.M ...`) and are not on the default branch, or a `pie-N-*` branch checked out in another worktree (its uncommitted files are counted).
- **An open PR** for the pie or the slice (title `Pie N` or `Slice N.M`, or a `pie-N-*` head branch), read through `gh` when it is available.
- **A delivery-mode mismatch:** `delivery.mode: "merge-per-slice"` while this run, or another run on the pie, is on one pie branch.

Work already on the default branch, work released as `deferred` or `abandoned`, and work a later approved claim took over (its ledger rows, branch commits from before the takeover, worktree and PR) do not count. Work on another slice's own branch (`pie-N-sN.M-*`) counts only when that slice is checked, and a `/sell-slice` run is checked for its own slice. Another session's work on **this** run's own branch, once that session is no longer live, is a handoff: it is listed, and the run continues from it.

## When there is other work

Do not cut a branch, create a worktree or write code. Raise a blocking `destructive_operation` HITL through `bts_hitl` whose context carries the facts `bts_claim` listed (session, branch, worktree, commits, PR, last activity, goal), ask the operator in chat with a recommended answer (usually: continue on the existing branch or PR rather than rebuild), and stop. Duplicated work is what this prevents: two branches that each apply their own migrations to a shared database. An unattended run defers the slice instead, with the facts in its blocker.

After the operator answers:

- **Go ahead anyway:** call `bts_claim { pie, slice, over: true }`. That records the claim for real, with the takeover, so every other session stops seeing the old work as live.
- **Stop, or continue the other work:** call `bts_claim { pie, slice, release: "abandoned" }` for this run's claim, then follow the operator's direction.

## Checked again at the first write

A session that resumes from a plain message, without a new `/sell-pie` or `/sell-slice`, is checked before its first file write or commit (then at most every 30 minutes). The facts come back with that tool's result: stop and raise the same HITL before writing more. A session that holds the slice and already has work on it is the one building, and is not stopped by its own check.

## Seeing the whole project

`bts_board` lists every open pie and slice across every chat, worktree and branch: its state (`queued`, `claimed`, `building`, `built, unmerged`, `in review`, `merged`), who holds it, uncommitted and unpushed work, the open PR, last activity and the claim goal. It is derived on each read, so nobody maintains it. The Pass pane shows the active pie's slices held elsewhere under **Board**.

## Letting go

A slice the Pass sees flip to `[x]` releases its claim as `done` automatically (its work stays visible to others until it reaches the default branch). Release by hand with `bts_claim { pie, slice, release: "deferred" }` when a slice is deferred, and `"abandoned"` when a run stops for good.
