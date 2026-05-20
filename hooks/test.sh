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
STAGE_PLAN_GUARD="$HERE/stage-plan-guard.sh"
LIBRARY_GATE="$HERE/library-gate-guard.sh"
COMPACT_SNAPSHOT="$HERE/compact-snapshot.sh"
COMMIT_CORRELATOR="$HERE/commit-checklist-correlator.sh"

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

# --- box-it-up branch (stop-gate extension) ---

# box-it-up in current session, gh missing → PASS (fail open).
# Simulate a `gh`-less environment by building a sandbox PATH that symlinks
# every command the hook needs EXCEPT gh, then running with that PATH only.
mk_ghless_path() {
  local bindir cmd src
  bindir=$(mktemp -d)
  for cmd in bash sh git dirname date mkdir sed grep cat printf head tr awk env; do
    src=$(command -v "$cmd" 2>/dev/null) || continue
    ln -s "$src" "$bindir/$cmd" 2>/dev/null || true
  done
  printf '%s' "$bindir"
}
FIX=$(mk_fixture)
git -C "$FIX" checkout -q -b feat/box
write_state "$FIX" "current" "box-it-up"
GHLESS=$(mk_ghless_path)
LAST_OUT=$(printf '%s' '{"session_id":"current"}' | PATH="$GHLESS" CLAUDE_PROJECT_DIR="$FIX" "$GHLESS/bash" "$STOP_GATE" 2>&1); LAST_EXIT=$?
assert_exit "stop-gate box-it-up gh missing fails open" 0
assert_empty "stop-gate box-it-up gh missing silent"
rm -rf "$FIX" "$GHLESS"

# Build a sandbox PATH with every needed coreutil PLUS a fake `gh` that
# echoes a chosen PR state — exercises the actual block/pass decision.
mk_gh_path() {
  local state="$1" bindir cmd src
  bindir=$(mktemp -d)
  # Include jq — stop-gate.sh reads the state file's session_id/skill via jq
  # only, so without it the hook fails open before reaching the box-it-up
  # branch and the block/pass decision would never be exercised.
  for cmd in bash sh git dirname date mkdir sed grep cat printf head tr awk env jq; do
    src=$(command -v "$cmd" 2>/dev/null) || continue
    ln -s "$src" "$bindir/$cmd" 2>/dev/null || true
  done
  printf '#!/usr/bin/env bash\nprintf "%%s\\n" "%s"\n' "$state" > "$bindir/gh"
  chmod +x "$bindir/gh"
  printf '%s' "$bindir"
}

# box-it-up, PR state not MERGED (e.g. OPEN) → BLOCK once.
FIX=$(mk_fixture)
git -C "$FIX" checkout -q -b feat/box
write_state "$FIX" "current" "box-it-up"
GHPATH=$(mk_gh_path "OPEN")
LAST_OUT=$(printf '%s' '{"session_id":"current"}' | PATH="$GHPATH" CLAUDE_PROJECT_DIR="$FIX" "$GHPATH/bash" "$STOP_GATE" 2>&1); LAST_EXIT=$?
assert_exit "stop-gate box-it-up PR open blocks" 2
assert_contains "stop-gate box-it-up open message" "PR is not merged"
rm -rf "$FIX" "$GHPATH"

# box-it-up, PR state MERGED → PASS silent.
FIX=$(mk_fixture)
git -C "$FIX" checkout -q -b feat/box
write_state "$FIX" "current" "box-it-up"
GHPATH=$(mk_gh_path "MERGED")
LAST_OUT=$(printf '%s' '{"session_id":"current"}' | PATH="$GHPATH" CLAUDE_PROJECT_DIR="$FIX" "$GHPATH/bash" "$STOP_GATE" 2>&1); LAST_EXIT=$?
assert_exit "stop-gate box-it-up PR merged passes" 0
assert_empty "stop-gate box-it-up merged silent"
rm -rf "$FIX" "$GHPATH"

# box-it-up, re-entry guard (stop_hook_active) → never block even if PR open.
FIX=$(mk_fixture)
git -C "$FIX" checkout -q -b feat/box
write_state "$FIX" "current" "box-it-up"
GHPATH=$(mk_gh_path "OPEN")
LAST_OUT=$(printf '%s' '{"session_id":"current","stop_hook_active":true}' | PATH="$GHPATH" CLAUDE_PROJECT_DIR="$FIX" "$GHPATH/bash" "$STOP_GATE" 2>&1); LAST_EXIT=$?
assert_exit "stop-gate box-it-up re-entry never loops" 0
rm -rf "$FIX" "$GHPATH"

