# ByTheSlice Hooks

Deterministic guards that replace repetitive prose in CLAUDE.md and SKILL.md files. Hooks fire on Claude Code lifecycle events; scripts return exit-code 2 to BLOCK or exit-code 0 (with stdout) to inject WARN context.

## Hooks

| Hook | Event | Behavior |
|---|---|---|
| `precheck-skill.sh` | `UserPromptSubmit` | Detects a /bytheslice slash command in the prompt and runs per-skill preconditions. BLOCKs `/sell-slice` when the master checklist is missing; BLOCKs `/box-it-up` on main; WARN-injects dirty-tree / missing-gh / Prep-incomplete. |
| `shop-status.sh` | `SessionStart` | Reads `docs/plans/00_master_checklist.md` if present and injects a compact stage summary (counts + next not-started row + Prep progress). |
| `pre-commit-guard.sh` | `PreToolUse` (Bash matcher) | BLOCKs `git commit` on main/master. Otherwise WARN-injects a short staged-files summary. |
| `stop-gate.sh` | `Stop` | If `/sell-slice` started **in the current session** but no commit landed since the precheck, BLOCK once so Claude completes the loop. If `/box-it-up` started in the current session but its PR is not `MERGED` (per `gh pr view`), BLOCK once. Stale state from previous sessions is ignored via `session_id` guard; missing `gh` fails open. Re-entry detection prevents loops. |
| `stage-plan-guard.sh` | `PreToolUse` (Write/Edit matchers) | BLOCKs `Write`/`Edit` on `docs/plans/stage_*.md` while `/sell-slice` is the current session's active skill — stage plans are static during delivery. Session-id guarded; fails open if state is missing or cross-session. |
| `library-gate-guard.sh` | `PreToolUse` (Write/Edit matchers) | WARN-injects when a `/sell-slice` run writes to a watched production route (`app/**`, `src/app/**`, `components/**`, `src/components/**`) without a recorded library-preview approval. Never blocks. Dormant unless `library-approvals.json` exists (graceful degradation until the approval-writer ships). |
| `commit-checklist-correlator.sh` | `PostToolUse` (Bash matcher) | After a `git commit` during `/sell-slice`, WARN-injects if the checklist shows a `Completed` stage but the commit did not touch `docs/plans/00_master_checklist.md` (possible skipped Phase 9). Session-id guarded. |
| `compact-snapshot.sh` | `PreCompact` | Never blocks compaction (always exit 0). Writes `compact-snapshot.json` capturing session/skill/branch, last commit sha + subject, and the next up-to-3 unfinished checklist lines so the post-compaction turn can re-orient. |

## The scenario contract

[`scenarios.md`](./scenarios.md) is the canonical source of truth: every row is one (skill / state / expected) tuple the hooks must satisfy. It is what `test.sh` verifies and what every SKILL.md `## Preconditions` section indirectly references. **If you edit a hook's behavior, update `scenarios.md` first and add a row to `test.sh`** — otherwise the contract has drifted.

## Tests

```bash
bash hooks/test.sh
```

Runs 30+ isolated-fixture tests covering every row in `scenarios.md`. Pure bash, no deps beyond `git`. Each test sets up a throwaway repo under `$TMPDIR`, runs one hook with a synthetic JSON envelope, and asserts exit code + output substring. Failures print the divergence inline.

Run it locally before committing changes to anything under `hooks/`. No CI workflow is wired — this is intentional given the plugin's "$0 Actions budget" stance; opt in later if you want it on PRs.

## Shared helpers

`lib/checklist.sh` is sourced by every hook. It exposes:

| Function | Returns |
|---|---|
| `bts_root` | absolute path of the active project (uses `$CLAUDE_PROJECT_DIR` then git toplevel then pwd) |
| `bts_checklist_path` | path to `docs/plans/00_master_checklist.md` or empty |
| `bts_prep_counts` | `"<done> <total>"` of Prep checkboxes, empty if no `## Prep` section |
| `bts_branch` / `bts_branch_class` | current branch + `"main"` / `"feature"` / `"unknown"` classification |
| `bts_tree_state` | `"clean"` or `"dirty"` |
| `bts_state_dir` | ensures `.claude/.bytheslice-state/` exists, echoes path |
| `bts_session_id <json>` | extracts `session_id` from a hook input envelope |
| `bts_detect_skill <prompt>` | first /bytheslice slash command in the prompt (canonical short form) |

## State

`.claude/.bytheslice-state/last-precheck.json` is written by `precheck-skill.sh` and read by `stop-gate.sh`. Schema:

```json
{
  "session_id": "...",   // stop-gate compares against current session
  "skill": "sell-slice",
  "timestamp": "2026-05-18T15:42:00Z",
  "blocks": 0,
  "warnings": 1,
  "branch": "feat/foo",
  "tree": "clean"
}
```

`.claude/.bytheslice-state/compact-snapshot.json` is written by `compact-snapshot.sh` on `PreCompact`. Schema:

```json
{
  "session_id": "...",
  "skill": "sell-slice",
  "timestamp": "2026-05-20T10:00:00Z",
  "branch": "feat/foo",
  "last_commit_sha": "abc1234",
  "last_commit_subject": "feat: ...",
  "master_checklist_summary": ["| 1 | foo | Status: Not Started |"]
}
```

`.claude/.bytheslice-state/library-approvals.json` is read (not yet written — see v4.2.2) by `library-gate-guard.sh`. Schema:

```json
{
  "approvals": [{ "component_id": "...", "status": "approved", "at": "<iso>" }],
  "watched_paths": ["app/**", "src/app/**", "components/**", "src/components/**"]
}
```

The state directory is gitignored.

## Disable

Two supported escape hatches, in order of preference:

1. **Per-session env var** — `export BTS_HOOKS_DISABLED=1` before launching Claude Code. Every hook in this directory short-circuits on exit 0 without running its checks. Use this for one-off experimental flows where the guards are getting in your way. Wired check: see the second non-comment line of every `*.sh` in this dir.
2. **Global disable via settings** — set `"disableAllHooks": true` in `.claude/settings.local.json`. This is the Claude Code primitive and disables every hook from every plugin, not just ours.

Prefer (1) — it only affects bytheslice hooks and reverts the moment your shell session ends.
