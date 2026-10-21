#!/usr/bin/env bash
# tests/frontend-statics/run.sh
# Fixture tests for skills/sell-slice/scripts/verify-frontend-statics.sh: one temp git repo per case, exit code and stdout asserted.
#
# Each fixture under fixtures/<case>/ holds base/ (committed first, the base
# sha) and change/ (committed on top, the slice). Prints one ok or FAIL line
# per case and exits nonzero on any failure. Temp repos are removed.

set -u

HERE=$(cd "$(dirname "$0")" && pwd)
SCRIPT="$(cd "$HERE/../.." && pwd)/skills/sell-slice/scripts/verify-frontend-statics.sh"
FIX="$HERE/fixtures"

PASS=0
FAIL=0
TMPS=()
cleanup() { for t in ${TMPS[@]+"${TMPS[@]}"}; do rm -rf "$t"; done; }
trap cleanup EXIT

g() { git -C "$REPO" -c user.name=fixture -c user.email=fixture@example.invalid \
        -c commit.gpgsign=false -c core.hooksPath=/dev/null "$@"; }

# setup <case>: builds $REPO with base and change commits, sets $BASE_SHA.
setup() {
  REPO=$(mktemp -d) || { echo "mktemp failed"; exit 1; }
  TMPS+=("$REPO")
  g init -q
  [ -d "$FIX/$1/base" ] && cp -R "$FIX/$1/base/." "$REPO/"
  g add -A && g commit -q --allow-empty -m base
  BASE_SHA=$(g rev-parse HEAD)
  [ -d "$FIX/$1/change" ] && cp -R "$FIX/$1/change/." "$REPO/"
  g add -A && g commit -q --allow-empty -m slice
}

# run_script <args...>: sets $OUT and $CODE.
run_script() {
  OUT=$(cd "$REPO" && bash "$SCRIPT" "$@" 2>&1)
  CODE=$?
}

WHY=""
need_code()  { [ "$CODE" -eq "$1" ] || WHY="${WHY}exit $CODE, want $1; "; }
need_line()  { printf '%s\n' "$OUT" | grep -Eq -- "$1" || WHY="${WHY}no line matching /$1/; "; }
need_none()  { ! printf '%s\n' "$OUT" | grep -Eq -- "$1" || WHY="${WHY}unexpected line matching /$1/; "; }
need_count() {
  n=$(printf '%s\n' "$OUT" | grep -Ec -- "$1")
  [ "$n" -eq "$2" ] || WHY="${WHY}$n lines matching /$1/, want $2; "
}

report() {
  if [ -z "$WHY" ]; then
    PASS=$((PASS + 1)); printf 'ok   %s\n' "$1"
  else
    FAIL=$((FAIL + 1)); printf 'FAIL %s: %s\n' "$1" "$WHY"
    printf '%s\n' "$OUT" | sed 's/^/       | /'
  fi
  WHY=""
}

# 1. clean fixture exits 0
setup clean
run_script --base "$BASE_SHA"
need_code 0
need_line '^verify-frontend-statics: 0 finding\(s\)'
need_none '^E[1-5] '
report "clean fixture exits 0"

# 2. fabricated token against a catalog holding only --primary
setup e1-unknown-token
run_script --base "$BASE_SHA"
need_code 1
need_line '^E1 UNKNOWN_TOKEN components/hero\.tsx:4 --brand-primary-500 .*\(nearest: --primary\)$'
report "fabricated token reports E1 with --primary as nearest"

# 3. var() fallback hiding a fabricated token
setup e2-var-fallback
run_script --base "$BASE_SHA"
need_code 1
need_line '^E2 VAR_FALLBACK components/badge\.css:4 var\(--fake, \.\.\.\)'
need_none '^E1 '
report "var(--fake, var(--real)) reports E2"

# 4. duration literal off the Duration Scale
setup e3-unknown-motion
run_script --base "$BASE_SHA"
need_code 1
need_line '^E3 UNKNOWN_MOTION components/drawer\.tsx:4 300ms is not in the Duration Scale$'
report "300ms off the Duration Scale reports E3"

# 5. img without alt is E4, alt="" is not
setup e4-img-no-alt
run_script --base "$BASE_SHA"
need_code 1
need_count '^E4 IMG_NO_ALT ' 1
need_line '^E4 IMG_NO_ALT components/gallery\.tsx:6 '
report "img without alt reports E4, alt=\"\" does not"

# 6. unlabelled input is E5, aria-label is not
setup e5-input-no-label
run_script --base "$BASE_SHA"
need_code 1
need_count '^E5 INPUT_NO_LABEL ' 1
need_line '^E5 INPUT_NO_LABEL components/search\.tsx:6 <input>'
report "unlabelled input reports E5, aria-label does not"

# 7. no token catalog anywhere exits 2
setup no-catalog
run_script --base "$BASE_SHA"
need_code 2
need_line 'no token catalog resolvable'
report "no token catalog exits 2"

# 8. --files limits the scan to the listed paths
setup files-limit
run_script --files components/first.tsx
need_code 1
need_line '^E4 IMG_NO_ALT components/first\.tsx:4 '
need_none 'second\.tsx'
need_line ' in 1 frontend file\(s\)'
report "--files limits the scan to the listed paths"

# Extra cases beyond the eight named in the plan.
setup e1-semantic-utility
run_script --base "$BASE_SHA"
need_code 1
need_count '^E1 UNKNOWN_TOKEN ' 1
need_line '^E1 UNKNOWN_TOKEN components/banner\.tsx:4 bg-brand uses --brand'
report "semantic utility without a token reports E1"

setup motion-unchecked
run_script --base "$BASE_SHA"
need_code 0
need_none '^E3 '
need_line 'durations unchecked'
report "motion literals pass with a note when the scale holds no values"

setup clean
run_script
need_code 2
need_line 'one of --base or --files is required'
report "missing --base and --files exits 2"

printf '\n%d passed / %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
