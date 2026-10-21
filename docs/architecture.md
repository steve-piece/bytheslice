<!-- docs/architecture.md -->
<p align="center"><img src="../assets/brand/logo.png" alt="ByTheSlice" width="260"></p>

# 🍕 ByTheSlice: Architecture & Conventions

The under-the-hood reference for ByTheSlice. The [README](../README.md) covers the day-to-day motion; this doc covers *why the kitchen works the way it does* - the rules the plugin enforces, the verification model, and how legacy projects migrate.

> These aren't suggestions. The skills and their structured agent contracts carry them; the hooks and the Pass mod watch for slips and warn, and never block.

## Contents

- [Pies & Slices - the two-level checklist](#pies--slices-the-two-level-checklist)
- [Mode detection - standalone vs sequential](#mode-detection-standalone-vs-sequential)
- [The verify-once model](#the-verify-once-model)
- [Delivery & git - selling vs boxing](#delivery--git-selling-vs-boxing)
- [Design-system delivery](#design-system-delivery)
- [Orchestration principles](#orchestration-principles)
- [Evidence, not proof ledgers](#evidence-not-proof-ledgers)
- [Hook enforcement](#hook-enforcement)
- [The Pass mod](#the-pass-mod)
- [Live kitchen](#live-kitchen)
- [Legacy & migration](#legacy--migration)
- [Cursor / non-Claude-Code fallback](#cursor--non-claude-code-fallback)

---

## Pies & Slices: the two-level checklist

`cook-pizzas` produces `docs/plans/00_master_checklist.md` as a **two-level Pie / Slice roadmap**.

- A **Pie** (`## Pie N`, 3-8 slices, carrying a `review: boundary|continuous` property) is the unit of `/loop` autonomy, HITL checkpoint, PR, context-refresh, and worktree (in the default `pie-pr` delivery mode; opt-in merge-per-slice delivery makes the slice the unit of PR and worktree).
- A **Slice** (`### Slice N.M`) is one vertical deliverable, hard-capped at **6 tasks / ~10-15 files** - completable in one fresh agent session. Override `stages.maxTasksPerStage` in `bytheslice.config.json` if you truly need a bigger slice.
- **Pie 1 is Foundations** (slices 1.1-1.4: design system, CI/CD, env, DB schema), tracked via the `## Prep` gate. Feature pies are Pie 2+.

`/sell-slice`'s prep gate **refuses to start feature work until every Pie-1 / Prep box is `[x]`**. Each foundation skill flips its own checkbox when invoked in sequential mode. The DB-schema row is conditional - emitted only if the PRD has a backend.

---

## Mode detection: standalone vs sequential

Every skill auto-detects at startup whether a master checklist exists at the project root, and runs in one of two modes:

| Mode | Trigger | Behavior |
|---|---|---|
| **Standalone** | No `docs/plans/00_master_checklist.md` | Run end-to-end, produce the artifact, exit. No checklist coordination, no "next step" handoff. |
| **Sequential** | Master checklist present | On completion, flip the corresponding Prep / Stage row to `[x]` and surface the recommended next step. |

Override auto-detection with explicit `--standalone` / `--sequential` flags. Per-skill posture:

| Skill | Standalone | Sequential |
|---|:---:|:---:|
| `setup-shop` | ✓ entry point | - |
| `create-menu` | ✓ writes a PRD artifact | - |
| `cook-pizzas` | ✓ produces the checklist | refuses if one exists |
| `set-display-case` | ✓ standalone-invocable | ✓ flips Prep box |
| `final-quality-check` | ✓ standalone-invocable | ✓ flips Prep box |
| `open-the-shop` | ✓ standalone-invocable | ✓ flips Prep box |
| `sell-pie` | - | ✓ requires a piefied checklist (refuses flat v4) |
| `sell-slice` | - | ✓ requires checklist |
| `box-it-up` | ✓ works on any branch | ✓ flips the Pie's status on merge if the branch maps to a `## Pie N` row |
| `special-order` | - | ✓ extends checklist |
| `open-kitchen` | ✓ local read-only viewer | ✓ same |
| `inspect-display` | ✓ read-only audit | ✓ same |
| `run-the-day` | - | ✓ drives whole piefied checklist (refuses flat v4) |
| `close-shop` | - | ✓ needs execution history |

**The single rule that holds it together:** skills never assume they're being called from somewhere else. They detect mode from disk state, behave correctly in both, and document both modes in the SKILL.md.

---

## The verify-once model

**Per-slice verify-once is non-negotiable.** Workflow B gates every slice with two agents, and no slice is "done" until both pass - or are intentionally skipped per slice type.

| Agent | Type | What it does |
|---|---|---|
| `slice-tester` | behavioral | Rendered design-system match + per-affordance exercise + seed-and-cleanup data-flow round-trips (with the bidirectional rule). |
| `slice-verifier` | static | Lint / type / build / unit / e2e-by-tag (threshold-gated per `verification.e2e`) + design-system static grep + CI-integrity + the build-manifest under-declaration backstop. The full local suite runs **once per slice**; after a fix only the touched gates re-run. |

The three v4 verifiers (`basic-checks-runner`, `aggregating-test-reviewer`, `ci-cd-guardrails`) and `frontend/visual-reviewer` are deprecated shims folded into these two.

**Build manifest + under-declaration backstop.** The builder (`implementer`) emits a schema-validated manifest declaring every route / component / affordance / serverAction / transition it produced. `slice-verifier` independently greps the slice diff and **fails if the manifest under-counts** - so a builder can't hide an affordance from the tester with prompt wording alone.

**Context-separated dispatch.** The `/sell-pie` `/loop` conductor holds zero implementation context. Per slice it routes structured artifacts between singular-goal agents - the `slice-tester` receives only the build manifest + Exit criteria + design-system path, **never the builder's reasoning**, so it can't rationalize the builder's choices. The builder writes unit tests but never grades its own behavior; that's the tester's job.

**Type-routed behavioral testing.** `slice-tester` routes on slice type:

- **frontend** → Chrome rendered design-system match + per-affordance exercise.
- **full-stack / backend** → seed-and-cleanup data-flow round-trips (paired cleanup written first, hard non-prod guard, cleanup-in-`finally`, residue check), success-and-error toasts, cross-surface bidirectional round-trips.
- **infrastructure** → probe / harness only, no browser.

`slice-verifier`'s static gates run on every type; foundation slices that produce no behavior skip the tester.

**Gates run in four tiers, not as a full ladder per slice step.**

| Tier | When | What runs | Who |
|---|---|---|---|
| 1 | While coding | Lint on changed files, whole-project incremental typecheck (tsc cannot scope to files), colocated unit tests of changed files | builder |
| 2 | Before each commit | The slice's own tests named in its stage file, the build, and DB tests only when the diff touches the schema or migrations | builder; the `pre-push` hook runs this tier too |
| 3 | Once at slice end, before any PR | The full local suite, one time | `slice-verifier` |
| 4 | At the PR | The full suite: regression, audit, schema drift, design system | CI |

Stage files and canned stages state their exit criteria in these tiers and never demand the full ladder per task or per commit. `--no-verify` is never the answer to a slow or red `pre-push` hook.

**Re-verification re-runs only what a fix could change.** After any fix (1st, 2nd or 3rd), `slice-verifier` gets its prior verdict plus the fix's `files_changed`, carries every green check forward, re-runs only the gates that patch could change (its choice, from the fix diff), and reports them in `rerun: [{gate, reason}]`. The full suite never re-runs after a fix.

**Fix cap: 3 local fix loops and 3 CI fix rounds, separate counters.** A loop is one fix dispatch plus its re-verify: `fix-attempter`; then `debug-instrumenter` plus `fix-attempter`; then `fix-attempter` with the full evidence. CI rounds (`ci-fix-attempter` in `/box-it-up`) count per PR. Run instructions such as "continue until verified", "never stop" or "fully automated" never raise either cap; only the operator's explicit reply at the HITL can grant more.

**Batched approvals.** Every approval a slice needs (build plan, migrations, live data loads, size exceptions, terms, credentials) goes out as one batch of short questions, one decision each with a recommended answer, at slice start or the first point all are known. The Library Preview gate is the one mid-slice stop outside the batch, because it needs built output.

**Calendar-gated criteria.** An Exit criterion marked `(date-gated, on or after YYYY-MM-DD)` that is the only unmet line sets the slice's Status to `waiting until <YYYY-MM-DD>: <criterion>`. The slice stays open, the loop moves to the next independent slice (or stops), and the next run on or after the date closes it. Nothing keeps a loop alive to wait, and a pie with a waiting slice is not complete for the boundary.

**Soft time budget.** `delivery.sliceBudgetHours` (default 3, `0` = off) is a wall-clock budget per slice that counts CI and excludes operator waits; the start time lives in the run log. When it is hit, the conductor lets the current agent finish, then checks in once with a `prd_ambiguity` HITL (extend or stop).

---

## Delivery & git: selling vs boxing

**Selling and boxing are decoupled, at the pie boundary.** Each slice commits + pushes to the pie branch with **no PR and no CI**. `/box-it-up` opens the single `Pie N` PR, runs CI once, and merges - preserving every per-slice commit - only at the pie boundary.

The split exists so you can run a manual visual UAT or local code review between slices, and so CI fires once per pie instead of once per slice (default `pie-pr` mode). `/box-it-up` is also safe for hand-rolled feature branches that never went through ByTheSlice delivery.

**One Pie per PR.** Default branch naming: `pie-<n>-<scope>`, one worktree per pie (cut from freshly-fetched `origin/main`). Each `### Task K` lands as its own `feat(pie-N): N.M task K <name>` commit, pushed at the task boundary, and each slice closes with one `feat(pie-N): N.M <name>` commit on that branch (no per-slice PR); the single PR opens at the pie boundary. The tree is clean at every task boundary, and a slice never ends with an untracked or modified file it created.

All of the above is the default `pie-pr` delivery mode. **Merge-per-slice delivery** is opt-in: an explicit autonomous-delivery run instruction, or `delivery.mode: "merge-per-slice"` in `bytheslice.config.json` (the run instruction wins for that run; `review: continuous` pies always stay on the default). Each slice then gets branch `pie-<n>-s<n>.<m>-<scope>` cut from fresh `origin/main` into its own worktree, its own PR `Slice N.M: <name>`, CI per slice with up to 3 fix rounds (still red halts the loop, never skips), and a merge commit on green with no per-slice approval. Cleanup runs from the primary checkout after every merge, and the next slice is cut from the fresh `main`. The operator gets one notice per finished pie. There is never an integration branch.

**Only the conductor makes git writes, `git add` included.** The builder, fixers, `library-entry-writer` and `ci-fix-attempter` return `files_changed`; the conductor stages exactly those paths (never `git add -A`), commits and pushes, on the registered and fallback paths alike. Pie cleanup after a merge runs from the primary checkout: `pull --ff-only`, `worktree remove`, `branch -d`, remote delete, `worktree prune`, with the checklist flip already committed on the branch before the PR merged.

The full worktree lifecycle - setup, isolation, the runtime-isolation gap, merge, cleanup - is standardized in [`git-worktree-standard.md`](../skills/cook-pizzas/references/git-worktree-standard.md).

---

## Design-system delivery

**Preview-first library delivery.** `/set-display-case` scaffolds an operator-only `/library` preview route - at `app/(dashboard)/library/` on Next.js App Router, or the framework's idiomatic location on Vite / SvelteKit / Astro (see [`framework-detect.md`](../skills/setup-shop/references/framework-detect.md)) - excluded from every nav surface, sitemap, and robots.

Every frontend slice through `/sell-slice` passes through Phase 4.5's **Library Preview Gate** - non-skippable for new components AND for consumer-side edits that change a user-visible surface of an existing library component. The gate runs a Phase 0 extend-vs-create check, surfaces a self-critique block + clickable preview URLs, then HARD STOPS for explicit user approval before any production-route import lands. Pure internal refactors with no rendered-output delta are exempt. No hook enforces the gate at the tool layer: the hook that warned on early production-route writes was retired in 5.4 after it never fired, so the Phase 4.5 stop and `library-entry-writer`'s `production_imports_added: 0` contract hold the line.

**Visual review tooling priority** *(hardcoded, no discovery):* Claude in Chrome → Chrome DevTools MCP → Playwright → Vizzly. Viewports come from `verification.viewports` (default `[375, 768, 1280]`); screenshots are taken only at 768 and 1280, one of each per new UI surface.

---

## Orchestration principles

- **Subagent-driven everything.** Skill files are orchestrators - context, scenarios, gates, agent rosters. Heavy work lives in `skills/*/agents/*.md`. The orchestrator dispatches, reviews structured outputs, and loops to green; it does not write production code itself.
- **Exit-criteria contract.** Every slice's plan file carries a transcript-verifiable, binary `**Exit criteria:**` block. `/sell-slice` lifts it verbatim into a session-scoped `/goal` condition, and `slice-tester` derives its test plan from it. Vague lines like "tests pass" break the goal evaluator - `phased-plan-writer` enforces specificity (write `pnpm test --filter @repo/auth exits 0`, not "tests pass").
- **HITL bubbling.** Sub-agents never prompt the user directly and never call `ask_user_input_v0` - they return `needs_human: true` with one of four categories: `prd_ambiguity`, `external_credentials`, `destructive_operation`, `creative_direction`. Only top-level orchestrators surface the prompt; under `/sell-pie`, any of the four **halts the `/loop`**.
- **Always recommend a default in elicitation.** Every clarifying-questions phase across the plugin includes a recommended option in each choice set.
- **Model tiers.** Three aliases (`haiku`, `sonnet`, `opus`); heavier tiers go to producing/verifying agents (`implementer` = `opus, xhigh`; `quality-reviewer` = `opus, high`; `slice-tester` and `slice-verifier` = `sonnet, high`). Full per-agent table at [`model-tier-guide.md`](../skills/setup-shop/references/model-tier-guide.md).

---

## Evidence, not proof ledgers

**No proof ledgers.** No agent and no conductor writes artifact hashes, source freezes, fingerprint files, leases, or per-step proof files. The evidence a slice may leave is exactly:

- the verdict each agent returns (the Appendix A/B/C structured returns);
- Playwright traces, for failing checks only;
- one 1280px (desktop) and one 768px screenshot per new UI surface;
- a checklist note of 3 lines or fewer per slice in `docs/plans/00_master_checklist.md`;
- one short run log, `.claude/.bytheslice-state/run-log.md` (gitignored): slice start lines, HITL ask and answer times, one self-check line per dispatched agent, and slice PR and merge lines in merge-per-slice mode.

Existing operational state files stay, because they drive behavior rather than prove it: `.claude/.bytheslice-state/kitchen/activity.jsonl`, `kitchen/merged-pie.json`, `env-check-passed`, and the seed and cleanup pairs under `tests/seeds/<slice>/`. The closing-narrative paragraph in commit and PR bodies also stays; the 3-line limit applies to the checklist note only.

**The one sanctioned exception: the Pass mod ledger.** The Pass mod's `.bytheslice/ledger.jsonl` ([`docs/pass-mod-spec.md`](pass-mod-spec.md)) is the single sanctioned completion record that tracks project progression over time. It is not a per-step proof file, and this rule does not ban it. As shipped in 5.4.0 it holds one JSON row per event: `pie.started`, `slice.started`, `slice.done`, `slice.rollup`, `verdict`, `commit`, `push`, `merge`, `warn`, `hitl.raised`, `hitl.answered`, `agent.stalled`, `teammate.idle`, `teammate.done`, `note`, `usage` and `edit` (a path and the role that edited it, never the content). No row carries a hash, a freeze, a fingerprint or a lease, and agent starts and stops stay in the kitchen activity log rather than a second recorder (see [The Pass mod](#the-pass-mod)).

---

## Hook enforcement

Skill preconditions are checked inline by each skill at the start and raised as a question to the operator, never a refusal. No ByTheSlice hook blocks a prompt or a tool call: every script in [`hooks/`](../hooks/) exits 0, and a warning reaches the model as hook context.

- [`kitchen-log.sh`](../hooks/kitchen-log.sh) logs kitchen activity (the Pass mod tracks the active skill itself).
- [`shop-status.sh`](../hooks/shop-status.sh) injects the checklist summary at session start, and again after a resume or a compaction, so a compacted session re-orients.
- [`pre-commit-guard.sh`](../hooks/pre-commit-guard.sh) warns on `git commit` on `main` (or on a branch it cannot tell); the commit is not stopped.
- Editing a stage plan mid-delivery draws a warning from the Pass mod (`plan-write-during-bake`), on Claude Code hosts that load it.

Slice 5.4 retired the hooks the mod covers or that never fired; `hooks/README.md` keeps the inventory and what each retirement means on a host without the mod. Hooks dual-read flat `## Stage N` and nested `## Pie N` / `### Slice N.M` checklists; the regression suite lives at `hooks/test.sh`. Disable per-session with `BTS_HOOKS_DISABLED=1`. See [`hooks/README.md`](../hooks/README.md).

> **v5 note:** the `Stop`-gate and `commit-checklist-correlator` hooks were deleted - `/loop` + the pie-completion `/goal` own loop continuation natively.

---

## The Pass mod

The Pass is the plugin's Claude Code mod: a live ticket rail (pane, band, prompt hint, toasts) and a set of checks that **warn and never block**. The design and every as-built note live in [`pass-mod-spec.md`](pass-mod-spec.md); this section is the summary of what shipped in 5.4.0.

**Packaging.** The mod lives inside the plugin. [`hooks/hooks.json`](../hooks/hooks.json) names `../mod/register.tsx` under `modules` beside its `hooks` block, `.claude-plugin/plugin.json` points `types` at `mod/types/index.d.ts`, and the npm package ships `mod`, `scripts/ledger-summary.js` and `docs/pass-mod-spec.md`. Cursor reads only the `hooks` key, so it never loads the mod. The mod needs Claude Code 2.1.299 or later; on anything older it stays inert and logs one line. Every mod hook registers a `.catch` that passes the call through, so a mod error never stops a tool call. `claude plugin validate .` and `claude plugin test .` (including the seeded-violation suite on both the `terminal` and `desktop` surfaces) are its gating checks.

**Ledger, built on the kitchen activity log.** The ledger is `.bytheslice/ledger.jsonl` in the primary checkout (the parent of the git common dir, so every pie worktree writes one file), with its own `.gitignore` (`*`). Each row is one `tee -a` append; a failed write logs once and drops the row. Capture is off in a repository without a master checklist. Agent starts, stops, tokens and durations are not recorded twice: they come from [`kitchen-log.sh`](../hooks/kitchen-log.sh)'s `activity.jsonl`, and each finished slice adds one `slice.rollup` row so those numbers outlive the activity log's rotation. [`scripts/ledger-summary.js`](../scripts/ledger-summary.js) (zero dependencies, read-only) is the one fold every reader uses: `--format text` for `pass history`, `--format json` for the kitchen and `/close-shop`'s `retrospective-reviewer`, `--format pr-body` for the pie PR's `## Evidence` section (through the `bts_pr_body` tool).

**Warn-only checks.** A check judges before the call from session state held in memory (never the disk or a process), always lets the call run, and reports each finding three ways: one `warn` ledger row `{ code, text }`, one toast, and text the model reads (after a tool call's result, or as a hidden note in the loop that spawned an agent). The same code and key report at most once a minute; the band keeps the warning style for five minutes. `pass checks` and the pane list the latest ten.

| Code | Fires when |
|---|---|
| `checkbox-without-verdict` | An `Edit` or `Write` ticks a `### Slice` or Prep box in `00_master_checklist.md` (or the parser now reads a slice done) without a `slice-verifier` pass at HEAD |
| `checkbox-without-tester` | The same flip on a `frontend` or `full-stack` slice with no `slice-tester` pass at any HEAD |
| `push-slice-done-unverified` | A `git push` on a `pie-N` branch whose HEAD is a commit of a slice already `[x]` without a verifier pass there; a mid-slice push is silent |
| `fix-loop-cap` | `fix-attempter` attempt 4 on a slice, or `ci-fix-attempter` round 4 on a pie; it also opens one HITL inbox item |
| `commit-on-main` | A `git commit` or `git push` while the session's branch is `main` or `master` (best effort under `git -C` or `cd`) |
| `plan-write-during-bake` | An `Edit` or `Write` under `docs/plans/stage_` while `sell-slice` was the last ByTheSlice skill started (`sell-pie` appends build notes to stage files by design) |
| `model-policy` | A spawn names a model outside its role's allowed tiers |
| `model-drift` | A spawn's first turn ran on a tier its role does not allow |
| `builder-context` | A `slice-tester`, `slice-verifier`, `spec-reviewer` or `quality-reviewer` prompt carries a context marker (`files_changed`, `diff --git`, `implementer returned`, `builder transcript`) or runs past 20,000 characters |
| `gate-teamified` | `implementer`, `slice-tester`, `slice-verifier`, `spec-reviewer` or `quality-reviewer` is started as a teammate |

**Spawn policy.** The role table is the registered agents' own `model:` frontmatter, one tier per role (`implementer`, `quality-reviewer`, `retrospective-reviewer` and `token-expander` on opus; the scanners, `discovery` and `rules-loader` on haiku; the rest on sonnet), held in `mod/policy.ts` and kept equal to the agent files by `tests/pass/policy-parity.test.js`. A teammate is judged by a `teammate` role (opus or sonnet). The policy never rewrites a spawn's model or prompt. A project overrides it in `bytheslice.config.json` under the `pass` key: `pass.spawnPolicy.roles.<role>` (a tier list; an empty list stops checking that role), `pass.spawnPolicy.contextMarkers`, `pass.checks.enabled` and `pass.checks.requireTester` (`ui-slices`, the default, `always` or `never`). Each override is recorded once as a `note` row with `data.kind: 'policy-override'`.

**Watchdog.** Every 30 seconds the mod scans the live agent list and flags an agent that has run past its role's budget (15 minutes; `discovery` 5, `implementer` 30) with no activity for 3 minutes. A slice's first stall writes `agent.stalled`, one toast, a flag on the pane row, and a hidden note to the main conversation; a second stall in the same slice opens a pane-only HITL item instead. It never stops, restarts or messages an agent. `pass.watchdog` (`enabled`, `idleMs`, `budgetsMs`) overrides the thresholds.

**HITL inbox.** `bts_hitl` records an item in one of the four HITL categories, shows it in the pane and the band (`HITL n`, warning style), sends one native notification titled `ByTheSlice needs you` (a toast when no channel sent it), and returns at once: the skill's own HITL flow, asking in chat and stopping, is what waits. An answer is kept to 500 characters with secret shapes redacted, and nothing at all for `external_credentials`. The operator's own reply in chat closes the items the model was told to ask there, without the reply's words being read or kept.

**Team mode and the spike answer.** The pane gains a Team section and the band `· n bakers` while teammates exist; each teammate turn is one attributed `usage` row, and `TeammateIdle` and `TaskCompleted` land as `teammate.idle` and `teammate.done`. The 5.6 spike (CLI 2.1.302, agent teams on, `teammateMode: "in-process"`) found that a teammate has neither `Workflow` nor `ScheduleWakeup` in its tool list, while mod tools work. `bts_wake` stands in for `ScheduleWakeup` by sending the teammate a message on a timer; nothing stands in for `Workflow`, so a teammate cannot run `/sell-pie`'s per-slice Workflow and **pies stay sequential**. The Pass observes a team; it does not make `/run-the-day` a team.

**Review and progress.** Every successful `Edit` or `Write` adds an `edit` row (workspace path, agent, role, tool). The pane's Touched section joins them with `git diff --numstat` and draws red any file a builder edited after the slice's last verifier pass. `pass replay <slice>` steps through a slice's commits and its uncommitted changes with each file's diff. Sessions of the same project share a read-only roadmap strip through the mod store. The kitchen's Progress sheet reads the same fold from `GET /state` (see [Live kitchen](#live-kitchen)). A shared live page was spiked and not built: the PR's Evidence section and the local Progress sheet cover collaboration.

---

## Live kitchen

[`/open-kitchen`](../skills/open-kitchen/SKILL.md) connects the bundled 3D viewer to project-local state. It prefers the registered `kitchen_state` MCP tool, checks the canonical project root and advertised port, then opens a verified loopback URL in the native Browser pane. If MCP is unavailable or belongs to another project, [`open-kitchen.js`](../skills/open-kitchen/open-kitchen.js) reuses a matching local server or starts one without launching a Claude model session. Complete plugin installs include the runtime; skills-only copies do not register MCP or hooks.

The artifact host bridge probes for `host:plugin_bytheslice_kitchen` and `host:kitchen` both returned `server_not_connected`. The selected path serves localhost to the Browser pane. Native command invocation, discovery in the production host, `/sell-pie`, and a real production `/sell-slice` acceptance run remain pending. The fallback helper and local test evidence do not establish those host integrations.

### Activity log and privacy

[`kitchen-log.sh`](../hooks/kitchen-log.sh) runs on session, agent and skill events. It performs a fast **synchronous** append before returning, including the final `Stop`: asynchronous execution lost that final row during session shutdown. It is silent, always exits 0 and uses jq, or Node when jq is unavailable. If both are absent it skips logging.

Rows live in `.claude/.bytheslice-state/kitchen/activity.jsonl`. The strict field allowlist is timestamp, session/event, agent type/id, a single-line dispatch description capped at 120 characters, skill/source, token and duration counts, success, and pie/slice attribution. Labels starting `P<pie> S<slice>` take precedence. An unlabeled row (a SubagentStart, SubagentStop or Stop) takes the attribution of its own session's latest labeled row, preferring the row with the same agent id and then the same agent type, so a dispatch's subagent rows follow its label even when the hook runs from another worktree; only then do the branch and checklist supply attribution. Prompts, agent final messages, tool output, file contents, skill arguments and environment values are never copied. Descriptions are metadata supplied by the caller, so keep sensitive information out of them. Serialized rotation retains one `activity.1.jsonl` backup after the current file passes 2 MiB.

### Read-only state and local transport

[`mcp/kitchen-server.js`](../mcp/kitchen-server.js) exposes one read-only stdio MCP tool, `kitchen_state`, with an optional nonnegative integer `since` cursor. The snapshot includes project setup, per-piece evidence, checklist orders, active agents and skills, recent allowed metadata, phase and port. `since` is accepted for cursor compatibility; the result remains a full snapshot for deterministic replay.

The same process binds HTTP to `127.0.0.1` only. It starts at **4477** (or `BTS_KITCHEN_PORT`) and tries the next free port, then writes the chosen number to `.claude/.bytheslice-state/kitchen/port`. Only exact **`GET /`** (bundled viewer) and **`GET /state`** (snapshot) are served. Other methods return 405; other paths return 404. Host, Origin and Fetch Metadata checks reject foreign browser requests; responses disable caching and embedding. There is no mutation endpoint, shell action, remote publish operation or filesystem browse route. The server writes its local port-discovery file; the lifecycle logger and explicit workflow helpers write their own bounded local evidence.

**Slice progress is measured, never estimated.** For each unfinished slice whose checklist row links a plan (`**Plan:** [stage_*.md](...)`, a plain file name inside `docs/plans`), the state reader counts the plan's top-level task checkboxes, then counts distinct task commits on the local branches with a read-only `git log --branches` over the 5.3.0 subjects `feat(pie-N): N.M task K <name>` (cached for 15 seconds). A pie's commits usually sit on its own branch in another worktree, which is why local branches are searched rather than only the current one. A missing plan, no git, or a task number past the plan's count yields no progress at all. The current step comes from the dispatch label (`P5 S5.2 verify:`) or the agent's role. The served-pie details show only the commit, commit range, date and one-line summary that the checklist rows themselves state.

**Progress over time comes from the Pass ledger.** The snapshot's `progress` field is `.bytheslice/ledger.jsonl` folded by [`scripts/ledger-summary.js`](../scripts/ledger-summary.js), the newest 1 MiB read once per snapshot. The header's Progress button opens a sheet with one block per pie: a slice table (started, done, duration, fix loops, verifier verdict, cost) and an inline SVG step line of slices done over time. Without a ledger (no mod, or no Claude Code session yet) the sheet says so.

The visible page polls same-origin `/state` every **three seconds**, preserves the latest valid snapshot and pauses polling while hidden. `window.kitchenLive.snapshot` exposes the latest snapshot for inspection. The header browser button uses only the validated snapshot port and opens the same loopback URL with `noopener` after a user click. Host behavior determines whether the new tab leaves the pane. The viewer loads Three.js from **unpkg** and fonts from **Google Fonts**, so its rendering is not offline.

### Setup evidence and phases

`project.pieces` reports `present`, `applicable` and `source` separately for every physical fixture:

| Piece | Presence evidence |
|---|---|
| `walls` | `bytheslice.config.json` |
| `menu` | A `docs/prd-*.md` file |
| `tickets` | `docs/plans/00_master_checklist.md` |
| `case` | `docs/design-system.md` or a recognized library route |
| `safe` | `.claude/.bytheslice-state/env-check-passed` |
| `oven` | `.github/workflows` |
| `alarm` | `.husky/pre-push` |
| `locks` | `scripts/setup-branch-protection.sh` |

File presence represents local setup evidence; it does not prove CI passed, branch protection is enabled remotely or environment credentials remain valid. `/open-the-shop` writes only the literal `pass\n` to the environment-check marker after verification succeeds and removes it on later failure. It never stores secret values or verifier output there.

Completed Prep can declare a specific fixture inapplicable without claiming the file exists. Use an explicit checklist comment with known piece names and a nonempty reason:

```markdown
<!-- kitchen-piece-exemption: safe, case | CLI-only project with no runtime secrets or visual library. -->
```

The comment affects applicability only once Prep is complete. A checked Prep item explicitly marked not applicable for the display case or shop opening also supplies that item's exemption. A generic completed Prep row does not invent presence or exempt unrelated fixtures. All fixtures absent means demo mode; some evidence means partial construction; completed Prep or all fixtures present means built setup, while each fixture retains its own presence/applicability evidence.

Session and active-work metadata drive dawn, open service and after-hours lighting. A `Stop` followed by ten minutes with no active agents or skills can enter after hours. A successful Pie boundary merge can do so immediately only with fresh, matching evidence: `/box-it-up` passes the selected project root (`CLAUDE_PROJECT_DIR`, otherwise the working directory) to [`record-kitchen-merge.js`](../skills/box-it-up/record-kitchen-merge.js), which validates a confirmed `MERGED` PR number and merge time, then atomically writes only version, pie, PR number and merge timestamp to `kitchen/merged-pie.json`. This is Pie mode only. Checklist completion alone is not confirmed merge evidence.

---

## Legacy & migration

**Flat v4 checklists** (`## Stage N` headings, no `## Pie N`) still work unchanged - `/sell-slice` and the hooks dual-read them. Run `/cook-pizzas --repie` to convert a flat checklist to Pies on **explicit opt-in** (never silent).

**Legacy v3 projects** (master checklist references `stage_1_*` / `stage_2_*` / `stage_3_*` plan files instead of a `## Prep` section): `/sell-slice` keeps a documented legacy routing path that dispatches the foundation skills as sub-skills when it encounters those stage types. No migration required.

`/sell-pie` and `/run-the-day` **refuse** flat v4 checklists outright (with a `/cook-pizzas --repie` hint) - autonomous baking requires the Pie structure.

---

## Cursor / non-Claude-Code fallback

`/loop`, `Workflow`, and `/goal` are Claude Code features. When unavailable (running in Cursor, `disableAllHooks` set, or any other reason), the skills do **not** silently drop the logic:

- `/sell-pie` self-paces over the pie's ≤8 slices in one context.
- Workflow-backed skills fall back to in-context dispatch with **orchestrator-side manual schema validation**.
- `/goal` falls back to the manual goal-tracking pattern.
- An agent dispatched without plugin-agent registration carries its frontmatter as a header: model tier and effort (mapped to the host's model choice where it has one), the normalized tool allowlist, the verbatim read-only line for every agent without write tools (`slice-tester`'s probes and seeds excepted), and the no-git-writes line. The conductor logs one self-check line per dispatched agent in `.claude/.bytheslice-state/run-log.md`.

Full protocols: [`loop-workflow-fallback-pattern.md`](../skills/cook-pizzas/references/loop-workflow-fallback-pattern.md) and [`goal-fallback-pattern.md`](../skills/cook-pizzas/references/goal-fallback-pattern.md).
