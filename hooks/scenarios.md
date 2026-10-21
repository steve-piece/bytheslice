# Hook Scenario Contract

This file is the **canonical source of truth** for hook behavior. Every row is one scenario the hook scripts handle. Both the scripts in this directory and the per-skill `## Preconditions` sections of every SKILL.md reference this table. If a scenario is missing here but enforced in code, that's drift - fix the table or the code, not both independently.

`hooks/test.sh` reads this file and runs every row against the live hook scripts. A failing test means the implementation and the contract have diverged.

## Legend

- **BLOCK** - hook exits 2; Claude Code prevents the action and shows the message
- **WARN** - hook exits 0 and prints to stdout; Claude sees the warning as additional context but proceeds
- **PASS** - hook exits 0 with no output; nothing surfaces to Claude
- **CONTEXT** - hook exits 0 and prints to stdout; used for SessionStart context injection

## PreToolUse on Bash: `pre-commit-guard.sh`

The branch is read from the directory the commit runs in, resolved in this order: `cd` / `pushd` steps before the commit (`cd -` included), `git -C <dir>` or `--git-dir` on the commit itself, the hook input's `.cwd` (or the process cwd) when inside a repo, then `$CLAUDE_PROJECT_DIR`. A primary checkout on `main` with the commit running in a linked worktree on a feature branch is therefore a feature-branch commit. Every `git commit` in a command is checked, and the guard blocks if any of them lands on `main`. When a step cannot be modeled (a `cd` inside a subshell or `bash -c` that ends before the commit, `popd`, a `$VAR` or `$(...)` path, `GIT_DIR=`), the guard fails closed: it checks every directory the command visits, plus `$CLAUDE_PROJECT_DIR` for an unexpandable path.

| Bash command | Branch | Expected |
|---|---|---|
| `git commit -m "..."` | `main` or `master` | **BLOCK**: "refusing git commit on main/master" |
| `git commit -m "..."` | feature branch | **WARN**: staged file list |
| `git -C <worktree> commit`, `cd <worktree> && git commit` (quoted, relative, or `~` paths) | primary on `main`, worktree on feature branch | **WARN** (not blocked) |
| `git commit` with hook cwd (or input `.cwd`) inside a worktree | primary on `main`, worktree on feature branch | **WARN** (not blocked) |
| `git -C <primary> commit`, `cd <primary> && git commit` | primary on `main`, run from a worktree | **BLOCK** |
| `git commit` with hook cwd outside any repo | `$CLAUDE_PROJECT_DIR` on `main` | **BLOCK** (falls back to the project dir) |
| `git -C <worktree> commit && git -C <primary> commit`, `cd <wt> && git commit && cd <primary> && git commit` | primary on `main` | **BLOCK** (every commit is checked) |
| `(cd <worktree> && make) && git commit`, `cd <wt> && cd - && git commit` | cwd is the primary on `main` | **BLOCK** |
| `pushd <primary>`, `cd -P <primary>`, `--git-dir <primary>/.git`, `GIT_DIR=<primary>/.git`, `/usr/bin/git commit`, `` `git commit` ``, `bash -c 'cd <primary> && git commit'`, backslash-escaped paths | primary on `main`, run from a worktree | **BLOCK** |
| `cd "$VAR" && git commit`, `git -C "$(...)" commit` | `$CLAUDE_PROJECT_DIR` on `main` | **BLOCK** (unexpandable path fails closed, even when it would have named a worktree) |
| `git status`, `git -C <dir> status`, `git commit-tree` | any | **PASS** (not a git commit) |
| `npm test` | any | **PASS** |
| any command | `BTS_HOOKS_DISABLED=1` | **PASS** |

## SessionStart: `shop-status.sh`

| Project state | Expected |
|---|---|
| no `docs/plans/00_master_checklist.md` | **PASS** - silent (not a bytheslice project) |
| checklist present | **CONTEXT** - stage counts, Prep progress, next not-started row |
| checklist present, nested v5 (`## Pie N` headings) | **CONTEXT**: Prep progress, pie and slice counts via the dual-read lib helpers (`bts_unit_counts` / `bts_slice_counts`), first open pie |
| checklist present, flat v4 (`Status:` table rows) | **CONTEXT**: Prep progress (if a `## Prep` section exists), stage counts from the `Status:` scan, next not-started row |
| `BTS_HOOKS_DISABLED=1` | **PASS** - silent |

