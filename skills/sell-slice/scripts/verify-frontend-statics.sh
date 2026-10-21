#!/usr/bin/env bash
# skills/sell-slice/scripts/verify-frontend-statics.sh
# Deterministic frontend static check: token existence, var() fallbacks, motion literals, img alt and form-control labels.
#
# slice-verifier runs this as a sub-check of its existing design_system key
# (never a new check key), on a frontend slice, once per slice:
#
#   bash "${CLAUDE_PLUGIN_ROOT}/skills/sell-slice/scripts/verify-frontend-statics.sh" --base <sha>
#   bash "${CLAUDE_PLUGIN_ROOT}/skills/sell-slice/scripts/verify-frontend-statics.sh" --files <path>...
#
# Why: the design-system grep hunts raw values (hex, rgb(, raw px) and never
# checks that a token reference resolves. bg-[var(--brand-primary-500)] against
# a catalog holding only --primary has no raw value, passes lint, typecheck and
# build, and renders unstyled. This is a set difference against the project's
# own catalog, so it runs the same way every time.
#
# Usage:
#   verify-frontend-statics.sh (--base <sha> | --files <path>...) [--root <dir>]
#
# Exit: 0 clean | 1 offenders found | 2 inputs unresolvable
# Each finding is one stdout line:  <CLASS> <file>:<line> <detail>
# followed by one summary line. Findings are warnings for slice-verifier: they
# never fail the design_system check on their own.
#
# Classes:
#   E1 UNKNOWN_TOKEN   a var(--x), or a semantic color utility in a .tsx/.jsx
#                      file (bg-x, text-x, border-x, ring-x, ...), whose token
#                      is not in the catalog; detail names the nearest real token
#   E2 VAR_FALLBACK    any var(--x, ...): banned, the fallback hides a fake token
#   E3 UNKNOWN_MOTION  a duration or cubic-bezier()/steps() literal absent from
#                      the Duration Scale / Easing Curves of docs/design-system.md
#   E4 IMG_NO_ALT      <img> with no alt= (explicit alt="" passes as decorative)
#   E5 INPUT_NO_LABEL  <input>, <select>, <textarea> with no bound <label htmlFor>,
#                      wrapping <label>, aria-label or aria-labelledby
#
# Catalog (the allowed token set) is the union of: every --x in a table row of
# docs/design-system.md, every --x: declared in a project stylesheet that holds
# a :root, .dark or @theme block, and every --x named in tailwind.config.*.
# None of the three resolving is exit 2, never a silent pass.
#
# Deliberate limits, all erring toward silence:
#   - Runtime namespaces --tw-*, --radix-*, --cmdk-*, --spacing and Tailwind's
#     palette (--color-<hue>-<shade>) are allowed without a catalog entry.
#   - A custom property declared in the scanned file itself is allowed there.
#   - Semantic utilities are checked in .tsx/.jsx only; built-in palette
#     colors, numbers and Tailwind keywords (text-sm, border-2, shadow-md) pass.
#     A Tailwind v3 config that binds raw colors (brand: { 500: '#...' }) can
#     make its utilities read as unknown; treat such E1 lines as leads.
#   - E3 durations and easings are each skipped, with a note, when the design
#     system holds no concrete values for them.
#   - A tag with a {...spread} is skipped for E4 and E5: the props may carry it.
#
# No network, no installs, no node. Writes nothing outside a temp dir it removes.

set -u

SELF="verify-frontend-statics"
BASE=""
ROOT=""
FILES_MODE=0
FILES=()

usage() {
  printf 'usage: %s.sh (--base <sha> | --files <path>...) [--root <dir>]\n' "$SELF"
}

die2() {
  printf '%s: %s\n' "$SELF" "$1"
  exit 2
}

