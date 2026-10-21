# hooks/kitchen-log.sh
# Append privacy-limited agent, skill and session events to the local kitchen activity feed.
#!/usr/bin/env bash
#
# Hook contract: reads the hook JSON envelope on stdin. Runs synchronously
# on SessionStart, SubagentStart, SubagentStop, PreToolUse (Agent, Skill),
# PostToolUse (Agent), UserPromptExpansion, and Stop, completing the local
# append before return. Always exits 0 and prints nothing.
#
# Row shape (fields an event does not carry are omitted, never null-padded):
#   {"t":<epoch ms>,"sid":"..","ev":"..","agent":"..","aid":"..","label":"..",
#    "skill":"..","tok":<int>,"ms":<int>,"ok":<bool>,"pie":<int>,"slice":"N.M",
#    "src":".."}
# `src` (the command source) appears on UserPromptExpansion rows only.
#
# Privacy: rows are built from an allowlist of fields. The dispatch prompt,
# last_assistant_message, tool output, file contents, skill or command args,
# and env values are never copied into a row. `label` is the Agent dispatch
# description only, newlines stripped, capped at 120 characters.
#
# Attribution (`pie` / `slice`), first match wins:
#   1. a label starting `P<pie> S<slice>` (the dispatch label convention)
#   2. for an unlabeled row, the most recent labeled row of the same session
#      (same `sid`) in activity.jsonl or activity.1.jsonl: on SubagentStart or
#      SubagentStop the labeled row with the same `aid` first, then the latest
#      labeled row for the same agent type, then the latest labeled row at all.
#      A dispatch's own subagent rows stay on the pie and slice its label
#      named, even when the hook cwd sits in another worktree.
#   3. the branch name (hook cwd, else the project root) matching pie-N or
#      pie/N; the slice is then the first open `### Slice` under `## Pie N`
#   4. the first open `### Slice` under the first open `## Pie` in
#      docs/plans/00_master_checklist.md
#
# JSON engine: jq, else a `node -e` script, else exit 0 silently.
# The log rotates to activity.1.jsonl once it passes 2 MB (one rotation kept).

set -u

[ "${BTS_HOOKS_DISABLED:-0}" = "1" ] && exit 0

# Even filesystem or parser failures must remain invisible to the session.
exec >/dev/null 2>&1

SELF_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=./lib/checklist.sh
. "$SELF_DIR/lib/checklist.sh"

if command -v jq >/dev/null 2>&1; then
  KL_ENGINE=jq
elif command -v node >/dev/null 2>&1; then
  KL_ENGINE=node
else
  exit 0
fi

INPUT="$(cat 2>/dev/null || true)"
[ -n "$INPUT" ] || exit 0

KL_MAX_BYTES=2097152
KL_LABEL_MAX=120

