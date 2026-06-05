#!/usr/bin/env bash
# hooks/stage-plan-guard.sh
# PreToolUse hook on Write + Edit. WARNs on edits to stage/slice plan files
# (docs/plans/stage_<n>_*.md) while /sell-slice is the active skill for
# the current session — plans are static during delivery, but the v5 loop
# (/sell-pie) legitimately churns plan files, so this advises rather than
# blocks (downgraded from BLOCK in v5, C4).
#
# Hook contract: reads JSON from stdin with .tool_input.file_path.
# Always exit 0; prints the advisory to stdout to WARN.

set -u

[ "${BTS_HOOKS_DISABLED:-0}" = "1" ] && exit 0

SELF_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=./lib/checklist.sh
. "$SELF_DIR/lib/checklist.sh"

INPUT="$(cat 2>/dev/null || true)"

# Extract the target path. Tolerate missing jq.
FILE_PATH=""
if command -v jq >/dev/null 2>&1; then
  FILE_PATH=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null)
fi
if [ -z "$FILE_PATH" ]; then
  FILE_PATH=$(printf '%s' "$INPUT" | sed -n 's/.*"file_path"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
fi

# Not a write/edit with a path → nothing to guard.
[ -z "$FILE_PATH" ] && exit 0

# Only care about stage plan files: any path ending in docs/plans/stage_<...>.md
case "$FILE_PATH" in
  */docs/plans/stage_*.md|docs/plans/stage_*.md) ;;
  *) exit 0 ;;
esac

# Session-id guard: only enforce when the incoming session matches the
# session that recorded the precheck. Fail open if either is missing.
STATE_DIR=$(bts_state_dir)
STATE_FILE="$STATE_DIR/last-precheck.json"
[ ! -f "$STATE_FILE" ] && exit 0

CURRENT_SESSION=$(bts_session_id "$INPUT")
STATE_SESSION=""
STATE_SKILL=""
if command -v jq >/dev/null 2>&1; then
  STATE_SESSION=$(jq -r '.session_id // empty' "$STATE_FILE" 2>/dev/null)
  STATE_SKILL=$(jq -r '.skill // empty' "$STATE_FILE" 2>/dev/null)
fi
if [ -z "$STATE_SESSION" ]; then
  STATE_SESSION=$(sed -n 's/.*"session_id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$STATE_FILE")
fi
if [ -z "$STATE_SKILL" ]; then
  STATE_SKILL=$(sed -n 's/.*"skill"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$STATE_FILE")
fi

[ -z "$CURRENT_SESSION" ] && exit 0
[ -z "$STATE_SESSION" ] && exit 0
[ "$STATE_SESSION" != "$CURRENT_SESSION" ] && exit 0

# Only /sell-slice locks stage plans.
[ "$STATE_SKILL" != "sell-slice" ] && exit 0

printf '[bytheslice] editing a stage plan file during /sell-slice — plans are normally static. Prefer /special-order or /cook-pizzas to modify a plan; proceeding anyway.\n'
exit 0
