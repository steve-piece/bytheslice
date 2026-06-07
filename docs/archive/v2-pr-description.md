# ByTheSlice v2 — Refactor PR

**Suggested PR title:** `[v2] ByTheSlice: design-system gate, env-setup gate, frontend-design skill, HITL gates, model alias system`

**Branch:** `refactor/v2-design-system-frontend-quality` → `main`

---

## 1. Summary

This PR delivers the full v2 refactor of the phased-dev-workflow plugin, now officially renamed **ByTheSlice** (plugin name: `bytheslice`, version `2.0.0`). The refactor reorganizes the four foundation stages so that design-system validation comes first (before CI/CD), adds two entirely new foundation gates (env-setup and the conditional db-schema-foundation), introduces a dedicated frontend-design skill with a six-agent visual pipeline, hardens the human-in-the-loop architecture so that only the orchestrator ever prompts the user (all subagents bubble HITL triggers up via structured return fields), and migrates every model reference from hardcoded version strings to tier aliases (`haiku`, `sonnet`, `opus`). Nine skills now ship with `sc-`-prefixed slash commands; completion checklists are embedded directly inside skill files rather than living in separate reference documents; and a new `references/model-tier-guide.md` documents the three-tier model philosophy and all override paths for project-level customization.

---

## 2. What changed by skill

### prd-generator (refactored)

- Restructured PRD output to seven canonical sections (Project Metadata, Problem & Users, Functional Requirements, Non-Functional Requirements, Technical Architecture, UX & Content Fundamentals, Open Questions & Assumptions, Out of Scope)
- Added mandatory plan-mode question gate (3–7 clarifying questions using `ask_user_input_v0` before generating the PRD)
- Architecture conditional rule: marketing-only single site → single Next.js app; marketing + auth/admin/dashboard combination → Turborepo monorepo; ambiguous cases surface as a plan-mode question
- New subagent `agents/prd-reviewer.md` (`sonnet`, medium) runs as the final step, validates spec completeness, and triggers a revision loop (capped at 2 iterations before HITL escalation)
- Added Handoff Contract section mapping PRD sections to downstream phased-plan inputs
- `references/prd-template-v2.md` updated to match new section structure
- `references/project-defaults.md` updated: added token category contract, made architecture default conditional, removed Linear references

### prd-to-phased-plans (major refactor)

- Scope reset: input is a finalized PRD only — briefs, specs, and questionnaires are `prd-generator`'s job
- Four dedicated canned stage-writer subagents: `design-system-stage-writer`, `ci-cd-scaffold-stage-writer`, `env-setup-stage-writer`, `db-schema-stage-writer` (conditional)
- New `master-checklist-synthesizer` subagent (`sonnet`, medium): mechanically aggregates `completion_criteria` from every stage file's YAML frontmatter into `00_master_checklist.md`
- New `references/architecture-conventions.md`: opinion-free baseline of universal web standards, performance facts, and framework-version facts — no opinionated rules
- New `references/stage-frontmatter-contract.md`: required YAML shape for all stage files
- `references/canned-stages/` directory with four pre-authored stage templates (stages 1–4)
- Linear integration is now optional via a question gate; removed from the main flow
- Auth-tagged stages auto-inject a dev-mode user switcher task for RBAC testing

### sp-design-system-gate (NEW)

- Entirely new skill: validates or generates a token-driven design system before any feature work begins
- Supports two input modes: bundle-first (Claude Design handoff bundle provided) and brief-first (brand primitives only)
- Three subagents: `bundle-validator` (`sonnet`), `token-expander` (`opus`, high effort for creative brand expansion), `compliance-pre-check` (`sonnet`)
- Blocks the orchestrator from advancing to Stage 2 until the design system is committed and validated

### sp-environment-setup-gate (NEW)

- Entirely new skill: guides the human through external account setup and `.env.local` population before any feature stages begin
- Runs a structured checklist of required services (Supabase, Stripe, Resend, etc.) derived from the PRD's service requirements
- `env-verifier` subagent (`haiku`, low effort): mechanical `.env.local` scan against expected keys; returns pass/fail verdict
- New references: `references/env-checklist-template.md`, `references/known-services-catalog.md`

### sp-frontend-design (NEW)

