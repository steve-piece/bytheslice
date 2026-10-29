---
name: box-it-up
description: "Box the pie and hand it across the counter - per slice, commit + push only (no PR, CI stays quiet); at the pie boundary, open one PR, watch CI once (auto-fix on red), merge on approval preserving every slice commit, sync main, delete the branch, remove the pie worktree. Opt-in merge-per-slice mode (--merge-slice, run internally by the conductor) opens, CI-checks and merges one PR per slice with a merge commit instead. Opt-in ship-once delivery (set by /pizza-party) uses --pie-local at each pie boundary (full local check, local --no-ff merge into the ship branch, no PR) and --ship once after the last pie (one PR ship branch to main, CI once, merge on green)."
user-invocable: true
triggers: ["/bytheslice:box-it-up", "/box-it-up", "box up the pie", "box up the slice", "hand it over", "close out the pie", "/bytheslice:ship-pr", "/ship-pr", "ship the pr", "submit the pr", "open and merge the pr", "ship this branch", "ship this pie"]
---
<!-- skills/box-it-up/SKILL.md -->
<!-- Standalone closeout skill, re-scoped pie-level for v5 (spec §1.10). Pizza-shop framing: the pie cooled slice by slice - box it and hand it over. TWO call shapes: (1) per-slice, invoked repeatedly by /sell-pie's loop after each slice → commit + push only, no PR opened so CI does not fire; (2) pie-completion, invoked once when every slice in the active Pie is [x] → open one PR "Pie N", CI runs once, HITL review, merge PRESERVING per-slice commits (rebase/merge-commit, never squash), sync main --ff-only, delete branch, remove the pie worktree. Universal closeout safety preserved: a hand-rolled branch with no checklist still ships through the pie-completion path (no pie-status flip, project-default merge strategy). Decoupled from /sell-pie and /sell-slice so the operator can review / UAT before the boundary PR. Ship-once delivery adds --pie-local (local check + local --no-ff merge of the pie into the ship branch) and --ship (the one ship PR to main, merged on green with no human gate). -->

# /box-it-up

