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
#
# With BTS_HOST=cursor both modes run on Cursor's postToolUse (hooks-cursor.json)
# and every exit prints JSON: {"additional_context": ...} or {}.

set -u

quiet() { [ "${BTS_HOST:-}" = "cursor" ] && printf '{}\n'; exit 0; }

[ "${BTS_HOOKS_DISABLED:-0}" = "1" ] && quiet
MODE="${1:-}"
INPUT=$(cat 2>/dev/null)
case "$MODE" in
  edit) case "$INPUT" in *00_master_checklist.md*) ;; *) quiet ;; esac ;;
  pr) case "$INPUT" in *"pr create"*|*"pr new"*) ;; *) quiet ;; esac ;;
  *) quiet ;;
esac
command -v node >/dev/null 2>&1 || quiet
SELF_DIR="$(cd "$(dirname "$0")" && pwd)"
OUT=$(printf '%s' "$INPUT" | node "$SELF_DIR/checklist-check.js" "$MODE" 2>/dev/null)
[ -n "$OUT" ] && { printf '%s\n' "$OUT"; exit 0; }
quiet
