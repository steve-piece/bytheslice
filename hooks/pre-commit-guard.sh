#!/usr/bin/env bash
# hooks/pre-commit-guard.sh
# PreToolUse hook on Bash. Blocks `git commit` on main/master.
# Warn-injects a one-line summary of staged files otherwise.
#
# Hook contract: reads JSON from stdin with .tool_input.command for Bash calls.
# Exit 0 to allow; exit 2 (with stderr) to block.

set -u

[ "${BTS_HOOKS_DISABLED:-0}" = "1" ] && exit 0

SELF_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=./lib/checklist.sh
. "$SELF_DIR/lib/checklist.sh"

INPUT="$(cat 2>/dev/null || true)"
CMD=""
if command -v jq >/dev/null 2>&1; then
  CMD=$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null)
fi
if [ -z "$CMD" ]; then
  CMD=$(printf '%s' "$INPUT" | sed -n 's/.*"command"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
fi

# Only act on `git commit` invocations. Anything else passes silently.
case "$CMD" in
  *"git commit"*) ;;
  *) exit 0 ;;
esac

if [ "$(bts_branch_class)" = "main" ]; then
  printf '[bytheslice] refusing git commit on %s. Switch to a feature branch.\n' "$(bts_branch)" >&2
  exit 2
fi

STAGED=$(git -C "$(bts_root)" diff --cached --name-only 2>/dev/null | head -10)
if [ -n "$STAGED" ]; then
  printf '[bytheslice pre-commit] staged files on branch %s:\n' "$(bts_branch)"
  printf '%s\n' "$STAGED" | sed 's/^/  /'
fi

exit 0
