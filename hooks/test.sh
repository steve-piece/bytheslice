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
STAGE_PLAN_GUARD="$HERE/stage-plan-guard.sh"
LIBRARY_GATE="$HERE/library-gate-guard.sh"
COMPACT_SNAPSHOT="$HERE/compact-snapshot.sh"
RECORDER="$HERE/record-library-approval.sh"

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

# Assert substring absent. Args: name, needle.
assert_not_contains() {
  local name="$1" needle="$2"
  case "$LAST_OUT" in
    *"$needle"*)
      FAIL=$((FAIL+1))
      FAILED_NAMES+=("$name (unexpectedly contains: $needle)")
      printf '  ✗ %s unexpectedly contains %q\n    output: %s\n' "$name" "$needle" "$LAST_OUT"
      ;;
    *)
      PASS=$((PASS+1))
      printf '  ✓ %s does not contain %q\n' "$name" "$needle"
      ;;
  esac
}

# Run the approval recorder with CLI args (not a stdin envelope).
# Sets globals: LAST_EXIT, LAST_OUT.
run_recorder() {
  LAST_OUT=$(bash "$RECORDER" "$@" 2>&1)
  LAST_EXIT=$?
}

# Assert a file exists. Args: name, path.
assert_file_exists() {
  local name="$1" path="$2"
  if [ -f "$path" ]; then
    PASS=$((PASS+1))
    printf '  ✓ %s (file exists)\n' "$name"
  else
    FAIL=$((FAIL+1))
    FAILED_NAMES+=("$name (missing file: $path)")
    printf '  ✗ %s missing file %s\n' "$name" "$path"
  fi
}

# Assert a file's content holds a substring. Args: name, path, needle.
assert_file_contains() {
  local name="$1" path="$2" needle="$3" content
  content=$(cat "$path" 2>/dev/null)
  case "$content" in
    *"$needle"*)
      PASS=$((PASS+1))
      printf '  ✓ %s contains %q\n' "$name" "$needle"
      ;;
    *)
      FAIL=$((FAIL+1))
      FAILED_NAMES+=("$name (file missing: $needle)")
      printf '  ✗ %s missing %q in %s\n    content: %s\n' "$name" "$needle" "$path" "$content"
      ;;
  esac
}

