<!-- skills/cook-pizzas/references/git-worktree-standard.md -->
<!-- Cross-cutting standard for multi-agent git worktree orchestration. Linked (not copied) by every skill that creates, runs in, merges, or removes a worktree: /sell-pie, /sell-slice, /box-it-up, and any Workflow that uses isolation:'worktree'. Lives in cook-pizzas/references/ alongside the other shared references (goal-fallback-pattern.md, loop-workflow-fallback-pattern.md). -->

# Git Worktree Standard (multi-agent orchestration)

The single source of truth for how ByTheSlice sets up, runs in, verifies, merges, and tears down git worktrees when more than one agent touches code. Skills **link** here; they do not restate it. If you change the rules, change them here.

**Mental model** (kinesthetic, from the office analogy):

| Git term | Analogy | What it means here |
|---|---|---|
| `.git` object store (`$GIT_COMMON_DIR`) | the shared blueprint cabinet | one content-addressed store, shared by every worktree — `fetch` updates it for all of them at once |
| Worktree (`$GIT_DIR`) | a private desk | its own `HEAD`, **its own index/`index.lock`**, its own working files |
| Branch | the desk's nameplate | a branch can be checked out on **only one** desk at a time (git enforces this) |
| Commit | a photo in the album | an immutable snapshot |
| PR merge | filing into the main cabinet | the one place a branch's work enters shared `main` |

Because each worktree has its own `index.lock`, N agents on N worktrees commit in parallel with **zero lock contention** — that is the whole reason worktrees beat one shared checkout for parallel work.

---

## 1. ByTheSlice's worktree topology (read this first — it differs from the generic "swarm")

The generic guidance is "one worktree per agent, merge each into main." ByTheSlice is **two-level**, and conflating them is the #1 mistake:

| Scope | Default | When |
|---|---|---|
| **One worktree per Pie** | ✅ the standard | `/sell-pie` cuts `pie-<n>-<scope>` into **one** worktree. Its slices run **sequentially** in that worktree — *not* one worktree per slice. `/sell-slice` (standalone) cuts one worktree for its one slice. |
| **One worktree per agent** (`isolation:'worktree'`) | ⚠️ escape hatch only | Use **only** when a `Workflow` runs agents **in parallel that mutate overlapping files**. Most ByTheSlice fan-out is **disjoint-file** (each agent owns distinct paths) and needs **no** isolation — the migration Workflow and `cook-pizzas`' plan-writers prove it. Worktree-per-agent costs disk + setup; don't pay it unless writes would actually collide. |
| **Merge** | pie branch → `main`, one PR | There are **no** sub-worktree→pie merges. Slices commit to the pie branch; the **pie branch** merges to `main` via one PR at the boundary (`/box-it-up`). |

> Decision rule: **disjoint files → no isolation, just a file-ownership partition. Overlapping files in parallel → `isolation:'worktree'`. Sequential → the shared pie worktree.**

---

## 2. Phase 1 — Setup (the Dispatcher)

**Invariant: a worktree is ALWAYS cut from the freshly-fetched remote `main`, never from local `main`.** Local `main` can be stale; cutting from it silently bases new work on an old tree.

```bash
git fetch origin                                            # refresh the shared blueprint first
git worktree add -b pie-<n>-<scope> <path> origin/main      # cut from the REMOTE ref, not local main
```

- **Start-point is `origin/main`** (the just-fetched ref), so the worktree is current even if local `main` has drifted. Never `git worktree add … main`.
- **Branch + folder are both unique per unit of work** (`pie-<n>-<scope>` / `feat/stage-<n>-<scope>`). Unique branch ⇒ no Branch-Exclusivity clash; unique folder ⇒ a private `index.lock` ⇒ no lock contention.
- **Path convention:** sibling worktrees under the session's worktree root (e.g. `.claude/worktrees/<name>`), never nested inside the main checkout.
- Never create a worktree on, or commit directly to, `main`/`master`.

## 3. Phase 2 — Run (the Swarm)

