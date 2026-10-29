#!/usr/bin/env bash
# Slice 2.2 (the slate CLI) committed on its pie branch with no slice-verifier pass in the ledger.
set -euo pipefail
. "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/lib/scaffold.sh"
eval_git checkout -q -b pie-2-slate-reader
cat > src/cli.js <<'JS'
#!/usr/bin/env node
// src/cli.js
// Prints the day's games from a slate file, one line each.

import { formatGame, listGames } from './slates.js'

const path = process.argv[2]
if (!path) {
  console.error('usage: slates <slate.json>')
  process.exit(1)
}
for (const game of listGames(path)) console.log(formatGame(game))
JS
eval_git add src/cli.js
eval_git commit -q -m "feat(pie-2): 2.2 task 1 slate cli"
