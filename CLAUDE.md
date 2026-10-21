# ByTheSlice: Project Notes

The everyday delivery loop (v5 Pie/Slice model):

1. `/sell-pie` (forefront): bake one whole Pie autonomously. Each slice runs the context-separated build, test, verify, fix workflow, then commits and pushes to the pie branch. No per-slice PR, so CI stays quiet.
2. `/box-it-up` (pie boundary): open the single `Pie N` PR, watch CI once, merge preserving every slice commit, sync main, clean up the branch and worktree.

One PR per Pie, one fresh chat per Pie (the default `pie-pr` delivery mode). Opt-in merge-per-slice delivery (an explicit autonomous-delivery run instruction, or `delivery.mode: "merge-per-slice"`) instead gives each slice its own branch, worktree and PR, merged with a merge commit on green CI with no per-slice approval; `review: continuous` pies always use the default. Use `/sell-slice` when a single slice needs high-touch care (build-plan and library gates stay live); pies annotated `review: continuous` route through it automatically. `/run-the-day` (experimental) chains `/sell-pie` across the whole roadmap.

Rules every delivery run follows (details in [docs/architecture.md](docs/architecture.md)):

- **Tiered gates.** Tier 1 while coding (lint on changed files, incremental typecheck, colocated unit tests), tier 2 before each commit (the slice's own tests, build, DB tests only when the schema or migrations changed), tier 3 once at slice end (`slice-verifier` runs the full local suite one time), tier 4 in CI at the PR. After a fix, `slice-verifier` re-runs only the gates the fix could change and lists them in `rerun`. Never `--no-verify`.
- **Fix cap.** 3 local fix loops per slice and 3 CI fix rounds per PR, separate counters. No run instruction raises them; only the operator's explicit reply at the HITL does.
- **Conductor-only git.** Agents return `files_changed`; the conductor stages selectively, commits at every task boundary (`feat(pie-N): N.M task K <name>`), and pushes.
- **Merge-per-slice mode** (opt-in, see above): one branch, worktree and PR per slice, merged with a merge commit on green CI.
- **Fallback agent shape.** On a host without plugin-agent registration, each agent's frontmatter travels as a header (model tier, effort, normalized tool allowlist, the read-only line for agents without write tools, no git writes), and the conductor logs one self-check line per dispatch in `.claude/.bytheslice-state/run-log.md`.
- **No proof ledgers.** No hashes, fingerprints, leases or per-step proof files; the Pass mod ledger ([docs/pass-mod-spec.md](docs/pass-mod-spec.md)) is the one sanctioned completion record.

Source of truth for in-flight work: `docs/plans/00_master_checklist.md` (gitignored, generated per project), nested as `## Pie N` / `### Slice N.M` with the `## Prep` gate acting as Pie 1 (Foundations). Per-slice plans live alongside it as `docs/plans/stage_<n>_*.md` (filenames keep the `stage_` prefix for dual-read back-compat).

Each skill checks its own preconditions (checklist exists, Prep section complete, git tree state, branch sanity) inline at the start and raises a problem as a question to the operator, never a refusal. No ByTheSlice hook blocks a prompt or a tool call; the hooks in `hooks/` log kitchen activity, inject the checklist summary at session start, and warn on a `git commit` on `main`.

For a new project, run `/setup-shop` once and follow the bootstrap. For an existing project, start at `/cook-pizzas` to generate the Pie/Slice checklist. A flat v4 checklist (`## Stage N`) still works with `/sell-slice`, but `/sell-pie` and `/run-the-day` refuse it; convert with `/cook-pizzas --repie` (explicit opt-in, never silent).

Full story: [README.md](README.md) for the day-to-day motion, [docs/architecture.md](docs/architecture.md) for the rules the plugin enforces.
