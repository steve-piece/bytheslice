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
SHOP_STATUS="$HERE/shop-status.sh"
COMMIT_GUARD="$HERE/pre-commit-guard.sh"
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

####################################################################
# pre-commit-guard.sh
####################################################################

echo
echo "## pre-commit-guard.sh"

# Assert the guard warned: exit 0, a WARN line, and Claude Code hook JSON
# whose additionalContext (model) and systemMessage (person) carry the text.
# Args: name, needle the warning must contain.
assert_warn() {
  local name="$1" needle="$2"
  assert_exit "$name exits 0" 0
  assert_contains "$name warns" "WARN [bytheslice]"
  assert_contains "$name names" "$needle"
  if printf '%s' "$LAST_OUT" | "$JSON_NODE" -e '
    let s = ""; process.stdin.on("data", d => s += d).on("end", () => {
      const o = JSON.parse(s), h = o.hookSpecificOutput || {}
      process.exit(h.hookEventName === "PreToolUse" && /^WARN /.test(h.additionalContext) && o.systemMessage === h.additionalContext ? 0 : 1)
    })' 2>/dev/null; then
    PASS=$((PASS+1)); printf '  ✓ %s is hook JSON for the model and the person\n' "$name"
  else
    FAIL=$((FAIL+1)); FAILED_NAMES+=("$name (not hook JSON)"); printf '  ✗ %s is not hook JSON: %s\n' "$name" "$LAST_OUT"
  fi
}
JSON_NODE=$(command -v node || printf 'node')

# git commit on main → WARN naming main, exit 0, staged files listed
FIX=$(mk_fixture)
echo x > "$FIX/a.txt" && git -C "$FIX" add a.txt
CLAUDE_PROJECT_DIR=$FIX run_hook_in "$FIX" "$COMMIT_GUARD" '{"tool_input":{"command":"git commit -m test"}}'
assert_warn "commit on main" "git commit on main"
assert_contains "commit on main keeps the staged summary" "a.txt"
rm -rf "$FIX"

# git commit on master → WARN naming master
FIX=$(mk_fixture)
git -C "$FIX" branch -q -m master
CLAUDE_PROJECT_DIR=$FIX run_hook_in "$FIX" "$COMMIT_GUARD" '{"tool_input":{"command":"git commit -m test"}}'
assert_warn "commit on master" "git commit on master"
rm -rf "$FIX"

# git commit on feature branch → NOTE: staged file list, no warning
FIX=$(mk_fixture)
git -C "$FIX" checkout -q -b feat/x
echo x > "$FIX/a.txt" && git -C "$FIX" add a.txt
CLAUDE_PROJECT_DIR=$FIX run_hook_in "$FIX" "$COMMIT_GUARD" '{"tool_input":{"command":"git commit -m test"}}'
assert_exit "commit on feature branch" 0
assert_contains "commit on feature branch staged summary" "staged files on branch feat/x"
assert_not_contains "commit on feature branch no warning" "WARN"
rm -rf "$FIX"

# hook cwd outside any repo → branch unknown; the project dir's main is never
# named (the 5.3 false positive read CLAUDE_PROJECT_DIR here)
FIX=$(mk_fixture)
NOREPO=$(mktemp -d)
CLAUDE_PROJECT_DIR=$FIX run_hook_in "$NOREPO" "$COMMIT_GUARD" '{"tool_input":{"command":"git commit -m test"}}'
assert_warn "commit outside any repo" "branch unknown"
assert_not_contains "commit outside any repo never names the project dir" "on main"
rm -rf "$FIX" "$NOREPO"

# scratch repo created in the same command, project dir on main → branch
# unknown, not main (the false positive the operator reported in 5.3)
FIX=$(mk_fixture)
SCRATCH=$(mktemp -d)
run_guard "$FIX" "$FIX" "S=$SCRATCH/new; mkdir -p \$S && cd \$S && git init -q && git commit -m x"
assert_warn "scratch repo via \$VAR" "branch unknown"
assert_not_contains "scratch repo via \$VAR never names the primary" "on main"
run_guard "$FIX" "$FIX" "mkdir -p $SCRATCH/lit && cd $SCRATCH/new2 && git init -q && git commit -m x"
assert_warn "scratch repo path that does not exist yet" "branch unknown"
rm -rf "$FIX" "$SCRATCH"