# Write a last-precheck.json state file into a fixture.
# Args: fixture-dir, session_id, skill, [timestamp].
write_state() {
  local d="$1" sid="$2" skill="$3" ts="${4:-2099-01-01T00:00:00Z}"
  mkdir -p "$d/.claude/.bytheslice-state"
  cat > "$d/.claude/.bytheslice-state/last-precheck.json" <<EOF
{"session_id":"$sid","skill":"$skill","timestamp":"$ts"}
EOF
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

# /sell-slice with complete dashless Prep (canonical v5 format) → PASS
FIX=$(mk_fixture)
mkdir -p "$FIX/docs/plans"
cat > "$FIX/docs/plans/00_master_checklist.md" <<'EOF'
# Master

## Prep

[x] First
[x] Second
EOF
( cd "$FIX" && git add . && git commit -q -m "checklist" )
CLAUDE_PROJECT_DIR=$FIX run_hook "$PRECHECK" '{"prompt":"/sell-slice","session_id":"s3a"}'
assert_exit "sell-slice dashless Prep complete" 0
assert_empty "sell-slice dashless Prep complete silent"
rm -rf "$FIX"

# /sell-slice with incomplete dashless Prep → WARN with correct counts
FIX=$(mk_fixture)
mkdir -p "$FIX/docs/plans"
cat > "$FIX/docs/plans/00_master_checklist.md" <<'EOF'
# Master

## Prep

[x] First
[ ] Second
EOF
( cd "$FIX" && git add . && git commit -q -m "checklist" )
CLAUDE_PROJECT_DIR=$FIX run_hook "$PRECHECK" '{"prompt":"/sell-slice","session_id":"s3b"}'
assert_exit "sell-slice dashless Prep incomplete" 0
assert_contains "sell-slice dashless Prep warning" "Prep section incomplete: 1/2"
rm -rf "$FIX"

# /sell-slice with mixed dashed + dashless Prep boxes → both forms counted
FIX=$(mk_fixture)
mkdir -p "$FIX/docs/plans"
cat > "$FIX/docs/plans/00_master_checklist.md" <<'EOF'
# Master

## Prep

- [x] Legacy dashed box
[ ] Canonical dashless box
EOF
( cd "$FIX" && git add . && git commit -q -m "checklist" )
CLAUDE_PROJECT_DIR=$FIX run_hook "$PRECHECK" '{"prompt":"/sell-slice","session_id":"s3c"}'
assert_exit "sell-slice mixed Prep formats" 0
assert_contains "sell-slice mixed Prep counts both forms" "Prep section incomplete: 1/2"
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

# Flat v4 table checklist → stage counts + next not-started row, POSIX awk only
FIX=$(mk_fixture)
mkdir -p "$FIX/docs/plans"
cat > "$FIX/docs/plans/00_master_checklist.md" <<'EOF'
# Master

## Stages

| Stage | Name | Status |
|---|---|---|
| 1 | foo | Status: Not Started |
| 2 | bar | Status: Completed |
| 3 | baz | Status: In Progress |
EOF
CLAUDE_PROJECT_DIR=$FIX run_hook "$SHOP_STATUS" '{}'
assert_exit "shop-status flat exit 0" 0
assert_contains "shop-status flat stage counts" "stages: 3 total, 1 completed / 1 in-progress / 1 not started"
assert_contains "shop-status flat next row" "next not-started: 1 | foo"
assert_not_contains "shop-status flat no awk noise" "syntax error"
rm -rf "$FIX"

# Nested v5 checklist → pie/slice counts from lib helpers + next open pie;
# Prep uses the canonical dashless boxes.
FIX=$(mk_fixture)
mkdir -p "$FIX/docs/plans"
cat > "$FIX/docs/plans/00_master_checklist.md" <<'EOF'
# Master

## Prep - Pie 1: Foundations

[x] Slice 1.1 - Display case built
[x] Slice 1.2 - Quality line installed
[ ] Slice 1.3 - Shop open

## Pie 2 - Blog Editor [x]    <!-- review: boundary -->

### Slice 2.1 - Editor shell [x]

### Slice 2.2 - Server actions [x]

## Pie 3 - Publish Flow    <!-- review: boundary -->

### Slice 3.1 - Publish button [x]

### Slice 3.2 - Scheduling
EOF
CLAUDE_PROJECT_DIR=$FIX run_hook "$SHOP_STATUS" '{}'
assert_exit "shop-status nested exit 0" 0
assert_contains "shop-status nested dashless Prep counts" "Prep: 2/3 boxes checked"
assert_contains "shop-status nested pie counts" "pies: 2 total, 1 completed / 1 open"
assert_contains "shop-status nested slice counts" "slices: 4 total, 3 completed / 1 open"
assert_contains "shop-status nested next open pie" "next open pie: Pie 3 - Publish Flow"
assert_not_contains "shop-status nested no awk noise" "syntax error"
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
# stage-plan-guard.sh
####################################################################

echo
echo "## stage-plan-guard.sh"

# stage plan path + sell-slice current session → WARN (downgraded from BLOCK in v5, C4)
FIX=$(mk_fixture)
write_state "$FIX" "current" "sell-slice"
CLAUDE_PROJECT_DIR=$FIX run_hook "$STAGE_PLAN_GUARD" \
  "{\"session_id\":\"current\",\"tool_input\":{\"file_path\":\"$FIX/docs/plans/stage_1_foo.md\"}}"
assert_exit "stage-plan-guard warns during sell-slice" 0
assert_contains "stage-plan-guard warn message" "plans are normally static"
rm -rf "$FIX"

# stage plan path + relative path form + sell-slice → WARN
FIX=$(mk_fixture)
write_state "$FIX" "current" "sell-slice"
CLAUDE_PROJECT_DIR=$FIX run_hook "$STAGE_PLAN_GUARD" \
  '{"session_id":"current","tool_input":{"file_path":"docs/plans/stage_2_bar.md"}}'
assert_exit "stage-plan-guard warns relative path" 0
assert_contains "stage-plan-guard warn relative path message" "plans are normally static"
rm -rf "$FIX"

# stage plan path + non-sell-slice skill → PASS
FIX=$(mk_fixture)
write_state "$FIX" "current" "special-order"
CLAUDE_PROJECT_DIR=$FIX run_hook "$STAGE_PLAN_GUARD" \
  "{\"session_id\":\"current\",\"tool_input\":{\"file_path\":\"$FIX/docs/plans/stage_1_foo.md\"}}"
assert_exit "stage-plan-guard non-sell-slice passes" 0
assert_empty "stage-plan-guard non-sell-slice silent"
rm -rf "$FIX"

# master checklist (not a stage_* file) + sell-slice → PASS
FIX=$(mk_fixture)
write_state "$FIX" "current" "sell-slice"
CLAUDE_PROJECT_DIR=$FIX run_hook "$STAGE_PLAN_GUARD" \
  "{\"session_id\":\"current\",\"tool_input\":{\"file_path\":\"$FIX/docs/plans/00_master_checklist.md\"}}"
assert_exit "stage-plan-guard master checklist passes" 0
assert_empty "stage-plan-guard master checklist silent"
rm -rf "$FIX"

# non-plan path + sell-slice → PASS
FIX=$(mk_fixture)
write_state "$FIX" "current" "sell-slice"
CLAUDE_PROJECT_DIR=$FIX run_hook "$STAGE_PLAN_GUARD" \
  '{"session_id":"current","tool_input":{"file_path":"src/app/page.tsx"}}'
assert_exit "stage-plan-guard non-plan path passes" 0
assert_empty "stage-plan-guard non-plan path silent"
rm -rf "$FIX"

# stage plan path + stale session → PASS (never block cross-session)
FIX=$(mk_fixture)
write_state "$FIX" "old-session" "sell-slice"
CLAUDE_PROJECT_DIR=$FIX run_hook "$STAGE_PLAN_GUARD" \
  '{"session_id":"current","tool_input":{"file_path":"docs/plans/stage_1_foo.md"}}'
assert_exit "stage-plan-guard stale session passes" 0
rm -rf "$FIX"

# stage plan path + no state file → PASS (fail open)
FIX=$(mk_fixture)
CLAUDE_PROJECT_DIR=$FIX run_hook "$STAGE_PLAN_GUARD" \
  '{"session_id":"current","tool_input":{"file_path":"docs/plans/stage_1_foo.md"}}'
assert_exit "stage-plan-guard no state passes" 0
rm -rf "$FIX"

# BTS_HOOKS_DISABLED → PASS
FIX=$(mk_fixture)
write_state "$FIX" "current" "sell-slice"
BTS_HOOKS_DISABLED=1 CLAUDE_PROJECT_DIR=$FIX run_hook "$STAGE_PLAN_GUARD" \
  '{"session_id":"current","tool_input":{"file_path":"docs/plans/stage_1_foo.md"}}'
assert_exit "stage-plan-guard disabled" 0
assert_empty "stage-plan-guard disabled silent"
rm -rf "$FIX"

####################################################################
# library-gate-guard.sh
####################################################################

echo
echo "## library-gate-guard.sh"

# watched path, NO approvals file → PASS (dormant)
FIX=$(mk_fixture)
write_state "$FIX" "current" "sell-slice"
CLAUDE_PROJECT_DIR=$FIX run_hook "$LIBRARY_GATE" \
  '{"session_id":"current","tool_input":{"file_path":"app/dashboard/page.tsx"}}'
assert_exit "library-gate dormant without approvals file" 0
assert_empty "library-gate dormant silent"
rm -rf "$FIX"

# watched path, approvals file present, NO approval, sell-slice → WARN
FIX=$(mk_fixture)
write_state "$FIX" "current" "sell-slice"
cat > "$FIX/.claude/.bytheslice-state/library-approvals.json" <<'EOF'
{"approvals":[],"watched_paths":["app/**","src/app/**","components/**","src/components/**"]}
EOF
CLAUDE_PROJECT_DIR=$FIX run_hook "$LIBRARY_GATE" \
  '{"session_id":"current","tool_input":{"file_path":"app/dashboard/page.tsx"}}'
assert_exit "library-gate warns no approval" 0
assert_contains "library-gate warn message" "no library approval is recorded"
rm -rf "$FIX"

# watched path, approval recorded, sell-slice → PASS
FIX=$(mk_fixture)
write_state "$FIX" "current" "sell-slice"
cat > "$FIX/.claude/.bytheslice-state/library-approvals.json" <<'EOF'
{"approvals":[{"component_id":"dashboard","status":"approved","at":"2026-05-20T00:00:00Z"}],"watched_paths":["app/**"]}
EOF
CLAUDE_PROJECT_DIR=$FIX run_hook "$LIBRARY_GATE" \
  '{"session_id":"current","tool_input":{"file_path":"app/dashboard/page.tsx"}}'
assert_exit "library-gate approved passes" 0
assert_empty "library-gate approved silent"
rm -rf "$FIX"

# non-watched path, approvals present, no approval, sell-slice → PASS
FIX=$(mk_fixture)
write_state "$FIX" "current" "sell-slice"
cat > "$FIX/.claude/.bytheslice-state/library-approvals.json" <<'EOF'
{"approvals":[],"watched_paths":["app/**","src/app/**","components/**","src/components/**"]}
EOF
CLAUDE_PROJECT_DIR=$FIX run_hook "$LIBRARY_GATE" \
  '{"session_id":"current","tool_input":{"file_path":"lib/util.ts"}}'
assert_exit "library-gate non-watched passes" 0
assert_empty "library-gate non-watched silent"
rm -rf "$FIX"

# watched path, approvals present, no approval, unrelated skill → PASS
FIX=$(mk_fixture)
write_state "$FIX" "current" "cook-pizzas"
cat > "$FIX/.claude/.bytheslice-state/library-approvals.json" <<'EOF'
{"approvals":[],"watched_paths":["app/**"]}
EOF
CLAUDE_PROJECT_DIR=$FIX run_hook "$LIBRARY_GATE" \
  '{"session_id":"current","tool_input":{"file_path":"app/dashboard/page.tsx"}}'
assert_exit "library-gate unrelated skill passes" 0
assert_empty "library-gate unrelated skill silent"
rm -rf "$FIX"

# watched path, approvals present, NO approval, sell-pie → WARN
# The guard used to exit early on any skill but sell-slice, leaving it dormant in
# the unattended mode where autonomy makes it matter most.
FIX=$(mk_fixture)
write_state "$FIX" "current" "sell-pie"
cat > "$FIX/.claude/.bytheslice-state/library-approvals.json" <<'EOF'
{"approvals":[],"watched_paths":["app/**","src/app/**","components/**","src/components/**"]}
EOF
CLAUDE_PROJECT_DIR=$FIX run_hook "$LIBRARY_GATE" \
  '{"session_id":"current","tool_input":{"file_path":"app/dashboard/page.tsx"}}'
assert_exit "library-gate warns under sell-pie" 0
assert_contains "library-gate sell-pie warn message" "no library approval is recorded"
rm -rf "$FIX"

# watched path, approval recorded, sell-pie → PASS
FIX=$(mk_fixture)
write_state "$FIX" "current" "sell-pie"
cat > "$FIX/.claude/.bytheslice-state/library-approvals.json" <<'EOF'
{"approvals":[{"component_id":"dashboard","status":"approved","at":"2026-05-20T00:00:00Z"}],"watched_paths":["app/**"]}
EOF
CLAUDE_PROJECT_DIR=$FIX run_hook "$LIBRARY_GATE" \
  '{"session_id":"current","tool_input":{"file_path":"app/dashboard/page.tsx"}}'
assert_exit "library-gate approved passes under sell-pie" 0
assert_empty "library-gate approved silent under sell-pie"
rm -rf "$FIX"

# watched path, approvals present, stale session → PASS
FIX=$(mk_fixture)
write_state "$FIX" "old-session" "sell-slice"
cat > "$FIX/.claude/.bytheslice-state/library-approvals.json" <<'EOF'
{"approvals":[],"watched_paths":["app/**"]}
EOF
CLAUDE_PROJECT_DIR=$FIX run_hook "$LIBRARY_GATE" \
  '{"session_id":"current","tool_input":{"file_path":"app/dashboard/page.tsx"}}'
assert_exit "library-gate stale session passes" 0
assert_empty "library-gate stale session silent"
rm -rf "$FIX"

# BTS_HOOKS_DISABLED → PASS
FIX=$(mk_fixture)
write_state "$FIX" "current" "sell-slice"
cat > "$FIX/.claude/.bytheslice-state/library-approvals.json" <<'EOF'
{"approvals":[],"watched_paths":["app/**"]}
EOF
BTS_HOOKS_DISABLED=1 CLAUDE_PROJECT_DIR=$FIX run_hook "$LIBRARY_GATE" \
  '{"session_id":"current","tool_input":{"file_path":"app/dashboard/page.tsx"}}'
assert_exit "library-gate disabled" 0
assert_empty "library-gate disabled silent"
rm -rf "$FIX"

####################################################################
# record-library-approval.sh (library gate end-to-end)
####################################################################

echo
echo "## record-library-approval.sh"

# arm writes the state file (session, slice, zero approvals) and wakes the
# gate: the very next watched-path write WARNs.
FIX=$(mk_fixture)
write_state "$FIX" "current" "sell-slice"
CLAUDE_PROJECT_DIR=$FIX run_recorder arm --slice 3.2
assert_exit "recorder arm exits 0" 0
AF="$FIX/.claude/.bytheslice-state/library-approvals.json"
assert_file_exists "recorder arm writes approvals file" "$AF"
assert_file_contains "recorder arm records session from last-precheck" "$AF" '"session_id":"current"'
assert_file_contains "recorder arm records slice" "$AF" '"slice":"3.2"'
assert_file_contains "recorder arm starts with zero approvals" "$AF" '"approvals":[]'
assert_file_contains "recorder arm writes default watched paths" "$AF" '"watched_paths":["app/**"'
assert_file_contains "recorder arm stamps armed_at" "$AF" '"armed_at":"20'
CLAUDE_PROJECT_DIR=$FIX run_hook "$LIBRARY_GATE" \
  '{"session_id":"current","tool_input":{"file_path":"app/dashboard/page.tsx"}}'
assert_exit "gate fires once armed" 0
assert_contains "gate warns after arm, before approval" "no library approval is recorded"
rm -rf "$FIX"

# approve appends one approved entry per component; the gate then passes the
# same watched-path write silently.
FIX=$(mk_fixture)
write_state "$FIX" "current" "sell-slice"
CLAUDE_PROJECT_DIR=$FIX run_recorder arm --slice 3.2
CLAUDE_PROJECT_DIR=$FIX run_recorder approve --slice 3.2 --components "order-table,stat-card"
assert_exit "recorder approve exits 0" 0
AF="$FIX/.claude/.bytheslice-state/library-approvals.json"
assert_file_contains "approve records first component" "$AF" '"component_id":"order-table"'
assert_file_contains "approve records second component" "$AF" '"component_id":"stat-card"'
assert_file_contains "approve records approved status with timestamp" "$AF" '"status":"approved","at":"20'
assert_file_contains "approve entries carry session and slice" "$AF" '"session_id":"current","slice":"3.2"}'
CLAUDE_PROJECT_DIR=$FIX run_hook "$LIBRARY_GATE" \
  '{"session_id":"current","tool_input":{"file_path":"app/dashboard/page.tsx"}}'
assert_exit "gate passes after approval recorded" 0
assert_empty "gate silent after approval recorded"
rm -rf "$FIX"

# approve without a prior arm auto-initializes the file; gate passes.
FIX=$(mk_fixture)
write_state "$FIX" "current" "sell-slice"
CLAUDE_PROJECT_DIR=$FIX run_recorder approve --slice 1.1 --components "buttons"
assert_exit "recorder approve without arm exits 0" 0
CLAUDE_PROJECT_DIR=$FIX run_hook "$LIBRARY_GATE" \
  '{"session_id":"current","tool_input":{"file_path":"app/dashboard/page.tsx"}}'
assert_exit "gate passes after no-arm approval" 0
assert_empty "gate silent after no-arm approval"
rm -rf "$FIX"

# Re-arming for the next slice resets approvals: the gate warns again.
FIX=$(mk_fixture)
write_state "$FIX" "current" "sell-slice"
CLAUDE_PROJECT_DIR=$FIX run_recorder arm --slice 3.2
CLAUDE_PROJECT_DIR=$FIX run_recorder approve --slice 3.2 --components "buttons"
CLAUDE_PROJECT_DIR=$FIX run_recorder arm --slice 3.3
AF="$FIX/.claude/.bytheslice-state/library-approvals.json"
assert_file_contains "re-arm updates the slice" "$AF" '"slice":"3.3"'
assert_file_contains "re-arm resets approvals" "$AF" '"approvals":[]'
CLAUDE_PROJECT_DIR=$FIX run_hook "$LIBRARY_GATE" \
  '{"session_id":"current","tool_input":{"file_path":"app/dashboard/page.tsx"}}'
assert_exit "gate re-armed for next slice" 0
assert_contains "gate warns again after re-arm" "no library approval is recorded"
rm -rf "$FIX"

# approve without --components → usage error, nothing written.
FIX=$(mk_fixture)
write_state "$FIX" "current" "sell-slice"
CLAUDE_PROJECT_DIR=$FIX run_recorder approve --slice 3.2
assert_exit "recorder approve without components exits 2" 2
if [ -f "$FIX/.claude/.bytheslice-state/library-approvals.json" ]; then
  FAIL=$((FAIL+1)); FAILED_NAMES+=("recorder usage error writes nothing"); printf '  ✗ recorder wrote a file on usage error\n'
else
  PASS=$((PASS+1)); printf '  ✓ recorder usage error writes nothing\n'
fi
rm -rf "$FIX"

# BTS_HOOKS_DISABLED → no-op, nothing written.
FIX=$(mk_fixture)
write_state "$FIX" "current" "sell-slice"
BTS_HOOKS_DISABLED=1 CLAUDE_PROJECT_DIR=$FIX run_recorder arm --slice 3.2
assert_exit "recorder disabled exits 0" 0
if [ -f "$FIX/.claude/.bytheslice-state/library-approvals.json" ]; then
  FAIL=$((FAIL+1)); FAILED_NAMES+=("recorder disabled writes nothing"); printf '  ✗ recorder wrote despite disable\n'
else
  PASS=$((PASS+1)); printf '  ✓ recorder disabled writes nothing\n'
fi
rm -rf "$FIX"

####################################################################
# compact-snapshot.sh
####################################################################

echo
echo "## compact-snapshot.sh"

# State present → PASS silent + snapshot written carrying skill over
FIX=$(mk_fixture)
write_state "$FIX" "current" "sell-slice"
CLAUDE_PROJECT_DIR=$FIX run_hook "$COMPACT_SNAPSHOT" '{"session_id":"current"}'
assert_exit "compact-snapshot with state exits 0" 0
assert_empty "compact-snapshot silent"
if [ -f "$FIX/.claude/.bytheslice-state/compact-snapshot.json" ]; then
  PASS=$((PASS+1)); printf '  ✓ compact-snapshot wrote snapshot file\n'
else
  FAIL=$((FAIL+1)); FAILED_NAMES+=("compact-snapshot wrote snapshot file"); printf '  ✗ compact-snapshot did not write file\n'
fi
SNAP=$(cat "$FIX/.claude/.bytheslice-state/compact-snapshot.json" 2>/dev/null)
case "$SNAP" in
  *'"skill": "sell-slice"'*) PASS=$((PASS+1)); printf '  ✓ compact-snapshot carries skill\n' ;;
  *) FAIL=$((FAIL+1)); FAILED_NAMES+=("compact-snapshot carries skill"); printf '  ✗ compact-snapshot missing skill: %s\n' "$SNAP" ;;
