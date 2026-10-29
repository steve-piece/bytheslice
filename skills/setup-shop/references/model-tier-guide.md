---
title: Model Tier Guide
version: "2.0"
---

# Model Tier Guide

The ByTheSlice plugin uses three model tiers across all sub-agents. Each tier maps to an Anthropic alias that auto-resolves to the latest version per provider.

| Tier | Alias | Use cases | Effort default |
|---|---|---|---|
| **Fast** | `haiku` | Mechanical checks, file scans, template writes | low |
| **Balanced** | `sonnet` | Implementation review, judgment calls, vision tasks | medium |
| **Deep** | `opus` | Primary implementation, codebase discovery, plan writing, creative expansion, retrospective | medium |

## Why these tiers

- Mechanical work (scans, file checks, template writes) is best served by the fastest model: it saves tokens, completes in seconds, accuracy is parity for these tasks
- Discovery and plan writing get Opus: every later agent builds on the map and the plan, so a gap there costs far more rework than the tokens saved
- Most reviewers + vision sit in the middle; Sonnet handles them well at lower cost
- The actual writing of new code (the implementer) gets Opus; this is where dollars are best spent
- Every Opus agent runs at effort `medium`: the model depth carries the quality, and a higher effort on top mostly adds latency and tokens

## Per-agent model assignments

The table below lists every registered agent with the **actual current values** in its file (`model:` and `effort:` frontmatter). The frontmatter is authoritative; `node --test tests/model-tiers/` fails when this table, a skill roster or the Pass role defaults drift from it.

| Skill | Agent | Model | Effort | Readonly |
|---|---|---|---|---|
| **setup-shop** | bootstrap-runner | `sonnet` | medium | no |
| **setup-shop** | ci-cd-detector | `haiku` | low | yes |
| **setup-shop** | config-generator | `haiku` | low | no |
| **create-menu** | brief-analyzer | `sonnet` | medium | yes |
| **create-menu** | consistency-checker | `haiku` | low | yes |
| **create-menu** | prd-reviewer | `sonnet` | medium | yes |
| **cook-pizzas** | db-schema-stage-writer | `opus` | medium | no |
| **cook-pizzas** | master-checklist-synthesizer | `opus` | medium | no |
| **cook-pizzas** | phased-plan-writer | `opus` | medium | no |
| **cook-pizzas** | rules-assembler | `sonnet` | medium | no |
| **cook-pizzas** | stage-decomposer | `sonnet` | medium | yes |
| **set-display-case** | bundle-validator | `sonnet` | medium | yes |
| **set-display-case** | compliance-pre-check | `sonnet` | medium | yes |
| **set-display-case** | library-route-scaffolder | `sonnet` | medium | no |
| **set-display-case** | token-expander | `opus` | medium | no |
| **open-the-shop** | checklist-generator | `haiku` | low | yes |
| **open-the-shop** | env-scanner | `haiku` | low | yes |
| **open-the-shop** | env-verifier | `haiku` | low | yes |
| **open-the-shop** | github-secrets-scanner | `haiku` | low | yes |
| **final-quality-check** | a11y-discovery-runner | `sonnet` | medium | yes |
| **final-quality-check** | branch-protection-writer | `haiku` | low | no |
| **final-quality-check** | e2e-installer | `sonnet` | medium | no |
| **final-quality-check** | framework-detector | `haiku` | low | yes |
| **final-quality-check** | husky-installer | `haiku` | low | no |
| **final-quality-check** | lint-config-writer | `haiku` | low | no |
| **final-quality-check** | local-gates-runner | `sonnet` | medium | no |
| **final-quality-check** | scaffold-discovery | `opus` | medium | yes |
| **final-quality-check** | workflow-writer | `sonnet` | medium | no |
| **sell-slice** | checklist-curator | `sonnet` | medium | yes |
| **sell-slice** | debug-instrumenter | `sonnet` | high | no |
| **sell-slice** | discovery | `opus` | medium | yes |
| **sell-slice** | fix-attempter | `sonnet` | high | no |
| **sell-slice** | implementer | `opus` | medium | no |
| **sell-slice** | quality-reviewer | `opus` | medium | yes |
| **sell-slice** | rules-loader | `haiku` | low | yes |
| **sell-slice** | slice-tester | `sonnet` | high | no |
| **sell-slice** | slice-verifier | `sonnet` | high | yes |
| **sell-slice** | spec-reviewer | `sonnet` | medium | yes |
| **sell-slice** (frontend) | block-composer | `sonnet` | medium | no |
| **sell-slice** (frontend) | break-ui-runner | `sonnet` | medium | no |
| **sell-slice** (frontend) | component-crafter | `sonnet` | medium | no |
| **sell-slice** (frontend) | design-critic | `sonnet` | high | no |
| **sell-slice** (frontend) | layout-architect | `sonnet` | medium | no |
| **sell-slice** (frontend) | library-entry-writer | `sonnet` | medium | no |
| **sell-slice** (frontend) | modern-ux-expert | `sonnet` | medium | no |
| **sell-slice** (frontend) | state-illustrator | `sonnet` | medium | no |
| **sell-slice** (frontend) | ui-fix-attempter | `opus` | medium | no |
| **box-it-up** | ci-fix-attempter | `sonnet` | high | no |
| **inspect-display** | platform-walker | `sonnet` | high | yes |
| **special-order** | complexity-assessor | `opus` | medium | yes |
| **special-order** | phased-plan-writer (incremental mode) | `opus` | medium | no |
| **close-shop** | proposal-drafter | `sonnet` | medium | yes |
| **close-shop** | retrospective-reviewer | `opus` | medium | yes |