# a branch switch earlier in the command moves HEAD → branch unknown
FIX=$(mk_fixture)
run_guard "$FIX" "$FIX" "git switch -c feat/y && git commit -m x"
assert_warn "switch before commit" "branch unknown"
run_guard "$FIX" "$FIX" "git checkout -q feat/y && git commit -m x"
assert_warn "checkout before commit" "branch unknown"
rm -rf "$FIX"

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
assert_empty "commit-tree silent"
CLAUDE_PROJECT_DIR=$FIX run_hook_in "$FIX" "$COMMIT_GUARD" "{\"tool_input\":{\"command\":\"git -C $FIX status\"}}"
assert_exit "git -C status is not a commit" 0
assert_empty "git -C status silent"
rm -rf "$FIX"

# BTS_HOOKS_DISABLED → PASS
FIX=$(mk_fixture)
BTS_HOOKS_DISABLED=1 CLAUDE_PROJECT_DIR=$FIX run_hook_in "$FIX" "$COMMIT_GUARD" '{"tool_input":{"command":"git commit -m test"}}'
assert_exit "commit-guard disabled" 0
assert_empty "commit-guard disabled silent"
rm -rf "$FIX"

# Worktree regression (2026-10-05): CLAUDE_PROJECT_DIR is the primary checkout
# on main, but the commit runs inside a linked worktree on a feature branch.
# The guard must read the worktree's HEAD, not the primary's.
FIX=$(mk_worktree_fixture)
WT="$FIX/.claude/worktrees/wt"
WTS="$FIX/.claude/worktrees/wt space"

# Each worktree form: exit 0 and no warning.
assert_no_warn() {
  assert_exit "$1" 0
  assert_not_contains "$1 no warning" "WARN"
}

CLAUDE_PROJECT_DIR=$FIX run_hook_in "$FIX" "$COMMIT_GUARD" "{\"tool_input\":{\"command\":\"git -C $WT commit -m test\"},\"cwd\":\"$FIX\"}"
assert_no_warn "worktree: git -C <wt> commit"
CLAUDE_PROJECT_DIR=$FIX run_hook_in "$FIX" "$COMMIT_GUARD" "{\"tool_input\":{\"command\":\"cd $WT && git add -A && git commit -m test\"},\"cwd\":\"$FIX\"}"
assert_no_warn "worktree: cd <wt> && git commit"
CLAUDE_PROJECT_DIR=$FIX run_hook_in "$FIX" "$COMMIT_GUARD" "{\"tool_input\":{\"command\":\"cd .claude/worktrees/wt; git commit -m test\"},\"cwd\":\"$FIX\"}"
assert_no_warn "worktree: relative cd"
CLAUDE_PROJECT_DIR=$FIX run_hook_in "$FIX" "$COMMIT_GUARD" "{\"tool_input\":{\"command\":\"cd \\\"$WTS\\\" && git commit -m test\"},\"cwd\":\"$FIX\"}"
assert_no_warn "worktree: quoted cd with space"
CLAUDE_PROJECT_DIR=$FIX run_hook_in "$FIX" "$COMMIT_GUARD" "{\"tool_input\":{\"command\":\"git -C '$WTS' commit -m test\"},\"cwd\":\"$FIX\"}"
assert_no_warn "worktree: single-quoted git -C with space"
HOME=$FIX CLAUDE_PROJECT_DIR=$FIX run_hook_in "$FIX" "$COMMIT_GUARD" "{\"tool_input\":{\"command\":\"cd ~/.claude/worktrees/wt && git commit -m test\"},\"cwd\":\"$FIX\"}"
assert_no_warn "worktree: tilde cd"
CLAUDE_PROJECT_DIR=$FIX run_hook_in "$WT" "$COMMIT_GUARD" '{"tool_input":{"command":"git commit -m test"}}'
assert_no_warn "worktree: hook process cwd in wt"
CLAUDE_PROJECT_DIR=$FIX run_hook_in "$FIX" "$COMMIT_GUARD" "{\"tool_input\":{\"command\":\"git commit -m test\"},\"cwd\":\"$WT\"}"
assert_no_warn "worktree: input cwd in wt"

