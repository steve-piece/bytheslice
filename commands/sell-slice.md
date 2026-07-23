<!-- commands/sell-slice.md -->
<!-- Slash command that loads the sell-slice skill: the high-touch single-slice delivery loop. Pizza-shop framing: pull one pie off the rack, run it through the line, slice and serve to one customer. v5 shape: interactive spine + Workflow A (produce) + library gate + Workflow B (verify-once); shipping is /box-it-up's job. The autonomous whole-pie baker is /sell-pie. -->

---
description: Sell a customer their slice, the high-touch single-slice delivery loop. Reads the master checklist (v5 nested Pie/Slice or legacy flat Stage, dual-read), picks the next Not Started slice, and runs an interactive spine (prep gate, recon, build-plan authorization, slice /goal, branch) + Workflow A (produce, where the type-routed builder or frontend pipeline writes the slice + unit tests and emits the build manifest) + the human library preview gate for net-new UI + Workflow B (verify-once, where slice-tester verifies behavior off the manifest alone and slice-verifier runs each static gate exactly once, with an off-context fix loop). Commits the slice locally and stops; /box-it-up ships it. Use when the user runs /sell-slice, says "sell a slice", "serve a customer", "deliver the next stage", "ship the next slice", or "work the checklist". For autonomous whole-pie baking use /sell-pie.
---

# /sell-slice

Load and follow the [`sell-slice`](../skills/sell-slice/SKILL.md) skill.

`sell-slice` is the **high-touch** single-slice delivery loop in ByTheSlice v5. Where `/sell-pie` bakes a whole Pie autonomously, `/sell-slice` serves exactly one slice per run with full human gates. The agent acts as **orchestrator**: it routes structured artifacts between subagents and never writes production code or grades its own output.

The skill drives one slice end-to-end:

1. **Interactive spine.** Prep gate (dual-read of the checklist layout, every `## Prep` box `[x]`), parallel recon (`discovery`, `checklist-curator`, `rules-loader`), build-plan authorization (auto-approved under the `/sell-pie` loop or `flow.autoApproveBuildPlan`), a slice-completion `/goal` lifted from the slice's Exit criteria, then a branch/worktree cut from freshly fetched `origin/main`.
2. **Workflow A (produce).** Routed by slice `type:`. Frontend runs `modern-ux-expert` and `layout-architect` in parallel, then `block-composer`, then `component-crafter` only on reported gaps. Backend / full-stack / db-schema / infrastructure dispatch the `implementer` (builder) per item, with `spec-reviewer` + `quality-reviewer` looping until both pass. The builder writes the slice plus its unit tests and emits the **build manifest**; it never behaviorally reviews its own work.
3. **Library preview gate (human).** Net-new components and user-visible edits to existing library components land in `/library?tab=<id>` first via `library-entry-writer`, governed by `flow.libraryGate` (`self-critique` default / `human` / `off`). No production-route import before approval.
4. **Workflow B (verify-once).** `state-illustrator` → `slice-tester` → `slice-verifier`. Context separation is absolute: the tester receives only the build manifest + Exit criteria + design-system path, never the builder's reasoning. The verifier runs each static gate exactly once (lint, typecheck, build, unit/integration, e2e per `verification.e2e`, design-system static grep, CI-integrity, manifest under-declaration backstop). Failures route off-context to `fix-attempter`, then `debug-instrumenter`, capped at 3 loops before bubbling HITL.
5. **Closeout + handoff.** Checklist rows flip only after both verdicts pass. The slice is committed locally on its branch and the skill **stops there**: no push, no PR, no CI watch, no merge. That is [`/box-it-up`](../skills/box-it-up/SKILL.md)'s job (per-slice it commits + pushes only; at the pie boundary it opens one PR, runs CI once, and merges preserving every slice commit).

## Preconditions

Enforced by the plugin hooks in `hooks/` when active; the same checks run inline when hooks are disabled.

- `docs/plans/00_master_checklist.md` exists. Both layouts work: v5 nested (`## Pie N` / `### Slice N.M`) or legacy flat (`## Stage N`). Unlike `/sell-pie`, a flat checklist runs unchanged, no `--repie` required.
- If the checklist has a `## Prep` section, every Prep box is `[x]`.
- One or more `docs/plans/stage_<n>_*.md` slice plans exist for the active unit.
- Clean git working tree, OR explicit user OK to proceed dirty.

## When to use this command

Run `/sell-slice` repeatedly, one fresh chat per slice, until every row in the master checklist is `[x]`. It is the careful, collaborative surface for sensitive or design-heavy work.

- For **autonomous whole-pie baking** (the v5 forefront), use [`/sell-pie`](../skills/sell-pie/SKILL.md); a `review: continuous` pie drops back into `/sell-slice` per slice.
- For the **whole roadmap** unattended, use [`/run-the-day`](../skills/run-the-day/SKILL.md) (experimental).
- To **bolt new features onto an existing checklist**, use [`/special-order`](../skills/special-order/SKILL.md) (it feeds into `sell-slice`).
- **Shipping** is [`/box-it-up`](../skills/box-it-up/SKILL.md)'s job; `/sell-slice` ends at "slice committed locally, ready for review."
