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

BTS_CHECKLIST_REL="docs/plans/00_master_checklist.md"

# The default branch's remote-tracking ref (`origin/main`), or empty. Arg: dir.
bts_default_ref() {
  local ref
  ref=$(git -C "$1" symbolic-ref -q --short refs/remotes/origin/HEAD 2>/dev/null)
  if [ -z "$ref" ]; then
    for ref in origin/main origin/master; do
      git -C "$1" rev-parse -q --verify "refs/remotes/$ref" >/dev/null 2>&1 && { printf '%s' "$ref"; return; }
    done
    return
  fi
  printf '%s' "$ref"
}

# ", N commits behind <ref>, whose copy differs" when the checkout at $1 is
# behind the default ref $2 and its checklist differs from the ref's; else "".
bts_checklist_staleness() {
  local n
  [ -n "$2" ] || return 0
  n=$(git -C "$1" rev-list --count "HEAD..$2" 2>/dev/null) || return 0
  [ "${n:-0}" -gt 0 ] || return 0
  git -C "$1" cat-file -e "$2:$BTS_CHECKLIST_REL" 2>/dev/null || return 0
  git -C "$1" show "$2:$BTS_CHECKLIST_REL" 2>/dev/null | cmp -s - "$1/$BTS_CHECKLIST_REL" && return 0
  if [ "$n" = 1 ]; then
    printf ', 1 commit behind %s, whose copy differs' "$2"
  else
    printf ', %s commits behind %s, whose copy differs' "$n" "$2"
  fi
}

# Find the master checklist for a session. Arg: the session's working
# directory (the hook input's `cwd`); without one, bts_root.
# Prints two lines, the file to read and where it came from, or nothing:
#   1. this checkout / this worktree: the copy in the folder the session runs in
#   2. <origin/default> (this checkout has no copy): read with `git show`
#      into a per-repo temp file
#   3. primary checkout <path>: the parent of the git common dir, the only
#      copy of a gitignored checklist, then $CLAUDE_PROJECT_DIR
# The worktree comes first because $CLAUDE_PROJECT_DIR names the primary
# checkout in a worktree session, and that checkout can be far behind (on
# 2026-11-03 one was 181 commits behind and read 21 of 50 slices done when 55
# of 56 were). A stale source says how far behind it is.
bts_checklist_locate() {
  local base="${1:-}" rel=$BTS_CHECKLIST_REL top gitdir common def primary out
  { [ -n "$base" ] && [ -d "$base" ]; } || base=$(bts_root)
  top=$(git -C "$base" rev-parse --show-toplevel 2>/dev/null)
  if [ -z "$top" ]; then
    [ -f "$base/$rel" ] && printf '%s\n%s\n' "$base/$rel" "this folder"
    return 0
  fi
  def=$(bts_default_ref "$top")
  if [ -f "$top/$rel" ]; then
    gitdir=$(git -C "$top" rev-parse --absolute-git-dir 2>/dev/null)
    common=$(git -C "$top" rev-parse --path-format=absolute --git-common-dir 2>/dev/null)
    if [ -z "$common" ] || [ "$gitdir" = "$common" ]; then
      printf '%s\nthis checkout%s\n' "$top/$rel" "$(bts_checklist_staleness "$top" "$def")"
    else
      printf '%s\nthis worktree%s\n' "$top/$rel" "$(bts_checklist_staleness "$top" "$def")"
    fi
    return 0
  fi
  if [ -n "$def" ] && git -C "$top" cat-file -e "$def:$rel" 2>/dev/null; then
    out="${TMPDIR:-/tmp}"
    out="${out%/}/bytheslice-checklist-$(id -u)-$(printf '%s' "$top" | cksum | cut -d' ' -f1).md"
    if git -C "$top" show "$def:$rel" > "$out" 2>/dev/null; then
      printf '%s\n%s (this checkout has no copy)\n' "$out" "$def"
      return 0
    fi
  fi
  common=$(git -C "$top" rev-parse --path-format=absolute --git-common-dir 2>/dev/null)
  for primary in "${common%/.git}" "${CLAUDE_PROJECT_DIR:-}"; do
    [ -n "$primary" ] && [ "$primary" != "$top" ] && [ -f "$primary/$rel" ] || continue
    printf '%s\nprimary checkout %s%s\n' "$primary/$rel" "$primary" "$(bts_checklist_staleness "$primary" "$(bts_default_ref "$primary")")"
    return 0
  done
  return 0
}

