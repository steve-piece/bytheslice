# Hook Scenario Contract

This file is the **canonical source of truth** for hook behavior. Every row is one scenario the hook scripts handle. Both the scripts in this directory and the per-skill `## Preconditions` sections of every SKILL.md reference this table. If a scenario is missing here but enforced in code, that's drift - fix the table or the code, not both independently.

`hooks/test.sh` reads this file and runs every row against the live hook scripts. A failing test means the implementation and the contract have diverged.

## Legend

No ByTheSlice hook blocks: every wired script exits 0, and none prints a block decision (`hooks/test.sh` checks this for every script `hooks.json` wires).

- **WARN** - hook exits 0 and prints Claude Code hook JSON whose text starts `WARN`: `hookSpecificOutput.additionalContext` reaches the model, `systemMessage` reaches the person; the tool call proceeds
- **NOTE** - hook exits 0 and prints plain text, which Claude Code shows in the transcript only
- **PASS** - hook exits 0 with no output; nothing surfaces to Claude
- **CONTEXT** - hook exits 0 and prints to stdout; used for SessionStart context injection

## PreToolUse on Bash: `pre-commit-guard.sh`

The branch is read from the repository the commit runs in, resolved in this order: `cd` / `pushd` steps before the commit (`cd -` included), `git -C <dir>` or `--git-dir` on the commit itself, then the hook input's `.cwd` (or the process cwd). It never falls back to `$CLAUDE_PROJECT_DIR`: the project dir is not where the command runs, and in 5.3 that fallback named a scratch repo's commit as a commit on the primary checkout's `main`. A primary checkout on `main` with the commit running in a linked worktree on a feature branch is a feature-branch commit. Every `git commit` in a command is checked. When the target cannot be told from the command text (a `cd` inside a subshell or `bash -c` that ends before the commit, `popd`, a `$VAR` or `$(...)` path, `git checkout` / `git switch` earlier in the command, a path that does not exist yet, or a directory outside any git repo), the guard warns "branch unknown" instead of guessing.

| Bash command | Branch | Expected |
|---|---|---|
| `git commit -m "..."` | `main` or `master` | **WARN**: "git commit on main/master (<dir>)", plus the staged file list; exit 0 |
| `git commit -m "..."` | feature branch | **NOTE**: staged file list |
| `git -C <worktree> commit`, `cd <worktree> && git commit` (quoted, relative, or `~` paths) | primary on `main`, worktree on feature branch | **NOTE** (no warning) |
| `git commit` with hook cwd (or input `.cwd`) inside a worktree | primary on `main`, worktree on feature branch | **NOTE** (no warning) |
| `git -C <primary> commit`, `cd <primary> && git commit` | primary on `main`, run from a worktree | **WARN** naming `main` |
| `git commit` with hook cwd outside any repo | `$CLAUDE_PROJECT_DIR` on `main` | **WARN** "branch unknown"; never names the project dir's `main` |
| `S=<scratch>; mkdir -p $S && cd $S && git init && git commit` | primary on `main` | **WARN** "branch unknown"; never names the primary's `main` |
| `git -C <worktree> commit && git -C <primary> commit`, `cd <wt> && git commit && cd <primary> && git commit` | primary on `main` | **WARN** naming `main` (every commit is checked) |
| `cd <wt> && cd - && git commit` | cwd is the primary on `main` | **WARN** naming `main` |
| `(cd <worktree> && make) && git commit` | cwd is the primary on `main` | **WARN** "branch unknown" (a subshell cd is not followed) |
| `pushd <primary>`, `cd -P <primary>`, `--git-dir <primary>/.git`, `GIT_DIR=<primary>/.git`, `/usr/bin/git commit`, `` `git commit` ``, `bash -c 'cd <primary> && git commit'`, backslash-escaped paths | primary on `main`, run from a worktree | **WARN** naming `main` |
| `cd "$VAR" && git commit`, `git -C "$(...)" commit`, `popd && git commit` | any | **WARN** "branch unknown" |
| `git switch -c <branch> && git commit`, `git checkout <branch> && git commit` | cwd on `main` | **WARN** "branch unknown" (an earlier switch moves HEAD before the commit) |
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
| checklist present, session started by `resume` or `compact` | **CONTEXT**: the same summary (the hook has no `source` matcher), so a compacted session re-orients from it |
| `BTS_HOOKS_DISABLED=1` | **PASS** - silent |

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
| Unlabeled row (SubagentStart, SubagentStop, Stop, Skill) in a session with a labeled dispatch; branch/checklist disagree | inherits the session's latest labeled row (same `sid`): on SubagentStart or SubagentStop the labeled row with the same `aid` first, then the same agent type, then the latest; another session's labels never count |
| Inheritance candidates include a torn line, or sit only in `activity.1.jsonl` | torn line skipped; rotated rows still searched; exit 0 silently |
| No labeled row in the session; branch matches `pie-4` or `pie/4`; checklist has earlier open pies | branch wins for pie; first open slice under that pie supplies slice |
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

## Wiring: `hooks.json`

| Check | Expected |
|---|---|
| Every `command` in `hooks.json` | names a script that exists under `hooks/` |
| Every script `hooks.json` wires | contains no `exit 2` and prints no block decision (`"decision": "block"`, `"permissionDecision": "deny"`) |
| `kitchen-log.sh` registrations | exactly eight (asserted with the kitchen rows above) |

## Notes

- Every hook honors `BTS_HOOKS_DISABLED=1` as the first action after `set -u`. That's the supported per-session disable.
- Every hook tolerates missing `jq`; `pre-commit-guard.sh` falls back to `sed`, while `kitchen-log.sh` uses Node or silently skips logging when neither parser is available.
- All state lives under `.claude/.bytheslice-state/` (gitignored).
- All awk in the hooks is POSIX-portable (BSD awk on macOS has no gawk extensions such as the 3-argument `match()`).
