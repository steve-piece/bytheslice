---
name: pizza-party
description: "Cater a whole app, start to finish: from a short brief to a finished, deployed app with a URL. One interview up front (AskUserQuestion), then no human stops: /setup-shop, /create-menu, /cook-pizzas, the Prep pie, every pie through /sell-pie in ship-once delivery (all gates local), one PR that ships the app, a deploy to whatever host the operator has authorized (or an artifact or localhost link), and a run record for comparing runs over time. Every decision a sub-skill would normally ask about is decided, recorded in the order ticket, and the run continues. Use when the user runs /pizza-party, sets a /goal to build an app end to end, or says \"build me this app end to end\", \"from scratch to production\", \"pizza party\", \"bake the whole roadmap\" or \"run all pies\"."
user-invocable: true
triggers: ["/bytheslice:pizza-party", "/pizza-party", "pizza party", "build this app end to end", "build me an app end to end", "end to end build", "from scratch to production", "bake the whole roadmap", "run all pies", "bake every pie", "autonomous delivery"]
---
<!-- skills/pizza-party/SKILL.md -->
<!-- The end-to-end conductor (6.0.0, replaces /run-the-day). Pizza-shop framing: a party orders the whole menu at once; the shop takes the order once, then cooks, boxes and delivers without calling back. The conductor holds no implementation context: it interviews once, writes the order ticket, chains the existing skills with run.unattended so none of them stops, and ends with a URL and a run record. -->

# /pizza-party

`/pizza-party` takes a brief ("a private app for tracking my reading list, with a database and an agent plugin") and returns a finished app and a URL. The operator answers **one interview** at the start; after that nothing waits on a human. That is the contract the operator opts into: they accept the risk of decisions made without them in exchange for a working app instead of a question that sat unanswered for ten hours.

The conductor is **thin**. It holds no implementation context: it runs the existing skills in order, each of which does its own work in subagents and Workflows, and it keeps its own state in the **order ticket** (`docs/pizza-party/order.md`, format in [references/order-ticket.md](references/order-ticket.md)) so a compaction costs nothing. At every phase boundary call `bts_status` when the tool is available, and after a compaction read the ticket's **Progress** section before anything else.

**Launch.** Best under a goal, so the session keeps going turn after turn: `/goal Build this app end to end with /pizza-party: <brief>`. Run on its own (`/pizza-party <brief>`), it does the same and simply continues each turn until the final report.

## The no-stop rule

Under `/pizza-party` every phase runs with `run.unattended: true`. Each place a skill would normally raise a question resolves like this, and every resolution becomes one line under **Decisions made without you** (or **Deferred**) in the ticket:

| Would have asked about | Under /pizza-party |
|---|---|
| Ambiguity in the brief or plan (`prd_ambiguity`), a design call (`creative_direction`), a roadmap or token approval | Take the recommended option, or the one most consistent with the brief and the Answers; record it |
| A service with no credentials (`external_credentials`) | Use an authorized provider; else a local substitute (SQLite, local auth, console email); record it. Only if the app cannot run without it, defer the slices that need it |
| A destructive operation on anything shared that the operator did not name in the interview (`destructive_operation`) | Skip it and record it. The one thing the run refuses rather than decides |
| A slice whose 3 fix loops ran out | One replan through `/special-order`: split it into smaller slices, each naming which of the original Exit criteria it covers, together covering all of them. Bake the split. Still stuck: mark it deferred (`[ ]` with `Status: deferred: <reason>`), record it, keep going |
| CI red after 3 rounds on the final PR | Leave the PR open, record its URL, deploy from the ship branch only if the host supports a branch deploy, and report |
| A Claude Code permission prompt | Checked once before the interview (Phase 0); the run cannot answer one mid-way |

Fix caps never rise, the workflow guard still refuses the shortcuts (hand-written plans, ad-hoc code-writing agents, PRs with unverified slices), and `enforcement` is never loosened by the run. Those are rails, not stops: a refusal reroutes the work, it never waits.

## Phase 0: Preflight (silent)

1. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/pizza-party.js" preflight "<target folder>"`. It reports git, node, the package managers, `gh` auth, and which host and database CLIs are logged in (alphabetical, none preferred), all read-only.
2. Add what the session itself can reach: connected MCP servers whose names say a host or database (a Vercel, Netlify, Cloudflare, Supabase or Neon server, for example) count as authorized.
3. Read `~/.bytheslice/defaults.json` for any defaults the operator keeps, and resolve the UI sources once with `node "${CLAUDE_PLUGIN_ROOT}/scripts/ui-sources.js" "<target folder>"`: the operator's own registry preferences when they have any, else the public shadcn registry directory. No question about it in the interview.
4. **Permission mode.** If this session would stop on tool permission prompts (it is not in a mode that runs edits and shell commands without asking), make that the interview's first question: switch to a no-prompt mode now (the operator does it; name the setting), or continue knowing the run may pause on a prompt.
5. **Target folder.** An empty or missing folder is a new app (Flow B). A folder with a master checklist resumes: skip to the first phase the ticket's **Progress** does not mark done. A non-empty folder without a checklist is an existing app: run Phases 2 to 9 on it (Flow C) without bootstrapping.