> **Note on `close-shop`:** The `retrospective-reviewer` agent is experimental. Its model and effort assignments are fixed as documented above.

> **v5 verification agents.** v5 splits per-slice verification into two singular-goal agents: `slice-tester` (independent behavioral/rendered testing, `sonnet/high`) and `slice-verifier` (all static gates run once: lint, typecheck, build, unit/integration, tagged e2e, design-system grep, CI-integrity, and the manifest under-declaration backstop; `sonnet/high`). The `slice-verifier` replaces the three v4 static verifiers, and the v4 rendered visual review now lives in `slice-tester`.

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

Edit any sub-agent file and replace `model: sonnet` with a full version string. Not recommended: it defeats auto-update.

## Effort levels

Each agent declares an effort level. Effort is independent of model. Override at session level via `/effort`.

| Effort | Use when |
|---|---|
| low | Mechanical, deterministic |
| medium | Default for most agents |
| high | Complex reasoning on a `sonnet` agent (testers, verifiers, fixers) |

Every `opus` agent runs at `medium`; `opus` with `high` or `xhigh` fails `tests/model-tiers/`.

## Tier-assignment principles applied in this plugin

The plugin intentionally invests heavier compute on agents that PRODUCE or VERIFY output. Specifically:

- The `implementer` (the primary code writer) runs at the deepest tier (`opus/medium`) because implementation quality directly determines rework cost.
- The `quality-reviewer` (the gate that catches what the implementer missed) runs at deep tier (`opus/medium`). This is a user override from the spec default of `sonnet/medium`: the reasoning is that a Sonnet reviewer applied to Opus output would miss subtle issues that only a model of equal depth can catch.
- The `slice-verifier` runs at balanced tier with high effort (`sonnet/high`). It is the single gate that runs every static check once, so it must reason about precedence and environment interaction (subtle CI-config or design-system violations missed here are expensive to debug downstream) without burning Opus budget on otherwise deterministic checks. This inherits the rationale that kept the v4 CI-integrity gate on `sonnet` (NOT `haiku/low` as the original spec assigned).
- The `slice-tester` runs at balanced tier with high effort (`sonnet/high`). It writes and reasons over a bespoke behavioral plan, drives a browser, and (for data-flow slices) authors seed/cleanup scripts under a hard non-prod guard, judgment-heavy work that nonetheless does not author features, so balanced tier fits.
- Pure scan-and-list agents (`env-verifier` and the other `/open-the-shop` scanners) stay on the fast tier; judgment is cheap there.
- Discovery (`discovery`, `scaffold-discovery`, `complexity-assessor`) and plan writing (`phased-plan-writer`, `db-schema-stage-writer`, `master-checklist-synthesizer`) run at deep tier (`opus/medium`). Everything downstream builds on their output: a missed caller, a wrong stack fingerprint or a vague plan line costs a whole slice of rework, far more than the Opus tokens spent up front.
- The `token-expander` in `set-display-case` runs at deep tier (`opus/medium`) because brand token expansion is a genuinely creative act; the output constrains the entire visual system.