- Entirely new skill: delivers frontend-tagged feature stages through a six-agent visual pipeline optimized for design-system compliance and visual fidelity
- Six subagents in sequence: `modern-ux-expert` (UX pattern selection, `sonnet`), `layout-architect` (shell-level layout, `sonnet`), `block-composer` (section composition, `sonnet`), `component-crafter` (token-only component authoring, `sonnet`), `state-illustrator` (loading/error/empty coverage, `sonnet`), `visual-reviewer` (Claude in Chrome screenshot verification, `sonnet`)
- `visual-reviewer` uses a hardcoded tool priority: Claude in Chrome extension → Chrome DevTools MCP → Playwright → Vizzly; no tool discovery
- Screenshots always full-page, multi-viewport at 375 / 768 / 1280 / 1920

### sp-ci-cd-scaffold (v2)

- Completion checklist is now embedded directly in `SKILL.md` (separate `scaffold-completion-checklist.md` removed)
- Added design-system-compliance gate, `@visual` Playwright suite, and db-schema-drift detection (conditional on database in PRD)
- `references/scaffold-artifact-templates.md` updated to include new suite and gate templates

### sp-feature-delivery (slimmed)

- Skill file reduced by approximately 50%: completion checklist embedded, `skill-mcp-scout` subagent removed (MCPs are declared upstream in the phased plan and read from the rules file)
- All six remaining subagents use model aliases only; no version strings
- HITL bubble-up implemented: `discovery`, `checklist-curator`, `implementer`, `spec-reviewer`, `quality-reviewer`, `ci-cd-guardrails` all return structured HITL fields instead of prompting directly
- `ci-cd-guardrails` (`sonnet`) blocks PR creation if existing CI gates would weaken
- Three project-level model overrides applied: `implementer` = opus + xhigh effort, `quality-reviewer` = opus + high effort, `ci-cd-guardrails` = sonnet + medium effort

### the-orchestrator (redefined)

- Redefined as a pure conductor: reads `00_master_checklist.md`, dispatches one `stage-runner` subagent per stage in strict sequence, verifies each PR via `pr-reviewer`, enforces clean-`main` invariant between stages
- Orchestrator is the **only** surface that calls `ask_user_input_v0`; all subagents bubble up
- Three modes now formally documented: default (supervised, pauses between every stage), `--auto-mvp` (auto-advances MVP stages, pauses before Phase 2 and on HITL), `--auto-all` (auto-advances all stages, pauses only on HITL)
- Embedded per-stage checklist replaces the removed `references/orchestrator-loop-checklist.md`
- `references/per-stage-prompt-template.md` added: exact prompt template sent to each `stage-runner`
- `stage-runner` subagent: `opus`, high effort; `pr-reviewer` subagent: `sonnet`, medium effort

### phased-dev-retrospective (NEW, experimental)

- Cross-stage friction detection skill invoked manually after a full plan completes
- `retrospective-reviewer` subagent (`opus`, high effort): reads master checklist, all stage files, and git history to surface recurring HITL triggers, CI failures, scope drift, and model-assignment mismatches
- Drafts improvement PRs back to the plugin repository
- Marked experimental; not called by the orchestrator

### references/model-tier-guide.md (NEW)

- New top-level reference documenting the three-tier model philosophy (`haiku` for fast/mechanical, `sonnet` for judgment/pattern-matching, `opus` for creative/highest-stakes work)
- Full tier table with every agent's model and effort assignment
- Override paths documented: `ANTHROPIC_DEFAULT_*_MODEL` env vars and `CLAUDE_CODE_SUBAGENT_MODEL`

---

## 3. Breaking changes

**Stage order changed.** Stage 1 is now `design-system-gate` (was CI/CD scaffold in v1). CI/CD is now Stage 2. Any v1 project that had already completed Stage 1 (CI/CD) must manually mark `stage_2_ci_cd_scaffold.md` as completed in the master checklist before running the orchestrator.

**HITL bubbling is now enforced.** Sub-agents can no longer call `ask_user_input_v0` directly. All human-input requests return `needs_human: true` with a structured HITL category, question, and context. The orchestrator (or standalone skill at end-of-turn) is the only surface that prompts the user. Any custom v1 sub-agents that prompted directly will need to be updated to the return contract in Section 2.3 of the spec.

**Embedded checklists replace separate reference files.** The standalone `completion-checklist.md` and `scaffold-completion-checklist.md` files have been removed. Their contents are embedded inside the respective skill files. Any tooling or workflow that referenced those file paths directly will break.

