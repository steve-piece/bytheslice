---
name: create-menu
description: Create the day's pre-made pizza menu — turn a project brief into a structured 8-section PRD with phased implementation guidance.
model: opus
effort: high
user-invocable: true
triggers: ["/bytheslice:create-menu", "/create-menu", "create the menu", "plan the menu", "today's menu", "/bytheslice:write-prd", "/write-prd", "write a prd", "generate a prd", "create a prd", "write prd", "build a prd"]
---

<!-- skills/create-menu/SKILL.md -->
<!-- Pizza-shop framing: pick the day's pre-made pies for the display tray (the PRD = the menu). PRD generator from a free-form brief; uses plan mode to resolve ambiguity before writing, and invokes `prd-reviewer` as its final step. -->

# Create Menu — PRD Generator

Generate a complete, canonical PRD from a free-form project brief. This skill uses plan mode to resolve ambiguity before writing, and invokes `prd-reviewer` as its final step.

## Mode detection

`/create-menu` is **always standalone**. It produces a single output artifact (`docs/prd-<slug>.md`) regardless of whether a master checklist already exists. No checklist coordination, no Prep-section interaction.

The PRD it produces feeds the next step (`/cook-pizzas`), but that handoff is a user action, not a skill-to-skill coordination.

## Inputs

Collect before generating:

1. **Project brief** (required) — free-form description of the product: what it does, who it's for, why it exists.
2. **Uploaded specs** (optional) — any existing requirements docs, design specs, API docs, visual references.
3. **Brand assets** (optional) — logo, brand guide, color palette, typography references.
4. **Explicit overrides** (optional) — deliberate divergences from the default stack, architecture, or conventions.

## Reference Files

Read both before entering plan mode:

| File | Used For |
| --- | --- |
| [references/prd-template-v2.md](references/prd-template-v2.md) | Section structure, headings, and prompts |
| [references/project-defaults.md](references/project-defaults.md) | Default tech stack, services, architecture conditional, token contract |

---

## Step 1 — Plan-Mode Question Gate (REQUIRED)

After reading the brief and any uploaded specs, MUST enter plan mode before generating any PRD content.

**Analyze the brief for ambiguities, then generate 3–7 clarifying questions.** Do not generate more than 7. Cover only what is genuinely ambiguous after inference from context and defaults. Present questions ONE AT A TIME using `ask_user_input_v0` (use `single_select` or `multi_select` where possible — avoid free-text when a choice set is realistic).

**Always provide a recommended answer in available options.**

**Question topics to cover (only if ambiguous in the brief):**

- **Target users** — who specifically will use this product? (if vague)
- **Monetization model** — free / subscription / one-time purchase / usage-based / not monetized? (if not stated)
- **Scope edges** — what is explicitly NOT in scope? (helps populate Section 7)
- **Must-have vs nice-to-have** — which features are required for launch vs Phase 2?
- **Implied integrations** — the brief implied [X] but didn't confirm — is it needed?
- **Architecture signal** — does this need any authenticated experience (auth, dashboard, admin, client portal)? (if unclear — needed for architecture conditional below)
- **Any other ambiguity** specific to this brief

All answers from plan mode populate **Section 6 (Open Questions & Explicit Assumptions)** of the PRD.

---

## Step 2 — Architecture Conditional Rule

Before writing Section 4 (Technical Architecture), evaluate the architecture type:

| Signal | Architecture |
| --- | --- |
| Marketing-only single site (no auth, no dashboard, no admin, no client portal) | Single Next.js app — **NOT a monorepo** |
| Marketing + any combination of: auth, admin panel, client dashboard, user portal | Turborepo monorepo |

**Detection:** read the brief and plan-mode answers. If unclear, surface this as a plan-mode question (see Step 1). Do not default to monorepo without signal.

This decision drives Section 4 content and the `project-defaults.md` architecture field.

---

## Step 3 — Brief Mapping Heuristic

When parsing the project brief, extract these signals and route them to the right sections:

| Signal in Brief | Routes To |
| --- | --- |
| Nouns (objects, records, things users interact with) | Section 2 (Functional Requirements) — capabilities |
| Verbs (what users do) | Section 2 (Functional Requirements) |
| "For [audience]" or "[role] who needs..." | Section 1 (Problem & Users) — user paragraph |
| "So that [outcome]" or "to [achieve X]" | Section 1 (Problem & Users) — problem paragraph |
| "Without [thing]" or "instead of [alternative]" | Section 7 (Out of Scope) |
| "Connects to [service]" or "uses [provider]" | Section 2 implied integrations |
| "Must [perform/scale/comply]" | Section 3 (Non-Functional Requirements) |
| Time references ("first," "later," "eventually") | Section 6 (Open Questions — phasing assumptions) |

---

## Step 4 — Generation Workflow

1. Read both reference files.
2. Complete the plan-mode question gate (Step 1).
3. Determine architecture type (Step 2).
4. Apply the brief mapping heuristic (Step 3).
5. Map the project brief to each template section (0–7).
6. For every section not addressed by the brief:
   - Apply defaults from `project-defaults.md` where applicable.
   - Mark unknown specifics with the tagged TBD convention (see below) rather than inventing them.
   - When inferring, mark inline: `[Inferred: reasoning]`.
