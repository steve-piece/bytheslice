# ByTheSlice Hooks

Deterministic hooks that log kitchen activity, put the checklist summary in front of the model at session start, and warn on a risky commit. **No hook blocks**: every script exits 0. A warning is printed as Claude Code hook JSON, so `hookSpecificOutput.additionalContext` reaches the model and `systemMessage` reaches the person; plain stdout from a tool hook shows in the transcript only.

The Pass, the plugin's Claude Code mod (a TypeScript hooks module that `hooks.json` names under `modules` beside the `hooks` block), lives in [`mod/`](../mod/); Cursor reads only the `hooks` key and ignores it.

## Hooks

| Hook | Event | Behavior |
|---|---|---|
| `shop-status.sh` | `SessionStart` | Reads `docs/plans/00_master_checklist.md` if present and injects a compact summary: Prep progress, plus pie/slice counts and the first open pie (nested v5) or stage counts and the next not-started row (flat v4). It has no `source` matcher, so it runs again after a resume or a compaction and re-orients the session. |
| `pre-commit-guard.sh` | `PreToolUse` (Bash matcher) | WARNs (exit 0, never blocks) on `git commit` on main/master, reading the branch of the repository each commit in the command runs in (parsed `cd`/`pushd`, `git -C`, `--git-dir`, `GIT_DIR=`, else the hook cwd), so worktree commits are judged by the worktree's branch. It never reads `$CLAUDE_PROJECT_DIR`: shell forms it cannot follow (subshell `cd`, `popd`, `$VAR` paths, a branch switch earlier in the command, a directory that is not a git repo yet) warn "branch unknown". Otherwise prints a short staged-files summary (transcript only). |
| `kitchen-log.sh` | `SessionStart`, `SubagentStart`, `SubagentStop`, `PreToolUse` (Agent/Skill), `PostToolUse` (Agent), `UserPromptExpansion`, `Stop` | Fast synchronous local activity rows with an explicit metadata allowlist, completed before the hook returns including Stop during session shutdown; silent and always exit 0; labels capped at 120 characters; pie/slice attribution from label, then the same session's latest labeled row (same agent id, then agent type, first), then branch, then checklist; serialized 2 MiB rotation with one backup. Uses jq or Node and skips logging when neither exists. |

## Inventory (5.4)

Every script that was in this directory at the start of slice 5.4, with the evidence for keeping or retiring it. A retired script's file, `hooks.json` entries, tests and scenario rows are gone; its exact filename stays in `CHANGELOG.md`.

**Sample.** 408 Claude Code sessions on this machine whose transcript lists the ByTheSlice skills (2026-06-08 to 2026-10-21): 14 in this repo and its worktrees, 5 in scratch probe repos, 389 in other projects. Claude Code records a hook in the transcript only when it prints or fails, so warnings and blocks are counted from transcripts (recorded from 2026-09-09 on), and silent runs from the state files on disk. Kitchen rows come from the 6 `activity.jsonl` logs on this machine (381 rows, 7 sessions, all on 2026-10-21, the day the logger shipped).

