---
title: v2 QA Report (Wave 5.2)
branch: refactor/v2-design-system-frontend-quality
date: 2026-05-04
status: complete
---

# v2 QA Report — Wave 5.2 Cross-Skill Audit

Full read-through of every plugin file against 17 audit categories. Fixes applied inline. Items requiring human judgment are flagged in the **Human Attention Required** section.

---

## Fixes Applied

### 1. `commands/orchestrator.md`

**Issues found:**
- HTML comment header contained `<!-- Orchestrator Skill — Opus 4.7 -->` (hardcoded model version)
- Description block contained "Opus 4.7 stage-runner" and "Sonnet 4.6 pr-reviewer" (hardcoded versions)
- Precondition said "Opus 4.7 is the configured subagent model" (hardcoded version)
- Reference to deleted file: `skills/the-orchestrator/references/orchestrator-loop-checklist.md` (this file was removed in Wave 3; its content was embedded into SKILL.md as the Per-Stage Gate Checklist)

**Fixes applied:**
- Removed "Opus 4.7" from HTML comment header
- Replaced "Opus 4.7 stage-runner" → "opus-tier stage-runner"; "Sonnet 4.6 pr-reviewer" → "sonnet-tier pr-reviewer"
- Removed version-pin precondition; replaced with alias-language note
- Updated stale checklist link to reference the embedded checklist in `skills/the-orchestrator/SKILL.md`

---

### 2. `commands/feature-delivery.md`

**Issues found:**
- Description block: "Requires Opus 4.7 as the orchestrator; all subagents MUST use Sonnet 4.6 or smaller models" — hardcoded version pins
- Precondition listed a stale "skill/MCP scouting" step that referenced the deleted `skill-mcp-scout` skill

**Fixes applied:**
- Removed hardcoded model version language from description
- Removed version-pin precondition entirely
- Removed stale "skill/MCP scouting" step

---

### 3. `skills/the-orchestrator/SKILL.md`

**Issues found:**
- `description:` frontmatter field: `/the-orchestrator` (missing `sc-` prefix)
- Modes table: three rows contained `/the-orchestrator` instead of `/orchestrator`
- Hard Constraints section: "Only activate on `/the-orchestrator`"
- Triggers section: "/the-orchestrator" (optionally with flags)
- Stale development note: "(created in Wave 4 — link resolves after that wave)"

**Fixes applied:**
- Fixed all 5 occurrences of `/the-orchestrator` → `/orchestrator`
- Removed stale Wave 4 development note

---

### 4. `skills/sp-feature-delivery/SKILL.md`

**Issues found:**
- Model Override section contained: "This file is created in Wave 4 — link will resolve after that wave completes." referring to `references/model-tier-guide.md` (the file now exists)

**Fixes applied:**
- Removed stale Wave 4 development note; model-tier-guide.md link is now a clean reference

---

### 5. `skills/prd-to-phased-plans/SKILL.md`

**Issues found:**
- Two references to `/prd-generator` without the `sc-` prefix (Scope section and Input clarification)

**Fixes applied:**
- Fixed both occurrences: `/prd-generator` → `/prd-generator`

---

### 6. `skills/sp-frontend-design/SKILL.md`

**Issues found:**
- HTML comment header line 9: `<!-- skills/frontend-design/SKILL.md -->` — wrong `sc-` prefix in file-path comment
- Line 37: "All six agents live in `skills/frontend-design/agents/`" — should be `skills/sp-frontend-design/agents/`

**Fixes applied:**
- Line 9: `sc-frontend-design` → `sp-frontend-design`
- Line 37: `sc-frontend-design` → `sp-frontend-design`

---

### 7. `references/model-tier-guide.md`

**Issues found:**
- Note at bottom of table: "> **Note on `phased-dev-retrospective`:** The `retrospective-reviewer` agent was added in Wave 4.4 and may not yet be present in all installations. If missing, skip this row." — stale development note; retrospective-reviewer is fully shipped and present.

**Fixes applied:**
- Replaced stale Wave 4.4 "may not yet be present" note with accurate present-tense note: retrospective-reviewer is experimental with fixed model/effort assignments.

---

### 8. `.cursor-plugin/plugin.json`

**Issues found:**
- `name`: "phased-dev-workflow" (stale, pre-rename)
- `version`: "1.0.0" (stale)
- `description`: old description omitting ByTheSlice branding and v2 capabilities
- `keywords`: included "linear" (should not be a top-level keyword; Linear is optional integration)
- `skills` and `commands` paths used bare names without `./` prefix (inconsistent with `.claude-plugin/plugin.json`)
- Included stale `agents` field