# Path to the master checklist (see bts_checklist_locate); empty if none.
# $BTS_CHECKLIST, when set, wins: shop-status.sh locates once and every helper
# below reads the same file. Optional arg: the session's working directory.
bts_checklist_path() {
  if [ -n "${BTS_CHECKLIST:-}" ]; then
    [ -f "$BTS_CHECKLIST" ] && printf '%s' "$BTS_CHECKLIST"
    return
  fi
  bts_checklist_locate "${1:-}" | sed -n 1p
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
# A heading counts as done if its line carries a checked box `[x]`, a
# `~~strikethrough~~`, or `Status: Completed` / `Complete` / `Done` / `Shipped`
# (in a `<!-- Status: ... -->` note too). A pie also counts as done when it has
# slices and every one of them is done: the pie rolls up from its slices.
# This is the no-Node fallback; with Node, shop-status.sh counts through
# mcp/checklist-format.js, the parser the kitchen and the Pass share.
bts_unit_counts() {
  local checklist layout
  checklist=$(bts_checklist_path)
  [ -z "$checklist" ] && return
  layout=$(bts_checklist_layout)
  case "$layout" in
    pie|stage) ;;
    *) return ;;
  esac
  awk -v layout="$layout" '
    function is_done(s) { return (s ~ /\[[xX]\]/ || s ~ /~~/ || s ~ /[Ss]tatus:[[:space:]]*(Completed?|Done|Shipped)/) }
    function close_pie() {
      if (!open_pie) return
      total++
      if (pie_done || (slices > 0 && slices == slices_done)) done++
      open_pie = 0
    }
    BEGIN { done = 0; total = 0; open_pie = 0 }
    layout == "stage" && /^## +Stage[[:space:]]+[0-9]/ { total++; if (is_done($0)) done++; next }
    layout == "pie" && /^## / {
      close_pie()
      if ($0 ~ /^## +Pie[[:space:]]+[0-9]/) { open_pie = 1; pie_done = is_done($0); slices = 0; slices_done = 0 }
      next
    }
    layout == "pie" && open_pie && /^### +Slice[[:space:]]+[0-9]+\.[0-9]/ { slices++; if (pie_done || is_done($0)) slices_done++ }
    END { close_pie(); if (total) printf "%d %d\n", done, total }
  ' "$checklist"
}