# Still warns on real main commits: from inside the worktree, target the primary
CLAUDE_PROJECT_DIR=$WT run_hook_in "$WT" "$COMMIT_GUARD" "{\"tool_input\":{\"command\":\"git -C $FIX commit -m test\"},\"cwd\":\"$WT\"}"
assert_warn "worktree: git -C <primary on main> commit" "git commit on main"
CLAUDE_PROJECT_DIR=$WT run_hook_in "$WT" "$COMMIT_GUARD" "{\"tool_input\":{\"command\":\"cd $FIX && git commit -m test\"},\"cwd\":\"$WT\"}"
assert_warn "worktree: cd <primary on main> && git commit" "git commit on main"
CLAUDE_PROJECT_DIR=$FIX run_hook_in "$FIX" "$COMMIT_GUARD" "{\"tool_input\":{\"command\":\"git commit -m test\"},\"cwd\":\"$FIX\"}"
assert_warn "worktree: plain commit in primary on main" "git commit on main"

# jq-less fallback parses escaped quotes and cwd the same way
mkdir -p "$FIX/nojq-bin"
for b in bash git sed cat head dirname mktemp pwd printf tr; do
  p=$(command -v "$b") && ln -sf "$p" "$FIX/nojq-bin/$b"
done
LAST_OUT=$(cd "$FIX" && printf '%s' "{\"tool_input\":{\"command\":\"cd \\\"$WTS\\\" && git commit -m test\"},\"cwd\":\"$FIX\"}" \
  | PATH="$FIX/nojq-bin" CLAUDE_PROJECT_DIR=$FIX "$FIX/nojq-bin/bash" "$COMMIT_GUARD" 2>&1)
LAST_EXIT=$?
assert_no_warn "worktree: jq-less quoted cd"
LAST_OUT=$(cd "$FIX" && printf '%s' "{\"tool_input\":{\"command\":\"git commit -m \\\"msg\\\"\"},\"cwd\":\"$FIX\"}" \
  | PATH="$FIX/nojq-bin" CLAUDE_PROJECT_DIR=$FIX "$FIX/nojq-bin/bash" "$COMMIT_GUARD" 2>&1)
LAST_EXIT=$?
assert_warn "worktree: jq-less commit on main" "git commit on main"
LAST_OUT=$(cd "$WT" && printf '%s' "{\"tool_input\":{\"command\":\"git -C ../wt\\\\ space/../../.. commit -m x\"},\"cwd\":\"$WT\"}" \
  | PATH="$FIX/nojq-bin" CLAUDE_PROJECT_DIR=$WT "$FIX/nojq-bin/bash" "$COMMIT_GUARD" 2>&1)
LAST_EXIT=$?
assert_warn "worktree: jq-less backslash-escaped -C path to main" "git commit on main"

# Shell forms that must not let a main commit pass unwarned. Each one fooled
# the first cut of the resolver, which modeled only the first commit in the
# command and only a plain `cd <dir>` sequence before it.
run_guard "$FIX" "$FIX" "git -C $WT commit -m a && git -C $FIX commit -m b"
assert_warn "worktree: second commit on main" "git commit on main"
run_guard "$FIX" "$FIX" "cd $WT && git commit -m a && cd $FIX && git commit -m b"
assert_warn "worktree: cd back to main for a second commit" "git commit on main"
run_guard "$FIX" "$FIX" "cd $WT && cd - && git commit -m x"
assert_warn "worktree: cd - back to main" "git commit on main"
run_guard "$WT" "$WT" "pushd $FIX && git commit -m x"
assert_warn "worktree: pushd to main" "git commit on main"
run_guard "$WT" "$WT" "cd -P $FIX && git commit -m x"
assert_warn "worktree: cd -P to main" "git commit on main"
run_guard "$WT" "$WT" "git --git-dir=$FIX/.git --work-tree=$FIX commit -m x"
assert_warn "worktree: --git-dir=<main>" "git commit on main"
run_guard "$WT" "$WT" "git --git-dir $FIX/.git --work-tree $FIX commit -m x"
assert_warn "worktree: --git-dir <main> (space form)" "git commit on main"
run_guard "$WT" "$WT" "GIT_DIR=$FIX/.git git commit -m x"
assert_warn "worktree: GIT_DIR=<main>" "git commit on main"
run_guard "$FIX" "$FIX" "/usr/bin/git commit -m x"
assert_warn "worktree: path-qualified git on main" "git commit on main"
run_guard "$FIX" "$FIX" "echo \`git commit -m x\`"
assert_warn "worktree: backtick commit on main" "git commit on main"
run_guard "$WT" "$WT" "bash -c 'cd $FIX && git commit -m x'"
assert_warn "worktree: bash -c cd to main" "git commit on main"
run_guard "$WT" "$WT" "git -C ../wt\\ space/../../.. commit -m x"
assert_warn "worktree: backslash-escaped -C path to main" "git commit on main"