esac
rm -rf "$FIX"

# No state file → still writes a minimal snapshot, exit 0
FIX=$(mk_fixture)
CLAUDE_PROJECT_DIR=$FIX run_hook "$COMPACT_SNAPSHOT" '{"session_id":"current"}'
assert_exit "compact-snapshot no state exits 0" 0
if [ -f "$FIX/.claude/.bytheslice-state/compact-snapshot.json" ]; then
  PASS=$((PASS+1)); printf '  ✓ compact-snapshot writes minimal snapshot without state\n'
else
  FAIL=$((FAIL+1)); FAILED_NAMES+=("compact-snapshot minimal snapshot"); printf '  ✗ compact-snapshot wrote nothing without state\n'
fi
rm -rf "$FIX"

# Checklist with unfinished lines → summary populated
FIX=$(mk_fixture)
write_state "$FIX" "current" "sell-slice"
mkdir -p "$FIX/docs/plans"
cat > "$FIX/docs/plans/00_master_checklist.md" <<'EOF'
# Master

| 1 | foo | Status: Not Started |
| 2 | bar | Status: Not Started |
EOF
CLAUDE_PROJECT_DIR=$FIX run_hook "$COMPACT_SNAPSHOT" '{"session_id":"current"}'
SNAP=$(cat "$FIX/.claude/.bytheslice-state/compact-snapshot.json" 2>/dev/null)
case "$SNAP" in
  *'Status: Not Started'*) PASS=$((PASS+1)); printf '  ✓ compact-snapshot summary holds unfinished lines\n' ;;
  *) FAIL=$((FAIL+1)); FAILED_NAMES+=("compact-snapshot summary lines"); printf '  ✗ compact-snapshot summary empty: %s\n' "$SNAP" ;;
esac
rm -rf "$FIX"

# BTS_HOOKS_DISABLED → no snapshot, exit 0
FIX=$(mk_fixture)
write_state "$FIX" "current" "sell-slice"
BTS_HOOKS_DISABLED=1 CLAUDE_PROJECT_DIR=$FIX run_hook "$COMPACT_SNAPSHOT" '{"session_id":"current"}'
assert_exit "compact-snapshot disabled exits 0" 0
if [ -f "$FIX/.claude/.bytheslice-state/compact-snapshot.json" ]; then
  FAIL=$((FAIL+1)); FAILED_NAMES+=("compact-snapshot disabled no write"); printf '  ✗ compact-snapshot wrote despite disable\n'
else
  PASS=$((PASS+1)); printf '  ✓ compact-snapshot disabled writes nothing\n'
fi
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