# box-it-up but skill state is from a different session → PASS.
FIX=$(mk_fixture)
git -C "$FIX" checkout -q -b feat/box
write_state "$FIX" "old-session" "box-it-up"
CLAUDE_PROJECT_DIR=$FIX run_hook "$STOP_GATE" '{"session_id":"current"}'
assert_exit "stop-gate box-it-up stale session ignored" 0
rm -rf "$FIX"

# box-it-up, BTS_HOOKS_DISABLED → PASS.
FIX=$(mk_fixture)
git -C "$FIX" checkout -q -b feat/box
write_state "$FIX" "current" "box-it-up"
BTS_HOOKS_DISABLED=1 CLAUDE_PROJECT_DIR=$FIX run_hook "$STOP_GATE" '{"session_id":"current"}'
assert_exit "stop-gate box-it-up disabled" 0
assert_empty "stop-gate box-it-up disabled silent"
rm -rf "$FIX"

# An unrelated skill (e.g. cook-pizzas) in current session → PASS.
FIX=$(mk_fixture)
write_state "$FIX" "current" "cook-pizzas"
CLAUDE_PROJECT_DIR=$FIX run_hook "$STOP_GATE" '{"session_id":"current"}'
assert_exit "stop-gate other skill passes" 0
assert_empty "stop-gate other skill silent"
rm -rf "$FIX"

####################################################################
# stage-plan-guard.sh
####################################################################

echo
echo "## stage-plan-guard.sh"

# stage plan path + sell-slice current session → BLOCK
FIX=$(mk_fixture)
write_state "$FIX" "current" "sell-slice"
CLAUDE_PROJECT_DIR=$FIX run_hook "$STAGE_PLAN_GUARD" \
  "{\"session_id\":\"current\",\"tool_input\":{\"file_path\":\"$FIX/docs/plans/stage_1_foo.md\"}}"
assert_exit "stage-plan-guard blocks during sell-slice" 2
assert_contains "stage-plan-guard block message" "refuses to edit stage plan files during /sell-slice"
rm -rf "$FIX"

# stage plan path + relative path form + sell-slice → BLOCK
FIX=$(mk_fixture)
write_state "$FIX" "current" "sell-slice"
CLAUDE_PROJECT_DIR=$FIX run_hook "$STAGE_PLAN_GUARD" \
  '{"session_id":"current","tool_input":{"file_path":"docs/plans/stage_2_bar.md"}}'
assert_exit "stage-plan-guard blocks relative path" 2
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

# watched path, approvals present, no approval, non-sell-slice → PASS
FIX=$(mk_fixture)
write_state "$FIX" "current" "cook-pizzas"
cat > "$FIX/.claude/.bytheslice-state/library-approvals.json" <<'EOF'
{"approvals":[],"watched_paths":["app/**"]}
EOF
CLAUDE_PROJECT_DIR=$FIX run_hook "$LIBRARY_GATE" \
  '{"session_id":"current","tool_input":{"file_path":"app/dashboard/page.tsx"}}'
assert_exit "library-gate non-sell-slice passes" 0
assert_empty "library-gate non-sell-slice silent"
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
# commit-checklist-correlator.sh
####################################################################

echo
echo "## commit-checklist-correlator.sh"

# Helper: a fixture with a Completed checklist, where the LAST commit did NOT
# touch the checklist (commits an unrelated file after the checklist commit).
mk_correlator_fixture() {
  local d
  d=$(mk_fixture)
  mkdir -p "$d/docs/plans"
  cat > "$d/docs/plans/00_master_checklist.md" <<'EOF'
# Master

| 1 | foo | Status: Completed |
EOF
  ( cd "$d" && git add docs/plans/00_master_checklist.md && git commit -q -m "checklist" )
  printf '%s' "$d"
}

# sell-slice + Completed row + last commit did NOT touch checklist → WARN
FIX=$(mk_correlator_fixture)
( cd "$FIX" && touch slice.txt && git add slice.txt && git commit -q -m "slice work" )
write_state "$FIX" "current" "sell-slice"
CLAUDE_PROJECT_DIR=$FIX run_hook "$COMMIT_CORRELATOR" \
  '{"session_id":"current","tool_input":{"command":"git commit -m slice"}}'
assert_exit "correlator warns on missing checklist in closeout" 0
assert_contains "correlator warn message" "docs/plans/00_master_checklist.md was not part of it"
rm -rf "$FIX"

