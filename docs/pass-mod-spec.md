<p align="center"><img src="../assets/brand/logo.png" alt="ByTheSlice" width="260"></p>

# The Pass: a ByTheSlice mod spec

Status: draft for review, 2026-10-14. Target: Claude Code 2.1.299+ (Claude Mods, GA since 2.1.287).

> **Status update, 2026-10-20 (ByTheSlice 5.3.0).** This spec stays, and it is the operator's top priority. The Pass ledger (`.bytheslice/ledger.jsonl`) is the **single sanctioned completion record**: the one ledger that tracks project progression over time. It is distinct from the per-step proof files 5.3.0 bans (artifact hashes, source freezes, fingerprint files, leases), and the 5.3.0 no-proof-ledger rule names it as the explicit exception (see [architecture.md](architecture.md#evidence-not-proof-ledgers)). Build its agent events on the Pie 4 kitchen activity log ([`hooks/kitchen-log.sh`](../hooks/kitchen-log.sh), `.claude/.bytheslice-state/kitchen/activity.jsonl`) rather than a second recorder.

## Verdict

ByTheSlice turns into a live harness by shipping one mod inside the existing plugin, called **the Pass**. In a pizzeria the pass is the counter where every order is checked before it goes out, with the ticket rail hanging above it. The mod does both jobs:

1. **Ticket rail.** A live tracker of pies, slices, gates and agents. The agent and the human read the same view, and Markdown files are no longer the only record.
2. **Check at the pass.** The quality rules run inside the engine: verify-once, the model policy, fix-loop caps and checkbox integrity. Today those rules live in skill prose and in Bash pattern matching.

The Markdown checklist stays as the durable, git-friendly plan. The mod adds a structured **ledger** of what actually happened, and gates every claim of "done" against it.

---

## 1. Problems this solves

| Gap today | Effect on quality | Pass fix |
|---|---|---|
| The agent flips `[x]` in `00_master_checklist.md` by editing text | A slice can be marked done without a verifier pass | Checkbox guard backed by ledger evidence (section 4.5) |
| Verify-once separation and model tiers are prose instructions | Drift: the tester gets builder context, or a verifier runs on Opus | `agent.spawn` enforcement (section 4.6) |
| Bash guards match command strings (`pre-commit-guard.sh`) | Bypassable and blind to intent | `tool.call` guards on typed tool input with fail-closed `.catch` |
| Subagent handback stalls (seen in the agent teams smoke test) | Silent hangs, wasted wall-clock | Watchdog over `$.agent.list()` (section 4.7) |
| `/run-the-day` context drift; progress only in chat scrollback | The human cannot see where a long run stands | Pane plus band, always on screen |
| HITL bubbles only as chat text | Blocking questions sit unseen | HITL inbox with a native notification |
| `/close-shop` retro reads logs and commits | Weak signal for plugin improvement | The ledger gives exact metrics per slice |

## 2. Principles

- **Same truth for agent and human.** Every number the pane shows, the agent can read through a tool. Nothing is display-only.
- **Ledger proves, Markdown plans.** The checklist says what should happen. The ledger records what did, with evidence: verdict, commit SHA, agent id. A checkbox can only follow the ledger.
- **Gates fail closed.** Every guard registers a `.catch` that denies when the hook errors or times out.
- **Graceful degradation.** Cursor, `claude -p`, the SDK and the remote kill switch must all still work. Without the mod, ByTheSlice behaves exactly as it does today, because the Bash hooks stay in place as the floor.
- **Gates are never teamified.** Builder, tester and verifier stay one-shot subagents. The mod enforces that; it does not relax it.

## 3. Packaging

- The mod lives inside the existing plugin. `hooks/hooks.json` gains `"modules": ["./mod/register.tsx"]` beside the current `"hooks"` block. Both kinds can sit in one file.
- `plugin.json` gains `"types": "./mod/types/index.d.ts"` for the `$.state` contract.
- Source tree: `mod/register.tsx` (wiring only), plus `mod/ledger.ts`, `mod/gates.ts`, `mod/rail.tsx`, `mod/watchdog.ts`, `mod/team.ts`, and `mod/*.test.ts`.
- **Gating checks before merge:**
  - `claude plugin validate .` must list every gate as having a `.catch`.
  - `claude plugin test .` must pass on both the `terminal` and the `desktop` surface.
  - The Cursor plugin must still load unchanged. Verify that Cursor ignores the `modules` key; if it does not, give Cursor its own `hooks.json`.
