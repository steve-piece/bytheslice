#!/usr/bin/env bash
# hooks/stop-gate.sh
# Stop hook. If /sell-slice was invoked IN THIS SESSION but no commit
# landed since the precheck, block once so Claude completes the loop.
#
# Session-scoped: ignores any state whose session_id does not match the
# current session, which prevents stale prechecks from a previous chat
# from triggering a false-positive block (the #1 weakness from the v1
# heuristic).

set -u

[ "${BTS_HOOKS_DISABLED:-0}" = "1" ] && exit 0

SELF_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=./lib/checklist.sh
. "$SELF_DIR/lib/checklist.sh"

INPUT="$(cat 2>/dev/null || true)"

# Never re-block. If Claude already saw our reason once, let it stop.
STOP_ACTIVE="false"
if command -v jq >/dev/null 2>&1; then
  STOP_ACTIVE=$(printf '%s' "$INPUT" | jq -r '.stop_hook_active // false' 2>/dev/null)
fi
[ "$STOP_ACTIVE" = "true" ] && exit 0

STATE_DIR=$(bts_state_dir)
STATE_FILE="$STATE_DIR/last-precheck.json"
[ ! -f "$STATE_FILE" ] && exit 0

# Session-id guard: only consider state from the current session.
CURRENT_SESSION=$(bts_session_id "$INPUT")
STATE_SESSION=""
STATE_SKILL=""
STATE_TS=""
if command -v jq >/dev/null 2>&1; then
  STATE_SESSION=$(jq -r '.session_id // empty' "$STATE_FILE" 2>/dev/null)
  STATE_SKILL=$(jq -r '.skill // empty' "$STATE_FILE" 2>/dev/null)
  STATE_TS=$(jq -r '.timestamp // empty' "$STATE_FILE" 2>/dev/null)
fi

# If we can't determine session match either way, fail open (don't block).
[ -z "$CURRENT_SESSION" ] && exit 0
[ -z "$STATE_SESSION" ] && exit 0
[ "$STATE_SESSION" != "$CURRENT_SESSION" ] && exit 0

# --- /sell-slice: block once if no commit landed since the precheck. ---
if [ "$STATE_SKILL" = "sell-slice" ]; then
  # Within this session, was there a commit after the precheck?
  [ -z "$STATE_TS" ] && exit 0

  LAST_COMMIT_EPOCH=$(git -C "$(bts_root)" log -1 --format=%ct 2>/dev/null || echo 0)
  PRECHECK_EPOCH=$(date -u -j -f "%Y-%m-%dT%H:%M:%SZ" "$STATE_TS" "+%s" 2>/dev/null \
    || date -u -d "$STATE_TS" "+%s" 2>/dev/null \
    || echo 0)

  if [ "${LAST_COMMIT_EPOCH:-0}" -lt "${PRECHECK_EPOCH:-0}" ]; then
    printf '[bytheslice] /sell-slice started but no slice commit detected since precheck. Run /sell-slice through to its commit step, or explicitly tell Claude you are pausing the loop.\n' >&2
    exit 2
  fi

  exit 0
fi

# --- /box-it-up: block once if the skill's PR is not merged yet. ---
if [ "$STATE_SKILL" = "box-it-up" ]; then
  # Fail open if gh is unavailable — we can't check PR state without it.
  command -v gh >/dev/null 2>&1 || exit 0

  PR_STATE=$(gh pr view --json state -q .state 2>/dev/null) || exit 0
  [ -z "$PR_STATE" ] && exit 0

  if [ "$PR_STATE" != "MERGED" ]; then
    printf '[bytheslice] /box-it-up started but its PR is not merged yet. Run it through to merge, or tell Claude you are pausing the loop.\n' >&2
    exit 2
  fi

  exit 0
fi

# Any other skill: nothing to gate on stop.
exit 0
