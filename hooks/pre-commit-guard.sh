#!/usr/bin/env bash
# hooks/pre-commit-guard.sh
# PreToolUse hook on Bash. Blocks `git commit` on main/master.
# Warn-injects a one-line summary of staged files otherwise.
#
# The branch is read from the directory the commit actually runs in (a parsed
# `cd <dir>` or `git -C <dir>`, else the hook cwd), not from CLAUDE_PROJECT_DIR,
# so a commit inside a worktree on a feature branch is not mistaken for main.
#
# Hook contract: reads JSON from stdin with .tool_input.command and .cwd.
# Exit 0 to allow; exit 2 (with stderr) to block.

set -u

[ "${BTS_HOOKS_DISABLED:-0}" = "1" ] && exit 0

SELF_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=./lib/checklist.sh
. "$SELF_DIR/lib/checklist.sh"

INPUT="$(cat 2>/dev/null || true)"
CMD=""
HOOK_CWD=""
if command -v jq >/dev/null 2>&1; then
  CMD=$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null)
  HOOK_CWD=$(printf '%s' "$INPUT" | jq -r '.cwd // empty' 2>/dev/null)
fi
# jq-less fallback. Tolerates escaped quotes inside the JSON string values,
# so `git -C \"<dir>\" commit` is not truncated at the first quote.
if [ -z "$CMD" ]; then
  CMD=$(printf '%s' "$INPUT" | sed -nE 's/.*"command"[[:space:]]*:[[:space:]]*"(([^"\\]|\\.)*)".*/\1/p' | sed 's/\\"/"/g')
fi
if [ -z "$HOOK_CWD" ]; then
  HOOK_CWD=$(printf '%s' "$INPUT" | sed -nE 's/.*"cwd"[[:space:]]*:[[:space:]]*"(([^"\\]|\\.)*)".*/\1/p')
fi

# Only act on `git commit` invocations (including `git -C <dir> commit`).
# Anything else passes silently.
COMMIT_DIR=$(bts_commit_dir "$CMD" "$HOOK_CWD") || exit 0

if [ "$(bts_branch_class "$COMMIT_DIR")" = "main" ]; then
  printf '[bytheslice] refusing git commit on %s (%s). Switch to a feature branch.\n' "$(bts_branch "$COMMIT_DIR")" "$COMMIT_DIR" >&2
  exit 2
fi

STAGED=$(git -C "$COMMIT_DIR" diff --cached --name-only 2>/dev/null | head -10)
if [ -n "$STAGED" ]; then
  printf '[bytheslice pre-commit] staged files on branch %s:\n' "$(bts_branch "$COMMIT_DIR")"
  printf '%s\n' "$STAGED" | sed 's/^/  /'
fi

exit 0