- Minimum version: 2.1.299. That release added `turn.start` for teammates and `agent.spawn` on resume, and the team view depends on both. Older versions load the plugin with the mod inert.

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
- **`PromptHint`:** the next expected action, such as `/box-it-up ready` when all slices are done.
- **`$.ui.toast`:** fires on slice done, gate fail and push.
- **`$.ui.notify`:** a native OS notification, used only for blocking HITL and a finished pie.

### 4.4 Agent-visible surface (same truth for the model)

The model reads and writes the ledger through registered tools (`$.tool.register`), not through Markdown:

| Tool | Purpose |
|---|---|
| `bts_status` | Returns the compact projection: the active pie and slice, gate results, agents, and the next action. Skills call it at every phase boundary in place of re-reading the checklist. |
| `bts_hitl` | Raises a blocking question in one of the four HITL categories. The pane, band and notification all fire, and the loop halts until it is answered. |
| `bts_note` | Appends a free-form decision note to the slice's ledger. The retro and the PR body use these. |

The system prompt is left alone. Changing it each turn would invalidate the prompt cache. If a standing reminder is needed, `prompt.compose` adds one fixed section ("call `bts_status` before choosing the next step") that never changes.

> **Note (5.2, as built).** `bts_status` and `bts_note` return facts and halt nothing: `bts_status` reads the session's atoms and the ledger projection (the ledger plus the Pie 4 kitchen activity log) and answers text under 40 lines, including a `Next:` line that is advice, not a gate; `bts_note` appends one `note` row (text cut at 2,000 characters) and answers `ok`. Both are listed with their schemas in the prompt (`isDeferred: false`) from the first turn, as `mcp__bytheslice__bts_status` and `mcp__bytheslice__bts_note`. `pass reconcile` prints where the checklist and the ledger disagree and edits nothing. `bts_hitl` arrives in 5.5.

### 4.5 Gates: the check at the pass

Each gate is a `tool.call` hook with a fail-closed `.catch`. A denial tells the model why, and the tool row shows the reason.

| Gate | Trigger | Rule |
|---|---|---|
| **Checkbox integrity** | `Edit`/`Write` on `00_master_checklist.md` that flips a slice to `[x]` | Deny unless the ledger has a `slice-verifier` pass **and** a `slice-tester` pass for that slice at the current HEAD SHA. |
| **Push integrity** | `Bash` `git push` to a pie branch | Deny unless the slice being pushed is verified at HEAD. (5.4 kept `pre-commit-guard.sh` as a warning for hosts without the mod.) |
| **Fix-loop cap** | `agent.spawn` for `fix-attempter` | Deny attempt 4 or later on the same slice and raise HITL automatically. |
| **Main-branch guard** | `Bash` commit or push while on `main` | Deny. This duplicates the Bash hook while both exist and keeps the stricter result. |
| **Plan write guard** | `Edit`/`Write` under `docs/plans/stage_*` during a bake | The same rule the stage plan Bash hook held, moved onto typed input (5.4 retired that hook). |

