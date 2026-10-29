<p align="center"><img src="../assets/brand/logo.png" alt="ByTheSlice" width="260"></p>

# The Pass: a ByTheSlice mod spec

Status: **shipped in ByTheSlice 5.4.0 (2026-10-21)** as a warn-only mod; first drafted for review 2026-10-14. Target: Claude Code 2.1.299+ (Claude Mods, GA since 2.1.287).

> **Status update, 2026-10-29 (ByTheSlice 6.1.0).** The one refusal 5.8 added is gone: every check warns again, and the `enforcement` key and `BTS_ALLOW_BYPASS` are removed. The Pass also runs the kitchen and Lobby logging scripts (`mod/relay.ts`), and `pre-commit-guard.sh` is retired. The 5.8 notes below are history.

> **Status update, 2026-10-21 (ByTheSlice 5.4.0): shipped.** Slices 5.1 to 5.7 built the Pass this spec describes, with one operator decision applied throughout: **every check warns and nothing blocks**. No mod hook denies, drops or rewrites a call, a spawn or a prompt, and every `.catch` passes the call through. The "Note (as built)" blocks under each section record what shipped; the design text stays where it still holds and is reworded where it described refusing. Three departures from the 5.3 design: (1) **push check timing:** the push check fires only when HEAD is a commit of a slice already `[x]` without a verifier pass there, so a mid-slice push is silent (the design judged every push to a pie branch); (2) **tester requirement:** a `slice-tester` pass is expected only for `frontend` and `full-stack` slices, at any HEAD, and `pass.checks.requireTester` (`ui-slices`, `always`, `never`) widens or narrows it (the design wanted both passes at HEAD for every slice); (3) **role table from agent frontmatter:** the spawn policy's tiers are each registered agent's own `model:` line, held equal by `tests/pass/policy-parity.test.js`, not the table in section 4.6. Slice 5.4 retired four Bash hooks (stage plan guard, library gate guard, library approval recorder, compaction snapshot) and turned `pre-commit-guard.sh` into a warning.

> **Status update, 2026-10-20 (ByTheSlice 5.3.0).** This spec stays, and it is the operator's top priority. The Pass ledger (`.bytheslice/ledger.jsonl`) is the **single sanctioned completion record**: the one ledger that tracks project progression over time. It is distinct from the per-step proof files 5.3.0 bans (artifact hashes, source freezes, fingerprint files, leases), and the 5.3.0 no-proof-ledger rule names it as the explicit exception (see [architecture.md](architecture.md#evidence-not-proof-ledgers)). Build its agent events on the Pie 4 kitchen activity log ([`hooks/kitchen-log.sh`](../hooks/kitchen-log.sh), `.claude/.bytheslice-state/kitchen/activity.jsonl`) rather than a second recorder.

## Verdict

ByTheSlice turns into a live harness by shipping one mod inside the existing plugin, called **the Pass**. In a pizzeria the pass is the counter where every order is checked before it goes out, with the ticket rail hanging above it. The mod does both jobs:

1. **Ticket rail.** A live tracker of pies, slices, gates and agents. The agent and the human read the same view, and Markdown files are no longer the only record.
2. **Check at the pass.** The quality rules run inside the engine as warnings: verify-once, the model policy, fix-loop caps and checkbox integrity. Before the Pass those rules lived only in skill prose and in Bash pattern matching.

The Markdown checklist stays as the durable, git-friendly plan. The mod adds a structured **ledger** of what actually happened, and checks every claim of "done" against it, warning when one lacks evidence.

---

## 1. Problems this solves

| Gap today | Effect on quality | Pass fix |
|---|---|---|
| The agent flips `[x]` in `00_master_checklist.md` by editing text | A slice can be marked done without a verifier pass | Checkbox check backed by ledger evidence, which warns (section 4.5) |
| Verify-once separation and model tiers are prose instructions | Drift: the tester gets builder context, or a verifier runs on Opus | `agent.spawn` checks that warn (section 4.6) |
| Bash guards match command strings (`pre-commit-guard.sh`) | Bypassable and blind to intent | `tool.call` checks on typed tool input; each `.catch` passes the call through |
| Subagent handback stalls (seen in the agent teams smoke test) | Silent hangs, wasted wall-clock | Watchdog over `$.agent.list()` (section 4.7) |
| `/run-the-day` (since removed; `/pizza-party` replaces it) context drift; progress only in chat scrollback | The human cannot see where a long run stands | Pane plus band, always on screen |
| HITL bubbles only as chat text | Blocking questions sit unseen | HITL inbox with a native notification |
| `/close-shop` retro reads logs and commits | Weak signal for plugin improvement | The ledger gives exact metrics per slice |

