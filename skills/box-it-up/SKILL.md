---
name: box-it-up
description: Box the pie and hand it across the counter - per slice, commit + push only (no PR, CI stays quiet); at the pie boundary, open one PR, watch CI once (auto-fix on red), merge on approval preserving every slice commit, sync main, delete the branch, remove the pie worktree. Opt-in merge-per-slice mode (--merge-slice, run internally by the conductor) opens, CI-checks and merges one PR per slice with a merge commit instead.
user-invocable: true
triggers: ["/bytheslice:box-it-up", "/box-it-up", "box up the pie", "box up the slice", "hand it over", "close out the pie", "/bytheslice:ship-pr", "/ship-pr", "ship the pr", "submit the pr", "open and merge the pr", "ship this branch", "ship this pie"]
---
<!-- skills/box-it-up/SKILL.md -->
<!-- Standalone closeout skill, re-scoped pie-level for v5 (spec §1.10). Pizza-shop framing: the pie cooled slice by slice - box it and hand it over. TWO call shapes: (1) per-slice, invoked repeatedly by /sell-pie's loop after each slice → commit + push only, no PR opened so CI does not fire; (2) pie-completion, invoked once when every slice in the active Pie is [x] → open one PR "Pie N", CI runs once, HITL review, merge PRESERVING per-slice commits (rebase/merge-commit, never squash), sync main --ff-only, delete branch, remove the pie worktree. Universal closeout safety preserved: a hand-rolled branch with no checklist still ships through the pie-completion path (no pie-status flip, project-default merge strategy). Decoupled from /sell-pie and /sell-slice so the operator can review / UAT before the boundary PR. -->

# /box-it-up

In v5 a **Pie** (a coherent chapter of 3-8 slices) is the unit of PR, CI, and review. `/box-it-up` carries both halves of the pie's git lifecycle:

- **Per slice** - `/sell-pie`'s loop calls `/box-it-up --slice` after each slice clears its gates. The skill commits the slice on the pie branch and pushes. **No PR is opened, so CI does not fire** - per-slice pushes stay cheap.
- **At the pie boundary** - when every slice in the active Pie is `[x]`, `/box-it-up` opens **one** PR `Pie N: <name>`, lets CI run **once**, gets your merge approval, merges **preserving every per-slice commit** (rebase or merge-commit, never squash), syncs `main` fast-forward-only, deletes the branch, and **removes the pie worktree**.
- **Merge per slice (opt-in)** - when `delivery.mode` resolves to `merge-per-slice` (an explicit autonomous-delivery run instruction, or the config), the conductor runs `/box-it-up --merge-slice` internally after each slice: one PR `Slice N.M: <name>`, CI, up to 3 fix rounds, merge on green with a merge commit, cleanup from the primary checkout. No per-slice merge approval; the operator gets one notice when the pie finishes. The two bullets above describe the default (`pie-pr`) mode.

It is intentionally a **separate** skill so you can review the whole pie locally, run a manual visual UAT, or rebase against fresh main before deciding to ship the boundary PR. The closeout path is **universal** - safe to run on a hand-rolled branch that never touched the ByTheSlice delivery loop. Pre-flight checks and the merge/cleanup pattern do not assume a checklist or a pie.

---

## Mode detection

`/box-it-up` is **always standalone** and operates on whatever feature branch is currently checked out (in `slice-merge` mode, the slice branch in the slice worktree the conductor names). It resolves one of four modes before doing anything:

| Mode | How it's detected | What it does |
|------|-------------------|--------------|
| **per-slice** | Invoked with `--slice` (how `/sell-pie`'s loop calls it), or the operator explicitly asks to "box up the slice" mid-pie. | **Phase 1 only** - commit the slice on the pie branch + push. **No PR, no CI watch, no merge, no cleanup.** Returns immediately so the loop continues to the next slice. |
| **pie-completion** | Default. A master checklist exists, the current branch matches a `pie-<n>-<scope>` row, and **every** `### Slice N.M` under that `## Pie N` is `[x]`. Also the shape `/sell-pie` hands off at the boundary. | **Full closeout** - Phases 0 → 6: open one PR `Pie N`, CI once, HITL merge gate, merge preserving slice commits, sync main, delete branch, remove worktree, flip the pie's checklist status. |
| **universal** (hand-rolled) | No master checklist, or the branch doesn't map to a pie row. | **Same closeout as pie-completion** (Phases 0 → 6) minus the checklist-status flip, and merge strategy falls back to the project default. The universal-closeout safety net - never assumes ByTheSlice ran. |
| **slice-merge** (merge per slice) | Invoked with `--merge-slice` by the `/sell-pie` or `/sell-slice` conductor when `delivery.mode` resolves to `merge-per-slice` and the pie is not `review: continuous`. Always an **internal** invocation: the conductor sits on `main` between slices by design and follows this skill's phases itself rather than typing the command, so the on-`main` precondition question below does not apply to it. | **One slice, one PR** - see "Merge-per-slice closeout" below: PR `Slice N.M: <name>`, CI, up to 3 `ci-fix-attempter` rounds, merge on green with a merge commit (no human merge gate), cleanup from the primary checkout. |

**Refusal guards:**
- In **per-slice** mode, if the active Pie still has unfinished slices the skill must NOT try to open a PR - that is correct, expected mid-pie behavior, not an error.
- In **pie-completion** mode, if the master checklist shows the active Pie still has unchecked slices (`### Slice N.M` is `[ ]`), STOP and surface as `needs_human: true` with `hitl_category: prd_ambiguity`: *"Pie N still has unfinished slices - finish them via /sell-pie before boxing the pie, or confirm you want to ship a partial pie."* Never silently ship an incomplete pie. A slice whose `**Status:**` reads `waiting until <YYYY-MM-DD>: <criterion>` is unfinished too: refuse with *"Pie N is waiting on Slice N.M until <YYYY-MM-DD> (<criterion>). Re-run /sell-pie on or after that date; the boundary PR opens once it closes."* No HITL is needed for a waiting slice, since the date is the only blocker; set `status: needs_human` only if the operator asked to ship anyway.

If a master checklist exists and the branch maps to a pie row, `/box-it-up` flips that **Pie's** status from `In Progress` to `Completed` and commits the flip **on the pie branch before the PR opens** (Phase 1 step 4), so the status reaches `main` with the merge and never as an uncommitted edit on `main`. That is the only sequential-flavored behavior - best-effort enhancement, never a precondition.

## Subagent Roster

| Phase | Agent file | Model | Effort | Mode |
|-------|-----------|-------|--------|------|
| 3 (on CI fail, pie-completion only) | [agents/ci-fix-attempter.md](agents/ci-fix-attempter.md) | sonnet | high | write |

CI watching itself is inline (`gh pr checks <pr> --watch` blocks until checks settle). No separate watcher subagent. **Per-slice mode dispatches no subagents** - there is no PR and therefore no CI to fix.

---

## Inputs and Preconditions

> This skill checks its own preconditions inline at the start, via tools (current branch, `gh auth status` when the mode needs PR work). If one fails, raise the problem to the operator as a question with a recommended next step, never a refusal. On `main` / `master`, say so and ask how to proceed (usually: switch to the pie branch or its worktree); the merge-per-slice closeout (`--merge-slice`) runs from `main` by design, so this check is skipped there. Never narrate passing checks in chat. No ByTheSlice hook blocks a prompt.

- Working tree on a feature branch (not `main` / `master`) - for a v5 pie this is `pie-<n>-<scope>`.
- **Per-slice mode:** the slice's changes are committed locally OR present as uncommitted changes the skill should commit. `gh` is **not** required (no PR work).
- **Pie-completion / universal mode:** `gh` CLI installed and authenticated (`gh auth status` returns "Logged in"); the repository has a remote (`git remote -v` returns at least `origin`).
- One **worktree per pie** (default mode) - created upstream by `/sell-pie` when the pie branch is cut, removed here at the boundary. In `slice-merge` mode it is one worktree per slice, created by the conductor and removed here after that slice merges. `/box-it-up` never *creates* a worktree; it only removes one.
- **Slice-merge mode:** `gh` authenticated, and the repo allows merge commits (`gh repo view --json mergeCommitAllowed`).

---

## Workflow

> **Per-slice mode runs Phase 1 only, then returns.** Phases 0 and 2-6 are pie-completion / universal closeout. `slice-merge` mode runs Phases 0 → 6 with the overrides in "Merge-per-slice closeout" below. The phase numbering is shared so the commit logic is defined once.

### Phase 0 - Pre-flight Safety Checks *(pie-completion / universal)*

The skill refuses to proceed past Phase 0 if any check fails. The point is to avoid a destructive accident on `main` or an accidental push to a stale branch.

1. `git rev-parse --abbrev-ref HEAD` - capture current branch as `BRANCH`.
2. **If `BRANCH` is `main` or `master`, STOP.** Surface as `needs_human: true` with `hitl_category: destructive_operation` and message: *"Refusing to ship from main. Switch to a pie / feature branch first."* Do not push, do not commit.
3. `git worktree list` - capture worktree state as `WORKTREE_PATH` (the path matching the current working directory) and `IS_WORKTREE` (`true` if cwd is not the main worktree). For a v5 pie this is the pie worktree slated for removal in Phase 5.
4. `gh pr list --state merged --limit 1 --base main --json headRefName,number,mergedAt` - capture the most recently merged PR. If `BRANCH` matches its `headRefName` (an already-shipped pie branch reused without renaming), STOP and surface as `needs_human: true` with `hitl_category: destructive_operation`. Ask whether to rename or proceed.
5. `gh pr list --state open --head "$BRANCH" --json number,url --jq '.[0]'` - check whether an open PR for this branch already exists. If yes, capture its number and URL as `EXISTING_PR_NUMBER` / `EXISTING_PR_URL`. The skill reuses it (watch CI on the existing PR) rather than create a duplicate. Because per-slice pushes never open a PR, the first boundary run normally finds none.
6. `gh auth status` - confirm gh is authenticated. If not, surface as `external_credentials` HITL and stop.
7. **Pie-completeness check (pie-completion mode only):** confirm every `### Slice N.M` under the active `## Pie N` in `docs/plans/00_master_checklist.md` is `[x]`. If any is `[ ]`, STOP per the Mode-detection refusal guard (`prd_ambiguity`, or the waiting-slice refusal when its status reads `waiting until <date>`).

### Phase 1 - Commit + Push *(both modes; the per-slice entry point)*

1. `git status --short` - if there are uncommitted changes, handle them per the **batched-approvals** rule: when a conductor invoked this skill (`--slice`, `--merge-slice`, or the `/sell-pie` boundary handoff) and every changed path came from agents' `files_changed` or the checklist, commit without asking (the conductor already owns those paths). Ask only when something is unexpected, and then put this question in **one batch** with every other approval already known at this point (for example a squash-only repo from the Phase 4 strategy check, run early), one decision per question, each with a recommended answer. The Phase 4 merge gate needs CI's result, so it is its own later batch. The commit question:
   - "Stage and commit these changes? (yes / let me write the message / cancel)"
   - **Always provide a recommended answer in the available options.** Default recommendation: yes if the diff looks like the in-scope slice; "let me write" if it includes unexpected files.
   - On `yes`: stage selectively, never `git add -A` or `git add .`. Stage only the paths the conductor recorded from agents' `files_changed` and the checklist; anything else is an unexpected file, so recommend "let me write" and list it. Then derive the commit message **by mode**:
     - **Per-slice mode** - the slice's task commits (`feat(pie-N): N.M task K <task name>`) are already pushed. This is the slice's **final commit**, using the v5 slice commit convention: **`feat(pie-N): N.M <slice name>`** (swap `feat` for `fix`/`chore`/`docs` when the diff is purely a fix / infra-config / docs). One-line subject; short body listing touched files grouped by package/app. **If the slice touched UI** and `/sell-slice`/`/sell-pie` produced a closing-narrative paragraph (one paragraph: what was built · why this shape · what was left out · what reviewers should pay attention to), include it verbatim in the commit body before the file list. These task and slice commit messages are what the boundary PR preserves - they become the PR's commit-by-commit story, so keep each one self-describing. After the push, `git status --short` must be empty: the slice may not leave an untracked or modified file it created.
     - **Pie-completion / universal mode** - only reached here when the boundary run finds straggler uncommitted changes (most slices are already committed by the per-slice runs). Derive a conventional type from the diff (`feat:`/`fix:`/`chore:`/`docs:`) with a one-line subject and a file-list body.
   - On `let me write`: prompt for the message.
   - On `cancel`: stop here. Working tree unchanged.
2. `git push origin "$BRANCH"` - push to the pie branch. If the remote rejects (non-fast-forward, etc.), STOP and surface as `destructive_operation` HITL - never auto force-push.
3. **Per-slice mode ends here.** Return the per-slice contract (`status: complete`, the commit SHA + branch). **Do not open a PR, do not watch CI, do not merge.** The `/sell-pie` loop advances to the next slice; CI fires only at the pie boundary.
4. **Flip the Pie's checklist status (pie-completion mode only), before the PR opens.** In `docs/plans/00_master_checklist.md`, set the active `## Pie N` status from `In Progress` to `Completed`, commit it on the pie branch as `chore(pie-N): mark Pie N completed`, and push. The flip rides into `main` with the merge, so `main` never carries an uncommitted checklist edit (the pre-commit guard blocks commits on `main`, and Phase 5 requires a clean tree). If the operator holds or cancels the PR, the flip stays on the unmerged branch only. Skip silently in universal mode (no checklist / no pie row).

### Phase 2 - Open the Pie PR (or Reuse Existing) *(pie-completion / universal)*

1. **If `EXISTING_PR_NUMBER` from Phase 0 is set**, skip to Phase 3 - the existing PR already tracks this branch.
2. **Otherwise**, open one PR for the whole pie:
   - **Title:** for a pie, `Pie N: <name>` (lift `N` and the name from the `## Pie N - <name>` checklist header). For a hand-rolled branch, fall back to `gh pr create --fill` (latest commit subject).
   - `gh pr create --base main --head "$BRANCH" --fill` - the `--fill` body lifts the accumulated slice commit subjects/bodies, so the per-slice closing-narrative paragraphs carry the design story into the PR description without a separate step. For a named pie, set the title explicitly (`--title "Pie N: <name>"`) and keep `--fill` for the body.
   - Capture the returned URL as `PR_URL` and the number as `PR_NUMBER`.
3. Output the PR URL to the user immediately so they can open it in a browser if they want to skim the pie.

### Phase 3 - Watch CI *(pie-completion / universal - CI's single run for the pie)*

In the default `pie-pr` mode this is the **one** time CI fires for the entire pie - per-slice pushes opened no PR. In `slice-merge` mode it is the slice PR's CI run. `gh pr checks "$PR_NUMBER" --watch` blocks until every check finishes. Capture the exit code:

- **Exit 0** → all checks passed. Continue to Phase 4.
- **Non-zero** → at least one check failed. Capture the output (`gh pr checks "$PR_NUMBER"`) and proceed to Phase 3a - the auto-fix loop.

The skill caps total CI watch time at **30 minutes per attempt**. If `--watch` does not return within 30 minutes (e.g. self-hosted runner hung), surface as `external_credentials` HITL.

#### Phase 3a - CI Fix Loop (on red)

Loop counter starts at 1. Cap at **3 attempts**.

1. Capture the failed-check rollup: `gh pr checks "$PR_NUMBER" --json name,state,link,workflow`.
2. For each failed check, retrieve logs:
   - `gh run view <run-id> --log-failed` for workflow runs, OR
   - `gh pr view "$PR_NUMBER" --comments` for non-Actions checks (e.g. external services posting back).
3. Dispatch `bytheslice:ci-fix-attempter` ([definition](agents/ci-fix-attempter.md); fallback on hosts without plugin agents: Read the file and dispatch it per [`loop-workflow-fallback-pattern.md`](../cook-pizzas/references/loop-workflow-fallback-pattern.md) "Agent shape on the fallback path": its frontmatter goes first as a header (model tier and effort, the normalized tool allowlist, the read-only line for an agent without write tools, the no-git-writes line), then its body, then the inputs; log one self-check line per dispatch in the run log). Pass:
   - `PR_NUMBER`, `PR_URL`, `BRANCH`
   - The failed-check rollup
   - Truncated log excerpts (last 200 lines per failed job) - let the agent ask for more on demand
   - The pie diff (`git diff origin/main...HEAD`)
   - The attempt number
4. The agent makes no git writes: it returns `files_changed` and a proposed commit subject and body. **This skill** stages exactly those paths (`git add -- <paths>`), commits with the proposed message, and pushes to `origin "$BRANCH"` (never forced; a rejected push is a `destructive_operation` HITL). Do not call `--watch` from inside the dispatch - the skill returns to Phase 3 (top) after its push lands and re-invokes `gh pr checks --watch` against the new head SHA.
5. Increment the counter. If it would exceed 3, STOP. Surface as `creative_direction` HITL with the full failure history so the user can decide whether to debug manually, retry CI, or close the PR.

The 3-attempt cap is a hard rule and is **not overridable by the run instruction**: "continue until CI is green", "never stop", "fully automated" or an autonomous-delivery instruction do not add rounds. Only the operator's explicit reply at this HITL can grant more. The CI counter is per PR and separate from the conductor's 3 local fix loops per slice; neither borrows from the other. Three identical-cause failures in a row signal a structural problem (flaky test, missing secret, infra outage) that needs human judgment.

### Phase 4 - Merge Authorization Gate *(pie-completion / universal - the kept pie-boundary HITL)*

CI is green. **Stop and prompt the user** (this is the §1.8 pie-boundary checkpoint - in the default `pie-pr` mode, the one HITL the loop never auto-approves; `slice-merge` mode has no per-slice merge gate, see "Merge-per-slice closeout"):

> "CI is green on PR `<PR_URL>` (Pie N). Approve merge?"
>
> Options (always include a recommended answer):
> 1. **Approve and merge now** (recommended if you've already reviewed the pie) - the skill merges **preserving every per-slice commit** (see strategy below) and proceeds to Phase 5.
> 2. **Hold - keep the PR open for manual review** - the skill exits, leaving the PR open. You merge via the GitHub UI when ready, then re-run `/box-it-up --resume` to do cleanup.
> 3. **Cancel - leave the PR open and stop** - the skill exits without merging.

**Merge strategy - preserve per-slice commits (never squash).** The whole point of the per-slice commits is that they survive the merge as the pie's history. These rules - merge preserving per-slice commits (never squash), `--ff-only` sync, `git worktree remove`/`prune` cleanup, and the boundary-PR body shape - come from [`../cook-pizzas/references/git-worktree-standard.md`](../cook-pizzas/references/git-worktree-standard.md) (Phase 3 + Invariants §5 + the PR template §6). Resolve the strategy in this order:

1. **Prefer rebase-merge** for a pie PR (`gh pr merge "$PR_NUMBER" --rebase`; a slice PR in `slice-merge` mode always uses a merge commit instead) - replays each slice commit onto main, linear history, every `feat(pie-N): N.M` preserved.
2. If rebase is disallowed (`gh repo view --json rebaseMergeAllowed` is false), use a **merge commit** (`gh pr merge "$PR_NUMBER" --merge`) - also preserves the individual commits under a merge node.
3. **Never `--squash`** for a pie - squashing collapses the per-slice commits into one and destroys the boundary contract. If a project's settings allow *only* squash (`squashMergeAllowed` true, both others false), STOP and surface as `needs_human: true` with `hitl_category: prd_ambiguity`: *"This repo only permits squash merges, which would collapse the pie's per-slice commits. Enable rebase or merge-commit merges, or confirm you accept a squash for this pie."* For a **hand-rolled** branch with no per-slice contract, the project default (including squash) is acceptable - the preserve-commits rule binds pies, not arbitrary branches.

Never force-merge a PR with non-required failing checks unless the user explicitly authorizes via the HITL prompt.

### Phase 5 - Post-merge Cleanup *(pie-completion / universal)*

Only runs after the PR is merged (by this skill in Phase 4 option 1, or by the user manually before `/box-it-up --resume`).

1. `gh pr view "$PR_NUMBER" --json state,number,mergedAt` - confirm state is `MERGED`. If not, STOP. Don't pull or delete branches on a falsely-assumed merge.
   - **Pie-completion mode only, before cleanup:** record the confirmed merge for the local kitchen. Pipe a fresh successful `gh pr view "$PR_NUMBER" --json state,number,mergedAt` response to `node "<this-skill-directory>/record-kitchen-merge.js" --mode pie --pie "<active-pie-number>" --project "${CLAUDE_PROJECT_DIR:-$PWD}"`. The helper validates `MERGED`, a PR number and a merge timestamp, then atomically replaces the single bounded `.claude/.bytheslice-state/kitchen/merged-pie.json` record with only version, pie, PR number and merge time. Use this skill's installed absolute directory for the helper path. If the read or write fails, report missing kitchen evidence; do not invent success.
   - **Slice-merge mode:** run the same writer exactly once per pie, after the pie's **last** slice PR merges, piping that PR's `gh pr view` response with `--mode pie --pie "<active-pie-number>"`. Never per slice.
   - Never run this writer in `--slice` or universal mode, for any slice-merge slice but the pie's last, before merge confirmation, or from skill/Stop log events. A skill finish cannot prove a PR merged. The kitchen reader makes no network calls and ignores malformed, stale, future or wrong-pie records.
**Every step after the merge check runs from the primary checkout, never from the pie worktree.** `main` is checked out in the primary checkout, so `git checkout main` inside the pie worktree fails, and git refuses to delete a branch a worktree still holds. Resolve the primary checkout once: `PRIMARY=$(git worktree list --porcelain | sed -n '1s/^worktree //p')` (the first entry is always the main working tree). The Pie's checklist flip is already committed on the branch (Phase 1 step 4), so nothing here edits a tracked file.

2. `cd "$PRIMARY"` so the shell is not inside the worktree about to be removed. If `IS_WORKTREE` was false (the branch was checked out in the primary checkout itself), run `git -C "$PRIMARY" checkout main`; if that would overwrite uncommitted changes, STOP and surface as `destructive_operation` HITL. Then confirm `git -C "$PRIMARY" rev-parse --abbrev-ref HEAD` is `main` and `git -C "$PRIMARY" status --short` is empty. If the primary checkout sits on another branch or is dirty, STOP (`destructive_operation`): never switch, stash or overwrite a checkout the operator may be using.
3. `git -C "$PRIMARY" pull --ff-only origin main` - fast-forward only. If this fails (history diverged), STOP and surface as `destructive_operation` HITL.
4. Confirm the PR's merge result is now in local main: `git -C "$PRIMARY" log --oneline | grep -q "$PR_NUMBER\|<merge sha>"` (for a rebase-merge, confirm the slice commits landed). If absent, STOP and surface - something's odd.
5. **Remove the pie worktree first (if `IS_WORKTREE` from Phase 0 was true):** `git -C "$PRIMARY" worktree remove "$WORKTREE_PATH"` (never `rm -rf`). This must precede the branch delete: git refuses to delete a branch that a worktree still has checked out.
6. `git -C "$PRIMARY" branch -d "$BRANCH"` - delete the local pie branch (safe delete; refuses if unmerged commits exist, which is what we want). After a rebase-merge the commits on `main` carry new SHAs, so `-d` passes only while the branch's upstream ref still exists; if it refuses, confirm step 4 found every slice commit subject on `main` and surface `destructive_operation` before any `-D`.
7. `git push origin --delete "$BRANCH"` - delete the remote branch. If GitHub auto-deleted it on merge (or `gh pr merge --delete-branch` did), this returns "remote ref does not exist" - fine; record it but don't fail. From a worktree, run `gh pr merge` without `--delete-branch`: that flag also tries to switch the local checkout to `main`, which the primary checkout holds.
8. `git -C "$PRIMARY" worktree prune` - clear stale worktree metadata.
9. `git -C "$PRIMARY" status --short` - must be empty. `git -C "$PRIMARY" rev-parse --abbrev-ref HEAD` - must be `main`. `git -C "$PRIMARY" status -uno` - confirm fully synced with remote. The pie is closed; the next pie starts in a fresh chat with a fresh worktree.

### Phase 6 - Final Report *(pie-completion / universal)*

Surface to the user:
- PR URL + merge commit SHA (+ note the merge strategy used: rebase / merge-commit)
- Pie name + branch name (now deleted) + worktree path (now removed)
- Slice and task commit count preserved on main
- Total CI attempts (1 if green on first run; up to 3 if the fix loop ran) + ci-fix-attempter dispatch count / per-attempt summary if applicable
- Final state: "On main, clean tree, fully synced with origin/main. Pie N closed - start the next pie in a fresh chat."

### Merge-per-slice closeout *(slice-merge mode, `--merge-slice`)*

Runs once per slice when `delivery.mode` resolves to `merge-per-slice`. The conductor (`/sell-pie` or `/sell-slice`) invokes it internally and passes `BRANCH` (`pie-N-sN.M-<scope>`), `WORKTREE_PATH` (the slice worktree), the slice id and name, and whether this is the pie's last slice. Phases 0 → 6 apply with these overrides:

- **Phase 0.** Run steps 1-6 against the slice worktree (`git -C "$WORKTREE_PATH" ...`). Skip step 7 (pie completeness). Add: `gh repo view --json mergeCommitAllowed --jq .mergeCommitAllowed` must print `true`. If it does not, STOP the loop with `needs_human: true`, `hitl_category: prd_ambiguity`: *"This repo disallows merge commits, which merge-per-slice delivery requires. Enable merge commits, or rerun this pie in the default one-PR-per-pie mode?"* Never fall back to squash or rebase on its own.
- **Phase 1.** The slice's work is already committed and pushed on `BRANCH`. On the pie's last slice, Phase 1 step 4 applies: flip `## Pie N` to `Completed`, commit, push, so the flip reaches `main` with this slice's merge. If any slice of the pie is still `waiting until <YYYY-MM-DD>` (calendar-gated), this is not the last slice: do not flip the pie and do not write the kitchen merge record; the slice PR that later closes the waiting slice is the pie's last.
- **Phase 2.** Title the PR `Slice N.M: <name>`: `gh pr create --base main --head "$BRANCH" --title "Slice N.M: <name>" --fill`.
- **Phase 3 / 3a.** Watch CI as usual. On red, up to **3** `ci-fix-attempter` rounds (the CI fix counter is per slice). Still red after the 3rd round: **halt the loop** with a `creative_direction` HITL carrying the failure history. Never skip the slice, never merge it red, never start the next slice.
- **Phase 4.** No human merge gate: the run instruction or `delivery.mode` already authorized autonomous delivery. On green, merge with a **merge commit**: `gh pr merge "$PR_NUMBER" --merge` (never `--squash`, never `--rebase`, never `--delete-branch` from the worktree).
- **Phase 5.** Identical cleanup from the primary checkout: `git -C "$PRIMARY" pull --ff-only origin main`, `git -C "$PRIMARY" worktree remove "$WORKTREE_PATH"`, `git -C "$PRIMARY" branch -d "$BRANCH"`, `git push origin --delete "$BRANCH"`, `git -C "$PRIMARY" worktree prune`. Write the kitchen merge record only after the pie's last slice (see Phase 5 step 1). Append one line to the run log `.claude/.bytheslice-state/run-log.md` (gitignored): slice id, PR URL, merge commit SHA, merge time.
- **Phase 6.** Return a short per-slice result to the conductor (PR URL, merge SHA, CI rounds). The conductor cuts the next slice from the freshly synced `main`; on the pie's last slice it sends the operator **one** notice listing every slice PR from the run log.

---

## HITL Handling

**Agents and this skill never call `ask_user_input_v0`.** At every elicitation point - the Phase 1 commit prompt and the Phase 4 merge-authorization gate - the skill **sets `needs_human: true` plus the `hitl_*` fields in its return contract** and lets the invoking orchestrator (`/sell-pie`'s loop, or the operator's session) surface the prompt. The phase descriptions above show the question text; the skill emits it as `hitl_question`, not as a direct tool call.

For sub-agent failures (e.g. `ci-fix-attempter` returns `needs_human: true`), the skill bubbles the structured fields up via its own return contract - it does not retry indefinitely.

HITL categories the skill produces:
- `destructive_operation` - about to push from main, force-push detected, merge-conflict pull, branch-reuse without rename, would-overwrite uncommitted changes on checkout.
- `external_credentials` - `gh` not authenticated, CI watch timeout (likely runner / secrets issue).
- `creative_direction` - ci-fix-attempter exhausted 3 attempts; user decides whether to debug, retry, or close the PR. In `slice-merge` mode this halts the delivery loop.
- `prd_ambiguity` - boxing a pie with unfinished slices; a squash-only repo that would collapse per-slice commits; a repo that disallows merge commits in `slice-merge` mode; a precondition that needs the user to tell the skill how to interpret state.

---

## Hard Constraints

- **Per-slice mode opens no PR and watches no CI.** Commit + push only, then return. In the default `pie-pr` mode CI fires exactly **once per pie**, at the boundary, and no PR opens mid-pie. **Exception:** `slice-merge` mode (`delivery.mode: merge-per-slice`) opens, CI-checks and merges one PR per slice.
- **Preserve per-slice commits on a pie merge - never `--squash`.** Default mode: rebase-merge for the pie PR, merge-commit as fallback. `slice-merge` mode: always a merge commit; a repo that disallows merge commits is a `prd_ambiguity` HITL. A squash-only repo is a `prd_ambiguity` HITL, not a silent squash.
- **No per-slice merge approval in `slice-merge` mode; never merge red.** The slice merges only on green CI, after at most 3 `ci-fix-attempter` rounds; still red halts the loop. There is never an integration branch.
- **One worktree per pie (default) or per slice (`slice-merge`); `/box-it-up` only removes it.** The worktree is created upstream by the conductor. This skill removes it after the merge (via `git worktree remove` + `prune`, never `rm -rf`) and never creates one. The merge/cleanup rules here are the standard's - see [`../cook-pizzas/references/git-worktree-standard.md`](../cook-pizzas/references/git-worktree-standard.md) (Phase 3 + Invariants §5).
- **Never ship from `main` / `master`.** Phase 0 step 2 is a stop-everything check.
- **Never force-push.** If `git push` is rejected for non-fast-forward, STOP. The user resolves on a fresh branch.
- **Only the conductor makes git writes, `git add` included.** `ci-fix-attempter` returns `files_changed`; this skill stages those paths selectively, commits and pushes, on the registered and fallback paths alike. Never `git add -A`.
- **Never auto-merge a PR with failing required checks.** Phase 4 only runs when CI is green on the latest head SHA.
- **Never box an incomplete pie.** If any slice under the active Pie is still `[ ]`, STOP (`prd_ambiguity`).
- **Never `git stash` on the user's behalf.** If `git checkout main` would overwrite uncommitted changes, STOP.
- **Clean up from the primary checkout, in order.** Sync `main` with `git -C "$PRIMARY" pull --ff-only`, then `worktree remove`, then `branch -d`, then the remote delete, then `worktree prune`. Never check out `main` inside a worktree, and never delete a branch a worktree still holds.
- **Never edit a tracked file on `main`.** The Pie's checklist flip is committed on the pie branch before the PR opens.
- **Never auto-resolve merge conflicts during cleanup pull.** `--ff-only` fails fast; the user resolves.
- **Cap the CI fix loop at 3 attempts.** Beyond that → HITL `creative_direction`. No "one more try." No run instruction raises the cap; only the operator's explicit reply at the HITL does. Separate from the 3 local fix loops per slice.
- **Cap CI watch at 30 minutes per attempt.** Beyond that → HITL `external_credentials`.
- **Reuse existing PRs.** If an open PR already tracks the branch, watch its CI; never create a duplicate.
- **Never call `ask_user_input_v0`.** Set `needs_human` + `hitl_*` and let the orchestrator prompt.
- **Subagent prompts live in `./agents/*.md`.** This SKILL.md is workflow only - never inline subagent prompts here.
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

- [ ] Current branch confirmed not `main` / `master` (it is the pie branch).
- [ ] Slice closed with a `feat(pie-N): N.M <name>` (or fix/chore/docs) final commit on top of its pushed task commits; tree clean.
- [ ] Branch pushed to `origin`.
- [ ] No PR opened, no CI watched - returned cleanly so the loop continues.

### Slice-merge mode

- [ ] Repo allows merge commits (`mergeCommitAllowed` true), or the loop halted and asked.
- [ ] PR `Slice N.M: <name>` opened against `main`.
- [ ] CI green on the latest head SHA (at most 3 `ci-fix-attempter` rounds; still red halted the loop).
- [ ] Merged with a merge commit, no squash, no rebase.
- [ ] Cleanup ran from the primary checkout: `pull --ff-only`, `worktree remove`, `branch -d`, remote delete, `worktree prune`.
- [ ] Run-log line appended; kitchen merge record written only after the pie's last slice.

### Pie-completion / universal mode

#### 1. Pre-flight passed

- [ ] Current branch confirmed not `main` / `master`.
- [ ] Worktree state captured (path + IS_WORKTREE flag).
- [ ] No accidental reuse of a recently-merged branch.
- [ ] `gh` authenticated.
- [ ] (pie mode) Every slice under the active Pie is `[x]`.

#### 2. Pie PR open

- [ ] Any straggler changes committed; branch pushed to `origin`.
- [ ] (pie mode) Pie status flipped `In Progress` → `Completed` and committed on the pie branch before the PR opened.
- [ ] One PR open against `main` - titled `Pie N: <name>` for a pie (or reused existing).
- [ ] PR URL surfaced to the user.

#### 3. CI green on the merged head SHA

- [ ] `gh pr checks <pr> --watch` returned exit 0 (CI's single run for the pie).
- [ ] If the auto-fix loop ran, the final attempt cleared green; ci-fix-attempter dispatch history captured.
- [ ] No required check skipped or pending.

#### 4. Merge authorized + completed (preserving slice commits)

- [ ] Phase 4 user prompt surfaced (via `needs_human`/`hitl_*`) and answered.
- [ ] Merge used rebase or merge-commit - **not** squash for a pie; per-slice commits preserved on main.
- [ ] PR state is `MERGED` per `gh pr view`.

#### 5. Branch + worktree cleanup

- [ ] Cleanup ran from the primary checkout (`git -C "$PRIMARY" ...`), which is on `main`.
- [ ] `git -C "$PRIMARY" pull --ff-only origin main` succeeded.
- [ ] Pie worktree removed via `git worktree remove` (if a worktree was used), before the branch delete.
- [ ] Local pie branch deleted (`git branch -d`).
- [ ] Remote pie branch deleted (or already auto-deleted by GitHub).
- [ ] `git worktree prune` ran.
- [ ] `git status --short` empty in the primary checkout; `git status -uno` confirms fully synced with `origin/main`.

#### 6. Final report emitted

- [ ] User received the report (PR URL, merge SHA + strategy, slice-commit count, attempt counts, "Pie N closed - next pie in a fresh chat").

---

## Sub-agent return contract

`/box-it-up` returns structured fields whether it ran per-slice or boxed the whole pie (e.g. when `/sell-pie`'s loop invokes it). It never prompts the user directly - the orchestrator reads `needs_human` + `hitl_*` and surfaces any question.

```yaml
status: complete | failed | needs_human
mode: slice | slice-merge | pie | universal
summary: <one paragraph - mode; for slice: commit sha + branch; for slice-merge: slice PR URL + number, CI rounds, merge commit SHA, cleanup state; for pie: pie name, PR URL + number, CI attempt count, merge strategy + SHA, per-slice-commit count preserved, cleanup state>
artifacts:
  - <commit sha (slice mode)>
  - <pr url (slice-merge/pie/universal mode)>
  - <merge commit sha (slice-merge/pie/universal mode)>
needs_human: false | true
hitl_category: null | "prd_ambiguity" | "external_credentials" | "destructive_operation" | "creative_direction"
hitl_question: null | "<plain-language question>"
hitl_context: null | "<what triggered this>"
```
