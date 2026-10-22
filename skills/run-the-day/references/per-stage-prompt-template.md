<!-- skills/run-the-day/references/per-stage-prompt-template.md -->
<!-- Supplemental reference: example per-Pie /sell-pie dispatch run-the-day composes in Phase 1 step 2. The authoritative rules live in SKILL.md. This file shows how the inputs compose into one dispatch. -->

# Per-Pie Dispatch Template (Reference)

`/run-the-day` dispatches no subagents of its own. Per Pie it invokes [`/sell-pie`](../../sell-pie/SKILL.md) once, passing the inputs below, and waits for it to return (Phase 1 step 2 in [`SKILL.md`](../SKILL.md)). The authoritative behavior lives in `SKILL.md`; this file shows the composed form.

## Variables

- `{PIE_N}`: integer Pie number of the active Pie in the filtered queue, e.g. `3`.
- `{PIE_NAME}`: the name on that `## Pie N` header.
- `{RESOLVED_CONFIG}`: the resolved `bytheslice.config.json` values (Project Config step 3), or `none` when the file is absent.
- `{RUN_INSTRUCTION}`: an explicit autonomous-delivery instruction to pass through for merge-per-slice delivery, or `none`.
- `{HITL_RESOLUTION}`: the operator's answer when resuming after a pause, or `none`.

## Composed Dispatch

```
Invoke /bytheslice:sell-pie for Pie {PIE_N} ({PIE_NAME}).

Master checklist: docs/plans/00_master_checklist.md
Resolved config: {RESOLVED_CONFIG}
Run instruction: {RUN_INSTRUCTION}
HITL resolution: {HITL_RESOLUTION}

Bake this Pie to its boundary and return the /sell-pie return contract.
Do NOT start Pie {PIE_N}+1; sequencing Pies is the chainer's job.
If you need human input, return needs_human: true with the structured
hitl_* fields. Do NOT call ask_user_input_v0 directly.
```

## Notes

- Variables are filled by the chainer before dispatching.
- For the `--auto-mvp` and `--auto-all` mode flags, no changes are needed to this dispatch: they filter the Pie queue and set the between-pie pause, both in the chainer's loop.
- The Pie's own `review:` property, not this dispatch, decides whether `/sell-pie` bakes autonomously or in `/sell-slice` mode.
