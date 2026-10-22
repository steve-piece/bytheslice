#!/usr/bin/env bash
# hooks/lobby-signal.sh
# Record ByTheSlice projects and per-session state for the machine-level Lobby, with no prompt, message or secret content.
#
# Hook contract: reads the hook JSON envelope on stdin. Runs synchronously on
# SessionStart, UserPromptSubmit, SubagentStart, SubagentStop, Stop and
# Notification. Always exits 0 and prints nothing.
#
# Files, under ${BTS_HOME:-$HOME/.bytheslice} (lockstep with slice 7.3):
#   projects.json       {"v":1,"projects":[{"root":"<abs primary checkout>","name":"<basename>","addedAt":<ms>}]}
#   signals/<sid>.json  {"v":1,"sid":"<id>","root":"<abs primary checkout>","t":<ms>,"working":<bool>,
#                        "subagents":<int>,"waiting":null|"permission"|"idle"}
# `root` is the parent of the git common dir, so every worktree rolls up to its
# primary checkout. Only a primary holding docs/plans/00_master_checklist.md or
# bytheslice.config.json counts as a project; any other cwd writes nothing.
#
# Events:
#   SessionStart      upsert the project (an existing root keeps its addedAt),
#                     drop every entry whose root is no longer a directory, and
#                     delete signals older than 7 days
#   UserPromptSubmit  working true, waiting null
#   SubagentStart     working true, subagents + 1
#   SubagentStop      subagents - 1 (floor 0)
#   Stop              working false; subagents and waiting kept
#   Notification      notification_type permission_prompt sets waiting
#                     "permission", idle_prompt sets "idle"; any other type
#                     writes nothing
# Every signal write refreshes `t`. Writes are atomic (temp file, then rename,
# mode 0600) under a short lock; a damaged file is replaced, never fatal.
#
# Privacy: only session_id, hook_event_name, notification_type and cwd are read
# out of the envelope. The prompt, message, last_assistant_message, tool data
# and env values never reach a file.
#
# With BTS_HOST=cursor it runs as a Cursor hook (sessionStart, beforeSubmitPrompt,
# subagentStart, subagentStop, stop) and maps Cursor's keys onto the same files:
# the conversation id (the parent's on subagentStart) for session_id, the first
# workspace root for cwd. Every exit then prints the JSON answer Cursor reads:
# {"permission":"allow"} on subagentStart (a permission hook, which blocks on an
# answer off its schema), {"continue":true} on beforeSubmitPrompt, {} otherwise.
#
# JSON engine: jq, else a `node -e` script, else exit 0 silently.

set -u

LB_CURSOR=0
LB_ANSWER='{}'
LOBBY_LOCK=""

# Release the lock and give Cursor its answer, whatever path ends the run.
lb_exit() {
  [ -n "$LOBBY_LOCK" ] && lobby_unlock
  [ "$LB_CURSOR" = 1 ] && printf '%s\n' "$LB_ANSWER" >&3
  exit 0
}

if [ "${BTS_HOST:-}" = "cursor" ]; then
  LB_CURSOR=1
  INPUT="$(cat 2>/dev/null || true)"
  LB_EVENT_RE='"hook_event_name"[[:space:]]*:[[:space:]]*"(subagentStart|beforeSubmitPrompt)"'
  if [[ $INPUT =~ $LB_EVENT_RE ]]; then
    case "${BASH_REMATCH[1]}" in
      subagentStart) LB_ANSWER='{"permission":"allow"}' ;;
      beforeSubmitPrompt) LB_ANSWER='{"continue":true}' ;;
    esac
  fi
  exec 3>&1
  trap lb_exit EXIT
  trap 'exit 0' INT TERM HUP
fi

[ "${BTS_HOOKS_DISABLED:-0}" = "1" ] && exit 0

# Even filesystem or parser failures must remain invisible to the session.
exec >/dev/null 2>&1
trap lb_exit EXIT
trap 'exit 0' INT TERM HUP

# Files 0600, directories 0700.
umask 077

SELF_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=./lib/lobby.sh
. "$SELF_DIR/lib/lobby.sh"

if command -v jq >/dev/null 2>&1; then
  LB_ENGINE=jq
elif command -v node >/dev/null 2>&1; then
  LB_ENGINE=node
else
  exit 0
fi

