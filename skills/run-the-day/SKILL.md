---
name: run-the-day
description: EXPERIMENTAL. Run the whole day's service on autopilot — chain /bytheslice:sell-pie across every Pie in the master checklist for an unattended whole-roadmap run. For one Pie at a time, use /sell-pie directly.
experimental: true
user-invocable: true
triggers: ["/bytheslice:run-the-day", "/run-the-day", "run the day", "fire the tray", "/bytheslice:run-pipeline", "/run-pipeline", "run the pipeline", "run pipeline", "autonomous delivery", "run all pies", "run all stages", "bake all the pies", "bake the whole roadmap"]
---
<!-- skills/run-the-day/SKILL.md -->
<!-- EXPERIMENTAL whole-roadmap chainer (v5). Pizza-shop framing: run the whole day's service end-to-end. Demoted in v5 to a THIN CHAINER over /sell-pie: it holds zero implementation context, reads the master checklist, and dispatches /sell-pie once per Pie in order. All baking, gating, context-separation, per-slice commits, and the boundary PR live in /sell-pie + /box-it-up — this skill never re-implements them. The primary entry point is /sell-pie (one Pie, autonomous, fresh chat per pie). /run-the-day is the sidecar for users who want every Pie driven in one session and accept the reliability tradeoff. --auto-mvp / --auto-all are PIE FILTERS. -->

# Run the Day — Whole-Roadmap Chainer (EXPERIMENTAL)

> **EXPERIMENTAL.** This skill chains **`/bytheslice:sell-pie`** across every Pie in the master checklist so the whole roadmap bakes in one session. Driving 4–10 Pies in a single chat is unreliable today (context drift across many pie boundaries). **The primary entry point is [`/sell-pie`](../sell-pie/SKILL.md)** — it bakes **one Pie** autonomously, then stops at the boundary; you run it once per pie in a fresh chat. Use `/run-the-day` only when you explicitly want every Pie driven in one session and accept the reliability tradeoff.

`/run-the-day` is a **thin chainer**, not an autopilot of its own. It holds **zero implementation context**. Per Pie it dispatches one [`/sell-pie`](../sell-pie/SKILL.md) invocation and waits for that pie to finish (all slices baked, the boundary PR merged) before advancing to the next Pie. Everything that actually bakes a slice — the context-separated `builder → slice-tester → slice-verifier → fixer` Workflow, per-slice commit + push, the pie-boundary PR via [`/box-it-up`](../box-it-up/SKILL.md) — lives **inside `/sell-pie`**. This skill never re-implements any of it; it only sequences pies and surfaces any HITL the inner pie raises.

Because `/sell-pie` already owns the loop, the gates, the context separation, and the boundary PR, `/run-the-day` carries almost no logic. If you find yourself adding per-slice or per-gate machinery here, it belongs in `/sell-pie` instead.

## Mode detection

`/run-the-day` is **always sequential over Pies**. It requires `docs/plans/00_master_checklist.md` with at least one Pie whose status is not `Completed`. It stops cleanly if no checklist exists, pointing the user at [`/cook-pizzas`](../cook-pizzas/SKILL.md) first.

`/sell-pie` **refuses flat (v4) checklists** — a checklist written as flat `## Stage N` rows with no `## Pie N` structure cannot be chained. If the master checklist is flat, `/run-the-day` stops before dispatching anything and surfaces the same hint `/sell-pie` would: convert the checklist with `/cook-pizzas --repie` (explicit opt-in; never auto-rewritten), or deliver flat-v4 work one slice at a time with [`/sell-slice`](../sell-slice/SKILL.md). Detection: a checklist is "piefied" if it contains at least one `## Pie N` header; otherwise treat it as flat and refuse.

The `--auto-mvp` / `--auto-all` flags are **pie filters** (see Modes) — they select *which Pies* this chainer drives, not which slices. Slice-level autonomy is entirely `/sell-pie`'s concern.

## Modes

