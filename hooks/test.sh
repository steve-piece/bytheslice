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
KITCHEN_LOG="$HERE/kitchen-log.sh"

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

# Run a hook from a given working directory (the hook's process cwd).
# Args: dir, hook-path, json-stdin. Sets globals: LAST_EXIT, LAST_OUT.
run_hook_in() {
  local dir="$1" hook="$2" payload="$3"
  LAST_OUT=$(cd "$dir" && printf '%s' "$payload" | bash "$hook" 2>&1)
  LAST_EXIT=$?
}

# Encode a string as a JSON string literal (quotes, backslashes, newlines).
json_str() {
  local s="$1"
  s=${s//\\/\\\\}
  s=${s//\"/\\\"}
  s=${s//$'\n'/\\n}
  printf '"%s"' "$s"
}

# Run pre-commit-guard on a raw Bash command, so tests need no hand-escaped
# JSON. Args: cwd (process cwd and input .cwd), project dir, command.
# Sets globals: LAST_EXIT, LAST_OUT.
run_guard() {
  local cwd="$1" proj="$2" cmd="$3"
  CLAUDE_PROJECT_DIR=$proj run_hook_in "$cwd" "$COMMIT_GUARD" \
    "{\"tool_input\":{\"command\":$(json_str "$cmd")},\"cwd\":$(json_str "$cwd")}"
}

# Make a primary checkout on main with two linked worktrees on feature
# branches under .claude/worktrees/ (one path contains a space, to exercise
# quoting). Mirrors the layout Claude Code creates. Echoes the primary path.
mk_worktree_fixture() {
  local d
  d=$(mk_fixture)
  git -C "$d" worktree add -q -b feat/wt "$d/.claude/worktrees/wt"
  git -C "$d" worktree add -q -b feat/wt-space "$d/.claude/worktrees/wt space"
  printf '%s' "$d"
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

# /sell-slice without checklist → setup context, never BLOCK
FIX=$(mk_fixture)
CLAUDE_PROJECT_DIR=$FIX run_hook "$PRECHECK" '{"prompt":"/sell-slice","session_id":"s1"}'
assert_exit "sell-slice no checklist" 0
assert_contains "sell-slice no checklist offers setup" "AskUserQuestion tool to ask the user whether to set up ByTheSlice"
rm -rf "$FIX"

# /sell-slice mentioned mid-prompt without checklist → WARN, never BLOCK
FIX=$(mk_fixture)
CLAUDE_PROJECT_DIR=$FIX run_hook "$PRECHECK" '{"prompt":"Review Pie 4.\\n3. Exercise real `/sell-slice` activity.","session_id":"s1m"}'
assert_exit "sell-slice mention no checklist" 0
assert_contains "sell-slice mention offers setup" "No master checklist is set up"
if [ -f "$FIX/.claude/.bytheslice-state/last-precheck.json" ]; then
  FAIL=$((FAIL+1)); FAILED_NAMES+=("sell-slice mention skips state"); printf '  ✗ sell-slice mention skips state\n'
else
  PASS=$((PASS+1)); printf '  ✓ sell-slice mention skips state\n'
fi
rm -rf "$FIX"

# /box-it-up mentioned mid-prompt on main → WARN, never BLOCK
FIX=$(mk_fixture)
CLAUDE_PROJECT_DIR=$FIX run_hook "$PRECHECK" '{"prompt":"After this, run /box-it-up to open the PR.","session_id":"s1n"}'
assert_exit "box-it-up mention on main" 0
assert_contains "box-it-up mention warns" "mentioned, not invoked"
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

# /sell-slice with complete legacy bare-box Prep (pre-5.1.3 output) → PASS
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

# /sell-slice with incomplete legacy bare-box Prep → WARN with correct counts
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

# /sell-slice with mixed canonical dashed + legacy bare Prep boxes → both forms counted
FIX=$(mk_fixture)
mkdir -p "$FIX/docs/plans"
cat > "$FIX/docs/plans/00_master_checklist.md" <<'EOF'
# Master

## Prep

- [x] Canonical dashed box
[ ] Legacy dashless box
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

# /special-order without checklist → setup context, never BLOCK
FIX=$(mk_fixture)
CLAUDE_PROJECT_DIR=$FIX run_hook "$PRECHECK" '{"prompt":"/special-order","session_id":"s9"}'
assert_exit "special-order without checklist" 0
assert_contains "special-order without checklist offers setup" "AskUserQuestion"
rm -rf "$FIX"

####################################################################
# pre-commit-guard.sh
####################################################################

echo
echo "## pre-commit-guard.sh"

# git commit on main → BLOCK
FIX=$(mk_fixture)
CLAUDE_PROJECT_DIR=$FIX run_hook_in "$FIX" "$COMMIT_GUARD" '{"tool_input":{"command":"git commit -m test"}}'
assert_exit "commit on main blocked" 2
assert_contains "commit-on-main message" "refusing git commit on main"
rm -rf "$FIX"

# git commit on master → BLOCK
FIX=$(mk_fixture)
git -C "$FIX" branch -q -m master
CLAUDE_PROJECT_DIR=$FIX run_hook_in "$FIX" "$COMMIT_GUARD" '{"tool_input":{"command":"git commit -m test"}}'
assert_exit "commit on master blocked" 2
assert_contains "commit-on-master message" "refusing git commit on master"
rm -rf "$FIX"

# git commit on feature branch → PASS (with possible WARN if staged files)
FIX=$(mk_fixture)
git -C "$FIX" checkout -q -b feat/x
CLAUDE_PROJECT_DIR=$FIX run_hook_in "$FIX" "$COMMIT_GUARD" '{"tool_input":{"command":"git commit -m test"}}'
assert_exit "commit on feature branch" 0
rm -rf "$FIX"

# hook cwd outside any repo → falls back to CLAUDE_PROJECT_DIR (on main) → BLOCK
FIX=$(mk_fixture)
NOREPO=$(mktemp -d)
CLAUDE_PROJECT_DIR=$FIX run_hook_in "$NOREPO" "$COMMIT_GUARD" '{"tool_input":{"command":"git commit -m test"}}'
assert_exit "commit falls back to CLAUDE_PROJECT_DIR" 2
rm -rf "$FIX" "$NOREPO"

# non-git-commit → PASS
FIX=$(mk_fixture)
CLAUDE_PROJECT_DIR=$FIX run_hook_in "$FIX" "$COMMIT_GUARD" '{"tool_input":{"command":"npm test"}}'
assert_exit "non-commit pass" 0
assert_empty "non-commit silent"
rm -rf "$FIX"

# git commit-tree / git -C <dir> status are not commits → PASS
FIX=$(mk_fixture)
CLAUDE_PROJECT_DIR=$FIX run_hook_in "$FIX" "$COMMIT_GUARD" '{"tool_input":{"command":"git commit-tree HEAD^{tree} -m x"}}'
assert_exit "commit-tree is not a commit" 0
CLAUDE_PROJECT_DIR=$FIX run_hook_in "$FIX" "$COMMIT_GUARD" "{\"tool_input\":{\"command\":\"git -C $FIX status\"}}"
assert_exit "git -C status is not a commit" 0
assert_empty "git -C status silent"
rm -rf "$FIX"

# BTS_HOOKS_DISABLED → PASS
FIX=$(mk_fixture)
BTS_HOOKS_DISABLED=1 CLAUDE_PROJECT_DIR=$FIX run_hook_in "$FIX" "$COMMIT_GUARD" '{"tool_input":{"command":"git commit -m test"}}'
assert_exit "commit-guard disabled" 0
rm -rf "$FIX"

# Worktree regression (2026-10-05): CLAUDE_PROJECT_DIR is the primary checkout
# on main, but the commit runs inside a linked worktree on a feature branch.
# The guard must read the worktree's HEAD, not the primary's.
FIX=$(mk_worktree_fixture)
WT="$FIX/.claude/worktrees/wt"
WTS="$FIX/.claude/worktrees/wt space"

# git -C <worktree> commit → PASS
CLAUDE_PROJECT_DIR=$FIX run_hook_in "$FIX" "$COMMIT_GUARD" "{\"tool_input\":{\"command\":\"git -C $WT commit -m test\"},\"cwd\":\"$FIX\"}"
assert_exit "worktree: git -C <wt> commit allowed" 0

# cd <worktree> && git commit → PASS
CLAUDE_PROJECT_DIR=$FIX run_hook_in "$FIX" "$COMMIT_GUARD" "{\"tool_input\":{\"command\":\"cd $WT && git add -A && git commit -m test\"},\"cwd\":\"$FIX\"}"
assert_exit "worktree: cd <wt> && git commit allowed" 0

# relative cd from the primary checkout → PASS
CLAUDE_PROJECT_DIR=$FIX run_hook_in "$FIX" "$COMMIT_GUARD" "{\"tool_input\":{\"command\":\"cd .claude/worktrees/wt; git commit -m test\"},\"cwd\":\"$FIX\"}"
assert_exit "worktree: relative cd allowed" 0

# quoted path with a space, via both cd and git -C → PASS
CLAUDE_PROJECT_DIR=$FIX run_hook_in "$FIX" "$COMMIT_GUARD" "{\"tool_input\":{\"command\":\"cd \\\"$WTS\\\" && git commit -m test\"},\"cwd\":\"$FIX\"}"
assert_exit "worktree: quoted cd with space allowed" 0
CLAUDE_PROJECT_DIR=$FIX run_hook_in "$FIX" "$COMMIT_GUARD" "{\"tool_input\":{\"command\":\"git -C '$WTS' commit -m test\"},\"cwd\":\"$FIX\"}"
assert_exit "worktree: single-quoted git -C with space allowed" 0

# ~-relative cd → PASS
HOME=$FIX CLAUDE_PROJECT_DIR=$FIX run_hook_in "$FIX" "$COMMIT_GUARD" "{\"tool_input\":{\"command\":\"cd ~/.claude/worktrees/wt && git commit -m test\"},\"cwd\":\"$FIX\"}"
assert_exit "worktree: tilde cd allowed" 0

# hook cwd inside the worktree, plain git commit → PASS
CLAUDE_PROJECT_DIR=$FIX run_hook_in "$WT" "$COMMIT_GUARD" '{"tool_input":{"command":"git commit -m test"}}'
assert_exit "worktree: hook process cwd in wt allowed" 0

# input .cwd is the worktree even though the process cwd is the primary → PASS
CLAUDE_PROJECT_DIR=$FIX run_hook_in "$FIX" "$COMMIT_GUARD" "{\"tool_input\":{\"command\":\"git commit -m test\"},\"cwd\":\"$WT\"}"
assert_exit "worktree: input cwd in wt allowed" 0

# Still blocks real main commits: from inside the worktree, target the primary
CLAUDE_PROJECT_DIR=$WT run_hook_in "$WT" "$COMMIT_GUARD" "{\"tool_input\":{\"command\":\"git -C $FIX commit -m test\"},\"cwd\":\"$WT\"}"
assert_exit "worktree: git -C <primary on main> commit blocked" 2
assert_contains "worktree: git -C primary message" "refusing git commit on main"
CLAUDE_PROJECT_DIR=$WT run_hook_in "$WT" "$COMMIT_GUARD" "{\"tool_input\":{\"command\":\"cd $FIX && git commit -m test\"},\"cwd\":\"$WT\"}"
assert_exit "worktree: cd <primary on main> && git commit blocked" 2
CLAUDE_PROJECT_DIR=$FIX run_hook_in "$FIX" "$COMMIT_GUARD" "{\"tool_input\":{\"command\":\"git commit -m test\"},\"cwd\":\"$FIX\"}"
assert_exit "worktree: plain commit in primary on main blocked" 2

# jq-less fallback parses escaped quotes and cwd the same way
mkdir -p "$FIX/nojq-bin"
for b in bash git sed cat head dirname mktemp pwd printf; do
  p=$(command -v "$b") && ln -sf "$p" "$FIX/nojq-bin/$b"
done
LAST_OUT=$(cd "$FIX" && printf '%s' "{\"tool_input\":{\"command\":\"cd \\\"$WTS\\\" && git commit -m test\"},\"cwd\":\"$FIX\"}" \
  | PATH="$FIX/nojq-bin" CLAUDE_PROJECT_DIR=$FIX "$FIX/nojq-bin/bash" "$COMMIT_GUARD" 2>&1)
LAST_EXIT=$?
assert_exit "worktree: jq-less quoted cd allowed" 0
LAST_OUT=$(cd "$FIX" && printf '%s' "{\"tool_input\":{\"command\":\"git commit -m \\\"msg\\\"\"},\"cwd\":\"$FIX\"}" \
  | PATH="$FIX/nojq-bin" CLAUDE_PROJECT_DIR=$FIX "$FIX/nojq-bin/bash" "$COMMIT_GUARD" 2>&1)
LAST_EXIT=$?
assert_exit "worktree: jq-less commit on main blocked" 2
LAST_OUT=$(cd "$WT" && printf '%s' "{\"tool_input\":{\"command\":\"git -C ../wt\\\\ space/../../.. commit -m x\"},\"cwd\":\"$WT\"}" \
  | PATH="$FIX/nojq-bin" CLAUDE_PROJECT_DIR=$WT "$FIX/nojq-bin/bash" "$COMMIT_GUARD" 2>&1)
LAST_EXIT=$?
assert_exit "worktree: jq-less backslash-escaped -C path to main blocked" 2

# Shell forms that must not let a main commit through. Each one fooled the
# first cut of the resolver, which modeled only the first commit in the
# command and only a plain `cd <dir>` sequence before it.
run_guard "$FIX" "$FIX" "git -C $WT commit -m a && git -C $FIX commit -m b"
assert_exit "worktree: second commit on main blocked" 2
run_guard "$FIX" "$FIX" "cd $WT && git commit -m a && cd $FIX && git commit -m b"
assert_exit "worktree: cd back to main for a second commit blocked" 2
run_guard "$FIX" "$FIX" "(cd $WT && make) && git commit -m x"
assert_exit "worktree: subshell cd does not move the commit" 2
run_guard "$FIX" "$FIX" "cd $WT && cd - && git commit -m x"
assert_exit "worktree: cd - back to main blocked" 2
run_guard "$WT" "$WT" "pushd $FIX && git commit -m x"
assert_exit "worktree: pushd to main blocked" 2
run_guard "$WT" "$WT" "cd -P $FIX && git commit -m x"
assert_exit "worktree: cd -P to main blocked" 2
run_guard "$WT" "$WT" "git --git-dir=$FIX/.git --work-tree=$FIX commit -m x"
assert_exit "worktree: --git-dir=<main> blocked" 2
run_guard "$WT" "$WT" "git --git-dir $FIX/.git --work-tree $FIX commit -m x"
assert_exit "worktree: --git-dir <main> (space form) blocked" 2
run_guard "$WT" "$WT" "GIT_DIR=$FIX/.git git commit -m x"
assert_exit "worktree: GIT_DIR=<main> blocked" 2
run_guard "$WT" "$FIX" "cd \"\$MAIN\" && git commit -m x"
assert_exit "worktree: unresolvable cd also checks the project dir" 2
run_guard "$FIX" "$FIX" "/usr/bin/git commit -m x"
assert_exit "worktree: path-qualified git on main blocked" 2
run_guard "$FIX" "$FIX" "echo \`git commit -m x\`"
assert_exit "worktree: backtick commit on main blocked" 2
run_guard "$WT" "$WT" "bash -c 'cd $FIX && git commit -m x'"
assert_exit "worktree: bash -c cd to main blocked" 2
run_guard "$WT" "$WT" "git -C ../wt\\ space/../../.. commit -m x"
assert_exit "worktree: backslash-escaped -C path to main blocked" 2

# ...without blocking the ordinary worktree forms next to them
run_guard "$FIX" "$FIX" "pushd $WT && git commit -m x"
assert_exit "worktree: pushd to wt allowed" 0
run_guard "$FIX" "$FIX" "cd .claude/worktrees/wt\\ space && git commit -m x"
assert_exit "worktree: backslash-escaped cd to wt allowed" 0
run_guard "$FIX" "$FIX" "git --git-dir=$FIX/.git/worktrees/wt --work-tree=$WT commit -m x"
assert_exit "worktree: --git-dir=<wt gitdir> allowed" 0
run_guard "$FIX" "$FIX" "(cd $WT && git commit -m x)"
assert_exit "worktree: commit inside a subshell cd allowed" 0
run_guard "$FIX" "$FIX" "cd $WT && git commit -m \"\$(printf 'a\\nb')\" && git log -1"
assert_exit "worktree: \$(...) message after the commit allowed" 0
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
# Prep uses legacy bare boxes (pre-5.1.3 output), which must still count.
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
# kitchen-log.sh
####################################################################

echo
echo "## kitchen-log.sh"

# Assertions use an absolute Node path so the logger can have a parser-free PATH.
KITCHEN_NODE=$(command -v node || true)
KITCHEN_BASH=$(command -v bash)
if [ -z "$KITCHEN_NODE" ]; then
  FAIL=$((FAIL+1)); FAILED_NAMES+=("kitchen tests require Node.js")
  printf '  ✗ kitchen tests require Node.js\n'
else
  kitchen_assert() {
    local name="$1" expression="$2" out
    out=$("$KITCHEN_NODE" -e '
      const fs = require("fs"), dir = process.argv[1], expr = process.argv[2];
      const log = dir + "/.claude/.bytheslice-state/kitchen/activity.jsonl";
      const archive = dir + "/.claude/.bytheslice-state/kitchen/activity.1.jsonl";
      const read = p => fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
      try {
        const rows = read(log).split("\n").filter(s => s.trim()).map(JSON.parse);
        const old = read(archive).split("\n").filter(s => s.trim()).map(JSON.parse);
        if (!eval(expr)) process.exit(1);
      } catch (e) { console.error(e.message); process.exit(1); }
    ' "$FIX" "$expression" 2>&1)
    if [ "$?" = 0 ]; then
      PASS=$((PASS+1)); printf '  ✓ %s\n' "$name"
    else
      FAIL=$((FAIL+1)); FAILED_NAMES+=("$name"); printf '  ✗ %s %s\n' "$name" "$out"
    fi
  }

  # Force each available parser through the same event, privacy and attribution cases.
  KITCHEN_BINS=$(mktemp -d)
  for utility in bash cat dirname git awk mkdir wc tr mv rmdir sleep mktemp ln readlink rm; do
    ln -s "$(command -v "$utility")" "$KITCHEN_BINS/$utility"
  done
  ln -s "$KITCHEN_NODE" "$KITCHEN_BINS/node"
  for ENGINE in jq node; do
    if [ "$ENGINE" = jq ]; then
      command -v jq >/dev/null 2>&1 || continue
      KITCHEN_PATH=$PATH
    else
      KITCHEN_PATH=$KITCHEN_BINS
    fi
    FIX=$(mk_fixture)
    LOG="$FIX/.claude/.bytheslice-state/kitchen/activity.jsonl"
    for EVENT in SessionStart SubagentStart SubagentStop PreAgent PostAgent Skill UserPromptExpansion Stop; do
      case "$EVENT" in
        PreAgent) EV=PreToolUse; EXTRA='"tool_name":"Agent","tool_input":{"description":"P7 S7.3 build: feed","subagent_type":"bytheslice:implementer","prompt":"PRIVATE_PROMPT"}' ;;
        PostAgent) EV=PostToolUse; EXTRA='"tool_name":"Agent","tool_input":{"description":"P7 S7.3 build: feed","subagent_type":"bytheslice:implementer","prompt":"PRIVATE_PROMPT"},"tool_response":{"agentId":"worker-1","totalTokens":123.9,"totalDurationMs":456.9,"status":"completed","output":"PRIVATE_OUTPUT"}' ;;
        Skill) EV=PreToolUse; EXTRA='"tool_name":"Skill","tool_input":{"skill":"bytheslice:sell-pie","args":"PRIVATE_ARGS"}' ;;
        UserPromptExpansion) EV=$EVENT; EXTRA='"command_name":"bytheslice:sell-pie","command_source":"plugin","command_args":"PRIVATE_ARGS"' ;;
        *) EV=$EVENT; EXTRA='"agent_type":"bytheslice:implementer","agent_id":"worker-1"' ;;
      esac
      rm -f "$LOG"
      PAYLOAD="{\"session_id\":\"session-1\",\"hook_event_name\":\"$EV\",$EXTRA,\"prompt\":\"PRIVATE_PROMPT\",\"last_assistant_message\":\"PRIVATE_ASSISTANT\",\"contents\":\"PRIVATE_CONTENTS\",\"secret\":\"PRIVATE_SECRET\",\"token\":\"PRIVATE_TOKEN\"}"
      LAST_OUT=$(printf '%s' "$PAYLOAD" | PATH="$KITCHEN_PATH" CLAUDE_PROJECT_DIR="$FIX" BTS_TEST_SECRET=PRIVATE_ENV "$KITCHEN_BASH" "$KITCHEN_LOG" 2>&1)
      LAST_EXIT=$?
      assert_exit "kitchen $ENGINE $EVENT exits 0" 0
      assert_empty "kitchen $ENGINE $EVENT silent"
      kitchen_assert "kitchen $ENGINE $EVENT exactly one matching row" "rows.length === 1 && rows[0].ev === '$EV' && rows[0].sid === 'session-1' && Number.isInteger(rows[0].t)"
      kitchen_assert "kitchen $ENGINE $EVENT privacy allowlist" 'rows.every(r => Object.keys(r).every(k => ["t","sid","ev","agent","aid","label","skill","tok","ms","ok","pie","slice","src"].includes(k))) && !read(log).includes("PRIVATE_")'
      case "$EVENT" in
        Subagent*) kitchen_assert "kitchen $ENGINE $EVENT identity" 'rows[0].agent === "bytheslice:implementer" && rows[0].aid === "worker-1"' ;;
        PreAgent|PostAgent) kitchen_assert "kitchen $ENGINE $EVENT dispatch fields" 'rows[0].agent === "bytheslice:implementer" && rows[0].label === "P7 S7.3 build: feed" && rows[0].pie === 7 && rows[0].slice === "7.3"' ;;
        Skill) kitchen_assert "kitchen $ENGINE Skill name" 'rows[0].skill === "bytheslice:sell-pie" && !("label" in rows[0])' ;;
        UserPromptExpansion) kitchen_assert "kitchen $ENGINE slash command" 'rows[0].skill === "bytheslice:sell-pie" && rows[0].src === "plugin" && !("label" in rows[0])' ;;
      esac
      if [ "$EVENT" = PostAgent ]; then
        kitchen_assert "kitchen $ENGINE Agent result" 'rows[0].aid === "worker-1" && rows[0].tok === 123 && rows[0].ms === 456 && rows[0].ok === true'
      fi
    done

    rm -f "$LOG"
    PAYLOAD=$("$KITCHEN_NODE" -e 'process.stdout.write(JSON.stringify({hook_event_name:"PreToolUse",tool_name:"Agent",tool_input:{description:"P4 S4.1 build: runner\r\nnext\ttab " + "🍕".repeat(130)}}))')
    PATH="$KITCHEN_PATH" CLAUDE_PROJECT_DIR="$FIX" run_hook "$KITCHEN_LOG" "$PAYLOAD"
    kitchen_assert "kitchen $ENGINE Unicode label cap and newline removal" 'Array.from(rows[0].label).length === 120 && rows[0].label.startsWith("P4 S4.1 build: runner next tab ") && !/[\r\n\t]/.test(rows[0].label)'
    if [ "$ENGINE" = jq ]; then
      KITCHEN_PARITY=$("$KITCHEN_NODE" -e 'const fs=require("fs"),r=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));delete r.t;process.stdout.write(JSON.stringify(r))' "$LOG")
    else
      kitchen_assert "kitchen jq/Node field parity" "JSON.stringify((({t,...r}) => r)(rows[0])) === $(json_str "${KITCHEN_PARITY:-}")"
    fi

    mkdir -p "$FIX/docs/plans"
    cat > "$FIX/docs/plans/00_master_checklist.md" <<'EOF'