**Slash commands now use the `sc-` prefix.** `/the-orchestrator` → `/orchestrator`, `/sp-feature-delivery` → `/feature-delivery`, `/prd-generator` → `/prd-generator`, etc. Saved shortcuts or documentation pointing to the old command names will need updating.

**`skill-mcp-scout` subagent removed.** MCPs are now declared upstream in the phased plan stage files and read from the project's rules file (cursor or claude). Any workflow that invoked `skill-mcp-scout` directly no longer has that entry point.

**YAML frontmatter required on all stage files.** Stage files without the v2 frontmatter shape will not be correctly processed by the `master-checklist-synthesizer` or the orchestrator's stage-type dispatch logic.

---

## 4. New required project setup steps

**Design-system gate (Stage 1, mandatory).** Every project must now pass through `sp-design-system-gate` before feature work begins. Minimum requirement: a committed token set covering the eight universal token categories (color, typography, spacing, radius, shadow, motion, z-index, breakpoints). Projects with an existing design system can run the compliance-pre-check mode. Projects starting from a Claude Design handoff bundle use the bundle-first mode.

**Env-setup gate (Stage 3, mandatory).** Before feature stages run, `sp-environment-setup-gate` guides the human through populating `.env.local` with all service credentials required by the PRD. The `env-verifier` subagent scans the file and returns a pass/fail verdict. The orchestrator does not advance to feature stages until the gate passes.

**Claude Design handoff bundle (optional upstream input).** If the project team uses Claude Design out-of-band to generate brand assets and a design token brief, that bundle can now be passed to `/prd-generator` as an optional input. The bundle flows through to `sp-design-system-gate` as the starting point for token expansion, replacing the brief-first path. This is entirely optional; projects without a Claude Design bundle use the brief-first path.

**Model tier guide review.** Before running the orchestrator on a new project, review `references/model-tier-guide.md` and set any desired project-level model overrides via `ANTHROPIC_DEFAULT_*_MODEL` or `CLAUDE_CODE_SUBAGENT_MODEL`. The three pre-applied project overrides (implementer = opus + xhigh, quality-reviewer = opus + high, ci-cd-guardrails = sonnet + medium) are reasonable defaults but can be adjusted.

---

## 5. Migration notes for existing users

1. **Pull the branch and review the new stage architecture.** Read the updated README, especially the Stage Architecture and Migration from v1 sections. Confirm you understand that Stage 1 is now design-system-gate and Stage 2 is ci-cd-scaffold.

2. **Re-run `/prd-to-phased-plans` against your existing PRD.** This regenerates stage files with v2 YAML frontmatter, which the `master-checklist-synthesizer` requires. Your existing PRD file is still valid input — no changes to it are needed.

3. **Mark already-completed stages before running the orchestrator.** If your project completed v1's Stage 1 (CI/CD scaffold), open the newly generated `docs/plans/00_master_checklist.md` and mark `stage_2_ci_cd_scaffold.md` as completed. If your project does not need a design system, stub Stage 1 by completing `stage_1_design_system_gate.md` manually with a minimal token set.

4. **Update any custom sub-agents to the v2 return contract.** Any sub-agents you authored for v1 that called `ask_user_input_v0` directly must be updated to return `needs_human: true` with `hitl_category`, `hitl_question`, and `hitl_context` instead. The full return shape is in Section 2.3 of the spec.

5. **Update saved slash command shortcuts.** The `sc-` prefix is now applied to all nine commands. Update any keyboard shortcuts, aliases, or documentation that references the old command names.

6. **Update the install command after the repo rename.** The GitHub repository will be renamed from `phased-dev-workflow` to `bytheslice` post-merge. At that point, update the `/add-plugin` install command in your team's setup docs from `/add-plugin phased-dev-workflow` to `/add-plugin bytheslice`. Do not update before the rename propagates in the marketplace.

---

## 6. Acceptance checklist

Before opening the PR, every item below must be true.

