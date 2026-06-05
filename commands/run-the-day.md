<!-- commands/run-the-day.md -->
<!-- EXPERIMENTAL slash command that loads the run-the-day skill. v5: a THIN CHAINER over /sell-pie. Pizza-shop framing: run the whole day's service end-to-end by baking every Pie in sequence. Primary entry point is /sell-pie (one Pie at a time). --auto-mvp / --auto-all are PIE FILTERS. -->

---
description: EXPERIMENTAL. Run the whole day's service on autopilot — chain /bytheslice:sell-pie across every Pie in docs/plans/00_master_checklist.md, in strict sequence, for an unattended whole-roadmap run. A thin chainer that holds no implementation context: it picks the next not-Completed Pie, dispatches /sell-pie (which bakes every slice and opens the boundary PR), waits for that Pie to merge and return to clean main, then advances. Refuses flat v4 checklists. --auto-mvp / --auto-all select which Pies to chain. The everyday entry point is /bytheslice:sell-pie (one Pie at a time); use /run-the-day only when you want every Pie driven in one session and accept that long multi-pie sessions can drift.
---

# /run-the-day (EXPERIMENTAL)

> **EXPERIMENTAL.** This command chains `/bytheslice:sell-pie` across every Pie in the master checklist so the whole roadmap bakes in one chat session. Driving many Pies in one session is unreliable today. The primary entry point is **`/bytheslice:sell-pie`** — it bakes **one Pie** autonomously, then stops at the boundary; run it once per pie in a fresh chat. Use `/run-the-day` only when you want a single-session whole-roadmap run and accept the reliability tradeoff.

Load and follow the [`run-the-day`](../skills/run-the-day/SKILL.md) skill.

In v5 `/run-the-day` is a **thin chainer** — it holds zero implementation context and re-implements nothing. All baking, gating, context separation, per-slice commits, and the boundary PR live in [`/sell-pie`](../skills/sell-pie/SKILL.md) and [`/box-it-up`](../skills/box-it-up/SKILL.md). The chainer only sequences Pies:

1. Reads `docs/plans/00_master_checklist.md` and confirms it is **piefied** (has `## Pie N` headers). A flat v4 checklist is refused with a `/cook-pizzas --repie` hint.
2. Builds the pie queue and applies the mode filter (all Pies, or only `mvp: true` Pies).
3. For each queued Pie (sequentially, never parallel):
   - Dispatches [`/bytheslice:sell-pie`](../skills/sell-pie/SKILL.md) for that Pie. `/sell-pie` bakes every slice (context-separated `builder → slice-tester → slice-verifier → fixer` Workflow), commits + pushes per slice, then opens the **one** Pie PR via [`/box-it-up`](../skills/box-it-up/SKILL.md), runs CI once, takes the human's boundary-merge approval, merges preserving per-slice commits, and returns to clean `main`.
   - Confirms the Pie PR merged, CI was green, and the tree is clean on `main` (no leftover pie branch or worktree) before advancing.
4. Returns a final report when every queued Pie is `Completed`.

## Modes

`--auto-mvp` / `--auto-all` are **pie filters** — they choose *which Pies* to chain and whether to pause *between* Pies. They never change how a Pie bakes internally; that is each Pie's `review:` property (`boundary` = autonomous, `continuous` = forced `/sell-slice` mode), owned by `/sell-pie`.

| Invocation | Pies chained | Between-pie behavior |
|---|---|---|
| `/run-the-day` (default) | All not-`Completed` Pies | Bake one Pie → report → pause and wait for the human's "continue" |
| `/run-the-day --auto-mvp` | Only `mvp: true` Pies | Auto-advance between MVP Pies; pause before the first `mvp: false` Pie and on any HITL |
| `/run-the-day --auto-all` | All not-`Completed` Pies | Auto-advance between every Pie; pause only when a Pie bubbles a HITL |

The pie-boundary merge checkpoint fires **inside every `/sell-pie` run** (via `/box-it-up`), once per Pie, regardless of mode — `--auto-all` removes only the *between-pie* pause, never the boundary-merge approval.

## Preconditions

- `docs/plans/00_master_checklist.md` exists and is **piefied** (contains at least one `## Pie N`). A flat v4 checklist is refused — convert with `/cook-pizzas --repie` or deliver one slice at a time with `/bytheslice:sell-slice`.
- Every referenced `docs/plans/stage_<n>_*.md` exists.
- Working tree is clean on `main`, synced with `origin/main`.
- `gh` CLI is installed and authenticated (each Pie opens a boundary PR).

If any precondition fails, the skill stops and reports the gap before dispatching any Pie.

## When to use this command

Use `/run-the-day` only when you explicitly want unattended whole-roadmap delivery in one chat session, and accept that chaining many Pies can drift. For the supported, reliable path, run **`/bytheslice:sell-pie`** once per Pie in a fresh chat — it bakes a whole Pie autonomously and stops at the boundary. For one careful slice, use `/bytheslice:sell-slice`. If you have no piefied checklist yet, run `/bytheslice:cook-pizzas` first.
