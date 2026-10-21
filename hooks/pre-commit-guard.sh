#!/usr/bin/env bash
# hooks/pre-commit-guard.sh
# PreToolUse hook on Bash. Warns (never blocks) on `git commit` on main/master
# or on a branch it cannot tell; otherwise a one-line staged-files summary.
#
# The branch is read from the repository the commit actually runs in (a parsed
# `cd <dir>` or `git -C <dir>`, else the hook cwd), never from
# CLAUDE_PROJECT_DIR, so a commit inside a worktree or a scratch repo is judged
# by that repo's branch. Shell forms it cannot follow (subshell `cd`, `popd`,
# `$VAR` paths, a branch switch earlier in the command, a directory that is not
# a git repo yet) warn "branch unknown" instead of guessing.
#
# Hook contract: reads JSON from stdin with .tool_input.command and .cwd.
# Always exit 0. A warning is printed as Claude Code hook JSON: the
# additionalContext reaches the model, the systemMessage reaches the person.

set -u

[ "${BTS_HOOKS_DISABLED:-0}" = "1" ] && exit 0

SELF_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=./lib/checklist.sh
. "$SELF_DIR/lib/checklist.sh"

INPUT="$(cat 2>/dev/null || true)"
CMD=""
HOOK_CWD=""
if command -v jq >/dev/null 2>&1; then
  CMD=$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null)
  HOOK_CWD=$(printf '%s' "$INPUT" | jq -r '.cwd // empty' 2>/dev/null)
fi
# jq-less fallback. Reads JSON string values with their escapes intact, so
# `git -C \"<dir>\" commit` is not truncated at the first quote, then decodes
# the escapes a shell command carries (\\, \", \n, \t).
json_unescape() {
  local s="$1"
  s=${s//\\\\/$'\001'}
  s=${s//\\\"/\"}
  s=${s//\\n/$'\n'}
  s=${s//\\t/$'\t'}
  printf '%s' "${s//$'\001'/\\}"
}
if [ -z "$CMD" ]; then
  CMD=$(json_unescape "$(printf '%s' "$INPUT" | sed -nE 's/.*"command"[[:space:]]*:[[:space:]]*"(([^"\\]|\\.)*)".*/\1/p')")
fi
if [ -z "$HOOK_CWD" ]; then
  HOOK_CWD=$(json_unescape "$(printf '%s' "$INPUT" | sed -nE 's/.*"cwd"[[:space:]]*:[[:space:]]*"(([^"\\]|\\.)*)".*/\1/p')")
fi

# Encode a string for a JSON string literal (no jq needed).
json_str() {
  local s="$1"
  s=${s//\\/\\\\}
  s=${s//\"/\\\"}
  s=${s//$'\t'/\\t}
  s=${s//$'\r'/}
  s=${s//$'\n'/\\n}
  printf '%s' "$s" | tr -d '\000-\010\013\014\016-\037'
}

# Only act on `git commit` invocations (including `git -C <dir> commit`).
# Anything else passes silently. Every commit in the command is checked, and
# the first known directory is the one the staged summary reads.
COMMIT_DIRS=$(bts_commit_dirs "$CMD" "$HOOK_CWD") || exit 0

COMMIT_DIR=""
ON_MAIN=""
UNKNOWN=0
while IFS= read -r d; do
  [ -n "$d" ] || continue
  if [ "$d" = "?" ]; then
    UNKNOWN=1
    continue
  fi
  [ -n "$COMMIT_DIR" ] || COMMIT_DIR=$d
  if [ "$(bts_branch_class "$d")" = "main" ]; then
    ON_MAIN="$ON_MAIN$(bts_branch "$d") ($d), "
  fi
done <<EOF
$COMMIT_DIRS
EOF

STAGED=""
[ -n "$COMMIT_DIR" ] && STAGED=$(git -C "$COMMIT_DIR" diff --cached --name-only 2>/dev/null | head -10)

WARN=""
if [ -n "$ON_MAIN" ]; then
  WARN="WARN [bytheslice] git commit on ${ON_MAIN%, }. ByTheSlice commits on a pie or feature branch; check this is intended. The commit was not stopped."
fi
if [ "$UNKNOWN" = 1 ]; then
  [ -n "$WARN" ] && WARN="$WARN
"
  WARN="${WARN}WARN [bytheslice] git commit on a branch unknown: the guard cannot follow this command to its repository (a \$VAR or \$(...) path, a subshell cd, popd, an earlier branch switch, or no git repo yet). The commit was not stopped."
fi

if [ -n "$WARN" ]; then
  if [ -n "$STAGED" ]; then
    WARN="$WARN
staged files on branch $(bts_branch "$COMMIT_DIR"):
$(printf '%s\n' "$STAGED" | sed 's/^/  /')"
  fi
  TEXT=$(json_str "$WARN")
  printf '{"systemMessage":"%s","hookSpecificOutput":{"hookEventName":"PreToolUse","additionalContext":"%s"}}\n' "$TEXT" "$TEXT"
  exit 0
fi

if [ -n "$STAGED" ]; then
  printf '[bytheslice pre-commit] staged files on branch %s:\n' "$(bts_branch "$COMMIT_DIR")"
  printf '%s\n' "$STAGED" | sed 's/^/  /'
fi

exit 0
