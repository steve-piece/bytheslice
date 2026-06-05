#!/usr/bin/env bash
# hooks/precheck-skill.sh
# UserPromptSubmit hook for ByTheSlice plugin.
# Detects a /bytheslice slash command in the prompt, runs the right
# preconditions, and either BLOCKS (exit 2) or WARN-injects (stdout, exit 0).
#
# Hook contract: reads JSON from stdin with .prompt; writes either
# - additional context to stdout (becomes context for Claude), exit 0
# - block reason to stderr, exit 2

set -u

# Honor an explicit per-session disable.
[ "${BTS_HOOKS_DISABLED:-0}" = "1" ] && exit 0

SELF_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=./lib/checklist.sh
. "$SELF_DIR/lib/checklist.sh"

# Read stdin (Claude Code passes a JSON envelope). Tolerate missing jq.
INPUT="$(cat 2>/dev/null || true)"
PROMPT=""
if command -v jq >/dev/null 2>&1; then
  PROMPT=$(printf '%s' "$INPUT" | jq -r '.prompt // empty' 2>/dev/null)
fi
# Fallback: best-effort extract of .prompt without jq.
if [ -z "$PROMPT" ]; then
  PROMPT=$(printf '%s' "$INPUT" | sed -n 's/.*"prompt"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
fi

SKILL=$(bts_detect_skill "$PROMPT")
[ -z "$SKILL" ] && exit 0  # No bytheslice skill mentioned — let the prompt through untouched.

SESSION_ID=$(bts_session_id "$INPUT")

WARNINGS=()
BLOCKS=()

needs_checklist() {
  case "$1" in
    sell-slice|cook-pizzas|special-order|run-the-day|close-slot|close-shop) return 0 ;;
    *) return 1 ;;
  esac
}

CHECKLIST=$(bts_checklist_path)

# Per-skill rules.
case "$SKILL" in
  sell-slice)
    if [ -z "$CHECKLIST" ]; then
      BLOCKS+=("/sell-slice requires docs/plans/00_master_checklist.md. Run /cook-pizzas first (new project) or /special-order (add a stage to an existing one).")
    else
      read -r DONE TOTAL <<<"$(bts_prep_counts || true)"
      if [ -n "${TOTAL:-}" ] && [ "${TOTAL:-0}" -gt 0 ] && [ "${DONE:-0}" -lt "${TOTAL:-0}" ]; then
        WARNINGS+=("Prep section incomplete: ${DONE}/${TOTAL} boxes checked. Foundation skills (/set-display-case, /final-quality-check, /open-the-shop) may not have run.")
      fi
    fi
    if [ "$(bts_tree_state)" = "dirty" ]; then
      WARNINGS+=("Working tree is dirty. /sell-slice prefers a clean tree; commit or stash before starting unless you intentionally want to build on top.")
    fi
    ;;
  box-it-up)
    case "$(bts_branch_class)" in
      main) BLOCKS+=("/box-it-up refuses to run on main/master. Switch to a feature branch with your slice committed locally.") ;;
      unknown) WARNINGS+=("Could not determine current git branch.") ;;
    esac
    if ! command -v gh >/dev/null 2>&1 || ! gh auth status >/dev/null 2>&1; then
      WARNINGS+=("'gh' CLI not authenticated; /box-it-up's PR open / CI watch steps will fail. Run 'gh auth login' first.")
    fi
    ;;
  cook-pizzas|special-order|run-the-day|close-shop)
    if needs_checklist "$SKILL" && [ -z "$CHECKLIST" ] && [ "$SKILL" != "cook-pizzas" ]; then
      BLOCKS+=("/$SKILL requires docs/plans/00_master_checklist.md. Run /cook-pizzas first to scaffold one.")
    fi
    ;;
esac

# Persist state for the session-id-guarded Write/Edit guards (stage-plan-guard,
# library-gate-guard) and compact-snapshot. session_id is the dedup key — those
# guards ignore any state whose session_id does not match the current session,
# which prevents stale prechecks from a previous chat from triggering a
# false-positive warning.
STATE_DIR=$(bts_state_dir)
{
  printf '{\n'
  printf '  "session_id": "%s",\n' "$SESSION_ID"
  printf '  "skill": "%s",\n' "$SKILL"
  printf '  "timestamp": "%s",\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  printf '  "blocks": %d,\n' "${#BLOCKS[@]}"
  printf '  "warnings": %d,\n' "${#WARNINGS[@]}"
  printf '  "branch": "%s",\n' "$(bts_branch)"
  printf '  "tree": "%s"\n' "$(bts_tree_state)"
  printf '}\n'
} > "$STATE_DIR/last-precheck.json" 2>/dev/null || true

if [ "${#BLOCKS[@]}" -gt 0 ]; then
  printf '[bytheslice] /%s blocked:\n' "$SKILL" >&2
  for b in "${BLOCKS[@]}"; do printf '  - %s\n' "$b" >&2; done
  exit 2
fi

if [ "${#WARNINGS[@]}" -gt 0 ]; then
  printf '[bytheslice precheck for /%s]\n' "$SKILL"
  for w in "${WARNINGS[@]}"; do printf '  ⚠ %s\n' "$w"; done
fi

exit 0
