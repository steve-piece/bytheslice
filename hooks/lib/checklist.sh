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
# heading and no Pie), or "" (neither, e.g. a table-only checklist).
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

# Expand one shell word the way bash would for a path argument: remove
# quotes and backslash escapes, expand a leading `~` or `~/`. Returns 1 for
# a word that needs expansion this parser does not model ($VAR, `cmd`,
# globs, ~user), so the caller can fail closed.
_bts_shell_word() {
  local w="$1" out="" c q="" i=0
  case "$w" in
    "~") out=$HOME; w="" ;;
    "~/"*) out=$HOME; w=${w#\~} ;;
    "~"*) return 1 ;;
  esac
  while [ "$i" -lt "${#w}" ]; do
    c=${w:$i:1}
    if [ "$q" = "'" ]; then
      if [ "$c" = "'" ]; then q=""; else out+=$c; fi
    elif [ "$q" = '"' ]; then
      case "$c" in
        '"') q="" ;;
        '$'|'`') return 1 ;;
        '\')
          i=$((i + 1)); c=${w:$i:1}
          case "$c" in
            '$'|'`'|'"'|'\') out+=$c ;;
            *) out+="\\$c" ;;
          esac ;;
        *) out+=$c ;;
      esac
    else
      case "$c" in
        "'"|'"') q=$c ;;
        '\') i=$((i + 1)); out+=${w:$i:1} ;;
        '$'|'`'|'*'|'?'|'[') return 1 ;;
        *) out+=$c ;;
      esac
    fi
    i=$((i + 1))
  done
  printf '%s' "$out"
}

