# Hook Scenario Contract

This file is the **canonical source of truth** for hook behavior. Every row is one scenario the hook scripts handle. Both the scripts in this directory and the per-skill `## Preconditions` sections of every SKILL.md reference this table. If a scenario is missing here but enforced in code, that's drift — fix the table or the code, not both independently.

`hooks/test.sh` reads this file and runs every row against the live hook scripts. A failing test means the implementation and the contract have diverged.

## Legend

- **BLOCK** — hook exits 2; Claude Code prevents the action and shows the message
- **WARN** — hook exits 0 and prints to stdout; Claude sees the warning as additional context but proceeds
- **PASS** — hook exits 0 with no output; nothing surfaces to Claude
- **CONTEXT** — hook exits 0 and prints to stdout; used for SessionStart context injection

## UserPromptSubmit: `precheck-skill.sh`

| Skill in prompt | Project state | Expected |
|---|---|---|
| `/sell-slice` | no `docs/plans/00_master_checklist.md` | **BLOCK** — "requires master checklist, run /cook-pizzas first" |
| `/sell-slice` | checklist exists, all Prep `[x]`, clean tree | **PASS** |
| `/sell-slice` | checklist exists, some Prep `[ ]` | **WARN** — "Prep section incomplete: N/M boxes checked" |
| `/sell-slice` | checklist exists, dirty git tree | **WARN** — "working tree is dirty" |
| `/box-it-up` | current branch is `main` or `master` | **BLOCK** — "refuses to run on main/master" |
| `/box-it-up` | feature branch, no `gh auth` | **WARN** — "gh CLI not authenticated" |
| `/box-it-up` | feature branch, `gh` authed | **PASS** |
| `/cook-pizzas` | no checklist | **PASS** — cook-pizzas is allowed to run without one (it produces the checklist) |
| `/special-order` | no checklist | **BLOCK** — "requires master checklist" |
| `/run-the-day` | no checklist | **BLOCK** |
| `/close-shop` | no checklist | **BLOCK** |
| no bytheslice command | any | **PASS** |
| any bytheslice command | `BTS_HOOKS_DISABLED=1` set | **PASS** — env var short-circuits all hooks |

## PreToolUse on Bash: `pre-commit-guard.sh`

| Bash command | Branch | Expected |
|---|---|---|
| `git commit -m "..."` | `main` or `master` | **BLOCK** — "refusing git commit on main/master" |
| `git commit -m "..."` | feature branch | **WARN** — staged file list |
| `git status` | any | **PASS** (not a git commit) |
| `npm test` | any | **PASS** |
| any command | `BTS_HOOKS_DISABLED=1` | **PASS** |

## SessionStart: `shop-status.sh`

| Project state | Expected |
|---|---|
| no `docs/plans/00_master_checklist.md` | **PASS** — silent (not a bytheslice project) |
| checklist present | **CONTEXT** — stage counts, Prep progress, next not-started row |
| `BTS_HOOKS_DISABLED=1` | **PASS** — silent |

## Stop: `stop-gate.sh`

| Session state | Expected |
|---|---|
| no `.bytheslice-state/last-precheck.json` | **PASS** |
| precheck state from a *different* `session_id` | **PASS** — stale state never blocks |
| `last-precheck.skill` is neither `sell-slice` nor `box-it-up` (current session) | **PASS** |
| `/sell-slice` precheck in current session, no commit since | **BLOCK once** — "no slice commit detected"; second invocation passes |
| `/sell-slice` precheck in current session, commit landed | **PASS** |
| `/box-it-up` precheck in current session, `gh` missing | **PASS** — fail open, can't check PR state |
| `/box-it-up` precheck in current session, `gh pr view` returns non-`MERGED` | **BLOCK once** — "PR is not merged yet"; re-entry passes |
| `/box-it-up` precheck in current session, `gh pr view` returns `MERGED` | **PASS** |
| `stop_hook_active: true` in input (re-entry) | **PASS** — never loop |
| `BTS_HOOKS_DISABLED=1` | **PASS** |