**Fixes applied:**
- Updated to match `.claude-plugin/plugin.json` exactly: name "bytheslice", version "2.0.0", updated description, aligned keywords, `"skills": "./skills"`, `"commands": "./commands"`, removed stale `agents` field

---

## Audit Category Results

| # | Category | Status | Notes |
|---|---|---|---|
| 1 | Command prefix sweep (`sc-`) | PASS | All 9 commands use `sc-` prefix. Internal references within skills fixed. |
| 2 | Skill folder naming (`sp-*`) | PASS | All skill folders use `sp-` prefix; `the-orchestrator` and `phased-dev-retrospective` correctly retain their names. |
| 3 | Agent `name:` normalization | PASS | All agent frontmatter `name:` fields are short-form without `sp-` prefix. |
| 4 | Model aliases (no version pins in skill files) | PASS (with note) | All skill/agent files use `haiku`/`sonnet`/`opus` aliases. Version strings in `references/model-tier-guide.md` are intentional examples in the override documentation — see Human Attention Required. |
| 5 | HITL contract (sub-agents never call `ask_user_input_v0`) | PASS | All sub-agents return `needs_human: true` and bubble up. Orchestrators call `ask_user_input_v0`. |
| 6 | Sub-agent return contract shape | PASS | All reviewed agents include `status`, `summary`, `artifacts`, `needs_human`, `hitl_category`, `hitl_question`, `hitl_context`. Wave 2.1/2.2 vs Wave 2.3 frontmatter shape difference noted below. |
| 7 | Checkbox format (`[ ]` only, no `- [ ]`) | PASS | No leading-dash checkboxes found in any skill, command, or reference file. |
| 8 | Linear references (optional-only, gated via Q2) | PASS | No unconditional Linear references in deployed files. `modern-ux-expert.md` references "Linear" as a UI design reference (product UX, not integration) — acceptable. |
| 9 | Stale wave development notes | FIXED | Four stale Wave 3/4 development notes removed from `the-orchestrator/SKILL.md`, `sp-feature-delivery/SKILL.md`, `model-tier-guide.md`. |
| 10 | Stale file references | FIXED | `orchestrator-loop-checklist.md` link fixed; `skill-mcp-scout` reference removed. |
| 11 | Model tier table accuracy | PASS | `references/model-tier-guide.md` table matches actual `model:` and `effort:` values in all agent files. |
| 12 | Visual reviewer screenshot instructions | PASS | `sp-frontend-design/agents/visual-reviewer.md` contains the required full-page multi-viewport screenshot instructions exactly. |
| 13 | Platform-specific reference guard | PASS | No "cursor rules" or "windsurf rules" language in generated-file instructions; files use "project rules file" consistently. |
| 14 | Frontmatter shape consistency | NOTE | Wave 2.1/2.2 agents use YAML-only frontmatter; Wave 2.3/3 agents use HTML comment header + YAML frontmatter. Both patterns are functionally valid. Not mass-rewritten — see Human Attention Required. |
| 15 | Plugin manifest accuracy | FIXED | `.cursor-plugin/plugin.json` updated to v2 ByTheSlice identity. `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json` already correct. |
| 16 | README accuracy | PASS (with note) | README content is accurate. Installation section uses `/add-plugin phased-dev-workflow` — needs update post-rename. See Human Attention Required. |
| 17 | Hard constraint completeness | PASS | All orchestrator/skill files include Hard Constraints sections. No missing constraint blocks found. |

---

## Human Attention Required

### HA-1: README Installation Section — Plugin Name

**File:** `/Users/stevenlight/phased-dev-workflow/README.md` line 14

**Issue:** Installation command reads `/add-plugin phased-dev-workflow`. After the plugin is published/renamed to "bytheslice" in the marketplace, this should become `/add-plugin bytheslice`.

**Action:** Update after the marketplace rename is live. Do not update before publish — the old name is still the correct install path until the rename propagates.

---

### HA-2: Model Version Strings in model-tier-guide.md

**File:** `/Users/stevenlight/phased-dev-workflow/references/model-tier-guide.md` lines 68–70 (env var override examples)