while [ $# -gt 0 ]; do
  case "$1" in
    --base) [ $# -ge 2 ] || die2 "--base needs a sha"; BASE="$2"; shift 2 ;;
    --root) [ $# -ge 2 ] || die2 "--root needs a directory"; ROOT="$2"; shift 2 ;;
    --files)
      FILES_MODE=1; shift
      while [ $# -gt 0 ]; do
        case "$1" in --base|--root|--files|-h|--help) break ;; esac
        FILES+=("$1"); shift
      done
      ;;
    -h|--help) usage; exit 0 ;;
    *) usage >&2; die2 "unknown argument: $1" ;;
  esac
done

if [ -n "$BASE" ] && [ "$FILES_MODE" -eq 1 ]; then die2 "pass --base or --files, not both"; fi
if [ -z "$BASE" ] && [ "$FILES_MODE" -eq 0 ]; then usage >&2; die2 "one of --base or --files is required"; fi

if [ -z "$ROOT" ]; then
  ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || ROOT=$(pwd)
fi
[ -d "$ROOT" ] || die2 "root is not a directory: $ROOT"
ROOT=$(cd "$ROOT" && pwd)
DS="$ROOT/docs/design-system.md"

WORK=$(mktemp -d 2>/dev/null) || die2 "mktemp failed"
trap 'rm -rf "$WORK"' EXIT

#####################################################################
# Catalog
#####################################################################

{
  # Design system: every --x in a markdown table row.
  if [ -f "$DS" ]; then
    grep '^[[:space:]]*|' "$DS" 2>/dev/null | grep -o -- '--[A-Za-z0-9_-]\{1,\}'
  fi
  # Stylesheets holding a :root, .dark or @theme block: every declared --x.
  find "$ROOT" -type f -name '*.css' \
    -not -path '*/node_modules/*' -not -path '*/.git/*' -not -path '*/.next/*' \
    -not -path '*/dist/*' -not -path '*/build/*' -not -path '*/out/*' 2>/dev/null \
    | while IFS= read -r css; do
        if grep -q -e ':root' -e '\.dark' -e '@theme' "$css" 2>/dev/null; then
          grep -o -- '--[A-Za-z0-9_-]\{1,\}[[:space:]]*:' "$css" 2>/dev/null | sed 's/[[:space:]]*:$//'
        fi
      done
  # Tailwind config theme bindings.
  for tw in "$ROOT"/tailwind.config.ts "$ROOT"/tailwind.config.js "$ROOT"/tailwind.config.mjs "$ROOT"/tailwind.config.cjs; do
    [ -f "$tw" ] && grep -o -- '--[A-Za-z0-9_-]\{1,\}' "$tw" 2>/dev/null
  done
} | grep -E '^--[A-Za-z0-9]' | sort -u > "$WORK/catalog"
# The ^--[A-Za-z0-9] filter is load-bearing: a table separator row (| --- |)
# would otherwise read as a token named ---, make an empty catalog look
# populated and defeat the exit-2 guard below.

CATALOG_N=$(wc -l < "$WORK/catalog" | tr -d ' ')
if [ "${CATALOG_N:-0}" -eq 0 ]; then
  die2 "no token catalog resolvable (looked in docs/design-system.md token tables, stylesheets with :root/.dark/@theme, tailwind.config.*); not reporting a clean pass against an empty catalog"
fi

# Motion catalog from the Duration Scale and Easing Curves sections.
: > "$WORK/durations"
: > "$WORK/easings"
if [ -f "$DS" ]; then
  awk -v DUR="$WORK/durations" -v EASE="$WORK/easings" '
    /^#+[[:space:]]*Duration Scale/ { sec = "d"; next }
    /^#+[[:space:]]*Easing Curves/  { sec = "e"; next }
    /^#/ { sec = "" }
    sec != "" && /^[[:space:]]*\|/ {
      if ($0 ~ /TBD/) next
      row = $0
      if (sec == "d") {
        while (match(row, /[0-9]+(\.[0-9]+)?m?s/)) {
          v = substr(row, RSTART, RLENGTH); row = substr(row, RSTART + RLENGTH)
          if (v ~ /ms$/) { n = v; sub(/ms$/, "", n); n = int(n + 0.5) }
          else { n = v; sub(/s$/, "", n); n = int(n * 1000 + 0.5) }
          if (n > 0) print n > DUR
        }
      } else {
        while (match(row, /(cubic-bezier|steps)\([^)]*\)/)) {
          v = substr(row, RSTART, RLENGTH); row = substr(row, RSTART + RLENGTH)
          gsub(/[[:space:]]/, "", v)
          print v > EASE
        }
      }
    }
  ' "$DS" 2>/dev/null