# Forms the guard cannot follow warn "branch unknown" (formerly fail-closed
# blocks), and never name a directory the commit does not run in.
run_guard "$FIX" "$FIX" "(cd $WT && make) && git commit -m x"
assert_warn "worktree: subshell cd is not followed" "branch unknown"
run_guard "$WT" "$FIX" "cd \"\$MAIN\" && git commit -m x"
assert_warn "worktree: unresolvable cd" "branch unknown"
assert_not_contains "worktree: unresolvable cd never names the project dir" "on main"
run_guard "$WT" "$WT" "git -C \"\$(git rev-parse --show-toplevel)\" commit -m x"
assert_warn "worktree: \$(...) -C path" "branch unknown"
run_guard "$WT" "$WT" "pushd $FIX && popd && git commit -m x"
assert_warn "worktree: popd" "branch unknown"

# ...without warning on the ordinary worktree forms next to them
run_guard "$FIX" "$FIX" "pushd $WT && git commit -m x"
assert_no_warn "worktree: pushd to wt"
run_guard "$FIX" "$FIX" "cd .claude/worktrees/wt\\ space && git commit -m x"
assert_no_warn "worktree: backslash-escaped cd to wt"
run_guard "$FIX" "$FIX" "git --git-dir=$FIX/.git/worktrees/wt --work-tree=$WT commit -m x"
assert_no_warn "worktree: --git-dir=<wt gitdir>"
run_guard "$FIX" "$FIX" "(cd $WT && git commit -m x)"
assert_no_warn "worktree: commit inside a subshell cd"
run_guard "$FIX" "$FIX" "cd $WT && git commit -m \"\$(printf 'a\\nb')\" && git log -1"
assert_no_warn "worktree: \$(...) message after the commit"
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
# After compaction (or a resume) the same summary is injected: the hook has no
# source matcher, and this is how a compacted session re-orients.
for SRC in compact resume; do
  CLAUDE_PROJECT_DIR=$FIX run_hook "$SHOP_STATUS" "{\"hook_event_name\":\"SessionStart\",\"source\":\"$SRC\"}"
  assert_exit "shop-status $SRC exit 0" 0
  assert_contains "shop-status $SRC re-injects the summary" "next open pie: Pie 3 - Publish Flow"
done
rm -rf "$FIX"

# A pie's **User flow:** block (numbered "N. <step> - Slice N.M" items) must
# not change bts_slice_counts, which counts `### Slice N.M` headings only.
FIX=$(mk_fixture)
mkdir -p "$FIX/docs/plans"
cat > "$FIX/docs/plans/00_master_checklist.md" <<'EOF'
# Master

## Pie 2: Blog Editor    <!-- review: boundary -->
**Pie scope:** write and publish a post | **MVP:** Yes | **Depends on:** Pie 1
**User flow:**
1. Open the editor and start a draft - Slice 2.1
2. Save the draft and see it in the list - Slice 2.2
3. Publish the post and open it at its public URL - Slice 2.3

### Slice 2.1: Editor shell [x]

### Slice 2.2: Server actions

