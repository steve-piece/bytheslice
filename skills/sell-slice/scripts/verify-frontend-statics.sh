#!/usr/bin/env bash
# skills/sell-slice/scripts/verify-frontend-statics.sh
# Deterministic static gate for the frontend surface of one slice.
#
# Invoked by slice-verifier as a SUB-CHECK of its existing `design_system`
# check key (never as a new atomic check key, so verify-once / C5 holds):
#
#   bash "<plugin-root>/skills/sell-slice/scripts/verify-frontend-statics.sh" --base <sha>
#
# Why this exists: slice-verifier's design-system grep hunts raw VALUES (hex,
# rgb(, hsl(, raw px). It never checks that a token REFERENCE resolves. So
# `bg-[var(--brand-primary-500)]` against a design system that only defines
# `--primary` contains no hex, no rgb, no raw px: it passes the design-system
# gate clean, compiles under Tailwind, passes lint/typecheck/build, and renders
# unstyled. A prompt instruction is sampled and competes for attention; a grep
# has compliance 1.0 and is independent of the agent that could fail it.
#
# Offender classes:
#   E1 UNKNOWN_TOKEN   var(--x) whose name is in no resolvable catalog
#   E2 VAR_FALLBACK    var(--x, ...), banned outright, see below
#   E3 UNKNOWN_MOTION  duration/easing literal absent from the motion catalog
#   E4 IMG_NO_ALT      <img> with no alt= (explicit alt="" passes)
#   E5 INPUT_NO_LABEL  input/select/textarea with no bound label or aria name
#
# E2 is banned outright rather than resolved: the fallback renders a plausible
# value and makes a fabricated token invisible. Today's hex grep catches
# `var(--x, #333)` incidentally but not `var(--fake, var(--real))`.
#
# SCOPE NOTE, deliberate: E1 checks `var(--x)` references only, not bare
# utility class names. A catalog-membership test over utilities cannot separate
# a Tailwind built-in (`bg-slate-500`, `text-sm`, `border-2`) from a fabricated
# token without embedding Tailwind's entire palette and scale set, which is a
# permanent drift surface. Raw utilities are already slice-verifier's existing
# raw-value grep. See the README block in slice-verifier.md §4.
#
# Contract: no network, no installs, deterministic, stdout is the entire
# product. Exit 0 clean, 1 with offenders, 2 on unresolvable inputs.

set -u

SELF="verify-frontend-statics.sh"

BASE=""
ROOT=""
DS_PATH=""
SELF_TEST=0

usage() {
  cat <<USAGE
usage: $SELF --base <sha> [--root <dir>] [--design-system <path>]
       $SELF --self-test

  --base <sha>            base commit; the diff is <sha>...HEAD (required)
  --root <dir>            project root (default: git rev-parse --show-toplevel)
  --design-system <path>  design system doc (default: <root>/docs/design-system.md)
  --self-test             run the built-in fixtures and exit
USAGE
}

while [ $# -gt 0 ]; do
  case "$1" in
    --base) BASE="${2:-}"; shift 2 ;;
    --root) ROOT="${2:-}"; shift 2 ;;
    --design-system) DS_PATH="${2:-}"; shift 2 ;;
    --self-test) SELF_TEST=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) printf '%s: unknown argument: %s\n' "$SELF" "$1" >&2; usage >&2; exit 2 ;;
  esac
done

####################################################################
# Catalog resolution
####################################################################

# Every `--token-name` appearing in a markdown table row of the design system.
# Slightly wider than the "| Token | Light | Dark |" tables alone, which is the
# safe direction: a superset of real tokens can only remove false positives.
tokens_from_design_system() {
  ds="$1"
  [ -f "$ds" ] || return 0
  grep '^[[:space:]]*|' "$ds" 2>/dev/null \
    | grep -o -- '--[A-Za-z0-9_-]\{1,\}' \
    | sort -u
}

