#!/usr/bin/env bash
# hooks/test.sh
# Regression suite for ByTheSlice hook scripts.
# Runs every scenario from scenarios.md against the live hook scripts.
# Exit 0 if all pass, 1 if any fail.
#
# Usage:
#   bash hooks/test.sh
#
# Each test sets up an isolated fixture under $TMPDIR and invokes the hook
# with the matching JSON envelope. State files live inside the fixture so
# tests can't pollute one another or the real .bytheslice-state dir.

set -u

HERE="$(cd "$(dirname "$0")" && pwd)"
PRECHECK="$HERE/precheck-skill.sh"
SHOP_STATUS="$HERE/shop-status.sh"
COMMIT_GUARD="$HERE/pre-commit-guard.sh"
STOP_GATE="$HERE/stop-gate.sh"

PASS=0
FAIL=0
FAILED_NAMES=()

# Make a throwaway fixture project. Echoes the absolute path.
mk_fixture() {
  local d
  d=$(mktemp -d 2>/dev/null) || { echo "mktemp failed" >&2; exit 1; }
  git -C "$d" init -q -b main
  git -C "$d" config user.email test@example.com
  git -C "$d" config user.name test
  # An empty initial commit so HEAD exists and branch ops work.
  git -C "$d" commit -q --allow-empty -m "init"
  mkdir -p "$d/.claude"
  printf '%s' "$d"
}

# Run a hook, capture exit + combined output. Args: hook-path, json-stdin.
# Sets globals: LAST_EXIT, LAST_OUT.
run_hook() {
  local hook="$1" payload="$2"
  LAST_OUT=$(printf '%s' "$payload" | bash "$hook" 2>&1)
  LAST_EXIT=$?
}

# Assert exit code. Args: name, expected-exit.
assert_exit() {
  local name="$1" want="$2"
  if [ "$LAST_EXIT" = "$want" ]; then
    PASS=$((PASS+1))
    printf '  ✓ %s (exit=%s)\n' "$name" "$LAST_EXIT"
  else
    FAIL=$((FAIL+1))
    FAILED_NAMES+=("$name (exit: want=$want got=$LAST_EXIT)")
    printf '  ✗ %s (want exit=%s, got=%s)\n    output: %s\n' "$name" "$want" "$LAST_EXIT" "$LAST_OUT"
  fi
}

# Assert substring present. Args: name, needle.
assert_contains() {
  local name="$1" needle="$2"
  case "$LAST_OUT" in
    *"$needle"*)
      PASS=$((PASS+1))
      printf '  ✓ %s contains %q\n' "$name" "$needle"
      ;;
    *)
      FAIL=$((FAIL+1))
      FAILED_NAMES+=("$name (missing: $needle)")
      printf '  ✗ %s missing %q\n    output: %s\n' "$name" "$needle" "$LAST_OUT"
      ;;
  esac
}

# Assert empty output. Args: name.
assert_empty() {
  local name="$1"
  if [ -z "$LAST_OUT" ]; then
    PASS=$((PASS+1))
    printf '  ✓ %s (empty output)\n' "$name"
  else
    FAIL=$((FAIL+1))
    FAILED_NAMES+=("$name (expected empty)")
    printf '  ✗ %s expected empty, got: %s\n' "$name" "$LAST_OUT"
  fi
}

####################################################################
# precheck-skill.sh
####################################################################

echo
echo "## precheck-skill.sh"

# /sell-slice without checklist → BLOCK
FIX=$(mk_fixture)
CLAUDE_PROJECT_DIR=$FIX run_hook "$PRECHECK" '{"prompt":"/sell-slice","session_id":"s1"}'
assert_exit "sell-slice no checklist" 2
assert_contains "sell-slice no checklist message" "requires docs/plans/00_master_checklist.md"
rm -rf "$FIX"

# /sell-slice with checklist + clean Prep + clean tree → PASS
FIX=$(mk_fixture)
mkdir -p "$FIX/docs/plans"
cat > "$FIX/docs/plans/00_master_checklist.md" <<'EOF'
# Master

## Prep

- [x] First
- [x] Second
EOF
( cd "$FIX" && git add . && git commit -q -m "checklist" )
CLAUDE_PROJECT_DIR=$FIX run_hook "$PRECHECK" '{"prompt":"/sell-slice","session_id":"s2"}'
assert_exit "sell-slice happy path" 0
assert_empty "sell-slice happy path silent"
rm -rf "$FIX"

# /sell-slice with incomplete Prep → WARN
FIX=$(mk_fixture)
mkdir -p "$FIX/docs/plans"
cat > "$FIX/docs/plans/00_master_checklist.md" <<'EOF'
# Master

## Prep