In v5 a **Pie** (a coherent chapter, usually 3 to 8 slices; a small app's pie may hold 1 or 2) is the unit of PR, CI, and review. `/box-it-up` carries both halves of the pie's git lifecycle:

- **Per slice** - `/sell-pie`'s loop calls `/box-it-up --slice` after each slice clears its gates. The skill commits the slice on the pie branch and pushes. **No PR is opened, so CI does not fire** - per-slice pushes stay cheap.
- **At the pie boundary** - when every slice in the active Pie is `[x]`, `/box-it-up` opens **one** PR `Pie N: <name>`, lets CI run **once**, gets your merge approval, merges **preserving every per-slice commit** (rebase or merge-commit, never squash), syncs `main` fast-forward-only, deletes the branch, and **removes the pie worktree**.
- **Merge per slice (opt-in)** - when `delivery.mode` resolves to `merge-per-slice` (an explicit autonomous-delivery run instruction, or the config), the conductor runs `/box-it-up --merge-slice` internally after each slice: one PR `Slice N.M: <name>`, CI, up to 3 fix rounds, merge on green with a merge commit, cleanup from the primary checkout. No per-slice merge approval; the operator gets one notice when the pie finishes. The two bullets above describe the default (`pie-pr`) mode.
- **Ship once (opt-in)** - when `delivery.mode` resolves to `ship-once` (`/pizza-party` sets it), per-slice commits stay local (no push). At each pie boundary the conductor runs `/box-it-up --pie-local`: confirm every slice was verified, re-run the full local check once, merge the pie branch into the long-lived local ship branch with `git merge --no-ff`, remove the pie worktree and branch. After the last pie, `/box-it-up --ship` pushes the ship branch, opens **one** PR to `main`, watches CI once and merges on green with a merge commit. Neither step has a human merge gate: choosing ship-once authorized it.

It is intentionally a **separate** skill so you can review the whole pie locally, run a manual visual UAT, or rebase against fresh main before deciding to ship the boundary PR. The closeout path is **universal** - safe to run on a hand-rolled branch that never touched the ByTheSlice delivery loop. Pre-flight checks and the merge/cleanup pattern do not assume a checklist or a pie.

---

## Mode detection

`/box-it-up` is **always standalone** and operates on whatever feature branch is currently checked out (in `slice-merge` mode, the slice branch in the slice worktree the conductor names). It resolves one of six modes before doing anything:

| Mode | How it's detected | What it does |
|------|-------------------|--------------|
| **per-slice** | Invoked with `--slice` (how `/sell-pie`'s loop calls it), or the operator explicitly asks to "box up the slice" mid-pie. | **Phase 1 only** - commit the slice on the pie branch + push. **No PR, no CI watch, no merge, no cleanup.** Returns immediately so the loop continues to the next slice. |
| **pie-completion** | Default. A master checklist exists, the current branch matches a `pie-<n>-<scope>` row, and **every** `### Slice N.M` under that `## Pie N` is `[x]`. Also the shape `/sell-pie` hands off at the boundary. | **Full closeout** - Phases 0 → 6: open one PR `Pie N`, CI once, HITL merge gate, merge preserving slice commits, sync main, delete branch, remove worktree, flip the pie's checklist status. |
| **universal** (hand-rolled) | No master checklist, or the branch doesn't map to a pie row. | **Same closeout as pie-completion** (Phases 0 → 6) minus the checklist-status flip, and merge strategy falls back to the project default. The universal-closeout safety net - never assumes ByTheSlice ran. |
| **slice-merge** (merge per slice) | Invoked with `--merge-slice` by the `/sell-pie` or `/sell-slice` conductor when `delivery.mode` resolves to `merge-per-slice` and the pie is not `review: continuous`. Always an **internal** invocation: the conductor sits on `main` between slices by design and follows this skill's phases itself rather than typing the command, so the on-`main` precondition question below does not apply to it. | **One slice, one PR** - see "Merge-per-slice closeout" below: PR `Slice N.M: <name>`, CI, up to 3 `ci-fix-attempter` rounds, merge on green with a merge commit (no human merge gate), cleanup from the primary checkout. |
| **pie-local** (ship-once boundary) | Invoked with `--pie-local` by the `/sell-pie` conductor at the pie boundary when `delivery.mode` resolves to `ship-once`. Internal, like `--merge-slice`. | **No PR, no push, no CI** - see "Pie-local closeout" below: verified-slice check, the full local check once (up to 3 `fix-attempter` rounds), `git merge --no-ff` of the pie branch into the ship branch in the primary checkout, worktree and branch removal. |
| **ship** (ship-once finish) | Invoked with `--ship` after the last pie of a ship-once build: by `/sell-pie` in an interactive run, or by the `/pizza-party` conductor in an unattended one. Runs from the primary checkout on the ship branch. | **One ship PR** - see "Ship closeout" below: push the ship branch, PR `Ship <app>: <pies> pies, <slices> slices` with every pie's evidence, CI once, up to 3 `ci-fix-attempter` rounds, merge on green with a merge commit (no human gate), sync `main`, delete the ship branch. |

**Refusal guards:**
- In **per-slice** mode, if the active Pie still has unfinished slices the skill must NOT try to open a PR - that is correct, expected mid-pie behavior, not an error.
- In **pie-completion** mode, if the master checklist shows the active Pie still has unchecked slices (`### Slice N.M` is `[ ]`), STOP and surface as `needs_human: true` with `hitl_category: prd_ambiguity`: *"Pie N still has unfinished slices - finish them via /sell-pie before boxing the pie, or confirm you want to ship a partial pie."* Never silently ship an incomplete pie. In **pie-local** mode the same guard applies, except that an unattended run (`run.unattended: true`) treats a slice whose status reads `deferred: <reason>` as finished for this merge (its commits already left the pie branch), and a slice `waiting until <YYYY-MM-DD>` as finished too (its commits passed `slice-verifier` and merge with the pie; the row stays `[ ]`), and lists both in `blocked`. A slice whose `**Status:**` reads `waiting until <YYYY-MM-DD>: <criterion>` is unfinished too: refuse with *"Pie N is waiting on Slice N.M until <YYYY-MM-DD> (<criterion>). Re-run /sell-pie on or after that date; the boundary PR opens once it closes."* No HITL is needed for a waiting slice, since the date is the only blocker; set `status: needs_human` only if the operator asked to ship anyway.

If a master checklist exists and the branch maps to a pie row, `/box-it-up` flips that **Pie's** status from `In Progress` to `Completed` and commits the flip **on the pie branch before the PR opens** (Phase 1 step 4), so the status reaches `main` with the merge and never as an uncommitted edit on `main`. That is the only sequential-flavored behavior - best-effort enhancement, never a precondition.

## Subagent Roster

| Phase | Agent file | Model | Effort | Mode |
|-------|-----------|-------|--------|------|
| 3 (on CI fail, pie-completion / slice-merge / ship) | [agents/ci-fix-attempter.md](agents/ci-fix-attempter.md) | sonnet | high | write |
| pie-local check (on red, pie-local only) | [../sell-slice/agents/fix-attempter.md](../sell-slice/agents/fix-attempter.md) | sonnet | high | write |

CI watching itself is inline (`gh pr checks <pr> --watch` blocks until checks settle). No separate watcher subagent. **Per-slice mode dispatches no subagents** - there is no PR and therefore no CI to fix.

---

## Inputs and Preconditions

> This skill checks its own preconditions inline at the start, via tools (current branch, `gh auth status` when the mode needs PR work). If one fails, raise the problem to the operator as a question with a recommended next step, never a refusal. On `main` / `master`, say so and ask how to proceed (usually: switch to the pie branch or its worktree); the merge-per-slice closeout (`--merge-slice`) runs from `main` by design, so this check is skipped there. Never narrate passing checks in chat. No ByTheSlice hook blocks a prompt.

- Working tree on a feature branch (not `main` / `master`) - for a v5 pie this is `pie-<n>-<scope>`.
- **Per-slice mode:** the slice's changes are committed locally OR present as uncommitted changes the skill should commit. `gh` is **not** required (no PR work).
- **Pie-completion / universal mode:** `gh` CLI installed and authenticated (`gh auth status` returns "Logged in"); the repository has a remote (`git remote -v` returns at least `origin`).
- One **worktree per pie** (default mode) - created upstream by `/sell-pie` when the pie branch is cut, removed here at the boundary. In `slice-merge` mode it is one worktree per slice, created by the conductor and removed here after that slice merges. `/box-it-up` never *creates* a worktree; it only removes one.
- **Slice-merge mode:** `gh` authenticated, and the repo allows merge commits (`gh repo view --json mergeCommitAllowed`).
- **Pie-local mode:** the primary checkout is clean and on the ship branch; the pie worktree is clean. `gh` is **not** required (no PR work), and nothing is pushed.
- **Ship mode:** the primary checkout is clean and on the ship branch; `gh` authenticated (the only ship-once step that needs it); an `origin` remote; the repo allows merge commits.

---

## Workflow

At every phase boundary, if the `bts_status` tool is available call it instead of re-reading the checklist; if it is not, read the checklist as before.

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
     - **Per-slice mode** - the slice's task commits (`feat(pie-N): N.M task K <task name>`) are already pushed. This is the slice's **final commit**, using the v5 slice commit convention: **`feat(pie-N): N.M <slice name>`** (swap `feat` for `fix`/`chore`/`docs` when the diff is purely a fix / infra-config / docs). One-line subject; short body listing touched files grouped by package/app. **If the slice touched UI** and `/sell-slice`/`/sell-pie` produced a closing-narrative paragraph (one paragraph: what was built · why this shape · what was left out · what reviewers should pay attention to), include it verbatim in the commit body before the file list. These task and slice commit messages are what the boundary PR preserves - they become the PR's commit-by-commit story, so keep each one self-describing. When nothing is left to stage (the checklist is gitignored, as it is by default, and no fix patch or state file is pending), make the final commit with `git commit --allow-empty`: its subject is the slice's record in the history, and Phase 4 merges a branch holding an empty commit with a merge commit so it survives. After the push, `git status --short` must be empty: the slice may not leave an untracked or modified file it created.
     - **Pie-completion / universal mode** - only reached here when the boundary run finds straggler uncommitted changes (most slices are already committed by the per-slice runs). Derive a conventional type from the diff (`feat:`/`fix:`/`chore:`/`docs:`) with a one-line subject and a file-list body.
   - On `let me write`: prompt for the message.
   - On `cancel`: stop here. Working tree unchanged.
2. `git push origin "$BRANCH"` - push to the pie branch. If the remote rejects (non-fast-forward, etc.), STOP and surface as `destructive_operation` HITL - never auto force-push. **Ship-once:** skip the push; the pie branch stays local until `--pie-local` merges it into the ship branch, and only `--ship` pushes anything.
3. **Per-slice mode ends here.** Return the per-slice contract (`status: complete`, the commit SHA + branch). **Do not open a PR, do not watch CI, do not merge.** The `/sell-pie` loop advances to the next slice; CI fires only at the pie boundary.
4. **Flip the Pie's checklist status (pie-completion mode only), before the PR opens.** In `docs/plans/00_master_checklist.md`, set the active `## Pie N` status from `In Progress` to `Completed`, commit it on the pie branch as `chore(pie-N): mark Pie N completed`, and push. The flip rides into `main` with the merge, so `main` never carries an uncommitted checklist edit (the pre-commit guard blocks commits on `main`, and Phase 5 requires a clean tree). If the operator holds or cancels the PR, the flip stays on the unmerged branch only. When the checklist is gitignored (`git check-ignore -q docs/plans/00_master_checklist.md`, the default), flip the primary checkout's copy (`$PLANS/00_master_checklist.md`, per [`git-worktree-standard.md`, "Where the plans live"](../cook-pizzas/references/git-worktree-standard.md); a worktree has no copy) and make no commit. Skip silently in universal mode (no checklist / no pie row).

### Phase 2 - Open the Pie PR (or Reuse Existing) *(pie-completion / universal)*

1. **If `EXISTING_PR_NUMBER` from Phase 0 is set**, skip to Phase 3 - the existing PR already tracks this branch.
2. **Otherwise**, open one PR for the whole pie:
   - **Title:** for a pie, `Pie N: <name>` (lift `N` and the name from the `## Pie N - <name>` checklist header). For a hand-rolled branch, fall back to `gh pr create --fill` (latest commit subject).
   - `gh pr create --base main --head "$BRANCH" --fill` - the `--fill` body lifts the accumulated slice commit subjects/bodies, so the per-slice closing-narrative paragraphs carry the design story into the PR description without a separate step. For a named pie, set the title explicitly (`--title "Pie N: <name>"`) and keep `--fill` for the body.
   - **Evidence section (the Pass ledger):** when `bts_pr_body` is available, write its output into the PR body under `## Evidence` after the `--fill` content; the section is generated, do not edit it by hand. Call it once with `{ "pie": N }` before `gh pr create`. A `--body` or `--body-file` overwrites what `--fill` would write, so build the body file yourself: the `--fill` content (`git log --reverse --format='%s%n%n%b' origin/main..HEAD`), then a blank line and `## Evidence`, then the tool's output verbatim; pass it with `--body-file` and keep `--title`. When the tool is absent, or answers its one-line `bts_pr_body:` message (no ledger, no `node`), open the PR with `--fill` alone and leave the section out. It warns and never blocks: a missing section is not a reason to stop.
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
   - `previous_signature`: the `signature` the previous round returned, or `null` on attempt 1
4. The agent makes no git writes: it returns `files_changed` and a proposed commit subject and body. **This skill** stages exactly those paths (`git add -- <paths>`), commits with the proposed message, and pushes to `origin "$BRANCH"` (never forced; a rejected push is a `destructive_operation` HITL). Do not call `--watch` from inside the dispatch - the skill returns to Phase 3 (top) after its push lands and re-invokes `gh pr checks --watch` against the new head SHA.
   If the agent returns `bail_reason: repeated_signature`, it patched nothing because the identical failure survived the last round: stop the loop now, commit and push nothing, and surface the `creative_direction` HITL below. The bail counts as that round and never extends the 3.
5. Increment the counter. If it would exceed 3, STOP. Surface as `creative_direction` HITL with the full failure history so the user can decide whether to debug manually, retry CI, or close the PR.

The 3-attempt cap is a hard rule and is **not overridable by the run instruction**: "continue until CI is green", "never stop", "fully automated" or an autonomous-delivery instruction do not add rounds. Only the operator's explicit reply at this HITL can grant more. The CI counter is per PR and separate from the conductor's 3 local fix loops per slice; neither borrows from the other. One identical repeat already signals a structural problem (flaky test, missing secret, infra outage) that needs human judgment, so the loop stops at the first repeated signature (`normalize(first_error_line) + " | " + file + " | " + job_name`, a plain string compared by equality and never persisted) instead of counting to three.

### Phase 4 - Merge Authorization Gate *(pie-completion / universal - the kept pie-boundary HITL)*

CI is green. **Stop and prompt the user** (this is the §1.8 pie-boundary checkpoint - in the default `pie-pr` mode, the one HITL the loop never auto-approves; `slice-merge` mode has no per-slice merge gate, see "Merge-per-slice closeout"):

> "CI is green on PR `<PR_URL>` (Pie N). Approve merge?"
>
> Options (always include a recommended answer):
> 1. **Approve and merge now** (recommended if you've already reviewed the pie) - the skill merges **preserving every per-slice commit** (see strategy below) and proceeds to Phase 5.
> 2. **Hold - keep the PR open for manual review** - the skill exits, leaving the PR open. You merge via the GitHub UI when ready (with the strategy the helper picked: "Create a merge commit" when the pie holds empty commits), then re-run `/box-it-up --resume` to do cleanup.
> 3. **Cancel - leave the PR open and stop** - the skill exits without merging.

**Merge strategy - preserve per-slice commits (never squash).** The whole point of the per-slice commits is that they survive the merge as the pie's history. These rules - merge preserving per-slice commits (never squash), `--ff-only` sync, `git worktree remove`/`prune` cleanup, and the boundary-PR body shape - come from [`../cook-pizzas/references/git-worktree-standard.md`](../cook-pizzas/references/git-worktree-standard.md) (Phase 3 + Invariants §5 + the PR template §6). Resolve the strategy with the helper, from the pie branch: `gh repo view --json rebaseMergeAllowed,mergeCommitAllowed,squashMergeAllowed | node "<this-skill-directory>/pick-merge-strategy.js" --base origin/main` (after `git fetch origin`), and capture the branch's commit subjects for Phase 5 with `SUBJECTS=$(git log --format=%s origin/main..HEAD)`. The helper prints one JSON line, `{ strategy, reason, emptyCommits }`, by these rules (with `--mode slice-merge` or `--mode ship` it skips them and always answers a merge commit, `reason: merge-commit-required`, or `strategy: none`, `reason: merge-commits-disallowed`):

1. **Empty commits force a merge commit.** GitHub's rebase-merge drops a commit whose tree equals its parent's, so a slice-close commit made with `--allow-empty` would vanish from `main`. When the branch holds one (`reason: empty-commits`), use a **merge commit** (`gh pr merge "$PR_NUMBER" --merge`). If merge commits are disallowed (`strategy: none`, `reason: empty-commits-need-merge-commit`), STOP and surface `prd_ambiguity`: *"This pie has N empty slice-close commits that a rebase-merge would drop. Enable merge commits, or confirm you accept losing them."*
2. **Otherwise prefer rebase-merge** for a pie PR (`gh pr merge "$PR_NUMBER" --rebase`; a slice PR in `slice-merge` mode always uses a merge commit instead) - replays each slice commit onto main, linear history, every `feat(pie-N): N.M` preserved.
3. If rebase is disallowed (`reason: rebase-disallowed`), use a **merge commit** (`gh pr merge "$PR_NUMBER" --merge`) - also preserves the individual commits under a merge node.
4. **Never `--squash`** for a pie - squashing collapses the per-slice commits into one and destroys the boundary contract. If a project's settings allow *only* squash (the helper's `reason: squash-only`), STOP and surface as `needs_human: true` with `hitl_category: prd_ambiguity`: *"This repo only permits squash merges, which would collapse the pie's per-slice commits. Enable rebase or merge-commit merges, or confirm you accept a squash for this pie."* For a **hand-rolled** branch with no per-slice contract, the project default (including squash) is acceptable - the preserve-commits rule binds pies, not arbitrary branches.

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
4. Confirm the PR's merge result is now in local main: `git -C "$PRIMARY" log --oneline | grep -q "$PR_NUMBER\|<merge sha>"`, then confirm every branch commit subject captured in Phase 4 (`SUBJECTS`) appears in `git -C "$PRIMARY" log --format=%s`. If any is absent, STOP and surface - something's odd.
5. **Remove the pie worktree first (if `IS_WORKTREE` from Phase 0 was true):** `git -C "$PRIMARY" worktree remove "$WORKTREE_PATH"` (never `rm -rf`). This must precede the branch delete: git refuses to delete a branch that a worktree still has checked out.
6. `git -C "$PRIMARY" branch -d "$BRANCH"` - delete the local pie branch (safe delete; refuses if unmerged commits exist, which is what we want). After a rebase-merge the commits on `main` carry new SHAs, so `-d` passes only while the branch's upstream ref still exists; if it refuses, confirm step 4 found every slice commit subject on `main` and surface `destructive_operation` before any `-D`.
7. `git push origin --delete "$BRANCH"` - delete the remote branch. If GitHub auto-deleted it on merge (or `gh pr merge --delete-branch` did), this returns "remote ref does not exist" - fine; record it but don't fail. From a worktree, run `gh pr merge` without `--delete-branch`: that flag also tries to switch the local checkout to `main`, which the primary checkout holds.
8. `git -C "$PRIMARY" worktree prune` - clear stale worktree metadata.
9. `git -C "$PRIMARY" status --short` - must be empty. `git -C "$PRIMARY" rev-parse --abbrev-ref HEAD` - must be `main`. `git -C "$PRIMARY" status -uno` - confirm fully synced with remote. The pie is closed; the next pie starts in a fresh chat with a fresh worktree.

### Phase 6 - Final Report *(pie-completion / universal)*

Surface to the user:
- PR URL + merge commit SHA (+ note the merge strategy used: rebase / merge-commit, and why when the helper picked a merge commit for empty commits)
- Pie name + branch name (now deleted) + worktree path (now removed)
- Slice and task commit count preserved on main
- Total CI attempts (1 if green on first run; up to 3 if the fix loop ran) + ci-fix-attempter dispatch count / per-attempt summary if applicable
- Final state: "On main, clean tree, fully synced with origin/main. Pie N closed - start the next pie in a fresh chat."

### Merge-per-slice closeout *(slice-merge mode, `--merge-slice`)*

Runs once per slice when `delivery.mode` resolves to `merge-per-slice`. The conductor (`/sell-pie` or `/sell-slice`) invokes it internally and passes `BRANCH` (`pie-N-sN.M-<scope>`), `WORKTREE_PATH` (the slice worktree), the slice id and name, and whether this is the pie's last slice. Phases 0 → 6 apply with these overrides:

- **Phase 0.** Run steps 1-6 against the slice worktree (`git -C "$WORKTREE_PATH" ...`). Skip step 7 (pie completeness). Add: `gh repo view --json mergeCommitAllowed --jq .mergeCommitAllowed` must print `true`. If it does not, STOP the loop with `needs_human: true`, `hitl_category: prd_ambiguity`: *"This repo disallows merge commits, which merge-per-slice delivery requires. Enable merge commits, or rerun this pie in the default one-PR-per-pie mode?"* Never fall back to squash or rebase on its own.
- **Phase 1.** The slice's work is already committed and pushed on `BRANCH`. On the pie's last slice, Phase 1 step 4 applies: flip `## Pie N` to `Completed`, commit, push, so the flip reaches `main` with this slice's merge. With a gitignored checklist (the default) there is nothing to commit: flip `$PLANS/00_master_checklist.md` in the primary checkout only after the Phase 4 merge, so a slice that stays red never marks its pie done. If any slice of the pie is still `waiting until <YYYY-MM-DD>` (calendar-gated), this is not the last slice: do not flip the pie and do not write the kitchen merge record; the slice PR that later closes the waiting slice is the pie's last.
- **Phase 2.** Title the PR `Slice N.M: <name>`: `gh pr create --base main --head "$BRANCH" --title "Slice N.M: <name>" --fill`.
- **Phase 3 / 3a.** Watch CI as usual. On red, up to **3** `ci-fix-attempter` rounds (the CI fix counter is per slice). Still red after the 3rd round, or a round that bails on a repeated signature: **halt the loop** with a `creative_direction` HITL carrying the failure history. Never skip the slice, never merge it red, never start the next slice.
- **Phase 4.** No human merge gate: the run instruction or `delivery.mode` already authorized autonomous delivery. On green, merge with a **merge commit**: `gh pr merge "$PR_NUMBER" --merge` (never `--squash`, never `--rebase`, never `--delete-branch` from the worktree).
- **Phase 5.** Identical cleanup from the primary checkout: `git -C "$PRIMARY" pull --ff-only origin main`, `git -C "$PRIMARY" worktree remove "$WORKTREE_PATH"`, `git -C "$PRIMARY" branch -d "$BRANCH"`, `git push origin --delete "$BRANCH"`, `git -C "$PRIMARY" worktree prune`. Write the kitchen merge record only after the pie's last slice (see Phase 5 step 1). Append one line to the run log `.claude/.bytheslice-state/run-log.md` (gitignored): slice id, PR URL, merge commit SHA, merge time.
- **Phase 6.** Return a short per-slice result to the conductor (PR URL, merge SHA, CI rounds). The conductor cuts the next slice from the freshly synced `main`; on the pie's last slice it sends the operator **one** notice listing every slice PR from the run log.

### Pie-local closeout *(pie-local mode, `--pie-local`)*

Runs once per pie when `delivery.mode` resolves to `ship-once`. The `/sell-pie` conductor invokes it internally and passes `BRANCH` (`pie-<n>-<scope>`), `WORKTREE_PATH` (the pie worktree), `SHIP` (the ship branch), the pie number and name, `run.unattended`, and any slices it deferred. Phases 2-4 do not run: there is no PR, no push and no CI. All gates are local.

1. **Pre-flight.** Resolve `PRIMARY=$(git worktree list --porcelain | sed -n '1s/^worktree //p')` and `$PLANS` per [`git-worktree-standard.md`, "Where the plans live"](../cook-pizzas/references/git-worktree-standard.md). Confirm `git -C "$PRIMARY" rev-parse --abbrev-ref HEAD` is `SHIP`, `git -C "$PRIMARY" status --short` is empty, `git -C "$WORKTREE_PATH" status --short` is empty, and `BRANCH` is neither `main` nor `SHIP`. A failure is a `destructive_operation` HITL (never switch, stash or overwrite the primary checkout).
2. **Verified-slice check.** Every `### Slice N.M` under `## Pie N` in `$PLANS/00_master_checklist.md` must be `[x]` **and** have a `slice-verifier` pass in the Pass ledger (`bts_status` shows each slice's last verdicts; without the tool, look for the slice's `slice-verifier` pass in `$PRIMARY/.bytheslice/ledger.jsonl`). With no ledger at all, trust the checklist and say so in the report. A `deferred:` slice (unattended only) must have no commit on the branch: no subject in `git -C "$PRIMARY" log --format=%s "$SHIP".."$BRANCH"` names `N.M`. A slice that fails this check means the merge would carry unverified work into the ship PR.
3. **Full local check, once, on the pie branch.** In `WORKTREE_PATH`, run the same commands `slice-verifier` runs on its first pass under ship-once ([definition](../sell-slice/agents/slice-verifier.md), "Which commands run"): the **CI command list** parsed from the project's generated `.github/workflows/ci.yml` and then, when it exists, `.github/workflows/e2e.yml` (every `run:` step, jobs in `needs:` order, environment setup skipped, a literal `origin/main...HEAD` replaced with `"$SHIP"...HEAD`), so this check and the ship PR's CI run the same commands, every one of them, never a subset. Read `quality.tier` from `bytheslice.config.json` (`auto` resolves as `/final-quality-check` "Quality tier" documents). Under `lean` that list is lint, typecheck, unit tests, build, `check:design-system` only when a design system exists, and `test:e2e:smoke`; never run `test:e2e:feature`, `test:e2e:regression` or `test:e2e:visual` under lean, since lean CI does not. Under `standard`, that list includes every e2e suite `e2e.yml` runs (`@feature`, `@regression-core` and `@visual`), in full: `verification.e2e.*` does not narrow it, because CI does not read those thresholds. With no `ci.yml` yet, fall back to `<pm> lint`, `<pm> typecheck`, `<pm> build`, `<pm> test`, `<pm> check:design-system` when it exists and the tier's e2e gate, with the package manager from the lockfile (`pnpm-lock.yaml`, `package-lock.json`, `yarn.lock`, `bun.lock` / `bun.lockb`) and the actual script names from `package.json` (they may be non-standard, e.g. `check-types`), and say so. Skip a script the project does not define and say so. Run each once and continue past a failure so the full picture is known. All green: go to step 5. Every other generated workflow that runs on pull requests (`e2e-coverage.yml`, `db-schema-drift.yml`, `design-system-compliance.yml`, when present) runs too, so nothing can fail only in CI on the ship PR.
4. **Fix rounds (on red).** Counter starts at 1, cap **3**, separate from every slice's local fix loops and from the CI rounds. Dispatch `bytheslice:fix-attempter` ([definition](../sell-slice/agents/fix-attempter.md); fallback per [`loop-workflow-fallback-pattern.md`](../cook-pizzas/references/loop-workflow-fallback-pattern.md) "Agent shape on the fallback path") with the failing checks as its verdict (check, command, exit code, last ~50 lines of output), the pie diff (`git -C "$WORKTREE_PATH" diff "$SHIP"...HEAD`), the round number and `previous_signature` (`normalize(first_error_line) + " | " + file + " | " + check`, never persisted). It returns `files_changed`; this skill stages exactly those paths, commits them on `BRANCH` as `fix(pie-N): pie-local check round K <check>` (no push), and re-runs the full local check (a round is one fix plus one full check, like a CI round). A `repeated_signature` bail ends the loop at once and counts as that round. Still red after round 3:
   - **Interactive:** `creative_direction` HITL with the failure history; the pie is not merged.
   - **Unattended (`run.unattended: true`):** do not ask. Leave the pie branch and worktree in place, unmerged, record the blocker `{pie: "N", reason: "pie-local check red after 3 rounds: <checks>", attempts: 3}` with one `bts_note`, and return `status: complete_with_deferrals`.
5. **Flip the pie status.** Tracked plans: set `## Pie N` to `Completed` on `BRANCH`, commit `chore(pie-N): mark Pie N completed`. Gitignored plans (the default): flip `$PLANS/00_master_checklist.md` after step 6 succeeds, no commit. With deferred slices (unattended) the status reads `Completed (deferred: N.M, N.K)`.
6. **Merge into the ship branch, preserving every slice commit.** Capture `SUBJECTS=$(git -C "$PRIMARY" log --format=%s "$SHIP".."$BRANCH")`, then from the primary checkout: `git -C "$PRIMARY" merge --no-ff -m "merge(pie-N): Pie N <name> into $SHIP" "$BRANCH"`. Never squash, never rebase, never fast-forward. The subject names no slice id, so the PR evidence does not read the merge commit as an unverified slice. Confirm every line of `SUBJECTS` appears in `git -C "$PRIMARY" log --format=%s "$SHIP"`. A conflict (unexpected: the ship branch moves only through these merges, and the pie was cut from its tip) is `git -C "$PRIMARY" merge --abort`, then a `destructive_operation` HITL (interactive) or a pie blocker (unattended); never auto-resolve.
7. **Cleanup from the primary checkout.** `git -C "$PRIMARY" worktree remove "$WORKTREE_PATH"`, then `git -C "$PRIMARY" branch -d "$BRANCH"` (safe: it is merged into the checked-out ship branch), then `git -C "$PRIMARY" worktree prune`. No remote delete: the pie branch was never pushed. Leave any `deferred/pie-N-sN.M` branch in place for the conductor. Append one line to the run log `.claude/.bytheslice-state/run-log.md`: pie, ship-branch merge SHA, check rounds, deferred slices. No kitchen merge record here (no PR merged); `--ship` writes it.
8. **Return** a short result to the conductor: merge SHA, check rounds, deferred slices and blockers, and whether this was the checklist's last pie.

### Ship closeout *(ship mode, `--ship`)*

Runs once, after the last pie of a ship-once build has merged into the ship branch. An interactive `/sell-pie` invokes it after its last `--pie-local`; in an unattended run the `/pizza-party` conductor invokes it after its replan. The caller passes `SHIP`, the app name (default: `SHIP` without its `ship/` prefix), `run.unattended`, and the `blocked` list collected across the build. Phases 0 → 6 apply from the primary checkout with these overrides:

- **Phase 0.** `BRANCH` is `SHIP`; confirm the primary checkout is on it and clean. Skip step 7 (pie completeness); instead confirm every `## Pie N` in `$PLANS/00_master_checklist.md` is `Completed` (interactive: an unmerged pie is a `prd_ambiguity` HITL, "ship without Pie N?"; unattended: proceed and list it as a blocker). Run steps 4-6 as written (`gh auth status` is the one ship-once `gh` check). Resolve the merge strategy now: `gh repo view --json rebaseMergeAllowed,mergeCommitAllowed,squashMergeAllowed | node "<this-skill-directory>/pick-merge-strategy.js" --base origin/main --mode ship` (after `git fetch origin`) always picks a merge commit; `reason: merge-commits-disallowed` is a `prd_ambiguity` HITL (interactive) or a blocker returned before anything is pushed (unattended).
- **Phase 1.** Nothing to commit. `git -C "$PRIMARY" push -u origin "$SHIP"`; a rejected push is a `destructive_operation` HITL (interactive) or a blocker (unattended), never a force-push.
- **Phase 2.** Title `Ship <app>: <pies> pies, <slices> slices`, counting the pies merged into the ship branch (`merge(pie-N)` merge commits in `origin/main..$SHIP`) and the slices `[x]`. Build the body file: the commit story (`git log --reverse --no-merges --format='%s%n%n%b' origin/main.."$SHIP"`), a blank line, `## Evidence`, then for **every** merged pie a `### Pie N` heading and `bts_pr_body({ "pie": N })` output verbatim (omit the section when the tool is absent), then `## Deferred` listing every `blocked` entry and the design-critique findings recorded as deferred (omit when empty). `gh pr create --base main --head "$SHIP" --title "<title>" --body-file <file>`. Every slice named on the branch must carry a `slice-verifier` pass in the ledger, which deferral guarantees (it keeps unverified commits off the branch). If one does not, surface its slice list (`prd_ambiguity`, interactive) or return it as a blocker (unattended) instead of opening the PR.
- **Phase 3 / 3a.** Watch CI once (30-minute cap per attempt); on red, up to **3** `ci-fix-attempter` rounds committed and pushed on `SHIP` from the primary checkout. Still red after round 3, or a `repeated_signature` bail: interactive, the `creative_direction` HITL as usual; **unattended, leave the PR open**, record the blocker `{pie: "ship", reason: "ship PR CI red after 3 rounds: <checks>", attempts: 3, pr: "<PR_URL>"}` and return `status: complete_with_deferrals` without merging. A PR GitHub reports as conflicting with `main` (`gh pr view --json mergeable` is `CONFLICTING`) is handled the same way, as a `destructive_operation` HITL or a blocker; never auto-resolve.
- **Phase 4.** No human merge gate: choosing ship-once authorized the merge. On green, `gh pr merge "$PR_NUMBER" --merge` (the strategy from Phase 0; never `--squash`, never `--rebase`, which would drop the pie merge commits; never `--delete-branch`, since the primary checkout holds `SHIP`).
- **Phase 5.** Capture `SUBJECTS=$(git -C "$PRIMARY" log --format=%s origin/main.."$SHIP")` before the merge. After `gh pr view` confirms `MERGED`, write the kitchen merge record once with `--mode pie --pie "<last pie number>"`. Then, from the clean primary checkout: `git -C "$PRIMARY" switch main`, `git -C "$PRIMARY" pull --ff-only origin main`, confirm every `SUBJECTS` line is in `git -C "$PRIMARY" log --format=%s`, `git -C "$PRIMARY" branch -d "$SHIP"`, `git push origin --delete "$SHIP"`, `git -C "$PRIMARY" worktree prune`. Pie worktrees are already gone; any pie left unmerged by an unattended blocker keeps its worktree and is listed in the report. `deferred/*` branches stay for the conductor.
- **Phase 6.** Report the ship PR URL, the merge SHA and strategy, pies and slices shipped, CI rounds, and every blocker; return `status: complete`, or `complete_with_deferrals` when `blocked` is not empty.

---

## HITL Handling

**Agents and this skill never call `ask_user_input_v0`.** At every elicitation point - the Phase 1 commit prompt and the Phase 4 merge-authorization gate - the skill **sets `needs_human: true` plus the `hitl_*` fields in its return contract** and lets the invoking orchestrator (`/sell-pie`'s loop, or the operator's session) surface the prompt. The phase descriptions above show the question text; the skill emits it as `hitl_question`, not as a direct tool call.

For sub-agent failures (e.g. `ci-fix-attempter` returns `needs_human: true`), the skill bubbles the structured fields up via its own return contract - it does not retry indefinitely.

**Unattended ship-once runs never ask.** In `pie-local` and `ship` mode with `run.unattended: true`, every point below that would set `needs_human` instead records a blocker in `blocked` (`{slice | pie, reason, attempts}`, plus `pr` when a ship PR is left open), leaves the git state as it is (an unmerged pie keeps its branch and worktree; a red ship PR stays open), and returns `status: complete_with_deferrals` to the conductor. Fix caps never rise. Interactive runs behave exactly as described below.

HITL categories the skill produces:
- `destructive_operation` - about to push from main, force-push detected, merge-conflict pull, branch-reuse without rename, would-overwrite uncommitted changes on checkout.
- `external_credentials` - `gh` not authenticated, CI watch timeout (likely runner / secrets issue).
- `creative_direction` - ci-fix-attempter exhausted 3 attempts or bailed on a repeated signature; user decides whether to debug, retry, or close the PR. In `slice-merge` mode this halts the delivery loop. In `pie-local` mode, the full local check still red after 3 `fix-attempter` rounds.
- `prd_ambiguity` - boxing a pie with unfinished slices; a squash-only repo that would collapse per-slice commits; a repo that disallows merge commits in `slice-merge` mode; a precondition that needs the user to tell the skill how to interpret state.

---

## Hard Constraints

- **Per-slice mode opens no PR and watches no CI.** Commit + push only, then return. In the default `pie-pr` mode CI fires exactly **once per pie**, at the boundary, and no PR opens mid-pie. **Exception:** `slice-merge` mode (`delivery.mode: merge-per-slice`) opens, CI-checks and merges one PR per slice.
- **Preserve per-slice commits on a pie merge - never `--squash`.** Default mode: rebase-merge for the pie PR, merge-commit as fallback, and always a merge commit when the branch holds an empty commit (rebase-merge drops it; `pick-merge-strategy.js` decides). `slice-merge` mode: always a merge commit; a repo that disallows merge commits is a `prd_ambiguity` HITL. A squash-only repo is a `prd_ambiguity` HITL, not a silent squash.
- **Ship-once: no human merge gate, local gates per pie, CI once at the end.** `pie-local` merges the pie into the ship branch only after every non-deferred slice has a `slice-verifier` pass and the full local check is green (at most 3 `fix-attempter` rounds), with `git merge --no-ff` (never squash, rebase or fast-forward), and never pushes. `ship` pushes the ship branch, opens one PR, merges it with a merge commit only on green CI (at most 3 `ci-fix-attempter` rounds), then syncs `main` and deletes the ship branch. Unattended runs return blockers instead of asking, and leave a red ship PR open.
- **No per-slice merge approval in `slice-merge` mode; never merge red.** The slice merges only on green CI, after at most 3 `ci-fix-attempter` rounds; still red halts the loop. There is never an integration branch.
- **One worktree per pie (default and ship-once) or per slice (`slice-merge`); `/box-it-up` only removes it.** The worktree is created upstream by the conductor. This skill removes it after the merge (via `git worktree remove` + `prune`, never `rm -rf`) and never creates one. The merge/cleanup rules here are the standard's - see [`../cook-pizzas/references/git-worktree-standard.md`](../cook-pizzas/references/git-worktree-standard.md) (Phase 3 + Invariants §5).
- **Never ship from `main` / `master`.** Phase 0 step 2 is a stop-everything check. `--ship` ships from the ship branch; `--pie-local` writes only the pie merge commit on it.
- **Never force-push.** If `git push` is rejected for non-fast-forward, STOP. The user resolves on a fresh branch.
- **Only the conductor makes git writes, `git add` included.** `ci-fix-attempter` returns `files_changed`; this skill stages those paths selectively, commits and pushes, on the registered and fallback paths alike. Never `git add -A`.
- **Never auto-merge a PR with failing required checks.** Phase 4 only runs when CI is green on the latest head SHA.
- **Never box an incomplete pie.** If any slice under the active Pie is still `[ ]`, STOP (`prd_ambiguity`).
- **Never `git stash` on the user's behalf.** If `git checkout main` would overwrite uncommitted changes, STOP.
- **Clean up from the primary checkout, in order.** Sync `main` with `git -C "$PRIMARY" pull --ff-only`, then `worktree remove`, then `branch -d`, then the remote delete, then `worktree prune`. Never check out `main` inside a worktree, and never delete a branch a worktree still holds.
- **Never edit a tracked file on `main`.** The Pie's checklist flip is committed on the pie branch before the PR opens.
- **Never auto-resolve merge conflicts during cleanup pull.** `--ff-only` fails fast; the user resolves.
- **Cap the CI fix loop at 3 attempts.** Beyond that → HITL `creative_direction`. No "one more try." No run instruction raises the cap; only the operator's explicit reply at the HITL does. Separate from the 3 local fix loops per slice. The `pie-local` check rounds are their own counter with the same cap of 3 and the same rule.
- **Cap CI watch at 30 minutes per attempt.** Beyond that → HITL `external_credentials`.
- **Reuse existing PRs.** If an open PR already tracks the branch, watch its CI; never create a duplicate.
- **Never call `ask_user_input_v0`.** Set `needs_human` + `hitl_*` and let the orchestrator prompt.
- **Subagent prompts live in `./agents/*.md`.** This SKILL.md is workflow only - never inline subagent prompts here.
- **Always provide a recommended answer in available options** at every elicitation point.

---

## Triggers

Follow this skill whenever the user (or `/sell-pie`'s loop):

- runs `/box-it-up` (pie-completion / universal closeout) or `/box-it-up --slice` (per-slice commit + push)
- is a ship-once conductor at a pie boundary (`--pie-local`) or after the last pie (`--ship`)
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

### Pie-local mode (ship-once)

- [ ] Primary checkout clean and on the ship branch; pie worktree clean.
- [ ] Every slice `[x]` with a `slice-verifier` pass (or, unattended, `deferred:` with no commit on the branch).
- [ ] Full local check ran once on the pie branch (every command `ci.yml` and, under standard, `e2e.yml` run, in full; lean: smoke spec only, never `@feature` / `@regression-core` / `@visual`) and is green (at most 3 `fix-attempter` rounds), or the pie was left unmerged with a HITL (interactive) or a blocker (unattended).
- [ ] Pie merged into the ship branch with `git merge --no-ff`; every pie commit subject found on the ship branch; nothing pushed.
- [ ] Pie worktree removed, pie branch deleted with `-d`, `worktree prune` ran; pie status flipped; run-log line appended.

### Ship mode (ship-once)

- [ ] Every pie `Completed` on the ship branch (or, unattended, listed as a blocker).
- [ ] Repo allows merge commits (`pick-merge-strategy.js --mode ship` picked `merge`).
- [ ] Ship branch pushed; one PR `Ship <app>: <pies> pies, <slices> slices` opened against `main` with a `### Pie N` evidence block per pie and a `## Deferred` section when anything was deferred.
- [ ] CI green (at most 3 `ci-fix-attempter` rounds) and merged with a merge commit, no human gate; or, unattended and still red, the PR left open and reported as a blocker.
- [ ] Kitchen merge record written once; `main` synced `--ff-only` in the primary checkout; ship branch deleted local and remote; `worktree prune` ran.

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
status: complete | complete_with_deferrals | failed | needs_human   # complete_with_deferrals: unattended pie-local / ship recorded a blocker instead of asking
mode: slice | slice-merge | pie | universal | pie-local | ship
summary: <one paragraph - mode; for slice: commit sha + branch; for slice-merge: slice PR URL + number, CI rounds, merge commit SHA, cleanup state; for pie: pie name, PR URL + number, CI attempt count, merge strategy + SHA, per-slice-commit count preserved, cleanup state; for pie-local: pie name, local check rounds, ship-branch merge SHA, deferred slices, cleanup state; for ship: ship PR URL + number, pies and slices shipped, CI rounds, merge SHA, cleanup state>
artifacts:
  - <commit sha (slice mode)>
  - <pr url (slice-merge/pie/universal/ship mode)>
  - <merge commit sha (slice-merge/pie/universal/pie-local/ship mode)>
local_check_rounds: null | <int>    # pie-local only: fix rounds used (0 when green on the first run)
last_pie: null | false | true       # pie-local only: every pie in the checklist is now merged into the ship branch (or deferred, unattended)
blocked: [] | [{slice: "<N.M>", reason: "<one line>", attempts: <int>} | {pie: "<N>" | "ship", reason: "<one line>", attempts: <int>, pr: "<url, ship only>"}]   # unattended pie-local / ship only
needs_human: false | true
hitl_category: null | "prd_ambiguity" | "external_credentials" | "destructive_operation" | "creative_direction"
hitl_question: null | "<plain-language question>"
hitl_context: null | "<what triggered this>"
```