## Pie 1 [x]
### Slice 1.1 [ ]
## Pie 2 Status: Completed
### Slice 2.1 [ ]
## Pie 3 [ ]
### Slice 3.1 [x]
### Slice 3.2 ~~Done~~
### Slice 3.3 Status: Done
### Slice 3.4 [ ]
## Pie 4 [ ]
### Slice 4.1 [x]
### Slice 4.2 [ ]
EOF
    rm -f "$LOG"
    PATH="$KITCHEN_PATH" CLAUDE_PROJECT_DIR="$FIX" run_hook "$KITCHEN_LOG" '{"hook_event_name":"SubagentStart","agent_type":""}'
    kitchen_assert "kitchen $ENGINE checklist attribution and empty agent" 'rows[0].pie === 3 && rows[0].slice === "3.4" && !("agent" in rows[0]) && !("sid" in rows[0])'
    for BRANCH in pie-4-live pie/4-live; do
      git -C "$FIX" checkout -q -b "$BRANCH"
      rm -f "$LOG"
      PATH="$KITCHEN_PATH" CLAUDE_PROJECT_DIR="$FIX" run_hook "$KITCHEN_LOG" '{"hook_event_name":"SubagentStart"}'
      kitchen_assert "kitchen $ENGINE $BRANCH overrides checklist" 'rows[0].pie === 4 && rows[0].slice === "4.2"'
      rm -f "$LOG"
      PATH="$KITCHEN_PATH" CLAUDE_PROJECT_DIR="$FIX" run_hook "$KITCHEN_LOG" '{"hook_event_name":"PreToolUse","tool_name":"Agent","tool_input":{"description":"P7 S7.3 build: feed"}}'
      kitchen_assert "kitchen $ENGINE label overrides branch and checklist" 'rows[0].pie === 7 && rows[0].slice === "7.3"'
    done
    git -C "$FIX" checkout -q -b pie-8-live
    rm -f "$LOG"
    PATH="$KITCHEN_PATH" CLAUDE_PROJECT_DIR="$FIX" run_hook "$KITCHEN_LOG" '{"hook_event_name":"Stop"}'
    kitchen_assert "kitchen $ENGINE branch without matching checklist pie" 'rows[0].pie === 8 && !("slice" in rows[0])'
    git -C "$FIX" checkout -q main
    git -C "$FIX" worktree add -q -b pie-4-wt "$FIX/.claude/worktrees/live"
    rm -f "$LOG"
    PATH="$KITCHEN_PATH" CLAUDE_PROJECT_DIR="$FIX" run_hook "$KITCHEN_LOG" "{\"hook_event_name\":\"SubagentStart\",\"cwd\":$(json_str "$FIX/.claude/worktrees/live")}"
    kitchen_assert "kitchen $ENGINE worktree cwd attribution" 'rows[0].pie === 4 && rows[0].slice === "4.2"'
    if [ -e "$FIX/.claude/worktrees/live/.claude/.bytheslice-state" ]; then
      FAIL=$((FAIL+1)); FAILED_NAMES+=("kitchen log stays at project root")
    else
      PASS=$((PASS+1)); printf '  ✓ kitchen %s log stays at project root\n' "$ENGINE"
    fi
    rm -f "$FIX/docs/plans/00_master_checklist.md" "$LOG"
    PATH="$KITCHEN_PATH" CLAUDE_PROJECT_DIR="$FIX" run_hook "$KITCHEN_LOG" '{"hook_event_name":"Stop"}'
    kitchen_assert "kitchen $ENGINE unresolved attribution omitted" '!("pie" in rows[0]) && !("slice" in rows[0])'
    for STATUS in error async_launched; do
      rm -f "$LOG"
      PATH="$KITCHEN_PATH" CLAUDE_PROJECT_DIR="$FIX" run_hook "$KITCHEN_LOG" "{\"hook_event_name\":\"PostToolUse\",\"tool_name\":\"Agent\",\"tool_response\":{\"status\":\"$STATUS\"}}"
      if [ "$STATUS" = error ]; then
        kitchen_assert "kitchen $ENGINE failed Agent result" 'rows[0].ok === false'
      else
        kitchen_assert "kitchen $ENGINE async result has no completion" '!("ok" in rows[0])'
      fi
    done
    for PAYLOAD in '{broken' '[]' 'null' '"string"' '{} {}' '{"hook_event_name":"Stop"} {}' '{"hook_event_name":"PreToolUse","tool_name":"Bash"}' '{"hook_event_name":"PreToolUse","tool_name":"Task"}' '{"hook_event_name":"Unknown"}'; do
      rm -f "$LOG"
      LAST_OUT=$(printf '%s' "$PAYLOAD" | PATH="$KITCHEN_PATH" CLAUDE_PROJECT_DIR="$FIX" "$KITCHEN_BASH" "$KITCHEN_LOG" 2>&1)
      LAST_EXIT=$?
      assert_exit "kitchen $ENGINE malformed/unwired exits 0" 0
      assert_empty "kitchen $ENGINE malformed/unwired silent"
      kitchen_assert "kitchen $ENGINE malformed/unwired writes nothing" '!fs.existsSync(log)'
    done
    rm -rf "$FIX"
  done

  # A disabled hook and a parser-free invocation create no state directory.
  FIX=$(mk_fixture)
  BTS_HOOKS_DISABLED=1 CLAUDE_PROJECT_DIR="$FIX" run_hook "$KITCHEN_LOG" '{"hook_event_name":"Stop"}'
  assert_exit "kitchen disabled exits 0" 0
  assert_empty "kitchen disabled silent"
  kitchen_assert "kitchen disabled no state" '!fs.existsSync(dir + "/.claude/.bytheslice-state")'
  rm -f "$KITCHEN_BINS/node"
  LAST_OUT=$(printf '%s' '{"hook_event_name":"Stop"}' | PATH="$KITCHEN_BINS" CLAUDE_PROJECT_DIR="$FIX" "$KITCHEN_BASH" "$KITCHEN_LOG" 2>&1)
  LAST_EXIT=$?
  assert_exit "kitchen neither parser exits 0" 0
  assert_empty "kitchen neither parser silent"
  kitchen_assert "kitchen neither parser no state" '!fs.existsSync(dir + "/.claude/.bytheslice-state")'
  rm -rf "$KITCHEN_BINS" "$FIX"

  FIX=$(mk_fixture)
  LOG="$FIX/.claude/.bytheslice-state/kitchen/activity.jsonl"
  mkdir -p "$(dirname "$LOG")"
  "$KITCHEN_NODE" -e 'require("fs").writeFileSync(process.argv[1], " ".repeat(2097151) + "\n")' "$LOG"
  CLAUDE_PROJECT_DIR="$FIX" run_hook "$KITCHEN_LOG" '{"hook_event_name":"SessionStart"}'
  kitchen_assert "kitchen exact size cap appends without rotation" 'rows.length === 1 && !fs.existsSync(archive) && fs.statSync(log).size > 2097152'
  CLAUDE_PROJECT_DIR="$FIX" run_hook "$KITCHEN_LOG" '{"hook_event_name":"Stop"}'
  kitchen_assert "kitchen oversized log rotates with new row" 'rows.length === 1 && rows[0].ev === "Stop" && old.length === 1 && old[0].ev === "SessionStart"'
  "$KITCHEN_NODE" -e 'require("fs").writeFileSync(process.argv[1], " ".repeat(2097153) + "\n")' "$LOG"
  CLAUDE_PROJECT_DIR="$FIX" run_hook "$KITCHEN_LOG" '{"hook_event_name":"SessionStart"}'
  kitchen_assert "kitchen keeps only one replaced rotation" 'rows.length === 1 && old.length === 0 && fs.readdirSync(require("path").dirname(log)).sort().join(",") === "activity.1.jsonl,activity.jsonl"'
  "$KITCHEN_NODE" -e 'require("fs").writeFileSync(process.argv[1], " ".repeat(2097153) + "\n")' "$LOG"
  PIDS=()
  for N in {1..12}; do
    (printf '{"hook_event_name":"Stop","session_id":"concurrent-%s"}' "$N" | CLAUDE_PROJECT_DIR="$FIX" "$KITCHEN_BASH" "$KITCHEN_LOG") &
    PIDS+=("$!")
  done
  for PID in "${PIDS[@]}"; do wait "$PID"; done
  kitchen_assert "kitchen concurrent rotation keeps every unique row" 'rows.length + old.length === 12 && new Set([...rows,...old].map(r => r.sid)).size === 12'
  rm -rf "$FIX"

  # Hold a real writer inside its critical section, then contend or SIGKILL it.
  # Only the first size check pauses; recovery writers continue through the shim.
  KITCHEN_REAL_WC=$(command -v wc)
  for LOCK_CASE in healthy killed; do
    FIX=$(mk_fixture)
    LOG="$FIX/.claude/.bytheslice-state/kitchen/activity.jsonl"
    GATE="$FIX/gate"
    mkdir -p "$(dirname "$LOG")" "$GATE/bin"
    "$KITCHEN_NODE" -e 'const fs=require("fs");fs.writeFileSync(process.argv[1], " ".repeat(2097153)+"\n");fs.writeFileSync(process.argv[2],JSON.stringify({sid:"previous"})+"\n")' "$LOG" "$(dirname "$LOG")/activity.1.jsonl"
    cat > "$GATE/bin/wc" <<'EOF'