## 2. Principles

- **Same truth for agent and human.** Every number the pane shows, the agent can read through a tool. Nothing is display-only.
- **Ledger proves, Markdown plans.** The checklist says what should happen. The ledger records what did, with evidence: verdict, commit SHA, agent id. A checkbox should follow the ledger, and the Pass warns when one does not.
- **Checks warn; one refuses.** Every check lets the call run and reports what it found, except `checkbox-without-verdict` with no verifier pass at all under `enforcement: "block"` (5.8, below). Every hook registers a `.catch` that passes the call through when the hook errors or times out, so the mod fails open. (The 2026-10-14 draft had gates refusing on error; the operator chose warnings for Pie 5.)
- **Graceful degradation.** Cursor, `claude -p`, the SDK and the remote kill switch must all still work. Without the mod, ByTheSlice behaves as it did before the Pass: the skills carry the rules, and the hooks that remain after 5.4 (kitchen log, session status, the commit warning) stay in place as the floor.
- **Gates are never teamified.** Builder, tester and verifier stay one-shot subagents. The mod warns (`gate-teamified`) when one starts as a teammate; it does not relax the rule.

## 3. Packaging

- The mod lives inside the existing plugin. `hooks/hooks.json` gains `"modules": ["./mod/register.tsx"]` beside the current `"hooks"` block. Both kinds can sit in one file.
- `plugin.json` gains `"types": "./mod/types/index.d.ts"` for the `$.state` contract.
- Source tree: `mod/register.tsx` (wiring only), plus `mod/ledger.ts`, `mod/gates.ts`, `mod/rail.tsx`, `mod/watchdog.ts`, `mod/team.ts`, and `mod/*.test.ts`.
- **Gating checks before merge:**
  - `claude plugin validate .` must list every gate as having a `.catch`.
  - `claude plugin test .` must pass on both the `terminal` and the `desktop` surface.
  - The Cursor plugin must still load unchanged. Verify that Cursor ignores the `modules` key; if it does not, give Cursor its own `hooks.json`.
- Minimum version: 2.1.299. That release added `turn.start` for teammates and `agent.spawn` on resume, and the team view depends on both. Older versions load the plugin with the mod inert.

