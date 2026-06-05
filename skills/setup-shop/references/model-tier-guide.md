---
title: Model Tier Guide
version: "2.0"
---

# Model Tier Guide

The ByTheSlice plugin uses three model tiers across all sub-agents. Each tier maps to an Anthropic alias that auto-resolves to the latest version per provider.

| Tier | Alias | Use cases | Effort default |
|---|---|---|---|
| **Fast** | `haiku` | Read-only codebase recon, mechanical checks, file scans | low |
| **Balanced** | `sonnet` | Implementation review, judgment calls, vision tasks | medium |
| **Deep** | `opus` | Primary implementation, creative expansion, retrospective | high |

## Why these tiers

- Read-only / mechanical work is best served by the fastest model — saves tokens, completes in seconds, accuracy is parity for these tasks
- Most reviewers + vision sit in the middle — Sonnet handles them well at lower cost
- The actual writing of new code (the implementer) gets Opus — this is where dollars are best spent

## Per-agent model assignments

The table below reflects the **actual current values** in each agent file. Where an agent deviates from the spec-default table in Section 0.6, that deviation is the authoritative assignment.

| Skill | Agent | Model | Effort | Readonly |
|---|---|---|---|---|
| **create-menu** | prd-reviewer | `sonnet` | medium | — |
| **cook-pizzas** | db-schema-stage-writer | `sonnet` | medium | — |
| **cook-pizzas** | master-checklist-synthesizer | `sonnet` | medium | — |
| **cook-pizzas** | phased-plan-writer | `sonnet` | medium | — |
| **set-display-case** | bundle-validator | `sonnet` | medium | — |
| **set-display-case** | compliance-pre-check | `sonnet` | medium | — |
| **set-display-case** | token-expander | `opus` | high | — |
| **open-the-shop** | env-verifier | `haiku` | low | — |
| **sell-slice** | checklist-curator | `sonnet` | medium | yes |
| **sell-slice** | ci-cd-guardrails *(deprecated → slice-verifier)* | `sonnet` | medium | yes |
| **sell-slice** | basic-checks-runner *(deprecated → slice-verifier)* | `haiku` | low | — |
| **sell-slice** | aggregating-test-reviewer *(deprecated → slice-verifier)* | `sonnet` | high | — |
| **sell-slice** | discovery | `haiku` | medium | yes |
| **sell-slice** | implementer | `opus` | xhigh | — |
| **sell-slice** | quality-reviewer | `opus` | high | yes |
| **sell-slice** | slice-tester | `sonnet` | high | — |
| **sell-slice** | slice-verifier | `sonnet` | high | — |
| **sell-slice** | spec-reviewer | `sonnet` | medium | yes |
| **sell-slice** (frontend) | block-composer | `sonnet` | medium | — |
| **sell-slice** (frontend) | component-crafter | `sonnet` | medium | — |
| **sell-slice** (frontend) | layout-architect | `sonnet` | medium | — |
| **sell-slice** (frontend) | modern-ux-expert | `sonnet` | medium | — |
| **sell-slice** (frontend) | state-illustrator | `sonnet` | medium | — |
| **sell-slice** (frontend) | visual-reviewer | `sonnet` | medium | yes |
| **special-order** | complexity-assessor | `sonnet` | medium | yes |
| **special-order** | phased-plan-writer (incremental mode) | `sonnet` | medium | — |
| **run-the-day** | pr-reviewer | `sonnet` | medium | yes |
| **run-the-day** | stage-runner | `opus` | high | — |
| **close-shop** | retrospective-reviewer | `opus` | high | — |

> **Note on `close-shop`:** The `retrospective-reviewer` agent is experimental. Its model and effort assignments are fixed as documented above.