7. Run the **Consistency Check** (see below) before writing the file.
8. Write the complete PRD as a single markdown file to `docs/prd-[project-slug].md`.
9. Dispatch `bytheslice:prd-reviewer` as the final step: pass the draft PRD plus all source materials.
10. If reviewer returns `verdict: revise`, apply suggestions and re-run the reviewer. Cap at 2 iterations.
11. If still `revise` after 2 iterations, return `needs_human: true` with `hitl_category: prd_ambiguity`.
12. End the response with a generation summary (see format below).

---

## Tagged TBD Convention

Not all gaps are equal. Use these tags so downstream readers know what's urgent:

| Tag | Meaning | Example |
| --- | --- | --- |
| `[TBD-BLOCKER]` | Must be resolved before Stage 1 work begins | `[TBD-BLOCKER] auth model: SSO vs email/password` |
| `[TBD-ASSUMPTION]` | Working assumption documented, validate during design | `[TBD-ASSUMPTION] users will tolerate email-only login for MVP` |
| `[TBD-DEFER]` | Can be resolved later in the project lifecycle | `[TBD-DEFER] localization scope, English only at launch` |
| `[Inferred: reason]` | Filled in based on context, flag for review | `[Inferred: B2B SaaS based on "team workspace" language]` |

---

## Consistency Check

Before writing the file, verify:

[ ] Every capability in **Section 2** maps to at least one non-functional constraint in **Section 3**
[ ] Every integration implied in **Section 2** is accounted for in **Section 4**
[ ] Every open question from plan-mode answers appears in **Section 6**
[ ] **Section 7** contains at least 2 explicit out-of-scope items
[ ] Architecture choice in **Section 4** matches the conditional rule (Step 2)
[ ] Every `[TBD-BLOCKER]` item is surfaced in **Section 6**

If any check fails, fix the gap before writing the file or explicitly flag it with a tagged TBD.

---

## Output

- **File**: `docs/prd-[project-slug].md`, or `docs/prd.md` if no slug is obvious.
- **Header**: Two lines at top — (1) relative path, (2) one-line semantic description.
- **Structure**: Follow [references/prd-template-v2.md](references/prd-template-v2.md) exactly. All sections 0–7 must be present, even if sparse. Never omit a section.

---

## Handling Missing Information

| Situation | Action |
| --- | --- |
| Tech stack not specified | Apply defaults from `project-defaults.md` |
| Integrations not mentioned | List defaults (Supabase, Stripe, Resend); mark optional ones `[TBD-DEFER]` |
| Data model not described | Enumerate entities implied by the brief; mark attributes `[TBD-ASSUMPTION]` |
| Personas vague | Draft 1–2 personas from context; mark with `[Inferred: ...]` |
| Auth model unspecified | Ask in plan-mode gate (affects architecture conditional) |
| Multi-tenancy unclear | Ask before generating — this affects schema and RLS design |
| Performance targets missing | Apply defaults from `project-defaults.md` NFR section |
| Out-of-scope not stated | Ask in plan-mode gate; ensure Section 7 is not empty |

---

## prd-reviewer Integration

After writing the PRD, dispatch `bytheslice:prd-reviewer` ([definition](agents/prd-reviewer.md)) with:

- The draft PRD file path
- All source materials: brief, uploaded specs, brand assets, API docs, visual references
- Plan-mode question answers

The reviewer returns a structured verdict. On `verdict: revise`, apply the `suggested_revisions` list and re-dispatch. Cap at 2 iterations. If still failing, set `needs_human: true` with `hitl_category: prd_ambiguity` and surface the specific blocking issues.

---

## Generation Summary Format

After writing the PRD file and completing the review loop, end the response with:

```markdown
## PRD Generation Summary

**Confirmed** (from brief, defaults, or plan-mode answers):
- ...

**Assumed** (inferred or working assumptions):
- ...

**Blocked** (TBD-BLOCKER items needing input):
- ...

**Reviewer result**: pass | revise (N iterations)
```

---

## Completion Checklist

[ ] Plan-mode gate completed (3–7 questions asked and answered)
[ ] Architecture conditional evaluated and documented in Section 4
[ ] All 8 sections (0–7) present in the output PRD
[ ] No Linear references in output
[ ] Consistency check passed (or gaps flagged with TBD tags)
[ ] `prd-reviewer` dispatched and returned `verdict: pass` (or HITL surfaced after 2 iterations)
[ ] PRD written to `docs/prd-[project-slug].md`
[ ] Generation summary included in response
[ ] All `- [ ]` checkbox syntax converted to `[ ]` in output

---

## Handoff Contract

The PRD produced by this skill feeds downstream skills as follows:

| PRD Section | Feeds |
| --- | --- |
| Section 2 (Functional Requirements) | Drives feature stages in `/cook-pizzas` |
| Section 3 (Non-Functional Requirements) | Drives CI/CD scaffold gates + visual review checklist |
| Section 4 (Technical Architecture) | Drives monorepo decision + db-schema-foundation conditional |
| Section 5 (UX & Content Fundamentals) | Drives design-system gate input |
| Section 6 (Open Questions & Assumptions) | Drives phased-plan elicitation + HITL category 1 triggers |
| Section 7 (Out of Scope) | Guards every stage from scope creep — referenced throughout orchestration |

Pass the full PRD file path to `/cook-pizzas` after human review and sign-off.
