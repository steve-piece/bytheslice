<!-- docs/architecture.md -->
<p align="center"><img src="../assets/brand/logo.png" alt="ByTheSlice" width="260"></p>

# 🍕 ByTheSlice: Architecture & Conventions

The under-the-hood reference for ByTheSlice. The [README](../README.md) covers the day-to-day motion; this doc covers *why the kitchen works the way it does* - the rules the plugin enforces, the verification model, and how legacy projects migrate.

> These aren't suggestions. The skills and their structured agent contracts carry them, and the Pass mod watches for slips and warns. Nothing refuses a tool call: the model decides, with the rules in front of it.

## Contents

- [Pies & Slices - the two-level checklist](#pies--slices-the-two-level-checklist)
- [Mode detection - standalone vs sequential](#mode-detection-standalone-vs-sequential)
- [The verify-once model](#the-verify-once-model)
- [Delivery & git - selling vs boxing](#delivery--git-selling-vs-boxing)
- [Design-system delivery](#design-system-delivery)
- [Orchestration principles](#orchestration-principles)
- [Evidence, not proof ledgers](#evidence-not-proof-ledgers)
- [Hooks](#hooks)
- [The Pass mod](#the-pass-mod)
- [Live kitchen](#live-kitchen)
- [The lobby](#the-lobby)
- [Legacy & migration](#legacy--migration)
- [Cursor / non-Claude-Code fallback](#cursor--non-claude-code-fallback)

---

## Pies & Slices: the two-level checklist

`cook-pizzas` produces `docs/plans/00_master_checklist.md` as a **two-level Pie / Slice roadmap**.

- A **Pie** (`## Pie N`, usually 3 to 8 slices, 1 or 2 for a small app, carrying a `review: boundary|continuous` property) is the unit of `/loop` autonomy, HITL checkpoint, PR, context-refresh, and worktree (in the default `pie-pr` delivery mode; opt-in merge-per-slice delivery makes the slice the unit of PR and worktree).
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
| `pizza-party` | ✓ brief to deployed app (bootstraps an empty folder, or adopts an existing app) | ✓ resumes at the first phase its order ticket has not marked done; bakes through `sell-pie`, so a flat v4 checklist is refused |
| `close-shop` | - | ✓ needs execution history |

**The single rule that holds it together:** skills never assume they're being called from somewhere else. They detect mode from disk state, behave correctly in both, and document both modes in the SKILL.md.

---

## The verify-once model

**Per-slice verify-once is non-negotiable.** Workflow B gates every slice with two agents, and no slice is "done" until both pass - or are intentionally skipped per slice type. On data-bound UI, `break-ui-runner` runs between `state-illustrator` and `slice-tester` (see "UI review skills" below); its findings feed the same fix loop.

| Agent | Type | What it does |
|---|---|---|
| `slice-tester` | behavioral | Rendered design-system match + per-affordance exercise + a blocking rendered accessibility pass + seed-and-cleanup data-flow round-trips (with the bidirectional rule). |
| `slice-verifier` | static | Lint / type / build / unit / e2e-by-tag (threshold-gated per `verification.e2e`) + design-system static grep + CI-integrity + the build-manifest under-declaration backstop. The full local suite runs **once per slice**; after a fix only the touched gates re-run. |

These two replace the three v4 static verifiers and the v4 frontend visual review.

**Build manifest + under-declaration backstop.** The builder emits a schema-validated manifest declaring every route / component / affordance / serverAction / transition the slice produced: `implementer` on backend and full-stack slices, `state-illustrator` on frontend slices (it reads the files on disk, and a frontend slice with an empty manifest stops to ask). `slice-verifier` independently greps the slice diff and **fails if the manifest under-counts** - so a builder can't hide an affordance from the tester with prompt wording alone.

**Frontend statics check.** `skills/sell-slice/scripts/verify-frontend-statics.sh` (bash, no network, shipped inside `skills/` so it reaches both clients) resolves token references against the project's own catalog and flags unknown tokens (E1), `var()` fallbacks (E2), motion literals off the design-system scales (E3), `<img>` without `alt` (E4) and unlabeled form controls (E5); it exits 0 clean, 1 with findings, 2 when no catalog resolves.
`slice-verifier` runs it once per frontend slice as a sub-check of `design_system`, scoped with `--files` on re-verification, and every result, exit 2 included, is a non-forcing entry in the verdict's `warnings` array: it never fails a slice or starts a fix loop, and the conductor lists the warnings at the pie boundary.

**Context-separated dispatch.** The `/sell-pie` `/loop` conductor holds zero implementation context. Per slice it routes structured artifacts between singular-goal agents - the `slice-tester` receives only the build manifest + Exit criteria + design-system path, **never the builder's reasoning**, so it can't rationalize the builder's choices. The builder writes unit tests but never grades its own behavior; that's the tester's job.

**Type-routed behavioral testing.** `slice-tester` routes on slice type:

- **frontend** → Chrome rendered design-system match + per-affordance exercise + a rendered accessibility pass (contrast, keyboard reach and order, visible focus, focus traps, errors not signalled by color alone, reduced motion, dark-mode contrast) at each viewport. Any a11y `fail` fails the slice; a green result covers the machine-checkable band only and never implies screen-reader behavior. The tester also records the browser tier it actually drove (`tooling_tier_used`).
- **full-stack / backend** → seed-and-cleanup data-flow round-trips (paired cleanup written first, hard non-prod guard, cleanup-in-`finally`, residue check), success-and-error toasts, cross-surface bidirectional round-trips.
- **infrastructure** → probe / harness only, no browser.

`slice-verifier`'s static gates run on every type; foundation slices that produce no behavior skip the tester.

**UI review skills (vendored, pinned).** Two third-party review skills live verbatim under `skills/sell-slice/references/vendor/` with their licenses and pinned commits ([README](../skills/sell-slice/references/vendor/README.md)); ByTheSlice wraps each in a `sonnet` review agent that returns findings `{id, severity, surface, problem, proposedFix, files}` and a markdown report with screenshots in `.claude/.bytheslice-state/evidence/`. Neither gates a merge on its own; findings flow through the existing verdict, fix-loop and HITL flow, and fixes for them run in `ui-fix-attempter` on `opus`.

| Agent | Wraps | Runs | Routing |
|---|---|---|---|
| `break-ui-runner` | break-ui (emilkowalski/skills `2d22863`, MIT) | Workflow B, after `state-illustrator` and before `slice-tester`, on frontend and full-stack slices with data-bound UI, through the dev-only `?data=` switch `state-illustrator` scaffolds; DOM-measured at 1440, 768 and 390 | `Broken` and `Ugly` join the 3 local fix loops; `Fragile` and its decisions are non-forcing warnings |
| `design-critic` | impeccable critique (pbakaus/impeccable `d34c87e`, Apache-2.0), no-launcher mode only | The Library Preview Gate (new composite blocks), once per pie at the `/sell-pie` boundary, and `/inspect-display` Phase 2b; never per slice | P0 and P1 stop the library gate in `self-critique` mode and become one batched HITL at the pie boundary; P2 and P3 are listed |

The impeccable launcher (a downloaded, checksum-verified binary behind `impeccable context`, `detect`, critique storage and the live overlay) is not vendored and never runs: `design-critic` takes the skill's documented launcher-unavailable path, reports under a `DEGRADED: single-context` banner, and replaces the detector with read-only DOM measurements. Running the binary needs explicit operator approval through a HITL.

**Gates run in four tiers, not as a full ladder per slice step.**

| Tier | When | What runs | Who |
|---|---|---|---|
| 1 | While coding | Lint on changed files, whole-project incremental typecheck (tsc cannot scope to files), colocated unit tests of changed files | builder |
| 2 | Before each commit | The slice's own tests named in its stage file, the build, and DB tests only when the diff touches the schema or migrations | builder; the `pre-push` hook runs this tier too |
| 3 | Once at slice end, before any PR | The full local suite, one time | `slice-verifier` |
| 4 | At the PR | The full suite: regression, audit, schema drift, design system | CI |

Stage files and canned stages state their exit criteria in these tiers and never demand the full ladder per task or per commit. `--no-verify` is never the answer to a slow or red `pre-push` hook.

**Re-verification re-runs only what a fix could change.** After any fix (1st, 2nd or 3rd), `slice-verifier` gets its prior verdict plus the fix's `files_changed`, carries every green check forward, re-runs only the gates that patch could change (its choice, from the fix diff), and reports them in `rerun: [{gate, reason}]`. The full suite never re-runs after a fix.

**Fix cap: 3 local fix loops and 3 CI fix rounds, separate counters.** A loop is one fix dispatch plus its re-verify: `fix-attempter`; then `debug-instrumenter` plus `fix-attempter`; then `fix-attempter` with the full evidence. CI rounds (`ci-fix-attempter` in `/box-it-up`) count per PR. Run instructions such as "continue until verified", "never stop" or "fully automated" never raise either cap; only the operator's explicit reply at the HITL can grant more. Both loops also stop early on a repeated error signature, `normalize(first_error_line) | file | check_key` (the CI loop uses the job name as the key), a plain string held in the conversation and never persisted: when the failure a patch aimed at comes back unchanged, the loop halts with a HITL instead of spending another round. A patch that turns a green gate red is restored by the conductor before the next fix. Under `/pizza-party`, where nothing after the interview waits on a human, that HITL resolves without a stop: a slice that exhausts its local loops gets one replan through `/special-order` into smaller slices that together cover its Exit criteria, and a slice still stuck is deferred (`Status: deferred: <reason>`) and reported; the caps themselves never rise.

**Batched approvals.** Every approval a slice needs (build plan, migrations, live data loads, size exceptions, terms, credentials) goes out as one batch of short questions, one decision each with a recommended answer, at slice start or the first point all are known. The Library Preview gate is the one mid-slice stop outside the batch, because it needs built output.

**Calendar-gated criteria.** An Exit criterion marked `(date-gated, on or after YYYY-MM-DD)` that is the only unmet line sets the slice's Status to `waiting until <YYYY-MM-DD>: <criterion>`. The slice stays open, the loop moves to the next independent slice (or stops), and the next run on or after the date closes it. Nothing keeps a loop alive to wait, and a pie with a waiting slice is not complete for the boundary.

**Soft time budget.** `delivery.sliceBudgetHours` (default 3, `0` = off) is a wall-clock budget per slice that counts CI and excludes operator waits; the start time lives in the run log. When it is hit, the conductor lets the current agent finish, then checks in once with a `prd_ambiguity` HITL (extend or stop).

---

## Delivery & git: selling vs boxing

**Selling and boxing are decoupled, at the pie boundary.** Each slice commits + pushes to the pie branch with **no PR and no CI**. `/box-it-up` opens the single `Pie N` PR, runs CI once, and merges - preserving every per-slice commit - only at the pie boundary.

The split exists so you can run a manual visual UAT or local code review between slices, and so CI fires once per pie instead of once per slice (default `pie-pr` mode). `/box-it-up` is also safe for hand-rolled feature branches that never went through ByTheSlice delivery.

**One Pie per PR.** Default branch naming: `pie-<n>-<scope>`, one worktree per pie (cut from freshly-fetched `origin/main`). Each `### Task K` lands as its own `feat(pie-N): N.M task K <name>` commit, pushed at the task boundary, and each slice closes with one `feat(pie-N): N.M <name>` commit on that branch (no per-slice PR); the single PR opens at the pie boundary. The tree is clean at every task boundary, and a slice never ends with an untracked or modified file it created.

All of the above is the default `pie-pr` delivery mode. **Merge-per-slice delivery** is opt-in: an explicit autonomous-delivery run instruction, or `delivery.mode: "merge-per-slice"` in `bytheslice.config.json` (the run instruction wins for that run; `review: continuous` pies always stay on the default). Each slice then gets branch `pie-<n>-s<n>.<m>-<scope>` cut from fresh `origin/main` into its own worktree, its own PR `Slice N.M: <name>`, CI per slice with up to 3 fix rounds (still red halts the loop, never skips), and a merge commit on green with no per-slice approval. Cleanup runs from the primary checkout after every merge, and the next slice is cut from the fresh `main`. The operator gets one notice per finished pie. There is never an integration branch.

**Ship-once delivery** (`delivery.mode: "ship-once"`, what `/pizza-party` uses) keeps every gate local and ships the app in one PR. A local ship branch (`delivery.shipBranch`, default `ship/<repo>`) is cut once from `origin/main`; each pie branches from it, its slices commit with no push, and `/box-it-up --pie-local` runs the full local check (every command the project's `ci.yml` and, at the standard tier, `e2e.yml` run, never a subset) and merges the pie into the ship branch with `--no-ff`. After the last pie `/box-it-up --ship` pushes the ship branch, opens one PR to `main` with every pie's evidence, runs CI once and merges on green. Under `run.unattended` nothing waits on a human: a stuck slice's commits move to a local `deferred/pie-N-sN.M` branch so nothing unverified reaches the ship PR. Every other generated workflow that runs on pull requests (`e2e-coverage.yml`, `db-schema-drift.yml`, `design-system-compliance.yml`, when present) runs too, so nothing can fail only in CI on the ship PR.

**Only the conductor makes git writes, `git add` included.** The builder, fixers, `library-entry-writer` and `ci-fix-attempter` return `files_changed`; the conductor stages exactly those paths (never `git add -A`), commits and pushes, on the registered and fallback paths alike. Pie cleanup after a merge runs from the primary checkout: `pull --ff-only`, `worktree remove`, `branch -d`, remote delete, `worktree prune`, with the checklist flip already committed on the branch before the PR merged.

The full worktree lifecycle - setup, isolation, the runtime-isolation gap, merge, cleanup - is standardized in [`git-worktree-standard.md`](../skills/cook-pizzas/references/git-worktree-standard.md).

---

## Design-system delivery

**Preview-first library delivery.** `/set-display-case` scaffolds an operator-only `/library` preview route - at `app/(dashboard)/library/` on Next.js App Router, or the framework's idiomatic location on Vite / SvelteKit / Astro (see [`framework-detect.md`](../skills/setup-shop/references/framework-detect.md)) - excluded from every nav surface, sitemap, and robots.

Every frontend slice through `/sell-slice` passes through Phase 4.5's **Library Preview Gate** - non-skippable for new components AND for consumer-side edits that change a user-visible surface of an existing library component. The gate runs a Phase 0 extend-vs-create check, surfaces a self-critique block + clickable preview URLs, then HARD STOPS for explicit user approval before any production-route import lands. Pure internal refactors with no rendered-output delta are exempt. No hook enforces the gate at the tool layer: the hook that warned on early production-route writes was retired in 5.4 after it never fired, so the Phase 4.5 stop and `library-entry-writer`'s `production_imports_added: 0` contract hold the line.

**Visual review tooling priority** *(hardcoded, no discovery):* Claude in Chrome → Chrome DevTools MCP → Playwright → Vizzly. Viewports come from `verification.viewports` (default `[375, 768, 1280]`); screenshots are taken only at 768 and 1280, one of each per new UI surface. `slice-tester`'s allowlist carries the extension's `javascript_tool` and `computer` (both name forms) beside `browser_batch`, so the rendered accessibility pass can read the DOM and press Tab.

**Dependency capability audit.** When `block-composer` leaves a gap and the slice plan or Exit criteria hit its keyword list (keyboard, focus, dialog, popover, combobox, table, form and the like), its Step 2b looks up at most 3 installed packages through Context7 and writes `docs/component-rules-<slice>.md` only when it found rules: `CR` rules are mandatory and end "Do not implement this manually.", `AR` rules are advisory. `component-crafter` reads that file before anything else and returns `rules_consumed` and `rules_deviated`; a silent deviation is a defect the conductor lists. The tool grant is the claude.ai Context7 connector's `mcp__claude_ai_Context7__*` identifiers. A missing tool reports `tool_absent` (a configuration defect, surfaced at the pie boundary) and a failed call `lookup_failed`; both fall back to `capability_unknown`, which is the old behavior, and neither blocks a slice.

---

## Orchestration principles

- **Subagent-driven everything.** Skill files are orchestrators - context, scenarios, gates, agent rosters. Heavy work lives in `skills/*/agents/*.md`. The orchestrator dispatches, reviews structured outputs, and loops to green; it does not write production code itself.
- **Exit-criteria contract.** Every slice's plan file carries a transcript-verifiable, binary `**Exit criteria:**` block. `/sell-slice` lifts it verbatim into a session-scoped `/goal` condition, `slice-tester` derives its test plan from it, and the six frontend producers receive it verbatim as an input, since they are graded against it. Vague lines like "tests pass" break the goal evaluator - `phased-plan-writer` enforces specificity (write `pnpm test --filter @repo/auth exits 0`, not "tests pass"). A user outcome has one sanctioned form, `slice-tester completed <flow step> end-to-end on /<route> with zero console errors (screenshot at 1280 in transcript)`: one line for a frontend or full-stack slice that owns a step in its pie's `**User flow:**` list (3 to 7 numbered steps under the pie heading, each ending `- Slice N.M`), and none otherwise. The steps are list items, never `### Slice` headings, so the hook parser's slice counts do not change.
- **HITL bubbling.** Sub-agents never prompt the user directly and never call `ask_user_input_v0` - they return `needs_human: true` with one of four categories: `prd_ambiguity`, `external_credentials`, `destructive_operation`, `creative_direction`. Only top-level orchestrators surface the prompt; under `/sell-pie`, any of the four **halts the `/loop`**.
- **No agent may name a verifier that is not in the live dispatch table.** An agent that closes a hard constraint with "X will catch it" relaxes its own first-pass care against that promise, and when `X` is deprecated, unregistered or not yet built the promise is phantom enforcement. Name only a verifier that is in `agents[]` and in the routing table today, or tell the agent to verify the point itself before it returns.
- **Always recommend a default in elicitation.** Every clarifying-questions phase across the plugin includes a recommended option in each choice set.
- **Model tiers.** Three aliases (`haiku`, `sonnet`, `opus`); heavier tiers go to producing, planning and verifying agents (`implementer`, `quality-reviewer`, `discovery` and the plan writers = `opus, medium`, and every opus agent runs at medium; `slice-tester` and `slice-verifier` = `sonnet, high`). `tests/model-tiers/` holds every stated tier to the agent frontmatter. Full per-agent table at [`model-tier-guide.md`](../skills/setup-shop/references/model-tier-guide.md).

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

## Hooks

Hooks run only where nothing else can do the job (6.1). Skill preconditions are checked inline by each skill and raised as a question to the operator. No hook refuses a tool call or blocks a prompt, and every script exits 0. Claude Code wires two:

- [`workflow-nudge.sh`](../hooks/workflow-nudge.sh) (Node, [`workflow-nudge.js`](../hooks/workflow-nudge.js)) on `UserPromptSubmit`: in a project with a master checklist, a `/goal` or a new-feature ask gets the **Feature intake** rule as context (document with `/special-order`, build with `/sell-slice` or `/sell-pie`), and a "build Slice N.M" ask gets the `/sell-slice` route; with no checklist yet, an ask for a whole app end to end gets the `/pizza-party` route. `/setup-shop` writes the Feature intake block into the project rules file (`workflow-nudge.js intake`) and `/open-kitchen` re-checks it (`workflow-nudge.js doctor`).
- [`shop-status.sh`](../hooks/shop-status.sh) injects the checklist summary at session start, and again after a resume or a compaction, so a compacted session re-orients.

[`kitchen-log.sh`](../hooks/kitchen-log.sh) (kitchen activity) and [`lobby-signal.sh`](../hooks/lobby-signal.sh) ([the lobby](#the-lobby)) are not hooks on Claude Code: the Pass hands them each event's envelope (`mod/relay.ts`). Cursor, which has no mods, still runs them, and `shop-status.sh`, from `hooks-cursor.json`. A commit on `main` draws the Pass's `commit-on-main` warning; editing a stage plan mid-delivery draws `plan-write-during-bake`.

The regression suite lives at `hooks/test.sh`. Disable per-session with `BTS_HOOKS_DISABLED=1`. See [`hooks/README.md`](../hooks/README.md).

> **v5 note:** the `Stop`-gate and `commit-checklist-correlator` hooks were deleted - `/loop` + the pie-completion `/goal` own loop continuation natively.

---

## The Pass mod

The Pass is the plugin's Claude Code mod: a live ticket rail (pane, band, prompt hint, toasts) and a set of checks that **warn** and never refuse (6.1 dropped the one refusal 5.8 added). It also runs the kitchen and Lobby logging scripts on the session's events (6.1). The design and every as-built note live in [`pass-mod-spec.md`](pass-mod-spec.md); this section is the summary of what shipped in 5.4.0.

**Packaging.** The mod lives inside the plugin. [`hooks/hooks.json`](../hooks/hooks.json) names `../mod/register.tsx` under `modules` beside its `hooks` block, `.claude-plugin/plugin.json` points `types` at `mod/types/index.d.ts`, and the npm package ships `mod`, `scripts/ledger-summary.js` and `docs/pass-mod-spec.md`. Cursor never loads the mod: `.cursor-plugin/plugin.json` points it at `hooks/hooks-cursor.json`, which runs the shop status, the commit guard and the lobby signal in Cursor's own hook format. The mod needs Claude Code 2.1.299 or later; on anything older it stays inert and logs one line. Every mod hook registers a `.catch` that passes the call through, so a mod error never stops a tool call. `claude plugin validate .` and `claude plugin test .` (including the seeded-violation suite on both the `terminal` and `desktop` surfaces) are its gating checks.

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

**Spawn policy.** The role table is the registered agents' own `model:` frontmatter, one tier per role (`implementer`, `quality-reviewer`, `retrospective-reviewer`, `token-expander`, `ui-fix-attempter`, `discovery`, `scaffold-discovery`, `complexity-assessor` and the three plan writers on opus; the scanners, detectors and `rules-loader` on haiku; the rest on sonnet), held in `mod/policy.ts` and kept equal to the agent files by `tests/pass/policy-parity.test.js`. A teammate is judged by a `teammate` role (opus or sonnet). The policy never rewrites a spawn's model or prompt. A project overrides it in `bytheslice.config.json` under the `pass` key: `pass.spawnPolicy.roles.<role>` (a tier list; an empty list stops checking that role), `pass.spawnPolicy.contextMarkers`, `pass.checks.enabled` and `pass.checks.requireTester` (`ui-slices`, the default, `always` or `never`). Each override is recorded once as a `note` row with `data.kind: 'policy-override'`.

**Watchdog.** Every 30 seconds the mod scans the live agent list and flags an agent that has run past its role's budget (15 minutes; `discovery` 5, `implementer` 30) with no activity for 3 minutes. A slice's first stall writes `agent.stalled`, one toast, a flag on the pane row, and a hidden note to the main conversation; a second stall in the same slice opens a pane-only HITL item instead. It never stops, restarts or messages an agent. `pass.watchdog` (`enabled`, `idleMs`, `budgetsMs`) overrides the thresholds.

**HITL inbox.** `bts_hitl` records an item in one of the four HITL categories, shows it in the pane and the band (`HITL n`, warning style), sends one native notification titled `ByTheSlice needs you` (a toast when no channel sent it), and returns at once: the skill's own HITL flow, asking in chat and stopping, is what waits. An answer is kept to 500 characters with secret shapes redacted, and nothing at all for `external_credentials`. The operator's own reply in chat closes the items the model was told to ask there, without the reply's words being read or kept.

**Team mode and the spike answer.** The pane gains a Team section and the band `· n bakers` while teammates exist; each teammate turn is one attributed `usage` row, and `TeammateIdle` and `TaskCompleted` land as `teammate.idle` and `teammate.done`. The 5.6 spike (CLI 2.1.302, agent teams on, `teammateMode: "in-process"`) found that a teammate has neither `Workflow` nor `ScheduleWakeup` in its tool list, while mod tools work. `bts_wake` stands in for `ScheduleWakeup` by sending the teammate a message on a timer; nothing stands in for `Workflow`, so a teammate cannot run `/sell-pie`'s per-slice Workflow and **pies stay sequential**. The Pass observes a team; it does not make a whole-roadmap run a team, and `/pizza-party` bakes its pies one at a time.

**Review and progress.** Every successful `Edit` or `Write` adds an `edit` row (workspace path, agent, role, tool). The pane's Touched section joins them with `git diff --numstat` and draws red any file a builder edited after the slice's last verifier pass. `pass replay <slice>` steps through a slice's commits and its uncommitted changes with each file's diff. Sessions of the same project share a read-only roadmap strip through the mod store. The kitchen's Progress sheet reads the same fold from `GET /state` (see [Live kitchen](#live-kitchen)). A shared live page was spiked and not built: the PR's Evidence section and the local Progress sheet cover collaboration.

---

## Live kitchen

[`/open-kitchen`](../skills/open-kitchen/SKILL.md) connects the bundled 3D viewer to project-local state. It prefers the registered `kitchen_state` MCP tool, checks the canonical project root and advertised port, then opens a verified loopback URL in the native Browser pane. If MCP is unavailable or belongs to another project, [`open-kitchen.js`](../skills/open-kitchen/open-kitchen.js) reuses a matching local server or starts one without launching a Claude model session. Complete plugin installs include the runtime; skills-only copies do not register MCP or hooks. `/open-kitchen --lobby` opens the machine-level [lobby](#the-lobby) instead of one project's kitchen.

The artifact host bridge probes for `host:plugin_bytheslice_kitchen` and `host:kitchen` both returned `server_not_connected`. The selected path serves localhost to the Browser pane. Native command invocation, discovery in the production host, `/sell-pie`, and a real production `/sell-slice` acceptance run remain pending. The fallback helper and local test evidence do not establish those host integrations.

### Activity log and privacy

[`kitchen-log.sh`](../hooks/kitchen-log.sh) runs on session, agent and skill events. It performs a fast **synchronous** append before returning, including the final `Stop`: asynchronous execution lost that final row during session shutdown. It is silent, always exits 0 and uses jq, or Node when jq is unavailable. If both are absent it skips logging.

Rows live in `.claude/.bytheslice-state/kitchen/activity.jsonl`. The strict field allowlist is timestamp, session/event, agent type/id, a single-line dispatch description capped at 120 characters, skill/source, token and duration counts, success, and pie/slice attribution. Labels starting `P<pie> S<slice>` take precedence. An unlabeled row (a SubagentStart, SubagentStop or Stop) takes the attribution of its own session's latest labeled row, preferring the row with the same agent id and then the same agent type, so a dispatch's subagent rows follow its label even when the hook runs from another worktree; only then do the branch and checklist supply attribution. Prompts, agent final messages, tool output, file contents, skill arguments and environment values are never copied. Descriptions are metadata supplied by the caller, so keep sensitive information out of them. Serialized rotation retains one `activity.1.jsonl` backup after the current file passes 2 MiB.

### Read-only state and local transport

[`mcp/kitchen-server.js`](../mcp/kitchen-server.js) exposes one read-only stdio MCP tool, `kitchen_state`, with an optional nonnegative integer `since` cursor. The snapshot includes project setup, per-piece evidence, checklist orders, active agents and skills, recent allowed metadata, phase and port. `since` is accepted for cursor compatibility; the result remains a full snapshot for deterministic replay.

The same process binds HTTP to `127.0.0.1` only. It starts at **4477** (or `BTS_KITCHEN_PORT`) and tries the next free port, then writes the chosen number to `.claude/.bytheslice-state/kitchen/port`. Three exact routes are served, all `GET`:

| Route | Answer |
|---|---|
| `GET /` | The bundled viewer. The page alone may carry a query string (`/?lobby=<port>&idle=1`, from the lobby); the server never reads it and always answers the same file. |
| `GET /state` | The snapshot. |
| `GET /lobby` | `302` to `http://127.0.0.1:<port>/` when `<BTS_HOME or ~/.bytheslice>/lobby/port` holds an integer port from 1 to 65535 (not the kitchen's own) and `GET /state` there answers a JSON `projects` array within 500 ms; otherwise `404`. It never redirects anywhere else. |

Other methods return 405; other paths return 404. Host, Origin and Fetch Metadata checks reject foreign browser requests: the Host must be this port on `127.0.0.1` or `localhost`, an Origin must match it, and `Sec-Fetch-Site` must be `same-origin` or `none`. The one exception is a **same-site top-level page navigation** (`GET /` or `GET /?...` with `Sec-Fetch-Mode: navigate` and `Sec-Fetch-Dest: document`), which is how a lobby card on another `127.0.0.1` port opens a kitchen; `/state` and `/lobby` stay same-origin. Responses disable caching and embedding. There is no mutation endpoint, shell action, remote publish operation or filesystem browse route. The server writes its local port-discovery file; the lifecycle logger and explicit workflow helpers write their own bounded local evidence.

**Slice progress is measured, never estimated.** For each unfinished slice whose checklist row links a plan (`**Plan:** [stage_*.md](...)`, a plain file name inside `docs/plans`), the state reader counts the plan's top-level task checkboxes, then counts distinct task commits on the local branches with a read-only `git log --branches` over the 5.3.0 subjects `feat(pie-N): N.M task K <name>` (cached for 15 seconds). A pie's commits usually sit on its own branch in another worktree, which is why local branches are searched rather than only the current one. A missing plan, no git, or a task number past the plan's count yields no progress at all. The current step comes from the dispatch label (`P5 S5.2 verify:`) or the agent's role. The served-pie details show only the commit, commit range, date and one-line summary that the checklist rows themselves state.

**Progress over time comes from the Pass ledger.** The snapshot's `progress` field is `.bytheslice/ledger.jsonl` folded by [`scripts/ledger-summary.js`](../scripts/ledger-summary.js), the newest 1 MiB read once per snapshot. The header's Progress button opens a sheet with one block per pie: a slice table (started, done, duration, fix loops, verifier verdict, cost) and an inline SVG step line of slices done over time. Without a ledger (no mod, or no Claude Code session yet) the sheet says so.

The visible page polls same-origin `/state` every **three seconds**, preserves the latest valid snapshot and pauses polling while hidden. `window.kitchenLive.snapshot` exposes the latest snapshot for inspection. The header browser button uses only the validated snapshot port and opens the same loopback URL with `noopener` after a user click. Host behavior determines whether the new tab leaves the pane. The viewer loads Three.js from **unpkg** and fonts from **Google Fonts**, so its rendering is not offline.

**Opened from the lobby.** With `?lobby=<port>` (a valid port from 1 to 65535) the header shows a **Lobby** button (`#bLobby`) linking `http://127.0.0.1:<port>/`. With `?idle=1`, the first live snapshot decides: when no agent or skill is active the kitchen goes **idle**, with no customer line, a "Nothing is in progress in this project" notice and the time-of-day buttons unlocked; the first later snapshot with active work ends idle for good, locks the time again and re-applies the session phase. `window.__kitchenScene.idle` reports it. A kitchen opened without `?lobby=` has no Lobby button; its `/lobby` route covers that case.

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

## The lobby

The lobby lists every ByTheSlice project on this machine on one page: one card per project with its progress, its active pie and slice, and one state. `/open-kitchen --lobby` opens it in the native Browser pane; a kitchen's Lobby button or its `/lobby` route lead back to it.

### Process and transport

[`mcp/lobby-server.js`](../mcp/lobby-server.js) is **one machine-level process**, separate from every kitchen. It binds `127.0.0.1` only, from **4466** (or `BTS_LOBBY_PORT`) upward past any port in use, and writes the chosen port to `<BTS_HOME or ~/.bytheslice>/lobby/port` (directory 0700, file 0600, temp file then rename). On SIGTERM or SIGINT it drains open requests, then removes the port file if it still names its own port. [`open-kitchen.js --lobby`](../skills/open-kitchen/open-kitchen.js) reuses the lobby when that port answers `GET /state` with a `projects` array, and otherwise starts `lobby-server.js --serve-only` detached (stdio ignored, `BTS_HOME` passed through) and waits at most eight seconds. Its stdout is only `http://127.0.0.1:<port>/`; `--lobby` cannot be combined with `--project`. A lobby started with `--serve-only` runs until it receives SIGTERM or SIGINT; without that flag it stops when its stdin closes.

| Route | Answer |
|---|---|
| `GET /` | The bundled [`lobby.html`](../skills/open-kitchen/lobby.html) (503 while it is missing). |
| `GET /state` | `{ v: 1, generatedAt, projects: [...] }`, one row per registered project. |
| `POST /open` | Body `{"root":"<absolute path>"}` (`application/json`, at most 1 KiB): starts that registered project's kitchen and answers `{"url":"http://127.0.0.1:<port>/"}`. |

Paths are exact, with no query strings. A method other than `GET` (or `POST` on `/open`) is 405, and any other path is 404. Every request passes the kitchen's checks: Host is this port on `127.0.0.1` or `localhost`, an Origin matches it, and `Sec-Fetch-Site` is `same-origin` or `none`, except a same-site top-level `GET /` navigation (`Sec-Fetch-Mode: navigate`, `Sec-Fetch-Dest: document`), which is how a kitchen's Lobby button reaches it from another `127.0.0.1` port. `/state` and `/open` stay same-origin only. Responses carry `no-store`, `nosniff`, `DENY` framing, `no-referrer`, a same-origin resource policy and a CSP with `connect-src 'self'`.

Each `/state` row is `{ key, root, path, name, pies, slices, active, activePie, activeSlice, sessions, state, kitchenUrl }`:

| Field | Value |
|---|---|
| `key`, `root`, `path` | The same realpath of the project's primary checkout. |
| `name` | The registered name (the folder's basename). |
| `pies`, `slices` | `{ done, total }` from the master checklist, read through the kitchen's own parser (never git, never a route scan). |
| `active` | `null`, or `{ pie: { number, name }, slice: { number, name } \| null }` for the first active pie and its first active slice; `activePie` and `activeSlice` mirror it. |
| `sessions` | How many of this project's session signals are under 24 hours old. |
| `state` | `needs-you`, `active`, `done` or `inactive` (below). |
| `kitchenUrl` | `http://127.0.0.1:<port>/` when the project's kitchen port file names a kitchen whose `/state` answers for this very root within 300 ms, else `null`. |

**One state per project**, in priority order: **Needs you** when the Pass ledger holds an open HITL item (the same fold as `scripts/ledger-summary.js`, cached on the ledger's size and modification time) or any live signal is waiting on a permission or idle prompt; **Active** when any live signal is working or has subagents running; **Done** when the checklist has at least one pie and every pie is done; **Inactive** otherwise. A signal older than 24 hours is ignored, so a session that died without a `Stop` cannot pin a card for longer than that. Rows sort by that order, then by name. The page polls `/state` every three seconds while visible, keeps the last good list behind a "Lobby offline, retrying" strip, sets every string with `textContent`, and loads its fonts from Google Fonts (system fonts stand in without them).

**Read-only, except starting a registered kitchen.** The lobby writes nothing in any project. Its one action is `POST /open`, behind a **path allowlist**: the realpath of the requested root must equal the realpath of a registry entry, so `/etc`, a registered root plus `/..`, or a symlink to an unregistered folder answers 404. It then calls the same `ensureKitchen` as `/open-kitchen` (reuse the project's matching kitchen or start one detached, which writes that project's own kitchen port file), one in-flight start per root so a double click spawns one kitchen, and accepts only a returned `http://127.0.0.1:<port>/`. The page navigates only to such a URL from `/state` or `/open`, adding `?lobby=<lobby port>`, plus `&idle=1` for an Inactive or Done card. Its one write to its own files: `GET /state` prunes registry rows whose folder is gone (below).

### The registry and session signals

[`hooks/lobby-signal.sh`](../hooks/lobby-signal.sh) is the only writer. Under `${BTS_HOME:-~/.bytheslice}`:

| File | Shape |
|---|---|
| `projects.json` | `{"v":1,"projects":[{"root":"<abs primary checkout>","name":"<basename>","addedAt":<ms>}]}` |
| `signals/<session id>.json` | `{"v":1,"sid":"<id>","root":"<abs primary checkout>","t":<ms>,"working":<bool>,"subagents":<int>,"waiting":null\|"permission"\|"idle"}` |

`root` is the parent of `git rev-parse --git-common-dir` as a physical path, so **every worktree rolls up to its primary checkout** and concurrent sessions roll up into one card. Only a primary holding `docs/plans/00_master_checklist.md` or `bytheslice.config.json` counts; any other folder writes nothing. Events: `SessionStart` upserts the project (an existing root keeps its `addedAt`); `UserPromptSubmit` sets working and clears waiting; `SubagentStart` sets working and adds a subagent; `SubagentStop` removes one; `Stop` clears working and keeps waiting; `Notification` with `permission_prompt` or `idle_prompt` sets waiting, and any other notification writes nothing. Waiting therefore holds until the session's next prompt. Writes are atomic (temp file, then rename, mode 0600) under a `.lock` directory holding the writer's pid, reclaimed when that pid is gone.

**Stale prune.** `SessionStart` drops registry rows whose folder is no longer a directory, deletes signals more than 7 days old and temp files more than an hour old. `GET /state` also drops rows whose folder is gone and rewrites `projects.json` under the same lock (it gives up after about 200 ms and the next poll tries again); a permission error keeps the row.

**Cursor.** `hooks/hooks-cursor.json` runs the same script with `BTS_HOST=cursor` on `sessionStart`, `beforeSubmitPrompt`, `subagentStart`, `subagentStop` and `stop`, mapping the conversation id (the parent's on `subagentStart`) to the session and the first workspace root to the folder. Every run answers the JSON Cursor reads: `{"permission":"allow"}` on `subagentStart` (a permission hook), `{"continue":true}` on `beforeSubmitPrompt`, `{}` otherwise. Cursor has no Notification equivalent, so a Cursor session never shows Needs you from a prompt; only an open HITL item in a ledger written by a Claude Code session can mark its project.

### Privacy limits

The hook reads only `session_id`, `hook_event_name`, `notification_type` and `cwd` from the envelope (on Cursor, the conversation ids and the first workspace root). The files hold **absolute folder paths and derived facts only**: a basename, timestamps, working, a subagent count and the waiting kind. The prompt, any message, the last assistant message, tool data, transcript paths and environment values never reach a file; `hooks/test.sh` asserts it with a sentinel in every one of those fields. The lobby adds checklist titles and counts, and reads the ledger only to count open HITL items for the state; no ledger text is served. It serves all of it on `127.0.0.1` only, behind the checks above, so a foreign web page cannot read it; any local process on the machine can, as with the kitchen.

---

## Legacy & migration

**Flat v4 checklists** (`## Stage N` headings, no `## Pie N`) still work unchanged - `/sell-slice` and the hooks dual-read them. Run `/cook-pizzas --repie` to convert a flat checklist to Pies on **explicit opt-in** (never silent).

**Legacy v3 projects** (master checklist references `stage_1_*` / `stage_2_*` / `stage_3_*` plan files instead of a `## Prep` section): `/sell-slice` keeps a documented legacy routing path that dispatches the foundation skills as sub-skills when it encounters those stage types. No migration required.

`/sell-pie` **refuses** flat v4 checklists outright (with a `/cook-pizzas --repie` hint), and so does `/pizza-party`, which bakes every pie through it - autonomous baking requires the Pie structure.

---

## Cursor / non-Claude-Code fallback

`/loop`, `Workflow`, and `/goal` are Claude Code features. When unavailable (running in Cursor, `disableAllHooks` set, or any other reason), the skills do **not** silently drop the logic:

- `/sell-pie` self-paces over the pie's ≤8 slices in one context.
- Workflow-backed skills fall back to in-context dispatch with **orchestrator-side manual schema validation**.
- `/goal` falls back to the manual goal-tracking pattern.
- An agent dispatched without plugin-agent registration carries its frontmatter as a header: model tier and effort (mapped to the host's model choice where it has one), the normalized tool allowlist, the verbatim read-only line for every agent without write tools (`slice-tester`'s probes and seeds excepted), and the no-git-writes line. The conductor logs one self-check line per dispatched agent in `.claude/.bytheslice-state/run-log.md`.

Full protocols: [`loop-workflow-fallback-pattern.md`](../skills/cook-pizzas/references/loop-workflow-fallback-pattern.md) and [`goal-fallback-pattern.md`](../skills/cook-pizzas/references/goal-fallback-pattern.md).