## PreToolUse on Write/Edit: `stage-plan-guard.sh`

| Tool target | Session state | Expected |
|---|---|---|
| `docs/plans/stage_1_foo.md` | current session, `skill == "sell-slice"` | **BLOCK** — "refuses to edit stage plan files during /sell-slice" |
| `docs/plans/stage_1_foo.md` | current session, `skill != "sell-slice"` | **PASS** |
| `docs/plans/00_master_checklist.md` | current session, `skill == "sell-slice"` | **PASS** — not a `stage_*` plan file |
| `src/app/page.tsx` (non-plan path) | current session, `skill == "sell-slice"` | **PASS** |
| `docs/plans/stage_1_foo.md` | state from a *different* `session_id` | **PASS** — stale state never blocks |
| `docs/plans/stage_1_foo.md` | no `last-precheck.json` | **PASS** — fail open |
| any stage plan path | `BTS_HOOKS_DISABLED=1` | **PASS** |

## PreToolUse on Write/Edit: `library-gate-guard.sh`

| Tool target | State | Expected |
|---|---|---|
| `app/dashboard/page.tsx` (watched) | no `library-approvals.json` | **PASS** — gate dormant until approval-writer ships |
| `app/dashboard/page.tsx` (watched) | approvals file present, no approval entry, current-session `skill == "sell-slice"` | **WARN** — "no library approval is recorded" |
| `app/dashboard/page.tsx` (watched) | approvals file present, an approval recorded, `skill == "sell-slice"` | **PASS** |
| `lib/util.ts` (not watched) | approvals file present, no approval, `skill == "sell-slice"` | **PASS** — path not under a watched glob |
| `app/dashboard/page.tsx` (watched) | approvals present, no approval, `skill != "sell-slice"` | **PASS** |
| `app/dashboard/page.tsx` (watched) | approvals present, state from a *different* `session_id` | **PASS** — stale state never warns |
| any watched path | `BTS_HOOKS_DISABLED=1` | **PASS** |

## PreCompact: `compact-snapshot.sh`

| State | Expected |
|---|---|
| `last-precheck.json` present | **PASS** (exit 0, silent) — writes `compact-snapshot.json` with skill carried over |
| no `last-precheck.json` | **PASS** (exit 0, silent) — still writes a minimal `compact-snapshot.json` |
| checklist present with unfinished lines | snapshot's `master_checklist_summary` holds up to 3 of them |
| `BTS_HOOKS_DISABLED=1` | **PASS** — no snapshot written |

## PostToolUse on Bash: `commit-checklist-correlator.sh`

| Bash command | State | Expected |
|---|---|---|
| `git commit -m "..."` | `skill == "sell-slice"`, checklist has a `Completed` row, last commit did NOT touch the checklist | **WARN** — "docs/plans/00_master_checklist.md was not part of it" |
| `git commit -m "..."` | `skill == "sell-slice"`, `Completed` row, last commit DID touch the checklist | **PASS** |
| `git commit -m "..."` | `skill == "sell-slice"`, checklist has no `Completed` row | **PASS** — not a closeout |
| `git status` (not a commit) | `skill == "sell-slice"`, `Completed` row | **PASS** — not a `git commit` |
| `git commit -m "..."` | `skill != "sell-slice"` (current session) | **PASS** |
| `git commit -m "..."` | state from a *different* `session_id` | **PASS** — stale state never warns |
| `git commit -m "..."` | no `last-precheck.json` | **PASS** — fail open |
| any command | `BTS_HOOKS_DISABLED=1` | **PASS** |

## Notes

- Every hook honors `BTS_HOOKS_DISABLED=1` as the first action after `set -u`. That's the supported per-session disable.
- Every hook tolerates missing `jq` — JSON parsing falls back to `sed`.
- All state lives under `.claude/.bytheslice-state/` (gitignored).