> **Note (5.3, as built).** Every check warns and none denies, drops or rewrites (operator decision for Pie 5). A check judges before the call from session atoms and the checklist text held in memory (never the disk or a process), always calls `next`, and reports each finding three ways: one `warn` ledger row `{ code, text }`, one toast, and the text the model reads (a tool call's `context` after its result; for a spawn or a turn, a hidden note appended to the loop that spawned the agent). The same code and key report at most once a minute, and the band takes the warning style for five minutes. Codes: `checkbox-without-verdict` (a `### Slice` or Prep box ticked, or a slice the parser now reads done, without a `slice-verifier` pass at HEAD), `checkbox-without-tester` (a `frontend` or `full-stack` slice with no `slice-tester` pass, any HEAD; `requireTester` widens or narrows this), `push-slice-done-unverified` (a push on a pie branch whose HEAD is a commit of a slice already `[x]` without a verifier pass there; mid-slice pushes are silent), `fix-loop-cap` (fix-attempter attempt 4 on a slice, or ci-fix-attempter round 4 on a pie), `commit-on-main` (best effort under `git -C` or `cd`), `plan-write-during-bake` (while `sell-slice` was the last ByTheSlice skill started; `sell-pie` appends build notes to stage files by design, so it is exempt, as the retired stage plan Bash hook had it). `pass checks` and the pane list the latest ten. HITL on the fix cap arrives in 5.5.

### 4.6 Spawn policy: verify-once and model tiers

An `agent.spawn` hook rewrites or refuses each spawn according to a role table:

| Role | Enforced model | Context rule |
|---|---|---|
| `implementer`, `fix-attempter`, `ci-fix-attempter` | opus | none |
| `slice-tester` | sonnet | Prompt must be the manifest plus Exit criteria plus the design-system path only; deny if it carries builder transcript markers |
| `slice-verifier`, `spec-reviewer`, `quality-reviewer` | sonnet | Same separation rule as `slice-tester` |
| discovery, recon, `rules-loader`, scanners | sonnet or haiku | none |
| any spawn without an explicit `model` | the role's default from this table | none |

The table lives in `bytheslice.config.json`, so each project can override it, and every override is recorded in the ledger. The hook only touches `model` and denials, never the task itself, so it cannot change what an agent is asked to do.

> **Note (5.3, as built).** The spawn policy warns and never rewrites or refuses: `agent.spawn` returns `next`'s answer untouched. The role defaults in `mod/policy.ts` mirror each registered agent's `model:` frontmatter (one tier per role, 49 roles: `implementer`, `quality-reviewer`, `retrospective-reviewer` and `token-expander` opus; `fix-attempter`, `ci-fix-attempter`, `slice-tester`, `slice-verifier` and `spec-reviewer` sonnet; `discovery`, `rules-loader` and the scanners haiku), not the table above, and `tests/pass/policy-parity.test.js` keeps them equal. A project overrides per role under `bytheslice.config.json` key `pass.spawnPolicy.roles` (and `contextMarkers`, `checks.enabled`, `checks.requireTester`); each override is recorded once as a `note` row with `data.kind: 'policy-override'`. Codes: `model-policy` (a named model outside the role's tiers, matched by substring), `model-drift` (a spawn that named no model, or an allowed one, whose first turn ran on another tier), `builder-context` (a tester, verifier, spec or quality reviewer prompt holding a context marker or past 20,000 characters). Teammates and resumed runs are left to 5.6.

### 4.7 Watchdog: handback stalls

`$.clock.every(30s)` scans `$.agent.list()`:
- If an agent has been `running` past its role's budget with no new tool activity in the ledger, flag it in the pane and toast once.
- If it is a stall in a teammate's subagent (the smoke-test case), send a nudge to the owning loop and record `agent.stalled`.
- After a second stall, raise HITL instead of nudging again.

### 4.8 Team mode (`/run-the-day` as a native team)

This builds on the teams harness direction. The lead is the shift manager and each teammate is a baker for one pie.
- **Roster:** `$.agent.list()` entries with `teammateId`, shown in the pane's team section.
- **Turn tracking:** `turn.start` with `e.agentId` (2.1.299) attributes each teammate turn to its pie.
- **Idle and done:** `classic.TeammateIdle` and `classic.TaskCompleted` feed the ledger. The gates in section 4.5 apply to teammates too, because their tool calls pass through the same `tool.call` hooks.
- **Open question:** whether mod tools (`$.tool.register`) and `$.clock` can stand in for the Workflow and ScheduleWakeup tools that in-process teammates lack. That is spike S2 below.

### 4.9 Collaboration (beyond one terminal)

- **Same machine, many sessions:** the `$.store` index means a session baking Pie 5 shows Pie 4's status, read-only, in its roadmap strip. One fresh chat per pie, without losing the wider picture.
- **Pie PR:** `/box-it-up` builds the PR body from the ledger: slices, verdicts, fix loops, models used, cost and decision notes. Reviewers get evidence, not narrative.
- **Shared live view (phase 4):** mirror the ledger projection to a shareable page that people outside the terminal (a client or collaborator) can open. Feasibility is unverified: it depends on what `$.http.fetch` can reach. That is spike S3.

### 4.10 Slice replay and touched files (human review)

- **Slice replay:** borrowed from Anthropic's Replay Theater sample mod. The mod records every `Edit`/`Write` from `tool.call` and always calls `next(e)`, so it only observes. Edits are grouped by **slice** rather than by turn, and subagent edits are included, attributed to their `agentId`. `/pass replay <slice>` steps through them in the pane with Prev and Next. This is the human's review tool before `/box-it-up`.
- **Touched files:** borrowed from Filetree. The pane lists the files the active slice touched, with +N/-N from `git diff --numstat` via `$.process.run`, colored by which role touched them. A builder edit after the verifier's pass shows red, because it invalidates that verdict.
- **Human gates with buttons:** borrowed from Blast Radius. The HITL inbox and the `/box-it-up` merge step hold the call and show Approve and Cancel buttons in the pane. The model is told the reason when the person cancels.
- **Narrow terminals:** like Blast Radius and Replay Theater, the pane falls back to the `AbovePrompt` band when the terminal is too narrow for a sidebar.

### 4.11 Retro feed

`/close-shop`'s `retrospective-reviewer` reads `ledger.jsonl` directly: gate failure rate per slice type, fix-loop depth, stalls, model-policy rewrites, HITL wait time, and cost per slice. Proposals become data-driven.

### 4.12 Prior art

| Mod | What the Pass takes from it |
|---|---|
| Savvy Progress (JohnnyVizz/claude-kit) | Live agents panel from `agent.spawn` and `tool.call`; a progress tool that only the orchestrator may call, so a subagent cannot report progress for its own slice |
| Replay Theater (Anthropic sample) | Observe-only `tool.call` recording; replay pane |
| Blast Radius (Anthropic sample) | Hold the call and deny with a reason; Approve and Cancel buttons |
| Filetree (data-goblin) | Live touched-file view with git status |
| You Should Know (Anthropic built-in) | Not adopted: it runs a model on every turn, which costs tokens. The Pass stays deterministic code. |

## 5. Rollout

| Phase | Ships | Exit criteria |
|---|---|---|
| **S0 spike** | Read-only pane and band that parse the existing checklist; nothing gated | Loads in the terminal and desktop; Cursor plugin unaffected; `claude plugin validate` clean |
| **S1 ledger** | Ledger, `bts_status`, toasts, and skills calling `bts_status` at phase boundaries | One real pie baked with the ledger matching the checklist 100% |
| **S2 gates** | Checkbox, push and fix-loop gates (fail closed), and the spawn policy | Seeded violations (tester with builder context, `[x]` without a verdict, Opus verifier) are all denied in `claude plugin test` |
| **S3 watchdog and HITL** | Stall detection, `bts_hitl`, native notifications | Smoke-test stall reproduced and caught |
| **S4 team mode** | Roster, teammate turn attribution, and a decision on Workflow/ScheduleWakeup replacements | A two-pie `/run-the-day` as a team, both pies passing every gate |
| **S5 collaboration** | PR body from the ledger, cross-session strip, optional shared page | A pie PR whose evidence section is entirely ledger-generated |

The Bash hooks retire one at a time, only after their mod gate has covered a full pie with no misses.

## 6. Quality metrics

- Slices marked `[x]` with a matching verifier and tester pass at HEAD: **100%**, enforced.
- Spawns that break the model policy and reach execution: **0**.
- Handback stalls detected within 60 seconds of the budget passing.
- Median fix-loop depth per slice, tracked per pie to show whether plans are improving.
- Wait time from HITL raised to answered.

## 7. Risks

| Risk | Mitigation |
|---|---|
| The mod API changes between releases (the docs say so) | Pin a minimum version; type-check against generated types in CI; the plugin stays functional with the mod inert |
| The remote kill switch turns mods off mid-pie | The Bash hooks stay as the floor until S5; `bts_status` falls back to the checklist |
| Mods are not sandboxed and run with the user's permissions | No network calls except the opt-in S5 mirror; the ledger lives only under `.bytheslice/` |
| 10-second hook limit on gates | Gates read in-memory atoms only, never the disk or network, on the hot path |
| Double enforcement while Bash hooks and mod gates coexist | Both may deny; the reasons name their source so a conflict is visible |
| Cursor and Codex users get nothing | Accepted. The value is Claude Code-specific, and the Markdown flow still works everywhere |

## 8. Open decisions

1. Mod inside the plugin, or a separate `bytheslice-pass` plugin? (Recommended: inside.)
2. Ledger location: `.bytheslice/` in the repo, or the user's home? (Recommended: the repo, gitignored.)
3. Should the checkbox gate also block a human editing the checklist by hand? (Recommended: no; it covers model tool calls only.)
4. Fix-loop cap: 3?
5. Does S5's shared page need to be built at all, or does the pie PR cover collaboration?