# hooks/test.sh fixture/wc
# Pause one size check to test healthy and killed activity lock owners.
if mkdir "$KITCHEN_TEST_GATE/claimed" 2>/dev/null; then
  : > "$KITCHEN_TEST_GATE/ready"
  while [ ! -f "$KITCHEN_TEST_GATE/release" ]; do sleep 0.02; done
fi
exec "$KITCHEN_TEST_WC" "$@"
EOF
    chmod +x "$GATE/bin/wc"
    KITCHEN_TEST_GATE="$GATE" KITCHEN_TEST_WC="$KITCHEN_REAL_WC" PATH="$GATE/bin:$PATH" CLAUDE_PROJECT_DIR="$FIX" \
      "$KITCHEN_BASH" "$KITCHEN_LOG" <<< '{"hook_event_name":"Stop","session_id":"holder"}' > "$GATE/output" 2>&1 &
    HOLDER=$!
    for N in {1..200}; do
      [ ! -f "$GATE/ready" ] || break
      sleep 0.02
    done
    kitchen_assert "kitchen $LOCK_CASE owner reaches locked size check" 'fs.existsSync(dir+"/gate/ready") && fs.lstatSync(require("path").dirname(log)+"/.activity.lock").isSymbolicLink()'
    if [ "$LOCK_CASE" = killed ]; then
      kill -KILL "$HOLDER" 2>/dev/null || true
      { wait "$HOLDER"; } 2>/dev/null || true
      : > "$GATE/release"
    fi
    PIDS=()
    for N in {1..12}; do
      (printf '{"hook_event_name":"Stop","session_id":"recovery-%s"}' "$N" | KITCHEN_TEST_GATE="$GATE" KITCHEN_TEST_WC="$KITCHEN_REAL_WC" PATH="$GATE/bin:$PATH" CLAUDE_PROJECT_DIR="$FIX" "$KITCHEN_BASH" "$KITCHEN_LOG") &
      PIDS+=("$!")
    done
    if [ "$LOCK_CASE" = healthy ]; then
      # At least one initialized contender must exist before checking the owner.
      for N in {1..100}; do
        CLAIMS=("$(dirname "$LOG")"/.activity.????????)
        [ "${#CLAIMS[@]}" -lt 2 ] || break
        sleep 0.01
      done
      kitchen_assert "kitchen healthy owner is not reclaimed under contention" 'fs.readdirSync(require("path").dirname(log)).filter(n=>/^\.activity\.[^.]+$/.test(n)&&n!==".activity.lock").length >= 2 && rows.length===0 && old.length===1 && old[0].sid==="previous" && fs.readFileSync(dir+"/gate/output","utf8")===""'
      : > "$GATE/release"
      wait "$HOLDER"
      EXPECTED=13
    else
      EXPECTED=12
    fi
    for PID in "${PIDS[@]}"; do wait "$PID"; done
    kitchen_assert "kitchen $LOCK_CASE contention preserves every completed rotation row" "rows.length+old.length===$EXPECTED && new Set([...rows,...old].map(r=>r.sid)).size===$EXPECTED"
    kitchen_assert "kitchen $LOCK_CASE contention cleans lock ownership" 'fs.readdirSync(require("path").dirname(log)).sort().join(",")==="activity.1.jsonl,activity.jsonl" && fs.readFileSync(dir+"/gate/output","utf8")===""'
    rm -rf "$FIX"
  done

  # Signal after ln publishes ownership but before it returns to the hook shell.
  FIX=$(mk_fixture)
  LOG="$FIX/.claude/.bytheslice-state/kitchen/activity.jsonl"
  GATE="$FIX/gate"
  mkdir -p "$GATE/bin"
  KITCHEN_REAL_LN=$(command -v ln)
  cat > "$GATE/bin/ln" <<'EOF'