### Slice 2.3: Publish button
EOF
HEADINGS=$(grep -cE '^### +Slice[[:space:]]+[0-9]+\.[0-9]' "$FIX/docs/plans/00_master_checklist.md")
LAST_OUT=$(CLAUDE_PROJECT_DIR=$FIX bash -c '. "$1/lib/checklist.sh"; bts_slice_counts' _ "$HERE")
if [ "$HEADINGS" = 3 ] && [ "$LAST_OUT" = "1 $HEADINGS" ]; then
  PASS=$((PASS+1)); printf '  ✓ user-flow items are not counted as slices (%s, %s headings)\n' "$LAST_OUT" "$HEADINGS"
else
  FAIL=$((FAIL+1)); FAILED_NAMES+=("user-flow items are not counted as slices (got: $LAST_OUT, headings: $HEADINGS)")
  printf '  ✗ user-flow items are not counted as slices (got: %s, want: 1 %s)\n' "$LAST_OUT" "$HEADINGS"
fi
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
  for utility in bash cat dirname git awk mkdir wc tr mv rmdir sleep mktemp ln readlink rm sed grep head date; do
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

    # Session inheritance: an unlabeled row takes the attribution of its own
    # session's latest labeled dispatch before the branch (pie-4 here) and the
    # checklist. The live defect: a labeled P5 S5.1 dispatch whose own
    # SubagentStart was tagged with the hook cwd's pie 4.
    ARCHIVE="$FIX/.claude/.bytheslice-state/kitchen/activity.1.jsonl"
    git -C "$FIX" checkout -q -b pie-4-inherit
    rm -f "$LOG" "$ARCHIVE"
    kitchen_event() { PATH="$KITCHEN_PATH" CLAUDE_PROJECT_DIR="$FIX" run_hook "$KITCHEN_LOG" "$1"; }
    kitchen_event '{"session_id":"inherit-a","hook_event_name":"PreToolUse","tool_name":"Agent","tool_input":{"description":"P5 S5.1 prep: recon","subagent_type":"bytheslice:discovery"}}'
    kitchen_event '{"session_id":"inherit-a","hook_event_name":"SubagentStart","agent_type":"bytheslice:discovery","agent_id":"agent-d"}'
    kitchen_assert "kitchen $ENGINE SubagentStart inherits its session's labeled dispatch over the branch" 'rows.length === 2 && rows[1].ev === "SubagentStart" && rows[1].pie === 5 && rows[1].slice === "5.1" && !("label" in rows[1])'
    kitchen_event '{"session_id":"inherit-b","hook_event_name":"SubagentStart","agent_type":"bytheslice:discovery","agent_id":"agent-e"}'
    kitchen_assert "kitchen $ENGINE another session's label is never inherited" 'rows[2].sid === "inherit-b" && rows[2].pie === 4 && rows[2].slice === "4.2"'
    kitchen_event '{"session_id":"inherit-a","hook_event_name":"PostToolUse","tool_name":"Agent","tool_input":{"description":"P6 S6.2 build: feed","subagent_type":"bytheslice:implementer"},"tool_response":{"agentId":"agent-bg","status":"async_launched"}}'
    kitchen_event '{"session_id":"inherit-a","hook_event_name":"PreToolUse","tool_name":"Agent","tool_input":{"description":"P5 S5.3 test: probe","subagent_type":"bytheslice:slice-tester"}}'
    kitchen_event '{"session_id":"inherit-a","hook_event_name":"SubagentStop","agent_type":"bytheslice:discovery","agent_id":"agent-bg"}'
    kitchen_assert "kitchen $ENGINE SubagentStop prefers the labeled row with its own agent id" 'rows.at(-1).ev === "SubagentStop" && rows.at(-1).pie === 6 && rows.at(-1).slice === "6.2"'
    kitchen_event '{"session_id":"inherit-a","hook_event_name":"SubagentStart","agent_type":"bytheslice:implementer","agent_id":"agent-f"}'
    kitchen_assert "kitchen $ENGINE SubagentStart prefers the latest labeled row of its agent type" 'rows.at(-1).aid === "agent-f" && rows.at(-1).pie === 6 && rows.at(-1).slice === "6.2"'
    printf '%s\n' '{"t":1,"sid":"inherit-a","ev":"PreToolUse","label":"P9 S9.9 torn' >> "$LOG"
    kitchen_event '{"session_id":"inherit-a","hook_event_name":"Stop"}'
    assert_exit "kitchen $ENGINE inheritance past a torn line exits 0" 0
    assert_empty "kitchen $ENGINE inheritance past a torn line silent"
    grep -v '"label":"P9 S9.9 torn' "$LOG" > "$LOG.kept" && mv "$LOG.kept" "$LOG"
    kitchen_assert "kitchen $ENGINE Stop inherits the latest labeled row and skips a torn line" 'rows.at(-1).ev === "Stop" && rows.at(-1).pie === 5 && rows.at(-1).slice === "5.3"'
    mv "$LOG" "$ARCHIVE"
    kitchen_event '{"session_id":"inherit-a","hook_event_name":"SubagentStart","agent_type":"bytheslice:slice-tester","agent_id":"agent-t"}'
    kitchen_assert "kitchen $ENGINE inheritance reads the rotated log too" 'rows.length === 1 && rows[0].pie === 5 && rows[0].slice === "5.3"'
    rm -f "$LOG" "$ARCHIVE"
    kitchen_event '{"session_id":"inherit-a","hook_event_name":"PreToolUse","tool_name":"Agent","tool_input":{"description":"P7 S7.1 build: x","subagent_type":"bytheslice:implementer"}}'
    kitchen_event '{"session_id":"inherit-a","hook_event_name":"PreToolUse","tool_name":"Agent","tool_input":{"description":"P8 S8.2 build: y","subagent_type":"bytheslice:implementer"}}'
    kitchen_assert "kitchen $ENGINE a labeled row keeps its own label over the session's" 'rows.length === 2 && rows[1].pie === 8 && rows[1].slice === "8.2"'
    git -C "$FIX" checkout -q main
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
# hooks.json wiring
####################################################################

