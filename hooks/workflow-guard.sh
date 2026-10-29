#!/usr/bin/env bash
# hooks/workflow-guard.sh
# Runs hooks/workflow-guard.js, the one ByTheSlice hook that refuses a tool
# call (PreToolUse Write|Edit|MultiEdit, Agent, Bash; Cursor's
# beforeShellExecution) and adds the feature intake context (UserPromptSubmit).
# See the header of workflow-guard.js for the rules.
#
# Without Node the guard cannot judge, so it lets every call through; on
# Cursor it still answers {"permission":"allow"}, since Cursor blocks a command
# whose hook prints no JSON.

set -u

allow_cursor() { [ "${BTS_HOST:-}" = "cursor" ] && printf '{"permission":"allow"}\n'; exit 0; }

[ "${BTS_HOOKS_DISABLED:-0}" = "1" ] && allow_cursor

SELF_DIR="$(cd "$(dirname "$0")" && pwd)"
command -v node >/dev/null 2>&1 || allow_cursor
node "$SELF_DIR/workflow-guard.js" "$@"
exit 0
