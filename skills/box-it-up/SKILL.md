---
name: box-it-up
description: Box the slice and hand it across the counter — push, open PR, watch CI (auto-fix on red), merge on approval, sync main, cleanup branches and worktrees.
user-invocable: true
triggers: ["/bytheslice:box-it-up", "/box-it-up", "box up the slice", "hand it over", "/bytheslice:ship-pr", "/ship-pr", "ship the pr", "submit the pr", "open and merge the pr", "ship this branch", "ship this slice"]
---
<!-- skills/box-it-up/SKILL.md -->
<!-- Standalone closeout skill. Pizza-shop framing: pie's cooled, inspection passed — box it and hand it over. Takes a feature branch with locally-committed work and ships it through PR open → CI watch (with auto-fix loop on red) → user-authorized merge → main sync + branch and worktree cleanup. Decoupled from /sell-slice and /special-order so the operator can review / UAT the slice locally before deciding to ship. -->

# /box-it-up

`/sell-slice` and `/special-order` stop at "slice committed locally, ready for review". `/box-it-up` is the next step in the chain — it takes a branch with locally-committed work and shepherds it through PR open → CI watch (with an auto-fix loop on red) → user-authorized merge → main sync + branch / worktree cleanup.

It is intentionally a **separate** skill so you can review the slice locally, run a manual visual UAT, or rebase against fresh main before deciding to ship. The skill is also safe to run on hand-rolled branches that never touched the ByTheSlice delivery loop — pre-flight checks and the closeout pattern are universal.

---

## Mode detection

`/box-it-up` is **always standalone**. It operates on whatever feature branch is currently checked out — it doesn't care whether a master checklist exists. The skill is safe to run on:

- ByTheSlice slices committed by `/sell-slice` or `/special-order`
- Plan-only chore branches from `/special-order`
- Hand-rolled feature branches that never touched ByTheSlice

If a master checklist DOES exist and the branch name matches a stage row, `/box-it-up` will flip that stage's status from `In Progress` to `Completed` after a successful merge. That's the only sequential-flavored behavior — and it's a best-effort enhancement, not a precondition.

## Subagent Roster

| Phase | Agent file | Model | Effort | Mode |
|-------|-----------|-------|--------|------|
| 3 (on CI fail) | [agents/ci-fix-attempter.md](agents/ci-fix-attempter.md) | sonnet | high | write |

CI watching itself is inline (`gh pr checks <pr> --watch` blocks until checks settle). No separate watcher subagent.

---

## Inputs and Preconditions

> Pre-enforced by `hooks/precheck-skill.sh` **when hooks are active** (BLOCK on main, WARN on missing gh auth). If `BTS_HOOKS_DISABLED=1` or `disableAllHooks` is set, run the branch and `gh auth status` checks inline via tools and proceed silently. The preconditions are required either way; only the enforcement layer is optional. Never narrate the checks in chat.

- Working tree on a feature branch (not `main` / `master`).
- The slice's intended changes are committed locally OR present as uncommitted changes the skill should commit.
- `gh` CLI installed and authenticated (`gh auth status` returns "Logged in").
- Repository has a remote configured (`git remote -v` returns at least `origin`).
- A `Stop` gate (`hooks/stop-gate.sh`) blocks once if this skill's PR is left unmerged when the session ends (fails open if `gh` is unavailable).

---

## Workflow

### Phase 0 — Pre-flight Safety Checks

The skill refuses to proceed past Phase 0 if any check fails. The whole point is to avoid a destructive accident on `main` or accidental push to a stale branch.