# Count v5 slices (`### Slice N.M`) and their checked state, mirroring
# bts_unit_counts' heading-driven done detection; a slice under a pie whose
# heading is done counts as done, as the kitchen parser reads it. Prints
# "<done> <total>"; empty when the checklist has no `### Slice` headings
# (i.e. a flat v4 file).
bts_slice_counts() {
  local checklist
  checklist=$(bts_checklist_path)
  [ -z "$checklist" ] && return
  awk '
    function is_done(s) { return (s ~ /\[[xX]\]/ || s ~ /~~/ || s ~ /[Ss]tatus:[[:space:]]*(Completed?|Done|Shipped)/) }
    BEGIN { done = 0; total = 0; pie_done = 0 }
    /^## / { pie_done = ($0 ~ /^## +Pie[[:space:]]+[0-9]/ && is_done($0)) }
    /^### +Slice[[:space:]]+[0-9]+\.[0-9]/ {
      total++
      if (pie_done || is_done($0)) done++
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
# globs, ~user), so the caller can report the target as unknown.
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

# Every target whose branch decides which branch a Bash command's `git commit`
# lands on. Args: command string, base dir (the hook input's .cwd; falls back
# to pwd). Prints one line per commit: a git toplevel (or a git dir for
# `--git-dir` / `GIT_DIR`), or `?` when the target cannot be told from the
# command text. Returns 1 with no output when the command has no `git commit`.
#
# Each `git commit` in the command is judged on its own, so a later commit
# cannot hide behind an earlier worktree commit. For each one:
#   1. `cd` / `pushd` steps before it, applied in order (`cd -` included)
#   2. `git -C <dir>` and `--git-dir` on the commit invocation itself
#   3. the base dir (hook cwd)
# The target is `?` (branch unknown) when a step cannot be modeled (a cd
# inside a subshell or quoted child shell that ends before the commit,
# `popd`, a `$VAR` or `$(...)` path, a `git checkout` / `git switch` earlier
# in the command), when a path does not exist yet, or when the directory is
# not inside a git repo. It never falls back to bts_root: the project dir is
# not where the command runs, and reading it there named a scratch repo's
# commit as a commit on the primary checkout's main.
bts_commit_dirs() {
  local cmd="$1" base="${2:-}"
  local start rest consumed match opts r a rc next flag verb between t
  local dir prev amb gitdir top out="" uniq="" line found=1
  local nl='
'
  local q="'"
  local word="(\"[^\"]*\"|${q}[^${q}]*${q}|\\\\.|[^[:space:];&|()<>\"${q}\\\\])+"
  local opt="([[:space:]]+(-C|-c|--git-dir|--work-tree|--namespace|--super-prefix|--config-env)[[:space:]]+${word}|[[:space:]]+--?[[:alnum:]][[:alnum:]-]*(=${word})?)"
  local lead="(^|[[:space:];&|(){}!\`\"${q}/\\\\])git(${opt}*)[[:space:]]+"
  local tail="([[:space:];&|)}\`\"${q}]|$)"
  local git_re="${lead}commit${tail}"
  local switch_re="${lead}(checkout|switch)${tail}"
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

    dir=$start prev="" amb=0 gitdir=""

    # A branch switch earlier in the command moves HEAD before the commit runs.
    [[ $consumed =~ $switch_re ]] && amb=1

    # 1. cd / pushd / popd steps before this commit
    r=$consumed
    while [[ $r =~ $cd_re ]]; do
      verb=${BASH_REMATCH[2]}
      a=${BASH_REMATCH[6]}
      a=${a#"${a%%[![:space:]]*}"}
      r=${r#*"${BASH_REMATCH[0]}"}
      # A cd inside a subshell, backticks, or a quoted `bash -c` that closes
      # before the commit does not move it: the target is unknown.
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
      if next=$(_bts_resolve_dir "$a" "$dir"); then
        prev=$dir; dir=$next
      else
        amb=1
      fi
    done

    # 2. git -C <dir> and --git-dir on the commit itself
    r=$opts
    while [[ $r =~ $c_re ]]; do
      flag=${BASH_REMATCH[2]}
      a=${BASH_REMATCH[4]}
      r=${r#*"${BASH_REMATCH[0]}"}
      if next=$(_bts_resolve_dir "$a" "$dir"); then
        if [ "$flag" = "-C" ]; then dir=$next; else gitdir=$next; fi
      else
        amb=1
      fi
    done

    # GIT_DIR=<dir> anywhere before the commit is a target as well
    r=$consumed
    while [[ $r =~ $gd_re ]]; do
      a=${BASH_REMATCH[3]}
      r=${r#*"${BASH_REMATCH[0]}"}
      if next=$(_bts_resolve_dir "$a" "$start"); then
        out="$out$next$nl"
      else
        amb=1
      fi
    done

    # 3. the modeled directory, or `?` when it cannot be told
    if [ "$amb" = 1 ]; then
      out="$out?$nl"
    elif [ -n "$gitdir" ]; then
      out="$out$gitdir$nl"
    elif top=$(git -C "$dir" rev-parse --show-toplevel 2>/dev/null) && [ -n "$top" ]; then
      out="$out$top$nl"
    else
      out="$out?$nl"
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

# Ensure the state directory exists and echo its absolute path.
bts_state_dir() {
  local dir
  dir="$(bts_root)/.claude/.bytheslice-state"
  mkdir -p "$dir" 2>/dev/null
  printf '%s' "$dir"
}