Never narrate passing checks.

## Phase 1: The interview (the only stop)

Ask everything now, with `AskUserQuestion`: many short questions, one decision each, options of one to four words, a recommended first option. Several calls of up to four questions each are fine. Ask only what the brief leaves open and what changes the build:

- **Name and folder**, when the brief does not name them.
- **Host**: list only the hosts Phase 0 found authorized, plus "No host: localhost". Never recommend a provider the operator has not authorized, and never treat one host as the default.
- **Database**: the authorized providers (and, for one, which project or a new one), plus "Local SQLite".
- **Auth**: the simplest option that meets the brief's privacy needs (for a single private user, an email magic link or a passkey usually is).
- **Look**: a few brand words or colors; the theme of a configured registry when there is one.
- **The brief's genuine open questions**: dispatch `bytheslice:brief-analyzer` on the brief and ask the 3 to 7 questions it returns, minus any the brief or the answers above already settle.

Then write the ticket: the brief verbatim, the **Answers**, and an **Acceptance** list derived from the brief's own success language (one checkable line each). For a new app the folder does not exist yet (the scaffolder refuses a non-empty folder), so write the ticket and the run config to `~/.bytheslice/pizza-party/pending/<name>/` (`order.md`, `config.json`) and move them in during Phase 2. From here on, do not ask again.

## Phase 2: Shop (setup-shop, then the repo)

1. The run config (in `pending/<name>/config.json` for a new app), written in Phase 1 so `/setup-shop` has nothing to ask:

```jsonc
{
  "run": { "unattended": true, "conductor": "pizza-party" },
  "bootstrap": { "variant": "single-app", "stack": "<from Answers>", "roadmapFile": null },
  "delivery": { "mode": "ship-once", "sliceBudgetHours": 0 },
  "review": { "default": "boundary" },
  "flow": { "libraryGate": "off" },
  "quality": { "tier": "auto" },
  "ui": { "useDirectory": true }
}
```

   `libraryGate: "off"` is safe here because ship-once runs the design critique at every pie boundary and fixes its P0 and P1 findings itself. The operator's own `ui.registries` in `~/.bytheslice/defaults.json` still apply first.
