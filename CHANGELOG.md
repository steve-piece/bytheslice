<p align="center"><img src="assets/brand/logo.png" alt="ByTheSlice" width="300"></p>

# Changelog

All notable changes to **🍕 ByTheSlice** are tracked here, slice by slice. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project sticks to [semver](https://semver.org/).

> [!NOTE]
> **Reading the menu:** *Added* = new toppings, *Changed* = recipe tweaks, *Removed* = pulled from the menu, *Fixed* = burnt slices reheated, *Deprecated* = day-old, going away soon.

---

## [Unreleased]

---

## [6.1.1] - 2026-10-29

**Special orders are for new features only.** Plain agents are fine for everything else, the prompt nudge stops firing on prompts that only mention a feature, and three bugs from the first `/pizza-party` benchmark run are fixed.

### Changed

- **Feature intake covers new features and requirements only.** The block `/setup-shop` writes now says bug fixes of any size, refactors, research, review, debugging and one-off tasks need no special order and can use plain agents (general-purpose, Explore) or direct edits. A slice already in the checklist is still built through `/sell-slice` or `/sell-pie`. The "multi-file fixes" and "not through ad-hoc Agent fan-out" wording is gone.
- **The prompt nudge fires on requests, not mentions.** The prompt must open by asking to add, build, create or implement a new feature, pie, pipeline or similar. Questions, fixes, tests, docs and talk about the framework stay quiet; a bare `/goal` no longer triggers it, and a `/goal` does only when its text asks for a feature. An agent report or task notice relayed into the session never triggers it (one quoting "Implement Slice 2.2" did). Measured on 42 sample prompts: 16 false positives before, 0 after.
- **The Pass honors `modelTiers`.** A project's top-level `modelTiers` (camelCase agent names, the key conductors dispatch with) now sets the tier the spawn check expects, recorded once as a `policy-override` note; `pass.spawnPolicy.roles` still wins. Before, a conductor that followed the documented override drew a `model-policy` warning.
- `/setup-shop` drops the stale **Enforcement** field from its report, and the prep gate is described as asking, not refusing.

### Removed

- The `build-slice-uses-baker` eval's no-other-agents grader: research and review agents are fine. The case still checks that `/sell-slice` or `/sell-pie` runs.

### Fixed

- **A tester verdict in capitals read as unparsed.** `overall: FAIL` (or `"PASS"` in JSON) now parses in any case, so the ledger keeps the fail and its fix targets. The tester contract also asks for the lowercase word alone.
- **Feature intake ignored an `AGENTS.md` project.** When `CLAUDE.md` only imports `@AGENTS.md` (as create-next-app scaffolds), the block now goes in `AGENTS.md` and the one-line pointer is left alone.
- `docs/pass-mod-spec.md` listed `fix-attempter` and `ci-fix-attempter` on opus; they are sonnet, as their frontmatter and the Pass defaults say.

---

## [6.1.0] - 2026-10-29

**Fewer hooks, no refusals.** The plugin keeps only the hooks that have to be hooks, and nothing it ships refuses a tool call any more: the rules and the prompt nudge inform the model, the Pass warns, and the model decides. The first `/pizza-party` benchmark run also surfaced two run bugs, fixed here.

> [!IMPORTANT]
> **Behavior change.** The 6.0.0 refusals are gone: hand-written plan files, code-writing agents outside the bakers, `gh pr create` with an unverified slice, and a slice marked `[x]` with no verifier pass all go through (the last still draws the Pass's `checkbox-without-verdict` warning). The `enforcement` config key and `BTS_ALLOW_BYPASS` are removed; an old `enforcement` line is ignored.

### Changed

- **The workflow guard is now a nudge.** `hooks/workflow-guard.*` is renamed `hooks/workflow-nudge.*` and runs on `UserPromptSubmit` only: the Feature intake rule for a `/goal` or new-feature prompt, the `/sell-slice` route for "build Slice N.M", the `/pizza-party` route for a whole-app ask. Its `doctor` and `intake` commands stay, minus the Enforcement line. The three `PreToolUse` registrations and Cursor's `beforeShellExecution` entry are gone.
- **The Pass never refuses.** `checkbox-without-verdict` warns like every other check; `refusalOf`, `Finding.deny` and the policy's `enforcement` and `bypass` fields are removed.
- **Logging moved into the Pass.** `kitchen-log.sh` and `lobby-signal.sh` no longer sit in `hooks.json`: the Pass hands each classic event's envelope to them (`mod/relay.ts`), so Claude Code wires two hooks (`workflow-nudge.sh`, `shop-status.sh`) instead of twenty. Cursor still runs the scripts from `hooks-cursor.json`. On Claude Code below 2.1.299 the kitchen feed and Lobby signals stop.
- **The pizza-party interview always runs**, under `/goal` and loops too; a goal's keep-going covers the stops after it. Skipped only when the operator says so in words.
- **Pizza-party preflight names the auto-mode repo refusal.** Under auto mode Claude Code may refuse creating the GitHub repo or pushing to it; the interview now offers the allow rule up front, and the run never works around a refusal.
- The Feature intake block drops "(enforced)" and the override paragraph, and ends with "use judgment".

### Removed

- `hooks/pre-commit-guard.sh`: it warned on every scaffold commit of a new app. The Pass's `commit-on-main` warning covers Claude Code.
- The evals that tested behavior after a refusal: `pr-unverified-stops`, `refused-plan-write-no-workaround`, `checkbox-without-verdict-refused`.

### Fixed

- **Preflight checks ran inside a folder that did not exist yet.** For a new app every provider check (`gh auth status`, the host and database CLIs) failed to start, so GitHub and every provider read as signed out. They now run from the nearest existing parent.

---

## [6.0.0] - 2026-10-29

**Pizza party, enforced feature intake, enforcement on by default.** `/pizza-party` builds a whole app from a brief with one interview and no stops after it, replacing `/run-the-day`. New work in a ByTheSlice project must be documented with `/special-order` and built through `/sell-slice`, `/sell-pie` or `/pizza-party`, and a hook now refuses the shortcuts instead of warning. Discovery and plan-writing agents move to Opus, and every Opus agent runs at medium effort.

> [!IMPORTANT]
> **Breaking.** `/run-the-day` is removed; `/pizza-party` replaces it (with a checklist in place it resumes at the first phase not done). The `runPipeline` config block, read only by `/run-the-day`, is removed.
>
> **Enforcement defaults to `block`.** After upgrading, in any project with a master checklist, a hand-written stage file or checklist heading (with Write, Edit or from the shell), a code-writing Agent call outside `/sell-slice`, `/sell-pie` and `/pizza-party`, a PR carrying a slice with no `slice-verifier` pass, and a slice marked `[x]` with no verifier pass are refused. To get the old warn-only behavior, the operator sets `"enforcement": "warn"` in `bytheslice.config.json` by hand, or launches Claude Code with `BTS_ALLOW_BYPASS=1` for one session. An agent that tries either is refused.

### Why

On 2026-10-28 an agent in another project, on ByTheSlice 5.7.0, was asked through `/goal` for "a new pie". It hand-wrote the pie and eight stage files, built every slice with plain general-purpose agents, and opened a PR with no slice-tester or slice-verifier run. The first CI run failed four repo-wide guard tests a verifier pass would have caught. Every check was advisory, so nothing stopped it.

### Added

- **`/pizza-party` (replaces `/run-the-day`).** One AskUserQuestion interview (host, database and auth offered only from what the operator has authorized, never a default vendor), then no human stops: `/setup-shop`, a private GitHub repo, `/create-menu`, `/cook-pizzas`, the Prep pie, every pie through `/sell-pie` in ship-once delivery, one PR, a deploy (or an artifact or localhost link when no host is authorized), a smoke check against the brief's acceptance list, and a final report. Every would-be question is decided and recorded in the order ticket (`docs/pizza-party/order.md`); a slice that exhausts its fix loops gets one replan through `/special-order`, then is deferred and reported. `scripts/pizza-party.js` runs the preflight (which provider CLIs are logged in, read-only), appends a run record to `~/.bytheslice/pizza-party/runs.jsonl` and prints `runs --brief <id>` so the same brief can be compared across models and plugin versions. Benchmark briefs live outside the repo in `~/.bytheslice/pizza-party/briefs/`.
- **Ship-once delivery** (`delivery.mode: "ship-once"`, `delivery.shipBranch`). Every gate is local: pies branch from a local ship branch, `/box-it-up --pie-local` runs the full local check and merges each pie with `--no-ff`, and `/box-it-up --ship` opens one PR for the whole app, runs CI once and merges on green. `pick-merge-strategy.js` gains `--mode pie|slice-merge|ship`.
- **Unattended runs** (`run.unattended`). `/create-menu`, `/cook-pizzas`, `/set-display-case`, `/final-quality-check`, `/open-the-shop`, `/sell-pie` and `/box-it-up` take recommended answers, record them and continue; a would-be blocker defers the slice (its commits move to a local `deferred/pie-N-sN.M` branch) and the run returns `complete_with_deferrals`. Fix caps never rise and destructive operations on shared resources the operator did not name are skipped.
- **Right-sized quality** (`quality.tier`: `standard`, `lean`, `auto`). Lean scaffolds lint, typecheck, unit tests, build and one `@smoke` Playwright spec; slice-verifier and the pie-local check run the same commands as the generated `ci.yml`. `/cook-pizzas` right-sizes the roadmap: the 20 to 30 stage band is a ceiling, never padding.
- **Provider-provisioned env** in `/open-the-shop`: under `run.unattended`, logged-in provider CLIs (or connected MCP servers) write `.env.local` through pipes that never echo a value (`skills/open-the-shop/references/provider-provisioning.md`, `scripts/merge-env.js`); services with no provider get a local substitute or a deferral. `/create-menu` no longer names any vendor as a default.
- **UI sources: the operator's registries, else the shadcn directory** (`ui.registries`, `ui.registryFirst`, `ui.useDirectory`, `ui.directoryTop`). `block-composer`, `component-crafter`, the implementer and `/set-display-case` install pre-built pages, blocks and components before writing UI by hand. They follow the operator's own registry preferences first (config, `~/.bytheslice/defaults.json`, or the project's `components.json`), and otherwise the public shadcn registry directory (`https://ui.shadcn.com/r/registries.json`, 500+ registries; the healthy React ones, best ranked first), searched with `npx shadcn search` and installed by name. `scripts/ui-sources.js` resolves the list. Shipped mock data is replaced with real props, and a greenfield app is themed only from a theme the operator's own entry names. No registry is a plugin default.
- **Default UI rules** (`skills/sell-slice/references/ui-rules.md`). Every UI agent follows them unless the project's design system says otherwise: modern, minimal surfaces with one primary action per view; popular web apps that solve the same pattern as the quality bar; layered surfaces (`--background`, `--card`, `--popover`, `--muted`, `--sidebar`) visibly distinct through tokens only, checked by `compliance-pre-check` and generated by `token-expander`; explanations moved into tooltips instead of scattered across the surface; tokens built first and consistent labeling (every role, status and domain value shown with one label and one treatment across the app, from a semantic map defined once); fast input; no layout shift; and consistent micro-copy. `design-critic` measures `surface-contrast`, `description-sprawl`, `extra-primary`, `semantic-drift`, `layout-shift` and `copy-drift`, and `/set-display-case` writes the short form into the project rules file.
- **The workflow guard (`hooks/workflow-guard.sh`, `hooks/workflow-guard.js`).** The one ByTheSlice hook that refuses tool calls, wired on `PreToolUse` `Write|Edit|MultiEdit`, `Agent|Task` and `Bash`, on `UserPromptSubmit`, and on Cursor's `beforeShellExecution` (PR rule only). In a project with a master checklist it refuses, naming the skill to use: creating or hand-editing `docs/plans/stage_*.md`, or adding or renaming a pie or slice heading, outside `/special-order` and `/cook-pizzas`, with Write or Edit or from the shell (a redirect, `tee`, `sed -i`, a copy onto it, a script) (`phased-plan-writer`, `db-schema-stage-writer` and `master-checklist-synthesizer` pass; delivery skills may still append build notes to an existing stage file); dispatching an agent that can write files outside `/sell-slice`, `/sell-pie` and `/run-the-day` (read-only types such as `Explore` pass; an agent whose definition is not found counts as a writer); and `gh ... pr create` (including `gh as <user> pr create`) while a slice the branch's commits name, or every slice of a `pie-N` branch's pie, has no `slice-verifier` pass in the ledger (a project with no ledger at all only warns). A `/goal` or new-feature prompt gets the intake rule as context, a "build Slice N.M" prompt the `/sell-slice` route, and, in a folder with no checklist yet, an ask to build a whole app end to end a pointer to `/pizza-party`. `bytheslice:*` agents always pass. The active skill comes from the session's kitchen activity rows. Without Node it lets every call through.
- **`enforcement` config key** (`"block"` default, `"warn"`), read from `bytheslice.config.json` or `~/.bytheslice/defaults.json` by the guard and the Pass. **`BTS_ALLOW_BYPASS=1`** in the launch environment turns every refusal into a warning for one session. The guard refuses an agent's edit that sets `enforcement` to `warn` or adds `BTS_ALLOW_BYPASS` or `BTS_HOOKS_DISABLED` to `.claude/settings*.json`.
- **Feature intake block.** `skills/setup-shop/references/feature-intake.md` holds the rule; `node hooks/workflow-guard.js intake <root>` writes it into `CLAUDE.md` (or an `AGENTS.md`-only project's `AGENTS.md`), replacing an older copy in place. `/setup-shop` Step 4 (Flow B and C) and `rules-assembler` (`/cook-pizzas`) run it. `node hooks/workflow-guard.js doctor <root>` reports Feature intake, Enforcement, Hooks and Checklist; `/setup-shop` and `/open-kitchen` print it, and `/open-kitchen` offers to add a missing block.
- **Status drift in `bts_status`.** A slice open in the checklist whose ledger commit or `feat(pie-N): N.M` subject is on the default branch, and a slice `[x]` with ledger commits none of which reached it (skipped while its pie branch is checked out).
- **Stall HITL items close themselves.** A stall item now records the agent's id and is answered `via: 'auto'` on that agent's `SubagentStop`, at a watchdog scan that no longer lists it running, or, for another session's item, a day after it was raised. Older items are matched by the id their question names.
- **`tests/model-tiers/`** fails when the model-tier guide, an agent's frontmatter, a SKILL.md roster table, the config schema's `modelTiers` example or the Pass role defaults disagree, or when an Opus agent runs at any effort but medium.
- **Model evals (`evals/`).** Seven `claude plugin eval` cases run a real session in a fixture project, each with and without the plugin: a new-feature ask routes to `/special-order`, a slice build runs a baker with no ad-hoc agents, a PR with an unverified slice stops without a bypass attempt, a refused plan write is not redone through the shell, an unverified slice stays `[ ]`, and a one-file fix and a plain question are not pulled into the framework. On the three-run release pass (about $4 to $5) six of seven cases scored 1.0 with the plugin, and the seventh (the slice build) scored 1.0 on its own three-run rerun after the fix below; see `evals/README.md` for the command and cost caps. The suite drove two guard fixes before release: a plan file written from the shell (a heredoc, `tee`, `sed -i`, a copy onto it, a script) is held to the same rule as Write and Edit, and a "build Slice N.M" prompt gets context naming `/sell-slice N.M`.
- 171 new `hooks/test.sh` assertions (601 in all) and 9 new mod tests (`mod/enforcement.test.ts`) covering every refused path, the warn and bypass paths, the exemptions, intake and doctor.

### Changed

- **`checkbox-without-verdict` refuses under `block`.** A slice marked `[x]` whose slice-verifier never passed (no verdict, or a fail) is refused before the edit runs, with one `warn` row marked `blocked`. A pass at another HEAD still only warns.
- **Model tiers.** `discovery` and `scaffold-discovery` (haiku), and `complexity-assessor`, `phased-plan-writer`, `db-schema-stage-writer` and `master-checklist-synthesizer` (sonnet), move to opus. Every opus agent runs at effort `medium`: those six, plus `implementer` (was xhigh), `quality-reviewer`, `retrospective-reviewer`, `token-expander` and `ui-fix-attempter` (were high). `slice-tester`, `slice-verifier` and the reviewers stay on sonnet. The model-tier guide's per-agent table now lists all 52 agents, and the SKILL.md rosters, config schema, Pass role defaults and kitchen cast match the frontmatter.
- The project rules in `CLAUDE.md`, `docs/architecture.md`, `docs/pass-mod-spec.md`, `hooks/README.md`, `hooks/scenarios.md`, the README and the four manifest descriptions now say what refuses and what warns.

### Fixed

- **`bts_status` from a worktree said there was no checklist.** The Pass now reads the checklist from the session directory, else the primary checkout (a worktree cut from origin holds no gitignored plans), and `bts_status` reads the file once more when its state is still empty.
- The mod's policy test pinned 49 roles while 52 agents are registered.

## [5.7.0] - 2026-10-27

**UI review agents, kitchen polish and two delivery fixes.** Adds the break-ui and impeccable critique review agents (52 registered subagents), a person popover and glass sheet in the kitchen, and fixes for empty slice commits and gitignored checklist flips.

### Added

- **Two vendored UI review skills.** `skills/sell-slice/references/vendor/` holds break-ui (emilkowalski/skills `2d22863`, MIT) and the impeccable critique (pbakaus/impeccable `d34c87e`, Apache-2.0: `SKILL.src.md`, `critique.md`, the three mode files and `craft-floor.md`), copied verbatim with their LICENSE and NOTICE files and the pinned commits recorded. No upstream installer ran, and impeccable's launcher (a downloaded binary) is not vendored; `tests/vendor/` fails if a script folder or an executable lands there.
- **`break-ui-runner` (sonnet).** Workflow B step 5.1b in `/sell-slice` and `/sell-pie`, after `state-illustrator` and before `slice-tester`, on frontend and full-stack slices with data-bound UI. Loads each surface under the dev-only `?data=demo|worst|empty|one|many` switch, measures with DOM reads at 1440, 768 and 390, labels any check it inferred rather than ran, and writes a report with screenshots. `Broken` and `Ugly` findings join the 3 local fix loops; `Fragile` findings and its decisions are non-forcing warnings.
- **`design-critic` (sonnet).** The impeccable critique in no-launcher mode only: Assessment A under a `DEGRADED: single-context` banner, read-only DOM measurements in place of the detector, Nielsen heuristics scored 0 to 4 with `n/a` renormalized. Runs on new composite blocks at the Library Preview Gate (P0 or P1 stops a `self-critique` gate), once per pie at the `/sell-pie` boundary before `/box-it-up` (P0 and P1 become one batched HITL), and on the main surfaces in `/inspect-display` Phase 2b. Never per slice.
- **`ui-fix-attempter` (opus).** `fix-attempter`'s role on the opus tier, dispatched whenever a fix target comes from either review; fixes land in the component or data boundary, never the worst-case fixture.
- **Dev data switch.** `state-illustrator` Step 3b scaffolds the `?data=` switch and realistic fixture sets on data-bound surfaces, gated on `NODE_ENV === "development"`, with no floating on-screen control. `implementer`, `slice-tester` seeds and `library-entry-writer` fixtures now ask for realistic, varied demo rows, which the critique flags as `Fixture finding:` when they look like placeholders. `/set-display-case` records the critique's context file (`PRODUCT.md` / `DESIGN.md`, else `docs/design-system.md`) as `design_context`.
- 52 registered subagents (was 49); the Pass role defaults and the kitchen roster list the three new ones. A dry run against a sample frontend slice (`tests/fixtures/ui-review-sample/`) is in `docs/dry-runs/ui-review-skills/`.

### Changed

- **Kitchen people and menus.** Tapping a person in town shows a glass popover with See more; a name in the People lists opens the card and pans the camera to the person, or to the house or store they are in. The sheet title shows the person's name, the sheet uses the liquid glass look, and opening the popover closes the sheet (and the reverse). Night keeps most house windows lit and after hours only a few, chosen by position so they hold. The sun snaps to the shadow-map grid, so dawn shadows stop shimmering while panning. The full-face beard that read as a black block is now a small jaw and chin band.

### Fixed

- **Empty slice-close commits survived no rebase-merge.** A slice whose final commit has nothing left to stage (the checklist is gitignored by default) closes with an `--allow-empty` commit, and GitHub's rebase-merge silently drops those: Pie 7 lost three of its five `feat(pie-7): N.M` slice commits that way. `/box-it-up` now picks the merge strategy with `skills/box-it-up/pick-merge-strategy.js`, which takes a merge commit whenever the pie branch holds an empty commit, rebase otherwise, and asks when the repo allows neither. Phase 5 also confirms every branch commit subject reached `main`, and a gitignored checklist's Pie flip no longer tries to commit.
- **Merge-per-slice lost its checklist flips.** `docs/plans/` is gitignored by default, so a slice worktree cut from `origin/main` held no checklist or stage plans: the slice's `[x]` was made in a copy that `worktree remove` deleted, and the next run could pick the same slice again. `git-worktree-standard.md` now resolves `$PLANS` once per run (the primary checkout's `docs/plans` when ignored, the worktree's when tracked) and adds invariant 8. `/sell-pie` Phase 1-M hands agents absolute `$PLANS` plan paths and, with ignored plans, marks the slice in `$PLANS` only after its PR merges, so a red or halted slice keeps `[ ]`. `/sell-slice`, `/box-it-up` (including the last slice's Pie flip) and `/run-the-day` point at the same rule. New `tests/plans-location` proves the resolution against a real worktree.

---

## [5.6.0] - 2026-10-22

**The lobby: every project on one page.** Pie 7 (slices 7.1 to 7.5) deletes the six deprecated v4 agent shims and adds a machine-level lobby that lists every ByTheSlice project on this machine with its progress and one live state, and opens any project's city from its card.

### Added

- **The lobby (7.3, 7.4).** `mcp/lobby-server.js` serves `skills/open-kitchen/lobby.html` on `127.0.0.1` only (port 4466 or `BTS_LOBBY_PORT`, the next free one when taken; port file `~/.bytheslice/lobby/port`) with three routes: `GET /`, `GET /state` and `POST /open`. One card per registered project: name, folder, active pie and slice, a slices bar, slices and pies done over total, and one badge: **Needs you** (an open HITL item in the Pass ledger, or a session that hit a permission or idle prompt), **Active** (working or subagents running; the arrows spin, and hold still under reduced motion), **Done** (every pie done) or **Inactive**. The page polls every three seconds while visible and shows "Lobby offline, retrying" when a poll fails. `GET /state` rows are `{ key, root, path, name, pies, slices, active, activePie, activeSlice, sessions, state, kitchenUrl }`, and each read prunes registry rows whose folder is gone. A click opens a running kitchen, or starts a registered project's kitchen through `POST /open` (realpath allowlist against the registry, one start per root); the lobby writes nothing else.
- **`/open-kitchen --lobby` (7.5).** `open-kitchen.js --lobby` reuses the running lobby when its `/state` answers a `projects` array, else starts `lobby-server.js --serve-only` detached and waits at most eight seconds, printing only `http://127.0.0.1:<port>/`. `--lobby` with `--project` is a usage error.
- **Idle kitchen and the Lobby button (7.4).** A kitchen opened from a card carries `?lobby=<port>`, which shows a **Lobby** button in its header, and for an Inactive or Done project `&idle=1`: no customer line, a "Nothing is in progress in this project" notice and unlocked time-of-day buttons until the kitchen sees an agent at work.
- **Kitchen `/lobby` redirect (7.5).** Every kitchen answers `GET /lobby` with a `302` to `http://127.0.0.1:<port>/` when the lobby's port file names a lobby whose `/state` answers a `projects` array, else `404`, so a kitchen opened without `?lobby=` still has a way there.
- **The `lobby-signal.sh` hook (7.2).** Registers a ByTheSlice project's primary checkout (worktrees roll up to it) in `~/.bytheslice/projects.json` (`BTS_HOME` moves the folder) and keeps one `signals/<session>.json` flag file per session (working, subagent count, waiting kind). Writes are atomic, mode 0600, under a short lock, and it reads only the session id, event name, notification type and cwd: never a prompt, message or secret. New `hooks/hooks.json` entries on `UserPromptSubmit` and `Notification` (the plugin's first on either), plus `SessionStart`, `SubagentStart`, `SubagentStop` and `Stop`. `hooks/hooks-cursor.json` runs it on `sessionStart`, `beforeSubmitPrompt`, `subagentStart`, `subagentStop` and `stop`, answering `{"permission":"allow"}` on `subagentStart` and `{"continue":true}` on `beforeSubmitPrompt`. Cursor has no Notification equivalent, so a Cursor session never shows Needs you from a waiting prompt.

### Changed

- **Same-site page navigation (7.3, 7.4).** The kitchen and the lobby each accept `Sec-Fetch-Site: same-site` for a top-level `GET` page navigation only (the kitchen's `/` and `/?query`, the lobby's `/`), so the two can link to each other across `127.0.0.1` ports. `/state`, `/open` and `/lobby` stay same-origin only.
- **The kitchen serves `/` with a query string (7.4).** `/?lobby=<port>&idle=1` answers the same page; the server never reads the query.
- **Docs and manifests (7.5).** The README, `docs/architecture.md`, `hooks/README.md`, the `open-kitchen` skill and command, and the four manifest descriptions cover the lobby, its read-only story and its privacy limits.

### Removed

- **The six v4 agent shims (7.1)**, as 5.5.0 announced: `skills/run-the-day/agents/stage-runner.md`, `skills/run-the-day/agents/pr-reviewer.md`, `skills/sell-slice/agents/basic-checks-runner.md`, `skills/sell-slice/agents/aggregating-test-reviewer.md`, `skills/sell-slice/agents/ci-cd-guardrails.md` and `skills/sell-slice/agents/frontend/visual-reviewer.md`. The manifest lockstep test no longer allows any unregistered agent file, and the skills, references, README, `docs/agents.md` and manifests no longer mention them.

### Notes

- Hooks run from the installed plugin, so the lobby fills only after 5.6.0 is installed and a session starts in each project. A cache-installed plugin needs a reinstall (or a marketplace update), then a new session.
- The 7.5 production test drove the hook script by hand from the pie worktree, because the installed plugin predates 5.6.0; live hook firing is to be re-confirmed once this release is installed.
- A kitchen still running from a session that loaded an older plugin answers a lobby card's click with 403 (it predates the same-site page allowance), though the card shows it as running. Restarting that session on 5.6.0 replaces it.

---

## [5.5.3] - 2026-10-21

**Cursor gets hooks that actually fire.** Cursor matched none of the Claude Code event names in `hooks/hooks.json` and left `${CLAUDE_PLUGIN_ROOT}` empty, so every hook was a silent no-op there.

### Fixed

- **Cursor hooks.** A new `hooks/hooks-cursor.json` in Cursor's format (version 1, camelCase, flat entries, `${CURSOR_PLUGIN_ROOT}`), named by the `hooks` key of `.cursor-plugin/plugin.json`. It runs `shop-status.sh` on `sessionStart` (as `additional_context`) and `pre-commit-guard.sh` on `beforeShellExecution`. With `BTS_HOST=cursor` both scripts answer in Cursor's JSON, and the guard prints `{"permission":"allow"}` on every exit, because Cursor blocks a command whose hook prints no JSON. Clears the plugin audit's `cursor/hooks-claude-shape` and `cursor/claude-plugin-root-var` errors.

---

## [5.5.2] - 2026-10-21

**No box to carry when the pies are already served.** The Pass stops pointing at `/box-it-up` once there is nothing left to ship.

### Changed

- **Pass band, prompt hint and `bts_status`** say `/box-it-up ready` only while every slice is done and a pie branch is still checked out. After the last pie merges (on `main` or a detached HEAD) the band reads **All pies done**, the hint is left alone, and `bts_status` says nothing is left to box.

---

## [5.5.1] - 2026-10-21

**Profiles stop covering the kitchen.** A person's profile now opens as a screen inside the People sheet instead of a dialog over the scene.

### Changed

- **Kitchen profiles** open inside the People sheet, from a list name, a family link, a house card or a tap in the scene. A **Go Back** button (or Escape) returns to the Crew or Town list it came from, and the scene stays free to pan, zoom and click while a profile shows.

---

## [5.5.0] - 2026-10-21

**The frontend path: verifiable, and taught what it is building.** Pie 6 (slices 6.1 to 6.7) gives frontend slices the same build manifest, Exit-criteria contract and rendered checks the backend path already had, makes the understand pair run in order, gives user outcomes one sanctioned way into verification, and lets the builder look up what an installed dependency already ships.

### Added

- **Frontend build manifest (6.1).** `state-illustrator`, the last step of the frontend path, reads every implemented file and emits the build manifest from the files on disk, so `slice-tester` and the verifier's under-declaration backstop see frontend surfaces too. A frontend manifest that declares nothing asks instead of passing.
- **Frontend statics script (6.3).** `skills/sell-slice/scripts/verify-frontend-statics.sh` resolves token references against the project's own catalog and flags unknown tokens, `var()` fallbacks, motion literals off the scales, `<img>` without `alt` and unlabeled controls. `slice-verifier` runs it once per frontend slice; its findings are warnings that never fail a slice.
- **Rendered accessibility pass (6.4).** `slice-tester` checks contrast, keyboard reach and order, visible focus, focus traps, errors not signalled by color alone, reduced motion and dark-mode parity on every frontend slice and every full-stack slice with UI. **Overnight decision: the a11y verdict is blocking** (the operator default taken while the operator was away): any a11y `fail` forces `overall: fail` and enters the same 3 local fix loops.
- **User-flow channel (6.6).** A pie block in the master checklist may carry a `**User flow:**` list of 3 to 7 numbered steps, each ending `- Slice N.M`. `stage-decomposer` proposes it, `master-checklist-synthesizer` writes it, and a step no slice owns shows up as a warning in the Phase 2 approval prompt (never a block). The owning frontend or full-stack slice gets exactly one Exit line in the sanctioned form `slice-tester completed <flow step> end-to-end on /<route> with zero console errors (screenshot at 1280 in transcript)`; a slice that owns no step writes none. A `hooks/test.sh` case proves the steps never change the hook parser's slice counts.
- **Dependency capability audit (6.7).** `block-composer` Step 2b runs only when a gap exists and the slice hits its keyword list, looks up at most 3 installed packages through Context7, and writes `docs/component-rules-<slice>.md` only when it found rules (`CR` mandatory, each ending "Do not implement this manually."; `AR` advisory). Its return gains `dependency_audit` (`ran`, `lookups`, `rules_file`, `degraded`). `component-crafter` reads the rules first and returns `rules_consumed` and `rules_deviated`. `tool_absent` and `lookup_failed` are reported apart and both fall back to `capability_unknown`, today's behavior.
- **Manifest lockstep test (6.7).** `node --test tests/manifest-lockstep/` fails when an agent file is neither registered nor a documented deprecated shim, when an `agents[]` entry is missing on disk, when name, version or description drift across the manifests (name and version for `package.json`), or when a `SKILL.md` description is unquoted.

### Changed

- **Exit criteria reach the frontend producers (6.2).** All six frontend producers receive the slice's Exit criteria verbatim and are graded against it; `slice-tester`'s inputs do not change.
- **Phantom enforcers repaired and allowlists added (6.2).** No agent names a verifier outside the live dispatch table; `library-entry-writer` and `slice-verifier` gained `tools:` allowlists. `block-composer` treats a missing shadcn MCP as `needs_human` instead of reporting 0 percent coverage, reports `installed_files`, and calls a low-coverage keyboard-heavy slice hand-rolling territory. Five frontend producers can now report all four HITL categories.
- **Signature bail and revert on regression (6.4).** A repeated error signature ends the fix loop early inside the 3-loop cap, a patch that turns a green gate red is reverted before the next fix, and the CI fix loop in `box-it-up` mirrors the same rule.
- **Serialized understand pair (6.5).** **Overnight decision:** `modern-ux-expert` runs first and `layout-architect` only after it returns, in both `sell-slice` and `sell-pie`; `layout-architect` reads the UX spec in full, appends the breakpoint plan to it, and asks (`prd_ambiguity`) when the spec is missing.
- **Context7 identifier (6.7).** `block-composer` lists only `mcp__claude_ai_Context7__resolve-library-id` and `mcp__claude_ai_Context7__query-docs`, the names a claude.ai Context7 connector exposes (confirmed with `claude mcp list` and a live session). A Context7 server installed another way reports `tool_absent`.
- **`slice-tester` tools (6.7).** The allowlist gains the Chrome extension's `javascript_tool` and `computer` in both name forms, so the a11y pass can read the DOM and press Tab outside a batch too.
- **Hygiene (6.7).** One description and one keyword set across `.claude-plugin/plugin.json`, `.cursor-plugin/plugin.json` and both marketplace files, all stating 49 registered subagents plus 6 documented deprecated shims (as do `docs/agents.md` and the README). Every `SKILL.md` description is quoted, which fixes `set-display-case`'s strict-YAML parse error. `inspect-display`, `platform-walker`, `close-shop`, `retrospective-reviewer`, the config schema and the model tier guide no longer describe `visual-reviewer` as a live reviewer; `slice-tester` owns the per-slice rendered review. Em and en dashes are gone from every file this pie touched.

### Deprecated

- **The six v4 shims stay this release** (`stage-runner`, `pr-reviewer`, `basic-checks-runner`, `aggregating-test-reviewer`, `ci-cd-guardrails`, `frontend/visual-reviewer`): on disk, unregistered, documented, and listed by path in the lockstep test. They are deleted in the next minor.

### Notes

- The Library Preview Gate guard under `sell-pie` (6.2) was not rebuilt: its hook was retired in 5.4.0.
- A changed agent file takes effect in the next session, and a cache-installed plugin needs a reinstall to pick up 5.5.0.

---

## [5.4.0] - 2026-10-21

**The Pass: every order checked at the counter.** A Claude Code mod draws a live ticket rail beside the chat, keeps one ledger of what actually happened, and checks each delivery rule as it happens, warning instead of blocking. The hooks shrink to three scripts that never block, and the kitchen measures real progress and fills its town. Retired hooks: `stage-plan-guard.sh`, `library-gate-guard.sh`, `record-library-approval.sh`, `compact-snapshot.sh`.

### Added

- **The Pass mod** (`mod/`, Claude Code 2.1.299+), loaded from `hooks/hooks.json` `modules`. A pane, *The Pass* (pie header, slice rail with status and last verdict, live agents with stalls flagged, the latest check warnings, the HITL inbox, the active slice's touched files, the team roster, the project's other sessions), a band above the prompt (`Pie 5 · Slice 5.2 verifying · 3 agents · fix 1/3 · HITL 1`, in a warning style on a failed verdict, an open HITL item or a recent warning), a status line, a `/box-it-up ready` prompt hint, and toasts on a slice done, a failed verdict, a push and a warning. The pane opens on its own in an interactive session with a master checklist. `/pass` toggles it; `/pass checks`, `/pass history`, `/pass replay <slice>` and `/pass reconcile` cover the rest.
- **The ledger**, `.bytheslice/ledger.jsonl` in the primary checkout (one file for every pie worktree, kept out of git by its own `.gitignore`): pie and slice starts, verdicts at the commit they judged, commits, pushes, merges, warnings, HITL raised and answered, stalls, decision notes, usage, slice rollups, and file edits as path and role only. Agent starts and stops come from the kitchen activity log rather than a second recorder. No row holds a prompt, an agent message, file contents or a secret.
- **Model tools**, listed from the first turn: `bts_status` (the pane's projection in under 40 lines, with a `Next:` line that is advice), `bts_note` (a decision note), `bts_hitl` (raise or answer a HITL item), `bts_pr_body` (the pie PR's Evidence section) and `bts_wake` (a teammate's timed wakeup message).
- **Warn-only checks and spawn policy.** Ten codes: `checkbox-without-verdict`, `checkbox-without-tester`, `push-slice-done-unverified`, `fix-loop-cap`, `commit-on-main`, `plan-write-during-bake`, `model-policy`, `model-drift`, `builder-context`, `gate-teamified`. Each finding writes one `warn` row, one toast and a note the model reads, and the edit, spawn, commit or push always runs. The spawn policy's tiers mirror each agent's `model:` frontmatter (`tests/pass/policy-parity.test.js` keeps them equal). `bytheslice.config.json` key `pass` overrides roles, context markers, `checks.enabled` and `checks.requireTester`, each override recorded once in the ledger.
- **Watchdog and HITL inbox.** A 30-second scan flags an agent past its role's budget (15 minutes; `discovery` 5, `implementer` 30) with 3 minutes of no activity: the first stall writes `agent.stalled`, a toast, a pane flag and a hidden note to the main conversation, and a second stall in the slice opens a pane HITL item. It never stops an agent. `bts_hitl` items show in the pane and the band, send one native notification titled `ByTheSlice needs you` (a toast when no channel sent it), keep at most 500 characters of the answer with secret shapes redacted (nothing for `external_credentials`), and close when the operator replies in chat. The fix cap opens one inbox item per loop. `pass.watchdog` overrides the thresholds.
- **Team mode.** A Team section and `· n bakers` in the band while teammates exist; teammate turns, skill starts, `teammate.idle` and `teammate.done` land in the ledger attributed to their pie; a `teammate` model role (opus or sonnet).
- **Replay and touched files.** `/pass replay <slice>` steps through each commit of a slice (and its uncommitted changes) with per-file numstat, the roles that edited each file and its diff. The pane's Touched section lists the active slice's files from `git diff --numstat` and draws red any file a builder edited after the verifier's pass.
- **Cross-session strip and history.** Sessions of one project see each other's pie, slice and status read-only in the pane's roadmap strip. `/pass history` prints progress per pie. [`scripts/ledger-summary.js`](scripts/ledger-summary.js) (zero dependencies, read-only) is the one fold every reader uses: `--format text`, `json` and `pr-body`.
- **Kitchen Progress sheet.** A header button in `/open-kitchen` reads `progress` from `GET /state`: one block per pie with a slice table (started, done, duration, fix loops, verifier verdict, cost) and an inline SVG step line of slices done over time. Without a ledger it says so.
- **Retro feed.** `/close-shop`'s `retrospective-reviewer` runs the fold and cites fix-loop depth, warnings by code, stalls, HITL wait and cost per slice, saying "not in the ledger" when a metric is absent.
- **Kitchen polish** (merged as PR #44): *measured slice progress* (tasks committed of each linked plan, counted from `feat(pie-N): N.M task K` subjects on local branches, plus the current step; never an estimated percent); *pie details* for any served or planned pie in the Orders sheet; a *readable activity log* ("Ren (line cook, builds code) started building slice 5.2"); a *base crew* (Dom, Ollie and Sal on ambient duty with Chef Nico while a pie is open, running agents in a gold work tag); a *roaming crew* (off-duty crew live in town and run in when their agent starts); *one ballgame a day*, after which players, coaches and fans go home and into town; and a *People sheet* with Crew and Town tabs and a profile card for every crew member and townsperson.

### Changed

- **Hook set reduced.** Three scripts remain: `kitchen-log.sh`, `shop-status.sh` and `pre-commit-guard.sh`. Nothing blocks: every script exits 0, and a warning reaches the model as hook context. `hooks/README.md` keeps the inventory and the evidence (408 sampled sessions) for each decision.
- **`pre-commit-guard.sh` warns instead of blocking** a `git commit` on `main` or `master`. It never reads `$CLAUDE_PROJECT_DIR`, and shell forms it cannot follow warn "branch unknown". 22 of its 25 recorded blocks had been false.
- **Session skill marker dropped.** `kitchen-log.sh` no longer writes `last-precheck.json`: nothing reads it, and the mod tracks the active skill itself.
- **PR body gains a generated Evidence section.** `/box-it-up` writes `bts_pr_body`'s Markdown (slice table with the verifier verdict at its commit, fix loops, models, duration and cost, warnings per code, HITL waits, decision notes) under `## Evidence` after the `--fill` content.
- **Kitchen time lock in live mode.** While a real session drives the scene, the time-of-day buttons are visibly disabled with the tooltip "Time follows the real session"; the demo shop keeps them working.
- Release manifests and npm metadata advance together to 5.4.0, and the Claude plugin descriptions mention the Pass. The npm `files` list ships `mod`, `scripts/ledger-summary.js` and `docs/pass-mod-spec.md`. README (new *The Pass* section), architecture (new *The Pass mod* section), CLAUDE.md, the agent roster and the mod spec (status: shipped, warn-only wording) describe what shipped.

### Removed

- `hooks/stage-plan-guard.sh` (PreToolUse Write/Edit): the mod's `plan-write-during-bake` covers it; it never warned across 1,706 plan writes.
- `hooks/library-gate-guard.sh` (PreToolUse Write/Edit): never armed and never warned; 3,871 watched-path writes were all silent.
- `hooks/record-library-approval.sh` and its `library-approvals.json`, retired with their only reader.
- `hooks/compact-snapshot.sh` (PreCompact) and its `compact-snapshot.json`: written 19 times, never read. `shop-status.sh` already re-injects the checklist summary after a compaction.

### Fixed

- Kitchen: the Main and Oak traffic deadlock is gone, and walkers in the road refuse any step that closes on a car.
- Kitchen: Tess stands behind her lemonade counter instead of showing through it.

### Notes

- **Minimum versions.** The Pass needs Claude Code 2.1.299 (mods exist since 2.1.287); below that, or on a version the engine cannot report, it stays inert and logs one line. Team mode also needs agent teams (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`) and was proven on 2.1.302 in-process. Without the mod everything still works; the pane, band and checks simply do not appear.
- **Hosts that lose coverage.** Cursor (which never loads the mod) and Claude Code below 2.1.299 now get no warning for a plan write during a bake, none for a production-route write before a library approval (the `sell-slice` Phase 4.5 stop holds the line), and no compaction snapshot. The commit-on-`main` warning stays everywhere hooks run.
- **Spike answers.** An in-process teammate has neither `Workflow` nor `ScheduleWakeup` but can call mod tools, so `bts_wake` stands in for the wakeup and **pies stay sequential**: a two-pie team bake is not possible on 2.1.302. `classic.TeammateIdle` and `classic.TaskCompleted` do not run in an organization-managed install unless the organization lists the plugin. A mod's `$.http.fetch` reaches both localhost and the network, but the shared live page was not built: the PR's Evidence section and the local Progress sheet cover collaboration.

---

## [5.3.0] - 2026-10-20

**Ship each slice without babysitting it.** Gates run in tiers instead of the full ladder at every step, fixes are capped hard, approvals arrive as one batch, and an opt-in mode merges every slice to `main` on green CI.

### Added

- **Merge-per-slice delivery (opt-in).** An explicit autonomous-delivery run instruction, or `delivery.mode: "merge-per-slice"`, gives each slice its own branch `pie-N-sN.M-<scope>` cut from fresh `origin/main` into its own worktree, its own PR `Slice N.M: <name>`, up to 3 CI fix rounds, and a merge commit on green with no per-slice approval. Cleanup runs from the primary checkout after every merge; the next slice starts from the fresh `main`; the operator gets one notice per pie; the kitchen merge record is written once, after the last slice. The run instruction wins for that run, `review: continuous` pies always keep one PR per pie, and a repo that disallows merge commits halts and asks. `/sell-slice` standalone supports the same closeout (`/box-it-up --merge-slice`, run internally).
- **Tiered gates.** Tier 1 while coding (lint on changed files, incremental typecheck, colocated unit tests), tier 2 before each commit (the slice's own tests, build, DB tests only when the schema or migrations changed), tier 3 once at slice end (`slice-verifier` runs the full local suite one time), tier 4 in CI at the PR. Stage templates, canned stages, the plan writer and the synthesizer write exit criteria in these tiers. The husky `pre-push` template runs tier 2, `husky-installer` offers to swap an old full chain, and `--no-verify` is named only as a prohibition.
- **Targeted re-verification.** After any fix, `slice-verifier` carries green checks forward, re-runs only the gates the fix could change (chosen from the fix's `files_changed`), and reports them in a new `rerun: [{gate, reason}]` field. The full suite never re-runs after a fix.
- **Batched approvals.** Every approval a slice needs (build plan, migrations, live loads, size exceptions, terms, credentials) goes out as one batch of short questions with recommended answers. The Library Preview gate stays its own stop.
- **Calendar-gated exit criteria.** A criterion marked `(date-gated, on or after YYYY-MM-DD)` leaves the slice `waiting until <YYYY-MM-DD>: <criterion>`; the loop skips it and its dependents, nothing waits in a loop, and the next run on or after the date closes it. A pie with a waiting slice is not complete for the boundary.
- **Soft slice time budget.** `delivery.sliceBudgetHours` (default 3, `0` = off) counts wall-clock including CI and excluding operator waits. On a hit the conductor lets the current agent finish, then checks in once (extend or stop).
- **Fallback agent shape.** On a host without plugin-agent registration, each agent's frontmatter travels as a header: model tier and effort (mapped to the host's model choice), the tool allowlist normalized from any of the four frontmatter forms, the verbatim read-only line for agents without write tools (`slice-tester`'s probes and seeds excepted), and the no-git-writes line. The conductor logs one self-check line per dispatched agent in `.claude/.bytheslice-state/run-log.md`.

### Changed

- **Fix cap is hard:** 3 local fix loops per slice (fix; then debug instrumentation plus fix; then fix with the full evidence) and 3 CI fix rounds per PR, separate counters. Run instructions such as "continue until verified" or "never stop" never raise them; only the operator's explicit reply at the HITL does.
- **Clean tree at every task boundary.** Each `### Task K` is committed and pushed as `feat(pie-N): N.M task K <name>`; the slice closes with `feat(pie-N): N.M <slice name>` and may not leave an untracked or modified file it created. One slice per PR boundary, task commits inside.
- **Only the conductor makes git writes, `git add` included,** on the registered and fallback paths. `implementer`, `fix-attempter`, `debug-instrumenter`, `library-entry-writer` and `ci-fix-attempter` return `files_changed`; the conductor stages selectively, commits and pushes.
- **No proof ledgers.** Artifact hashes, source freezes, fingerprint files, leases and per-step proof files are banned. Allowed evidence: verdicts, Playwright traces for failures, one 768px and one 1280px screenshot per new UI surface, a checklist note of 3 lines or fewer per slice, and one run log. Operational state files and the closing-narrative paragraph stay. The Pass mod ledger (`docs/pass-mod-spec.md`) is the explicit exception and the single sanctioned completion record; its spec gains a status note pointing its agent events at the kitchen activity log.
- Default `verification.viewports` is now `[375, 768, 1280]`; `slice-tester` exercises every width and screenshots only at 768 and 1280.
- Every agent dispatch site (`sell-slice`, `sell-pie`, `box-it-up`, `final-quality-check`, `special-order`, `open-the-shop`, `inspect-display`) points its fallback at the new agent-shape section.
- Release manifests and npm metadata advance together to 5.3.0. CLAUDE.md, README, architecture, agent roster and the `sell-pie` / `box-it-up` / `special-order` command docs describe the new rules.

### Removed

- Removed the blocking UserPromptSubmit precondition hook (precheck-skill.sh); skills check preconditions inline and ask instead of refusing; kitchen-log.sh now writes the session skill marker.

### Fixed

- **`/box-it-up` pie cleanup ordering.** The checklist flip used to land on `main` uncommitted, `git checkout main` ran inside the pie worktree (where `main` cannot be checked out), and `git branch -d` ran before `git worktree remove`. The flip is now committed on the pie branch before the PR merges, and every cleanup step runs from the primary checkout in order: `pull --ff-only`, `worktree remove`, `branch -d`, remote delete, `worktree prune`.
- **`rules-loader` resolves every config key.** It now returns `verification.*`, `flow.*`, `review.*` and the new `delivery.*` keys (with plugin defaults when unset), as `/sell-slice` already assumed.
- `/open-kitchen`'s SKILL.md now opens with its YAML frontmatter on line 1 (the file-path comments moved below it), so clients that require frontmatter on the first line no longer reject the skill at parse time.
- Leftover em dashes in hook scripts replaced.

---

## [5.2.0] - 2026-10-17

**Watch the kitchen while the project takes shape.** The new local 3D viewer connects project setup, checklist orders and agent activity to the shop scene.

### Added

- `/open-kitchen`, its direct Node launcher, and a bundled read-only `kitchen_state` MCP server with protected loopback `GET /` and `/state` routes. The viewer refreshes every three seconds while visible and offers a browser handoff button.
- Named kitchen characters for all 49 registered agents, a second implementer instance, temporary helpers, construction fixtures, session lighting, and checklist-driven orders and customer queues. Projects without setup evidence show a sample demo shop.
- A fast synchronous lifecycle logger with a strict metadata allowlist, 120-character dispatch descriptions and one 2 MiB rotation backup. It never records prompts, agent final messages, tool output or environment values.
- Per-fixture presence and applicability evidence, completed-Prep exemptions, a literal successful environment-check marker, and a bounded confirmed-Pie-merge record for after-hours transitions.

### Changed

- Release manifests and npm metadata advance together to 5.2.0. The npm allowlist includes `mcp`; complete plugin copies include the kitchen runtime, hooks, brand assets and supporting docs. Skills-only copies remain skills-only.
- README, architecture, hooks and agent documentation describe the live kitchen and its privacy limits. The Cursor marketplace description now reflects the Pie/Slice workflow.

### Verification status

- Both artifact host bridge names returned `server_not_connected`; the localhost Browser-pane path is selected. Native `/open-kitchen` invocation, production discovery, `/sell-pie` and a real production `/sell-slice` acceptance run remain pending. Local helper and fixture checks do not establish production verification. The viewer still fetches Three.js from unpkg and Google Fonts.

---

## [5.1.5] - 2026-10-16

**ByTheSlice has a logo.** The red script wordmark now heads the README, the docs and this changelog, and both plugin manifests point at it so marketplaces can show it.

### Added

- `assets/brand/`: `logo.png` (transparent wordmark, for docs and READMEs), `logo-square.png` (512 by 512 on cream, for marketplace and directory tiles) and `logo-source.webp` (the original artwork, kept for re-exports).
- `.claude-plugin/plugin.json` sets `icon` to the square logo, which Anthropic's plugin directory reads for the listing. `.cursor-plugin/plugin.json` and the Cursor marketplace entry set `logo` to the same file.
- `package.json` ships `assets/brand` so the paths the manifests name exist in the npm package.

### Changed

- README, `docs/architecture.md` and `docs/agents.md` open with the wordmark.

---

## [5.1.4] - 2026-10-14

**Commits inside a git worktree are judged by the worktree's branch.** The commit guard no longer refuses a feature-branch commit just because the primary checkout sits on `main`.

### Fixed

- **`pre-commit-guard.sh` blocked every commit made inside a worktree when the primary checkout was on `main`.** `bts_branch` read HEAD from `bts_root`, which returns `$CLAUDE_PROJECT_DIR` first, and Claude Code points that at the primary checkout even when the session commits inside `.claude/worktrees/<name>` on a feature branch. Reproduced 2026-10-05 in a project whose worktree was on `mr/subgetr-public-assets`. The guard now resolves the directory each commit actually runs in through the new `bts_commit_dirs` helper: `cd` / `pushd` steps before the commit (quoted, backslash-escaped, relative, and `~` paths, plus `cd -`), then `git -C <dir>` or `--git-dir` on the commit itself, then the hook input's `.cwd` (or the process cwd) when it is inside a repo, and only then `$CLAUDE_PROJECT_DIR`. Every `git commit` in a command is checked, so a later commit on `main` cannot hide behind an earlier worktree commit. Shell forms the parser cannot model (a `cd` inside a subshell or `bash -c` that ends before the commit, `popd`, `$VAR` or `$(...)` paths, `GIT_DIR=`) fail closed: every directory the command visits is checked, plus `$CLAUDE_PROJECT_DIR` for an unexpandable path. Real commits on `main`/`master` are still refused, and the refusal now names the directory it checked.
- **`git -C <dir> commit` on `main` slipped past the guard entirely.** Detection was a substring match on `git commit`, so any `-C` (or other global option) between `git` and `commit` hid the commit, as did `--git-dir`/`--work-tree` and `GIT_DIR=`. Detection now parses git's global options (including the space-separated `--git-dir <dir>` form), still catches `/usr/bin/git commit`, backtick, and `bash -c '...'` forms, and stops treating `git commit-tree` as a commit.
- **The jq-less fallback truncated commands at the first escaped quote**, so `cd \"<dir>\" && git commit` lost its target. It now reads JSON string values with escapes intact and decodes `\\`, `\"`, `\n`, and `\t`.
- `bts_branch` and `bts_branch_class` accept an optional directory; callers that pass none keep the old `bts_root` behavior.
- `.cursor-plugin/marketplace.json` had drifted at 5.1.0 through the 5.1.1 to 5.1.3 releases. It now matches the other manifests.

### Tests

- `hooks/test.sh` gains a worktree fixture (primary on `main`, two linked worktrees on feature branches, one path containing a space) and 40 new assertions covering `git -C`, `cd &&`, relative, quoted, backslash-escaped, and `~` paths, hook cwd and input `.cwd`, blocking `main` when targeted from a worktree, multiple commits in one command, subshell `cd`, `cd -`, `pushd`, `cd -P`, `--git-dir`, `GIT_DIR=`, unexpandable paths, path-qualified and backtick `git`, `bash -c`, the `$CLAUDE_PROJECT_DIR` fallback, `master`, `commit-tree`, and the jq-less path. A `run_guard` helper builds the hook payload from a raw command. Commit-guard cases now pin the hook's cwd so the suite no longer depends on which branch the plugin repo itself is on. 147 passing; the 5.1.3 guard fails 23 assertions.

---

## [5.1.3] - 2026-09-11

**The plugin loads again, and slice plans carry contracts.** Two releases of hook and manifest fixes (5.1.1, 5.1.2) went out without a changelog entry of their own and are folded in here, alongside the plan-format change and the accessibility discovery pass. Anyone on 5.1.0 or earlier should update: 5.1.1 and 5.1.2 were both published at versions that never carried release notes, and the plan-format work sat on `main` at an unbumped 5.1.2 where `claude plugin update` could not see it.

### Added

- **Accessibility discovery pass in `/final-quality-check` (sub-block F)**, running right after the design-system compliance block. New `a11y-discovery-runner` agent (sonnet, readonly, registered as the 49th live subagent) runs `@shadscan/cli` scoped to `--category accessibility` and `--category foundation` only, discards every finding whose path is inside the operator-only `/library` showcase route, tags each survivor against three confirmed false-positive classes, and returns the lot as UNVERIFIED LEADS in a dedicated stage-report section.
- **shadscan guardrails in `references/prd-ci-cd-checklist.md`**, so sub-block H copies them verbatim into the project rules file and they bind every later slice: never wire `--fail-under` into `.husky/pre-push` or any CI workflow, never run `--apply` or `shadscan setup`, treat every finding as a lead to verify against source, and discard library-showcase paths. The three documented false-positive classes are dependency sniffing (fails "toast provider present" on a `package.json` lookup despite a mounted hand-rolled provider), named-helper indirection (cannot follow a guard extracted into `isTypingTarget()`), and unresolved components (fails "async action pending state" with evidence reading "could not be resolved").
- **Completion-checklist section 3.5**, covering the discovery pass as run-and-reported rather than passed, plus a grep confirming no shadscan step leaked into the pre-push hook, the workflows, or branch protection.

### Changed

- **Slice plans carry contracts, not implementations.** `phased-plan-writer` used to demand "full file contents or full function bodies" for every task, so a real project's 41 plan files ran 23 to 93 KB each and 71 to 90 percent code by line, all written by a sonnet writer in parallel before the repository existed. That code was speculative (the project's own checklist records plan blocks that would have deleted routes shipped by earlier slices), it cost every downstream reader 15 to 25k tokens per plan, and `spec-reviewer` then graded the stronger builder against the weaker planner's guess. The writer now has a "Code budget": fences hold commands, schema DDL, exported signatures and type shapes (about 15 lines each), and byte-exact config; component, route, action, hook, utility, and test bodies are prose (behavior, states, edge cases, named test cases), with a soft target of roughly 400 lines per plan. `templates.md` gains a matching "Contract, not implementation" section and a contract-shaped Task example, `db-schema-stage-writer` keeps full DDL but drops application code, `implementer` treats plan bodies as sketches and owns the implementation, and `spec-reviewer` verifies the contract (names, shapes, schema, behaviors) instead of a line-for-line match. "No placeholders" still applies to everything the plan does carry.
- **Checkboxes in every generated checklist are now GitHub task-list items (`- [ ]`), reversing the v2 "no leading dash" rule.** A bare `[ ]` with no list marker is plain text to GitHub and every CommonMark renderer, so a slice's completion and exit criteria collapsed into one paragraph and read as a horizontal blob on github.com. The rule flips in `cook-pizzas` (templates, both plan writers, the synthesizer), `special-order`, `create-menu`, `close-shop`, `set-display-case` (including the rules block it appends to the project's own rules file, which had been teaching every later hand edit the broken form), `open-the-shop`, and `final-quality-check`. The hooks already counted both forms, so checklists generated before this release keep working without a rewrite; `hooks/lib/checklist.sh` now documents bare `[ ]` as the legacy form.
- **Heading separators in the checklist and slice templates use a colon** (`## Pie N: Name`, `### Slice N.M: Name`) instead of an em dash. The hook regexes never keyed on the separator, and real projects were already substituting the colon.
- **Phase 3 sub-blocks relettered to stay strictly sequential** now that a block was inserted mid-sequence: branch protection moved `F` to `G`, and the project-rules append moved `G` to `H`. The rule is now written down in the skill: no gaps, no suffixes, no `E2`-style insertions, and inserting a block means relettering everything after it. Past `Z` the sequence continues `A2` through `Z2`, then `A3` through `Z3`, with the digit as a generation counter rather than an insertion marker.

### Fixed

- **`.cursor-plugin/plugin.json` was stranded at 5.1.0** while the Claude manifests moved to 5.1.1 and 5.1.2, so Cursor installs reported a version two releases behind the files they shipped. All four manifests (`plugin.json`, `marketplace.json`, `package.json`, `.cursor-plugin/plugin.json`) now move together.
- **`master-checklist-synthesizer` rewritten for the v5 nested shape.** The agent prompt still described the v4 flat layout (`## Stage N`, four universal checks, frontmatter re-read from disk) while `cook-pizzas` Phase 4 and `references/templates.md` described the nested `## Pie N` / `### Slice N.M` layout fed from the writers' structured returns. Generated checklists followed the template, so output was correct, but the two contradicted each other. The agent now carries the nested structure, the per-slice Exit-criteria block, the `review:` annotation, and the return-envelope input the skill actually sends it.
- **`phased-plan-writer` output contract now carries `pie`, `slice`, `review`, `completion_criteria`, and `exit_criteria`**, the fields the synthesizer needs to build a slice row without re-reading the file. The old contract returned `slice: vertical | horizontal`, a v4 meaning that collided with the v5 dotted slice id. The title rule and the `db-schema-stage-writer` frontmatter rule are aligned to the v5 template for the same reason.
- **Dropped the explicit `"hooks": "./hooks/hooks.json"` pointer from `plugin.json`.** Claude Code 2.1.263 loads `hooks/hooks.json` automatically and treats the manifest pointer to the same file as a duplicate, which failed the plugin load a second time right after the shape fix in 5.1.1. The manifest `hooks` field is only for additional hook files. Shipped as 5.1.2.
- **`hooks/hooks.json` now wraps every event under a top-level `"hooks"` key.** Claude Code 2.1.263 rejects the bare event map the file used before (`UserPromptSubmit`, `SessionStart`, `PreToolUse`, `PreCompact` at the top level) and refuses to load the whole plugin when a `PreToolUse` hook cannot be parsed. Every `/bytheslice:*` command then reports "Unknown command" in every project. The wrapped shape is the one the official plugins ship, and the hook test suite passes unchanged. Reinstall with `claude plugin marketplace update bytheslice && claude plugin update bytheslice@bytheslice`.

### Notes

- **This is discovery, not a gate, deliberately.** On the Next.js 16 App Router codebase it was calibrated against, shadscan found 4 real bugs that lint, typecheck, test, build, and E2E all missed, but roughly a third of its failures were false positives or product-opinion, and its score is heavily penalized by deliberate architecture choices (not using shadcn, dark-theme-only with no theme toggle, no command menu). `states` scored 0 percent with every failure a false positive, `interaction` was about half product-opinion, `forms` was mixed, which is why only `accessibility` and `foundation` are in scope.
- **shadscan has no ignore, exclude, or rule-waiver mechanism** (its `setup` subcommand only writes pre-commit hooks), so path filtering happens after the fact in the agent. 5 of 21 evidence rows on the calibration run pointed at `/library` mockups.
- **shadscan caps evidence at 5 rows per rule**, so fixing every location a rule lists often leaves it still failing with a fresh set that was hidden behind the ones just fixed. On the calibration run, a rule came back with five new locations after its three listed unlabeled inputs were fixed. The agent now calls out a full five-row list in its report so a still-failing rule is not misread as a fix that did not work.
- **A future slice could consume findings over shadscan's `mcp` subcommand** (read-only `scan`, `list_projects`, `explain_rule` over stdio) instead of parsing CLI output. Noted, not wired.

---

## [5.1.0] - 2026-07-22

**Native agent registration.** The 54 markdown subagent definitions stop being read-and-paste prompt templates: 48 live agents are now declared in `plugin.json`'s `agents` array, so the platform itself enforces every `model`, `effort`, and tool allowlist that was previously advisory frontmatter. Skills dispatch by type (`bytheslice:<name>`), passing only task inputs as the prompt; read-and-paste survives as the documented fallback for Cursor and hosts without plugin-agent support.

### Added

- **`agents` key in `.claude-plugin/plugin.json`**: 48 live subagents registered by explicit file path (directory entries are rejected by `claude plugin validate`). Agents surface in the @-mention typeahead as `bytheslice:<name>`.
- **Top-level marketplace `description`** in `.claude-plugin/marketplace.json` (was a strict-mode validation warning).
- **`docs/agents.md`**: the full agent roster in one plain-English table, sectioned by owning skill, with the six unregistered v4 shims listed separately.
- **`hooks/record-library-approval.sh`**: the long-planned approval writer for the Phase 4.5 library preview gate. `arm --slice <n.m>` creates `library-approvals.json` with zero approvals when the approval window opens (waking `library-gate-guard.sh`); `approve --slice <n.m> --components "<id>,<id>"` appends one `status: "approved"` entry per component (component id, session id, slice, ISO timestamp). Session id defaults to the value `precheck-skill.sh` recorded, the exact string the gate compares against. Honors `BTS_HOOKS_DISABLED=1`, tolerates missing `jq`, and writes compact single-line JSON so the gate's no-jq fallbacks keep working.
- **Core tools for the writer agents that only listed MCP tools**: `slice-tester` gains Bash/Read/Write/Edit/Glob/Grep (it seeds DBs and writes probe harnesses); `block-composer`, `component-crafter`, `layout-architect`, `state-illustrator` gain Read/Write/Edit/Glob/Grep; `modern-ux-expert` gains Read/Write/Glob/Grep plus real `WebSearch`/`WebFetch` (replacing the nonexistent `web_search`/`image_search`). Under enforcement, the old MCP-only lists would have spawned these agents with no usable tools.
- **Current-namespace Chrome MCP aliases** (`mcp__claude-in-chrome__*`, `mcp__Claude_Browser__*`) alongside the legacy `mcp__Claude_in_Chrome__` / `mcp__Claude_Preview__` names in `slice-tester`, `visual-reviewer`, and `platform-walker`, so browser access survives server-naming drift in enforced allowlists.

### Changed

- **Agent frontmatter normalized to the supported plugin-agent field set** across all 54 files: `readonly: true` translates to `disallowedTools: Write, Edit, NotebookEdit` (or an allowlist that simply omits write tools); leading HTML comment blocks move out of the way so frontmatter is byte-first (46 files were previously unparseable as agent definitions).
- **Dispatch prose in every skill** (`sell-slice`, `sell-pie`, `cook-pizzas`, `box-it-up`, `inspect-display`, `create-menu`, `close-shop`, `set-display-case`, `special-order`, `open-the-shop`, `final-quality-check`): dispatch by registered type with only task inputs in the prompt; the platform loads the definition. Fallback phrasing standardized.
- **All three manifest descriptions** (`plugin.json`, `marketplace.json`, `.cursor-plugin/plugin.json`) rewritten from v4-era text to the v5 Pie/Slice model with `/sell-pie` as the forefront command.
- **Stale command wrappers and project notes caught up to v5**: `commands/sell-slice.md` (which still described the v3 flow, including PR/CI/merge steps that belong to `/box-it-up`), `commands/box-it-up.md`, `commands/inspect-display.md`, and the repo's own `CLAUDE.md` all rewritten to the current Pie/Slice model.
- **`/sell-slice` Phase 4.5** now arms the enforcement gate once the writer dispatches complete and records the operator's approval (via `record-library-approval.sh`) before any production wiring; a rejection records nothing, so the armed gate keeps warning. `library-entry-writer`'s hard constraints state the agent never writes the approvals file itself.

### Removed

- **`subagent_type` and `readonly` frontmatter fields** (not part of the platform schema; their intent is preserved via registration and `disallowedTools`).

### Deprecated

- **Six v4 shim agents left unregistered** (on disk for back-compat only): `stage-runner`, `pr-reviewer` (run-the-day), `basic-checks-runner`, `aggregating-test-reviewer`, `ci-cd-guardrails`, `frontend/visual-reviewer` (sell-slice). They no longer appear in the typeahead.

### Fixed

- **`close-shop` dispatched a nonexistent file** (`agents/close-shop-reviewer.md`); now dispatches `bytheslice:retrospective-reviewer`, which is what the file actually is.
- **The npm tarball shipped a README linking to files it did not contain.** 5.0.1 added `docs/architecture.md` and linked it from the README in five places, but never added `docs` to `package.json`'s `files` array, so every link 404'd for anyone installing from npm. `docs/architecture.md` and `docs/agents.md` now ship with the package.
- **The library preview gate is live after being dormant since v4.2.** `library-gate-guard.sh` read `library-approvals.json` but nothing ever wrote it (the planned v4.2.2 approval-writer never shipped), so the hook could not fire. Phase 4.5 now arms and records via `record-library-approval.sh`, and `hooks/test.sh` proves end-to-end that the gate warns on production-route writes after `arm` and passes them after `approve` (27 new end-to-end assertions).
- **The Prep gate now counts the canonical dashless checkboxes.** `bts_prep_counts` matched only legacy dashed `- [ ]` lines, while `/cook-pizzas` emits dashless `[ ]` (the documented v5 "Checkbox format rule"), so a template-conformant `## Prep` section read as 0/0: precheck's "Prep section incomplete" warning could never fire and the shop-status header showed "Prep: 0/0". Both forms are counted now, with dashless, dashed, and mixed fixtures in `hooks/test.sh`.
- **`shop-status.sh` no longer dies on BSD awk.** Both of its awk blocks used the gawk-only 3-argument `match()`, a fatal parse error for macOS awk, so every SessionStart header printed zeroed stage counts plus stderr noise. Rewritten POSIX-portable; nested v5 checklists now report pie and slice counts through the dual-read lib helpers (`bts_unit_counts` / `bts_slice_counts`) plus the first open pie, and the `Status:` table scan stays as the flat-v4 fallback.

---

## [5.0.1] - 2026-06-07

**Docs polish.** No functional changes - the plugin is byte-identical to 5.0.0. The README sheds ~47% (36 KB → 19 KB) by folding the duplicated skill tables into one set of follow-along command tables, and the deep reference moves into a new `docs/architecture.md`. Ships the previously-missing MIT `LICENSE`.

### Added

- **`LICENSE`** (MIT) - referenced by the README and `package.json`'s `files` array since 5.0.0 but never committed, so the 5.0.0 tarball shipped without it. Now present.
- **`docs/architecture.md`** - the under-the-hood reference (Pies & Slices, the verify-once model, the mode-detection matrix, delivery/git, orchestration principles, hook enforcement, legacy/migration, Cursor fallback), lifted out of the README and linked from it.

### Changed

- **README slimmed ~47%** (481 → 362 lines). The duplicate *"Menu - full skill reference"* is folded into the three *"How it works"* command tables (each command now links to its `SKILL.md`); the 15-bullet *"Conventions"* wall becomes a short teaser linking into `docs/architecture.md`; repeated concepts (selling/boxing decoupling, flat-v4 dual-read, verify-once) are stated once instead of 4-10×. The workflow diagram is color-coded by phase and validated.

### Fixed

- **`.gitignore` ignored all of `docs/`** - narrowed to `docs/plans/` (the generated per-project plans) so authored docs like `docs/architecture.md` actually commit and render on GitHub. The stale v2 PR/QA docs move to `docs/archive/`.

---

## [5.0.0] - 2026-06-05

**The Pie release.** The flat 20-30 "stages" become a two-level **Pie / Slice** hierarchy: a **Pie** is a coherent chapter (3-8 slices) and the unit of `/loop` autonomy, HITL checkpoint, PR, context-refresh, and worktree; a **Slice** is yesterday's "stage" - one vertical deliverable. A new forefront command **`/sell-pie`** bakes one Pie autonomously with **context-separated dispatch** (the builder emits a build manifest; an independent `slice-tester` verifies behavior from the manifest + Exit criteria only, never the builder's reasoning; a `slice-verifier` runs every static gate exactly once plus a diff-derived under-declaration backstop). `/sell-slice` stays the high-touch single-slice tool, `/run-the-day` demotes to a thin pie chainer, `/box-it-up` re-scopes to pie-level git dynamics (per-slice commit+push, one PR + CI + merge at the pie boundary), and `/cook-pizzas` decomposes into Pies. Dual-read keeps every flat v4 `## Stage N` checklist working; `/sell-pie` refuses flat and `/cook-pizzas --repie` converts on explicit opt-in.

### Added

- **`/sell-pie`** *(new, forefront)* - a `/loop`-driven autonomous baker over one Pie: context-separated per-slice Workflow (builder → slice-tester → slice-verifier → fixer, the tester receiving only the build manifest + Exit criteria + design-system path), per-slice commit+push with no PR, stop at the pie boundary to open one `Pie N` PR via `/box-it-up`; refuses flat checklists (`/cook-pizzas --repie` hint), runs `/sell-slice` mode for `review: continuous` pies, and halts the loop on the four blocking HITL categories.
- **`slice-tester` agent** - type-routed behavioral tester (frontend rendered design-system match + affordance exercise; full-stack/backend seed-and-cleanup data-flow round-trips with hard non-prod guard, cleanup-in-finally, residue check; infrastructure probe-only), context-separated from the builder (manifest + Exit criteria + design-system path only), with the bidirectional-transition rule (every transition confirmed forward AND inverse on every surface before `pass`).
- **`slice-verifier` agent** - a single static-gate pass collapsing basic-checks-runner + the static half of aggregating-test-reviewer + ci-cd-guardrails; each atomic check runs once, with the manifest under-declaration backstop and CI-integrity check.
- **Pie/Slice frontmatter + templates.** Stage-frontmatter contract and plan templates now carry the v5 Pie/Slice hierarchy: `pie:<int>`, `slice:"<N.M>"`, and the `review: boundary|continuous` pie property, with a documented dual-read fallback (flat `## Stage N` still valid for v4) and the master-checklist template rewritten to nested `## Pie N` / `### Slice N.M` with per-slice Exit-criteria blocks.
- **Config: verify-once + flow knobs.** `bytheslice.config.json` gains `verification.{viewports,e2e}`, `flow.{autoApproveBuildPlan,libraryGate}`, and the `review` pie-default property; `modelTiers` gains `sliceTester`/`sliceVerifier`, with `ciCdGuardrails`/`basicChecksRunner`/`aggregatingTestReviewer` documented as deprecated aliases of `sliceVerifier`.
- **`loop-workflow-fallback-pattern.md`** reference documenting the manual fallback for the Claude-Code-only `/loop` and `Workflow` primitives (self-paced pie loop; in-context dispatch with orchestrator-side manual §App A/B/C schema validation).
- **`git-worktree-standard.md`** *(new reference)* - the cross-cutting multi-agent git-worktree standard: fresh-`main` setup (`git fetch origin` → `git worktree add … origin/main`), the two-level **one-worktree-per-Pie** topology (sequential slices in the shared pie worktree; `isolation:'worktree'` only for parallel overlapping writes), the runtime-isolation-gap mitigations (per-worktree dev-server port + non-prod-guarded `bts_test_run_id`-keyed DB seeding), merge/cleanup (preserve per-slice commits, `--ff-only` sync, `git worktree remove`/`prune` never `rm -rf`), and the boundary-PR template. Linked (not copied) by `/sell-pie`, `/sell-slice`, `/box-it-up`, and `/cook-pizzas`.

### Changed

- **`/sell-slice` restructured** to an interactive spine + Workflow A (produce, builder emits the build manifest) + human library gate + Workflow B (verify-once: state-illustrator → slice-tester → slice-verifier, each static gate run once, off-context fix loop); `implementer` now emits the Appendix-A build manifest and no longer owns the e2e ladder.
- **`/cook-pizzas` decomposes into Pies.** It now decomposes the PRD into a two-level Pie/Slice roadmap (coherent 3-8-slice Pies, each with a `review:` property), writes slices via a schema-validated `Workflow` (`parallel()` plan-writers → barrier → synthesizer consuming structured returns, no disk re-read), and adds `--repie` to convert a flat v4 checklist into Pies on explicit opt-in.
- **`/box-it-up` re-scoped pie-level.** Per slice it now commits + pushes only (no PR opened, so CI does not fire); at the pie boundary it opens one `Pie N` PR, runs CI once, gates the merge on HITL approval, merges preserving every per-slice commit (rebase/merge-commit, never squash), syncs `main --ff-only`, deletes the branch, and removes the pie worktree. Universal hand-rolled-branch closeout safety retained. `ask_user_input_v0` calls replaced by `needs_human` + `hitl_*` return fields.
- **`/run-the-day` demoted to a thin chainer** that sequences `/sell-pie` once per Pie across the whole master checklist (`--auto-mvp`/`--auto-all` now act as pie filters); it refuses flat v4 checklists, no longer dispatches the `stage-runner`/`pr-reviewer` agents (kept as deprecation-noted v4 shims) and no longer calls `ask_user_input_v0` - `/sell-pie` is the primary entry point.
- **Hooks reconciled with the v5 `/sell-pie` `/loop`:** deleted `commit-checklist-correlator.sh`, downgraded `stage-plan-guard.sh` from BLOCK to WARN, and added dual-read parsing for `## Stage N` and `## Pie N` / `### Slice N.M` checklists.
- **Worktrees now cut from the freshly-fetched `origin/main`, not local `main` (freshness fix).** `/sell-pie` (Phase 0) and `/sell-slice` (Phase 3) now run `git fetch origin` then `git worktree add -b <branch> <path> origin/main` so new pies/slices base on current remote `main` instead of a possibly-stale local `main`, per the new `git-worktree-standard.md`.

### Deprecated

- **`basic-checks-runner.md`, `aggregating-test-reviewer.md`, `ci-cd-guardrails.md`, `frontend/visual-reviewer.md`** (under `sell-slice/agents/`) and **`run-the-day/agents/stage-runner.md` + `pr-reviewer.md`** - shimmed with a one-line deprecation banner, content otherwise intact, retained for v4 back-compat through 5.1. `basic-checks-runner` / `aggregating-test-reviewer` (static half) / `ci-cd-guardrails` are replaced by `slice-verifier`; `frontend/visual-reviewer` and the behavioral half of `aggregating-test-reviewer` move to `slice-tester`; `stage-runner` / `pr-reviewer` are superseded by `/sell-pie` + `/box-it-up`.
- **Config keys `ciCdGuardrails` / `basicChecksRunner` / `aggregatingTestReviewer`** are now deprecated aliases of `sliceVerifier` (the forward-looking "a future v5 may rename them" note from v4 is realized here).

### Removed

- **`commit-checklist-correlator.sh`** hook deleted - its `PostToolUse`-on-`Bash` registration, README row, `scenarios.md` section, and `test.sh` block are removed. The per-slice commit no longer correlates against a checklist-closeout edit (the pie-boundary PR is the closeout in v5).
- **`stop-gate.sh` hook deleted** - `/loop` + the pie-completion `/goal` own loop continuation natively; the `.bytheslice-state/loop-active` sentinel and the `bts_loop_active` / `bts_loop_sentinel` helpers are removed with it. Its `Stop` registration, README row, `scenarios.md` section, and `test.sh` block are gone (the suite drops from 89 to 64 tests).
- **Three legacy foundation-stage writers** (`design-system-stage-writer`, `ci-cd-scaffold-stage-writer`, `env-setup-stage-writer`) deleted - unused since v4 (the design-system / CI/CD / env-setup foundations are run-once standalone skills), along with their `modelTiers` entries and tier-guide rows. The `references/canned-stages/` slice templates they once populated are retained (they define the foundations-Pie slices 1.1-1.3).

### Migration

**Existing v4 projects.** No action required to keep working. Flat `## Stage N` master checklists are dual-read - `/sell-slice` runs them unchanged and the hooks parse them via the new `bts_checklist_layout` detection. To adopt the Pie model, run `/cook-pizzas --repie` (explicit opt-in; never silent) to convert a flat checklist into nested `## Pie N` / `### Slice N.M`, then drive it with `/sell-pie`. `/sell-pie` and `/run-the-day` **refuse** a flat checklist with a `--repie` hint rather than auto-converting. Old config keys `ciCdGuardrails`/`basicChecksRunner`/`aggregatingTestReviewer` keep resolving as aliases of `sliceVerifier`. The four deprecated agents and the two `run-the-day` agents remain as shims through 5.1.

---

## [4.2.0] - 2026-05-21

**Lifecycle hooks, expanded.** The v4.1 hook set covered the obvious gates (preconditions, commit-on-main, the `/sell-slice` stop loop). v4.2 adds four more deterministic guards that catch the quieter failure modes - editing a frozen stage plan mid-delivery, shipping a production route without a library-preview sign-off, closing a stage without updating the master checklist, and losing orientation across a context compaction. The `Stop` gate also learns `/box-it-up`: it nudges until the slice's PR is actually merged. The regression suite grows from 34 to 100 tests; every new row in `scenarios.md` has a matching assertion.

### Added

- **`stage-plan-guard.sh`** (`PreToolUse` on `Write`/`Edit`) - BLOCKs writes/edits to `docs/plans/stage_*.md` while `/sell-slice` is the current session's active skill. Stage plans are static during delivery; modifying one mid-slice is a sign the work has drifted from its spec. Points the operator at `/special-order` or `/cook-pizzas` to change a plan deliberately. Session-id guarded; fails open when state is missing or cross-session.
- **`library-gate-guard.sh`** (`PreToolUse` on `Write`/`Edit`) - WARN-injects (never blocks) when a `/sell-slice` run writes to a watched production route (`app/**`, `src/app/**`, `components/**`, `src/components/**`) without a recorded library-preview approval. Dormant until `library-approvals.json` exists - graceful degradation until the approval-writer ships (v4.2.2). Session-id guarded.
- **`commit-checklist-correlator.sh`** (`PostToolUse` on `Bash`) - after a `git commit` during `/sell-slice`, WARN-injects if the master checklist shows a `Completed` stage but the commit did not touch `docs/plans/00_master_checklist.md` (a likely skipped Phase 9 closeout). Session-id guarded.
- **`compact-snapshot.sh`** (`PreCompact`) - never blocks compaction (always exit 0). Writes `compact-snapshot.json` capturing session/skill/branch, last commit sha + subject, and the next up-to-3 unfinished checklist lines so the post-compaction turn can re-orient.
- **`/box-it-up` stop gating** in `stop-gate.sh` - if `/box-it-up` started in the current session but its PR is not `MERGED` (per `gh pr view`), BLOCKs once so the operator runs it through to merge. Missing `gh` fails open (can't check PR state without it).
- **66 new regression tests** in `test.sh` (34 → 100), covering every scenario for the four new hooks plus the `/box-it-up` stop path. New assertion helper `assert_not_contains` and `write_state` fixture helper.
- **Five new `scenarios.md` sections** documenting the contract for `stage-plan-guard`, `library-gate-guard`, `commit-checklist-correlator`, `compact-snapshot`, and the expanded `stop-gate` (both `/sell-slice` and `/box-it-up` paths).

### Changed

- **`hooks.json` registers the new hooks** across `Write`, `Edit`, `PostToolUse` (Bash), and `PreCompact` events. `stage-plan-guard` and `library-gate-guard` both run on the `Write` and `Edit` matchers.
- **`stop-gate.sh` handles two skills.** Refactored from a `/sell-slice`-only gate into a per-skill dispatch: `/sell-slice` blocks on a missing slice commit, `/box-it-up` blocks on an unmerged PR. Both remain session-id-scoped and re-entry-safe.
- **State schema documented** in `hooks/README.md` for `compact-snapshot.json` and `library-approvals.json` (the latter read-only until v4.2.2).

### Known gaps

- **`library-approvals.json` has no writer yet** (planned v4.2.2). `library-gate-guard.sh` reads it but nothing records approvals, so the gate stays dormant - intentional graceful degradation, not a bug. The Phase 4.5 library-preview approval flow will write this file once the approval-writer lands.

---

## [4.1.1] - 2026-05-19

**Hotfix.** v4.1.0 was tagged on GitHub but never published to npm - its `package.json` `files` allowlist did not include the new `hooks/` directory, so the npm tarball would have shipped without the hook infrastructure that `plugin.json` references. v4.1.1 fixes the allowlist; no code or skill changes. Treat v4.1.1 as the first usable npm release of the v4.1 series.

### Fixed

- `hooks` added to the `files` array in `package.json` so the hook scripts, `lib/checklist.sh`, `scenarios.md`, `test.sh`, `README.md`, and `hooks.json` are actually included in the published npm tarball. Without this fix, `plugin.json`'s `"hooks": "./hooks/hooks.json"` pointer would have resolved to a missing file in installed packages.

---

## [4.1.0] - 2026-05-19

**Hooks + framework decoupling.** Deterministic plugin hooks replace prose enforcement of preconditions across every skill - `/sell-slice` blocks when the master checklist is missing, `/box-it-up` refuses to run on `main`, `git commit` on `main` is blocked at the tool layer, and a `Stop` gate nudges `/sell-slice` to complete its commit loop. Framework support broadens from "Next.js only" to a canonical multi-stack contract - Next App Router and Pages Router, Vite + React, SvelteKit, Astro, and plain Node API are all detected and bootstrapped; non-Next stacks bubble HITL at the Phase 4.5 library-preview gate until per-framework templates land. GitNexus hard-coupling is removed.

### Added

- **`hooks/` infrastructure.** Four deterministic guard scripts:
  - `precheck-skill.sh` (`UserPromptSubmit`) - detects a `/bytheslice` slash command and runs per-skill preconditions: BLOCKs `/sell-slice` without a master checklist, BLOCKs `/box-it-up` on `main`/`master`, WARN-injects on dirty tree / missing `gh` auth / incomplete Prep section.
  - `shop-status.sh` (`SessionStart`) - injects a compact stage summary at session start (counts + next not-started row + Prep progress) when a checklist is present.
  - `pre-commit-guard.sh` (`PreToolUse` Bash matcher) - BLOCKs `git commit` on `main`/`master`; WARN-injects a staged-files summary on feature branches.
  - `stop-gate.sh` (`Stop`) - if `/sell-slice` started in the current session but no commit landed since the precheck, BLOCKs once so Claude completes the loop. Session-id-scoped: stale state from previous sessions never blocks.
- **`hooks/scenarios.md`** - canonical hook scenario contract. Every row is one (skill / state / expected) tuple the hooks must satisfy. The single source of truth that `test.sh` enforces and every `SKILL.md` `## Preconditions` section indirectly references.
- **`hooks/test.sh`** - 34-test regression suite. Each test sets up an isolated fixture under `$TMPDIR`, runs one hook with a synthetic JSON envelope, and asserts exit code + output substring. Pure bash, no deps beyond `git`.
- **`hooks/lib/checklist.sh`** - shared helpers (`bts_root`, `bts_checklist_path`, `bts_prep_counts`, `bts_branch`, `bts_tree_state`, `bts_session_id`, `bts_state_dir`, `bts_detect_skill`).
- **`hooks/README.md`** - hook reference, scenario-contract pointer, disable escape hatches (`BTS_HOOKS_DISABLED=1` per-session, `disableAllHooks` global).
- **`skills/setup-shop/references/framework-detect.md`** - new canonical stack contract. Supported-stacks table, detection algorithm, per-stack path map, bootstrap scaffolder list, per-skill branching matrix. Every skill that branches on framework reads this file instead of duplicating detection logic.
- **Multi-stack bootstrap support** in `/setup-shop`:
  - `vite-react` via `pnpm create vite@latest <name> -- --template react-ts` + Tailwind install
  - `sveltekit` via `pnpm create svelte@latest <name>` (interactive - skeleton + TS + Tailwind)
  - `astro` via `pnpm create astro@latest <name> -- --template minimal --typescript strict` + Tailwind add-on
  - `node-api` via `pnpm init` (framework-agnostic; `/sell-slice` runs backend / db-schema / infrastructure stages only)
- **`bootstrap-templates-catalog.md` framework-adapter status matrix** documenting which stack ✅ works end-to-end, which ⚠️ HITLs at the library-preview gate, and the contract for adding a new stack.
- **Per-session hook disable**: `export BTS_HOOKS_DISABLED=1` short-circuits every bytheslice hook in the current shell - useful for one-off experimental flows where the guards get in the way. Reverts on shell exit.

### Changed

- **CSS entry path parameterized** in `/set-display-case`. Reads from `framework-detect.md` instead of hardcoding `app/globals.css`. Per-stack: `app/globals.css` (next-app), `styles/globals.css` (next-pages), `src/index.css` (vite-react), `src/app.css` (sveltekit), `src/styles/global.css` (astro).
- **`library-route-scaffolder` is framework-aware.** New Step 0 framework gate bubbles HITL `prd_ambiguity` for non-`next-app` stacks with the framework's idiomatic conventions, instead of silently producing wrong files. Hardened against orchestrator-paraphrase attacks ("the user already said it's fine" is the HITL trigger, not a bypass).
- **`layout-architect` and `library-entry-writer` have matching framework gates.** Both bubble HITL for non-Next stacks at Step 0 / Step 0a, with strong anti-paraphrase language so a sibling agent or orchestrator framing cannot waive the gate. Pressure-tested four times against user-side, orchestrator-side, and orchestrator-paraphrase attacks.
- **`setup-shop` Q-bootstrap-stack expanded** from "Next.js only" single-option to a five-option select (Next App, Vite + React, SvelteKit, Astro, Node API). The question reflects the actual support matrix from `framework-detect.md`.
- **`discovery` agent simplified.** GitNexus fork removed from workflow - agent now uses Grep + Glob only. Output contract drops `index_freshness` and `discovery_method` fields.
- **SKILL.md Preconditions sections trimmed** across `sell-slice`, `box-it-up`, `inspect-display`, `run-the-day`. The inline prose ("If any precondition fails, stop and surface the gap") is replaced by a one-line pointer to `hooks/precheck-skill.sh`. The checks still run when hooks are disabled; the prose enforcement just lives in one place now.
- **`CLAUDE.md` slimmed** from 43 lines (GitNexus-focused) to 13 lines (bytheslice-focused project notes).

### Removed

- **GitNexus hard-coupling.** The GitNexus MCP itself remains available globally; bytheslice no longer assumes it's installed. Specifically removed:
  - `Q6 - GitNexus` from `/cook-pizzas` plan-mode questions
  - `gitnexus` key from `bytheslice-config-schema.md` mcps block and example config
  - `gitnexus` from `/setup-shop` Q-mcps options
  - GitNexus discovery fork from `sell-slice/agents/discovery.md`
  - GitNexus context from `rules-loader` and `rules-assembler` agent inputs/outputs
  - GitNexus rules pull (the `<!-- gitnexus:start -->...<!-- gitnexus:end -->` block) from `CLAUDE.md`
  - `.gitnexus` entry from `.gitignore` (replaced by `.claude/.bytheslice-state/`)

### Migration

**Existing v4.0 projects.** No action required. Hooks activate automatically once you upgrade to v4.1 and Claude Code re-reads the plugin manifest. The `Preconditions` sections of every `SKILL.md` still enforce checks when hooks are disabled, so nothing breaks if you opt out via `BTS_HOOKS_DISABLED=1` or `disableAllHooks`. If your project's `bytheslice.config.json` has an `mcps.gitnexus` key, it's harmless - the resolver now ignores it; you can remove it on your next config edit. Your existing `CLAUDE.md` is untouched by the upgrade; if you want the new slimmer notes, re-run `/setup-shop` Step 3 or edit by hand.

**New projects on non-Next.js stacks.** `/setup-shop` Q-bootstrap-stack now offers Vite + React, SvelteKit, Astro, Node API. Bootstrap + design system + CI/CD work end-to-end. The first time `/sell-slice` Phase 4.5 (Library Preview Gate) fires, the agents will bubble HITL with the framework's idiomatic conventions and ask whether to skip, approximate, or defer until the per-framework adapter ships.

---

## [4.0.0] - 2026-05-14

**The Pizza Shop release.** Every command is renamed to a kitchen action. Foundation skills get promoted out of being canned plan stages into being standalone, run-once-before-service prep commands. The master checklist gains a top "Prep" section. Every skill is independently invocable (auto-detected standalone vs sequential mode). `/goal` integration lands in `/run-the-day`'s auto modes and in `/sell-slice`'s Phase 2.5.

### Renamed

| v3 command | v4 command | What changed |
|---|---|---|
| `/setup` | **`/setup-shop`** | Renamed only. Same three-flow logic. |
| `/write-prd` | **`/create-menu`** | Renamed only. Same PRD generator. |
| `/plan-phases` | **`/cook-pizzas`** | Renamed AND reshaped - no longer emits stage 1-3 plan files; emits the master checklist's new Prep section instead. |
| `/init-design-system` | **`/set-display-case`** | Renamed AND promoted out of `skills/sub-disciplines/` to top-level. No longer auto-dispatched from `/sell-slice` in new projects; run it directly. Standalone-invocable on any project. |
| `/scaffold-ci-cd` | **`/final-quality-check`** | Same as above - promoted out of sub-disciplines, standalone-invocable. |
| `/setup-environment` | **`/open-the-shop`** | Same as above. The most HITL-heavy prep step. |
| `/deliver-stage` | **`/sell-slice`** | Renamed AND gains a Phase 0 precondition (every Prep checkbox must be `[x]` before any feature stage runs). Legacy v3 routing for `design-system`/`ci-cd`/`env-setup` stage types preserved for old projects. NEW Phase 2.5 sets a slice-completion `/goal` lifted from the stage file's Exit criteria block. |
| `/ship-pr` | **`/box-it-up`** | Renamed only. Same closeout flow (push → CI watch → merge → cleanup). |
| `/add-feature` | **`/special-order`** | Renamed only. Same mid-flight feature addition. New: Phase 4 verifies Exit-criteria contract on writer output. |
| `/run-pipeline` | **`/run-the-day`** | Renamed AND gains NEW Phase 0.5 - `--auto-*` modes set a session-scoped `/goal` whose condition encodes the pipeline's end state. |
| `/walk-platform` | **`/inspect-display`** | Renamed only. Same read-only cross-cutting audit. |
| `/review-pipeline` | **`/close-shop`** | Renamed only. Same post-execution retro. Bookends `/setup-shop`. |

### Changed

- **Foundation split.** `init-design-system`, `scaffold-ci-cd`, `setup-environment` moved from `skills/sub-disciplines/` to top-level under their new names. The `sub-disciplines/` directory is removed. These three skills are now invoked directly during daily prep, not as auto-dispatched sub-skills inside `/sell-slice`.
- **Master checklist gains a Prep section.** `cook-pizzas` now writes a top `## Prep` section above the feature stages. Each foundation skill flips its own checkbox when invoked in sequential mode (master checklist present). `sell-slice` Phase 0 refuses to start any feature stage until every Prep box is `[x]`. Existing v3 projects with `stage_1_*`/`stage_2_*`/`stage_3_*` plan files keep working via a documented legacy routing path.
- **Mode detection.** Every SKILL.md now has a `## Mode detection` section documenting whether the skill is standalone-only, sequential-only, or true dual-mode. Auto-detection is based on whether `docs/plans/00_master_checklist.md` exists. Standalone mode never assumes a parent orchestrator; sequential mode flips the corresponding Prep/Stage checkbox on completion.
- **`/goal` integration.** `/run-the-day` Phase 0.5 sets a session-scoped goal in `--auto-mvp` and `--auto-all` modes. `/sell-slice` Phase 2.5 sets a slice-completion goal lifted from the active stage file's Exit criteria block (after pre-checking for an active parent goal). Both honor a graceful fallback when `/goal` is unavailable.
- **Exit-criteria contract.** New section in `cook-pizzas/references/templates.md` codifying the rules every stage file's `**Exit criteria:**` block must follow - transcript-verifiable, binary, slice-specific - with concrete good/bad examples. `phased-plan-writer` agent enforces the contract; `special-order` re-dispatches writers on weak criteria.

### Added

- **`pizza-shop`** keyword in npm + plugin manifests.
- **Standalone invocability** as a property of every skill, not an accident. You can drop `/set-display-case` onto any project to bolt on a design system, or `/box-it-up` onto any feature branch.

### Backward compatibility (kept in v4.x.x, removed in v5.0.0)

- Every old slash command (`/bytheslice:deliver-stage`, `/deliver-stage`, etc.) remains in the new skill's `triggers:` array.
- Every old natural-language trigger phrase ("deliver the next stage", "ship the next slice", etc.) remains.
- Legacy `stage_1_design_system_gate.md` / `stage_2_ci_cd_scaffold.md` / `stage_3_env_setup_gate.md` plan files still route correctly through `/sell-slice`'s Phase 4 (now labeled "legacy v3 sub-skill dispatch").
- `bytheslice.config.json` keys keep their v3 names - `runPipeline.platformWalkEvery` is unchanged. A future v5 may rename them with deprecation aliases.

### Migration guide

**Existing v3 projects (master checklist already has `stage_1_*`/`stage_2_*`/`stage_3_*`):** no action required. Old slash commands still fire. Old plan files route through `/sell-slice`'s legacy path. Optionally migrate to v4 by deleting stages 1-3, adding a Prep section to the master checklist by hand, and running the three foundation skills directly.

**New v4 projects:** follow the Quick Start in the README. The sequence is `/setup-shop` → `/create-menu` → `/cook-pizzas` → `/set-display-case` → `/final-quality-check` → `/open-the-shop` → `/sell-slice` (loop with `/box-it-up`).

---

## [3.1.0] - 2026-05-13

### Added
- **`/bytheslice:walk-platform`** - cross-cutting visual walkthrough skill. Discovers every route in a running app, drives a live browser through each one, captures screenshots + console output, and surfaces a ranked report of what's broken, mocked, or empty across the **whole product** - not just the last slice. Read-only. Run before UAT, before a demo, or after a batch of `/ship-pr` runs. Complements (does not replace) `deliver-stage`'s per-slice `visual-reviewer`.
- **`run-pipeline` periodic platform-walk checkpoints** - autonomous multi-stage runs now pause every N stages (configurable via `runPipeline.walkPlatformCheckpointInterval` in `bytheslice.config.json`, default 5) to dispatch `/walk-platform` and surface any cross-cutting regressions before they pile up. HITL gate: operator reviews the walk report before the pipeline resumes.
- **Dev-mode auth bypass helpers** (`/bytheslice:plan-phases`) - opt-in localhost auth shortcuts for the design-system foundation stage so the `/library` route is reachable in fresh setups without a real session.

### Changed
- **GitHub repo + npm package + default local path are all `bytheslice`** - the rename from `stagecoach` (and the brief intermediate `stage-coach` / `@steve-piece/stagecoach` npm names) is now fully consistent across the repo URL, the published npm package, and the recommended local clone path. GitHub redirects the old `steve-piece/Stagecoach` URL.
- **README refresh** - pizza-themed Kitchen narrative, simplified FAQ, `walk-platform` row added to the skills table.

---

## [3.0.0] - 2026-05-07

Major restructure: subagent-driven everything, single delivery loop, real per-stage verification.

### Added
- **`/bytheslice:deliver-stage`** - the new everyday delivery loop. Replaces both `/ship-feature` and `/ship-frontend`. Reads the master checklist, picks the next `Not Started` stage, dispatches the right sub-skill or internal pipeline by `type:`, runs the per-stage review pipeline, and opens the PR. Run it once per slice, in a fresh chat, until the master checklist is done.
- **Phase 6 - basic-checks-runner** (lint / typecheck / build) gates the per-stage output summary. No "stage complete" report until these pass.
- **Phase 7 - aggregating-test-reviewer** with type-aware depth: full review (dev-server boot + Claude-in-Chrome browser UAT + visual diff against tokens) for `frontend` / `full-stack` slices; reduced review (CI gates only) for `backend` / `db-schema` / `infrastructure`; skipped for foundation stages where Phase 6 is sufficient.
- **fix-attempter agent** - first-pass targeted-fix when basic-checks or aggregating-review fails.
- **debug-instrumenter agent** - second-pass; adds `// INSTRUMENT`-marked logging into still-failing modules so the next fix-attempter dispatch has data. Orchestrator strips instrumentation after the green run.
- **`/bytheslice:ship-pr` - universal closeout skill** - takes any feature branch with locally-committed work and ships it through pre-flight safety checks → push → PR open (or reuse existing) → CI watch (with `ci-fix-attempter` auto-fix loop on red, capped at 3 attempts before HITL) → user-authorized merge gate → main sync + local and remote branch deletion + worktree removal. Decoupled from `/deliver-stage` and `/add-feature` so the operator can run a manual visual UAT or local code review between commit and PR. Hard rules verified under adversarial probe testing (6/6 pass): never ship from main, never force-push (even `--force-with-lease`), never auto-stash on cleanup, never modify a passing test to match wrong behavior, never silence a real lint failure with `eslint-disable`, reuse existing PRs rather than creating duplicates.
- **`/library` operator-only preview route** - `init-design-system` now scaffolds a Storybook-like in-app component preview at `app/(dashboard)/library/` (or detected route-group equivalent) after the design-system bootstrap. Left sidebar with search + entries, main pane showing every variant × every state, sidebar bottom rail theme toggle (Sun/Moon, persisted via `next-themes`). The route is audited out of every navigation surface (sidebar, top nav, mobile sheet, sitemap, robots, breadcrumbs) and seeded with a Buttons example. Owned by the new `library-route-scaffolder` agent.
- **Phase 4.5 - Library Preview Gate** in deliver-stage's frontend pipeline. Non-skippable. Fires when a stage either (a) authors a new component or block, OR (b) modifies any user-visible surface (props, copy, content, variants, states, styles) of an existing library component as it appears in a production route. Pure internal refactors with no rendered-output delta are exempt. Owned by the new `library-entry-writer` agent, dispatched in `mode: "new"` (append a fresh `/library/<slug>` entry) or `mode: "modify"` (update the existing entry's matrix with the delta). The orchestrator HITLs the user with `hitl_category: "creative_direction"` for explicit approval / revision (cap 2 loops) / rejection before any production-route import or consumer-side user-visible edit lands.
- **27 new subagents** authored across the plugin so every heavy workflow step has an owner: `rules-loader`, `basic-checks-runner`, `aggregating-test-reviewer`, `fix-attempter`, `debug-instrumenter`, `library-entry-writer` (deliver-stage); `ci-fix-attempter` (ship-pr); `scaffold-discovery`, `framework-detector`, `e2e-installer`, `workflow-writer`, `husky-installer`, `lint-config-writer`, `branch-protection-writer`, `local-gates-runner` (scaffold-ci-cd, which previously had zero); `env-scanner`, `github-secrets-scanner`, `checklist-generator` (setup-environment); `library-route-scaffolder` (init-design-system); `bootstrap-runner`, `config-generator`, `ci-cd-detector` (setup); `brief-analyzer`, `consistency-checker` (write-prd); `stage-decomposer`, `rules-assembler` (plan-phases); `proposal-drafter` (review-pipeline).
- **"Always provide a recommended answer"** directive added to every clarifying-question phase across the plugin (scaffold-ci-cd, setup, plan-phases, write-prd, add-feature, init-design-system, review-pipeline, deliver-stage Phase 2).

### Changed
- **`/ship-feature` and `/ship-frontend` are gone.** They're replaced by `/bytheslice:deliver-stage`. The frontend pipeline (modern-ux-expert → layout-architect → block-composer → component-crafter → state-illustrator → visual-reviewer) lives under `skills/deliver-stage/agents/frontend/` and runs as Phase 4 of `deliver-stage` when the active stage has `type: frontend`.
- **Foundation skills are now sub-skills of `deliver-stage`.** Physically moved under `skills/sub-disciplines/` (`init-design-system`, `scaffold-ci-cd`, `setup-environment`). They remain user-invocable as escape hatches; documentation everywhere now labels them "Sub-skill of `/bytheslice:deliver-stage`."
- **`/run-pipeline` is now explicitly experimental.** It no longer duplicates stage-routing logic; its `stage-runner` agent is a thin wrapper that invokes `/bytheslice:deliver-stage` per stage. Same artifacts, same Phase 6/7 gates, regardless of whether you run `deliver-stage` directly or through `run-pipeline`. README diagram now shows `run-pipeline` as a dashed sidecar.
- **`scaffold-ci-cd` SKILL.md slimmed from 275 lines to ~190** - the workflow is now an orchestrator that dispatches eight specialized agents instead of inlining detection, template-writing, husky install, eslint config, and branch-protection logic.
- **`setup-environment` SKILL.md now dispatches `env-scanner` / `github-secrets-scanner` / `checklist-generator`** instead of inlining the scanning and checklist-rendering logic.
- **`/bytheslice:add-feature` now hands off to `/bytheslice:deliver-stage`** (was: `/ship-feature`). Also commits new plan files on a `chore/add-stages-<lo>-<hi>` branch and offers `/ship-pr` as the chore-PR option.
- **`/bytheslice:deliver-stage` Phase 9 trimmed** - now stops at "slice committed locally, ready for review" with an explicit handoff to `/ship-pr`. Completion Checklist sections §1-§4 are this skill's responsibility; §5 (PR + CI green) and §6 (merge + cleanup) are explicitly handed off to `/ship-pr`. Replaces the prior monolithic Phase 9 that bundled commit-through-cleanup in a single non-pausable run, giving the operator a real review/UAT window between commit and ship.

### Migration
- `/ship-feature` → `/bytheslice:deliver-stage` (drop-in for backend/full-stack/db-schema/infrastructure stages).
- `/ship-frontend` → `/bytheslice:deliver-stage` (auto-routes to the frontend pipeline when the stage has `type: frontend`).
- Existing `/run-pipeline` invocations continue to work; the only behavioral change is that each stage now runs through `deliver-stage`'s Phase 6/7 verifications.
- Foundation-skill commands (`/init-design-system`, `/scaffold-ci-cd`, `/setup-environment`) still work as escape hatches; the documented entry point is `deliver-stage`, which dispatches them automatically by stage type.

---

## [2.2.1] - 2026-05-05

### Changed
- **GitHub repo renamed** from `steve-piece/phased-dev-workflow` to `steve-piece/bytheslice`. GitHub redirects the old URL, but every plugin manifest, README, and skill reference now points to the canonical new URL.
- **Default plugin path renamed** from `~/phased-dev-workflow` to `~/bytheslice` (used by `/bytheslice:review-pipeline` to locate the plugin repo for retrospective PRs). If you kept your local clone at `~/phased-dev-workflow`, set the env var override below.
- **Env var renamed:** `PHASED_DEV_PLUGIN_PATH` → `BYTHESLICE_PLUGIN_PATH`. Used to override the default plugin path for `review-pipeline`. Set in your shell rc:
  ```sh
  export BYTHESLICE_PLUGIN_PATH="$HOME/wherever/your/clone/lives"
  ```
- **`package.json` `name`** renamed `phased-dev-workflow` → `bytheslice` for consistency with the plugin manifest and repo.

### Migration
If you renamed your local clone to `~/bytheslice`, no env var needed. If you kept it at `~/phased-dev-workflow` (or anywhere else), add `BYTHESLICE_PLUGIN_PATH` to your shell rc with the absolute path. The old `PHASED_DEV_PLUGIN_PATH` env var is no longer read.

---

## [2.2.0] - 2026-05-05

### Added
- **`/bytheslice:add-feature`** - bolt new features onto an existing project after the original PRD-to-app run is complete. Auto-detects whether the project is ByTheSlice-built (`docs/plans/00_master_checklist.md` present), an existing app needing setup first, or a fresh folder needing bootstrap. For ByTheSlice projects, runs the `complexity-assessor` subagent (single-stage vs multi-stage), surfaces the proposed breakdown for authorization, then dispatches `phased-plan-writer` in incremental mode to write the new stage files. Hands off to `/bytheslice:ship-feature` or `/bytheslice:run-pipeline` for delivery.
- **`phased-plan-writer` incremental mode** - same agent now operates in two modes: `plan-phases` mode (original PRD run, stages 5+) or `incremental` mode (any stage number, complexity-assessor output as primary input, no PRD context required).
- **Setup Step 3 - CI/CD Baseline Check** - Flow B and Flow C now check the four CI/CD baseline markers (`ci.yml`, `design-system-compliance.yml`, husky `pre-push`, PR template) and offer to scaffold via `/bytheslice:scaffold-ci-cd` if missing. Makes ByTheSlice viable for non-PRD-to-app workflows.

### Changed
- **Skills renamed to verb-first scheme** (with `sp-` prefix dropped):
  - `prd-generator` → `write-prd`
  - `prd-to-phased-plans` → `plan-phases`
  - `sp-design-system-gate` → `init-design-system`
  - `sp-environment-setup-gate` → `setup-environment`
  - `sp-ci-cd-scaffold` → `scaffold-ci-cd`
  - `sp-frontend-design` → `ship-frontend`
  - `sp-feature-delivery` → `ship-feature`
  - `the-orchestrator` → `run-pipeline`
  - `phased-dev-retrospective` → `review-pipeline`
- **`bootstrap` skill folded into the new `setup` umbrella.** Standalone `bootstrap` skill removed; functionality is now Step 1 of `/bytheslice:setup`. Auto-detects whether you're starting fresh (Flow B) or in an existing project (Flow C).
- **First-time-install flow added to `setup`.** Flow A creates `~/.bytheslice/defaults.json` so future projects can opt in to your machine-wide defaults via a single Group 1 question instead of re-answering the per-section setup questions.
- **References relocated.** `references/model-tier-guide.md`, `references/bytheslice-config-schema.md`, and the root-level `bytheslice.config.example.json` all moved to `skills/setup/references/`.

### Migration
If you have local docs or scripts referencing the old paths or skill names, update them. Per-project `bytheslice.config.json` files from v2.1 don't need changes - the schema is unchanged. If you have a ByTheSlice project that already shipped its plan, run `/bytheslice:add-feature` to extend it.

---

## [2.1.0] - 2026-05-04

### Added
- **`bootstrap` skill (Stage 0)** - optional on-ramp that scaffolds a new Next.js single-app or Turborepo monorepo, drops in `bytheslice.config.json`, and creates a gitignored `ROADMAP.local.md`. *(Folded into the `setup` umbrella in 2.2.0.)*
- **`bytheslice.config.json` personalization layer** - optional per-project file at the project root; overrides plugin defaults declaratively (model tiers, stage shape, MCPs, visual-review tooling, HITL categories, external rule imports).

### Changed
- **`sc-` prefix removed from slash commands.** When the plugin is published to the marketplace, commands are auto-namespaced under `bytheslice:` (e.g., `/bytheslice:write-prd`). The bare form (`/write-prd`) also works in local dev.

---

## [2.0.0] - 2026-05-04

### Added
- **`init-design-system`** (formerly `sp-design-system-gate`) - Stage 1 design-system gate. Bundle-first or brief-first.
- **`setup-environment`** (formerly `sp-environment-setup-gate`) - Stage 3 env-setup gate. Scans `.env.example`, generates manual provisioning checklist, env-verifier sub-agent confirms keys without logging values.
- **`ship-frontend`** (formerly `sp-frontend-design`) - type:frontend pipeline. 6 sub-agents: modern-ux-expert → layout-architect → block-composer (mandatory first) → component-crafter (conditional) → state-illustrator → visual-reviewer. Hardcoded visual-review tooling priority (Claude in Chrome > Chrome DevTools MCP > Playwright > Vizzly).
- **`review-pipeline`** (formerly `phased-dev-retrospective`, experimental) - cross-stage friction detection.
- **HITL bubbling architecture** - sub-agents NEVER prompt the user directly. They return structured `needs_human` fields with category + question. The orchestrator is the only surface that calls `ask_user_input_v0`.
- **Model alias system** - `haiku`, `sonnet`, `opus` aliases everywhere (no version pins). Per-tier overrides via `ANTHROPIC_DEFAULT_*_MODEL` and `CLAUDE_CODE_SUBAGENT_MODEL` env vars.
- **Embedded completion checklists** inside each SKILL.md (separate `*-checklist.md` reference files removed for cross-platform compatibility).
- **Opinion-free architecture-conventions baseline** at `skills/plan-phases/references/architecture-conventions.md` - only universal web standards, performance facts, conditional security baselines, conditional framework-version syntactic facts, structural project variants. NO naming conventions, type-vs-interface, internal organization rules - those come from the user via plan-phases elicitation Q9.
- **Stage routing in run-pipeline** - orchestrator reads each stage file's `type:` frontmatter and dispatches to the correct skill.
- **Plugin manifest renamed to `bytheslice`**, version bumped to `2.0.0`.

### Changed
- **Stage 1 is now the design-system gate** (was CI/CD scaffold in v1). CI/CD scaffold is now Stage 2.
- **20-30 vertical-slice feature stages** is the new target (was loose in v1).
- **6-task hard cap per stage**, completable in one fresh agent session.
- **Linear is now optional** - gathered via question gate in `plan-phases`, not in the main flow.

### Removed
- `skill-mcp-scout` sub-agent - MCPs are now defined in the phased plan and read from the project rules file.
- All hardcoded model version references in skill / agent files.
- `cursor`-specific and `claude`-specific bare references throughout - replaced with generic "project rules file" or inline "(cursor or claude rules file)".

### Migration from v1

If you have an existing v1 project:

[ ] Re-run `/bytheslice:plan-phases` against your existing PRD to regenerate stage files with v2 frontmatter.
[ ] If you had already completed v1 Stage 1 (CI/CD scaffold), mark `stage_2_ci_cd_scaffold.md` as completed in the master checklist before running the orchestrator.
[ ] If your project does not need a design system, you can stub Stage 1 by completing `stage_1_design_system_gate.md` manually with a minimal token set.
[ ] Update any custom sub-agents to return the standard HITL fields (`needs_human`, `hitl_category`, `hitl_question`, `hitl_context`) instead of prompting the user directly.

---

## [1.0.0]  2026-04

Initial release. PRD generation, phased planning, and CI/CD hardening skills.