# Row builder (jq). Inputs: the envelope on stdin, $fpie / $fslice (branch or
# checklist attribution, empty when unresolved). Emits nothing for an event
# or tool this hook is not wired for, or for unparseable input.
KL_JQ='
def str: if type == "string" and length > 0 then . else null end;
def int: if type == "number" then floor else null end;
def oneline: gsub("[\\r\\n\\t]+"; " ") | sub("^ +"; "") | sub(" +$"; "");
select(length == 1 and (.[0] | type) == "object") | .[0]
| (.hook_event_name // "") as $ev
| (.tool_name // "") as $tool
| (if (.tool_input | type) == "object" then .tool_input else {} end) as $tin
| (if (.tool_response | type) == "object" then .tool_response else {} end) as $out
| ($tool == "Agent") as $dispatch
| (($ev == "PreToolUse" or $ev == "PostToolUse") and $dispatch) as $agentcall
| ($ev == "SubagentStart" or $ev == "SubagentStop") as $sub
| select($ev == "SessionStart" or $ev == "Stop" or $ev == "UserPromptExpansion"
    or $sub or $agentcall or ($ev == "PreToolUse" and $tool == "Skill"))
| (if $agentcall then ($tin.description | str | if . then oneline | .[0:$max] else null end) else null end) as $lbl0
| (if $lbl0 == "" then null else $lbl0 end) as $lbl
| ([($lbl // "") | capture("^P(?<p>[0-9]+) S(?<s>[0-9]+\\.[0-9]+)")] | first) as $cap
| {
    t: (now * 1000 | floor),
    sid: (.session_id | str),
    ev: $ev,
    agent: (if $sub then (.agent_type | str) elif $agentcall then ($tin.subagent_type | str) else null end),
    aid: (if $sub then (.agent_id | str) elif ($agentcall and $ev == "PostToolUse") then ($out.agentId | str) else null end),
    "label": $lbl,
    skill: (if $ev == "UserPromptExpansion" then (.command_name | str)
            elif $tool == "Skill" then ($tin.skill | str) else null end),
    tok: (if ($agentcall and $ev == "PostToolUse") then ($out.totalTokens | int) else null end),
    ms: (if ($agentcall and $ev == "PostToolUse") then ($out.totalDurationMs | int) else null end),
    ok: (if ($agentcall and $ev == "PostToolUse") then
           ($out.status | if . == "completed" then true
                          elif . == "async_launched" then null
                          elif type == "string" and length > 0 then false
                          else null end)
         else null end),
    pie: (if $cap then ($cap.p | tonumber) elif $fpie != "" then ($fpie | tonumber) else null end),
    slice: (if $cap then $cap.s elif $fslice != "" then $fslice else null end),
    src: (if $ev == "UserPromptExpansion" then (.command_source | str) else null end)
  }
| with_entries(select(.value != null))
'

# Row builder (node fallback). Same logic as KL_JQ; attribution arrives in
# KL_PIE / KL_SLICE, the label cap in KL_LABEL_MAX.
KL_NODE='
let d = "";
process.stdin.on("data", (c) => { d += c; }).on("end", () => {
  let j;
  try { j = JSON.parse(d); } catch (e) { return; }
  if (!j || typeof j !== "object" || Array.isArray(j)) return;
  const str = (v) => (typeof v === "string" && v.length > 0) ? v : null;
  const int = (v) => (typeof v === "number" && isFinite(v)) ? Math.floor(v) : null;
  const obj = (v) => (v && typeof v === "object" && !Array.isArray(v)) ? v : {};
  const ev = typeof j.hook_event_name === "string" ? j.hook_event_name : "";
  const tool = typeof j.tool_name === "string" ? j.tool_name : "";
  const inp = obj(j.tool_input), out = obj(j.tool_response);
  const agentcall = (ev === "PreToolUse" || ev === "PostToolUse") && tool === "Agent";
  const sub = ev === "SubagentStart" || ev === "SubagentStop";
  const post = agentcall && ev === "PostToolUse";
  if (!(ev === "SessionStart" || ev === "Stop" || ev === "UserPromptExpansion" || sub || agentcall ||
        (ev === "PreToolUse" && tool === "Skill"))) return;
  let label = null;
  if (agentcall) {
    const raw = str(inp.description);
    if (raw !== null) {
      const one = raw.replace(/[\r\n\t]+/g, " ").replace(/^ +/, "").replace(/ +$/, "");
      label = Array.from(one).slice(0, Number(process.env.KL_LABEL_MAX || 120)).join("") || null;
    }
  }
  const cap = label ? /^P([0-9]+) S([0-9]+\.[0-9]+)/.exec(label) : null;
  const fpie = process.env.KL_PIE || "", fslice = process.env.KL_SLICE || "";
  let ok = null;
  if (post) {
    const s = out.status;
    if (s === "completed") ok = true;
    else if (s === "async_launched") ok = null;
    else if (typeof s === "string" && s.length > 0) ok = false;
  }
  const row = {
    t: Date.now(),
    sid: str(j.session_id),
    ev: ev,
    agent: sub ? str(j.agent_type) : (agentcall ? str(inp.subagent_type) : null),
    aid: sub ? str(j.agent_id) : (post ? str(out.agentId) : null),
    label: label,
    skill: ev === "UserPromptExpansion" ? str(j.command_name) : (tool === "Skill" ? str(inp.skill) : null),
    tok: post ? int(out.totalTokens) : null,
    ms: post ? int(out.totalDurationMs) : null,
    ok: ok,
    pie: cap ? Number(cap[1]) : (fpie !== "" ? Number(fpie) : null),
    slice: cap ? cap[2] : (fslice !== "" ? fslice : null),
    src: ev === "UserPromptExpansion" ? str(j.command_source) : null,
  };
  for (const k of Object.keys(row)) if (row[k] === null) delete row[k];
  process.stdout.write(JSON.stringify(row));
});
'

# The hook's working directory from the envelope (empty if absent).
kl_cwd() {
  if [ "$KL_ENGINE" = jq ]; then
    printf '%s' "$INPUT" | jq -sr 'select(length == 1 and (.[0] | type) == "object") | .[0].cwd | select(type == "string")' 2>/dev/null
  else
    printf '%s' "$INPUT" | node -e '
      let d = ""; process.stdin.on("data", (c) => { d += c; }).on("end", () => {
        try { const j = JSON.parse(d); if (j && typeof j.cwd === "string") process.stdout.write(j.cwd); } catch (e) {}
      });' 2>/dev/null
  fi
}

# Branch and checklist attribution. Prints "<pie> <slice>" (slice may be
# empty) or nothing when neither the branch nor the checklist resolves a pie.
# Arg: directory whose branch is read.
kl_fallback_attr() {
  local branch pie="" checklist
  branch=$(bts_branch "$1")
  if [[ $branch =~ (^|/)pie[-/]([0-9]+)([^0-9]|$) ]]; then
    pie=${BASH_REMATCH[2]}
  fi
  checklist=$(bts_checklist_path)
  if [ -z "$checklist" ]; then
    [ -n "$pie" ] && printf '%s \n' "$pie"
    return
  fi
  # Open = no done marker on the heading line ([x], strikethrough, or
  # Status: Completed/Done), the same rule bts_unit_counts uses.
  awk -v want="$pie" '
    function is_done(s) { return (s ~ /\[[xX]\]/ || s ~ /~~/ || s ~ /[Ss]tatus:[[:space:]]*(Completed|Done)/) }
    BEGIN { cur = ""; target = want; slice = "" }
    /^## / {
      if (cur != "" && cur == target) exit
      cur = ""
      if ($0 ~ /^## +Pie[[:space:]]+[0-9]/) {
        n = $0
        sub(/^## +Pie[[:space:]]+/, "", n)
        sub(/[^0-9].*$/, "", n)
        if (target == "" && !is_done($0)) target = n
        cur = n
      }
      next
    }
    /^### +Slice[[:space:]]+[0-9]+\.[0-9]/ {
      if (cur != "" && cur == target && !is_done($0)) {
        s = $0
        sub(/^### +Slice[[:space:]]+/, "", s)
        sub(/[^0-9.].*$/, "", s)
        sub(/\.$/, "", s)
        slice = s
        exit
      }
    }
    END { if (target != "") printf "%s %s\n", target, slice }
  ' "$checklist" 2>/dev/null
}

# Session inheritance (jq). Inputs: candidate log lines on stdin (only lines
# holding a `P<pie> S<slice>` label reach it), $row (the unlabeled row).
# Prints "<pie> <slice>" from the best labeled row of the same session, or
# nothing. A torn or foreign line is skipped, never fatal.
KL_INHERIT_JQ='
($row.sid // "") as $sid
| ($row.aid // "") as $aid
| ($row.agent // "") as $agent
| [inputs | (fromjson? // empty) | select(type == "object")
    | select($sid != "" and .sid == $sid and (.pie | type) == "number"
             and (.label | type) == "string" and (.label | test("^P[0-9]+ S[0-9]+\\.[0-9]+")))] as $c
| (($row.ev == "SubagentStart" or $row.ev == "SubagentStop") and $aid != "") as $sub
| ((if $sub then ([$c[] | select(.aid == $aid)] | last) else null end)
   // (if $agent != "" then ([$c[] | select(.agent == $agent)] | last) else null end)
   // ($c | last)) as $hit
| if $hit then "\($hit.pie) \($hit.slice // "")" else empty end
'

# Session inheritance (node fallback). Same logic as KL_INHERIT_JQ; the row
# arrives in KL_ROW, the log files as arguments, oldest first.
KL_INHERIT_NODE='
const fs = require("fs");
let row;
try { row = JSON.parse(process.env.KL_ROW || ""); } catch (e) { process.exit(0); }
const sid = typeof row.sid === "string" ? row.sid : "";
if (sid === "") process.exit(0);
const aid = typeof row.aid === "string" ? row.aid : "";
const agent = typeof row.agent === "string" ? row.agent : "";
const labeled = /"label":"P[0-9]+ S[0-9]+\.[0-9]+/;
const cap = /^P[0-9]+ S[0-9]+\.[0-9]+/;
const rows = [];
for (const file of process.argv.slice(1)) {
  let text = "";
  try { text = fs.readFileSync(file, "utf8"); } catch (e) { continue; }
  for (const line of text.split("\n")) {
    if (!labeled.test(line)) continue;
    let r;
    try { r = JSON.parse(line); } catch (e) { continue; }
    if (!r || typeof r !== "object" || r.sid !== sid || typeof r.pie !== "number") continue;
    if (typeof r.label !== "string" || !cap.test(r.label)) continue;
    rows.push(r);
  }
}
const last = (pick) => { for (let i = rows.length - 1; i >= 0; i--) if (pick(rows[i])) return rows[i]; return null; };
const sub = (row.ev === "SubagentStart" || row.ev === "SubagentStop") && aid !== "";
const hit = (sub ? last((r) => r.aid === aid) : null) ||
  (agent !== "" ? last((r) => r.agent === agent) : null) || last(() => true);
if (hit) process.stdout.write(hit.pie + " " + (typeof hit.slice === "string" ? hit.slice : ""));
'

# Builds the row. Args: fallback pie and slice (empty when unresolved).
kl_build() {
  if [ "$KL_ENGINE" = jq ]; then
    printf '%s' "$INPUT" | jq -cs --arg fpie "$1" --arg fslice "$2" \
      --argjson max "$KL_LABEL_MAX" "$KL_JQ" 2>/dev/null
  else
    printf '%s' "$INPUT" | KL_PIE="$1" KL_SLICE="$2" KL_LABEL_MAX="$KL_LABEL_MAX" \
      node -e "$KL_NODE" 2>/dev/null
  fi
}

# Attribution an unlabeled row inherits from its own session's labeled rows.
# Prints "<pie> <slice>" or nothing. Arg: the row as first built. Reads the
# log without the lock: a line torn by a concurrent writer is skipped.
kl_inherit_attr() {
  local dir files=()
  dir="$(bts_root)/.claude/.bytheslice-state/kitchen"
  [ -f "$dir/activity.1.jsonl" ] && files+=("$dir/activity.1.jsonl")
  [ -f "$dir/activity.jsonl" ] && files+=("$dir/activity.jsonl")
  [ "${#files[@]}" -gt 0 ] || return 0
  if [ "$KL_ENGINE" = jq ]; then
    grep -hE '"label":"P[0-9]+ S[0-9]+\.[0-9]+' "${files[@]}" 2>/dev/null |
      jq -nrR --argjson row "$1" "$KL_INHERIT_JQ" 2>/dev/null
  else
    KL_ROW="$1" node -e "$KL_INHERIT_NODE" "${files[@]}" 2>/dev/null
  fi
}

CWD=$(kl_cwd)
[ -n "$CWD" ] && [ -d "$CWD" ] && git -C "$CWD" rev-parse --git-dir >/dev/null 2>&1 || CWD=$(bts_root)

# A labeled row is attributed by its label alone. Any other row inherits its
# session's labeled attribution, else the branch and checklist decide, and is
# then built again with that attribution so the field order stays canonical.
ROW=$(kl_build "" "")
[ -n "$ROW" ] || exit 0
case "$ROW" in
  *'"pie":'*) ;;
  *)
    ATTR=$(kl_inherit_attr "$ROW")
    [ -n "$ATTR" ] || ATTR=$(kl_fallback_attr "$CWD")
    FPIE="" FSLICE=""
    read -r FPIE FSLICE <<EOF
$ATTR
EOF
    if [ -n "$FPIE" ]; then
      ROW=$(kl_build "$FPIE" "$FSLICE")
      [ -n "$ROW" ] || exit 0
    fi
    ;;
esac

LOG_DIR="$(bts_state_dir)/kitchen"
mkdir -p "$LOG_DIR" 2>/dev/null || exit 0
LOG="$LOG_DIR/activity.jsonl"

# Publish an initialized owner directory atomically. A dead owner can be
# replaced by renaming its exact marker; only that winner unlinks the lock.
# The symlink targets a file, so ln cannot follow it into an existing directory.
# Reclaimers publish their own PID before unlinking, so concurrent recovery
# cannot remove a healthy writer's lock. A killed reclaimer is recoverable too.
LOCK="$LOG_DIR/.activity.lock"
CLAIM=$(mktemp -d "$LOG_DIR/.activity.XXXXXXXX") || exit 0
: > "$CLAIM/owner.$$" || { rmdir "$CLAIM"; exit 0; }
kl_unlock() {
  # ln publishes before the shell resumes; a signal can arrive in that gap.
  if [ "$(readlink "$LOCK" 2>/dev/null)" = "$CLAIM/owner.$$" ]; then
    rm "$LOCK" 2>/dev/null
  fi
  rm "$CLAIM/owner.$$" 2>/dev/null
  rmdir "$CLAIM" 2>/dev/null
  return 0
}
trap kl_unlock EXIT
trap 'exit 0' INT TERM
TRIES=0
until ln -s "$CLAIM/owner.$$" "$LOCK" 2>/dev/null; do
  TARGET=$(readlink "$LOCK" 2>/dev/null || true)
  STALE=${TARGET%/*}
  if [ -n "$TARGET" ] && [ -d "$STALE" ]; then
    for OWNER in "$STALE"/owner.*; do
      PID=${OWNER##*.}
      case "$PID" in ''|*[!0-9]*) continue ;; esac
      if ! kill -0 "$PID" 2>/dev/null &&
          mv "$OWNER" "$STALE/owner.$$" 2>/dev/null; then
        if [ "$(readlink "$LOCK" 2>/dev/null)" = "$TARGET" ]; then
          rm "$LOCK" 2>/dev/null
        fi
        rm "$STALE/owner.$$" 2>/dev/null
        rmdir "$STALE" 2>/dev/null
        break
      fi
    done
  fi
  TRIES=$((TRIES + 1))
  [ "$TRIES" -lt 100 ] || exit 0
  sleep 0.02
done

if [ -f "$LOG" ]; then
  SIZE=$(wc -c < "$LOG" 2>/dev/null | tr -d '[:space:]')
  if [ "${SIZE:-0}" -gt "$KL_MAX_BYTES" ] 2>/dev/null; then
    mv -f "$LOG" "$LOG_DIR/activity.1.jsonl" 2>/dev/null || exit 0
  fi
fi

printf '%s\n' "$ROW" >> "$LOG" 2>/dev/null || true
exit 0
