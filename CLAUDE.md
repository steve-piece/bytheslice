# ByTheSlice: Project Notes

The everyday delivery loop (v5 Pie/Slice model):

1. `/sell-pie` (forefront): bake one whole Pie autonomously. Each slice runs the context-separated build, test, verify, fix workflow, then commits and pushes to the pie branch. No per-slice PR, so CI stays quiet.
2. `/box-it-up` (pie boundary): open the single `Pie N` PR, watch CI once, merge preserving every slice commit, sync main, clean up the branch and worktree.

One PR per Pie, one fresh chat per Pie. Use `/sell-slice` when a single slice needs high-touch care (build-plan and library gates stay live); pies annotated `review: continuous` route through it automatically. `/run-the-day` (experimental) chains `/sell-pie` across the whole roadmap.

Source of truth for in-flight work: `docs/plans/00_master_checklist.md` (gitignored, generated per project), nested as `## Pie N` / `### Slice N.M` with the `## Prep` gate acting as Pie 1 (Foundations). Per-slice plans live alongside it as `docs/plans/stage_<n>_*.md` (filenames keep the `stage_` prefix for dual-read back-compat).

Skill preconditions (checklist exists, Prep section complete, git tree state, branch sanity) are enforced by plugin hooks in `hooks/`. The hook output replaces what used to be repeated prose in every SKILL.md.

For a new project, run `/setup-shop` once and follow the bootstrap. For an existing project, start at `/cook-pizzas` to generate the Pie/Slice checklist. A flat v4 checklist (`## Stage N`) still works with `/sell-slice`, but `/sell-pie` and `/run-the-day` refuse it; convert with `/cook-pizzas --repie` (explicit opt-in, never silent).

Full story: [README.md](README.md) for the day-to-day motion, [docs/architecture.md](docs/architecture.md) for the rules the plugin enforces.
