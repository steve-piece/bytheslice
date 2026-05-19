# ByTheSlice — Project Notes

The everyday delivery loop:

1. `/sell-slice` — cook one slice off the master checklist
2. `/box-it-up` — push, watch CI, merge

Source of truth for in-flight work: `docs/plans/00_master_checklist.md`. Per-stage plans live alongside it as `docs/plans/stage_<n>_*.md`.

Skill preconditions (checklist exists, Prep section complete, git tree state, branch sanity) are enforced by plugin hooks in `hooks/`. The hook output replaces what used to be repeated prose in every SKILL.md.

For a new project, run `/setup-shop` once and follow the bootstrap. For an existing project, start at `/cook-pizzas` to generate a master checklist.
