#!/usr/bin/env bash
# hooks/record-library-approval.sh
# State writer for the Phase 4.5 library preview gate. This is the one script
# in this directory that is NOT wired to a lifecycle event: /sell-slice invokes
# it directly around the human approval window.
#
#   arm --slice <n.m>
#       Create or reset library-approvals.json with zero approvals. From this
#       moment library-gate-guard.sh WARNs on production-route writes.
#   approve --slice <n.m> --components "<id>[,<id>...]"
#       Append one status:"approved" entry per component id. The gate then
#       passes production wiring for the rest of the slice.
#
# Each approval entry records component_id, status, at (ISO timestamp),
# session_id, and slice. The session id defaults to the one precheck-skill.sh
# stored in last-precheck.json, which is exactly the value the gate hook
# compares hook envelopes against. Output is compact single-line JSON so the
# gate's no-jq sed/grep fallbacks keep working. Honors BTS_HOOKS_DISABLED=1
# like every script in this directory. Exit 0 on success, 2 on usage errors.

set -u
# No globbing anywhere in this script; watched globs like app/** must stay
# literal when word-split in the csv helpers below.
set -f

[ "${BTS_HOOKS_DISABLED:-0}" = "1" ] && exit 0

SELF_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=./lib/checklist.sh
. "$SELF_DIR/lib/checklist.sh"

usage() {
  cat >&2 <<'EOF'
usage:
  record-library-approval.sh arm --slice <n.m> [--session <id>] [--watched "<glob>,<glob>"]
  record-library-approval.sh approve --slice <n.m> --components "<id>[,<id>...]" [--session <id>]
EOF
  exit 2
}

CMD="${1:-}"
case "$CMD" in
  arm|approve) shift ;;
  *) usage ;;
esac

SLICE=""
SESSION=""
COMPONENTS=""
WATCHED_CSV=""
while [ $# -gt 0 ]; do
  case "$1" in
    --slice)      [ $# -ge 2 ] || usage; SLICE="$2"; shift 2 ;;
    --session)    [ $# -ge 2 ] || usage; SESSION="$2"; shift 2 ;;
    --components) [ $# -ge 2 ] || usage; COMPONENTS="$2"; shift 2 ;;
    --watched)    [ $# -ge 2 ] || usage; WATCHED_CSV="$2"; shift 2 ;;
    *) usage ;;
  esac
done

# Identifiers only: keeps the emitted JSON well-formed and the sed splice safe.
sanitize() { printf '%s' "$1" | tr -cd 'A-Za-z0-9._,/*-'; }
SLICE=$(sanitize "$SLICE")
SESSION=$(sanitize "$SESSION")
COMPONENTS=$(sanitize "$COMPONENTS")
WATCHED_CSV=$(sanitize "$WATCHED_CSV")

[ -z "$SLICE" ] && usage
[ "$CMD" = "approve" ] && [ -z "$COMPONENTS" ] && usage

STATE_DIR=$(bts_state_dir)
APPROVALS_FILE="$STATE_DIR/library-approvals.json"

# Default the session id to the one the precheck hook recorded. That is the
# value library-gate-guard.sh compares against, so the pairing stays exact.
if [ -z "$SESSION" ]; then
  PRECHECK_FILE="$STATE_DIR/last-precheck.json"
  if [ -f "$PRECHECK_FILE" ]; then
    if command -v jq >/dev/null 2>&1; then
      SESSION=$(jq -r '.session_id // empty' "$PRECHECK_FILE" 2>/dev/null)
    fi
    if [ -z "$SESSION" ]; then
      SESSION=$(sed -n 's/.*"session_id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$PRECHECK_FILE")
    fi
  fi
fi

NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)

[ -z "$WATCHED_CSV" ] && WATCHED_CSV='app/**,src/app/**,components/**,src/components/**'

# "a,b" -> "\"a\",\"b\"" (comma-joined JSON string literals).
csv_to_json_strings() {
  local csv="$1" out="" item
  local IFS=','
  for item in $csv; do
    [ -z "$item" ] && continue
    [ -n "$out" ] && out="$out,"
    out="$out\"$item\""
  done
  printf '%s' "$out"
}

WATCHED_JSON=$(csv_to_json_strings "$WATCHED_CSV")

# Overwrite the approvals file wholesale. Args: approvals-array body.
fresh_file() {
  printf '{"session_id":"%s","slice":"%s","armed_at":"%s","watched_paths":[%s],"approvals":[%s]}\n' \
    "$SESSION" "$SLICE" "$NOW" "$WATCHED_JSON" "$1" > "$APPROVALS_FILE"
}

if [ "$CMD" = "arm" ]; then
  fresh_file ""
  printf '[bytheslice] library gate armed for slice %s (session %s). Production-route writes now WARN until an approval is recorded via: record-library-approval.sh approve --slice %s --components "<id>,<id>"\n' \
    "$SLICE" "${SESSION:-unknown}" "$SLICE"
  exit 0
fi

# approve: one entry per component id.
ENTRIES=""
build_entries() {
  local csv="$1" item
  local IFS=','
  for item in $csv; do
    [ -z "$item" ] && continue
    [ -n "$ENTRIES" ] && ENTRIES="$ENTRIES,"
    ENTRIES="$ENTRIES{\"component_id\":\"$item\",\"status\":\"approved\",\"at\":\"$NOW\",\"session_id\":\"$SESSION\",\"slice\":\"$SLICE\"}"
  done
}
build_entries "$COMPONENTS"

if [ ! -f "$APPROVALS_FILE" ]; then
  # arm was skipped; initialize and record in one step.
  fresh_file "$ENTRIES"
elif command -v jq >/dev/null 2>&1 && jq -e . "$APPROVALS_FILE" >/dev/null 2>&1; then
  TMP="$APPROVALS_FILE.tmp.$$"
  if jq -c --argjson new "[$ENTRIES]" '.approvals = ((.approvals // []) + $new)' \
      "$APPROVALS_FILE" > "$TMP" 2>/dev/null && [ -s "$TMP" ]; then
    mv "$TMP" "$APPROVALS_FILE"
  else
    rm -f "$TMP"
    fresh_file "$ENTRIES"
  fi
else
  # No jq (or an unparseable file): splice entries into the approvals array,
  # then drop the trailing comma left behind when the array was empty.
  if grep -q '"approvals"[[:space:]]*:[[:space:]]*\[' "$APPROVALS_FILE" 2>/dev/null; then
    TMP="$APPROVALS_FILE.tmp.$$"
    sed "s|\"approvals\"[[:space:]]*:[[:space:]]*\[|\"approvals\":[$ENTRIES,|" "$APPROVALS_FILE" \
      | sed 's|,]|]|' > "$TMP" && mv "$TMP" "$APPROVALS_FILE"
  else
    fresh_file "$ENTRIES"
  fi
fi

COUNT=$(printf '%s,' "$COMPONENTS" | tr ',' '\n' | grep -c .)
printf '[bytheslice] library approval recorded for slice %s: %s (%s component(s), session %s). The library gate now passes production-route writes.\n' \
  "$SLICE" "$COMPONENTS" "$COUNT" "${SESSION:-unknown}"
exit 0