1. `git rev-parse --abbrev-ref HEAD` — capture current branch as `BRANCH`.
2. **If `BRANCH` is `main` or `master`, STOP.** Surface as `needs_human: true` with `hitl_category: destructive_operation` and message: *"Refusing to ship from main. Switch to a feature branch first."* Do not push, do not commit.
3. `git worktree list` — capture worktree state as `WORKTREE_PATH` (the path matching the current working directory) and `IS_WORKTREE` (`true` if cwd is not the main worktree).
4. `gh pr list --state merged --limit 1 --base main --json headRefName,number,mergedAt` — capture the most recently merged PR. If `BRANCH` matches its `headRefName` (an already-shipped branch was reused without renaming), STOP and surface as `needs_human: true` with `hitl_category: destructive_operation`. Ask whether to rename or proceed.
5. `gh pr list --state open --head "$BRANCH" --json number,url --jq '.[0]'` — check whether an open PR for this branch already exists. If yes, capture its number and URL as `EXISTING_PR_NUMBER` / `EXISTING_PR_URL`. The skill will reuse it (push new commits, watch CI on the existing PR) rather than create a duplicate.
6. `gh auth status` — confirm gh is authenticated. If not, surface as `external_credentials` HITL and stop.

### Phase 1 — Commit + Push

1. `git status --short` — if there are uncommitted changes, surface them to the user and ask:
   - "Stage and commit these changes with a generated conventional message? (yes / let me write the message / cancel)"
   - **Always provide a recommended answer in available options.** Default recommendation: yes if changes look like the in-scope slice; "let me write" if the diff includes unexpected files.
   - On `yes`: stage all changes, derive a conventional commit type from the diff (`feat:` for new functionality, `fix:` for bug fix, `chore:` for infra/config-only, `docs:` for doc-only). Use a one-line subject summarizing the slice plus a short body listing the touched files grouped by package/app. **If the slice touched UI** and `/sell-slice` produced a closing-narrative paragraph (one paragraph: what was built · why this shape · what was left out · what reviewers should pay attention to), include it verbatim in the commit body before the file list. `gh pr create --fill` lifts the commit body into the PR description, so this paragraph carries the design story into the PR without a separate step.
   - On `let me write`: prompt for the message.
   - On `cancel`: stop here. Working tree unchanged.
2. `git push origin "$BRANCH"` — push to remote. If the remote rejects (non-fast-forward, etc.), STOP and surface as `destructive_operation` HITL — never auto force-push.

### Phase 2 — Open PR (or Reuse Existing)

1. **If `EXISTING_PR_NUMBER` from Phase 0 is set**, skip to Phase 3 — the existing PR already tracks this branch and the new push triggered fresh CI.
2. **Otherwise**, open the PR:
   - `gh pr create --base main --head "$BRANCH" --fill` — uses the latest commit's subject + body as PR title/body. The user can edit on GitHub later.
   - Capture the returned URL as `PR_URL` and the number as `PR_NUMBER`.
3. Output the PR URL to the user immediately so they can open it in a browser if they want to skim.

### Phase 3 — Watch CI

`gh pr checks "$PR_NUMBER" --watch` blocks until every check finishes. Capture the exit code:

- **Exit 0** → all checks passed. Continue to Phase 4.
- **Non-zero** → at least one check failed. Capture the output (`gh pr checks "$PR_NUMBER"`) and proceed to Phase 3a — the auto-fix loop.

The skill caps total CI watch time at **30 minutes per attempt**. If `--watch` does not return within 30 minutes (e.g. self-hosted runner is hung), surface as `external_credentials` HITL.

#### Phase 3a — CI Fix Loop (on red)

Loop counter starts at 1. Cap at **3 attempts**.

1. Capture the failed check rollup: `gh pr checks "$PR_NUMBER" --json name,state,link,workflow`.
2. For each failed check, retrieve logs:
   - `gh run view <run-id> --log-failed` for workflow runs, OR
   - `gh pr view "$PR_NUMBER" --comments` for non-Actions checks (e.g. external services posting back).
3. Read [agents/ci-fix-attempter.md](agents/ci-fix-attempter.md) and dispatch it. Pass:
   - `PR_NUMBER`, `PR_URL`
   - The failed-check rollup
   - Truncated log excerpts (last 200 lines per failed job) — let the agent ask for more on demand
   - The slice diff (`git diff origin/main...HEAD`)
