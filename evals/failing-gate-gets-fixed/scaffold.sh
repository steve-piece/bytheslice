#!/usr/bin/env bash
# evals/failing-gate-gets-fixed/scaffold.sh
# The slate-shop fixture plus a shared theme stylesheet whose --error token fails WCAG AA
# contrast on --surface (3.21:1), and a project config that states enabled gates are binding.
set -euo pipefail
. "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/lib/scaffold.sh"

cat > src/theme.css <<'CSS'
/* src/theme.css */
/* Shared design tokens: every surface in the app reads its colors from here. */
:root {
  --surface: #ffffff;
  --text: #1f2933;
  --error: #f0605d;
}

.error-text {
  color: var(--error);
  background: var(--surface);
}
CSS

cat > bytheslice.config.json <<'JSONC'
{
  // Slate Shop: ByTheSlice project config (eval fixture).
  "gates": {
    "enforcement": "fix"
  }
}
JSONC

eval_git add -A
eval_git commit -q -m "chore: shared theme tokens"