[ "$LB_CURSOR" = 1 ] || INPUT="$(cat 2>/dev/null || true)"
[ -n "$INPUT" ] || exit 0

# Envelope fields (jq). Prints event, session id, notification type and cwd,
# joined by the unit separator (0x1f). Under $cursor the Cursor event names and
# keys are mapped onto the Claude Code ones. A field holding a control
# character is emptied, never repaired. Emits nothing for unparseable input.
LB_FIELDS_JQ='
def str: if type == "string" and length > 0 then . else null end;
def clean: if . == null then "" elif (explode | map(. < 32 or . == 127) | any) then "" else . end;
select(length == 1 and (.[0] | type) == "object") | .[0]
| (.hook_event_name | str // "") as $raw
| (if $cursor then
     ({"sessionStart": "SessionStart", "beforeSubmitPrompt": "UserPromptSubmit",
       "subagentStart": "SubagentStart", "subagentStop": "SubagentStop", "stop": "Stop"} | .[$raw] // "")
   else $raw end) as $ev
| (if $cursor then
     ((if $ev == "SubagentStart" then (.parent_conversation_id | str) else null end)
      // (.conversation_id | str) // (.session_id | str))
   else (.session_id | str) end) as $sid
| (if $cursor then
     ((if (.workspace_roots | type) == "array" then (.workspace_roots[0] | str) else null end) // (.cwd | str))
   else (.cwd | str) end) as $cwd
| (if $ev == "Notification" then (.notification_type | str) else null end) as $ntype
| [$ev, $sid, $ntype, $cwd] | map(clean) | join("\u001f")
'

# Envelope fields (node fallback). Same logic as LB_FIELDS_JQ; the host arrives
# in LB_CURSOR.
LB_FIELDS_NODE='
let d = "";
process.stdin.on("data", (c) => { d += c; }).on("end", () => {
  let j;
  try { j = JSON.parse(d); } catch (e) { return; }
  if (!j || typeof j !== "object" || Array.isArray(j)) return;
  const str = (v) => (typeof v === "string" && v.length > 0) ? v : null;
  const clean = (v) => (v === null || /[\x00-\x1f\x7f]/.test(v)) ? "" : v;
  const cursor = process.env.LB_CURSOR === "1";
  const raw = str(j.hook_event_name) || "";
  const names = { sessionStart: "SessionStart", beforeSubmitPrompt: "UserPromptSubmit",
    subagentStart: "SubagentStart", subagentStop: "SubagentStop", stop: "Stop" };
  const ev = cursor ? (Object.prototype.hasOwnProperty.call(names, raw) ? names[raw] : "") : raw;
  const sid = cursor
    ? ((ev === "SubagentStart" ? str(j.parent_conversation_id) : null) || str(j.conversation_id) || str(j.session_id))
    : str(j.session_id);
  const roots = Array.isArray(j.workspace_roots) ? j.workspace_roots : [];
  const cwd = cursor ? (str(roots[0]) || str(j.cwd)) : str(j.cwd);
  const ntype = ev === "Notification" ? str(j.notification_type) : null;
  process.stdout.write([ev, sid, ntype, cwd].map(clean).join("\x1f"));
});
'

# Registry upsert (jq). Input: the current projects.json text on stdin (raw,
# possibly empty or damaged). Args: $root, $name, $alive (the current entries'
# roots that are still directories, one per line). Keeps entry order, drops
# dead and duplicate roots, keeps an existing root's addedAt.
LB_REGISTRY_JQ='
(now * 1000 | floor) as $now
| ($alive | split("\n") | map(select(length > 0))) as $live
| (try fromjson catch null) as $d
| (if ($d | type) == "object" and ($d.projects | type) == "array" then $d.projects else [] end)
| map(select(type == "object" and (.root | type) == "string"))
| map(.root as $r | select($live | map(. == $r) | any))
| reduce .[] as $e ([];
    if (map(.root == $e.root) | any) then . else . + [{
      root: $e.root,
      name: ($e.name | if type == "string" and length > 0 then . else ($e.root | sub(".*/"; "")) end),
      addedAt: ($e.addedAt | if type == "number" then floor else $now end)
    }] end)
| if (map(.root == $root) | any) then map(if .root == $root then .name = $name else . end)
  else . + [{root: $root, name: $name, addedAt: $now}] end
| {v: 1, projects: .}
'

# The roots listed in a projects.json text on stdin, one per line (jq).
LB_ROOTS_JQ='
(try fromjson catch null)
| if type == "object" and (.projects | type) == "array" then .projects[] else empty end
| select(type == "object") | .root | select(type == "string")
'

# Registry upsert (node fallback). Same logic as LB_REGISTRY_JQ; the file, root
# and name arrive in LB_FILE, LB_ROOT and LB_NAME.
LB_REGISTRY_NODE='
const fs = require("fs");
const now = Date.now();
const root = process.env.LB_ROOT, name = process.env.LB_NAME;
let d = null;
try { d = JSON.parse(fs.readFileSync(process.env.LB_FILE, "utf8")); } catch (e) {}
const list = (d && typeof d === "object" && !Array.isArray(d) && Array.isArray(d.projects)) ? d.projects : [];
const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch (e) { return false; } };
const out = [];
for (const e of list) {
  if (!e || typeof e !== "object" || Array.isArray(e) || typeof e.root !== "string") continue;
  if (e.root.includes("\n") || !isDir(e.root) || out.some((o) => o.root === e.root)) continue;
  out.push({
    root: e.root,
    name: (typeof e.name === "string" && e.name.length > 0) ? e.name : e.root.replace(/.*\//, ""),
    addedAt: (typeof e.addedAt === "number" && isFinite(e.addedAt)) ? Math.floor(e.addedAt) : now,
  });
}
const hit = out.find((o) => o.root === root);
if (hit) hit.name = name; else out.push({ root: root, name: name, addedAt: now });
process.stdout.write(JSON.stringify({ v: 1, projects: out }));
'

# Signal update (jq). Input: the session's current signal text on stdin (raw,
# possibly empty or damaged). Args: $sid, $root, $ev, $ntype. Emits nothing for
# an event that changes nothing.
LB_SIGNAL_JQ='
(now * 1000 | floor) as $now
| (try fromjson catch null) as $d
| (if ($d | type) == "object" then $d else {} end) as $o
| ($o.working | if type == "boolean" then . else false end) as $w
| ($o.subagents | if type == "number" and . > 0 then floor else 0 end) as $n
| ($o.waiting | if . == "permission" or . == "idle" then . else null end) as $wait
| if $ev == "UserPromptSubmit" then [true, $n, null]
  elif $ev == "SubagentStart" then [true, $n + 1, $wait]
  elif $ev == "SubagentStop" then [$w, (if $n > 0 then $n - 1 else 0 end), $wait]
  elif $ev == "Stop" then [false, $n, $wait]
  elif $ev == "Notification" and $ntype == "permission_prompt" then [$w, $n, "permission"]
  elif $ev == "Notification" and $ntype == "idle_prompt" then [$w, $n, "idle"]
  else empty end
| {v: 1, sid: $sid, root: $root, t: $now, working: .[0], subagents: .[1], waiting: .[2]}
'

# Signal update (node fallback). Same logic as LB_SIGNAL_JQ; the file and
# fields arrive in LB_FILE, LB_SID, LB_ROOT, LB_EV and LB_NTYPE.
LB_SIGNAL_NODE='
const fs = require("fs");
const ev = process.env.LB_EV, ntype = process.env.LB_NTYPE;
let o = null;
try { o = JSON.parse(fs.readFileSync(process.env.LB_FILE, "utf8")); } catch (e) {}
if (!o || typeof o !== "object" || Array.isArray(o)) o = {};
const w = typeof o.working === "boolean" ? o.working : false;
const n = (typeof o.subagents === "number" && o.subagents > 0) ? Math.floor(o.subagents) : 0;
const wait = (o.waiting === "permission" || o.waiting === "idle") ? o.waiting : null;
let next = null;
if (ev === "UserPromptSubmit") next = [true, n, null];
else if (ev === "SubagentStart") next = [true, n + 1, wait];
else if (ev === "SubagentStop") next = [w, n > 0 ? n - 1 : 0, wait];
else if (ev === "Stop") next = [false, n, wait];
else if (ev === "Notification" && ntype === "permission_prompt") next = [w, n, "permission"];
else if (ev === "Notification" && ntype === "idle_prompt") next = [w, n, "idle"];
if (next) process.stdout.write(JSON.stringify({ v: 1, sid: process.env.LB_SID, root: process.env.LB_ROOT,
  t: Date.now(), working: next[0], subagents: next[1], waiting: next[2] }));
'

# The envelope fields, joined by 0x1f.
lb_fields() {
  if [ "$LB_ENGINE" = jq ]; then
    local cursor=false
    [ "$LB_CURSOR" = 1 ] && cursor=true
    printf '%s' "$INPUT" | jq -jrs --argjson cursor "$cursor" "$LB_FIELDS_JQ" 2>/dev/null
  else
    printf '%s' "$INPUT" | LB_CURSOR="$LB_CURSOR" node -e "$LB_FIELDS_NODE" 2>/dev/null
  fi
}

# The new projects.json text. Args: the file, the root, the name.
lb_registry() {
  local src=/dev/null alive="" r
  [ -f "$1" ] && src=$1
  if [ "$LB_ENGINE" = jq ]; then
    while IFS= read -r r; do
      [ -n "$r" ] && [ -d "$r" ] && alive="$alive$r
"
    done <<EOF
$(jq -Rrs "$LB_ROOTS_JQ" < "$src" 2>/dev/null)
EOF
    jq -Rsc --arg root "$2" --arg name "$3" --arg alive "$alive" "$LB_REGISTRY_JQ" < "$src" 2>/dev/null
  else
    LB_FILE="$src" LB_ROOT="$2" LB_NAME="$3" node -e "$LB_REGISTRY_NODE" 2>/dev/null
  fi
}

# The session's new signal text, or nothing. Args: the file, sid, root, event,
# notification type.
lb_signal() {
  local src=/dev/null
  [ -f "$1" ] && src=$1
  if [ "$LB_ENGINE" = jq ]; then
    jq -Rsc --arg sid "$2" --arg root "$3" --arg ev "$4" --arg ntype "$5" "$LB_SIGNAL_JQ" < "$src" 2>/dev/null
  else
    LB_FILE="$src" LB_SID="$2" LB_ROOT="$3" LB_EV="$4" LB_NTYPE="$5" node -e "$LB_SIGNAL_NODE" 2>/dev/null
  fi
}

FIELDS=$(lb_fields)
[ -n "$FIELDS" ] || exit 0
EV="" SID="" NTYPE="" CWD=""
IFS=$'\037' read -r EV SID NTYPE CWD <<EOF
$FIELDS
EOF

case "$EV" in
  SessionStart) ACTION=register ;;
  UserPromptSubmit | SubagentStart | SubagentStop | Stop) ACTION=signal ;;
  Notification)
    case "$NTYPE" in
      permission_prompt | idle_prompt) ACTION=signal ;;
      *) exit 0 ;;
    esac
    ;;
  *) exit 0 ;;
