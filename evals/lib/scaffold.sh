#!/usr/bin/env bash
# evals/lib/scaffold.sh
# Builds the slate-shop fixture project in the eval run's empty workspace (the
# current directory): copies evals/fixtures/slate-shop, places its ledger at
# .bytheslice/ledger.jsonl and commits it on main. A case's own scaffold script
# sources this, then adds its branch or commits.
#
# Runs as the operator outside the agent sandbox with a temp HOME, so every git
# call carries its own identity.

set -euo pipefail

EVALS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FIXTURE="$EVALS_DIR/fixtures/slate-shop"

eval_git() { git -c user.name=eval -c user.email=eval@example.com -c commit.gpgsign=false "$@"; }

cp -R "$FIXTURE/." .
mkdir -p .bytheslice
mv ledger.fixture.jsonl .bytheslice/ledger.jsonl
eval_git init -q -b main
eval_git add -A
eval_git commit -q -m "chore: slate shop at Pie 2"