> **Note (5.4.0, as built).** `hooks/hooks.json` names the module as `"../mod/register.tsx"` (relative to the hooks file; the form `claude plugin validate` accepts). The source tree grew past the list above: `mod/checks*.ts` replace `gates.ts`, and `capture.ts`, `projection.ts`, `ledger-projection.ts`, `policy.ts`, `hitl.ts`, `notify.ts`, `replay.tsx`, `touched.ts`, `strip.ts`, `history.ts` and `wake.ts` sit beside the files named. Cursor never reads `modules`; since 5.5.3 it loads `hooks/hooks-cursor.json` (Cursor's camelCase, flat format) through the `hooks` key of `.cursor-plugin/plugin.json`. Below 2.1.299 (or a version the engine cannot report) the mod sets `pass.limited`, logs one line and stays inert. The npm package ships `mod`, `scripts/ledger-summary.js` and this spec.

## 4. Components

### 4.1 Ledger (the data layer)

An append-only event log at `.bytheslice/ledger.jsonl`, gitignored and written through `$.fs`. The current-state projection is held in `$.state` atoms, and a per-project index in `$.store` lets other sessions on the same machine see it.

| Event | Source hook | Payload |
|---|---|---|
| `pie.started` / `slice.started` | `command.run` for `/sell-pie` or `/sell-slice`, plus a checklist read | pie, slice, branch |
| `agent.spawned` | `agent.spawn` | agentId, parentId, role (`subagentType`), model, description |
| `agent.finished` | `tool.call` result for `Agent`, or a status change in `$.agent.list()` | agentId, duration, ok/error |
| `verdict` | `tool.call` result for `slice-tester` and `slice-verifier` (parse the Appendix C verdict) | slice, gate, pass/fail, fix_targets, HEAD SHA |
| `fix.attempt` | `agent.spawn` for `fix-attempter` or `debug-instrumenter` | slice, attempt n |
| `commit` / `push` | `tool.call` result for `Bash` git commands | SHA, branch |
| `hitl.raised` / `hitl.answered` | a `bts_hitl` tool (section 4.4) | category, question, answer |
| `turn.usage` | `turn.complete` usage, plus `$.session.usage()` | tokens, cost, context fill |

The ledger is the single writer of slice status. Skills stop editing state prose and call the tools in section 4.4.

> **Note (5.2, as built).** The ledger lives at `<primary checkout>/.bytheslice/ledger.jsonl` (the parent of `git rev-parse --git-common-dir`, so every pie worktree writes one file; the session directory outside git), and the folder carries its own `.gitignore` (`*`) so it stays out of git in any project. `$.fs` has no append, so each row is one `tee -a` write through `$.process.run`. Agent starts, stops, tokens and durations are not recorded twice: they come from the Pie 4 kitchen activity log, and each `slice.done` adds one `slice.rollup` row so they outlive its rotation. `pie.started` and `slice.started` come from `skill.prompt`, the `Skill` tool and the typed command (whichever the session raises; an organization-managed install passes the first and last over), deduplicated against the ledger; `verdict` comes from `turn.complete` of a tester or verifier agent; `commit`, `push` and `merge` from a Bash result that did not error. A ledger write that fails logs once and drops the row; no hook ever refuses a call.

### 4.2 Ticket rail pane (the dashboard)

Opened with `$.ui.open({ id: 'pass', title: 'The Pass' })` and drawn by a `ui.render` hook for `Pane`. It sits as a right sidebar in a wide fullscreen terminal and as a pane in the desktop Code tab.

Sections, top to bottom:
1. **Pie header:** pie name, `review:` mode, branch, slices done out of total, elapsed time, cost so far.
2. **Slice rail:** one row per slice with status (`queued`, `building`, `testing`, `verifying`, `fixing (n/3)`, `done`, `blocked`) and its last verdict.
3. **Live agents:** from `$.agent.list()`, each with role, model, status and time running. Stalled agents are flagged (section 4.7).
4. **Gates:** the last result of each gate for the active slice, with fix targets when one failed.
5. **HITL inbox:** open blocking questions, oldest first.
6. **Team roster** (team mode only): bakers by `teammateId`, their pie, idle or running.

Redraws come from atom writes, which are throttled by the engine to about 10 per second. Clicking a slice row shows its ledger history.

### 4.3 Band and hint line (always-visible state)

- **`AbovePrompt` band:** a single line such as `Pie 4 · Slice 4.2 verifying · 3 agents · fix 1/3 · HITL 0`. It turns to a warning style when a gate failed or HITL is open.
- **`$.ui.status`:** a short form, `P4 S4.2 ✓3/6`.
- **`PromptHint`:** the next expected action, such as `/box-it-up ready` when all slices are done and the pie branch is still checked out (after the merge, nothing).
- **`$.ui.toast`:** fires on slice done, gate fail and push.
- **`$.ui.notify`:** a native OS notification, used only for blocking HITL and a finished pie.

### 4.4 Agent-visible surface (same truth for the model)

The model reads and writes the ledger through registered tools (`$.tool.register`), not through Markdown:

| Tool | Purpose |
|---|---|
| `bts_status` | Returns the compact projection: the active pie and slice, gate results, agents, and the next action. Skills call it at every phase boundary in place of re-reading the checklist. |
| `bts_hitl` | Raises a blocking question in one of the four HITL categories. The pane, band and notification all fire; the skill's own HITL flow (ask in chat and stop) is what halts the loop until it is answered. |
| `bts_note` | Appends a free-form decision note to the slice's ledger. The retro and the PR body use these. |

The system prompt is left alone. Changing it each turn would invalidate the prompt cache. If a standing reminder is needed, `prompt.compose` adds one fixed section ("call `bts_status` before choosing the next step") that never changes.

> **Note (5.2, as built).** `bts_status` and `bts_note` return facts and halt nothing: `bts_status` reads the session's atoms and the ledger projection (the ledger plus the Pie 4 kitchen activity log) and answers text under 40 lines, including a `Next:` line that is advice, not a gate; `bts_note` appends one `note` row (text cut at 2,000 characters) and answers `ok`. Both are listed with their schemas in the prompt (`isDeferred: false`) from the first turn, as `mcp__bytheslice__bts_status` and `mcp__bytheslice__bts_note`. `pass reconcile` prints where the checklist and the ledger disagree and edits nothing.

> **Note (5.5, as built).** `bts_hitl` (`mcp__bytheslice__bts_hitl`, `isDeferred: false`) records and notifies, then returns at once; it halts nothing, because a tool hook cannot sit waiting on a person. Raise with `{ category, question, context?, slice? }` (the four categories): it appends `hitl.raised`, shows the item in the pane's inbox and the band (`HITL n`, warning style), sends one native notification titled `ByTheSlice needs you` (a toast when no channel sent it, the reason kept in the row), and answers `{ id, status: 'open', next, notify }` (`notify` says whether the notification went, or why not). The skill's own HITL flow (ask in chat and stop) is what waits. Answer with `{ id, answer }`: `hitl.answered` `{ id, answer, waitedMs, via }`, the answer cut to 500 characters with secret shapes redacted (nothing kept for `external_credentials`). The operator's own reply in chat (a `prompt.submit` from the composer, Remote Control, an SDK host or Slack, not a command) answers every item the model was told to ask in chat, recording `operator replied in chat` and never the reply's words; the model's later answer is kept once as the decision. The pane's `Mark answered` button answers one item. `bts_status` lists open items oldest first.

### 4.5 Gates: the check at the pass

Each check is a `tool.call` (or `agent.spawn`) hook whose `.catch` passes the call through. A finding tells the model why after the call's result, and the ledger keeps a `warn` row naming it.

| Check | Trigger | Rule (as built: warn, and the call runs) |
|---|---|---|
| **Checkbox integrity** | `Edit`/`Write` on `00_master_checklist.md` that flips a slice to `[x]` | Warn (`checkbox-without-verdict`) unless the ledger has a `slice-verifier` pass for that slice at the current HEAD SHA; warn (`checkbox-without-tester`) when a `frontend` or `full-stack` slice has no `slice-tester` pass. The design wanted both passes at HEAD for every slice. |
| **Push integrity** | `Bash` `git push` to a pie branch | Warn (`push-slice-done-unverified`) when HEAD is a commit of a slice already `[x]` without a verifier pass there; a mid-slice push is silent. The design judged every push. (5.4 kept `pre-commit-guard.sh` as a warning for hosts without the mod.) |
| **Fix-loop cap** | `agent.spawn` for `fix-attempter` (and `ci-fix-attempter`, per pie) | Warn (`fix-loop-cap`) on attempt 4 or later on the same slice and open one HITL inbox item; the spawn runs. |
| **Main-branch guard** | `Bash` commit or push while on `main` | Warn (`commit-on-main`); the command runs. `pre-commit-guard.sh` warns on the same commit, each warning naming its source. |
| **Plan write guard** | `Edit`/`Write` under `docs/plans/stage_*` during a bake | Warn (`plan-write-during-bake`): the same rule the stage plan Bash hook held, moved onto typed input (5.4 retired that hook). |

> **Note (5.3, as built).** Every check warns and none denies, drops or rewrites (operator decision for Pie 5). A check judges before the call from session atoms and the checklist text held in memory (never the disk or a process), always calls `next`, and reports each finding three ways: one `warn` ledger row `{ code, text }`, one toast, and the text the model reads (a tool call's `context` after its result; for a spawn or a turn, a hidden note appended to the loop that spawned the agent). The same code and key report at most once a minute, and the band takes the warning style for five minutes. Codes: `checkbox-without-verdict` (a `### Slice` or Prep box ticked, or a slice the parser now reads done, without a `slice-verifier` pass at HEAD), `checkbox-without-tester` (a `frontend` or `full-stack` slice with no `slice-tester` pass, any HEAD; `requireTester` widens or narrows this), `push-slice-done-unverified` (a push on a pie branch whose HEAD is a commit of a slice already `[x]` without a verifier pass there; mid-slice pushes are silent), `fix-loop-cap` (fix-attempter attempt 4 on a slice, or ci-fix-attempter round 4 on a pie), `commit-on-main` (best effort under `git -C` or `cd`), `plan-write-during-bake` (while `sell-slice` was the last ByTheSlice skill started; `sell-pie` appends build notes to stage files by design, so it is exempt, as the retired stage plan Bash hook had it). `pass checks` and the pane list the latest ten. Since 5.5 the fix cap also opens one HITL inbox item per loop (`source: 'pass'`, asked in chat, so it notifies) and tells the model its id in a hidden note; nothing is blocked.

> **Note (5.8, as built).** Enforcement defaults to `block`. `checkbox-without-verdict` refuses the Edit or Write (the tool never runs; one `warn` row with `data.blocked: true`, a toast, and the deny text naming `/sell-slice` or `/sell-pie` and the operator override) when the slice has no `slice-verifier` pass at all or its latest is a fail; a pass at another HEAD still only warns, so a commit after the verifier never strands a flip. Top-level `enforcement: "warn"` in `bytheslice.config.json` (recorded once as a `policy-override` note) or a session launched with `BTS_ALLOW_BYPASS=1` (read once at session start through `$.env.get`, never recorded) turns the refusal back into a warning. A stall HITL item now carries the stalled agent's id (`data.aid`) and closes itself `via: 'auto'` (answer `closed by the Pass: the stalled agent ended`) on that agent's `SubagentStop`, at a watchdog scan that no longer lists it running, or, for another session's item, a day after it was raised; items raised before 5.8 are matched by the id their question names. `bts_status` adds a **Status drift** block: a slice open in the checklist whose ledger commit or `feat(pie-N): N.M` subject is on the default branch, and a slice `[x]` with ledger commits none of which reached it (skipped while that pie's branch is checked out). The checklist is read from the session directory, else the primary checkout (a worktree cut from origin holds no gitignored plans), and a `bts_status` that finds the atom empty reads the file once more before answering. The hook-side refusals (plan files, ad-hoc agents, PRs) live in `hooks/workflow-guard.sh`, not the mod.

### 4.6 Spawn policy: verify-once and model tiers

An `agent.spawn` hook judges each spawn against a role table and warns; it never rewrites or stops one. The design's table (as built, the tiers come from agent frontmatter; see the note below):

| Role | Expected model | Context rule |
|---|---|---|
| `implementer`, `fix-attempter`, `ci-fix-attempter` | opus | none |
| `slice-tester` | sonnet | Prompt must be the manifest plus Exit criteria plus the design-system path only; warn (`builder-context`) if it carries builder transcript markers |
| `slice-verifier`, `spec-reviewer`, `quality-reviewer` | sonnet | Same separation rule as `slice-tester` |
| discovery, recon, `rules-loader`, scanners | sonnet or haiku | none |
| any spawn without an explicit `model` | the role's default from this table | none |

The table lives in `bytheslice.config.json`, so each project can override it, and every override is recorded in the ledger. The hook touches neither the model nor the task: it reads both and warns, so it cannot change what an agent is asked to do or which model runs it.

> **Note (5.3, as built).** The spawn policy warns and never rewrites or stops a spawn: `agent.spawn` returns `next`'s answer untouched. The role defaults in `mod/policy.ts` mirror each registered agent's `model:` frontmatter (one tier per role, 52 roles: `implementer`, `quality-reviewer`, `retrospective-reviewer`, `token-expander`, `ui-fix-attempter`, `discovery`, `scaffold-discovery`, `complexity-assessor` and the three plan writers opus; `fix-attempter`, `ci-fix-attempter`, `slice-tester`, `slice-verifier` and `spec-reviewer` sonnet; `rules-loader` and the scanners haiku), not the table above, and `tests/pass/policy-parity.test.js` keeps them equal. A project overrides per role under `bytheslice.config.json` key `pass.spawnPolicy.roles` (and `contextMarkers`, `checks.enabled`, `checks.requireTester`); each override is recorded once as a `note` row with `data.kind: 'policy-override'`. Codes: `model-policy` (a named model outside the role's tiers, matched by substring), `model-drift` (a spawn that named no model, or an allowed one, whose first turn ran on another tier), `builder-context` (a tester, verifier, spec or quality reviewer prompt holding a context marker or past 20,000 characters). Resumed runs are left alone; teammates are judged as section 4.8 says (5.6).

### 4.7 Watchdog: handback stalls

`$.clock.every(30s)` scans `$.agent.list()`:
- If an agent has been `running` past its role's budget with no new tool activity in the ledger, flag it in the pane and toast once.
- If it is a stall in a teammate's subagent (the smoke-test case), send a nudge to the owning loop and record `agent.stalled`.
- After a second stall, raise HITL instead of nudging again.

> **Note (5.5, as built).** Warn-only: the watchdog never stops, restarts or messages an agent. Every subagent `tool.call` and `turn.start` stamps its loop's last activity (`pass.seen`, at most once per 5 seconds per agent). Every 30 seconds, from `session.start` until `session.end` (a `/clear` starts it again), the scan reads `$.agent.list()` and flags an agent whose status is `running`, that has run past its role's budget and has had no activity for longer than `idleMs`. Defaults live in `mod/policy.ts` (`idleMs` 3 minutes; budgets 15 minutes, discovery 5, implementer 30); `bytheslice.config.json` key `pass.watchdog` (`enabled`, `idleMs`, `budgetsMs`) overrides them, each override recorded once as a `policy-override` note. A slice's first stall writes `agent.stalled` `{ aid, role, runningMs, idleMs, n: 1 }`, one toast, a `stalled` flag on the agent's pane row, and a nudge that is a hidden note appended to the main conversation (`$.session.append`), not a message to the stalled agent; the main loop reads it on its next request, which for a foreground agent is after that agent returns. A second stall in the same slice writes `n: 2` and raises a pane-only HITL inbox item (`source: 'pass'`, category `other`, toast only, no native notification) in place of the note. An agent flags once per stall episode; its next activity ends the episode. Teammates: section 4.8 (5.6).

### 4.8 Team mode (`/run-the-day` as a native team; since removed, `/pizza-party` replaces it)

This builds on the teams harness direction. The lead is the shift manager and each teammate is a baker for one pie.
- **Roster:** `$.agent.list()` entries with `teammateId`, shown in the pane's team section.
- **Turn tracking:** `turn.start` with `e.agentId` (2.1.299) attributes each teammate turn to its pie.
- **Idle and done:** `classic.TeammateIdle` and `classic.TaskCompleted` feed the ledger. The gates in section 4.5 apply to teammates too, because their tool calls pass through the same `tool.call` hooks.
- **Spike answer (5.6, 2026-10-21, CLI 2.1.302, agent teams on with `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` and `teammateMode: "in-process"`):** an in-process teammate has neither `Workflow` nor `ScheduleWakeup` in its tool list, loaded or deferred. Mod tools are callable: a teammate called `bts_status` and got the projection. A teammate can start a one-shot subagent, but in an auto-mode session the subagent's `SubagentHandback` was refused ("the agent that spawned you is no longer running") and no report came back; in an accept-edits session the subagent's final text came back. `$.clock` stands in for `ScheduleWakeup` only through a message: a `$.clock.after` timer that calls `$.session.send({ to: { agentId } })` woke an idle teammate (its next turn started half a second later), while `$.session.append` to an idle teammate is refused (no running loop). In auto mode the timer's send was refused by the auto-mode classifier. Nothing stands in for `Workflow`, so a teammate cannot run `/sell-pie`'s per-slice Workflow, and a two-pie bake as a team is not possible on this CLI; the Pass observes a team and lends it `bts_wake`, and pies stay sequential.

> **Note (5.6, as built).** Observe and warn only. Roster: `$.agent.list()` entries with `teammateId`, one baker per teammate still on the team (`<name>@<team>`, name, pie from its `P<pie> S<slice>` spawn label or else its first `slice.started` row, `running` or `idle`, finished turns, age of its last activity), kept in `pass.team`; the pane gains a Team section and the band `· 2 bakers` while any teammate exists, and `bts_status` lists `team: n bakers`. Each teammate turn end is one `usage` row carrying `data.teammateId` and its pie and slice; a teammate's `sell-pie` or `sell-slice` start (its Skill tool call; with a team, `skill.prompt`, which names no loop, records nothing) records `pie.started` and `slice.started` for its own pie with `data.teammateId`. `classic.TeammateIdle` appends `teammate.idle` `{ name, teammateId }` and `classic.TaskCompleted` of a teammate's task appends `teammate.done` `{ taskId, subject, name, teammateId }`, each only once `next` let it happen (a settings hook that keeps the teammate working or refuses the completion records nothing). The checks reach teammates unchanged; new code `gate-teamified` warns when `implementer`, `slice-tester`, `slice-verifier`, `spec-reviewer` or `quality-reviewer` is started as a teammate (it still starts), and a teammate's model is judged by a `teammate` role (opus or sonnet; `pass.spawnPolicy.roles.teammate` overrides). The watchdog judges a teammate only while it runs a turn with no live child, counting from that turn's start; an idle teammate waits and never flags. `bts_wake` (`mcp__bytheslice__bts_wake`, `{ afterMs, note }`, 10 seconds to an hour, one timer per teammate, cancelled at `session.end`) is a teammate's stand-in for `ScheduleWakeup`: when it fires it sends the note as a message (which wakes an idle teammate) and records a `note` row `{ kind: 'wake', delivered }`; any other loop's call arms nothing.

### 4.9 Collaboration (beyond one terminal)

- **Same machine, many sessions:** the `$.store` index means a session baking Pie 5 shows Pie 4's status, read-only, in its roadmap strip. One fresh chat per pie, without losing the wider picture.
- **Pie PR:** `/box-it-up` builds the PR body from the ledger: slices, verdicts, fix loops, models used, cost and decision notes. Reviewers get evidence, not narrative.
- **Shared live view (phase 4):** mirror the ledger projection to a shareable page that people outside the terminal (a client or collaborator) can open. Feasibility is unverified: it depends on what `$.http.fetch` can reach. That is spike S3.

> **Note (5.7, as built).** One fold, `scripts/ledger-summary.js` (zero dependencies, read-only), serves every reader: `--format json` for `/close-shop` and the kitchen, `--format text` for `pass history`, `--format pr-body` for the PR. Same machine: each session keeps one `$.store` entry `strip:<ledger root>:<sid>` (`{ pie, slice, status, branch, t }`), written when it moves (at most once per 10 seconds, and every 30 minutes unchanged) and deleted at session end; the pane's strip lists the project's other sessions read-only, dropping entries older than six hours. Pie PR: the `bts_pr_body` tool returns the script's Markdown (a slice table with the verifier verdict at its commit, fix loops, models, duration and cost; one warnings line per check code; HITL waits; decision notes), and `/box-it-up` writes it under `## Evidence` after the `--fill` content. The Pie 4 kitchen page gains a Progress sheet (a header button) reading `progress` from `GET /state`: one block per pie, a slice table and an inline SVG step line of slices done over time.
>
> **Shared page spike (CLI 2.1.302, a throwaway `session.start` mod hook in a real `--plugin-dir` session).** `$.http.fetch('http://127.0.0.1:<port>/state')` against the kitchen server answered 200 in 11 ms with `progress` in the body: a mod can reach localhost. `$.http.fetch('https://example.com/')` answered 200 in 85 ms with no denial text: a mod can reach the network in an install with no organization web-fetch policy (such a policy, or `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` with `auth`, can refuse it). A mirror would therefore need a hosted endpoint to receive the projection, auth on both the write and the read side, an explicit opt-in switch that is off by default (section 2 forbids default network calls), and a review of what leaves the machine (slice names and decision notes are in the projection). **Recommendation: do not build the mirror.** The pie PR's ledger-generated Evidence section carries the review evidence to collaborators, and the kitchen Progress sheet shows progress over time to the operator locally; together they cover collaboration (open decision 5). Revisit only if a client needs a live view between PRs.

### 4.10 Slice replay and touched files (human review)

- **Slice replay:** borrowed from Anthropic's Replay Theater sample mod. The mod records every `Edit`/`Write` from `tool.call` and always calls `next(e)`, so it only observes. Edits are grouped by **slice** rather than by turn, and subagent edits are included, attributed to their `agentId`. `/pass replay <slice>` steps through them in the pane with Prev and Next. This is the human's review tool before `/box-it-up`.
- **Touched files:** borrowed from Filetree. The pane lists the files the active slice touched, with +N/-N from `git diff --numstat` via `$.process.run`, colored by which role touched them. A builder edit after the verifier's pass shows red, because it invalidates that verdict.
- **Human gates with buttons:** borrowed from Blast Radius. The HITL inbox and the `/box-it-up` merge step hold the call and show Approve and Cancel buttons in the pane. The model is told the reason when the person cancels.
- **Narrow terminals:** like Blast Radius and Replay Theater, the pane falls back to the `AbovePrompt` band when the terminal is too narrow for a sidebar.

> **Note (5.7, as built).** An `Edit` or `Write` that ran without error appends one `edit` row: the workspace-relative path, the agent id, its role from the spawn map (`main` for the main loop) and the tool, never the content (a path outside the workspace, and the master checklist, are not recorded); `slice.started` rows carry `data.head`. Touched files join a slice's `edit` paths with `git diff --numstat <start head>` (else the merge-base with `main`); a file a builder (`implementer`, `fix-attempter`) edited after the slice's last `slice-verifier` pass is drawn red in the pane, since that edit invalidates the verdict. Git runs on an edit (at most every 2 seconds) and on the 5 second pulse after an edit, verdict or commit, never in a draw. `pass replay <slice>` opens the focused pane `pass-replay` (Escape closes): one step per commit row plus one for uncommitted changes, each with its subject, per-file numstat and editing roles, and the selected file's diff from `git show` in a `Code` element (`format: 'diff'`, plain Text lines where a surface has no `Code`); Prev and Next, and each file, load their git data in the press handler. Under 60 columns the pane is one line, `Replay 5.2: step 2 of 6`, and a hint to widen. Approve and Cancel buttons that hold a call stay out of scope: every check warns, nothing blocks.

### 4.11 Retro feed

`/close-shop`'s `retrospective-reviewer` reads `ledger.jsonl` directly: gate failure rate per slice type, fix-loop depth, stalls, model-policy warnings, HITL wait time, and cost per slice. Proposals become data-driven.

> **Note (5.7, as built).** The reviewer runs `node <plugin>/scripts/ledger-summary.js --root <project> --format json` (its "Ledger metrics" section) and cites fix-loop depth, warning counts by code, stalls, HITL wait and cost per slice, saying "not in the ledger" when a metric is absent rather than reading the absence as zero. Fix loops come from the slice's `slice.rollup` (fix-attempter starts in the activity log), else one per failed verdict.

### 4.12 Prior art

| Mod | What the Pass takes from it |
|---|---|
| Savvy Progress (JohnnyVizz/claude-kit) | Live agents panel from `agent.spawn` and `tool.call`; a progress tool that only the orchestrator may call, so a subagent cannot report progress for its own slice |
| Replay Theater (Anthropic sample) | Observe-only `tool.call` recording; replay pane |
| Blast Radius (Anthropic sample) | Telling the model the reason for a finding. Its held calls and Approve and Cancel buttons were not adopted: every Pass check warns, so nothing holds a call |
| Filetree (data-goblin) | Live touched-file view with git status |
| You Should Know (Anthropic built-in) | Not adopted: it runs a model on every turn, which costs tokens. The Pass stays deterministic code. |

## 5. Rollout

| Phase | Ships | Exit criteria |
|---|---|---|
| **S0 spike** | Read-only pane and band that parse the existing checklist; nothing gated | Loads in the terminal and desktop; Cursor plugin unaffected; `claude plugin validate` clean |
| **S1 ledger** | Ledger, `bts_status`, toasts, and skills calling `bts_status` at phase boundaries | One real pie baked with the ledger matching the checklist 100% |
| **S2 checks** | Checkbox, push and fix-loop checks (warn-only, as built), and the spawn policy | Seeded violations (tester with builder context, `[x]` without a verdict, Opus verifier, and the rest) each yield one `warn` row and a completed call in `claude plugin test`, on both surfaces |
| **S3 watchdog and HITL** | Stall detection, `bts_hitl`, native notifications | Smoke-test stall reproduced and caught |
| **S4 team mode** | Roster, teammate turn attribution, and a decision on Workflow/ScheduleWakeup replacements | A two-pie `/run-the-day` (since removed; `/pizza-party` replaces it) as a team, both pies passing every gate. As built: not possible on CLI 2.1.302 (teammates lack `Workflow`, section 4.8); the exit became a load-only two-teammate run with attributed rows |
| **S5 collaboration** | PR body from the ledger, cross-session strip, optional shared page | A pie PR whose evidence section is entirely ledger-generated. As built: the shared page was spiked and not built (section 4.9) |

The Bash hooks retire one at a time, only after their mod gate has covered a full pie with no misses. As built (5.4): the retirements rested on 408 sampled sessions instead. The stage plan guard (the mod's `plan-write-during-bake` covers it), the library gate guard and its approval recorder (never armed, never warned) and the compaction snapshot (written, never read) are gone, and `pre-commit-guard.sh` stays as a warning (22 of its 25 recorded blocks were false). See [`hooks/README.md`](../hooks/README.md).

## 6. Quality metrics

- Slices marked `[x]` with a matching verifier pass at HEAD (and a tester pass for UI slices): target **100%**, measured rather than enforced; each miss leaves a `checkbox-without-verdict` or `checkbox-without-tester` row.
- Spawns that break the model policy: target **0**, counted by `model-policy` and `model-drift` rows (every spawn still runs).
- Handback stalls detected within 60 seconds of the budget passing.
- Median fix-loop depth per slice, tracked per pie to show whether plans are improving.
- Wait time from HITL raised to answered.

## 7. Risks

| Risk | Mitigation |
|---|---|
| The mod API changes between releases (the docs say so) | Pin a minimum version; type-check against generated types in CI; the plugin stays functional with the mod inert |
| The remote kill switch turns mods off mid-pie | The skills carry the rules in prose, the remaining hooks (kitchen log, session status, the commit warning) stay as the floor, and a model without `bts_status` reads the checklist |
| Mods are not sandboxed and run with the user's permissions | No network calls (the S5 mirror was not built); the ledger lives only under `.bytheslice/` |
| 10-second hook limit on checks | Checks read in-memory atoms only, never the disk or network, on the hot path |
| Double warnings while a Bash hook and a mod check coexist | `pre-commit-guard.sh` and `commit-on-main` may both warn on one commit; each names its source, and neither blocks |
| Cursor and Codex users get nothing | Accepted. The value is Claude Code-specific, and the Markdown flow still works everywhere |

## 8. Open decisions

1. Mod inside the plugin, or a separate `bytheslice-pass` plugin? (Recommended: inside.) **Answered (5.1):** inside, under `mod/`.
2. Ledger location: `.bytheslice/` in the repo, or the user's home? (Recommended: the repo, gitignored.) **Answered (5.2):** the primary checkout's `.bytheslice/`, with its own `.gitignore`.
3. Should the checkbox check also cover a human editing the checklist by hand? (Recommended: no; it covers model tool calls only.) **Answered (5.3):** no; it reads model tool calls only, and it warns.
4. Fix-loop cap: 3? **Answered (5.3.0):** 3 local fix loops per slice and 3 CI fix rounds per pie, separate counters.
5. Does S5's shared page need to be built at all, or does the pie PR cover collaboration? **Answered (5.7 spike):** a mod can reach both localhost and the network through `$.http.fetch`, so a mirror is possible, but it would need a hosted endpoint, auth and an opt-in switch. Not built: the PR's ledger-generated Evidence section plus the local kitchen Progress sheet cover collaboration.