| Hook | Event / matcher | Sessions seen / sampled | Warnings | Blocks | Covered by | Decision |
|---|---|---|---|---|---|---|
| `kitchen-log.sh` | 8 entries: `UserPromptExpansion`, `SessionStart`, `SubagentStart`, `SubagentStop`, `PreToolUse` Agent and Skill, `PostToolUse` Agent, `Stop` | 7 / 7 kitchen sessions (381 rows) | 0 (silent by design) | 0 | the kitchen and the Pass ledger read its rows | **Keep**; its session skill marker write was dropped (no reader left; the mod tracks the active skill) |
| `shop-status.sh` | `SessionStart` | 52 / 408 (73 context rows: 38 startup, 13 resume, 22 compact) | n/a (context) | 0 | nothing: the Pass pane and band are for the person, `bts_status` is pull-only | **Keep** |
| `pre-commit-guard.sh` | `PreToolUse` Bash | 51 / 408 (79 staged summaries, 6 cancelled, 1 error) | 0 | 25 (plus 2 during this inventory) | Pass mod `commit-on-main` on Claude Code 2.1.299+; nothing on other hosts | **Keep, converted to warn**: 22 of the 25 blocks were false (7 the old worktree bug, 7 a `$VAR` or not-yet-a-repo path read as the project dir's `main`, 4 a branch switch earlier in the command, 4 commit text that was not a commit); the 3 true ones were a client repo and a scratch clone committed on `main` on purpose |
| stage plan guard | `PreToolUse` Write and Edit | 0 / 408 | 0 | 0 | Pass mod `plan-write-during-bake` (`mod/checks-checklist.ts`, seeded in `mod/seeded.test.tsx`) | **Retired** (mod covers it). 1,706 plan writes in 19 sessions never met its same-session marker condition |
| library gate guard | `PreToolUse` Write and Edit | 0 / 408 | 0 | 0 | `sell-slice` Phase 4.5 prose: no production-route import before approval | **Retired** (never warned). It was dormant until armed, and no project on this machine ever held an approvals file; 3,871 watched-path writes in 81 sessions were all silent |
| library approval recorder | not wired (`sell-slice` Phase 4.5 ran it) | 0 runs (no approvals file anywhere) | 0 | 0 | same prose | **Retired** with its only reader |
| compact snapshot | `PreCompact` | ran: 19 snapshot files in 19 project dirs, latest 2026-10-20; 93 compactions in transcripts | 0 (silent by design) | 0 | `shop-status.sh` on `SessionStart:compact` (22 rows), and the bakers' prose: call `bts_status` or re-read the checklist at every phase boundary | **Retired**: nothing ever read the snapshot it wrote |

**Hosts without the mod.** Cursor reads only the `hooks` key of `hooks.json` and never loads the mod; Claude Code below 2.1.299 keeps the mod inert. On those hosts the reduced set means: plan writes during a bake draw no warning (the mod was already their only cover once the stage plan guard went), production-route writes before a library approval draw no warning (only the `sell-slice` prose holds the line, as it did whenever the gate was unarmed), and compaction writes no snapshot (`shop-status.sh` still re-injects the summary on Claude Code; Cursor's handling of `SessionStart` sources is unconfirmed). A commit on `main` still draws the `pre-commit-guard.sh` warning everywhere the `hooks` key runs. The operator accepted this loss.

## Kitchen activity

`kitchen-log.sh` writes only allowlisted metadata to `.claude/.bytheslice-state/kitchen/activity.jsonl`, with one rotated backup at 2 MiB. Dispatch descriptions are single-line and capped at 120 characters. Prompts, agent final messages, tool output, skill arguments, file contents and environment values never enter a row. The hook completes each append before returning; asynchronous hooks lost the final `Stop` event at shutdown. It remains silent and always exits 0, including on malformed input or filesystem failures. See [the kitchen architecture](../docs/architecture.md#live-kitchen) for transport, setup evidence and privacy details.

## The scenario contract

[`scenarios.md`](./scenarios.md) is the canonical source of truth: every row is one (skill / state / expected) tuple the hooks must satisfy. It is what `test.sh` verifies and what every SKILL.md `## Preconditions` section indirectly references. **If you edit a hook's behavior, update `scenarios.md` first and add a row to `test.sh`** - otherwise the contract has drifted.

## Tests

```bash
bash hooks/test.sh
```

Runs isolated-fixture regression checks covering the scenarios in `scenarios.md`. The kitchen logger cases require Node.js for JSON assertions and exercise both jq (when installed) and the Node fallback, including parser-free execution, synchronous Stop completion, interrupted ownership recovery, and concurrent rotation. Each case sets up a throwaway repo under `$TMPDIR`, runs a hook with synthetic input, and checks exit code, output or local state. Failures print the divergence inline.

Run it locally before committing changes to anything under `hooks/`. No CI workflow is wired - this is intentional given the plugin's "$0 Actions budget" stance; opt in later if you want it on PRs.

## Shared helpers

`lib/checklist.sh` is sourced by every hook. It exposes:

| Function | Returns |
|---|---|
| `bts_root` | absolute path of the active project (uses `$CLAUDE_PROJECT_DIR` then git toplevel then pwd) |
| `bts_checklist_path` | path to `docs/plans/00_master_checklist.md` or empty |
| `bts_prep_counts` | `"<done> <total>"` of Prep checkboxes, empty if no `## Prep` section |
| `bts_branch [dir]` / `bts_branch_class [dir]` | current branch + `"main"` / `"feature"` / `"unknown"` classification, read from `dir` (default `bts_root`) |
| `bts_commit_dirs <cmd> [cwd]` | one line per `git commit` in a Bash command: the repository it runs in (`cd`/`pushd` steps, then `git -C`/`--git-dir`, then `cwd`; never `bts_root`), or `?` when that cannot be told (a step it cannot model, a path that does not exist yet, a directory outside any repo); returns 1 when the command has no `git commit` |
| `bts_state_dir` | ensures `.claude/.bytheslice-state/` exists, echoes path |
| `bts_checklist_layout` | dual-read layout detection: `"pie"` (any `## Pie N`), `"stage"` (any `## Stage N`, no Pie), or `""` (neither) |
| `bts_unit_counts` | `"<done> <total>"` of top-level work units - `## Pie N` (v5) or `## Stage N` (v4), Pie layout preferred; empty if neither |
| `bts_slice_counts` | `"<done> <total>"` of `### Slice N.M` headings; empty on a flat v4 checklist |

## State

All hook state lives under `.claude/.bytheslice-state/` (gitignored): today that is the kitchen activity log (see Kitchen activity). Files an earlier version left there (the library approvals record, the compaction snapshot, the session skill marker) are no longer read or written; deleting them is safe. The Pass mod tracks the active skill itself, from typed input.

## Disable

Two supported escape hatches, in order of preference:

1. **Per-session env var** - `export BTS_HOOKS_DISABLED=1` before launching Claude Code. Every hook in this directory short-circuits on exit 0 without running its checks. Use this for one-off experimental flows where the warnings are getting in your way. Wired check: see the second non-comment line of every `*.sh` in this dir.
2. **Global disable via settings** - set `"disableAllHooks": true` in `.claude/settings.local.json`. This is the Claude Code primitive and disables every hook from every plugin, not just ours.

Prefer (1) - it only affects bytheslice hooks and reverts the moment your shell session ends.