fi
sort -u -o "$WORK/durations" "$WORK/durations"
sort -u -o "$WORK/easings" "$WORK/easings"
HAVE_DUR=0; [ -s "$WORK/durations" ] && HAVE_DUR=1
HAVE_EASE=0; [ -s "$WORK/easings" ] && HAVE_EASE=1

#####################################################################
# Files to scan
#####################################################################

if [ "$FILES_MODE" -eq 1 ]; then
  for f in ${FILES[@]+"${FILES[@]}"}; do
    case "$f" in "$ROOT"/*) f="${f#"$ROOT"/}" ;; esac
    printf '%s\n' "$f"
  done > "$WORK/changed.all"
else
  git -C "$ROOT" rev-parse --verify --quiet "$BASE^{commit}" >/dev/null 2>&1 \
    || die2 "base is not a commit in $ROOT: $BASE"
  git -C "$ROOT" diff --name-only --diff-filter=d "$BASE...HEAD" > "$WORK/changed.all" 2>/dev/null \
    || die2 "git diff $BASE...HEAD failed in $ROOT"
fi
grep -E '\.(tsx|jsx|ts|css)$' "$WORK/changed.all" | sort -u > "$WORK/changed" || true

#####################################################################
# Scan
#####################################################################

# Emits <class>|<file>|<line>|<detail> per finding.
scan_file() {
  rel="$1"; abs="$ROOT/$rel"
  case "$rel" in *.tsx|*.jsx) jsx=1 ;; *) jsx=0 ;; esac

  # Custom properties declared in this file count as allowed here.
  {
    cat "$WORK/catalog"
    grep -o -- '--[A-Za-z0-9_-]\{1,\}["'"'"']\{0,1\}[[:space:]]*:' "$abs" 2>/dev/null \
      | sed -e 's/[[:space:]]*:$//' -e 's/["'"'"']$//'
  } | sort -u > "$WORK/allowed"

  # Ids that some htmlFor in this file points at, normalized.
  grep -o 'htmlFor=[^[:space:]>]*' "$abs" 2>/dev/null \
    | sed -e 's/^htmlFor=//' -e 's/[{}"'"'"'`]//g' | sort -u > "$WORK/labelled"

  awk -v F="$rel" -v JSX="$jsx" \
      -v ALLOWED="$WORK/allowed" -v LABELLED="$WORK/labelled" \
      -v DURS="$WORK/durations" -v EASES="$WORK/easings" \
      -v HAVE_DUR="$HAVE_DUR" -v HAVE_EASE="$HAVE_EASE" '
    BEGIN {
      while ((getline t < ALLOWED) > 0) if (t != "") ok[t] = 1
      while ((getline t < LABELLED) > 0) if (t != "") lab[t] = 1
      while ((getline t < DURS) > 0) if (t != "") dur[t] = 1
      while ((getline t < EASES) > 0) if (t != "") ease[t] = 1
      palette = "^(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|mauve|olive|mist|taupe)-(50|100|200|300|400|500|600|700|800|900|950)$"
      builtin = "^(black|white|transparent|current|currentColor|inherit|none|auto)$"
      kw["text"] = "^(xs|sm|base|lg|xl|[2-9]xl|left|center|right|justify|start|end|wrap|nowrap|balance|pretty|ellipsis|clip|shadow.*)$"
      kw["border"] = "^(x|y|t|r|b|l|s|e|block|inline|solid|dashed|dotted|double|hidden|collapse|separate|spacing.*)$"
      kw["ring"] = "^(inset)$"
      kw["outline"] = "^(hidden|solid|dashed|dotted|double)$"
      kw["shadow"] = "^(2xs|xs|sm|md|lg|xl|2xl|inner)$"
      kw["decoration"] = "^(solid|double|dotted|dashed|wavy|from-font|clone|slice)$"
      kw["divide"] = "^(x|y|x-reverse|y-reverse|solid|dashed|dotted|double)$"
      kw["bg"] = "^(fixed|local|scroll|cover|contain|center|top|bottom|left|right|left-top|left-bottom|right-top|right-bottom|repeat|no-repeat|repeat-x|repeat-y|repeat-round|repeat-space|gradient-.*|linear.*|radial.*|conic.*|blend-.*|clip-.*|origin-.*|size-.*|position-.*)$"
      depth = 0; tag = ""
    }

    function hit(cls, ln, detail) { printf "%s|%s|%d|%s\n", cls, F, ln, detail }

    function allowed_name(name) {
      if (name in ok) return 1
      if (name ~ /^--(tw|radix|cmdk)-/) return 1
      if (name == "--spacing") return 1
      if (name ~ /^--color-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|mauve|olive|mist|taupe)-(50|[1-9]00|950)$/) return 1
      if (name ~ /^--color-(black|white)$/) return 1
      return 0
    }

    # E1 for a semantic color utility; name is the part after the prefix.
    function check_utility(prefix, name, ln,   n) {
      n = name
      if ((prefix == "ring" || prefix == "outline") && n ~ /^offset-/) sub(/^offset-/, "", n)
      if (prefix == "border" && n ~ /^(x|y|t|r|b|l|s|e)-/) sub(/^(x|y|t|r|b|l|s|e)-/, "", n)
      if (prefix == "divide" && n ~ /^(x|y)-/) sub(/^(x|y)-/, "", n)
      if (n == "" || n ~ /^[0-9.]+(%|px)?$/ || n ~ palette || n ~ builtin) return
      if ((prefix in kw) && n ~ kw[prefix]) return
      if (n !~ /^[a-z][a-z0-9-]*$/) return
      if (allowed_name("--" n) || allowed_name("--color-" n) || allowed_name("--" prefix "-" n)) return
      hit("E1", ln, prefix "-" name " uses --" n ", which is not in the token catalog")
    }

    function norm_ms(v,   n) {
      if (v ~ /ms$/) { n = v; sub(/ms$/, "", n); return int(n + 0.5) }
      n = v; sub(/s$/, "", n); return int(n * 1000 + 0.5)
    }

    function check_duration(lit, ln,   n) {
      if (!HAVE_DUR) return
      n = norm_ms(lit)
      if (n == 0 || (n in dur)) return
      hit("E3", ln, lit " is not in the Duration Scale")
    }

    function check_easing(lit, ln,   v) {
      if (!HAVE_EASE) return
      v = lit; gsub(/[[:space:]_]/, "", v)
      if (v in ease) return
      hit("E3", ln, lit " is not in the Easing Curves")
    }

    function flush_tag(   id, ty) {
      if (tag == "") return
      if (tag ~ /\{[[:space:]]*\.\.\./) { tag = ""; return }
      if (kind == "img") {
        if (tag !~ /[[:space:]]alt[[:space:]]*=/) hit("E4", start, "<img> has no alt= (use alt=\"\" to declare it decorative)")
        tag = ""; return
      }
      if (tag ~ /aria-label[[:space:]]*=/ || tag ~ /aria-labelledby[[:space:]]*=/ || in_label) { tag = ""; return }
      if (kind == "input" && match(tag, /[[:space:]]type[[:space:]]*=[[:space:]]*["'"'"'{]*[a-z]+/)) {
        ty = substr(tag, RSTART, RLENGTH); sub(/^.*[^a-z]/, "", ty)
        if (ty ~ /^(hidden|submit|button|reset|image)$/) { tag = ""; return }
      }
      id = ""
      if (match(tag, /[[:space:]]id=[^[:space:]>]*/)) {
        id = substr(tag, RSTART, RLENGTH); sub(/^[[:space:]]id=/, "", id); gsub(/[{}"'"'"'`]/, "", id); sub(/\/$/, "", id)
      }
      if (id != "" && (id in lab)) { tag = ""; return }
      hit("E5", start, "<" kind "> has no <label htmlFor>, wrapping <label>, aria-label or aria-labelledby")
      tag = ""
    }

    {
      line = $0

      # E1 / E2: var() references.
      rest = line
      while (match(rest, /var\([[:space:]]*--[A-Za-z0-9_-]+/)) {
        frag = substr(rest, RSTART, RLENGTH); rest = substr(rest, RSTART + RLENGTH)
        name = frag; sub(/^var\([[:space:]]*/, "", name)
        if (rest ~ /^[[:space:]]*,/) hit("E2", NR, "var(" name ", ...) has a fallback, which hides a missing token")
        else if (!allowed_name(name)) hit("E1", NR, name " is not in the token catalog")
      }

      # E3: motion literals.
      rest = line
      while (match(rest, /duration-\[[^]]+\]/)) {
        v = substr(rest, RSTART + 10, RLENGTH - 11); rest = substr(rest, RSTART + RLENGTH)
        if (v ~ /^[0-9]+(\.[0-9]+)?m?s$/) check_duration(v, NR)
      }
      rest = line
      while (match(rest, /(^|[^A-Za-z0-9-])duration-[0-9]+([^A-Za-z0-9-]|$)/)) {
        v = substr(rest, RSTART, RLENGTH); rest = substr(rest, RSTART + RLENGTH)
        sub(/^[^0-9]*/, "", v); sub(/[^0-9]+$/, "", v)
        check_duration(v "ms", NR)
      }
      rest = line
      while (match(rest, /ease-\[[^]]+\]/)) {
        v = substr(rest, RSTART + 6, RLENGTH - 7); rest = substr(rest, RSTART + RLENGTH)
        if (v ~ /^(cubic-bezier|steps)\(/) check_easing(v, NR)
      }
      if (line ~ /[Tt]ransition|[Aa]nimation/ && line !~ /[Dd]elay/) {
        rest = line
        while (match(rest, /(^|[^A-Za-z0-9_.-])[0-9]+(\.[0-9]+)?m?s([^A-Za-z0-9_-]|$)/)) {
          v = substr(rest, RSTART, RLENGTH); rest = substr(rest, RSTART + RLENGTH)
          sub(/^[^0-9]*/, "", v); sub(/[^ms0-9.]+$/, "", v)
          check_duration(v, NR)
        }
        rest = line
        while (match(rest, /(cubic-bezier|steps)\([^)]*\)/)) {
          v = substr(rest, RSTART, RLENGTH); rest = substr(rest, RSTART + RLENGTH)
          check_easing(v, NR)
        }
      }

      if (JSX != 1) next

      # E1: semantic color utilities in class strings.
      if (line !~ /^[[:space:]]*import[[:space:]]/ && line !~ /[[:space:]]from[[:space:]]+["'"'"']/) {
        n = split(line, tok, /[[:space:]"'"'"'`{}(),;]+/)
        for (i = 1; i <= n; i++) {
          t = tok[i]
          if (t ~ /\[/ || t ~ /\$/) continue
          sub(/^.*:/, "", t); sub(/^!/, "", t); sub(/!$/, "", t); sub(/\/[A-Za-z0-9.]+$/, "", t)
          if (match(t, /^(bg|text|border|ring|outline|fill|stroke|from|via|to|divide|placeholder|caret|accent|decoration|shadow)-/)) {
            check_utility(substr(t, 1, RLENGTH - 1), substr(t, RLENGTH + 1), NR)
          }
        }
      }

      # E4 / E5: img alt and form-control labels (multi-line tags supported).
      if (tag != "") {
        tag = tag " " line
        if (index(line, ">") > 0) flush_tag()
      } else if (match(line, /<(img|input|select|textarea)([[:space:]>\/]|$)/)) {
        pre = substr(line, 1, RSTART - 1)
        frag = substr(line, RSTART)
        kind = frag; sub(/^</, "", kind); sub(/[[:space:]>\/].*$/, "", kind)
        a = pre; opens = gsub(/<[Ll]abel([[:space:]>]|$)/, "", a)
        b = pre; closes = gsub(/<\/[Ll]abel>/, "", b)
        in_label = (depth + opens - closes > 0)
        start = NR; tag = frag
        if (index(frag, ">") > 0) flush_tag()
      }
      a = line; depth += gsub(/<[Ll]abel([[:space:]>]|$)/, "", a)
      b = line; depth -= gsub(/<\/[Ll]abel>/, "", b)
      if (depth < 0) depth = 0
    }
    END { flush_tag() }
  ' "$abs"
}