- **1:1 agent:worktree for parallel mutating work.** An agent's uncommitted edits are physically invisible to siblings, so a reviewer/tester agent reasons only from the artifact + spec, never the builder's half-finished state. This is the filesystem half of ByTheSlice's context-separation.
- **Selective staging.** Stage only the files this task owns (`git add <paths>`), never `git add -A` blindly — keep the commit scoped to the slice.
- **⚠️ The Runtime Isolation Gap (the collision worktrees do NOT prevent).** Worktrees isolate *files*, not *the building's utilities*. Two agents will still collide on a shared **dev-server port** or a shared **database**. ByTheSlice mitigations, mandatory whenever work runs in parallel:
  - **Ports:** derive the dev-server / preview port from the worktree (offset per worktree), never hardcode `3000`. The `slice-tester` boots the dev server for the worktree it was handed; parallel pies must not share a port.
  - **Database:** the `slice-tester` seeds the **dev** DB. Its safeguards are exactly the collision fix and are non-negotiable — (a) the **non-prod guard** blocks any non-local/dev target (`destructive_operation` HITL), (b) every seeded row carries a unique **`bts_test_run_id`** marker so parallel runs never read/delete each other's data, (c) the **paired cleanup script runs in a finally block** and a residue check asserts the run's own marker is gone. Seeding must be keyed to the run, not the table.

## 4. Phase 3 — Verify · Merge · Cleanup (the Inspector)

- **Verify against the spec, not the author.** A separate agent compares the staged diff against the slice's Exit criteria / the living spec (the `slice-tester` + `slice-verifier` independence). Drift is caught here, before the work enters `main`.
- **Merge = pie branch → `main` via one PR, preserving per-slice commits.** Use `--rebase`/merge-commit, **never `--squash`** for a pie (PR = Pie, commit = Slice; squashing destroys that mapping). Sync `main` with `--ff-only` after. This is where silent overwrites become normal, resolvable git conflicts.
- **Cleanup with the official command — never `rm -rf`.**
  ```bash
  git worktree remove <path>      # dismantles the desk AND cleans the .git/worktrees/ metadata
  git worktree prune              # sweep any stale admin records (e.g. after a crash)
  ```
  `rm -rf <path>` deletes the files but leaves stale metadata in `.git/worktrees/`, which corrupts future `git worktree` operations. Always `remove`, then `prune` to be safe.

---

## 5. Invariants (the hard rules — what a guard hook would enforce)

1. **Fresh-main:** every worktree is cut from `origin/main` after `git fetch` — never local `main`.
2. **One-per-Pie default; per-agent isolation only for parallel overlapping writes.**
3. **Never seed a production DB** — the `slice-tester` non-prod guard is blocking.
4. **Never `--squash` a pie** — preserve per-slice commits.
5. **Never `rm -rf` a worktree** — `git worktree remove` + `prune`.
6. **Never bake on `main`/`master`** — feature/pie branch only.

## 6. PR template (the Inspector files this so history stays searchable)

`/box-it-up` composes the boundary PR body from this shape (the per-slice closing-narrative paragraphs aggregate into it):

- **Context** — link to the spec / Pie; why this change exists from a product POV.
- **Description** — the technical *why* and *how*; what steps were taken.
- **Changes in codebase** — modified functions, refactors, new logic.
- **Changes outside codebase** — infra, DB/migrations, external API / env changes.
- **Additional information** — design choices, performance considerations, and **rejected alternatives**.

## 7. When the primitive is unavailable (Cursor / no `Workflow`)

`git worktree` itself is universal. The subagent **`isolation:'worktree'`** option is a `Workflow` feature (Claude-Code-only). When `Workflow` is unavailable (see [`loop-workflow-fallback-pattern.md`](./loop-workflow-fallback-pattern.md)), parallel-with-isolation degrades to the **file-ownership partition** discipline: keep each agent's writes to disjoint paths and run them sequentially in the single pie worktree. The fresh-main, no-squash, remove-not-rm, and runtime-isolation rules all still apply.
