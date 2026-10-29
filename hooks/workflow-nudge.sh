#!/usr/bin/env bash
# hooks/workflow-nudge.sh
# Runs hooks/workflow-nudge.js on UserPromptSubmit: adds the feature intake,
# /sell-slice or /pizza-party route as context. Never refuses anything.
# Without Node it does nothing.

set -u

[ "${BTS_HOOKS_DISABLED:-0}" = "1" ] && exit 0

SELF_DIR="$(cd "$(dirname "$0")" && pwd)"
command -v node >/dev/null 2>&1 || exit 0
node "$SELF_DIR/workflow-nudge.js" "$@"
exit 0
