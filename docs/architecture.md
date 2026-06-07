<!-- docs/architecture.md -->
# 🍕 ByTheSlice — Architecture & Conventions

The under-the-hood reference for ByTheSlice. The [README](../README.md) covers the day-to-day motion; this doc covers *why the kitchen works the way it does* — the rules the plugin enforces, the verification model, and how legacy projects migrate.

> These aren't suggestions. The plugin enforces them through deterministic hooks and structured agent contracts.

## Contents

- [Pies & Slices — the two-level checklist](#pies--slices--the-two-level-checklist)
- [Mode detection — standalone vs sequential](#mode-detection--standalone-vs-sequential)
- [The verify-once model](#the-verify-once-model)
- [Delivery & git — selling vs boxing](#delivery--git--selling-vs-boxing)
- [Design-system delivery](#design-system-delivery)
- [Orchestration principles](#orchestration-principles)
- [Hook enforcement](#hook-enforcement)
- [Legacy & migration](#legacy--migration)
- [Cursor / non-Claude-Code fallback](#cursor--non-claude-code-fallback)

---

## Pies & Slices — the two-level checklist

`cook-pizzas` produces `docs/plans/00_master_checklist.md` as a **two-level Pie / Slice roadmap**.

- A **Pie** (`## Pie N`, 3–8 slices, carrying a `review: boundary|continuous` property) is the unit of `/loop` autonomy, HITL checkpoint, PR, context-refresh, and worktree.
- A **Slice** (`### Slice N.M`) is one vertical deliverable, hard-capped at **6 tasks / ~10–15 files** — completable in one fresh agent session. Override `stages.maxTasksPerStage` in `bytheslice.config.json` if you truly need a bigger slice.
- **Pie 1 is Foundations** (slices 1.1–1.4: design system, CI/CD, env, DB schema), tracked via the `## Prep` gate. Feature pies are Pie 2+.

`/sell-slice`'s prep gate **refuses to start feature work until every Pie-1 / Prep box is `[x]`**. Each foundation skill flips its own checkbox when invoked in sequential mode. The DB-schema row is conditional — emitted only if the PRD has a backend.

---

## Mode detection — standalone vs sequential

Every skill auto-detects at startup whether a master checklist exists at the project root, and runs in one of two modes:

| Mode | Trigger | Behavior |
|---|---|---|
| **Standalone** | No `docs/plans/00_master_checklist.md` | Run end-to-end, produce the artifact, exit. No checklist coordination, no "next step" handoff. |
| **Sequential** | Master checklist present | On completion, flip the corresponding Prep / Stage row to `[x]` and surface the recommended next step. |

Override auto-detection with explicit `--standalone` / `--sequential` flags. Per-skill posture:

| Skill | Standalone | Sequential |
|---|:---:|:---:|
| `setup-shop` | ✓ entry point | — |
| `create-menu` | ✓ writes a PRD artifact | — |
| `cook-pizzas` | ✓ produces the checklist | refuses if one exists |
| `set-display-case` | ✓ standalone-invocable | ✓ flips Prep box |
| `final-quality-check` | ✓ standalone-invocable | ✓ flips Prep box |
| `open-the-shop` | ✓ standalone-invocable | ✓ flips Prep box |
| `sell-pie` | — | ✓ requires a piefied checklist (refuses flat v4) |
| `sell-slice` | — | ✓ requires checklist |
| `box-it-up` | ✓ works on any branch | ✓ flips the Pie's status on merge if the branch maps to a `## Pie N` row |
| `special-order` | — | ✓ extends checklist |
| `inspect-display` | ✓ read-only audit | ✓ same |
| `run-the-day` | — | ✓ drives whole piefied checklist (refuses flat v4) |
| `close-shop` | — | ✓ needs execution history |

**The single rule that holds it together:** skills never assume they're being called from somewhere else. They detect mode from disk state, behave correctly in both, and document both modes in the SKILL.md.

---

## The verify-once model

**Per-slice verify-once is non-negotiable.** Workflow B gates every slice with two agents, and no slice is "done" until both pass — or are intentionally skipped per slice type.

| Agent | Type | What it does |
|---|---|---|
| `slice-tester` | behavioral | Rendered design-system match + per-affordance exercise + seed-and-cleanup data-flow round-trips (with the bidirectional rule). |
| `slice-verifier` | static | Lint / type / build / unit / e2e-by-tag (threshold-gated per `verification.e2e`) + design-system static grep + CI-integrity + the build-manifest under-declaration backstop. Each gate runs **exactly once**. |

The three v4 verifiers (`basic-checks-runner`, `aggregating-test-reviewer`, `ci-cd-guardrails`) and `frontend/visual-reviewer` are deprecated shims folded into these two.

**Build manifest + under-declaration backstop.** The builder (`implementer`) emits a schema-validated manifest declaring every route / component / affordance / serverAction / transition it produced. `slice-verifier` independently greps the slice diff and **fails if the manifest under-counts** — so a builder can't hide an affordance from the tester with prompt wording alone.

**Context-separated dispatch.** The `/sell-pie` `/loop` conductor holds zero implementation context. Per slice it routes structured artifacts between singular-goal agents — the `slice-tester` receives only the build manifest + Exit criteria + design-system path, **never the builder's reasoning**, so it can't rationalize the builder's choices. The builder writes unit tests but never grades its own behavior; that's the tester's job.

**Type-routed behavioral testing.** `slice-tester` routes on slice type:

- **frontend** → Chrome rendered design-system match + per-affordance exercise.
- **full-stack / backend** → seed-and-cleanup data-flow round-trips (paired cleanup written first, hard non-prod guard, cleanup-in-`finally`, residue check), success-and-error toasts, cross-surface bidirectional round-trips.
- **infrastructure** → probe / harness only, no browser.

`slice-verifier`'s static gates run on every type; foundation slices that produce no behavior skip the tester.

---

## Delivery & git — selling vs boxing

**Selling and boxing are decoupled, at the pie boundary.** Each slice commits + pushes to the pie branch with **no PR and no CI**. `/box-it-up` opens the single `Pie N` PR, runs CI once, and merges — preserving every per-slice commit — only at the pie boundary.

The split exists so you can run a manual visual UAT or local code review between slices, and so CI fires once per pie instead of once per slice. `/box-it-up` is also safe for hand-rolled feature branches that never went through ByTheSlice delivery.

**One Pie per PR.** Default branch naming: `pie-<n>-<scope>`, one worktree per pie (cut from freshly-fetched `origin/main`). Slices land as `feat(pie-N): N.M — <name>` commits on that branch (no per-slice PR); the single PR opens at the pie boundary. The full worktree lifecycle — setup, isolation, the runtime-isolation gap, merge, cleanup — is standardized in [`git-worktree-standard.md`](../skills/cook-pizzas/references/git-worktree-standard.md).

---

## Design-system delivery

**Preview-first library delivery.** `/set-display-case` scaffolds an operator-only `/library` preview route — at `app/(dashboard)/library/` on Next.js App Router, or the framework's idiomatic location on Vite / SvelteKit / Astro (see [`framework-detect.md`](../skills/setup-shop/references/framework-detect.md)) — excluded from every nav surface, sitemap, and robots.

Every frontend slice through `/sell-slice` passes through Phase 4.5's **Library Preview Gate** — non-skippable for new components AND for consumer-side edits that change a user-visible surface of an existing library component. The gate runs a Phase 0 extend-vs-create check, surfaces a self-critique block + clickable preview URLs, then HARD STOPS for explicit user approval before any production-route import lands. Pure internal refactors with no rendered-output delta are exempt.

**Visual review tooling priority** *(hardcoded, no discovery):* Claude in Chrome → Chrome DevTools MCP → Playwright → Vizzly. Screenshot viewports come from `verification.viewports` (default `[375, 1280]`).

---

## Orchestration principles

- **Subagent-driven everything.** Skill files are orchestrators — context, scenarios, gates, agent rosters. Heavy work lives in `skills/*/agents/*.md`. The orchestrator dispatches, reviews structured outputs, and loops to green; it does not write production code itself.
- **Exit-criteria contract.** Every slice's plan file carries a transcript-verifiable, binary `**Exit criteria:**` block. `/sell-slice` lifts it verbatim into a session-scoped `/goal` condition, and `slice-tester` derives its test plan from it. Vague lines like "tests pass" break the goal evaluator — `phased-plan-writer` enforces specificity (write `pnpm test --filter @repo/auth exits 0`, not "tests pass").
- **HITL bubbling.** Sub-agents never prompt the user directly and never call `ask_user_input_v0` — they return `needs_human: true` with one of four categories: `prd_ambiguity`, `external_credentials`, `destructive_operation`, `creative_direction`. Only top-level orchestrators surface the prompt; under `/sell-pie`, any of the four **halts the `/loop`**.
- **Always recommend a default in elicitation.** Every clarifying-questions phase across the plugin includes a recommended option in each choice set.
- **Model tiers.** Three aliases (`haiku`, `sonnet`, `opus`); heavier tiers go to producing/verifying agents (`implementer` = `opus, xhigh`; `quality-reviewer` = `opus, high`; `slice-tester` and `slice-verifier` = `sonnet, high`). Full per-agent table at [`model-tier-guide.md`](../skills/setup-shop/references/model-tier-guide.md).

---

## Hook enforcement

Preconditions and gates that used to live in prose are enforced by plugin hooks in [`hooks/`](../hooks/):

- `/sell-slice` blocks without a master checklist.
- `git commit` on `main` is blocked at the tool layer.
- Editing a stage plan mid-delivery draws a WARN.
- A `PreCompact` snapshot lets a post-compaction session re-orient.

Hooks dual-read flat `## Stage N` and nested `## Pie N` / `### Slice N.M` checklists. Every hook is session-id-scoped and fails open; a 64-test regression suite lives at `hooks/test.sh`. Disable per-session with `BTS_HOOKS_DISABLED=1`. See [`hooks/README.md`](../hooks/README.md).

> **v5 note:** the `Stop`-gate and `commit-checklist-correlator` hooks were deleted — `/loop` + the pie-completion `/goal` own loop continuation natively.

---

## Legacy & migration

**Flat v4 checklists** (`## Stage N` headings, no `## Pie N`) still work unchanged — `/sell-slice` and the hooks dual-read them. Run `/cook-pizzas --repie` to convert a flat checklist to Pies on **explicit opt-in** (never silent).

**Legacy v3 projects** (master checklist references `stage_1_*` / `stage_2_*` / `stage_3_*` plan files instead of a `## Prep` section): `/sell-slice` keeps a documented legacy routing path that dispatches the foundation skills as sub-skills when it encounters those stage types. No migration required.

`/sell-pie` and `/run-the-day` **refuse** flat v4 checklists outright (with a `/cook-pizzas --repie` hint) — autonomous baking requires the Pie structure.

---

## Cursor / non-Claude-Code fallback

`/loop`, `Workflow`, and `/goal` are Claude Code features. When unavailable (running in Cursor, `disableAllHooks` set, or any other reason), the skills do **not** silently drop the logic:

- `/sell-pie` self-paces over the pie's ≤8 slices in one context.
- Workflow-backed skills fall back to in-context dispatch with **orchestrator-side manual schema validation**.
- `/goal` falls back to the manual goal-tracking pattern.

Full protocols: [`loop-workflow-fallback-pattern.md`](../skills/cook-pizzas/references/loop-workflow-fallback-pattern.md) and [`goal-fallback-pattern.md`](../skills/cook-pizzas/references/goal-fallback-pattern.md).
