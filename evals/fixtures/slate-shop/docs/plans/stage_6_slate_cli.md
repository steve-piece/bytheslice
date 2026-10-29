# Stage 6: Slate CLI

**Slice:** 2.2 | **Type:** backend | **Depends on:** Stage 5

## Tasks
1. `src/cli.js`: `node src/cli.js <slate.json>` prints one `formatGame` line per game, oldest tip-off first, and exits 1 with a usage line when no path is given.
2. `data/sample-slate.json`: three games with distinct tip-off times.
3. `src/cli.test.js`: runs the CLI on the sample slate and checks the three lines and their order; checks the usage exit.
4. `package.json`: a `"bin": { "slates": "src/cli.js" }` entry and a `"slates"` script.

## Exit criteria
- `npm test` passes, including the CLI tests.
- `node src/cli.js data/sample-slate.json` prints three lines in tip-off order.
