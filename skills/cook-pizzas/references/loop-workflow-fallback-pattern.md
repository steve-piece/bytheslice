<!-- skills/cook-pizzas/references/loop-workflow-fallback-pattern.md -->
<!-- Shared fallback pattern for the /loop and Workflow Claude-Code-only primitives. Invoked by /sell-pie (the /loop conductor), /sell-slice (Workflows A/B), and /cook-pizzas (Phase 3 parallel writers) when either primitive is unavailable. -->

# Manual loop + Workflow pattern — when `/loop` or `Workflow` is unavailable

`/loop` and `Workflow` are **Claude-Code-only** primitives that ByTheSlice v5 leans on for autonomy and context-separated dispatch:

- **`/loop`** is the conductor of `/sell-pie`: it re-enters the session between turns and drives one slice's Workflow per iteration over the active pie's ≤8 slices, holding **zero implementation context** itself.
- **`Workflow`** is the schema-validated orchestration runtime behind `/cook-pizzas` Phase 3 (parallel plan-writers + barrier) and `/sell-slice` Workflows A/B (builder → slice-tester → slice-verifier → fixer). It routes **structured artifacts** between singular-goal subagents and keeps intermediate results out of the conductor's context.

Either primitive may be unavailable for several reasons (see the tables below). This reference defines the **fallback pattern**: when a primitive can't be used, the skill reproduces the same behavior manually — self-paced iteration in place of `/loop`, and **in-context dispatch with orchestrator-side manual schema validation** in place of `Workflow`. The validation is the load-bearing part: `Workflow`'s built-in enforcement of each subagent's structured return is exactly what you lose, so the orchestrator must re-create it by hand or the §App A/B/C contracts become advisory.

