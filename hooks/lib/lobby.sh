#!/usr/bin/env bash
# hooks/lib/lobby.sh
# Lobby helpers for hooks/lobby-signal.sh: the machine-level home dir, a project's primary checkout, a short mkdir lock, atomic 0600 JSON writes.
#
# Source from a hook with:
#   . "$(dirname "$0")/lib/lobby.sh"
# Every function fails quietly (empty output or a non-zero return), so the
# hook can give up without a word.
#
# Layout under the home dir (lockstep with slice 7.3; change both or neither):
#   projects.json       {"v":1,"projects":[{"root":"<abs primary checkout>","name":"<basename>","addedAt":<ms>}]}
#   signals/<sid>.json  {"v":1,"sid":"<id>","root":"<abs primary checkout>","t":<ms>,"working":<bool>,
#                        "subagents":<int>,"waiting":null|"permission"|"idle"}
#   .lock/              the writers' mutex: a directory holding its owner's pid

# The Lobby home: $BTS_HOME, else ~/.bytheslice.
lobby_home() {
  printf '%s' "${BTS_HOME:-$HOME/.bytheslice}"
}

# The primary checkout that owns a directory, as a physical absolute path
# (symlinks resolved, so /var and /private/var compare alike). It is the parent
# of the git common dir, so every linked worktree maps to the same primary.
# When the common dir is not a `.git` folder (a submodule, a separate git dir)
# the work tree's own top level stands in. Returns 1 with no output outside a
# git repository. Arg: the directory.
lobby_root() {
  local dir="$1" common top
  [ -n "$dir" ] && [ -d "$dir" ] || return 1
  # Git before 2.31 has no --path-format; the plain form answers relative to dir.
  common=$(git -C "$dir" rev-parse --path-format=absolute --git-common-dir 2>/dev/null) ||
    common=$(git -C "$dir" rev-parse --git-common-dir 2>/dev/null) || return 1
  [ -n "$common" ] || return 1
  case "$common" in
    /*) ;;
    *) common="$dir/$common" ;;
  esac
  if [ "${common##*/}" = ".git" ]; then
    (cd -P "$common" 2>/dev/null && cd .. && pwd -P)
    return
  fi
  top=$(git -C "$dir" rev-parse --show-toplevel 2>/dev/null) && [ -n "$top" ] || return 1
  (cd -P "$top" 2>/dev/null && pwd -P)
}

# True when a primary checkout is a ByTheSlice project: it holds the master
# checklist or a project config. Arg: the primary checkout.
lobby_is_project() {
  [ -f "$1/docs/plans/00_master_checklist.md" ] || [ -f "$1/bytheslice.config.json" ]
}

# Take the writers' lock under the home dir. A holder whose pid is gone is
# reclaimed at once, and a lock with no pid (its writer died between mkdir and
# the pid write) once it is a minute old. Gives up after about two seconds and
# returns 1. On success LOBBY_LOCK names the held lock. Arg: the home dir.
LOBBY_LOCK=""
lobby_lock() {
  local lock="$1/.lock" tries=0 pid
  until mkdir "$lock" 2>/dev/null; do
    tries=$((tries + 1))
    [ "$tries" -le 100 ] || return 1
    pid=$(cat "$lock/pid" 2>/dev/null)
    case "$pid" in
      '' | *[!0-9]*)
        if [ -n "$(find "$lock" -maxdepth 0 -mmin +1 2>/dev/null)" ]; then
          lobby_reclaim "$lock"
          continue
        fi
        ;;
      *)
        if ! kill -0 "$pid" 2>/dev/null; then
          lobby_reclaim "$lock"
          continue
        fi
        ;;
    esac
    sleep 0.02
  done
  printf '%s\n' "$$" > "$lock/pid" 2>/dev/null
  LOBBY_LOCK=$lock
}

# Move an abandoned lock aside, then delete it. The rename is atomic, so when
# two writers reclaim at once only one moves it. Arg: the lock dir.
lobby_reclaim() {
  local trash="$1.dead.$$"
  rm -rf "$trash" 2>/dev/null
  mv "$1" "$trash" 2>/dev/null || return 0
  rm -rf "$trash" 2>/dev/null
  return 0
}

# Release the lock this process holds, if any.
lobby_unlock() {
  [ -n "$LOBBY_LOCK" ] || return 0
  if [ "$(cat "$LOBBY_LOCK/pid" 2>/dev/null)" = "$$" ]; then
    rm -f "$LOBBY_LOCK/pid" 2>/dev/null
    rmdir "$LOBBY_LOCK" 2>/dev/null
  fi
  LOBBY_LOCK=""
  return 0
}

# Replace a file atomically: write a temp file in the same dir, set mode 0600,
# then rename it over the target. Readers see the old file or the new one,
# never a torn one. Args: the target file, the content (a newline is added).
lobby_write() {
  local file="$1" tmp
  tmp=$(mktemp "${file%/*}/.tmp.XXXXXXXX" 2>/dev/null) || return 1
  if printf '%s\n' "$2" > "$tmp" 2>/dev/null && chmod 600 "$tmp" 2>/dev/null &&
      mv -f "$tmp" "$file" 2>/dev/null; then
    return 0
  fi
  rm -f "$tmp" 2>/dev/null
  return 1
}
