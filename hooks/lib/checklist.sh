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
# Accepts both checkbox forms: dashed "- [ ]" (canonical GitHub task-list
# form per skills/cook-pizzas/references/templates.md "Checkbox format rule")
# and bare "[ ]" (legacy: checklists generated before 5.1.3 omitted the
# list marker, which GitHub renders as running text rather than a list).
# Empty output if no `## Prep` section is present.
bts_prep_counts() {
  local checklist
  checklist=$(bts_checklist_path)
  [ -z "$checklist" ] && return
  awk '
    BEGIN { in_prep = 0; done = 0; total = 0; seen = 0 }
    /^## +Prep([[:space:]]|$)/ { in_prep = 1; seen = 1; next }
    in_prep && /^## / { in_prep = 0 }
    in_prep && /^[[:space:]]*(-[[:space:]]*)?\[[ xX]\]/ {
      total++
      if ($0 ~ /\[[xX]\]/) done++
    }
    END { if (seen) printf "%d %d\n", done, total }
  ' "$checklist"
}

# Detect the checklist's structural layout. Dual-read for v5 (C-hooks):
#   - flat v4 checklists use `## Stage N` headings
#   - nested v5 checklists use `## Pie N` headings with `### Slice N.M` subheadings
# Prints one of: "pie" (any `## Pie` heading present), "stage" (any `## Stage`
# heading and no Pie), or "" (neither — e.g. a table-only checklist).
bts_checklist_layout() {
  local checklist
  checklist=$(bts_checklist_path)
  [ -z "$checklist" ] && return
  awk '
    BEGIN { pie = 0; stage = 0 }
    /^## +Pie[[:space:]]+[0-9]/        { pie = 1 }
    /^## +Stage[[:space:]]+[0-9]/      { stage = 1 }
    END {
      if (pie)        print "pie"
      else if (stage) print "stage"
    }
  ' "$checklist"
}

# Count top-level work units in the checklist, dual-read across both layouts.
# A "unit" is one `## Stage N` heading (flat v4) OR one `## Pie N` heading
# (nested v5). Prints "<done> <total>"; empty if neither heading style exists.
#
# Done-ness is heading-driven so it works regardless of whether a project
# tracks status inline (checkbox on the heading line) or in a separate table:
#   - a heading counts as done if its line carries a checked box `[x]`,
#     a `~~strikethrough~~`, or a trailing `Status: Completed` / `Status: Done`.
bts_unit_counts() {
  local checklist layout pat
  checklist=$(bts_checklist_path)
  [ -z "$checklist" ] && return
  layout=$(bts_checklist_layout)
  case "$layout" in
    pie)   pat='^## +Pie[[:space:]]+[0-9]' ;;
    stage) pat='^## +Stage[[:space:]]+[0-9]' ;;
    *)     return ;;
  esac
  awk -v pat="$pat" '
    BEGIN { done = 0; total = 0 }
    $0 ~ pat {
      total++
      if ($0 ~ /\[[xX]\]/ || $0 ~ /~~/ || $0 ~ /[Ss]tatus:[[:space:]]*(Completed|Done)/) done++
    }
    END { if (total) printf "%d %d\n", done, total }
  ' "$checklist"
}

# Count v5 slices (`### Slice N.M`) and their checked state, mirroring
# bts_unit_counts' heading-driven done detection. Prints "<done> <total>";
# empty when the checklist has no `### Slice` headings (i.e. a flat v4 file).
bts_slice_counts() {
  local checklist
  checklist=$(bts_checklist_path)
  [ -z "$checklist" ] && return
  awk '
    BEGIN { done = 0; total = 0 }
    /^### +Slice[[:space:]]+[0-9]+\.[0-9]/ {
      total++
      if ($0 ~ /\[[xX]\]/ || $0 ~ /~~/ || $0 ~ /[Ss]tatus:[[:space:]]*(Completed|Done)/) done++
    }
    END { if (total) printf "%d %d\n", done, total }
  ' "$checklist"
}

# Current git branch. Empty if not in a repo.
# Optional arg: directory to read HEAD from (defaults to bts_root).
bts_branch() {
  git -C "${1:-$(bts_root)}" rev-parse --abbrev-ref HEAD 2>/dev/null
}