> **Canonical doc URLs (confirmed).** Both fetch targets in §1 were verified live against `https://code.claude.com/docs/llms.txt`: `/loop` is documented **inside** the scheduled-tasks page — [`https://code.claude.com/docs/en/scheduled-tasks.md`](https://code.claude.com/docs/en/scheduled-tasks.md) (there is **no** standalone `loop.md`; that path 404s) — and `Workflow` is documented at [`https://code.claude.com/docs/en/workflows.md`](https://code.claude.com/docs/en/workflows.md) (plural; `workflow.md` singular does not exist). These mirror how [`goal-fallback-pattern.md`](goal-fallback-pattern.md) cites `goal.md` as its canonical fetch target. The fetch is a convenience, not a dependency: if a future docs reorg moves or removes either page and the WebFetch 404s, **degrade to the in-repo guidance in this file** — the manual patterns below are fully self-contained and require zero external fetch. Do not block the fallback on a fetch failure; log the dead URL and proceed with the §"manual pattern" sections.

---

## When `/loop` is unavailable

| Reason | What happens |
|---|---|
| **Running in Cursor** (or any non-Claude-Code host) | The `/loop` bundled skill doesn't exist. Invoking it produces "unknown command" or similar. |
| **`CLAUDE_CODE_DISABLE_CRON=1` set** | The scheduler is off; the cron tools and `/loop` become unavailable and any already-scheduled wakes stop firing. |
| **Claude Code older than v2.1.72** | Scheduled tasks (and therefore `/loop`) are not yet present. |
| **Bedrock / Vertex AI / Microsoft Foundry quirks** | `/loop` still exists, but a prompt with no interval runs on a fixed 10-minute schedule instead of self-pacing, and `loop.md` is not read. Treat self-paced `/sell-pie` as degraded here and prefer the manual self-paced loop below for deterministic cadence. |
| **Any other Claude-Code-specific reason** | Surfaced inline when the command is invoked. |

## When `Workflow` is unavailable

| Reason | What happens |
|---|---|
| **Running in Cursor** (or any non-Claude-Code host) | The `Workflow` runtime doesn't exist; `ultracode` / "run a workflow" requests do nothing. |
| **`disableWorkflows: true`** (settings.json, managed settings, or the `/config` toggle) | Workflows are turned off for the user or the whole org; bundled workflow commands are unavailable and the `ultracode` trigger no longer fires. |
| **`CLAUDE_CODE_DISABLE_WORKFLOWS=1` set** | Same effect, read at startup. |
| **Claude Code older than v2.1.154** | Dynamic workflows (research preview) are not yet present. |
| **Pro plan with the feature toggled off** | Dynamic workflows must be enabled from the Dynamic workflows row in `/config` first. |
| **Any other Claude-Code-specific reason** | Surfaced inline when a workflow is requested. |

**How to detect**: probe each primitive once at startup of the skill that needs it.

- **`/loop`** — only `/sell-pie` (and `/run-the-day`, which chains it) needs it. Invoke `/loop` (or check for the scheduling tools / a `CLAUDE_CODE_DISABLE_CRON` env signal). If it schedules / acknowledges → **available**; drive the pie with it per `/sell-pie`'s Workflow phase. If it errors or is absent → fall back to the **manual self-paced loop** below.
- **`Workflow`** — `/cook-pizzas` Phase 3 and `/sell-slice` Workflows A/B need it. Attempt the Workflow (or check `disableWorkflows` / `CLAUDE_CODE_DISABLE_WORKFLOWS`). If it launches a background run → **available**; use it normally. If it's disabled or absent → fall back to **in-context dispatch with manual schema validation** below.

The two are independent: a host may have `Workflow` but not `/loop`, or vice versa. Detect and fall back per primitive.

## The manual pattern

When a primitive is unavailable, the skill reproduces its behavior in the orchestrator's own context.

### 1. Fetch the canonical docs

At fallback-activation time, WebFetch whichever primitive failed:

- **`/loop`** → WebFetch [`https://code.claude.com/docs/en/scheduled-tasks.md`](https://code.claude.com/docs/en/scheduled-tasks.md). Focus on:
  - **"Let Claude choose the interval"** — the self-paced mode `/sell-pie` relies on: after each iteration Claude picks the delay and **can end the loop on its own by not scheduling the next wakeup once the task is provably complete**. This is the behavior the manual loop emulates.
  - **"Stop a loop"** — confirms a loop ends on provable completion (self-paced) or `Esc` / seven-day expiry; the manual analogue is the orchestrator simply stopping when the pie is done.
- **`Workflow`** → WebFetch [`https://code.claude.com/docs/en/workflows.md`](https://code.claude.com/docs/en/workflows.md). Focus on:
  - **"When to use a workflow"** — the table contrasting where intermediate results live (script variables for `Workflow`, **Claude's context window** for plain subagents). In fallback you are explicitly choosing the context-window column, so you must guard against context bleed and validate returns yourself.
  - **"How a workflow runs"** — describes the runtime tracking each agent's structured result. That tracking + validation is what you re-create by hand in step 3 below.

These sections describe what the primitive would have done internally; the skill emulates the same logic manually. If either URL 404s (see the **canonical doc URLs** note above), skip the fetch and proceed from the in-repo guidance here — the manual-pattern sections that follow are self-contained.

### 2. Announce the fallback and hold the loop/validation state in working memory

Build the same control state the primitive would have managed:

- **`/loop` fallback (self-paced loop)** — hold the pie's slice list (the active Pie's `### Slice N.M` entries from the master checklist), the per-slice completion predicate (slice's Exit criteria + commit-and-push done, no PR), and the pie-completion predicate (every slice `[x]`). This is the loop variable `/loop` would have carried across wakes.
- **`Workflow` fallback (manual dispatch)** — hold, for each Workflow stage, the **expected return schema**: build manifest (§App A) from the builder/`implementer`, slice-tester verdict (§App B), slice-verifier verdict (§App C). This is the contract `Workflow` would have enforced at the barrier.

Log to the user on activation:

> *"`/loop` is unavailable ({reason}); falling back to a manual self-paced loop over the active pie's slices. I'll run one slice's build→test→verify→fix cycle per iteration and stop when every slice is `[x]`, instead of relying on scheduled wakes. See [`scheduled-tasks.md`](https://code.claude.com/docs/en/scheduled-tasks.md) for the self-paced pattern."*

> *"`Workflow` is unavailable ({reason}); falling back to in-context dispatch with orchestrator-side manual schema validation. I'll dispatch each subagent in sequence/parallel myself and validate every structured return against its Appendix-A/B/C schema by hand before consuming it — the enforcement `Workflow` would have done at the barrier. See [`workflows.md`](https://code.claude.com/docs/en/workflows.md)."*

### 3. Run the manual loop / dispatch, validating every return

**`/loop` fallback — self-paced loop (the `/sell-pie` conductor):**

Iterate the active pie's slices in dependency order. Per iteration:

1. Pick the next incomplete slice.
2. Run that slice's produce→verify cycle (itself a `Workflow` in the normal path — if `Workflow` is *also* unavailable, nest the manual-dispatch fallback from this same step inside it).
3. On the slice's per-affordance/gate verdicts passing: commit `feat(pie-N): N.M — <name>` + push, **no PR**, mark the slice `[x]`.
4. Re-evaluate the pie-completion predicate. If every slice is `[x]` → **stop the loop** (the self-paced analogue of not scheduling the next wake) and hand off to `/box-it-up` to open the one Pie PR. If not → continue to the next slice.

Crucially, the conductor passes **only the build manifest + Exit criteria + design-system path** to the slice-tester — never the builder's reasoning. Self-pacing in one context makes it tempting to let context bleed between agents; do not. Re-state the context-separation rule to yourself each iteration.

**`Workflow` fallback — in-context dispatch with manual schema validation:**

Replace each `parallel()` / `pipeline()` stage with an explicit dispatch in the orchestrator's context, then validate by hand:

1. **Dispatch** the stage's subagent(s) — parallel stages in a single tool batch, pipeline stages sequentially passing the prior return forward (the house phrasing still applies: *"Dispatch in one batch:"* / *"Run sequentially:"*).
2. **Validate each return against its schema before consuming it.** Check required keys, enum values, and shape: a builder return missing `routes`/`components`/`serverActions`/`transitions` (§App A), a tester verdict missing `transitions_bidirectional` or `seed` (§App B), or a verifier verdict missing `manifest_backstop` (§App C) is **invalid** — reject it and re-dispatch with the gap called out, exactly as `Workflow` would have refused a non-conforming return at the barrier.
3. **Run the under-declaration backstop yourself.** `Workflow` would not have caught a builder under-counting affordances — the slice-verifier does, but only if it actually ran. In manual mode, confirm the verifier's `manifest_backstop.under_declared` is empty (or route the gap to a fixer). Manifest-vs-diff parity is not optional just because the runtime is gone.
4. **Barrier manually.** Do not let the synthesizer (Phase 4 in `/cook-pizzas`) or Workflow B's aggregation consume any stage's output until **all** parallel returns are present and individually validated. Consume the in-memory structured returns directly — do **not** re-read plan files from disk to reconstruct what the writers produced (that was the whole point of the Workflow path).

### 4. Surface progress periodically

Without the platform-side runtime, the user has no automatic progress view (the `/workflows` panel, or `/loop`'s per-iteration cadence note). Surface a one-line note:

- **`/loop` fallback** — per slice: *"Pie {n} loop: slice {N.M} done ({k} of {total}). Next: {N.M+1}."*
- **`Workflow` fallback** — per barrier: *"Manual Workflow: {k} of {total} writer/verifier returns validated against schema. Outstanding: {list}. Proceeding to {next stage}."*

This is the manual analogue of the progress line the primitive would have streamed.

### 5. HITL bubbles end turns naturally

Identical to the primitive's behavior: any HITL condition ends the iteration and returns control to the orchestrator/user. Agents **never call `ask_user_input_v0`** — a subagent that hits a blocking condition sets `needs_human: true` + `hitl_category` in its return (per its Return Contract), and the **orchestrator** is what prompts the user and halts. In a `/loop` fallback the four blocking categories (`external_credentials`, `prd_ambiguity`, `destructive_operation`, plus a `review: continuous` pie forcing `/sell-slice` mode) **halt the loop — they do not reschedule** the next wake.

### 6. Cleanup on exit

`/loop` ends by not scheduling the next wake; `Workflow` ends when its run completes. In the fallback, the skill simply stops tracking on:

- Normal completion (pie fully `[x]` → handoff to `/box-it-up`; or all Workflow stages validated and consumed)
- User-requested abort (or `Esc`, in a host that maps it)
- Unresolved HITL (orchestrator returns control to the user with status)

No platform state to clean up — manual loop/validation state lives only in the orchestrator's context. (This is distinct from the slice-tester's **seed/cleanup** scripts, which always run in their own finally block regardless of loop/Workflow availability — see §1.6 of the spec.)

## What you DON'T do in fallback mode

- **Do NOT silently drop the loop or the dispatch.** The fallback is "manual orchestration," not "no orchestration." Skipping the self-paced loop means the pie never advances; skipping manual dispatch means slices never get built. Reproduce the behavior, don't abandon it.
- **Do NOT silently drop schema validation.** This is the single most important rule. Without `Workflow`'s barrier, **orchestrator-side manual validation is the only thing enforcing the §App A/B/C contracts.** A return that doesn't conform must be rejected and re-dispatched — never consumed "close enough." If you skip this, the build manifest, the bidirectional-transition checks, and the under-declaration backstop all silently degrade to suggestions.
- **Do NOT let context bleed across the separated agents.** Self-pacing the loop in one context does not license handing the builder's reasoning to the slice-tester. The tester gets the manifest + Exit criteria + design-system path and nothing more. Independence is the point — the tester must not be able to rationalize the builder's choices.
- **Do NOT re-read plan files from disk to reconstruct writer output.** Consume the in-memory structured returns. Disk re-read is the anti-pattern the Workflow path exists to eliminate; re-introducing it in fallback defeats the purpose.
- **Do NOT loop indefinitely.** If a slice can't be made to pass (fixer exhausted) or the pie stalls, surface `prd_ambiguity` HITL with full evidence of where it got stuck. Do not keep self-scheduling against an unsatisfiable predicate.
- **Do NOT pretend the primitive is active.** If the user asks "is the Workflow running?" or "is the loop scheduled?", answer honestly that the platform primitive is unavailable and the skill is doing manual orchestration against the same contract.
- **Do NOT relax the contract to make a return validate.** The §App A/B/C schemas and the Exit-criteria contract still apply in full. If a schema can't be met because the upstream artifact is genuinely ambiguous, surface `prd_ambiguity` — don't quietly accept a weaker shape.

## Cross-skill references

This pattern is invoked by:

- [`skills/sell-pie/SKILL.md`](../../sell-pie/SKILL.md) — the `/loop` conductor (self-paced loop fallback) **and** the per-slice produce→verify Workflows (manual-dispatch fallback).
- [`skills/sell-slice/SKILL.md`](../../sell-slice/SKILL.md) — Workflow A (produce) and Workflow B (verify-once); falls back to manual dispatch with per-return §App A/B/C validation.
- [`skills/cook-pizzas/SKILL.md`](../SKILL.md) — Phase 3 parallel plan-writers + barrier; falls back to in-context dispatch with manual schema validation, then the Phase 4 synthesizer consumes the validated in-memory returns.

The structured-return schemas that manual validation enforces live in the spec appendices: build manifest (§Appendix A), slice-tester verdict (§Appendix B), slice-verifier verdict (§Appendix C). The Exit-criteria contract (the source of the loop's per-slice completion predicate) lives in [`templates.md`](templates.md) → "Exit-criteria contract". The companion `/goal` fallback is [`goal-fallback-pattern.md`](goal-fallback-pattern.md).