echo
echo "## hooks.json wiring"

# Every command path in hooks.json names a script that exists, and no wired
# script can block a tool call: no `exit 2`, no block or deny decision.
WIRED=$(sed -nE 's#.*\$\{CLAUDE_PLUGIN_ROOT\}/hooks/([^"\\]+)\\?".*#\1#p' "$HERE/hooks.json" | sort -u)
COMMANDS=$(grep -cE '"command"[[:space:]]*:' "$HERE/hooks.json")
REFS=$(grep -c 'CLAUDE_PLUGIN_ROOT}/hooks/' "$HERE/hooks.json")
if [ -n "$WIRED" ] && [ "$COMMANDS" = "$REFS" ]; then
  PASS=$((PASS+1)); printf '  ✓ every hooks.json command runs a script under hooks/ (%s commands)\n' "$COMMANDS"
else
  FAIL=$((FAIL+1)); FAILED_NAMES+=("hooks.json command outside hooks/"); printf '  ✗ %s commands, %s under hooks/\n' "$COMMANDS" "$REFS"
fi
while IFS= read -r script; do
  [ -n "$script" ] || continue
  if [ -f "$HERE/$script" ]; then
    PASS=$((PASS+1)); printf '  ✓ wired script exists: %s\n' "$script"
  else
    FAIL=$((FAIL+1)); FAILED_NAMES+=("wired script missing: $script"); printf '  ✗ wired script missing: %s\n' "$script"
  fi
  if grep -nE '(^|[^[:alnum:]_])exit[[:space:]]+2([^[:digit:]]|$)|"decision"[[:space:]]*:[[:space:]]*\\?"block|"permissionDecision"[[:space:]]*:[[:space:]]*\\?"deny' "$HERE/$script" >/dev/null 2>&1; then
    FAIL=$((FAIL+1)); FAILED_NAMES+=("wired script can block: $script"); printf '  ✗ wired script can block: %s\n' "$script"
  else
    PASS=$((PASS+1)); printf '  ✓ wired script never blocks: %s\n' "$script"
  fi
done <<EOF
$WIRED
EOF
# The shared helpers are sourced by every wired script, so they count too.
if grep -nE '(^|[^[:alnum:]_])exit[[:space:]]+2([^[:digit:]]|$)' "$HERE/lib/checklist.sh" >/dev/null 2>&1; then
  FAIL=$((FAIL+1)); FAILED_NAMES+=("lib/checklist.sh can block"); printf '  ✗ lib/checklist.sh can block\n'