[ ] All 9 skills have slash command shims in `commands/`
[ ] All stage templates use `[ ]` checkbox format (no `- [ ]`)
[ ] All YAML frontmatter present on stage templates, skill files, agent files
[ ] No hardcoded model versions; all use aliases (`haiku`, `sonnet`, `opus`)
[ ] No "cursor rules" or "claude rules" references except inline as "(cursor or claude rules file)"
[ ] `prd-generator` has plan-mode questions step + `prd-reviewer` subagent + handoff contract
[ ] `prd-to-phased-plans` has elicitation phase, four dedicated stage-writer subagents, master-checklist-synthesizer, architecture-conventions reference
[ ] `sp-design-system-gate` exists with bundle-first and brief-first input modes
[ ] `sp-environment-setup-gate` exists with .env scanning, manual checklist, env-verifier
[ ] `sp-frontend-design` exists with all 6 subagents (modern-ux-expert, layout-architect, block-composer, component-crafter, state-illustrator, visual-reviewer)
[ ] `sp-ci-cd-scaffold` v2 has design-system-compliance, @visual suite, db-schema-drift (conditional), embedded checklist
[ ] `sp-feature-delivery` slimmed by ~50%, model aliases per agent, HITL bubble-up, `skill-mcp-scout` removed, embedded checklist
[ ] `the-orchestrator` v2 redefined as conductor, three modes, HITL handling, embedded references
[ ] `phased-dev-retrospective` exists, marked experimental
[ ] `references/model-tier-guide.md` exists at plugin root
[ ] `architecture-conventions.md` exists in `prd-to-phased-plans/references/` containing ONLY: universal web standards, performance facts, structural variants (single-app vs monorepo), conditional security baseline, conditional framework-version syntactic facts. **No opinionated rules.**
[ ] Auth-tagged stages auto-inject dev-mode user switcher task
[ ] All checklists embedded in skill files (no separate checklist `.md` files)
[ ] README + plugin manifest updated, version bumped to 2.0.0
[ ] `docs/v2-qa-report.md` written
[ ] `docs/v2-pr-description.md` written
[ ] Branch `refactor/v2-design-system-frontend-quality` ready to PR against main

---

## 7. Testing performed

**CP-1-smoke:** Simulated `/prd-generator` dry-run against `tests/fixtures/sample-brief.md` returned PASS on all three structural gates (plan-mode question gate fired, prd-reviewer subagent ran, handoff contract section present in output PRD).

**Wave 5.2 cross-skill QA audit:** Full read-through of all 57 plugin files against 17 audit categories completed. 8 files corrected, 16 individual fixes applied, 0 blocking issues remaining. See `docs/v2-qa-report.md` for the full audit log.

Additional testing (to be filled in during final PR creation):

[ ] End-to-end `/prd-generator` → `/prd-to-phased-plans` → `/design-system-gate` flow on a real project brief
[ ] `/environment-setup-gate` standalone run against a populated `.env.local`
[ ] `/frontend-design` against a frontend-tagged stage from the generated plan
[ ] `/orchestrator --auto-mvp` run through stages 1–3 on a greenfield project

---

## 8. Naming + UX changes

### Plugin rename: phased-dev-workflow → ByTheSlice

The plugin is now officially named **ByTheSlice**. The lowercase plugin name used in manifest files and the marketplace is `bytheslice`. The GitHub repository (`steve-piece/phased-dev-workflow`) will be renamed to `bytheslice` after this PR merges. The install command will update from `/add-plugin phased-dev-workflow` to `/add-plugin bytheslice` once the marketplace rename propagates.

### Slash command prefix: `sc-`

All nine slash commands now use the `sc-` prefix (standing for **s**tage**c**oach). This eliminates collisions with other Claude Code plugins and makes commands easy to recall.

| Old command | New command |
|-------------|-------------|
| `/prd-generator` | `/prd-generator` |
| `/prd-to-phased-plans` | `/prd-to-phased-plans` |
| `/the-orchestrator` | `/orchestrator` |
| `/sp-design-system-gate` | `/design-system-gate` |
| `/sp-ci-cd-scaffold` | `/ci-cd-scaffold` |
| `/sp-environment-setup-gate` | `/environment-setup-gate` |
| `/sp-frontend-design` | `/frontend-design` |
| `/sp-feature-delivery` | `/feature-delivery` |
| `/phased-dev-retrospective` | `/retrospective` |

### Skill folder names preserved

Skill folder names (e.g., `skills/sp-feature-delivery/`, `skills/sp-design-system-gate/`) retain their existing naming conventions. Only user-facing slash commands carry the `sc-` brand prefix.

### Agent name fields normalized