**Issue:** The env var override documentation contains explicit version strings:
```
ANTHROPIC_DEFAULT_OPUS_MODEL=claude-opus-4-7
ANTHROPIC_DEFAULT_SONNET_MODEL=claude-sonnet-4-6
ANTHROPIC_DEFAULT_HAIKU_MODEL=claude-haiku-4-5
```
These are intentional examples showing how to pin to specific versions. However, they are version-pinned and will become stale when new model versions are released.

**Action:** These are in the "how to override" section, not in skill frontmatter — so they don't violate the alias-only rule for skills. However, consider adding a comment that these are examples and users should check the Anthropic docs for the current latest model IDs. This is a documentation quality item, not a correctness bug.

---

### HA-3: Frontmatter Shape Inconsistency (Wave 2.1/2.2 vs Wave 2.3/3)

**Files affected:**
- Wave 2.1/2.2 style (YAML-only frontmatter): agents in `sp-design-system-gate/`, `sp-environment-setup-gate/`, `prd-generator/`, `phased-dev-retrospective/`
- Wave 2.3/3 style (HTML comment + YAML frontmatter): agents in `sp-feature-delivery/`, `the-orchestrator/`, `sp-frontend-design/`

**Issue:** Two different frontmatter patterns coexist in the plugin. The Wave 2.3/3 style places an HTML comment with the file path before the `---` frontmatter block. This is functionally valid — the YAML parser skips the comment — but creates visual inconsistency.

**Action:** Decide whether to normalize all agents to the Wave 2.3 style (HTML comment header + YAML) as a future housekeeping wave, or accept both patterns as valid. Do not auto-apply — the mass edit risk outweighs the cosmetic benefit without a deliberate decision.

---

### HA-4: README Local Path Reference

**File:** `/Users/stevenlight/phased-dev-workflow/README.md`

**Issue:** The README contains `Local clone: /Users/stevenlight/phased-dev-workflow` — a user-specific absolute path. This is appropriate for a personal workflow file but may look odd if the README is published publicly.

**Action:** Review before any public release of the plugin documentation.

---

## Files Unchanged (PASS)

The following files were read and audited with no issues found:

- `commands/prd-generator.md`
- `commands/prd-to-phased-plans.md`
- `commands/design-system-gate.md`
- `commands/ci-cd-scaffold.md`
- `commands/environment-setup-gate.md`
- `commands/frontend-design.md`
- `commands/retrospective.md`
- `skills/prd-generator/SKILL.md`
- `skills/phased-dev-retrospective/SKILL.md`
- `skills/sp-design-system-gate/SKILL.md`
- `skills/sp-ci-cd-scaffold/SKILL.md`
- `skills/sp-environment-setup-gate/SKILL.md`
- `skills/the-orchestrator/agents/stage-runner.md`
- `skills/the-orchestrator/agents/pr-reviewer.md`
- `skills/sp-feature-delivery/agents/discovery.md`
- `skills/sp-feature-delivery/agents/implementer.md`
- `skills/sp-feature-delivery/agents/quality-reviewer.md`
- `skills/sp-feature-delivery/agents/ci-cd-guardrails.md`
- `skills/sp-feature-delivery/agents/spec-reviewer.md`
- `skills/sp-feature-delivery/agents/checklist-curator.md`
- `skills/sp-frontend-design/agents/visual-reviewer.md`
- `skills/sp-frontend-design/agents/modern-ux-expert.md`
- `skills/sp-frontend-design/agents/layout-architect.md`
- `skills/sp-frontend-design/agents/block-composer.md`
- `skills/sp-frontend-design/agents/component-crafter.md`
- `skills/sp-frontend-design/agents/state-illustrator.md`
- `skills/sp-design-system-gate/agents/bundle-validator.md`
- `skills/sp-design-system-gate/agents/token-expander.md`
- `skills/sp-design-system-gate/agents/compliance-pre-check.md`
- `skills/sp-environment-setup-gate/agents/env-verifier.md`
- `skills/prd-generator/agents/prd-reviewer.md`
- `skills/phased-dev-retrospective/agents/retrospective-reviewer.md`
- `references/architecture-conventions.md`
- `references/templates.md`
- `references/stage-frontmatter-contract.md` (in prd-to-phased-plans/references/)
- `references/canned-stages/` (all files)
- `rules/prd-ci-cd-checklist.mdc`
- `.claude-plugin/plugin.json`
- `.claude-plugin/marketplace.json`

---

## Summary

**Total files audited:** 57  
**Files with fixes applied:** 8  
**Fixes total:** 16 individual changes  
**Items flagged for human attention:** 4  
**Blocking issues remaining:** 0
