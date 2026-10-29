<!-- commands/cook-pizzas.md -->
<!-- Slash command that loads the cook-pizzas skill: decompose a finalized PRD into a master checklist of vertical-slice feature stages. Pizza-shop framing: cook every pre-made pie for the display case. -->

---
description: Cook the pre-made pies before the shop opens. Decompose a finalized PRD into phased development plans: Pies of vertical-slice feature slices sized to the PRD (few for a small app, up to 20-30 for a large one), a master checklist, a top "Prep" section pointing at the foundation skills (/set-display-case, /final-quality-check, /open-the-shop), and a populated project rules file. Use when the user has a completed PRD and wants an implementation-ready plan. Also use when the user says "break this into phases", "create a development plan", or "phased approach".
---

# /cook-pizzas

Load and follow the [`cook-pizzas`](../skills/cook-pizzas/SKILL.md) skill.

The skill transforms a finalized PRD into a complete, ordered set of implementation stages:

1. Reads the PRD and identifies all features, constraints, and technical requirements.
2. Produces canned stage files for design-system gate, CI/CD scaffold, env-setup gate, and (conditionally) DB schema foundation.
3. Generates the vertical-slice feature slices, grouped into Pies and right-sized to the PRD (a small brief gets few; 20 to 30 is a ceiling for large apps), each as a standalone `docs/plans/stage_N_*.md` file.
4. Writes `docs/plans/00_master_checklist.md` as the authoritative progress tracker.
5. Populates the project rules file with conventions derived from the PRD.

## Preconditions

- A finalized PRD exists (output of `/create-menu` or equivalent). Raw briefs, specs, and questionnaires feed `/create-menu` first.

## When to use this command

Use `/cook-pizzas` once you have a completed PRD and are ready to produce the full implementation plan. The output is the input for `/bytheslice:sell-pie` (one whole Pie autonomously) or `/bytheslice:sell-slice` (one careful slice). Under `run.unattended: true` (set by `/pizza-party`) the elicitation comes from the order ticket, the roadmap is auto-approved and logged, and every pie is `review: boundary`.