# Resolve one `cd` / `git -C` / `--git-dir` path argument against a base
# directory. Prints the physical path and returns 0 when it exists, returns 1
# when it does not, and returns 2 when the word cannot be expanded here.
_bts_resolve_dir() {
  local p
  p=$(_bts_shell_word "$1") || return 2
  case "$p" in
    /*) ;;
    *) p="$2/$p" ;;
  esac
  [ -d "$p" ] || return 1
  (cd "$p" 2>/dev/null && pwd -P)
}

# Every directory whose branch decides whether a Bash command's `git commit`
# lands on main. Args: command string, base dir (the hook input's .cwd;
# falls back to pwd). Prints one directory per line (a git toplevel, or a
# git dir for `--git-dir` / `GIT_DIR`). Returns 1 with no output when the
# command contains no `git commit`. The guard blocks if any line is on main.
#
# Each `git commit` in the command is judged on its own, so a later commit
# cannot hide behind an earlier worktree commit. For each one:
#   1. `cd` / `pushd` steps before it, applied in order (`cd -` included)
#   2. `git -C <dir>` and `--git-dir` on the commit invocation itself
#   3. the base dir (hook cwd) when it sits inside a git repo
#   4. bts_root when none of the above is inside a repo
# The parser fails closed: when a step cannot be modeled (a cd inside a
# subshell or quoted child shell that ends before the commit, `popd`, a
# `$VAR` path, `GIT_DIR=`), every directory the command visits is printed,
# plus bts_root for an unexpandable path, so a main checkout among them
# still blocks.
bts_commit_dirs() {
  local cmd="$1" base="${2:-}"
  local start rest consumed match opts r a rc next flag verb between t
  local dir prev amb unres seen gitdir top out="" uniq="" line found=1
  local nl='
'
  local q="'"
  local word="(\"[^\"]*\"|${q}[^${q}]*${q}|\\\\.|[^[:space:];&|()<>\"${q}\\\\])+"
  local opt="([[:space:]]+(-C|-c|--git-dir|--work-tree|--namespace|--super-prefix|--config-env)[[:space:]]+${word}|[[:space:]]+--?[[:alnum:]][[:alnum:]-]*(=${word})?)"
  local git_re="(^|[[:space:];&|(){}!\`\"${q}/\\\\])git(${opt}*)[[:space:]]+commit([[:space:];&|)}\`\"${q}]|$)"
  local cd_re="(^|[[:space:];&|(){!\`\"${q}])(cd|pushd|popd)(([[:space:]]+(-[LPe@]+|--))*)([[:space:]]+${word})?([[:space:];&|)}<>\`\"${q}]|$)"
  local c_re="(^|[[:space:]])(-C|--git-dir)(=|[[:space:]]+)(${word})"
  local gd_re="(^|[[:space:];&|(){!\`\"${q}])(export[[:space:]]+)?GIT_DIR=(${word})"

  if [ -n "$base" ] && [ -d "$base" ]; then
    start=$(cd "$base" 2>/dev/null && pwd -P)
  else
    start=$(pwd -P)
  fi

  rest=$cmd
  consumed=""
  while [[ $rest =~ $git_re ]]; do
    found=0
    match=${BASH_REMATCH[0]}
    opts=${BASH_REMATCH[2]}
    consumed="$consumed${rest%%"$match"*}"
    rest=${rest#*"$match"}

    dir=$start prev="" amb=0 unres=0 seen=$start gitdir=""

    # 1. cd / pushd / popd steps before this commit
    r=$consumed
    while [[ $r =~ $cd_re ]]; do
      verb=${BASH_REMATCH[2]}
      a=${BASH_REMATCH[6]}
      a=${a#"${a%%[![:space:]]*}"}
      r=${r#*"${BASH_REMATCH[0]}"}
      # A cd inside a subshell, backticks, or a quoted `bash -c` that closes
      # before the commit does not move it. Detect the close and fail closed.
      between=$r
      t=${between//[^(]/}; next=${#t}
      t=${between//[^)]/}
      [ "${#t}" -gt "$next" ] && amb=1
      for flag in '`' '"' "'"; do
        t=${between//[^$flag]/}
        [ $(( ${#t} % 2 )) = 1 ] && amb=1
      done
      case "$verb" in
        popd) amb=1; continue ;;
        pushd) case "$a" in ""|[+-][0-9]*) amb=1; continue ;; esac ;;
      esac
      if [ "$a" = "-" ]; then
        if [ -n "$prev" ]; then
          next=$prev; prev=$dir; dir=$next
        else
          amb=1
        fi
        continue
      fi
      [ -n "$a" ] || a='~'
      next=$(_bts_resolve_dir "$a" "$dir"); rc=$?
      if [ "$rc" = 0 ]; then
        prev=$dir; dir=$next; seen="$seen$nl$dir"
      elif [ "$rc" = 2 ]; then
        amb=1; unres=1
      fi
    done

    # 2. git -C <dir> and --git-dir on the commit itself
    r=$opts
    while [[ $r =~ $c_re ]]; do
      flag=${BASH_REMATCH[2]}
      a=${BASH_REMATCH[4]}
      r=${r#*"${BASH_REMATCH[0]}"}
      next=$(_bts_resolve_dir "$a" "$dir"); rc=$?
      if [ "$rc" = 0 ]; then
        if [ "$flag" = "-C" ]; then dir=$next; else gitdir=$next; fi
      elif [ "$rc" = 2 ]; then
        amb=1; unres=1
      fi
    done

    # GIT_DIR=<dir> anywhere before the commit is checked as well
    r=$consumed
    while [[ $r =~ $gd_re ]]; do
      a=${BASH_REMATCH[3]}
      r=${r#*"${BASH_REMATCH[0]}"}
      next=$(_bts_resolve_dir "$a" "$start"); rc=$?
      if [ "$rc" = 0 ]; then
        out="$out$next$nl"
      elif [ "$rc" = 2 ]; then
        amb=1; unres=1
      fi
    done

    # 3 and 4. the modeled directory, else bts_root
    if [ -n "$gitdir" ]; then
      out="$out$gitdir$nl"
    else
      top=$(git -C "$dir" rev-parse --show-toplevel 2>/dev/null) || top=$(bts_root)
      out="$out$top$nl"
    fi

    if [ "$amb" = 1 ]; then
      while IFS= read -r line; do
        top=$(git -C "$line" rev-parse --show-toplevel 2>/dev/null) && out="$out$top$nl"
      done <<EOF
$seen
$dir
EOF
      [ "$unres" = 1 ] && out="$out$(bts_root)$nl"
    fi
    consumed="$consumed$match"
  done
  [ "$found" = 0 ] || return 1

  while IFS= read -r line; do
    [ -n "$line" ] || continue
    case "$nl$uniq" in
      *"$nl$line$nl"*) continue ;;
    esac
    uniq="$uniq$line$nl"
  done <<EOF
$out
EOF
  printf '%s' "$uniq"
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
