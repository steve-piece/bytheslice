#!/usr/bin/env bash
# hooks/compact-snapshot.sh
# PreCompact hook. Persists a small snapshot of the active ByTheSlice state
# right before context is compacted, so the next turn can re-orient. Never
# blocks compaction — always exits 0.
#
# Hook contract: reads JSON from stdin (envelope incl. .session_id).
# Writes .bytheslice-state/compact-snapshot.json. Always exit 0.

set -u

[ "${BTS_HOOKS_DISABLED:-0}" = "1" ] && exit 0

SELF_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=./lib/checklist.sh
. "$SELF_DIR/lib/checklist.sh"

INPUT="$(cat 2>/dev/null || true)"

SESSION_ID=$(bts_session_id "$INPUT")

STATE_DIR=$(bts_state_dir)
STATE_FILE="$STATE_DIR/last-precheck.json"

# Skill from prior precheck state (empty if absent).
SKILL=""
if [ -f "$STATE_FILE" ]; then
  if command -v jq >/dev/null 2>&1; then
    SKILL=$(jq -r '.skill // empty' "$STATE_FILE" 2>/dev/null)
  fi
  if [ -z "$SKILL" ]; then
    SKILL=$(sed -n 's/.*"skill"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$STATE_FILE")
  fi
fi

ROOT=$(bts_root)
BRANCH=$(bts_branch)
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
LAST_SHA=$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || true)
LAST_SUBJECT=$(git -C "$ROOT" log -1 --format=%s 2>/dev/null || true)

# Next up-to-3 unfinished checklist lines (best effort, empty array if none).
CHECKLIST=$(bts_checklist_path)
SUMMARY_LINES=()
if [ -n "$CHECKLIST" ]; then
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    SUMMARY_LINES+=("$line")
  done < <(grep -nE 'Status: Not Started|\[ \]' "$CHECKLIST" 2>/dev/null \
    | head -3 \
    | sed -E 's/^[0-9]+://' \
    | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')
fi

# JSON-escape a string (backslash, double-quote, tab → spaces, strip CR).
json_escape() {
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' -e 's/\t/ /g' -e 's/\r//g'
}

# Build the master_checklist_summary array.
SUMMARY_JSON="[]"
if [ "${#SUMMARY_LINES[@]}" -gt 0 ]; then
  SUMMARY_JSON="["
  first=1
  for l in "${SUMMARY_LINES[@]}"; do
    [ "$first" -eq 0 ] && SUMMARY_JSON+=","
    SUMMARY_JSON+="\"$(json_escape "$l")\""
    first=0
  done
  SUMMARY_JSON+="]"
fi

{
  printf '{\n'
  printf '  "session_id": "%s",\n' "$(json_escape "$SESSION_ID")"
  printf '  "skill": "%s",\n' "$(json_escape "$SKILL")"
  printf '  "timestamp": "%s",\n' "$TIMESTAMP"
  printf '  "branch": "%s",\n' "$(json_escape "$BRANCH")"
  printf '  "last_commit_sha": "%s",\n' "$(json_escape "$LAST_SHA")"
  printf '  "last_commit_subject": "%s",\n' "$(json_escape "$LAST_SUBJECT")"
  printf '  "master_checklist_summary": %s\n' "$SUMMARY_JSON"
  printf '}\n'
} > "$STATE_DIR/compact-snapshot.json" 2>/dev/null || true

exit 0