`/run-the-day`'s flags choose the **set of Pies** to chain. They do not change how any individual Pie bakes — that is fixed by each Pie's own `review:` property (`boundary` = autonomous, `continuous` = forced `/sell-slice` mode) inside `/sell-pie`.

| Invocation | Pie filter | Between-pie behavior |
|---|---|---|
| `/run-the-day` (default) | All not-`Completed` Pies. | Dispatch one Pie → report → **pause and wait for the human's "continue"** before the next Pie. |
| `/run-the-day --auto-mvp` | Only Pies marked `mvp: true` in their `## Pie N` frontmatter/annotation. | Auto-advance between `mvp: true` Pies; **pause before the first `mvp: false` Pie**; pause on any HITL the inner pie bubbles. |
| `/run-the-day --auto-all` | All not-`Completed` Pies. | Auto-advance between every Pie; pause **only** when the inner `/sell-pie` bubbles a HITL. |

In every mode, the chainer **never advances past a HITL** until the human responds. HITL is surfaced by the orchestrating session that ran the chainer (or by `/sell-pie` itself) — **this skill never calls `ask_user_input_v0`**; it sets `needs_human` + `hitl_*` in its return contract and stops the chain.

The pie-boundary checkpoint (the one kept HITL, §1.8) lives **inside** each `/sell-pie` run via `/box-it-up`'s merge-authorization gate — it fires once per Pie regardless of mode. `--auto-all` does **not** auto-approve a pie's boundary merge; it only removes the *between-pie* "continue" pause.

## Subagent Roster

`/run-the-day` dispatches **no subagents of its own** in v5. Each Pie is delivered by invoking the [`/sell-pie`](../sell-pie/SKILL.md) skill, which runs its own context-separated Workflow (builder → [`slice-tester`](../sell-slice/agents/slice-tester.md) → [`slice-verifier`](../sell-slice/agents/slice-verifier.md) → fixer) per slice and hands the boundary off to [`/box-it-up`](../box-it-up/SKILL.md). The chainer just sequences `/sell-pie` calls.

| When | What | Owner |
|---|---|---|
| Per Pie | Invoke [`/sell-pie`](../sell-pie/SKILL.md) for the active Pie | `/sell-pie` skill (not a subagent of this skill) |
| Pie boundary | PR · CI · merge · cleanup | [`/box-it-up`](../box-it-up/SKILL.md), called by `/sell-pie` |

> **Deprecated agents.** The v4 [`agents/stage-runner.md`](agents/stage-runner.md) and [`agents/pr-reviewer.md`](agents/pr-reviewer.md) are retained for v4 back-compat through 5.1 but are **no longer dispatched**. `/sell-pie` supersedes the stage-runner's per-stage wrapper role, and `/box-it-up`'s single-PR CI watch + the `slice-verifier`'s CI-integrity check supersede the pr-reviewer's post-merge sanity pass. See each file's deprecation note.

## Inputs and Preconditions

> Pre-enforced by `hooks/precheck-skill.sh` **when hooks are active**. If `BTS_HOOKS_DISABLED=1` or `disableAllHooks` is set, run the checklist-exists and `gh auth status` checks inline via tools and proceed silently. The preconditions are required either way; only the enforcement layer is optional. Never narrate the checks in chat.

- `docs/plans/00_master_checklist.md` exists, is readable, and is **piefied** (contains at least one `## Pie N` header). A flat-v4 checklist is refused (see Mode detection).
- Every `## Pie N` to be chained has its slices defined under `### Slice N.M` rows, and every referenced per-stage plan file (`docs/plans/stage_<n>_*.md`) exists.
- `git status --short` is clean and the current branch is `main`.
- Local `main` is up to date with `origin/main` (`git pull --ff-only`).
- `gh` CLI installed and authenticated (each `/sell-pie` opens a boundary PR at its end).

## Project Config (optional)

Before Phase 0, check for `bytheslice.config.json` at the project root. If present:

1. Read the file as JSONC (comments + trailing commas allowed).
2. Apply the precedence rules from [`skills/setup-shop/references/bytheslice-config-schema.md`](../setup-shop/references/bytheslice-config-schema.md): env vars > config file > project rules file > plugin defaults.
3. Resolve the values `/sell-pie` will need (`modelTiers`, `mcps`, `verification.*`, `flow.*`, and each Pie's `review` property) and log a one-line summary of any non-default resolutions in the chainer's first message (e.g., `Config overrides: implementer→opus, libraryGate=self-critique`).
4. **Pass the resolved config straight through** to each `/sell-pie` invocation so the inner Workflow agents re-read it. The chainer does not interpret `verification.*` / `flow.*` itself — those govern slice baking, which is `/sell-pie`'s job.

If the file exists but parses as malformed JSON, **stop before dispatching any Pie** and set `needs_human: true` with `hitl_category: "prd_ambiguity"` and `hitl_question: "bytheslice.config.json failed to parse — please fix the syntax error at line N before continuing"`. Never silently fall through to defaults. If the file is absent, proceed with plugin defaults (no warning).

## Workflow

### Phase 0 — Read the master checklist and build the pie queue

1. Read `docs/plans/00_master_checklist.md`.
2. **Piefied check.** If the file contains no `## Pie N` header, it is a flat-v4 checklist — **stop** and surface the refusal (Mode detection): recommend `/cook-pizzas --repie` to convert, or `/sell-slice` for one-at-a-time flat delivery. Do not dispatch anything.
3. Build an ordered list of `(pie_n, pie_name, review, mvp, status, [slice rows])` from the `## Pie N` headers and their `### Slice N.M` children.
4. **Apply the pie filter** (Modes): default / `--auto-all` → every Pie whose status is not `Completed`; `--auto-mvp` → only `mvp: true` Pies that are not `Completed`.
5. The first Pie in the filtered queue is the active starting point. If the queue is empty (everything already `Completed`, or no Pie matched the filter), skip to Phase 2 — Final Report.
6. Confirm the workspace is on `main`, clean, latest pulled.

### Phase 1 — Per-pie loop (strictly sequential)

For each Pie in the filtered queue, in order:

1. **Pre-pie state check.** Verify `git status` clean, on `main`, latest pulled. (Each completed Pie returns to clean `main` via `/box-it-up`; the next Pie cuts a fresh `pie-<n>-<scope>` branch and worktree inside `/sell-pie`.)
2. **Dispatch [`/sell-pie`](../sell-pie/SKILL.md) for the active Pie.** Pass the Pie number, the resolved config (if any), and any HITL-resolution context appended after a prior pause. `/sell-pie` reads the checklist, picks that Pie, and runs to its boundary:
   - For a `review: continuous` Pie it runs in `/sell-slice` (high-touch) mode for every slice.
   - For a `review: boundary` Pie (default) it loops slices autonomously — per slice: the context-separated produce/verify Workflow, then commit + push via [`/box-it-up --slice`](../box-it-up/SKILL.md), no PR.
   - When every slice under the Pie is `[x]`, `/sell-pie` opens the **one** Pie PR via `/box-it-up`, CI runs once, the human approves the merge at the boundary checkpoint, the Pie branch merges (preserving per-slice commits) and cleans up.
   **Wait for `/sell-pie` to return.** Do not start the next Pie until it does.
3. **Handle HITL if returned.** If `/sell-pie` returns `needs_human: true`, **stop the chain** and propagate its structured `hitl_*` fields verbatim in this skill's return contract (see HITL Handling). Do not advance, do not reschedule.
4. **Confirm the pie closed cleanly.** From `/sell-pie`'s return, verify: the Pie PR is `MERGED`, CI was green on the merged head SHA, the working tree is clean on `main` synced with `origin/main`, the pie branch + worktree were removed, and the Pie's `## Pie N` status reads `Completed`. If any is false and there is no HITL reason, set `status: failed` and stop — do not advance to the next Pie on a half-finished one.
5. **Update the pie queue** if `/sell-pie` did not already flip the `## Pie N` status (it does, via `/box-it-up` Phase 5). Idempotent — no-op if already `Completed`. The chainer never edits slice rows; those are `/sell-pie`'s.
6. **Report pie completion** to the user (see Progress Report Format).
7. **Mode-based pause decision:**
   - **Default mode:** always pause. Surface: "Pie N complete and merged. Ready to bake Pie N+1? (Reply 'continue' or give instructions.)"
   - **`--auto-mvp`:** pause only if the next queued Pie has `mvp: false`, OR if HITL occurred.
   - **`--auto-all`:** do not pause unless HITL occurred.
8. Advance to the next Pie. Repeat.

### Phase 2 — Final Report

When every Pie in the filtered queue is `Completed`:

1. Confirm `git status` clean, on `main`, no leftover pie branches or worktrees.
2. Confirm every Pie PR reported by the `/sell-pie` runs is merged.
3. Output the Final Report Format.

## HITL Handling

`/run-the-day` produces **no HITL of its own** beyond the between-pie "continue" pause in default mode. Every genuine blocking decision originates **inside** a `/sell-pie` run — the four kept categories (§1.8): `external_credentials`, `prd_ambiguity`, `destructive_operation`, and the pie-boundary merge checkpoint (surfaced by `/box-it-up`). When `/sell-pie` returns `needs_human: true`:

1. **Stop the chain immediately.** Do not advance to the next Pie; do not reschedule or retry.
2. **Propagate the structured fields verbatim** — `hitl_category`, `hitl_question`, `hitl_context` — into this skill's own return contract.
3. The **orchestrating session that invoked `/run-the-day`** (or `/sell-pie` itself, when run interactively) surfaces the prompt to the human. **This skill never calls `ask_user_input_v0`.**
4. Once the human answers, the chain is resumed by re-invoking the chainer (or re-dispatching the active Pie) with the resolution context appended. The just-completed Pies are already merged and `Completed`, so resumption picks up at the Pie that paused.

> **v5 change:** in v4, `run-the-day` was "the only surface that calls `ask_user_input_v0`." That is no longer true. In v5 no ByTheSlice agent or skill calls `ask_user_input_v0` directly — every layer bubbles `needs_human` + `hitl_*` up the return chain, and only the top-level interactive session prompts the human.

## Progress Report Format (per pie)

```
Pie <N> — <name>: Completed
- Slices baked: <M> (all [x])
- Branch: pie-<n>-<scope> (merged, then deleted)
- PR: <pr url> (merged, CI green) — merge strategy: rebase | merge-commit
- Per-slice commits preserved on main: <count>
- review: boundary | continuous
- Worktree: removed
- Notes: <one line — e.g. "1 HITL resolved (destructive_operation) mid-pie">

On main, clean tree. [Advancing to Pie <N+1> automatically. | Waiting for your "continue".]
```

## Final Report Format

```
Run the Day — roadmap complete

Pies completed: <N> of <N in the filtered queue>  (filter: all | --auto-mvp | --auto-all)
PRs merged: <list of Pie PR URLs in pie order>
Master checklist: docs/plans/00_master_checklist.md (every queued Pie Completed)
Working tree: clean on main, no leftover branches or worktrees

Recommended next: <empty | the deferred mvp:false Pies via /sell-pie | open Phase 2 work>
```

## Hard Constraints

- **Thin chainer only.** `/run-the-day` reads the checklist, sequences Pies, and dispatches `/sell-pie` once per Pie. It **never** bakes a slice, runs a gate, opens a PR, or edits production code itself. All of that lives in `/sell-pie` + `/box-it-up`. If logic feels per-slice or per-gate, it belongs in `/sell-pie`.
- **Strictly sequential over Pies.** Never dispatch two `/sell-pie` runs in parallel. Pie N+1 cannot start until Pie N's PR is merged, main is clean and synced, and its worktree is removed.
- **Chainer edits only pie-level status.** It reads plans and, at most, idempotently confirms a `## Pie N` status is `Completed`. It never edits `### Slice N.M` rows, plan files, or code.
- **Refuse flat checklists.** A checklist with no `## Pie N` header is refused with the `/cook-pizzas --repie` / `/sell-slice` hint. Never auto-convert a flat checklist — conversion is an explicit opt-in (`/cook-pizzas --repie`).
- **`--auto-mvp` / `--auto-all` are pie filters.** They choose which Pies to chain and whether to pause *between* Pies. They never change how a Pie bakes internally — that is the Pie's `review:` property, owned by `/sell-pie`.
- **Never auto-approve a pie-boundary merge.** `--auto-all` removes only the between-pie pause. The boundary merge checkpoint inside each `/sell-pie` (via `/box-it-up`) still requires the human.
- **Stop the chain on HITL — never reschedule.** When `/sell-pie` bubbles `needs_human: true`, halt and propagate. Do not loop, retry, or silently continue.
- **Master checklist is source of truth** for pie ordering and completion. Never re-order Pies.
- **HITL never goes through `ask_user_input_v0`.** This skill sets `needs_human` + `hitl_*`; the top-level session prompts.
- **No new commands without authorization.** Only activate on `/run-the-day` or the listed trigger phrases.

## Completion Checklist

Walk this before reporting the roadmap done.

[ ] Master checklist confirmed piefied (at least one `## Pie N`); a flat checklist was refused, not chained.
[ ] Pie queue built and filtered correctly for the invoked mode (all / `mvp: true` only).
[ ] Each queued Pie was delivered by a single `/sell-pie` dispatch — no slice baking or gating done in this skill.
[ ] Every queued Pie returned `status: complete` with its PR `MERGED` and CI green on the merged head SHA.
[ ] Between every Pie: clean tree, on `main`, synced with `origin/main`, no leftover pie branch or worktree.
[ ] Any HITL bubbled by `/sell-pie` stopped the chain and was propagated via `needs_human` + `hitl_*` (never `ask_user_input_v0`).
[ ] Deferred `mvp: false` Pies (in `--auto-mvp`) listed in the Final Report's "Recommended next".
[ ] Final Report emitted.

## Return contract

`/run-the-day` returns structured fields to whatever invoked it (an interactive session, a `/loop`, or a scheduled wake). It never prompts the user directly.

```yaml
status: complete | failed | needs_human
summary: <one paragraph — filter mode, pies completed of queued, notable findings>
pies_completed: <int>
pies_queued: <int>
filter: all | auto-mvp | auto-all
pr_urls: [<merged Pie PR URLs in order>]
active_pie: <int or null — the Pie that paused, if any>
on_main: true | false
clean_tree: true | false
needs_human: false | true
hitl_category: null | "prd_ambiguity" | "external_credentials" | "destructive_operation"
hitl_question: null | "<plain-language question, propagated verbatim from /sell-pie>"
hitl_context: null | "<what triggered this — enough to act without this conversation>"
notes: <one-line summary or unresolved issue description>
```

If a Pie returned without a clean merge and there is no HITL reason, set `status: failed`, leave `active_pie` set to that Pie, and describe the blocker in `notes`. The orchestrating session surfaces it.

## Triggers

Follow this skill whenever the user:

- runs `/run-the-day` (optionally with `--auto-mvp` or `--auto-all`)
- says "run the whole roadmap", "bake every pie", "ship every pie", "drive the whole plan to completion", "run all pies"
- explicitly passes the master checklist and asks for unattended whole-roadmap delivery

If the user wants **one Pie** baked autonomously (the supported, reliable path), redirect to [`/sell-pie`](../sell-pie/SKILL.md). If they want **one careful slice**, redirect to [`/sell-slice`](../sell-slice/SKILL.md). If there is no piefied checklist yet, redirect to [`/cook-pizzas`](../cook-pizzas/SKILL.md).
