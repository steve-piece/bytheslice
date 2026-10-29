# Hook Scenario Contract

This file is the **canonical source of truth** for hook behavior. Every row is one scenario the hook scripts handle. Both the scripts in this directory and the per-skill `## Preconditions` sections of every SKILL.md reference this table. If a scenario is missing here but enforced in code, that's drift - fix the table or the code, not both independently.

`hooks/test.sh` reads this file and runs every row against the live hook scripts. A failing test means the implementation and the contract have diverged.

## Legend

Every wired script exits 0, and only `workflow-guard.sh` prints a deny decision (`hooks/test.sh` checks this for every script `hooks.json` wires). No hook blocks a prompt.

- **DENY** - hook exits 0 and prints Claude Code hook JSON with `permissionDecision: "deny"` and a reason starting `BLOCKED [bytheslice <rule>]` that names the skill to use and the operator override; the tool call does not run (Cursor: `{"permission":"deny"}`)

- **WARN** - hook exits 0 and prints Claude Code hook JSON whose text starts `WARN`: `hookSpecificOutput.additionalContext` reaches the model, `systemMessage` reaches the person; the tool call proceeds
- **NOTE** - hook exits 0 and prints plain text, which Claude Code shows in the transcript only
- **PASS** - hook exits 0 with no output; nothing surfaces to Claude
- **CONTEXT** - hook exits 0 and prints to stdout; used for SessionStart context injection

## Workflow guard: `workflow-guard.sh`

