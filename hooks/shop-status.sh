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

# POSIX awk only in this script: BSD awk (macOS) has no gawk extensions,
# notably no 3-argument match(), so row names are carved out with sub().

LAYOUT=$(bts_checklist_layout)

PREP=$(bts_prep_counts || true)
PREP_LINE=""
if [ -n "$PREP" ]; then
  read -r PDONE PTOTAL <<<"$PREP"
  PREP_LINE=$(printf 'Prep: %d/%d boxes checked' "$PDONE" "$PTOTAL")
fi

printf '[bytheslice shop status]\n'
printf '  checklist: %s\n' "${CHECKLIST#$(bts_root)/}"
[ -n "$PREP_LINE" ] && printf '  %s\n' "$PREP_LINE"

if [ "$LAYOUT" = "pie" ]; then
  # Nested v5 checklist: derive counts from the dual-read lib helpers.
  read -r PIES_DONE PIES_TOTAL <<<"$(bts_unit_counts || true)"
  read -r SLICES_DONE SLICES_TOTAL <<<"$(bts_slice_counts || true)"
  printf '  pies: %d total, %d completed / %d open\n' \
    "${PIES_TOTAL:-0}" "${PIES_DONE:-0}" "$(( ${PIES_TOTAL:-0} - ${PIES_DONE:-0} ))"
  if [ -n "${SLICES_TOTAL:-}" ] && [ "${SLICES_TOTAL:-0}" -gt 0 ]; then
    printf '  slices: %d total, %d completed / %d open\n' \
      "$SLICES_TOTAL" "${SLICES_DONE:-0}" "$(( SLICES_TOTAL - ${SLICES_DONE:-0} ))"
  fi
  # First `## Pie N` heading with no done marker ([x], strikethrough, or
  # Status: Completed/Done on the heading line), review annotation stripped.
  NEXT_PIE=$(awk '
    /^## +Pie[[:space:]]+[0-9]/ {
      if ($0 ~ /\[[xX]\]/ || $0 ~ /~~/ || $0 ~ /[Ss]tatus:[[:space:]]*(Completed|Done)/) next
      line = $0
      sub(/^##[[:space:]]+/, "", line)
      sub(/[[:space:]]*<!--.*$/, "", line)
      sub(/[[:space:]]+$/, "", line)
      print line
      exit
    }
  ' "$CHECKLIST" 2>/dev/null)
  [ -n "$NEXT_PIE" ] && printf '  next open pie: %s\n' "$NEXT_PIE"
else
  # Flat v4 fallback: count markdown table rows mentioning "Status:".
  COUNTS=$(awk '
    BEGIN { not_started = 0; in_progress = 0; completed = 0 }
    /Status:[[:space:]]*Not Started/  { not_started++ }
    /Status:[[:space:]]*In Progress/  { in_progress++ }
    /Status:[[:space:]]*Completed/    { completed++ }
    END {
      total = not_started + in_progress + completed
      printf "%d %d %d %d", completed, in_progress, not_started, total
    }
  ' "$CHECKLIST" 2>/dev/null)
  read -r DONE INPROG NOT_STARTED TOTAL <<<"$COUNTS"
  # First not-started row, minus the leading pipe and the trailing Status cell.
  NEXT_ROW=$(awk '
    /Status:[[:space:]]*Not Started/ {
      line = $0
      sub(/^[[:space:]]*\|[[:space:]]*/, "", line)
      sub(/[[:space:]]*\|[[:space:]]*Status:.*$/, "", line)
      print line
      exit
    }
  ' "$CHECKLIST" 2>/dev/null)
  printf '  stages: %d total, %d completed / %d in-progress / %d not started\n' \
    "${TOTAL:-0}" "${DONE:-0}" "${INPROG:-0}" "${NOT_STARTED:-0}"
  [ -n "$NEXT_ROW" ] && printf '  next not-started: %s\n' "$NEXT_ROW"
fi

exit 0
