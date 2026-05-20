#!/usr/bin/env bash
# hooks/shop-status.sh
# SessionStart hook. Injects a compact "shop status" header so Claude
# starts with master-checklist state in context — replaces the repeated
# Phase 1 "read the checklist" step in several skills.
#
# Exit 0; stdout becomes additional session context.

set -u

[ "${BTS_HOOKS_DISABLED:-0}" = "1" ] && exit 0

SELF_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=./lib/checklist.sh
. "$SELF_DIR/lib/checklist.sh"

CHECKLIST=$(bts_checklist_path)
[ -z "$CHECKLIST" ] && exit 0  # Not a ByTheSlice project; nothing to inject.

# Stage row counting. A "stage row" is a markdown table row mentioning Status.
COUNTS=$(awk '
  BEGIN { not_started = 0; in_progress = 0; completed = 0; next_row = "" }
  /Status:[[:space:]]*Not Started/ {
    not_started++
    if (next_row == "") { match($0, /\| *([^|]+) *\|/, m); next_row = m[1] }
  }
  /Status:[[:space:]]*In Progress/ { in_progress++ }
  /Status:[[:space:]]*Completed/   { completed++ }
  END {
    total = not_started + in_progress + completed
    printf "%d %d %d %d", completed, in_progress, not_started, total
  }
' "$CHECKLIST")

read -r DONE INPROG NOT_STARTED TOTAL <<<"$COUNTS"

PREP=$(bts_prep_counts || true)
PREP_LINE=""
if [ -n "$PREP" ]; then
  read -r PDONE PTOTAL <<<"$PREP"
  PREP_LINE=$(printf 'Prep: %d/%d boxes checked' "$PDONE" "$PTOTAL")
fi

NEXT_ROW=$(awk '
  /Status:[[:space:]]*Not Started/ {
    match($0, /\| *([^|]+) *\|/, m)
    print m[1]
    exit
  }
' "$CHECKLIST")

printf '[bytheslice shop status]\n'
printf '  checklist: %s\n' "${CHECKLIST#$(bts_root)/}"
[ -n "$PREP_LINE" ] && printf '  %s\n' "$PREP_LINE"
printf '  stages: %d total — %d completed / %d in-progress / %d not started\n' \
  "${TOTAL:-0}" "${DONE:-0}" "${INPROG:-0}" "${NOT_STARTED:-0}"
[ -n "$NEXT_ROW" ] && printf '  next not-started: %s\n' "$NEXT_ROW"

exit 0