# Every custom property DECLARED (`--x:`) in the project's CSS. Declarations,
# not references, so a token this slice legitimately adds is in the catalog.
tokens_from_css() {
  root="$1"
  for f in \
    "$root/app/globals.css" \
    "$root/src/app/globals.css" \
    "$root/styles/globals.css" \
    "$root/src/styles/globals.css" \
    "$root/app/global.css" \
    "$root/src/index.css"
  do
    [ -f "$f" ] && grep -o -- '--[A-Za-z0-9_-]\{1,\}[[:space:]]*:' "$f" 2>/dev/null \
      | sed 's/[[:space:]]*:$//'
  done
  # Any other stylesheet that declares a :root / .dark / @theme block.
  find "$root" -type f -name '*.css' \
       -not -path '*/node_modules/*' -not -path '*/.git/*' \
       -not -path '*/dist/*' -not -path '*/build/*' -not -path '*/.next/*' \
       2>/dev/null \
    | while IFS= read -r f; do
        if grep -q -e ':root' -e '\.dark' -e '@theme' "$f" 2>/dev/null; then
          grep -o -- '--[A-Za-z0-9_-]\{1,\}[[:space:]]*:' "$f" 2>/dev/null \
            | sed 's/[[:space:]]*:$//'
        fi
      done
}

# Token names referenced by a tailwind config's theme bindings.
tokens_from_tailwind() {
  root="$1"
  for f in \
    "$root/tailwind.config.ts" \
    "$root/tailwind.config.js" \
    "$root/tailwind.config.mjs" \
    "$root/tailwind.config.cjs"
  do
    [ -f "$f" ] && grep -o -- '--[A-Za-z0-9_-]\{1,\}' "$f" 2>/dev/null
  done
}

