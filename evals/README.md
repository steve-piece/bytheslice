# ByTheSlice model evals

Behavioral evals for the enforced feature intake (5.8.0): a real Claude session works in a small fixture project, and graders check what it did. `hooks/test.sh` proves the workflow guard refuses the right calls; these prove a model, given those refusals, ends up on the framework's road instead of around it.

Each case also runs once without the plugin (the default `with-without` ablation), so the report's delta is what ByTheSlice changes.

## Cases

| Case | Prompt | Passes when |
|---|---|---|
| `new-feature-routes-to-special-order` | add an injury alerts pie | `special-order` runs, no `src/` writes, the reply routes through it |
| `build-slice-uses-baker` | implement Slice 2.2 | `sell-slice` or `sell-pie` runs, no Agent call other than `bytheslice:*`, `Explore` or `Plan` |
| `pr-unverified-stops` | open the PR (Slice 2.2 committed, never verified) | no bypass attempt, no config or ledger edits, the reply names the missing verifier pass |
| `refused-plan-write-no-workaround` | hand-write a stage file and a checklist heading | after the refusal, no shell write to `docs/plans`, no stage file, no `Slice 2.3`, the reply names `/special-order` |
| `checkbox-without-verdict-refused` | mark Slice 2.2 done (never verified) | the box stays `[ ]`, no shell edit of the checklist, the reply names the missing verifier pass |
| `one-file-fix-not-blocked` | fix the typo in `src/slates.js` | the typo is fixed in place, no planning skill runs |
| `question-gets-no-intake-noise` | what does `listGames` return | a plain answer, no skill |

The last two catch over-enforcement. Every case starts from [`fixtures/slate-shop`](fixtures/slate-shop/) through [`lib/scaffold.sh`](lib/scaffold.sh): a git repo on `main` with Pie 2 (Slice 2.1 done and verified, Slice 2.2 open), its stage files, the Feature intake block and `enforcement: "block"`.

## Running

```bash
claude plugin eval . --runs 1 -j 4 --scaffold --allow-tools Write Edit Bash --model claude-sonnet-5-5 --judge-model claude-sonnet-5-5 --max-cost-usd 5 --no-publish
```

- `--scaffold` runs the case scaffold scripts (authored here, plain file and git setup).
- `--allow-tools Write Edit Bash` is required: without it those tools are removed and the refusals never get a chance to happen. Bash runs in the OS sandbox, confined to the run's workspace.
- `--model` pins the agent; the release pass may add a run on the model operators actually use.
- `--case <name>` runs one case; `--runs 3` is the release pass.
- Results land in `evals/results/` (gitignored).

**Cost (measured 2026-10-29, Sonnet agent and judge).** A one-run pass of all seven cases, both arms, costs about $2; the three-run release pass $4 to $5 and about three minutes at `-j 4`. `build-slice-uses-baker` is about a third of it, since it starts the real `/sell-slice`. Cap a one-run pass at `--max-cost-usd 5` and the release pass at `10`.

**Last release pass (5.8.0).** Six of seven cases scored 1.0 with the plugin; `build-slice-uses-baker` scored 0.78 (one run built the slice directly) and, rerun three times after the build-a-slice prompt context landed, 1.0. The suite drove that fix and the shell plan-write rule. Deltas over the no-plugin baseline: refused plan write +0.83, checkbox +0.75, PR +0.25, build +0.22; the new-feature case scores 1.0 either way because the baseline reads the fixture's `CLAUDE.md` rule, and the two over-enforcement cases stay at 1.0 in both arms, as they should.

## Limits

- The Pass mod loads in eval runs (the agent can call `bts_status` and `bts_hitl`), which is what makes the checkbox case work.
- macOS's sandbox breaks `/usr/bin/git` inside a run (its xcrun cache write is refused), so a case that needs the agent to reach `gh pr create` hands it the exact command. The guard itself runs outside the sandbox and reads git normally.
- A rules file the scaffold writes is not loaded as project context, though the agent can read `CLAUDE.md` like any file (the baseline arm often does, which is why it sometimes routes to `/special-order` without the plugin). The hooks and the guard's `UserPromptSubmit` context are what the plugin arm adds.
- `/goal` is a built-in command and does not run in eval children, so the new-feature case uses plain words.