# Returns "main" if current branch is main/master, otherwise "feature".
# Optional arg: directory to read HEAD from (defaults to bts_root).
bts_branch_class() {
  local b
  b=$(bts_branch "${1:-}")
  case "$b" in
    main|master) printf 'main' ;;
    "") printf 'unknown' ;;
    *) printf 'feature' ;;
  esac
}

# Resolve one `cd` / `git -C` path argument against a base directory.
# Strips one layer of matching quotes, expands a leading `~`, and anchors
# relative paths at the base. Prints the resolved path only if it exists.
_bts_resolve_dir() {
  local arg="$1" base="$2"
  case "$arg" in
    \"*\") arg=${arg#\"}; arg=${arg%\"} ;;
    \'*\') arg=${arg#\'}; arg=${arg%\'} ;;
  esac
  case "$arg" in
    "~") arg=$HOME ;;
    "~/"*) arg="$HOME/${arg#\~/}" ;;
  esac
  case "$arg" in
    /*) ;;
    *) arg="$base/$arg" ;;
  esac
  [ -d "$arg" ] && (cd "$arg" 2>/dev/null && pwd -P)
}

# Resolve the git toplevel a Bash command's `git commit` will run in.
# Args: command string, base dir (the hook input's .cwd; falls back to pwd).
# Returns 1 with no output when the command contains no `git commit`.
#
# Resolution order, so a commit inside a worktree reads the worktree's HEAD
# instead of the primary checkout's (CLAUDE_PROJECT_DIR):
#   1. `cd <dir>` steps that precede the commit, applied in order
#   2. `git -C <dir>` options on the commit invocation itself
#   3. the base dir (hook cwd) when it sits inside a git repo
#   4. bts_root as the last resort
bts_commit_dir() {
  local cmd="$1" base="${2:-}" dir next match prefix opts rest
  local q="'"
  local arg="(\"[^\"]*\"|${q}[^${q}]*${q}|[^[:space:];&|()\"${q}]+)"
  local opt="([[:space:]]+-C[[:space:]]+${arg}|[[:space:]]+-c[[:space:]]+${arg}|[[:space:]]+--?[[:alnum:]][[:alnum:]-]*(=[^[:space:];&|]*)?)"
  local git_re="(^|[[:space:];&|(])git(${opt}*)[[:space:]]+commit([[:space:];&|)]|$)"
  local cd_re="(^|[[:space:];&|(])cd[[:space:]]+${arg}"
  local c_re="-C[[:space:]]+${arg}"

  [[ $cmd =~ $git_re ]] || return 1
  match=${BASH_REMATCH[0]}
  opts=${BASH_REMATCH[2]}
  prefix=${cmd%%"$match"*}

  if [ -n "$base" ] && [ -d "$base" ]; then
    dir=$(cd "$base" 2>/dev/null && pwd -P)
  else
    dir=$(pwd -P)
  fi

  rest=$prefix
  while [[ $rest =~ $cd_re ]]; do
    next=$(_bts_resolve_dir "${BASH_REMATCH[2]}" "$dir") && dir=$next
    rest=${rest#*"${BASH_REMATCH[0]}"}
  done

  rest=$opts
  while [[ $rest =~ $c_re ]]; do
    next=$(_bts_resolve_dir "${BASH_REMATCH[1]}" "$dir") && dir=$next
    rest=${rest#*"${BASH_REMATCH[0]}"}
  done

  git -C "$dir" rev-parse --show-toplevel 2>/dev/null || bts_root
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
# `sell-pie` precedes `sell-slice` in the alternation so the longer, more
# specific v5 command wins when both could match a prefix.
bts_detect_skill() {
  local prompt="$1"
  # Match /sell-pie, /sell-slice, /bytheslice:sell-pie, etc. Pick the first hit.
  printf '%s\n' "$prompt" | grep -oE '/(bytheslice:)?(sell-pie|sell-slice|box-it-up|cook-pizzas|special-order|run-the-day|inspect-display|close-shop|setup-shop|set-display-case|open-the-shop|create-menu|final-quality-check)\b' \
    | head -1 \
    | sed -E 's#^/(bytheslice:)?##'
}