All agent frontmatter `name:` fields have been stripped of the `sp-` prefix (e.g., `name: discovery` not `name: sp-discovery`). This affects internal agent identity only and has no impact on skill dispatch or command invocation.

### Model assignments: aliases only, three project overrides

All model assignments across every skill and agent file use tier aliases only — no version strings appear in any skill frontmatter. The three project-level overrides applied in this refactor are:

| Agent | Model alias | Effort |
|-------|-------------|--------|
| `implementer` | `opus` | `xhigh` |
| `quality-reviewer` | `opus` | `high` |
| `ci-cd-guardrails` | `sonnet` | `medium` |

All other agents use the default tier assignments documented in `references/model-tier-guide.md`. Override any assignment per-project via the `ANTHROPIC_DEFAULT_*_MODEL` or `CLAUDE_CODE_SUBAGENT_MODEL` env vars.

---

## 9. Known follow-ups (non-blocking)

These items were identified during the Wave 5.2 cross-skill audit (`docs/v2-qa-report.md`, Human Attention Required section) and are explicitly deferred — none block this PR from merging.

**HA-1: README install command update (post-repo-rename)**
The install command in `README.md` currently reads `/add-plugin phased-dev-workflow`. After the GitHub repository is renamed to `bytheslice` and the marketplace rename propagates, this must be updated to `/add-plugin bytheslice`. Do not update before the rename is live — the old name remains the correct install path until then.

**HA-2: Version strings in model-tier-guide.md override examples**
The env var override documentation in `references/model-tier-guide.md` contains explicit version strings (e.g., `ANTHROPIC_DEFAULT_OPUS_MODEL=claude-opus-4-7`) as illustrative examples of how to pin to a specific version. These are intentional — they demonstrate the override mechanism, not the recommended practice — but they will become stale as new model versions are released. Consider adding a note directing users to check the Anthropic documentation for current model IDs. This is a documentation quality item, not a correctness bug.

**HA-3: Frontmatter shape inconsistency across waves**
Two frontmatter patterns coexist in the plugin. Agents written in Waves 2.1 and 2.2 use YAML-only frontmatter; agents written in Waves 2.3 and 3 use an HTML comment header (containing the file path) followed by YAML frontmatter. Both patterns are functionally valid — the YAML parser ignores the HTML comment — but they create visual inconsistency when reading across agent files. A future housekeeping wave should decide whether to normalize all agents to the Wave 2.3 style. The mass-edit risk outweighs the cosmetic benefit without a deliberate decision, so no auto-apply was performed in this refactor.

**HA-4: Local path reference in README**
`README.md` contains the line `Local clone: /Users/stevenlight/phased-dev-workflow` — an author-specific absolute path. This is appropriate for a personal workflow file but will look odd if the README is published publicly or shared with other users. Review and strip before any public release of the plugin documentation.

---

## 10. Files of note

- `/Users/stevenlight/phased-dev-workflow/README.md` — ByTheSlice branding, updated Mermaid workflow diagram, `sc-` prefix command table, Migration from v1 section
- `/Users/stevenlight/phased-dev-workflow/references/model-tier-guide.md` — NEW; documents the plugin's three-tier model philosophy, full agent tier table, and all override paths
- `/Users/stevenlight/phased-dev-workflow/skills/phased-dev-retrospective/` — NEW (experimental); cross-stage friction detection skill
- `/Users/stevenlight/phased-dev-workflow/skills/sp-design-system-gate/` — NEW; design system validation/generation skill (Stage 1)
- `/Users/stevenlight/phased-dev-workflow/skills/sp-environment-setup-gate/` — NEW; env setup and verification skill (Stage 3)
- `/Users/stevenlight/phased-dev-workflow/skills/sp-frontend-design/` — NEW; six-agent frontend delivery pipeline
- `/Users/stevenlight/phased-dev-workflow/docs/v2-qa-report.md` — full Wave 5.2 audit log: 57 files audited, 8 fixed, 4 items flagged for human attention
- `/Users/stevenlight/phased-dev-workflow/.claude-plugin/plugin.json` — version bumped to 2.0.0, name updated to `bytheslice`
- `/Users/stevenlight/phased-dev-workflow/.cursor-plugin/plugin.json` — aligned to match `.claude-plugin/plugin.json`

---

Generated by ByTheSlice v2 refactor session.
