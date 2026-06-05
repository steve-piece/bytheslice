<!-- commands/sell-pie.md -->
<!-- Slash command that loads the sell-pie skill: the v5 forefront autonomous baker. Pizza-shop framing: pull one whole Pie (a 3–8-slice chapter) off the rack and run it through the line slice by slice, hands-off, until it's boxed and ready for review. The everyday single-slice tool is /sell-slice; the whole-roadmap chainer is /run-the-day. -->

---
description: Bake a whole Pie autonomously — the v5 forefront delivery loop. Reads the nested master checklist, picks the active Pie (a coherent 3–8-slice chapter), and drives every slice to "ready for review" without per-slice prompting via a /loop; each slice runs the context-separated build→test→verify→fix Workflow (the tester sees only the build manifest + Exit criteria, never the builder's reasoning), commits + pushes (no PR, CI stays quiet), and advances; when every slice is [x] it stops at the pie boundary and opens one PR "Pie N" via /box-it-up (CI runs once, merge preserves per-slice commits). Refuses a flat v4 checklist (points you at /cook-pizzas --repie). A continuous-review pie (review=continuous) runs each slice through high-touch /sell-slice instead. The four blocking HITL categories halt the loop. Use when the user runs /sell-pie, says "sell a pie", "bake the pie", "run the next pie", or wants one whole chapter delivered hands-off. For one careful slice use /sell-slice; for the whole roadmap use /run-the-day.
---

# /sell-pie

Load and follow the [`sell-pie`](../skills/sell-pie/SKILL.md) skill.

`sell-pie` is the **forefront** delivery command in ByTheSlice v5. Where `/sell-slice` delivers one careful slice with human gates, `/sell-pie` **bakes a whole Pie autonomously** — a `/loop`-driven baker that drives every slice of one chapter to "ready for review" hands-off, then stops at the pie boundary.

The skill drives one pie end-to-end:

1. **Set up the loop** — read the nested master checklist, pick the active Pie, read its `review:` mode, confirm prior pies merged, set the pie-completion `/goal`, cut the pie branch + worktree.
2. **Loop the slices** (autonomous, `review: boundary`) — `/loop` wakes once per slice; each runs a context-separated `Workflow`:
   - **builder** writes the slice + unit tests and emits the **build manifest**;
   - **slice-tester** independently verifies behavior — receiving **only** the manifest + Exit criteria + design-system path, never the builder's reasoning, so it cannot rationalize the builder's choices;
   - **slice-verifier** runs each static gate once + the manifest under-declaration backstop;
   - **fixer** applies the smallest off-context fix on failure (capped at 3 loops → HITL).
   Then commit + push the slice (`feat(pie-N): N.M — <name>`) via `/box-it-up --slice` — **no PR, so CI stays quiet** — and advance.
3. **Continuous mode** (`review: continuous`) — for sensitive pies (Payments, Auth, real-data migrations), drive each slice through high-touch `/sell-slice` instead of the autonomous Workflow.
4. **Pie boundary** — when every slice is `[x]`, stop and hand off to `/box-it-up`: open one PR `Pie N`, run CI **once**, take the merge-authorization HITL, merge **preserving every per-slice commit** (never squash), sync main, delete the branch, remove the worktree. The next pie starts in a fresh chat.

The **conductor holds zero implementation context** — it routes structured artifacts between the singular-goal subagents and never writes code, tests behavior, or seeds a DB itself.

## Preconditions

- `docs/plans/00_master_checklist.md` exists and is **nested** (`## Pie N` / `### Slice N.M`). A **flat** v4 checklist is refused — convert with `/cook-pizzas --repie` (explicit opt-in) or use `/sell-slice`.
- An **active Pie** exists (a `## Pie N` whose slices are not all `[x]`), and **every prior Pie is merged-or-authorized**.
- Each slice plan carries `pie` / `slice` / `review` frontmatter and a well-formed `**Exit criteria:**` block.
- Clean git working tree; the pie branch `pie-<n>-<scope>` exists or will be cut off `main` into one worktree per pie. Never on `main`.

## When to use this command

Run `/sell-pie` to deliver **one whole Pie** hands-off. It is the everyday autonomous loop in v5 — one pie per run, a fresh chat per pie.

- For **one careful slice** (sensitive or collaborative work, full human gates), use [`/sell-slice`](../skills/sell-slice/SKILL.md).
- For the **whole roadmap** unattended, use [`/run-the-day`](../skills/run-the-day/SKILL.md) (experimental) — it chains `/sell-pie` across every pie.
- To **convert a flat v4 checklist** into pies first, use `/cook-pizzas --repie` (it never silently rewrites your plans).
- At the **pie boundary**, shipping the PR is [`/box-it-up`](../skills/box-it-up/SKILL.md)'s job — `/sell-pie` hands off to it.
