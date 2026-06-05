---
name: box-it-up
description: Box the pie and hand it across the counter — per slice, commit + push only (no PR, CI stays quiet); at the pie boundary, open one PR, watch CI once (auto-fix on red), merge on approval preserving every slice commit, sync main, delete the branch, remove the pie worktree.
user-invocable: true
triggers: ["/bytheslice:box-it-up", "/box-it-up", "box up the pie", "box up the slice", "hand it over", "close out the pie", "/bytheslice:ship-pr", "/ship-pr", "ship the pr", "submit the pr", "open and merge the pr", "ship this branch", "ship this pie"]
---
<!-- skills/box-it-up/SKILL.md -->
<!-- Standalone closeout skill, re-scoped pie-level for v5 (spec §1.10). Pizza-shop framing: the pie cooled slice by slice — box it and hand it over. TWO call shapes: (1) per-slice, invoked repeatedly by /sell-pie's loop after each slice → commit + push only, no PR opened so CI does not fire; (2) pie-completion, invoked once when every slice in the active Pie is [x] → open one PR "Pie N", CI runs once, HITL review, merge PRESERVING per-slice commits (rebase/merge-commit, never squash), sync main --ff-only, delete branch, remove the pie worktree. Universal closeout safety preserved: a hand-rolled branch with no checklist still ships through the pie-completion path (no pie-status flip, project-default merge strategy). Decoupled from /sell-pie and /sell-slice so the operator can review / UAT before the boundary PR. -->

# /box-it-up

In v5 a **Pie** (a coherent chapter of 3–8 slices) is the unit of PR, CI, and review. `/box-it-up` carries both halves of the pie's git lifecycle:

- **Per slice** — `/sell-pie`'s loop calls `/box-it-up --slice` after each slice clears its gates. The skill commits the slice on the pie branch and pushes. **No PR is opened, so CI does not fire** — per-slice pushes stay cheap.
- **At the pie boundary** — when every slice in the active Pie is `[x]`, `/box-it-up` opens **one** PR `Pie N: <name>`, lets CI run **once**, gets your merge approval, merges **preserving every per-slice commit** (rebase or merge-commit, never squash), syncs `main` fast-forward-only, deletes the branch, and **removes the pie worktree**.

It is intentionally a **separate** skill so you can review the whole pie locally, run a manual visual UAT, or rebase against fresh main before deciding to ship the boundary PR. The closeout path is **universal** — safe to run on a hand-rolled branch that never touched the ByTheSlice delivery loop. Pre-flight checks and the merge/cleanup pattern do not assume a checklist or a pie.

---

## Mode detection

`/box-it-up` is **always standalone** and operates on whatever feature branch is currently checked out. It resolves one of three modes before doing anything:

| Mode | How it's detected | What it does |
|------|-------------------|--------------|
| **per-slice** | Invoked with `--slice` (how `/sell-pie`'s loop calls it), or the operator explicitly asks to "box up the slice" mid-pie. | **Phase 1 only** — commit the slice on the pie branch + push. **No PR, no CI watch, no merge, no cleanup.** Returns immediately so the loop continues to the next slice. |
| **pie-completion** | Default. A master checklist exists, the current branch matches a `pie-<n>-<scope>` row, and **every** `### Slice N.M` under that `## Pie N` is `[x]`. Also the shape `/sell-pie` hands off at the boundary. | **Full closeout** — Phases 0 → 6: open one PR `Pie N`, CI once, HITL merge gate, merge preserving slice commits, sync main, delete branch, remove worktree, flip the pie's checklist status. |
| **universal** (hand-rolled) | No master checklist, or the branch doesn't map to a pie row. | **Same closeout as pie-completion** (Phases 0 → 6) minus the checklist-status flip, and merge strategy falls back to the project default. The universal-closeout safety net — never assumes ByTheSlice ran. |

**Refusal guards:**
- In **per-slice** mode, if the active Pie still has unfinished slices the skill must NOT try to open a PR — that is correct, expected mid-pie behavior, not an error.
- In **pie-completion** mode, if the master checklist shows the active Pie still has unchecked slices (`### Slice N.M` is `[ ]`), STOP and surface as `needs_human: true` with `hitl_category: prd_ambiguity`: *"Pie N still has unfinished slices — finish them via /sell-pie before boxing the pie, or confirm you want to ship a partial pie."* Never silently ship an incomplete pie.

If a master checklist exists and the branch maps to a pie row, `/box-it-up` flips that **Pie's** status from `In Progress` to `Completed` after a successful merge (Phase 5). That is the only sequential-flavored behavior — best-effort enhancement, never a precondition.

## Subagent Roster

| Phase | Agent file | Model | Effort | Mode |
|-------|-----------|-------|--------|------|
| 3 (on CI fail, pie-completion only) | [agents/ci-fix-attempter.md](agents/ci-fix-attempter.md) | sonnet | high | write |

CI watching itself is inline (`gh pr checks <pr> --watch` blocks until checks settle). No separate watcher subagent. **Per-slice mode dispatches no subagents** — there is no PR and therefore no CI to fix.

---

## Inputs and Preconditions

> Pre-enforced by `hooks/precheck-skill.sh` **when hooks are active** (BLOCK on main, WARN on missing gh auth). If `BTS_HOOKS_DISABLED=1` or `disableAllHooks` is set, run the branch and `gh auth status` checks inline via tools and proceed silently. The preconditions are required either way; only the enforcement layer is optional. Never narrate the checks in chat.

- Working tree on a feature branch (not `main` / `master`) — for a v5 pie this is `pie-<n>-<scope>`.
- **Per-slice mode:** the slice's changes are committed locally OR present as uncommitted changes the skill should commit. `gh` is **not** required (no PR work).
- **Pie-completion / universal mode:** `gh` CLI installed and authenticated (`gh auth status` returns "Logged in"); the repository has a remote (`git remote -v` returns at least `origin`).
- One **worktree per pie** — created upstream by `/sell-pie` when the pie branch is cut, removed here at the boundary. `/box-it-up` never *creates* a worktree; it only removes the pie's at completion.

---

## Workflow

> **Per-slice mode runs Phase 1 only, then returns.** Phases 0 and 2–6 are pie-completion / universal closeout. The phase numbering is shared so the per-slice commit logic is defined once.

### Phase 0 — Pre-flight Safety Checks *(pie-completion / universal)*

The skill refuses to proceed past Phase 0 if any check fails. The point is to avoid a destructive accident on `main` or an accidental push to a stale branch.

1. `git rev-parse --abbrev-ref HEAD` — capture current branch as `BRANCH`.
2. **If `BRANCH` is `main` or `master`, STOP.** Surface as `needs_human: true` with `hitl_category: destructive_operation` and message: *"Refusing to ship from main. Switch to a pie / feature branch first."* Do not push, do not commit.
3. `git worktree list` — capture worktree state as `WORKTREE_PATH` (the path matching the current working directory) and `IS_WORKTREE` (`true` if cwd is not the main worktree). For a v5 pie this is the pie worktree slated for removal in Phase 5.
4. `gh pr list --state merged --limit 1 --base main --json headRefName,number,mergedAt` — capture the most recently merged PR. If `BRANCH` matches its `headRefName` (an already-shipped pie branch reused without renaming), STOP and surface as `needs_human: true` with `hitl_category: destructive_operation`. Ask whether to rename or proceed.
5. `gh pr list --state open --head "$BRANCH" --json number,url --jq '.[0]'` — check whether an open PR for this branch already exists. If yes, capture its number and URL as `EXISTING_PR_NUMBER` / `EXISTING_PR_URL`. The skill reuses it (watch CI on the existing PR) rather than create a duplicate. Because per-slice pushes never open a PR, the first boundary run normally finds none.
6. `gh auth status` — confirm gh is authenticated. If not, surface as `external_credentials` HITL and stop.
7. **Pie-completeness check (pie-completion mode only):** confirm every `### Slice N.M` under the active `## Pie N` in `docs/plans/00_master_checklist.md` is `[x]`. If any is `[ ]`, STOP per the Mode-detection refusal guard (`prd_ambiguity`).

### Phase 1 — Commit + Push *(both modes; the per-slice entry point)*

1. `git status --short` — if there are uncommitted changes, surface them and ask:
   - "Stage and commit these changes? (yes / let me write the message / cancel)"
   - **Always provide a recommended answer in the available options.** Default recommendation: yes if the diff looks like the in-scope slice; "let me write" if it includes unexpected files.
   - On `yes`: stage all changes and derive the commit message **by mode**:
     - **Per-slice mode** — use the v5 slice commit convention: **`feat(pie-N): N.M — <slice name>`** (swap `feat` for `fix`/`chore`/`docs` when the diff is purely a fix / infra-config / docs). One-line subject; short body listing touched files grouped by package/app. **If the slice touched UI** and `/sell-slice`/`/sell-pie` produced a closing-narrative paragraph (one paragraph: what was built · why this shape · what was left out · what reviewers should pay attention to), include it verbatim in the commit body before the file list. These per-slice commit messages are what the boundary PR preserves — they become the PR's commit-by-commit story, so keep each one self-describing.
     - **Pie-completion / universal mode** — only reached here when the boundary run finds straggler uncommitted changes (most slices are already committed by the per-slice runs). Derive a conventional type from the diff (`feat:`/`fix:`/`chore:`/`docs:`) with a one-line subject and a file-list body.
   - On `let me write`: prompt for the message.
   - On `cancel`: stop here. Working tree unchanged.
2. `git push origin "$BRANCH"` — push to the pie branch. If the remote rejects (non-fast-forward, etc.), STOP and surface as `destructive_operation` HITL — never auto force-push.
3. **Per-slice mode ends here.** Return the per-slice contract (`status: complete`, the commit SHA + branch). **Do not open a PR, do not watch CI, do not merge.** The `/sell-pie` loop advances to the next slice; CI fires only at the pie boundary.

### Phase 2 — Open the Pie PR (or Reuse Existing) *(pie-completion / universal)*

1. **If `EXISTING_PR_NUMBER` from Phase 0 is set**, skip to Phase 3 — the existing PR already tracks this branch.
2. **Otherwise**, open one PR for the whole pie:
   - **Title:** for a pie, `Pie N: <name>` (lift `N` and the name from the `## Pie N — <name>` checklist header). For a hand-rolled branch, fall back to `gh pr create --fill` (latest commit subject).
   - `gh pr create --base main --head "$BRANCH" --fill` — the `--fill` body lifts the accumulated slice commit subjects/bodies, so the per-slice closing-narrative paragraphs carry the design story into the PR description without a separate step. For a named pie, set the title explicitly (`--title "Pie N: <name>"`) and keep `--fill` for the body.
   - Capture the returned URL as `PR_URL` and the number as `PR_NUMBER`.
3. Output the PR URL to the user immediately so they can open it in a browser if they want to skim the pie.

### Phase 3 — Watch CI *(pie-completion / universal — CI's single run for the pie)*

This is the **one** time CI fires for the entire pie — per-slice pushes opened no PR. `gh pr checks "$PR_NUMBER" --watch` blocks until every check finishes. Capture the exit code:

- **Exit 0** → all checks passed. Continue to Phase 4.
- **Non-zero** → at least one check failed. Capture the output (`gh pr checks "$PR_NUMBER"`) and proceed to Phase 3a — the auto-fix loop.

The skill caps total CI watch time at **30 minutes per attempt**. If `--watch` does not return within 30 minutes (e.g. self-hosted runner hung), surface as `external_credentials` HITL.

#### Phase 3a — CI Fix Loop (on red)

Loop counter starts at 1. Cap at **3 attempts**.

1. Capture the failed-check rollup: `gh pr checks "$PR_NUMBER" --json name,state,link,workflow`.
2. For each failed check, retrieve logs:
   - `gh run view <run-id> --log-failed` for workflow runs, OR
   - `gh pr view "$PR_NUMBER" --comments` for non-Actions checks (e.g. external services posting back).
3. Read [agents/ci-fix-attempter.md](agents/ci-fix-attempter.md) and dispatch it. Pass:
   - `PR_NUMBER`, `PR_URL`, `BRANCH`
   - The failed-check rollup
   - Truncated log excerpts (last 200 lines per failed job) — let the agent ask for more on demand
   - The pie diff (`git diff origin/main...HEAD`)
   - The attempt number
4. The agent stages + commits + pushes a targeted fix on the pie branch. Do not call `--watch` from inside the dispatch — the skill returns to Phase 3 (top) after the agent's commit lands and re-invokes `gh pr checks --watch` against the new head SHA.
5. Increment the counter. If it would exceed 3, STOP. Surface as `creative_direction` HITL with the full failure history so the user can decide whether to debug manually, retry CI, or close the PR.

The 3-attempt cap is a hard rule. Three identical-cause failures in a row signal a structural problem (flaky test, missing secret, infra outage) that needs human judgment.

### Phase 4 — Merge Authorization Gate *(pie-completion / universal — the kept pie-boundary HITL)*

CI is green. **Stop and prompt the user** (this is the §1.8 pie-boundary checkpoint — the one HITL the loop never auto-approves):

> "CI is green on PR `<PR_URL>` (Pie N). Approve merge?"
>
> Options (always include a recommended answer):
> 1. **Approve and merge now** (recommended if you've already reviewed the pie) — the skill merges **preserving every per-slice commit** (see strategy below) and proceeds to Phase 5.
> 2. **Hold — keep the PR open for manual review** — the skill exits, leaving the PR open. You merge via the GitHub UI when ready, then re-run `/box-it-up --resume` to do cleanup.
> 3. **Cancel — leave the PR open and stop** — the skill exits without merging.

**Merge strategy — preserve per-slice commits (never squash).** The whole point of the per-slice commits is that they survive the merge as the pie's history. These rules — merge preserving per-slice commits (never squash), `--ff-only` sync, `git worktree remove`/`prune` cleanup, and the boundary-PR body shape — come from [`../cook-pizzas/references/git-worktree-standard.md`](../cook-pizzas/references/git-worktree-standard.md) (Phase 3 + Invariants §5 + the PR template §6). Resolve the strategy in this order:

1. **Prefer rebase-merge** (`gh pr merge "$PR_NUMBER" --rebase`) — replays each slice commit onto main, linear history, every `feat(pie-N): N.M` preserved.
2. If rebase is disallowed (`gh repo view --json rebaseMergeAllowed` is false), use a **merge commit** (`gh pr merge "$PR_NUMBER" --merge`) — also preserves the individual commits under a merge node.
3. **Never `--squash`** for a pie — squashing collapses the per-slice commits into one and destroys the boundary contract. If a project's settings allow *only* squash (`squashMergeAllowed` true, both others false), STOP and surface as `needs_human: true` with `hitl_category: prd_ambiguity`: *"This repo only permits squash merges, which would collapse the pie's per-slice commits. Enable rebase or merge-commit merges, or confirm you accept a squash for this pie."* For a **hand-rolled** branch with no per-slice contract, the project default (including squash) is acceptable — the preserve-commits rule binds pies, not arbitrary branches.

Never force-merge a PR with non-required failing checks unless the user explicitly authorizes via the HITL prompt.

### Phase 5 — Post-merge Cleanup *(pie-completion / universal)*

Only runs after the PR is merged (by this skill in Phase 4 option 1, or by the user manually before `/box-it-up --resume`).

1. `gh pr view "$PR_NUMBER" --json state` — confirm state is `MERGED`. If not, STOP. Don't pull or delete branches on a falsely-assumed merge.
2. `git checkout main` — if local uncommitted changes would be overwritten, STOP and surface as `destructive_operation` HITL. Never auto-stash.
3. `git pull --ff-only origin main` — fast-forward only. If this fails (history diverged), STOP and surface as `destructive_operation` HITL.
4. Confirm the PR's merge result is now in local main: `git log --oneline | grep -q "$PR_NUMBER\|<merge sha>"` (for a rebase-merge, confirm the slice commits landed). If absent, STOP and surface — something's odd.
5. **Flip the Pie's checklist status (pie-completion mode only):** in `docs/plans/00_master_checklist.md`, set the active `## Pie N` status from `In Progress` to `Completed`. Skip silently in universal mode (no checklist / no pie row).
6. `git branch -d "$BRANCH"` — delete local pie branch (safe delete; refuses if unmerged commits exist, which is what we want).
7. `git push origin --delete "$BRANCH"` — delete remote branch. If GitHub auto-deleted on merge, this returns "remote ref does not exist" — fine; record it but don't fail.
8. **Remove the pie worktree (if `IS_WORKTREE` from Phase 0 was true):**
   - `cd <main-worktree-path>` so we're not deleting our own cwd
   - `git worktree remove "$WORKTREE_PATH"` — remove the pie worktree directory
   - `git worktree prune` — clear stale metadata
9. `git status --short` — must be empty. `git rev-parse --abbrev-ref HEAD` — must be `main`. `git status -uno` — confirm fully synced with remote. The pie is closed; the next pie starts in a fresh chat with a fresh worktree.

### Phase 6 — Final Report *(pie-completion / universal)*

Surface to the user:
- PR URL + merge commit SHA (+ note the merge strategy used: rebase / merge-commit)
- Pie name + branch name (now deleted) + worktree path (now removed)
- Per-slice commit count preserved on main
- Total CI attempts (1 if green on first run; up to 3 if the fix loop ran) + ci-fix-attempter dispatch count / per-attempt summary if applicable
- Final state: "On main, clean tree, fully synced with origin/main. Pie N closed — start the next pie in a fresh chat."

---

## HITL Handling

**Agents and this skill never call `ask_user_input_v0`.** At every elicitation point — the Phase 1 commit prompt and the Phase 4 merge-authorization gate — the skill **sets `needs_human: true` plus the `hitl_*` fields in its return contract** and lets the invoking orchestrator (`/sell-pie`'s loop, or the operator's session) surface the prompt. The phase descriptions above show the question text; the skill emits it as `hitl_question`, not as a direct tool call.

For sub-agent failures (e.g. `ci-fix-attempter` returns `needs_human: true`), the skill bubbles the structured fields up via its own return contract — it does not retry indefinitely.

HITL categories the skill produces:
- `destructive_operation` — about to push from main, force-push detected, merge-conflict pull, branch-reuse without rename, would-overwrite uncommitted changes on checkout.
- `external_credentials` — `gh` not authenticated, CI watch timeout (likely runner / secrets issue).
- `creative_direction` — ci-fix-attempter exhausted 3 attempts; user decides whether to debug, retry, or close the PR.
- `prd_ambiguity` — boxing a pie with unfinished slices; a squash-only repo that would collapse per-slice commits; a precondition that needs the user to tell the skill how to interpret state.

---

## Hard Constraints

- **Per-slice mode opens no PR and watches no CI.** Commit + push only, then return. CI fires exactly **once per pie**, at the boundary. Never open a PR mid-pie.
- **Preserve per-slice commits on a pie merge — never `--squash` a pie.** Rebase-merge by default, merge-commit as fallback. A squash-only repo is a `prd_ambiguity` HITL, not a silent squash.
- **One worktree per pie; `/box-it-up` only removes it.** The pie worktree is created upstream by `/sell-pie`. This skill removes it at the boundary (via `git worktree remove` + `prune`, never `rm -rf`) and never creates one. The merge/cleanup rules here are the standard's — see [`../cook-pizzas/references/git-worktree-standard.md`](../cook-pizzas/references/git-worktree-standard.md) (Phase 3 + Invariants §5).
- **Never ship from `main` / `master`.** Phase 0 step 2 is a stop-everything check.
- **Never force-push.** If `git push` is rejected for non-fast-forward, STOP. The user resolves on a fresh branch.
- **Never auto-merge a PR with failing required checks.** Phase 4 only runs when CI is green on the latest head SHA.
- **Never box an incomplete pie.** If any slice under the active Pie is still `[ ]`, STOP (`prd_ambiguity`).
- **Never `git stash` on the user's behalf.** If `git checkout main` would overwrite uncommitted changes, STOP.
- **Never auto-resolve merge conflicts during cleanup pull.** `--ff-only` fails fast; the user resolves.
- **Cap the CI fix loop at 3 attempts.** Beyond that → HITL `creative_direction`. No "one more try."
- **Cap CI watch at 30 minutes per attempt.** Beyond that → HITL `external_credentials`.
- **Reuse existing PRs.** If an open PR already tracks the branch, watch its CI; never create a duplicate.
- **Never call `ask_user_input_v0`.** Set `needs_human` + `hitl_*` and let the orchestrator prompt.
- **Subagent prompts live in `./agents/*.md`.** This SKILL.md is workflow only — never inline subagent prompts here.
- **Always provide a recommended answer in available options** at every elicitation point.

---

## Triggers

Follow this skill whenever the user (or `/sell-pie`'s loop):

- runs `/box-it-up` (pie-completion / universal closeout) or `/box-it-up --slice` (per-slice commit + push)
- says "box up the pie", "close out the pie", "ship the pr", "submit the pr", "open and merge the pr", "ship this branch", "ship this pie"
- has finished every slice of a Pie under `/sell-pie` and reached the pie boundary
- has a hand-rolled feature branch ready to ship (universal closeout)

If the working tree is on `main` with no feature branch in sight, redirect to `/sell-pie` (autonomous, whole pie) or `/sell-slice` (one careful slice) first.

If the user wants to open the boundary PR but pause before merging for code review, they should pick option 2 (Hold) at the Phase 4 gate.

---

## Completion Checklist

Walk the checklist that matches the mode. Do not report done until every applicable box is `[x]`.

### Per-slice mode

[ ] Current branch confirmed not `main` / `master` (it is the pie branch).
[ ] Slice committed with a `feat(pie-N): N.M — <name>` (or fix/chore/docs) message.
[ ] Branch pushed to `origin`.
[ ] No PR opened, no CI watched — returned cleanly so the loop continues.

### Pie-completion / universal mode

#### 1. Pre-flight passed

[ ] Current branch confirmed not `main` / `master`.
[ ] Worktree state captured (path + IS_WORKTREE flag).
[ ] No accidental reuse of a recently-merged branch.
[ ] `gh` authenticated.
[ ] (pie mode) Every slice under the active Pie is `[x]`.

#### 2. Pie PR open

[ ] Any straggler changes committed; branch pushed to `origin`.
[ ] One PR open against `main` — titled `Pie N: <name>` for a pie (or reused existing).
[ ] PR URL surfaced to the user.

#### 3. CI green on the merged head SHA

[ ] `gh pr checks <pr> --watch` returned exit 0 (CI's single run for the pie).
[ ] If the auto-fix loop ran, the final attempt cleared green; ci-fix-attempter dispatch history captured.
[ ] No required check skipped or pending.

#### 4. Merge authorized + completed (preserving slice commits)

[ ] Phase 4 user prompt surfaced (via `needs_human`/`hitl_*`) and answered.
[ ] Merge used rebase or merge-commit — **not** squash for a pie; per-slice commits preserved on main.
[ ] PR state is `MERGED` per `gh pr view`.

#### 5. Branch + worktree cleanup

[ ] On `main` locally.
[ ] `git pull --ff-only origin main` succeeded.
[ ] (pie mode) Pie status flipped `In Progress` → `Completed` in the master checklist.
[ ] Local pie branch deleted (`git branch -d`).
[ ] Remote pie branch deleted (or already auto-deleted by GitHub).
[ ] Pie worktree removed via `git worktree remove` and pruned via `git worktree prune` (if a worktree was used).
[ ] `git status --short` empty; `git status -uno` confirms fully synced with `origin/main`.

#### 6. Final report emitted

[ ] User received the report (PR URL, merge SHA + strategy, slice-commit count, attempt counts, "Pie N closed — next pie in a fresh chat").

---

## Sub-agent return contract

`/box-it-up` returns structured fields whether it ran per-slice or boxed the whole pie (e.g. when `/sell-pie`'s loop invokes it). It never prompts the user directly — the orchestrator reads `needs_human` + `hitl_*` and surfaces any question.

```yaml
status: complete | failed | needs_human
mode: slice | pie | universal
summary: <one paragraph — mode; for slice: commit sha + branch; for pie: pie name, PR URL + number, CI attempt count, merge strategy + SHA, per-slice-commit count preserved, cleanup state>
artifacts:
  - <commit sha (slice mode)>
  - <pr url (pie/universal mode)>
  - <merge commit sha (pie/universal mode)>
needs_human: false | true
hitl_category: null | "prd_ambiguity" | "external_credentials" | "destructive_operation" | "creative_direction"
hitl_question: null | "<plain-language question>"
hitl_context: null | "<what triggered this>"
```
