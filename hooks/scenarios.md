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
| `last-precheck.skill != "sell-slice"` (current session) | **PASS** |
| `/sell-slice` precheck in current session, no commit since | **BLOCK once** — "no slice commit detected"; second invocation passes |
| `/sell-slice` precheck in current session, commit landed | **PASS** |
| `stop_hook_active: true` in input (re-entry) | **PASS** — never loop |
| `BTS_HOOKS_DISABLED=1` | **PASS** |

## Notes

- Every hook honors `BTS_HOOKS_DISABLED=1` as the first action after `set -u`. That's the supported per-session disable.
- Every hook tolerates missing `jq` — JSON parsing falls back to `sed`.
- All state lives under `.claude/.bytheslice-state/` (gitignored).