# Motion catalog: the Value column of the Duration Scale and Easing Curves
# tables. `TBD` placeholders resolve to nothing, which is how an unconfigured
# design system correctly yields an empty catalog rather than a flood.
motion_from_design_system() {
  ds="$1"
  [ -f "$ds" ] || return 0
  awk '
    /^###[[:space:]]*(Duration Scale|Easing Curves)/ { inblock = 1; next }
    /^#/ { inblock = 0 }
    inblock && /^[[:space:]]*\|/ {
      n = split($0, cell, "|")
      if (n < 3) next
      v = cell[3]
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", v)
      gsub(/`/, "", v)
      if (v == "" || v == "Value" || v ~ /^-+$/) next
      if (v ~ /TBD/) next
      print v
    }
  ' "$ds" 2>/dev/null | sort -u
}

####################################################################
# Offender scanning
####################################################################

# Emits: <class>|<file>|<line>|<detail>
scan_file() {
  file="$1"; allowed_f="$2"; motion_f="$3"; have_motion="$4"

  # --- E1 / E2: var() references -------------------------------------------
  awk -v F="$file" -v ALLOWED="$allowed_f" '
    BEGIN {
      while ((getline t < ALLOWED) > 0) { if (t != "") ok[t] = 1 }
      close(ALLOWED)
    }
    {
      line = $0
      rest = line
      while (match(rest, /var\([[:space:]]*--[A-Za-z0-9_-]+/)) {
        frag = substr(rest, RSTART, RLENGTH)
        after = substr(rest, RSTART + RLENGTH)
        name = frag
        sub(/^var\([[:space:]]*/, "", name)
        # A comma before the closing paren means a fallback value.
        tail = after
        sub(/\).*$/, "", tail)
        if (tail ~ /^[[:space:]]*,/) {
          printf "E2|%s|%d|%s has a fallback; the fallback hides a fabricated token\n", F, NR, name
        } else if (!(name in ok)) {
          printf "E1|%s|%d|%s\n", F, NR, name
        }
        rest = after
      }
    }
  ' "$file"

  # --- E3: motion literals --------------------------------------------------
  if [ "$have_motion" -eq 1 ]; then
    awk -v F="$file" -v MOTION="$motion_f" '
      BEGIN {
        while ((getline t < MOTION) > 0) { if (t != "") ok[t] = 1 }
        close(MOTION)
      }
      {
        rest = $0
        while (match(rest, /(duration|ease)-\[[^]]+\]/)) {
          frag = substr(rest, RSTART, RLENGTH)
          rest = substr(rest, RSTART + RLENGTH)
          v = frag
          sub(/^(duration|ease)-\[/, "", v)
          sub(/\]$/, "", v)
          if (!(v in ok)) printf "E3|%s|%d|%s\n", F, NR, v
        }
      }
      /(transition-duration|animation-duration|transition-timing-function|animation-timing-function)[[:space:]]*:/ {
        v = $0
        sub(/^[^:]*:[[:space:]]*/, "", v)
        sub(/[;].*$/, "", v)
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", v)
        if (v != "" && v !~ /var\(/ && !(v in ok)) printf "E3|%s|%d|%s\n", F, NR, v
      }
    ' "$file"
  fi

  # --- E4 / E5: two a11y source patterns -----------------------------------
  # Kept to exactly these two. The rendered pass empirically catches focus
  # suppression and Tab-unreachability but NOT a missing accessible name on an
  # image, and these cost two regexes in a script that is already running.
  case "$file" in
    *.tsx|*.jsx)
      # Collect ids that a label in this file points at.
      labelled=$(grep -o 'htmlFor=["'"'"'][^"'"'"']*["'"'"']' "$file" 2>/dev/null \
        | sed -e 's/^htmlFor=.//' -e 's/.$//' | sort -u | tr '\n' ' ')
      awk -v F="$file" -v LABELLED=" $labelled " '
        function flush_tag(   name, id) {
          if (tag == "") return
          if (kind == "img") {
            if (tag !~ /[[:space:]]alt[[:space:]]*=/) printf "E4|%s|%d|<img> with no alt= (use alt=\"\" to declare it decorative)\n", F, start
          } else {
            if (tag ~ /aria-label[[:space:]]*=/ || tag ~ /aria-labelledby[[:space:]]*=/) { tag=""; return }
            id = ""
            if (match(tag, /[[:space:]]id[[:space:]]*=[[:space:]]*["'"'"'][^"'"'"']*["'"'"']/)) {
              id = substr(tag, RSTART, RLENGTH)
              sub(/^.*=[[:space:]]*./, "", id)
              sub(/.$/, "", id)
            }
            if (id != "" && index(LABELLED, " " id " ") > 0) { tag=""; return }
            printf "E5|%s|%d|<%s> with no bound <label htmlFor>, aria-label, or aria-labelledby\n", F, start, kind
          }
          tag = ""
        }
        {
          line = $0
          if (tag != "") {
            tag = tag " " line
            if (index(line, ">") > 0) flush_tag()
            next
          }
          if (match(line, /<(img|input|select|textarea)([[:space:]>\/]|$)/)) {
            frag = substr(line, RSTART)
            kind = frag
            sub(/^</, "", kind)
            sub(/[[:space:]>\/].*$/, "", kind)
            start = NR
            tag = frag
            if (index(frag, ">") > 0) flush_tag()
          }
        }
        END { flush_tag() }
      ' "$file"
      ;;
  esac
}

# Nearest catalog entry by Levenshtein distance, for the E1 report line.
nearest_token() {
  needle="$1"; allowed_f="$2"
  awk -v N="$needle" '
    function lev(a, b,   la, lb, i, j, cost, prev, cur, tmp) {
      la = length(a); lb = length(b)
      if (la == 0) return lb
      if (lb == 0) return la
      for (j = 0; j <= lb; j++) prev[j] = j
      for (i = 1; i <= la; i++) {
        cur[0] = i
        for (j = 1; j <= lb; j++) {
          cost = (substr(a, i, 1) == substr(b, j, 1)) ? 0 : 1
          cur[j] = prev[j] + 1
          if (cur[j-1] + 1 < cur[j]) cur[j] = cur[j-1] + 1
          if (prev[j-1] + cost < cur[j]) cur[j] = prev[j-1] + cost
        }
        for (j = 0; j <= lb; j++) prev[j] = cur[j]
      }
      return prev[lb]
    }
    { d = lev(N, $0); if (best == "" || d < bestd) { bestd = d; best = $0 } }
    END { if (best != "") print best }
  ' "$allowed_f"
}

####################################################################
# Self-test
####################################################################

run_self_test() {
  tmp=$(mktemp -d) || { echo "$SELF: mktemp failed" >&2; exit 2; }
  trap 'rm -rf "$tmp"' EXIT
  pass=0; fail=0

  printf -- '--primary\n--muted-foreground\n--border\n' > "$tmp/allowed"
  printf -- '150ms\ncubic-bezier(0.4, 0, 0.2, 1)\n' > "$tmp/motion"

  check() { # name expected_class fixture_body [ext]
    name="$1"; want="$2"; body="$3"; ext="${4:-tsx}"
    printf '%s\n' "$body" > "$tmp/f.$ext"
    got=$(scan_file "$tmp/f.$ext" "$tmp/allowed" "$tmp/motion" 1 | cut -d'|' -f1 | sort -u | tr '\n' ',' | sed 's/,$//')
    if [ "$got" = "$want" ]; then
      pass=$((pass + 1)); printf '  ok   %s\n' "$name"
    else
      fail=$((fail + 1)); printf '  FAIL %s (want "%s", got "%s")\n' "$name" "$want" "$got"
    fi
    rm -f "$tmp/f.$ext"
  }

  echo "## $SELF self-test"
  check "known token passes"          ""    '<div className="bg-[var(--primary)]" />'
  check "fabricated token is E1"      "E1"  '<div className="bg-[var(--brand-primary-500)]" />'
  check "var fallback is E2"          "E2"  '<div className="bg-[var(--primary,#333)]" />'
  check "fallback hides fake token"   "E2"  '<div className="bg-[var(--fake,var(--primary))]" />'
  check "known motion passes"         ""    '<div className="duration-[150ms]" />'
  check "unknown motion is E3"        "E3"  '<div className="duration-[275ms]" />'
  check "img with alt passes"         ""    '<img src="/a.png" alt="A" />'
  check "img with empty alt passes"   ""    '<img src="/a.png" alt="" />'
  check "img without alt is E4"       "E4"  '<img src="/a.png" />'
  check "multiline img without alt"   "E4"  '<img
  src="/a.png"
/>'
  check "input with aria-label ok"    ""    '<input type="text" aria-label="Name" />'
  check "input with bound label ok"   ""    '<label htmlFor="n">Name</label>
<input id="n" type="text" />'
  check "bare input is E5"            "E5"  '<input type="text" />'
  check "input with unbound id is E5" "E5"  '<label htmlFor="other">X</label>
<input id="n" type="text" />'
  check "textarea unlabelled is E5"   "E5"  '<textarea />'
  check "css declaration not a ref"   ""    ':root { --primary: #fff; }' "css"
  check "css unknown var is E1"       "E1"  '.x { color: var(--nope); }' "css"

  printf -- '--primary\n' > "$tmp/allowed"
  n=$(nearest_token "--primry" "$tmp/allowed")
  if [ "$n" = "--primary" ]; then
    pass=$((pass + 1)); printf '  ok   nearest_token suggests --primary\n'
  else
    fail=$((fail + 1)); printf '  FAIL nearest_token (got "%s")\n' "$n"
  fi

  printf '\n  %d passed / %d failed\n' "$pass" "$fail"
  [ "$fail" -eq 0 ] || return 1
  return 0
}

if [ "$SELF_TEST" -eq 1 ]; then
  run_self_test
  exit $?
fi

####################################################################
# Main
####################################################################

[ -n "$BASE" ] || { printf '%s: --base <sha> is required\n' "$SELF" >&2; usage >&2; exit 2; }

if [ -z "$ROOT" ]; then
  ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || {
    printf '%s: not a git repository and no --root given\n' "$SELF" >&2; exit 2; }
fi
[ -d "$ROOT" ] || { printf '%s: root not a directory: %s\n' "$SELF" "$ROOT" >&2; exit 2; }
[ -n "$DS_PATH" ] || DS_PATH="$ROOT/docs/design-system.md"

git -C "$ROOT" rev-parse --verify "$BASE" >/dev/null 2>&1 || {
  printf '%s: base sha not resolvable in %s: %s\n' "$SELF" "$ROOT" "$BASE" >&2; exit 2; }

WORK=$(mktemp -d) || { printf '%s: mktemp failed\n' "$SELF" >&2; exit 2; }
trap 'rm -rf "$WORK"' EXIT

{
  tokens_from_design_system "$DS_PATH"
  tokens_from_css "$ROOT"
  tokens_from_tailwind "$ROOT"
} 2>/dev/null | sed 's/[[:space:]]*$//' \
  | grep -E '^--[A-Za-z0-9]' \
  | sort -u > "$WORK/allowed"
# The `-E '^--[A-Za-z0-9]'` filter is load-bearing, not cosmetic: a markdown
# table separator row (`| --- | --- |`) otherwise reads as a token named
# `---`, which would make an empty catalog look populated and silently defeat
# the exit-2 guard below.

ALLOWED_N=$(wc -l < "$WORK/allowed" | tr -d ' ')
if [ "${ALLOWED_N:-0}" -eq 0 ]; then
  printf '%s: no token catalog resolvable (looked in %s, project CSS :root/.dark/@theme blocks, and tailwind.config.*)\n' \
    "$SELF" "$DS_PATH" >&2
  printf 'Refusing to report a clean pass against an empty allowlist.\n' >&2
  exit 2
fi

motion_from_design_system "$DS_PATH" > "$WORK/motion" 2>/dev/null || : > "$WORK/motion"
MOTION_N=$(wc -l < "$WORK/motion" | tr -d ' ')
HAVE_MOTION=0
[ "${MOTION_N:-0}" -gt 0 ] && HAVE_MOTION=1

git -C "$ROOT" diff --name-only "$BASE"...HEAD 2>/dev/null \
  | grep -E '\.(tsx|jsx|ts|css)$' \
  | sort -u > "$WORK/changed"

: > "$WORK/offenders"
FILES_N=0
while IFS= read -r rel; do
  [ -n "$rel" ] || continue
  abs="$ROOT/$rel"
  [ -f "$abs" ] || continue   # deleted in this slice
  FILES_N=$((FILES_N + 1))
  scan_file "$abs" "$WORK/allowed" "$WORK/motion" "$HAVE_MOTION" \
    | sed "s|$ROOT/||" >> "$WORK/offenders"
done < "$WORK/changed"

OFFENDERS_N=$(wc -l < "$WORK/offenders" | tr -d ' ')
OFFENDERS_N=${OFFENDERS_N:-0}

# Report in source order: file, then line, so the list reads like the diff.
sort -t'|' -k2,2 -k3,3n "$WORK/offenders" > "$WORK/offenders.sorted" 2>/dev/null \
  || cp "$WORK/offenders" "$WORK/offenders.sorted"

while IFS='|' read -r class file line detail; do
  [ -n "$class" ] || continue
  case "$class" in
    E1)
      near=$(nearest_token "$detail" "$WORK/allowed")
      printf '%s:%s: E1 UNKNOWN_TOKEN %s is in no token catalog (nearest: %s)\n' \
        "$file" "$line" "$detail" "${near:-none}"
      ;;
    E2) printf '%s:%s: E2 VAR_FALLBACK %s\n' "$file" "$line" "$detail" ;;
    E3) printf '%s:%s: E3 UNKNOWN_MOTION %s is not in the Duration Scale or Easing Curves\n' "$file" "$line" "$detail" ;;
    E4) printf '%s:%s: E4 IMG_NO_ALT %s\n' "$file" "$line" "$detail" ;;
    E5) printf '%s:%s: E5 INPUT_NO_LABEL %s\n' "$file" "$line" "$detail" ;;
  esac
done < "$WORK/offenders.sorted"

if [ "$HAVE_MOTION" -eq 0 ]; then
  printf 'note: motion catalog empty (no concrete Duration Scale / Easing Curves values), E3 skipped\n'
fi

printf '%s: %d offender(s) across %d changed frontend file(s); %d tokens in catalog\n' \
  "$SELF" "$OFFENDERS_N" "$FILES_N" "$ALLOWED_N"

[ "$OFFENDERS_N" -eq 0 ] || exit 1
exit 0