2. Run `/setup-shop --unattended --ticket <ticket path> --config <config path>`: Flow B from the parent folder for a new app (the scaffolder creates the app folder), Flow C inside an existing one. It scaffolds, commits on `main`, merges the run config into `bytheslice.config.json`, writes the Feature intake block and reports the guard's state, all without asking.
3. Move the ticket to `<app>/docs/pizza-party/order.md` (and delete the `pending/<name>/` folder). From here on every phase runs inside the app folder.
4. Create the private GitHub repository and push `main`: `gh repo create <name> --private --source . --remote origin --push` (use the wrapper form the operator's environment requires for `gh`, if any). Then cut the ship branch, `ship/<name>` (`delivery.shipBranch`), from `origin/main`. Plans stay where [git-worktree-standard.md, "Where the plans live"](../cook-pizzas/references/git-worktree-standard.md) puts them: with the default gitignored `docs/plans/`, every checklist flip happens in this primary checkout's `$PLANS`, never in a pie worktree.

## Phase 3: Menu (create-menu)

Run `/create-menu` with the brief and the ticket path. Under `run.unattended` it takes its answers from the ticket and records the rest. Output: the PRD under `docs/`.

## Phase 4: Roadmap (cook-pizzas)

Run `/cook-pizzas` on the PRD. Under `run.unattended` it takes Phase 1 from the ticket, auto-approves the roadmap, marks every pie `review: boundary`, and right-sizes: a small brief gets a few pies and slices, never padding. Record the pie and slice counts in **Progress**.

## Phase 5: Prep pie (display case, quality line, shop open)

1. `/set-display-case`: brief-first mode with the ticket's **Look** and the configured registry's theme item when there is one; its approvals resolve under `run.unattended`.
2. `/final-quality-check`: `quality.tier: "auto"` picks the lean scaffold for a small app (lint, typecheck, unit tests, build, one smoke spec); under ship-once it commits locally instead of opening its own PR.
3. `/open-the-shop`: provider tooling writes `.env.local` (the agent never reads or prints a value); a service with no authorized provider gets a local substitute or a deferral, recorded.
4. Database: create what the Answers name (for example a new schema in an existing project) through the provider's CLI or MCP. Never touch another schema, table or project the operator did not name.

## Phase 6: Bake every pie (sell-pie, ship-once)

For each pie in checklist order, run `/sell-pie <n>`. Under ship-once each pie branches from the ship branch, every slice runs the context-separated build, test, verify and fix Workflow with all gates local, and `/box-it-up --pie-local` merges the pie into the ship branch (`--no-ff`, every slice commit kept) once its slices verified and the full local check passed. Pies run one at a time, never in parallel.

`/sell-pie` resolves its approval batch (migrations, data loads, size exceptions) from the ticket's **Answers**; anything the interview did not cover defers that slice instead of asking. It returns `status: complete | complete_with_deferrals` with a `blocked` list. A deferred slice's commits were moved to a local `deferred/pie-N-sN.M` branch and its dependents deferred too, so nothing unverified reaches the ship branch. After each pie: one **Progress** line (slices done, deferred), and apply the stuck-slice rule from the table above to each `blocked` slice: one replan through `/special-order` (the new slices bake in a follow-up `/sell-pie` for the same pie), then a **Deferred** line if it still fails. The last pie returns `ship_ready: true`.

## Phase 7: Ship (one PR)

When the last pie returns `ship_ready: true`, run `/box-it-up --ship` with the ship branch, the app name, `run.unattended` and the collected `blocked` list: it pushes the ship branch, opens one PR to `main` with every pie's evidence, runs CI once (up to 3 fix rounds), merges on green with a merge commit, and syncs `main`. The workflow guard refuses this PR while any slice on the branch lacks a slice-verifier pass, which is why deferred slices never stay on it. Red after 3 rounds, or a conflict with `main`: the PR stays open and comes back as a blocker with its URL (see the no-stop table).

## Phase 8: Deliver (deploy, or the next best link)

1. **Host authorized** (from the Answers): deploy `main` with that provider's own CLI or MCP, apply the database migrations to the production database first, and set the production environment variables through the provider's tooling, never echoing a value. Get the live URL.
2. **No host**: if the app can run as a static or single-file page, publish it as an Artifact and use its link; otherwise start the app locally on a free port and use `http://localhost:<port>`.
3. **Smoke check** the URL against the ticket's **Acceptance** list: drive the main flows once in a browser (or, for an MCP or API surface, call it once per flow) and tick what passed. A failing item gets one fix through `/special-order` and a redeploy; still failing, it stays unticked and is reported.

## Phase 9: Report and record

1. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/pizza-party.js" record "<app root>" --brief <id> --outcome shipped|partial|failed --url <url> --url-kind deployed|artifact|localhost --model <model id> --started <ms> --acceptance <passed>/<total>`. It appends one line to `~/.bytheslice/pizza-party/runs.jsonl` with the ledger's totals (slices, fix loops, cost, warnings) and the ticket's decision and deferral counts. `pizza-party.js runs --brief <id>` compares every run of a brief, so the same brief can be rerun as models improve.
2. Final report, verdict first:

```
Pizza party: <shipped | partial | failed> · <App name>
URL: <url> (<deployed on <host> | artifact | localhost>)
Acceptance: <passed>/<total>
Built: <pies> pies, <slices done>/<slices> slices · PR <url> (merged | open)
Decisions made without you: <n> (docs/pizza-party/order.md)
Deferred: <n> · <one line each>
Run record: ~/.bytheslice/pizza-party/runs.jsonl
```

## Hard constraints

- **One interview, then no stops.** Nothing after Phase 1 asks the operator anything. Decide, record, continue.
- **Thin conductor.** The conductor never writes app code, plans, tests or PR bodies itself; the skills and their agents do. Its own writes are the ticket, `bytheslice.config.json`, the ship branch and the run record.
- **No vendor by default.** Hosts, databases and auth come from what the operator has authorized and chose in the interview; with none, local fallbacks. Never recommend or assume a provider the operator has not authorized.
- **Rails stay on.** The workflow guard, the fix caps, verify-once and the Pass's checkbox rule all apply; a refusal reroutes the work. Never loosen `enforcement`, never set `BTS_ALLOW_BYPASS`, never raise a cap.
- **Shared resources are read-only unless named.** Only what the interview named (a new schema, a new project) is created or changed.
- **No secret in any file the run writes** besides `.env.local`, and that one is written by provider tooling, never by the agent's own text.
- **Sequential pies.** One `/sell-pie` at a time.

## Completion checklist

- [ ] Preflight ran; the permission mode was settled in the interview if needed
- [ ] The interview was the only time the operator was asked anything
- [ ] The ticket has Answers, Acceptance, every decision and deferral, and a Progress line per phase
- [ ] Every pie was baked through `/sell-pie`; every slice either verified or deferred with a reason
- [ ] One PR shipped the app (merged, or open and reported)
- [ ] A URL was delivered (deployed, artifact or localhost) and smoke-checked against Acceptance
- [ ] The run record was appended and the final report printed

## Return contract

```yaml
status: shipped | partial | failed
url: <url or null>
url_kind: deployed | artifact | localhost | null
acceptance: "<passed>/<total>"
pies: <int>
slices_done: <int>
slices_total: <int>
pr_url: <url or null>
pr_merged: true | false
decisions: <int>
deferred: [<slice or item: reason>]
ticket: docs/pizza-party/order.md
run_record: ~/.bytheslice/pizza-party/runs.jsonl
```

## Triggers

Follow this skill when the user runs `/pizza-party`, sets a `/goal` to build an app end to end, or asks to build an app from scratch to production, to bake the whole roadmap, or to run every pie. With a master checklist already in place it resumes at the first phase not marked done. For one pie use [`/sell-pie`](../sell-pie/SKILL.md); for one careful slice, [`/sell-slice`](../sell-slice/SKILL.md).
