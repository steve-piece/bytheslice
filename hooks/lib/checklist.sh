#!/usr/bin/env bash
# hooks/lib/checklist.sh
# Shared helpers for ByTheSlice plugin hooks.
# All functions are read-only and idempotent. Source from a hook with:
#   . "$(dirname "$0")/lib/checklist.sh"

# Locate the project root for the current invocation.
# Prefers $CLAUDE_PROJECT_DIR (set by Claude Code), falls back to git toplevel, then pwd.
bts_root() {
  if [ -n "${CLAUDE_PROJECT_DIR:-}" ] && [ -d "$CLAUDE_PROJECT_DIR" ]; then
    printf '%s' "$CLAUDE_PROJECT_DIR"
    return
  fi
  local r
  r=$(git rev-parse --show-toplevel 2>/dev/null) && [ -n "$r" ] && { printf '%s' "$r"; return; }
  pwd
}

# Path to the master checklist if it exists at the conventional location.
# Empty string if missing.
bts_checklist_path() {
  local root path
  root=$(bts_root)
  path="$root/docs/plans/00_master_checklist.md"
  [ -f "$path" ] && printf '%s' "$path"
}

# Count Prep checkboxes. Prints "<done> <total>" (e.g. "2 5").
# Empty output if no `## Prep` section is present.
bts_prep_counts() {
  local checklist
  checklist=$(bts_checklist_path)
  [ -z "$checklist" ] && return
  awk '
    BEGIN { in_prep = 0; done = 0; total = 0; seen = 0 }
    /^## +Prep([[:space:]]|$)/ { in_prep = 1; seen = 1; next }
    in_prep && /^## / { in_prep = 0 }
    in_prep && /^[[:space:]]*-[[:space:]]*\[[ xX]\]/ {
      total++
      if ($0 ~ /\[[xX]\]/) done++
    }
    END { if (seen) printf "%d %d\n", done, total }
  ' "$checklist"
}

# Current git branch. Empty if not in a repo.
bts_branch() {
  git -C "$(bts_root)" rev-parse --abbrev-ref HEAD 2>/dev/null
}

# Returns "main" if current branch is main/master, otherwise "feature".
bts_branch_class() {
  local b
  b=$(bts_branch)
  case "$b" in
    main|master) printf 'main' ;;
    "") printf 'unknown' ;;
    *) printf 'feature' ;;
  esac
}

# "clean" or "dirty" based on git working tree state.
bts_tree_state() {
  local out
  out=$(git -C "$(bts_root)" status --porcelain 2>/dev/null)
  [ -z "$out" ] && printf 'clean' || printf 'dirty'
}

# Ensure the state directory exists and echo its absolute path.
bts_state_dir() {
  local dir
  dir="$(bts_root)/.claude/.bytheslice-state"
  mkdir -p "$dir" 2>/dev/null
  printf '%s' "$dir"
}

# Extract .session_id from a hook input JSON envelope. Tolerates missing jq.
# Pass the raw stdin JSON as the first argument. Empty output if absent.
bts_session_id() {
  local input="$1"
  local id=""
  if command -v jq >/dev/null 2>&1; then
    id=$(printf '%s' "$input" | jq -r '.session_id // empty' 2>/dev/null)
  fi
  if [ -z "$id" ]; then
    id=$(printf '%s' "$input" | sed -n 's/.*"session_id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
  fi
  printf '%s' "$id"
}

# Detect the first /bytheslice slash command in a user prompt.
# Prints the canonical short name (e.g. "sell-slice") or nothing.
bts_detect_skill() {
  local prompt="$1"
  # Match /sell-slice, /bytheslice:sell-slice, etc. Pick the first hit.
  printf '%s\n' "$prompt" | grep -oE '/(bytheslice:)?(sell-slice|box-it-up|cook-pizzas|special-order|run-the-day|inspect-display|close-shop|setup-shop|set-display-case|open-the-shop|create-menu|final-quality-check)\b' \
    | head -1 \
    | sed -E 's#^/(bytheslice:)?##'
}