- [x] First
- [ ] Second
EOF
( cd "$FIX" && git add . && git commit -q -m "checklist" )
CLAUDE_PROJECT_DIR=$FIX run_hook "$PRECHECK" '{"prompt":"/sell-slice","session_id":"s3"}'
assert_exit "sell-slice incomplete Prep" 0
assert_contains "sell-slice Prep warning" "Prep section incomplete"
rm -rf "$FIX"

# /box-it-up on main → BLOCK
FIX=$(mk_fixture)
CLAUDE_PROJECT_DIR=$FIX run_hook "$PRECHECK" '{"prompt":"/box-it-up","session_id":"s4"}'
assert_exit "box-it-up on main" 2
assert_contains "box-it-up on main message" "refuses to run on main"
rm -rf "$FIX"

# /box-it-up on feature branch (no gh) → WARN
FIX=$(mk_fixture)
git -C "$FIX" checkout -q -b feat/test
CLAUDE_PROJECT_DIR=$FIX run_hook "$PRECHECK" '{"prompt":"/box-it-up","session_id":"s5"}'
assert_exit "box-it-up feature branch no-gh" 0
rm -rf "$FIX"

# No bytheslice command → PASS silent
FIX=$(mk_fixture)
CLAUDE_PROJECT_DIR=$FIX run_hook "$PRECHECK" '{"prompt":"unrelated user message","session_id":"s6"}'
assert_exit "no skill mentioned" 0
assert_empty "no skill silent"
rm -rf "$FIX"

# BTS_HOOKS_DISABLED=1 → PASS silent regardless
FIX=$(mk_fixture)
BTS_HOOKS_DISABLED=1 CLAUDE_PROJECT_DIR=$FIX run_hook "$PRECHECK" '{"prompt":"/sell-slice","session_id":"s7"}'
assert_exit "precheck disabled by env" 0
assert_empty "precheck disabled silent"
rm -rf "$FIX"

# /cook-pizzas without checklist → PASS (cook-pizzas may run without one)
FIX=$(mk_fixture)
CLAUDE_PROJECT_DIR=$FIX run_hook "$PRECHECK" '{"prompt":"/cook-pizzas","session_id":"s8"}'
assert_exit "cook-pizzas without checklist" 0
rm -rf "$FIX"

# /special-order without checklist → BLOCK
FIX=$(mk_fixture)
CLAUDE_PROJECT_DIR=$FIX run_hook "$PRECHECK" '{"prompt":"/special-order","session_id":"s9"}'
assert_exit "special-order without checklist" 2
rm -rf "$FIX"

####################################################################
# pre-commit-guard.sh
####################################################################

echo
echo "## pre-commit-guard.sh"

# git commit on main → BLOCK
FIX=$(mk_fixture)
CLAUDE_PROJECT_DIR=$FIX run_hook "$COMMIT_GUARD" '{"tool_input":{"command":"git commit -m test"}}'
assert_exit "commit on main blocked" 2
assert_contains "commit-on-main message" "refusing git commit on main"
rm -rf "$FIX"

# git commit on feature branch → PASS (with possible WARN if staged files)
FIX=$(mk_fixture)
git -C "$FIX" checkout -q -b feat/x
CLAUDE_PROJECT_DIR=$FIX run_hook "$COMMIT_GUARD" '{"tool_input":{"command":"git commit -m test"}}'
assert_exit "commit on feature branch" 0
rm -rf "$FIX"

# non-git-commit → PASS
FIX=$(mk_fixture)
CLAUDE_PROJECT_DIR=$FIX run_hook "$COMMIT_GUARD" '{"tool_input":{"command":"npm test"}}'
assert_exit "non-commit pass" 0
assert_empty "non-commit silent"
rm -rf "$FIX"

# BTS_HOOKS_DISABLED → PASS
FIX=$(mk_fixture)
BTS_HOOKS_DISABLED=1 CLAUDE_PROJECT_DIR=$FIX run_hook "$COMMIT_GUARD" '{"tool_input":{"command":"git commit -m test"}}'
assert_exit "commit-guard disabled" 0
rm -rf "$FIX"

####################################################################
# shop-status.sh
####################################################################

echo
echo "## shop-status.sh"

# No checklist → PASS silent
FIX=$(mk_fixture)
CLAUDE_PROJECT_DIR=$FIX run_hook "$SHOP_STATUS" '{}'
assert_exit "shop-status no checklist" 0
assert_empty "shop-status no checklist silent"
rm -rf "$FIX"

# Checklist present → CONTEXT
FIX=$(mk_fixture)
mkdir -p "$FIX/docs/plans"
cat > "$FIX/docs/plans/00_master_checklist.md" <<'EOF'
# Master

## Prep

- [x] First