nearest_token() {
  awk -v N="$1" '
    function lev(a, b,   la, lb, i, j, c, p, q) {
      la = length(a); lb = length(b)
      for (j = 0; j <= lb; j++) p[j] = j
      for (i = 1; i <= la; i++) {
        q[0] = i
        for (j = 1; j <= lb; j++) {
          c = (substr(a, i, 1) == substr(b, j, 1)) ? 0 : 1
          q[j] = p[j] + 1
          if (q[j-1] + 1 < q[j]) q[j] = q[j-1] + 1
          if (p[j-1] + c < q[j]) q[j] = p[j-1] + c
        }
        for (j = 0; j <= lb; j++) p[j] = q[j]
      }
      return p[lb]
    }
    $0 != "" { d = lev(N, $0); if (best == "" || d < bd) { bd = d; best = $0 } }
    END { if (best != "") print best }
  ' "$WORK/catalog"
}

: > "$WORK/findings"
FILES_N=0
while IFS= read -r rel; do
  [ -n "$rel" ] || continue
  [ -f "$ROOT/$rel" ] || continue
  FILES_N=$((FILES_N + 1))
  scan_file "$rel" >> "$WORK/findings"
done < "$WORK/changed"

sort -t'|' -k2,2 -k3,3n -k1,1 "$WORK/findings" | uniq > "$WORK/findings.sorted"

