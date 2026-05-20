#!/usr/bin/env bash
# hooks/library-gate-guard.sh
# PreToolUse hook on Write + Edit. WARN-injects when a /sell-slice frontend
# slice writes to a production route (per watched_paths) without a recorded
# library-preview approval. Never blocks — graceful degradation until the
# approval-writer ships (v4.2.2). Skips silently if the approvals file is
# absent (the common case).
#
# Hook contract: reads JSON from stdin with .tool_input.file_path.
# Exit 0 always; prints to stdout to WARN.

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
[ -z "$FILE_PATH" ] && exit 0

# Graceful degradation: if no approvals file exists, this gate is dormant.
STATE_DIR=$(bts_state_dir)
APPROVALS_FILE="$STATE_DIR/library-approvals.json"
[ ! -f "$APPROVALS_FILE" ] && exit 0

# Only relevant during a /sell-slice run in the current session.
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

# Read watched_paths globs from the approvals file. Default to the standard set.
WATCHED=""
if command -v jq >/dev/null 2>&1; then
  WATCHED=$(jq -r '.watched_paths[]? // empty' "$APPROVALS_FILE" 2>/dev/null)
fi
if [ -z "$WATCHED" ]; then
  WATCHED=$(sed -n 's/.*"watched_paths"[[:space:]]*:[[:space:]]*\[\([^]]*\)\].*/\1/p' "$APPROVALS_FILE" \
    | tr ',' '\n' | sed -e 's/^[[:space:]]*"//' -e 's/"[[:space:]]*$//')
fi
[ -z "$WATCHED" ] && WATCHED=$'app/**\nsrc/app/**\ncomponents/**\nsrc/components/**'

# Normalize the touched path to project-relative (strip the project root prefix).
REL_PATH="$FILE_PATH"
ROOT=$(bts_root)
case "$FILE_PATH" in
  "$ROOT"/*) REL_PATH="${FILE_PATH#"$ROOT"/}" ;;
esac

# Does the touched path fall under any watched glob? Translate `foo/**` and
# `foo/*` to a `foo/` prefix check — a simple suffix-tolerant match.
matches_watched=0
while IFS= read -r pat; do
  [ -z "$pat" ] && continue
  prefix="${pat%%\**}"        # strip from the first '*' onward → "app/"
  prefix="${prefix%/}"         # drop a trailing slash → "app"
  [ -z "$prefix" ] && continue
  case "$REL_PATH" in
    "$prefix"/*|"$prefix") matches_watched=1; break ;;
  esac
done <<EOF
$WATCHED
EOF

[ "$matches_watched" -eq 0 ] && exit 0

# Path is a watched production route. Is there ANY approval recorded?
APPROVED_COUNT=0
if command -v jq >/dev/null 2>&1; then
  APPROVED_COUNT=$(jq -r '[.approvals[]? | select(.status == "approved")] | length' "$APPROVALS_FILE" 2>/dev/null)
fi
if ! [ "${APPROVED_COUNT:-0}" -ge 0 ] 2>/dev/null; then
  APPROVED_COUNT=0
fi
if [ -z "$APPROVED_COUNT" ] || [ "$APPROVED_COUNT" = "0" ]; then
  # No jq, or zero approvals — fall back to a grep for an approved entry.
  if grep -q '"status"[[:space:]]*:[[:space:]]*"approved"' "$APPROVALS_FILE" 2>/dev/null; then
    APPROVED_COUNT=1
  else
    APPROVED_COUNT=0
  fi
fi

if [ "${APPROVED_COUNT:-0}" -gt 0 ]; then
  # An approval is on record — assume it covers this slice's component.
  exit 0
fi

printf '[bytheslice library preview gate] %s looks like a production route but no library approval is recorded. If this is a frontend slice, run Phase 4.5 (library preview gate) before wiring into production routes.\n' "$REL_PATH"
exit 0