## Stages

| Stage | Name | Status |
|---|---|---|
| 1 | foo | Status: Not Started |
| 2 | bar | Status: Completed |
EOF
CLAUDE_PROJECT_DIR=$FIX run_hook "$SHOP_STATUS" '{}'
assert_exit "shop-status with checklist" 0
assert_contains "shop-status emits header" "bytheslice shop status"
rm -rf "$FIX"

# BTS_HOOKS_DISABLED → PASS silent
FIX=$(mk_fixture)
mkdir -p "$FIX/docs/plans"
echo "# x" > "$FIX/docs/plans/00_master_checklist.md"
BTS_HOOKS_DISABLED=1 CLAUDE_PROJECT_DIR=$FIX run_hook "$SHOP_STATUS" '{}'
assert_exit "shop-status disabled" 0
assert_empty "shop-status disabled silent"
rm -rf "$FIX"

####################################################################
# stop-gate.sh
####################################################################

echo
echo "## stop-gate.sh"

# No state file → PASS
FIX=$(mk_fixture)
CLAUDE_PROJECT_DIR=$FIX run_hook "$STOP_GATE" '{"session_id":"current"}'
assert_exit "stop-gate no state" 0
rm -rf "$FIX"

# State from a different session → PASS (the v2 fix)
FIX=$(mk_fixture)
mkdir -p "$FIX/.claude/.bytheslice-state"
cat > "$FIX/.claude/.bytheslice-state/last-precheck.json" <<EOF
{
  "session_id": "old-session-from-yesterday",
  "skill": "sell-slice",
  "timestamp": "2020-01-01T00:00:00Z"
}
EOF
CLAUDE_PROJECT_DIR=$FIX run_hook "$STOP_GATE" '{"session_id":"current"}'
assert_exit "stop-gate stale session ignored" 0
rm -rf "$FIX"

# Current session + sell-slice + no commit since precheck → BLOCK
FIX=$(mk_fixture)
mkdir -p "$FIX/.claude/.bytheslice-state"
cat > "$FIX/.claude/.bytheslice-state/last-precheck.json" <<EOF
{
  "session_id": "current",
  "skill": "sell-slice",
  "timestamp": "2099-01-01T00:00:00Z"
}
EOF
CLAUDE_PROJECT_DIR=$FIX run_hook "$STOP_GATE" '{"session_id":"current"}'
assert_exit "stop-gate sell-slice no commit" 2
assert_contains "stop-gate message" "no slice commit detected"
rm -rf "$FIX"

# Current session + commit landed after precheck → PASS
FIX=$(mk_fixture)
( cd "$FIX" && touch slice.txt && git add . && git commit -q -m "the slice" )
mkdir -p "$FIX/.claude/.bytheslice-state"
cat > "$FIX/.claude/.bytheslice-state/last-precheck.json" <<EOF
{
  "session_id": "current",
  "skill": "sell-slice",
  "timestamp": "2020-01-01T00:00:00Z"
}
EOF
CLAUDE_PROJECT_DIR=$FIX run_hook "$STOP_GATE" '{"session_id":"current"}'
assert_exit "stop-gate commit after precheck" 0
rm -rf "$FIX"

# stop_hook_active → never block
FIX=$(mk_fixture)
mkdir -p "$FIX/.claude/.bytheslice-state"
cat > "$FIX/.claude/.bytheslice-state/last-precheck.json" <<EOF
{"session_id":"current","skill":"sell-slice","timestamp":"2099-01-01T00:00:00Z"}
EOF
CLAUDE_PROJECT_DIR=$FIX run_hook "$STOP_GATE" '{"session_id":"current","stop_hook_active":true}'
assert_exit "stop-gate re-entry never loops" 0
rm -rf "$FIX"

# BTS_HOOKS_DISABLED → PASS
FIX=$(mk_fixture)
mkdir -p "$FIX/.claude/.bytheslice-state"
cat > "$FIX/.claude/.bytheslice-state/last-precheck.json" <<EOF
{"session_id":"current","skill":"sell-slice","timestamp":"2099-01-01T00:00:00Z"}
EOF
BTS_HOOKS_DISABLED=1 CLAUDE_PROJECT_DIR=$FIX run_hook "$STOP_GATE" '{"session_id":"current"}'
assert_exit "stop-gate disabled" 0
rm -rf "$FIX"

####################################################################
# Summary
####################################################################

echo
echo "===================="
echo "  $PASS passed / $FAIL failed"
echo "===================="
if [ "$FAIL" -gt 0 ]; then
  echo
  echo "Failed:"
  for n in "${FAILED_NAMES[@]}"; do
    printf '  - %s\n' "$n"
  done
  exit 1
fi
exit 0
