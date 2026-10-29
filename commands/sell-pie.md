<!-- commands/sell-pie.md -->
<!-- Slash command that loads the sell-pie skill: the v5 forefront autonomous baker. Pizza-shop framing: pull one whole Pie (a chapter of usually 3 to 8 slices) off the rack and run it through the line slice by slice, hands-off, until it's boxed and ready for review. The everyday single-slice tool is /sell-slice; the end-to-end chainer is /pizza-party. -->

---
description: Bake a whole Pie autonomously, the v5 forefront delivery loop. Reads the nested master checklist, picks the active Pie (a coherent chapter, usually 3 to 8 slices), and drives every slice to "ready for review" without per-slice prompting via a /loop; each slice runs the context-separated build→test→verify→fix Workflow (the tester sees only the build manifest + Exit criteria, never the builder's reasoning), commits + pushes (no PR, CI stays quiet), and advances; when every slice is [x] it stops at the pie boundary and opens one PR "Pie N" via /box-it-up (CI runs once, merge preserves per-slice commits). Opt-in ship-once delivery (set by /pizza-party) instead merges each pie into a local ship branch on local gates and ships one PR after the last pie. Refuses a flat v4 checklist (points you at /cook-pizzas --repie). A continuous-review pie (review=continuous) runs each slice through high-touch /sell-slice instead (except under ship-once). The four blocking HITL categories halt the loop. Use when the user runs /sell-pie, says "sell a pie", "bake the pie", "run the next pie", or wants one whole chapter delivered hands-off. For one careful slice use /sell-slice; for the whole app end to end use /pizza-party.
---

# /sell-pie

Load and follow the [`sell-pie`](../skills/sell-pie/SKILL.md) skill.

`sell-pie` is the **forefront** delivery command in ByTheSlice v5. Where `/sell-slice` delivers one careful slice with human gates, `/sell-pie` **bakes a whole Pie autonomously** — a `/loop`-driven baker that drives every slice of one chapter to "ready for review" hands-off, then stops at the pie boundary.

The skill drives one pie end-to-end:

1. **Set up the loop**: read the nested master checklist, pick the active Pie, read its `review:` mode and the delivery mode, confirm prior pies merged, set the pie-completion `/goal`, cut the pie branch + worktree (default mode) or stay on `main` and cut one worktree per slice (merge-per-slice mode).
2. **Loop the slices** (autonomous, `review: boundary`) — `/loop` wakes once per slice; each runs a context-separated `Workflow`:
   - **approvals** the slice needs go out as one batch of short questions, each with a recommended answer (the Library Preview gate stays its own stop);
   - **builder** writes the slice + unit tests, runs gate tiers 1 and 2 (quick checks while coding; the slice's own tests and build before each task commit), and emits the **build manifest**;
   - **slice-tester** independently verifies behavior — receiving **only** the manifest + Exit criteria + design-system path, never the builder's reasoning, so it cannot rationalize the builder's choices;
   - **slice-verifier** runs the full local suite once (tier 3) + the manifest under-declaration backstop; after a fix it re-runs only the gates that fix could change, listed in `rerun`;
   - **fixer** applies the smallest off-context fix on failure: at most 3 local fix loops per slice, and separately 3 CI fix rounds per PR. No run instruction ("continue until verified", "never stop", "fully automated") raises either cap; on exhaustion the loop halts with a HITL and only your explicit reply there grants more.
   Each `### Task K` is committed and pushed at its boundary (`feat(pie-N): N.M task K <name>`); the slice closes with `feat(pie-N): N.M <name>` via `/box-it-up --slice`, **no PR, so CI stays quiet**, and the loop advances. Only the conductor stages, commits and pushes; agents return `files_changed`.
   - A slice whose only unmet criterion is date-gated is left `waiting until <YYYY-MM-DD>`, skipped with its dependents, and closed by the next run on or after the date.
   - Each slice has a soft time budget (`delivery.sliceBudgetHours`, default 3); when it runs out the loop lets the current agent finish and asks once: extend or stop.
3. **Continuous mode** (`review: continuous`) — for sensitive pies (Payments, Auth, real-data migrations), drive each slice through high-touch `/sell-slice` instead of the autonomous Workflow.
4. **Merge-per-slice mode** (opt-in: an explicit autonomous-delivery run instruction, or `delivery.mode: "merge-per-slice"`; never for a `review: continuous` pie): each slice gets branch `pie-N-sN.M-<scope>` in its own worktree cut from fresh `origin/main`, its own PR `Slice N.M: <name>`, up to 3 CI fix rounds, and a merge commit on green with no per-slice approval; cleanup runs from the primary checkout and the next slice starts from the fresh `main`. You get one notice when the pie finishes, in place of the boundary step below.
5. **Ship-once mode** (opt-in: `delivery.mode: "ship-once"`, which `/pizza-party` sets): one long-lived local ship branch (`delivery.shipBranch`, default `ship/<repo dir name>`) is cut once from fresh `origin/main`, and each pie branch is cut from it. Slices commit with **no push**, and every gate is local (the slice-verifier's full local suite). At the boundary, `/box-it-up --pie-local` re-runs the full local check (up to 3 fix rounds), merges the pie into the ship branch with `git merge --no-ff`, and removes the pie worktree and branch, with no PR and no human gate. A `review: continuous` pie bakes hands-off here too. After the last pie, `/box-it-up --ship` pushes the ship branch, opens one PR `Ship <app>: <pies> pies, <slices> slices`, watches CI once, and merges on green. With `run.unattended: true` nothing waits on you: a slice that would need you is deferred (`deferred: <reason>`, its commits kept off the ship branch), the run continues, and it returns `complete_with_deferrals` with the blockers.
6. **Pie boundary** (default mode): when every slice is `[x]`, stop and hand off to `/box-it-up`: open one PR `Pie N`, run CI **once**, take the merge-authorization HITL, merge **preserving every per-slice commit** (never squash), sync main, delete the branch, remove the worktree. The next pie starts in a fresh chat.

The **conductor holds zero implementation context** — it routes structured artifacts between the singular-goal subagents and never writes code, tests behavior, or seeds a DB itself.

## Preconditions

- `docs/plans/00_master_checklist.md` exists and is **nested** (`## Pie N` / `### Slice N.M`). A **flat** v4 checklist is refused — convert with `/cook-pizzas --repie` (explicit opt-in) or use `/sell-slice`.
- An **active Pie** exists (a `## Pie N` whose slices are not all `[x]`), and **every prior Pie is merged-or-authorized**.
- Each slice plan carries `pie` / `slice` / `review` frontmatter and a well-formed `**Exit criteria:**` block.
- Clean git working tree; the pie branch `pie-<n>-<scope>` exists or will be cut from freshly-fetched `origin/main` into one worktree per pie. Never bake on `main`. Merge-per-slice mode instead needs a clean primary checkout on a synced `main`, `gh` authenticated, and a repo that allows merge commits. Ship-once mode needs a clean primary checkout on the ship branch (or on `main` before it exists); `gh` is needed only for the final `--ship` step.

## When to use this command

Run `/sell-pie` to deliver **one whole Pie** hands-off. It is the everyday autonomous loop in v5 — one pie per run, a fresh chat per pie.

- For **one careful slice** (sensitive or collaborative work, full human gates), use [`/sell-slice`](../skills/sell-slice/SKILL.md).
- For the **whole app end to end**, use [`/pizza-party`](../skills/pizza-party/SKILL.md): one interview, then every pie through `/sell-pie` under ship-once, one PR, deploy.
- To **convert a flat v4 checklist** into pies first, use `/cook-pizzas --repie` (it never silently rewrites your plans).
- At the **pie boundary**, shipping the PR is [`/box-it-up`](../skills/box-it-up/SKILL.md)'s job — `/sell-pie` hands off to it.
