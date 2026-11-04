#!/usr/bin/env bash
# hooks/checklist-check.sh
# Runs hooks/checklist-check.js for two warn-only checklist hooks:
#   edit  PostToolUse Write|Edit|MultiEdit: the format check after an edit to
#         docs/plans/00_master_checklist.md (mcp/checklist-format.js)
#   pr    PreToolUse Bash: a `gh pr create` (or `gh as <user> pr create`) on a
#         slice-related branch that leaves the checklist unchanged
# Either one only adds context. It never refuses a call and always exits 0.
# A cheap text match skips Node for every other call; without Node it does
# nothing.

set -u

[ "${BTS_HOOKS_DISABLED:-0}" = "1" ] && exit 0
MODE="${1:-}"
INPUT=$(cat 2>/dev/null)
case "$MODE" in
  edit) case "$INPUT" in *00_master_checklist.md*) ;; *) exit 0 ;; esac ;;
  pr) case "$INPUT" in *"pr create"*|*"pr new"*) ;; *) exit 0 ;; esac ;;
  *) exit 0 ;;
esac
command -v node >/dev/null 2>&1 || exit 0
SELF_DIR="$(cd "$(dirname "$0")" && pwd)"
printf '%s' "$INPUT" | node "$SELF_DIR/checklist-check.js" "$MODE" 2>/dev/null
exit 0
