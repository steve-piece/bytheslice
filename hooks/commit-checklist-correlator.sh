#!/usr/bin/env bash
# hooks/commit-checklist-correlator.sh
# PostToolUse hook on Bash. After a `git commit` during /sell-slice, checks
# whether the active stage was marked Completed in the master checklist but
# the commit did NOT touch docs/plans/00_master_checklist.md — a sign that
# Phase 9 (master-checklist update) may have been skipped. WARN only.
#
# Hook contract: reads JSON from stdin with .tool_input.command.
# Exit 0 always; prints to stdout to WARN.

set -u

[ "${BTS_HOOKS_DISABLED:-0}" = "1" ] && exit 0

SELF_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=./lib/checklist.sh
. "$SELF_DIR/lib/checklist.sh"

INPUT="$(cat 2>/dev/null || true)"

# Extract the command that just ran. Tolerate missing jq.
CMD=""
if command -v jq >/dev/null 2>&1; then
  CMD=$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null)
fi
if [ -z "$CMD" ]; then
  CMD=$(printf '%s' "$INPUT" | sed -n 's/.*"command"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
fi

# Only react to `git commit` (allowing leading whitespace). Anything else passes.
TRIMMED="${CMD#"${CMD%%[![:space:]]*}"}"
case "$TRIMMED" in
  "git commit"*) ;;
  *) exit 0 ;;
esac

# Only correlate during a current-session /sell-slice run.
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
[ "$STATE_SKILL" != "sell-slice" ] && exit 0

# Does the checklist show a Completed stage row? (closeout signal)
CHECKLIST=$(bts_checklist_path)
[ -z "$CHECKLIST" ] && exit 0
grep -qE 'Status: Completed' "$CHECKLIST" 2>/dev/null || exit 0

# Did the most recent commit include the master checklist in its file list?
ROOT=$(bts_root)
COMMIT_FILES=$(git -C "$ROOT" show --name-only --format= HEAD 2>/dev/null)
case "$COMMIT_FILES" in
  *"docs/plans/00_master_checklist.md"*) exit 0 ;;  # checklist was part of it — all good
esac

printf '[bytheslice] closeout commit landed but docs/plans/00_master_checklist.md was not part of it. Verify Phase 9 (master-checklist update) ran on this slice.\n'
exit 0