> **v5 verification agents + deprecated aliases.** v5 splits per-slice verification into two singular-goal agents: `slice-tester` (independent behavioral/rendered testing, `sonnet/high`) and `slice-verifier` (all static gates run once — lint, typecheck, build, unit/integration, tagged e2e, design-system grep, CI-integrity, and the manifest under-declaration backstop — `sonnet/high`). The `slice-verifier` collapses three v4 agents: **`basic-checks-runner`**, the static half of **`aggregating-test-reviewer`**, and **`ci-cd-guardrails`**. Those three are **deprecated aliases of `slice-verifier`** in `modelTiers` and are retained as shimmed agent files for v4 back-compat through **5.1** — setting any of their camelCase keys (`basicChecksRunner`, `aggregatingTestReviewer`, `ciCdGuardrails`) resolves to `sliceVerifier`. Their rows above show the legacy assignments the shims still carry.

Aliases (`haiku`, `sonnet`, `opus`) resolve to:

- **Anthropic API:** `opus` → Claude Opus 4.7, `sonnet` → Claude Sonnet 4.6, `haiku` → Claude Haiku 4.5
- **Bedrock / Vertex / Foundry:** different defaults; pin via env vars (see below)

## Overriding the tier mapping

### Option 1: project-level (recommended)

Set in your shell or project `.env`:
```
ANTHROPIC_DEFAULT_OPUS_MODEL=claude-opus-4-7
ANTHROPIC_DEFAULT_SONNET_MODEL=claude-sonnet-4-6
ANTHROPIC_DEFAULT_HAIKU_MODEL=claude-haiku-4-5
```
This pins your tiers to specific versions while still letting sub-agent frontmatter use aliases.

### Option 2: global override

Set:
```
CLAUDE_CODE_SUBAGENT_MODEL=<some-model>
```
This forces ALL sub-agents to a single model regardless of frontmatter. Useful for cost-control during plugin development. Disable in production runs.

### Option 3: pin in frontmatter

Edit any sub-agent file and replace `model: sonnet` with a full version string. Not recommended — defeats auto-update.

## Effort levels

Each agent declares an effort level. Effort is independent of model. Override at session level via `/effort`.

| Effort | Use when |
|---|---|
| low | Mechanical, deterministic |
| medium | Default for most agents |
| high | Creative or complex reasoning |
| xhigh | Reserved for orchestrator and implementer in xhigh-supported environments |

## Tier-assignment principles applied in this plugin

The plugin intentionally invests heavier compute on agents that PRODUCE or VERIFY output. Specifically:

- The `implementer` (the primary code writer) runs at the deepest tier with the highest effort budget. It is assigned `opus/xhigh` — above the spec default of `opus/high` — because implementation quality directly determines rework cost.
- The `quality-reviewer` (the gate that catches what the implementer missed) runs at deep tier with high effort (`opus/high`). This is a user override from the spec default of `sonnet/medium`: the reasoning is that a Sonnet reviewer applied to Opus output would miss subtle issues that only a model of equal depth can catch.
- The `slice-verifier` runs at balanced tier with high effort (`sonnet/high`). It is the single gate that runs every static check once, so it must reason about precedence and environment interaction (subtle CI-config or design-system violations missed here are expensive to debug downstream) without burning Opus budget on otherwise deterministic checks. This inherits the rationale that kept the now-deprecated `ci-cd-guardrails` on `sonnet` (NOT `haiku/low` as the original spec assigned); the deprecated `basic-checks-runner` (`haiku/low`) and `aggregating-test-reviewer` (`sonnet/high`) fold into it.
- The `slice-tester` runs at balanced tier with high effort (`sonnet/high`). It writes and reasons over a bespoke behavioral plan, drives a browser, and (for data-flow slices) authors seed/cleanup scripts under a hard non-prod guard — judgment-heavy work that nonetheless does not author features, so balanced tier fits.
- Pure scan-and-list agents (`env-verifier`, `discovery`) stay on the fast tier — judgment is cheap there.
- The `token-expander` in `set-display-case` runs at deep tier (`opus/high`) because brand token expansion is a genuinely creative act; the output constrains the entire visual system.
- The `stage-runner` in `run-the-day` runs at deep tier (`opus/high`) because it coordinates full stage execution and must reason across multiple agent outputs.
