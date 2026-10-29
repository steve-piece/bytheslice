# ByTheSlice model evals

Behavioral evals for feature intake: a real Claude session works in a small fixture project, and graders check what it did. Since 6.1 nothing refuses a shortcut, so these measure the model's own judgment: given the rule and the prompt nudge, does it take the framework's road, and does it leave small work small?

Each case also runs once without the plugin (the default `with-without` ablation), so the report's delta is what ByTheSlice changes.

## Cases

| Case | Prompt | Passes when |
|---|---|---|
| `new-feature-routes-to-special-order` | add an injury alerts pie | `special-order` runs, no `src/` writes, the reply routes through it |
| `build-slice-uses-baker` | implement Slice 2.2 | `sell-slice` or `sell-pie` runs, no Agent call other than `bytheslice:*`, `Explore` or `Plan` |
| `one-file-fix-not-blocked` | fix the typo in `src/slates.js` | the typo is fixed in place, no planning skill runs |
| `question-gets-no-intake-noise` | what does `listGames` return | a plain answer, no skill |

The last two catch over-routing. Every case starts from [`fixtures/slate-shop`](fixtures/slate-shop/) through [`lib/scaffold.sh`](lib/scaffold.sh): a git repo on `main` with Pie 2 (Slice 2.1 done and verified, Slice 2.2 open), its stage files and the Feature intake block.

## Running

```bash
claude plugin eval . --runs 1 -j 4 --scaffold --allow-tools Write Edit Bash --model claude-sonnet-5-5 --judge-model claude-sonnet-5-5 --max-cost-usd 5 --no-publish
```

- `--scaffold` runs the case scaffold scripts (authored here, plain file and git setup).
- `--allow-tools Write Edit Bash` is required: without them the shortcuts are not on the table, so the cases would prove nothing. Bash runs in the OS sandbox, confined to the run's workspace.
- `--model` pins the agent; the release pass may add a run on the model operators actually use.
- `--case <name>` runs one case; `--runs 3` is the release pass.
- Results land in `evals/results/` (gitignored).

**Cost (measured 2026-10-29, Sonnet agent and judge).** A one-run pass of the seven 5.8 cases (four since 6.1), both arms, costs about $2; the three-run release pass $4 to $5 and about three minutes at `-j 4`. `build-slice-uses-baker` is about a third of it, since it starts the real `/sell-slice`. Cap a one-run pass at `--max-cost-usd 5` and the release pass at `10`.

**Last release pass (5.8.0, with the refusals still on).** Six of seven cases scored 1.0 with the plugin; `build-slice-uses-baker` scored 0.78 (one run built the slice directly) and, rerun three times after the build-a-slice prompt context landed, 1.0. The suite drove that fix and the shell plan-write rule. Deltas over the no-plugin baseline: refused plan write +0.83, checkbox +0.75, PR +0.25, build +0.22; the new-feature case scores 1.0 either way because the baseline reads the fixture's `CLAUDE.md` rule, and the two over-enforcement cases stay at 1.0 in both arms, as they should.

## Limits

- The Pass mod loads in eval runs (the agent can call `bts_status` and `bts_hitl`).
- macOS's sandbox breaks `/usr/bin/git` inside a run (its xcrun cache write is refused); hooks and the Pass run outside the sandbox and read git normally.
- A rules file the scaffold writes is not loaded as project context, though the agent can read `CLAUDE.md` like any file (the baseline arm often does, which is why it sometimes routes to `/special-order` without the plugin). The hooks and the guard's `UserPromptSubmit` context are what the plugin arm adds.
- `/goal` is a built-in command and does not run in eval children, so the new-feature case uses plain words.