else
  PASS=$((PASS+1)); printf '  ✓ sourced lib/checklist.sh never blocks\n'
fi

echo
echo "## Cursor hooks (hooks-cursor.json)"

# Cursor loads its own file: version 1, camelCase events, flat entries, and
# ${CURSOR_PLUGIN_ROOT}, never ${CLAUDE_PLUGIN_ROOT} (which Cursor leaves empty).
cursor_ok() { PASS=$((PASS+1)); printf '  ✓ %s\n' "$1"; }
cursor_no() { FAIL=$((FAIL+1)); FAILED_NAMES+=("$1"); printf '  ✗ %s\n' "$1"; }
CURSOR_HOOKS="$HERE/hooks-cursor.json"
if python3 - "$CURSOR_HOOKS" "$HERE" <<'PY' >/dev/null 2>&1
import json, os, re, sys
d = json.load(open(sys.argv[1]))
assert d["version"] == 1
for event, entries in d["hooks"].items():
    assert re.match(r"^[a-z]", event), event
    for e in entries:
        assert "hooks" not in e and "${CLAUDE_PLUGIN_ROOT}" not in e["command"]
        script = re.search(r"\$\{CURSOR_PLUGIN_ROOT\}/hooks/([^\"]+)", e["command"]).group(1)
        assert os.path.isfile(os.path.join(sys.argv[2], script)), script
PY
then cursor_ok "hooks-cursor.json is Cursor shaped and every script exists"; else cursor_no "hooks-cursor.json shape"; fi
if grep -q '"hooks": "./hooks/hooks-cursor.json"' "$HERE/../.cursor-plugin/plugin.json"; then cursor_ok ".cursor-plugin/plugin.json points at hooks-cursor.json"; else cursor_no ".cursor-plugin/plugin.json hooks key"; fi

# Cursor blocks a shell command whose hook prints no JSON or JSON off schema,
# so every Cursor guard run must print a valid allow.
cursor_allow() { # name, stdin, extra env assignment (may be empty), expect-substring
  local out
  out=$(cd "$FIX" && printf '%s' "$2" | env BTS_HOST=cursor $3 bash "$COMMIT_GUARD" 2>/dev/null)
  if printf '%s' "$out" | python3 -c 'import json,sys; d=json.load(sys.stdin); assert d["permission"]=="allow"' 2>/dev/null \
    && { [ -z "$4" ] || printf '%s' "$out" | grep -q "$4"; }; then cursor_ok "$1"; else cursor_no "$1 ($out)"; fi
}
FIX=$(mk_fixture)
cursor_allow "cursor guard: commit on main allows and warns" "{\"command\":\"git commit -m x\",\"cwd\":\"$FIX\"}" "" "git commit on main"
cursor_allow "cursor guard: non-commit allows" "{\"command\":\"ls\",\"cwd\":\"$FIX\"}" "" ""
cursor_allow "cursor guard: disabled still allows" "{\"command\":\"git commit -m x\"}" "BTS_HOOKS_DISABLED=1" ""
cursor_allow "cursor guard: unreadable input still allows" "not json" "" ""

OUT=$(cd "$FIX" && env -u CLAUDE_PROJECT_DIR BTS_HOST=cursor bash "$SHOP_STATUS" </dev/null 2>/dev/null)
if [ "$OUT" = "{}" ]; then cursor_ok "cursor shop-status: no checklist prints {}"; else cursor_no "cursor shop-status no checklist ($OUT)"; fi
mkdir -p "$FIX/docs/plans"; printf '## Pie 1: A\n### Slice 1.1: B\n- [ ] x\n' > "$FIX/docs/plans/00_master_checklist.md"
OUT=$(cd "$FIX" && env -u CLAUDE_PROJECT_DIR BTS_HOST=cursor bash "$SHOP_STATUS" </dev/null 2>/dev/null)
if printf '%s' "$OUT" | python3 -c 'import json,sys; assert "bytheslice shop status" in json.load(sys.stdin)["additional_context"]' 2>/dev/null; then
  cursor_ok "cursor shop-status: additional_context carries the header"; else cursor_no "cursor shop-status header ($OUT)"; fi
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