E1=0; E2=0; E3=0; E4=0; E5=0
while IFS='|' read -r cls file ln detail; do
  [ -n "$cls" ] || continue
  case "$cls" in
    E1)
      E1=$((E1 + 1))
      want=$(printf '%s\n' "$detail" | grep -o -- '--[A-Za-z0-9_-]\{1,\}' | tail -1)
      near=$(nearest_token "$want")
      printf 'E1 UNKNOWN_TOKEN %s:%s %s (nearest: %s)\n' "$file" "$ln" "$detail" "${near:-none}" ;;
    E2) E2=$((E2 + 1)); printf 'E2 VAR_FALLBACK %s:%s %s\n' "$file" "$ln" "$detail" ;;
    E3) E3=$((E3 + 1)); printf 'E3 UNKNOWN_MOTION %s:%s %s\n' "$file" "$ln" "$detail" ;;
    E4) E4=$((E4 + 1)); printf 'E4 IMG_NO_ALT %s:%s %s\n' "$file" "$ln" "$detail" ;;
    E5) E5=$((E5 + 1)); printf 'E5 INPUT_NO_LABEL %s:%s %s\n' "$file" "$ln" "$detail" ;;
  esac
done < "$WORK/findings.sorted"

TOTAL=$((E1 + E2 + E3 + E4 + E5))
NOTE=""
[ "$HAVE_DUR" -eq 0 ] && NOTE="$NOTE; durations unchecked (no concrete Duration Scale values)"
[ "$HAVE_EASE" -eq 0 ] && NOTE="$NOTE; easings unchecked (no concrete Easing Curves values)"
printf '%s: %d finding(s) (E1 %d, E2 %d, E3 %d, E4 %d, E5 %d) in %d frontend file(s); %d catalog tokens%s\n' \
  "$SELF" "$TOTAL" "$E1" "$E2" "$E3" "$E4" "$E5" "$FILES_N" "$CATALOG_N" "$NOTE"

[ "$TOTAL" -eq 0 ] || exit 1
exit 0