## PreToolUse on Write/Edit: `stage-plan-guard.sh`

| Tool target | Session state | Expected |
|---|---|---|
| `docs/plans/stage_1_foo.md` | current session, `skill == "sell-slice"` | **WARN** - "plans are normally static" (downgraded from BLOCK in v5, C4) |
| `docs/plans/stage_1_foo.md` | current session, `skill != "sell-slice"` | **PASS** |
| `docs/plans/00_master_checklist.md` | current session, `skill == "sell-slice"` | **PASS** - not a `stage_*` plan file |
| `src/app/page.tsx` (non-plan path) | current session, `skill == "sell-slice"` | **PASS** |
| `docs/plans/stage_1_foo.md` | state from a *different* `session_id` | **PASS** - stale state never blocks |
| `docs/plans/stage_1_foo.md` | no `last-precheck.json` | **PASS** - fail open |
| any stage plan path | `BTS_HOOKS_DISABLED=1` | **PASS** |

## PreToolUse on Write/Edit: `library-gate-guard.sh`

| Tool target | State | Expected |
|---|---|---|
| `app/dashboard/page.tsx` (watched) | no `library-approvals.json` | **PASS**, gate not armed (Phase 4.5's `arm` step has not run, e.g. a backend slice) |
| `app/dashboard/page.tsx` (watched) | approvals file present, no approval entry, current-session `skill == "sell-slice"` | **WARN** - "no library approval is recorded" |
| `app/dashboard/page.tsx` (watched) | approvals file present, an approval recorded, `skill == "sell-slice"` | **PASS** |
| `lib/util.ts` (not watched) | approvals file present, no approval, `skill == "sell-slice"` | **PASS** - path not under a watched glob |
| `app/dashboard/page.tsx` (watched) | approvals present, no approval, `skill != "sell-slice"` | **PASS** |
| `app/dashboard/page.tsx` (watched) | approvals present, state from a *different* `session_id` | **PASS** - stale state never warns |
| any watched path | `BTS_HOOKS_DISABLED=1` | **PASS** |

## State writer: `record-library-approval.sh`

Not an event hook: `/sell-slice` Phase 4.5 invokes it directly. `arm` opens the approval window (the gate above starts warning); `approve` closes it (the gate passes). Session id defaults to the one in `last-precheck.json`, the exact value the gate compares against.

| Invocation | Prior state | Expected |
|---|---|---|
| `arm --slice <n.m>` | file present or not | file written: zero approvals, default `watched_paths`, session id + slice + `armed_at`; gate now **WARN**s on watched paths |
| `arm --slice <n.m>` | approvals recorded for a prior slice | file reset: approvals emptied, slice and `armed_at` updated; gate **WARN**s again |
| `approve --slice <n.m> --components "<a>,<b>"` | file armed | one `status: "approved"` entry appended per component (`component_id`, `at`, `session_id`, `slice`); gate **PASS**es on watched paths |
| `approve --slice <n.m> --components "<a>"` | no file (arm skipped) | file initialized with the approved entries; gate **PASS**es |
| `approve` without `--components`, or either subcommand without `--slice` | any | usage error, exit 2, nothing written |
| any subcommand | `BTS_HOOKS_DISABLED=1` | no-op, exit 0, nothing written |

## PreCompact: `compact-snapshot.sh`

| State | Expected |
|---|---|
| `last-precheck.json` present | **PASS** (exit 0, silent) - writes `compact-snapshot.json` with skill carried over |
| no `last-precheck.json` | **PASS** (exit 0, silent) - still writes a minimal `compact-snapshot.json` |
| checklist present with unfinished lines | snapshot's `master_checklist_summary` holds up to 3 of them |
| `BTS_HOOKS_DISABLED=1` | **PASS** - no snapshot written |

## Activity events: `kitchen-log.sh`

Every wired logger hook runs synchronously and silently (exit 0), completing its local append before returning so session shutdown does not strand background rows. Each accepted envelope appends exactly one compact JSON row under `.claude/.bytheslice-state/kitchen/activity.jsonl`; event-specific absent fields are omitted.

| Event or condition | Expected |
|---|---|
| `SessionStart`, `SubagentStart`, `SubagentStop`, `Stop` | one row with the matching `ev`; subagent identity retained when present |
| `PreToolUse` Agent, `PostToolUse` Agent | one row; description and agent type from dispatch input; result identity, integer tokens/duration and completion status from Agent response |
| `PreToolUse` Skill | one row carrying only the skill name, never arguments |
| `UserPromptExpansion` | one row carrying command name and source, never prompt or arguments |
| Hook registration | exactly eight synchronous logger registrations (`async` absent or false), with exact Agent / Skill matchers; registered Stop command returns only after its row is readable |
| Prompt, assistant message, arguments, output, contents, secret/token fields | absent from every row and stdout/stderr, including nested and unknown fields |
| Dispatch description has CR / LF / tabs and more than 120 Unicode characters | whitespace reduced to one line, label truncated to 120 Unicode characters |
| Event lacks optional fields or has empty `agent_type` | row still written; absent and empty optional fields omitted |
| Description starts `P7 S7.3 build:`; branch/checklist disagree | label wins for both pie and slice |
| Branch matches `pie-4` or `pie/4`; checklist has earlier open pies | branch wins for pie; first open slice under that pie supplies slice |
| Input cwd is a linked worktree; project root is on main | worktree branch decides attribution; log stays at project root |
| Branch resolves a pie absent from checklist | branch pie retained; unrelated checklist slice never assigned |
| No matching branch; checklist includes completed pie/slice headings | first open slice under first open pie; checked/struck/completed headings skipped |
| No matching branch or checklist | pie and slice omitted |
| Current log exceeds 2 MiB | rotate to `activity.1.jsonl`, replacing the previous rotation; new row starts current log |
| Current log is exactly 2 MiB | append without rotation; following event rotates the oversized file |
| Concurrent events at rotation boundary | serialized rotation and append retain every row across current and one rotation |
| Healthy writer paused during size check; concurrent contenders | owner remains exclusive; existing log and rotation stay untouched until release; every completed event is retained |
| TERM after lock symlink publication, before acquisition returns | exact owned symlink and claim directory removed; exit 0 silently; next event writes normally |
| Writer SIGKILLed while holding activity lock; concurrent recovery | one reclaimer takes abandoned ownership; later writers recover without unlinking healthy ownership or losing sibling rotation rows; ownership artifacts removed |
| `BTS_HOOKS_DISABLED=1` | no output, no state directory created |
| `jq` unavailable, Node available | same row fields and sanitation as jq, excluding timestamp |
| Neither jq nor Node available | exit 0 silently without creating state |
| Invalid JSON, multiple JSON values, array/scalar envelope or unwired tool/event | exit 0 silently without creating a log |

### Session skill marker

`kitchen-log.sh` is the only writer of `.claude/.bytheslice-state/last-precheck.json`. It records state and never blocks a prompt; no ByTheSlice hook does.

| Event | Expected |
|---|---|
| `UserPromptExpansion` with `command_name: "bytheslice:sell-slice"` | marker written: `session_id` from the envelope, `skill: "sell-slice"` (canonical short form), timestamp, branch, tree; exit 0, silent |
| `PreToolUse` Skill with `skill: "bytheslice:box-it-up"` (or a bare `sell-pie`) | marker written with the canonical short skill name; exit 0, silent |
| A non-ByTheSlice command or skill (`commit`, `other-plugin:sell-slice`), or an event with no skill | no marker written; exit 0, silent |
| Command or skill arguments | never copied into the marker |

## Notes

- Every hook honors `BTS_HOOKS_DISABLED=1` as the first action after `set -u`. That's the supported per-session disable.
- Every hook tolerates missing `jq`; existing guards use `sed`, while `kitchen-log.sh` uses Node or silently skips logging when neither parser is available.
- All state lives under `.claude/.bytheslice-state/` (gitignored).
- All awk in the hooks is POSIX-portable (BSD awk on macOS has no gawk extensions such as the 3-argument `match()`).