esac

# A signal file is named by its session id, so only a plain id is accepted.
if [ "$ACTION" = signal ]; then
  case "$SID" in
    '' | [!A-Za-z0-9]* | *[!A-Za-z0-9._-]*) exit 0 ;;
  esac
  [ "${#SID}" -le 128 ] || exit 0
fi

[ -n "$CWD" ] || exit 0
ROOT=$(lobby_root "$CWD") || exit 0
case "$ROOT" in
  '' | *$'\n'*) exit 0 ;;
esac
lobby_is_project "$ROOT" || exit 0

LOBBY_HOME=$(lobby_home)
mkdir -p "$LOBBY_HOME/signals" || exit 0

if [ "$ACTION" = register ]; then
  # Crash leftovers: signals a week stale, temp files an hour old.
  find "$LOBBY_HOME/signals" -maxdepth 1 -type f -name '*.json' -mtime +7 -delete
  find "$LOBBY_HOME" "$LOBBY_HOME/signals" -maxdepth 1 -type f -name '.tmp.*' -mmin +60 -delete
  lobby_lock "$LOBBY_HOME" || exit 0
  FILE="$LOBBY_HOME/projects.json"
  OUT=$(lb_registry "$FILE" "$ROOT" "${ROOT##*/}")
else
  lobby_lock "$LOBBY_HOME" || exit 0
  FILE="$LOBBY_HOME/signals/$SID.json"
  OUT=$(lb_signal "$FILE" "$SID" "$ROOT" "$EV" "$NTYPE")
fi

[ -n "$OUT" ] && lobby_write "$FILE" "$OUT"
exit 0