4. The agent stages + commits + pushes a targeted fix. Do not call `--watch` from inside the dispatch — the skill returns to Phase 3 (top) after the agent's commit lands and re-invokes `gh pr checks --watch` against the new head SHA.
5. Increment the counter. If it would exceed 3, STOP. Surface as `creative_direction` HITL with the full failure history so the user can decide whether to debug manually, retry CI, or close the PR.

The 3-attempt cap is a hard rule. Three identical-cause failures in a row signal a structural problem (flaky test, missing secret, infra outage) that needs human judgment.

### Phase 4 — Merge Authorization Gate

CI is green. Stop and prompt the user:

> "CI is green on PR `<PR_URL>`. Approve merge?"
>
> Options (always include a recommended answer):
> 1. **Approve and merge now** (recommended if you've already reviewed) — the skill runs `gh pr merge --squash` (or the project's configured strategy) and proceeds to Phase 5.
> 2. **Hold — keep the PR open for manual review** — the skill exits, leaving the PR open. You merge via the GitHub UI when ready, then re-run `/box-it-up --resume` to do cleanup.
> 3. **Cancel — leave the PR open and stop** — the skill exits without merging.

Default merge strategy is `--squash`. Honor the project's configured default if `gh repo view --json mergeCommitAllowed,squashMergeAllowed,rebaseMergeAllowed` reports a more restrictive setting. Never force-merge a PR with non-required failing checks unless the user explicitly authorizes via the HITL prompt.

### Phase 5 — Post-merge Cleanup

Only runs after the PR is merged (either by this skill in Phase 4 option 1, or by the user manually before invoking `/box-it-up --resume`).

1. `gh pr view "$PR_NUMBER" --json state` — confirm state is `MERGED`. If not, STOP. Don't pull or delete branches based on a falsely-assumed merge.
2. `git checkout main` — if there are local uncommitted changes that would be overwritten, STOP and surface as `destructive_operation` HITL. Never auto-stash.
3. `git pull --ff-only origin main` — fast-forward only. If this fails (history diverged), STOP and surface as `destructive_operation` HITL.
4. Confirm the PR's merge commit is now in local main: `git log --oneline | grep -q "$PR_NUMBER\|<merge sha>"`. If absent, STOP and surface — something's odd.
5. `git branch -d "$BRANCH"` — delete local branch (safe delete; refuses if unmerged commits exist, which is what we want).
6. `git push origin --delete "$BRANCH"` — delete remote branch. If GitHub auto-deleted on merge, this returns "remote ref does not exist" — that's fine; record it but don't fail.
7. **If `IS_WORKTREE` from Phase 0 was true:**
   - `cd <main-worktree-path>` so we're not deleting our own cwd
   - `git worktree remove "$WORKTREE_PATH"` — remove the worktree directory
   - `git worktree prune` — clear stale metadata
8. `git status --short` — must be empty. `git rev-parse --abbrev-ref HEAD` — must be `main`. `git status -uno` — confirm fully synced with remote.

### Phase 6 — Final Report

Surface to the user:
- PR URL + merge commit SHA
- Branch name (now deleted) + worktree path (if used, now removed)
- Total CI attempts (1 if green on first run; up to 3 if the fix loop ran)
- ci-fix-attempter dispatch count + per-attempt summary if applicable
- Final state: "On main, clean tree, fully synced with origin/main."

---

## HITL Handling

The skill calls `ask_user_input_v0` directly at the Phase 1 commit prompt and the Phase 4 merge-authorization prompt — these are the two checkpoints where the user must answer.

For sub-agent failures (e.g. ci-fix-attempter returns `needs_human: true`), the skill bubbles the structured fields up via its own return contract — it does not retry indefinitely.