# leading whitespace before git commit still triggers
FIX=$(mk_correlator_fixture)
( cd "$FIX" && touch slice.txt && git add slice.txt && git commit -q -m "slice work" )
write_state "$FIX" "current" "sell-slice"
CLAUDE_PROJECT_DIR=$FIX run_hook "$COMMIT_CORRELATOR" \
  '{"session_id":"current","tool_input":{"command":"   git commit -m slice"}}'
assert_exit "correlator handles leading whitespace" 0
assert_contains "correlator whitespace warn" "was not part of it"
rm -rf "$FIX"

# sell-slice + Completed row + last commit DID touch checklist → PASS
FIX=$(mk_correlator_fixture)
write_state "$FIX" "current" "sell-slice"
CLAUDE_PROJECT_DIR=$FIX run_hook "$COMMIT_CORRELATOR" \
  '{"session_id":"current","tool_input":{"command":"git commit -m closeout"}}'
assert_exit "correlator passes when checklist in commit" 0
assert_empty "correlator passes silent when checklist in commit"
rm -rf "$FIX"

# sell-slice but checklist has no Completed row → PASS
FIX=$(mk_fixture)
mkdir -p "$FIX/docs/plans"
cat > "$FIX/docs/plans/00_master_checklist.md" <<'EOF'
# Master

| 1 | foo | Status: Not Started |
EOF
( cd "$FIX" && git add docs/plans/00_master_checklist.md && git commit -q -m "checklist" )
( cd "$FIX" && touch slice.txt && git add slice.txt && git commit -q -m "slice" )
write_state "$FIX" "current" "sell-slice"
CLAUDE_PROJECT_DIR=$FIX run_hook "$COMMIT_CORRELATOR" \
  '{"session_id":"current","tool_input":{"command":"git commit -m slice"}}'
assert_exit "correlator no Completed row passes" 0
assert_empty "correlator no Completed row silent"
rm -rf "$FIX"

# not a git commit → PASS
FIX=$(mk_correlator_fixture)
write_state "$FIX" "current" "sell-slice"
CLAUDE_PROJECT_DIR=$FIX run_hook "$COMMIT_CORRELATOR" \
  '{"session_id":"current","tool_input":{"command":"git status"}}'
assert_exit "correlator non-commit passes" 0
assert_empty "correlator non-commit silent"
rm -rf "$FIX"

# sell-slice mismatch (cook-pizzas) → PASS
FIX=$(mk_correlator_fixture)
( cd "$FIX" && touch slice.txt && git add slice.txt && git commit -q -m "slice" )
write_state "$FIX" "current" "cook-pizzas"
CLAUDE_PROJECT_DIR=$FIX run_hook "$COMMIT_CORRELATOR" \
  '{"session_id":"current","tool_input":{"command":"git commit -m slice"}}'
assert_exit "correlator non-sell-slice passes" 0
assert_empty "correlator non-sell-slice silent"
rm -rf "$FIX"

# stale session → PASS
FIX=$(mk_correlator_fixture)
( cd "$FIX" && touch slice.txt && git add slice.txt && git commit -q -m "slice" )
write_state "$FIX" "old-session" "sell-slice"
CLAUDE_PROJECT_DIR=$FIX run_hook "$COMMIT_CORRELATOR" \
  '{"session_id":"current","tool_input":{"command":"git commit -m slice"}}'
assert_exit "correlator stale session passes" 0
assert_empty "correlator stale session silent"
rm -rf "$FIX"

# no state file → PASS
FIX=$(mk_correlator_fixture)
( cd "$FIX" && touch slice.txt && git add slice.txt && git commit -q -m "slice" )
CLAUDE_PROJECT_DIR=$FIX run_hook "$COMMIT_CORRELATOR" \
  '{"session_id":"current","tool_input":{"command":"git commit -m slice"}}'
assert_exit "correlator no state passes" 0
assert_empty "correlator no state silent"
rm -rf "$FIX"

# BTS_HOOKS_DISABLED → PASS
FIX=$(mk_correlator_fixture)
( cd "$FIX" && touch slice.txt && git add slice.txt && git commit -q -m "slice" )
write_state "$FIX" "current" "sell-slice"
BTS_HOOKS_DISABLED=1 CLAUDE_PROJECT_DIR=$FIX run_hook "$COMMIT_CORRELATOR" \
  '{"session_id":"current","tool_input":{"command":"git commit -m slice"}}'
assert_exit "correlator disabled passes" 0
assert_empty "correlator disabled silent"
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