Applies only when a master checklist exists (in the session's checkout or, from a worktree, the primary checkout). "Skill" is the session's latest ByTheSlice skill in the kitchen activity log; "writer" is the hook input's `agent_type`. Under `enforcement: "warn"` (config) or `BTS_ALLOW_BYPASS=1` (launch env) every **DENY** below is a **WARN** instead.

| Event and input | State | Expected |
|---|---|---|
| Write `docs/plans/stage_*.md` (new file) | no skill | **DENY** `plan-file`, names `/special-order` |
| same | writer `bytheslice:phased-plan-writer` or a bare registered writer | **PASS** |
| same | writer `general-purpose` | **DENY** |
| same | skill `special-order` or `cook-pizzas` | **PASS** |
| same | skill `sell-pie` | **DENY** (new stage files come from planners) |
| Edit an existing stage file | skill `sell-pie` (build notes) | **PASS** |
| Edit the checklist ticking a box or changing a slice body | no skill | **PASS** |
| Edit or Write the checklist adding or renaming a pie or slice heading | no skill | **DENY** `plan-heading`, names the heading and `/special-order` |
| Bash that writes a plan file (a `>`/`>>` redirect or `tee` into it, `sed -i`/`perl -i` on it, `cp`/`mv`/`install`/`ln` onto it, `touch`/`rm`/`truncate`, a script opening it to write) | no skill | **DENY** `plan-shell-write`, names the file and `/special-order` |
| same, appending to an existing stage file or the checklist | any ByTheSlice skill | **PASS** (the shell cannot be diffed for headings) |
| same, a new stage file | skill `sell-pie` | **DENY** |
| Bash that reads plan files (`cat`, `grep`, `cp` from one to elsewhere) | any | **PASS** |
| same | skill `cook-pizzas` | **PASS** |
| Agent with no type, `general-purpose`, or a project agent listing Edit | no skill | **DENY** `adhoc-agent`, names `/sell-slice` |
| Agent `someplugin:x` whose definition is not found | no skill | **DENY**, says the definition was not found |
| Agent `Explore`, a project agent without write tools, `bytheslice:implementer` | any | **PASS** |
| Agent `general-purpose` | skill `sell-slice` | **PASS** |
| Agent `general-purpose` from a worktree whose plans live in the primary checkout | no skill | **DENY** |
| Bash `gh pr create` or `gh as <user> pr create`, branch commit `feat(pie-1): 1.1 ...` | ledger has no verifier pass for 1.1 | **DENY** `pr-unverified`, lists `Slice 1.1`, names `/sell-slice` |
| same | no ledger file at all | **WARN** (`No Pass ledger`), never refused |
| same | ledger has a `slice-verifier` pass for 1.1 | **PASS** |
| same on `pie-1-*` with untagged commits | 1.1 verified, 1.2 not | **DENY** listing `Slice 1.2` only |
| same on a non-pie branch with no slice commits; `git status` | any | **PASS** |
| same on a ship-once `ship/<app>` branch: pie merge commits (`merge(pie-N): ...`, no slice id) plus slice commits | every slice verified | **PASS** |
| same | one slice commit unverified | **DENY** listing it |
| Cursor `beforeShellExecution` `gh pr create` | unverified slice | `{"permission":"deny"}`; other commands and `BTS_HOOKS_DISABLED=1` answer `{"permission":"allow"}` |
| Edit `bytheslice.config.json` to `"enforcement": "warn"`; Write `.claude/settings.local.json` adding `BTS_ALLOW_BYPASS` | enforcement `block` | **DENY** `operator-switch` |
| UserPromptSubmit `/goal ...` or "add a new feature ..." | checklist present | **CONTEXT** (`hookSpecificOutput.additionalContext` naming `/special-order`, `/sell-slice`, `/sell-pie`); never refused |
| UserPromptSubmit "implement Slice 2.2" (build, work on, finish ... Slice N.M) | checklist present | **CONTEXT** naming `/sell-slice N.M` and `/sell-pie` |
| UserPromptSubmit `/special-order ...` or an ordinary question | any | **PASS** |
| any | no checklist, `BTS_HOOKS_DISABLED=1`, malformed input | **PASS** |
| `workflow-guard.js doctor <root>` | | prints `Feature intake: present in CLAUDE.md` or `MISSING`, `Enforcement: block (default)` (bypass noted), `Hooks: workflow guard active on ...` |
| `workflow-guard.js intake <root>` | no rules file / stale block / `AGENTS.md` only | creates `CLAUDE.md` / replaces the block in place, other lines kept / adds it to `AGENTS.md`; a second run is unchanged |

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

## Lobby registry and signals: `lobby-signal.sh`

Machine-level files for the Lobby, under `${BTS_HOME:-$HOME/.bytheslice}`: `projects.json` (`{"v":1,"projects":[{"root","name","addedAt"}]}`) and `signals/<sid>.json` (`{"v":1,"sid","root","t","working","subagents","waiting"}`). `root` is the parent of `git rev-parse --git-common-dir` as a physical path, so a worktree rolls up to its primary checkout. Only a primary holding `docs/plans/00_master_checklist.md` or `bytheslice.config.json` counts as a project. Every Claude Code run exits 0 and prints nothing; writes are atomic (temp file, then rename, mode 0600) under a short lock. `hooks/test.sh` runs the named cases once with jq and once with the Node fallback, against a fixture `HOME` and a temp `BTS_HOME`.

| Case | Event | Fixture | Expected |
|---|---|---|---|
| SessionStart registers the primary | `SessionStart` | primary checkout with a checklist, empty lobby home | `projects.json` holds one `{root, name, addedAt}` row for the primary (physical path, basename, integer ms), mode 0600; silent |
| a linked worktree rolls up to one row | `SessionStart` | cwd is a linked worktree of the registered primary, its `addedAt` pinned | still one row, `root` the primary, `addedAt` unchanged |
| a vanished project folder is pruned | `SessionStart` | a second registered project whose folder was deleted | that row dropped, the live row kept with its `addedAt` |
| a non-ByTheSlice repo is not registered | `SessionStart`, `UserPromptSubmit` | a git repo with neither file; a non-git folder with a checklist | `projects.json` unchanged, no signal written |
| UserPromptSubmit sets working | `UserPromptSubmit` | cwd is a linked worktree | `signals/<sid>.json` is `{v:1, sid, root:<primary>, t:<ms>, working:true, subagents:0, waiting:null}` in that key order, mode 0600 |
| SubagentStart and SubagentStop count subagents | `SubagentStart` x2, `SubagentStop` x3 | one session | `subagents` 2, then 1, then 0 (floored, never negative); `working` true |
| Stop clears working | `UserPromptSubmit`, `SubagentStart`, `Stop` | one session | `working` false, `subagents` 1 kept, `waiting` null |
| Notification permission_prompt sets waiting permission | `Notification` | `notification_type: permission_prompt` | `waiting` "permission"; `working` and `subagents` kept |
| Notification idle_prompt sets waiting idle | `Notification` | `notification_type: idle_prompt` | `waiting` "idle" |
| Notification of another type changes nothing | `Notification`, `PreToolUse` | `auth_success`, `elicitation_dialog`, empty or absent type; `t` pinned | the signal file is byte-identical (`t` not refreshed); no file for a new session |
| UserPromptSubmit clears waiting | `UserPromptSubmit` | `waiting` "idle" | `waiting` null, `working` true, `t` refreshed |
| no prompt text reaches the lobby dir | all six events | `prompt`, `message`, `title`, `last_assistant_message`, tool input, transcript path and an env var all hold `SECRET-PROMPT-TEXT` | no file under the lobby home contains it; only `projects.json` and `signals/*.json` exist, each signal holding exactly the contract keys |
| corrupt projects.json recovers | `SessionStart`, `SubagentStart` | `projects.json` is `{broken`, a signal is `not json`; then a list with junk, a non-string root, a dead root and a duplicate | both files replaced with valid contract JSON; junk and dead rows dropped, the duplicate folded to one row |
| cursor sessionStart prints valid JSON | Cursor `sessionStart` | `BTS_HOST=cursor`, `workspace_roots[0]` a linked worktree | stdout exactly `{}`, exit 0; the primary registered |
| (Cursor) other events | `beforeSubmitPrompt`, `subagentStart`, `subagentStop`, `stop` | `conversation_id` (the parent's `parent_conversation_id` on `subagentStart`), prompt and task text present | stdout `{"continue":true}`, `{"permission":"allow"}`, `{}`, `{}`; one signal per conversation id updated as the matching Claude Code event; no prompt or task text written |
| (Cursor) every exit path | `subagentStart` with `BTS_HOOKS_DISABLED=1`; unreadable, empty or repo-less input | | stdout is still the valid JSON answer for the event (`{}` when unknown); nothing written |
| (all hosts) home, disable, parsers | any | `BTS_HOME` unset; `BTS_HOOKS_DISABLED=1`; neither jq nor Node | writes under `$HOME/.bytheslice` (dir 0700); disabled or parser-free runs create nothing |
| (all hosts) cleanup and lock | `SessionStart`, `UserPromptSubmit`, 12 parallel `SubagentStart` | a signal older than 7 days; a lock held by a dead pid, an ownerless lock over a minute old, a live pid's lock | the old signal is deleted on SessionStart; dead and ownerless locks are reclaimed; a live lock makes the writer give up quietly after about two seconds; parallel starts count to exactly 12 |

## Wiring: `hooks.json`

| Check | Expected |
|---|---|
| Every `command` in `hooks.json` | names a script that exists under `hooks/` |
| Every script `hooks.json` wires | contains no `exit 2` and prints no block decision (`"decision": "block"`, `"permissionDecision": "deny"`) |
| Every sourced `lib/*.sh` | contains no `exit 2` |
| `kitchen-log.sh` registrations | exactly eight (asserted with the kitchen rows above) |
| `lobby-signal.sh` registrations | exactly one each on `SessionStart`, `SubagentStart`, `SubagentStop`, `Stop`, `UserPromptSubmit` and `Notification`: no matcher, timeout 5, synchronous |
| `hooks-cursor.json` | `lobby-signal.sh` with `BTS_HOST=cursor` on `sessionStart`, `beforeSubmitPrompt`, `subagentStart`, `subagentStop` and `stop` (Cursor has no Notification equivalent) |

## Notes

- Every hook honors `BTS_HOOKS_DISABLED=1` as the first action after `set -u`. That's the supported per-session disable. Under `BTS_HOST=cursor`, `pre-commit-guard.sh` and `lobby-signal.sh` first arm the JSON answer Cursor needs, then honor it.
- Every hook tolerates missing `jq`; `pre-commit-guard.sh` falls back to `sed`, while `kitchen-log.sh` and `lobby-signal.sh` use Node or silently skip writing when neither parser is available.
- All per-project state lives under `.claude/.bytheslice-state/` (gitignored). The one machine-level exception is the Lobby's `${BTS_HOME:-$HOME/.bytheslice}` (`projects.json`, `signals/`), written only by `lobby-signal.sh`.
- All awk in the hooks is POSIX-portable (BSD awk on macOS has no gawk extensions such as the 3-argument `match()`).