HITL categories the skill produces:
- `destructive_operation` — about to push from main, force-push detected, merge-conflict pull, branch-reuse without rename
- `external_credentials` — `gh` not authenticated, CI watch timeout (likely runner / secrets issue)
- `creative_direction` — ci-fix-attempter exhausted 3 attempts; user decides whether to debug, retry, or close the PR
- `prd_ambiguity` — a precondition that requires the user to tell the skill how to interpret state

---

## Hard Constraints

- **Never ship from `main` / `master`.** Phase 0 step 2 is a stop-everything check.
- **Never force-push.** If `git push` is rejected for non-fast-forward, STOP. The user resolves on a fresh branch.
- **Never auto-merge a PR with failing required checks.** Phase 4 only runs when CI is green on the latest head SHA.
- **Never `git stash` on the user's behalf.** If `git checkout main` would overwrite uncommitted changes, STOP.
- **Never auto-resolve merge conflicts during cleanup pull.** `--ff-only` fails fast; the user resolves.
- **Cap the CI fix loop at 3 attempts.** Beyond that → HITL `creative_direction`. No "one more try."
- **Cap CI watch at 30 minutes per attempt.** Beyond that → HITL `external_credentials`.
- **Reuse existing PRs.** If an open PR already tracks the branch, push new commits and watch its CI; never create a duplicate.
- **Subagent prompts live in `./agents/*.md`.** This SKILL.md is workflow only — never inline subagent prompts here.
- **Always provide a recommended answer in available options** at every elicitation point.

---

## Triggers

Follow this skill whenever the user:

- runs `/box-it-up`
- says "ship the pr", "submit the pr", "open and merge the pr", "ship this branch", "ship this slice"
- has finished a `/sell-slice` or `/special-order` invocation, reviewed the locally-committed slice, and is ready to push

If the working tree is on `main` with no feature branch in sight, redirect to `/sell-slice` or `/special-order` first.

If the user's intent is "create the PR but pause before merging for code review," they should pick option 2 (Hold) at the Phase 4 gate.

---

## Completion Checklist

Walk this at the end of every run. Do not report shipped until every box is `[x]`.

### 1. Pre-flight passed

[ ] Current branch confirmed not `main` / `master`.
[ ] Worktree state captured (path + IS_WORKTREE flag).
[ ] No accidental reuse of a recently-merged branch.
[ ] `gh` authenticated.

### 2. PR open

[ ] Branch pushed to `origin`.
[ ] PR open against `main` (either newly created or reused existing).
[ ] PR URL surfaced to the user.

### 3. CI green on the merged head SHA

[ ] `gh pr checks <pr> --watch` returned exit 0.
[ ] If the auto-fix loop ran, the final attempt cleared green; ci-fix-attempter dispatch history captured in the final report.
[ ] No required check skipped or pending.

### 4. Merge authorized + completed

[ ] Phase 4 user prompt surfaced and answered.
[ ] PR state is `MERGED` per `gh pr view`.

### 5. Branch + worktree cleanup

[ ] On `main` locally.
[ ] `git pull --ff-only origin main` succeeded.
[ ] Local feature branch deleted (`git branch -d`).
[ ] Remote feature branch deleted (or already auto-deleted by GitHub).
[ ] If a worktree was used: removed via `git worktree remove` and pruned via `git worktree prune`.
[ ] `git status --short` empty; `git status -uno` confirms fully synced with `origin/main`.

### 6. Final report emitted

[ ] User received the report (PR URL, merge SHA, attempt counts, final state).

---

## Sub-agent return contract

When `/box-it-up` is invoked as a sub-skill (e.g. by `/run-the-day` after a stage finishes):

```yaml
status: complete | failed | needs_human
summary: <one paragraph — branch name, PR URL + number, CI attempt count, merge SHA, cleanup state>
artifacts:
  - <pr url>
  - <merge commit sha>
needs_human: false | true
hitl_category: null | "prd_ambiguity" | "external_credentials" | "destructive_operation" | "creative_direction"
hitl_question: null | "<plain-language question>"
hitl_context: null | "<what triggered this>"
```