# hooks/test.sh fixture/ln
# Pause successful lock publication before the logger resumes its shell code.
"$KITCHEN_TEST_LN" "$@" || exit "$?"
: > "$KITCHEN_TEST_GATE/ready"
while [ ! -f "$KITCHEN_TEST_GATE/release" ]; do sleep 0.02; done
EOF
  chmod +x "$GATE/bin/ln"
  KITCHEN_TEST_GATE="$GATE" KITCHEN_TEST_LN="$KITCHEN_REAL_LN" PATH="$GATE/bin:$PATH" CLAUDE_PROJECT_DIR="$FIX" \
    "$KITCHEN_BASH" "$KITCHEN_LOG" <<< '{"hook_event_name":"Stop","session_id":"interrupted"}' > "$GATE/output" 2>&1 &
  HOLDER=$!
  for N in {1..200}; do
    [ ! -f "$GATE/ready" ] || break
    sleep 0.02
  done
  kitchen_assert "kitchen acquisition window publishes initialized ownership" 'fs.existsSync(dir+"/gate/ready") && fs.existsSync(require("path").dirname(log)+"/.activity.lock")'
  kill -TERM "$HOLDER" 2>/dev/null || true
  : > "$GATE/release"
  { wait "$HOLDER"; LAST_EXIT=$?; } 2>/dev/null
  assert_exit "kitchen interrupted acquisition exits 0" 0
  kitchen_assert "kitchen interrupted acquisition removes exact ownership" '!fs.existsSync(log) && fs.readdirSync(require("path").dirname(log)).length===0 && fs.readFileSync(dir+"/gate/output","utf8")===""'
  CLAUDE_PROJECT_DIR="$FIX" run_hook "$KITCHEN_LOG" '{"hook_event_name":"Stop","session_id":"after-interruption"}'
  kitchen_assert "kitchen interrupted acquisition permits subsequent writer" 'rows.length===1 && rows[0].sid==="after-interruption" && fs.readdirSync(require("path").dirname(log)).join(",")==="activity.jsonl"'
  rm -rf "$FIX"

  # Validate the actual hook registration surface, including duplicate entries.
  FIX=$(mk_fixture)
  KITCHEN_WIRING=$("$KITCHEN_NODE" -e '
    const fs=require("fs"), hooks=JSON.parse(fs.readFileSync(process.argv[1],"utf8")).hooks;
    const actual=[];
    for(const [ev, groups] of Object.entries(hooks)) for(const group of groups)
      for(const hook of group.hooks) if(hook.command.includes("/hooks/kitchen-log.sh")) {
        if(hook.async !== undefined && hook.async !== false) process.exit(1);
        actual.push(ev + ":" + (group.matcher || ""));
      }
    const expected=["SessionStart:","SubagentStart:","SubagentStop:","PreToolUse:Agent","PostToolUse:Agent","PreToolUse:Skill","UserPromptExpansion:","Stop:"];
    if(JSON.stringify(actual.sort()) !== JSON.stringify(expected.sort())) process.exit(1);
    process.stdout.write("registered");
  ' "$HERE/hooks.json")
  LAST_EXIT=$?
  assert_exit "kitchen exactly eight synchronous hook registrations" 0
  LAST_OUT=$("$KITCHEN_NODE" -e '
    const fs=require("fs"),cp=require("child_process"),path=require("path");
    const hooks=JSON.parse(fs.readFileSync(process.argv[1],"utf8")).hooks;
    const stop=hooks.Stop.flatMap(g=>g.hooks).find(h=>h.command.includes("/hooks/kitchen-log.sh"));
    const result=cp.spawnSync(process.argv[3],["-c",stop.command],{
      env:{...process.env,CLAUDE_PROJECT_DIR:process.argv[2],CLAUDE_PLUGIN_ROOT:path.dirname(path.dirname(process.argv[1]))},
      input:JSON.stringify({hook_event_name:"Stop",session_id:"synchronous-stop"}),encoding:"utf8"
    });
    if(result.status!==0 || result.stdout!=="" || result.stderr!=="") process.exit(1);
    const log=path.join(process.argv[2],".claude/.bytheslice-state/kitchen/activity.jsonl");
    const rows=fs.readFileSync(log,"utf8").trim().split("\n").map(JSON.parse);
    if(rows.length!==1 || rows[0].ev!=="Stop" || rows[0].sid!=="synchronous-stop") process.exit(1);
  ' "$HERE/hooks.json" "$FIX" "$KITCHEN_BASH" 2>&1)
  LAST_EXIT=$?
  assert_exit "kitchen registered Stop row exists before command returns" 0
  assert_empty "kitchen registered synchronous Stop stays silent"
  rm -rf "$FIX"
fi

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
