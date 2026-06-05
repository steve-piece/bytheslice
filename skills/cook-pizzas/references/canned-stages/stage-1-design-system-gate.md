---
stage: 1
name: "Design System Gate"
type: design-system
slice: horizontal
mvp: true
depends_on: []
estimated_tasks: 4
hitl_required: false
hitl_reason: null
linear_milestone: null
completion_criteria:
  - tests_passing
  - token_files_committed
  - design_system_compliance_check_passing
---

<!-- docs/plans/stage_1_design_system_gate.md -->
<!-- Stage 1: Establish design system — tokens, component baseline, and design-system-compliance gate -->

# Stage 1 — Design System Gate

**Goal:** Establish the complete design system before any feature work begins — token files, base component configuration, and the design-system-compliance CI check.

**Architecture:** This is a horizontal foundation stage. All feature stages (5+) depend on the token system and component library established here. The design-system-compliance CI job added in Stage 2 validates against the artifacts produced here.

**Tech stack:**
- Token tooling: design-system-specific (shadcn, Tailwind CSS variables, or custom)
- Available design MCPs: [project-specific — from Q7]
- CI: design-system-compliance check (added in Stage 2, but tokens defined here)

**Dependencies from prior stages:** none

---

## UX context (project-specific)

> Populated from PRD Section 5 (UX & Content Fundamentals):
> - Brand voice and tone:
> - Primary brand color direction:
> - Typography stance:
> - Design reference or bundle path (if Claude Design bundle provided):

---

## Tasks

### Task 1: Establish token categories

[ ] Define values for ALL of the following token categories. Every category is mandatory — no skipping.

**Color tokens:**
- `--color-brand-primary`
- `--color-brand-secondary`
- `--color-brand-accent`
- `--color-neutral-[50|100|200|300|400|500|600|700|800|900]`
- `--color-semantic-success`
- `--color-semantic-warning`
- `--color-semantic-error`
- `--color-semantic-info`
- `--color-surface-base`
- `--color-surface-raised`
- `--color-surface-overlay`
- `--color-text-primary`
- `--color-text-secondary`
- `--color-text-disabled`
- `--color-text-inverse`
- `--color-border-default`
- `--color-border-focus`

**Typography tokens:**
- `--font-family-sans`
- `--font-family-mono`
- `--font-size-[xs|sm|base|lg|xl|2xl|3xl|4xl|5xl]`
- `--font-weight-[regular|medium|semibold|bold]`
- `--line-height-[tight|normal|relaxed]`
- `--letter-spacing-[tight|normal|wide]`

**Spacing tokens:**
- `--spacing-[1|2|3|4|5|6|8|10|12|16|20|24|32]` (4px base unit)

**Border tokens:**
- `--radius-[sm|md|lg|xl|full]`
- `--border-width-[thin|default|thick]`

**Shadow tokens:**
- `--shadow-[sm|md|lg|xl]`

**Motion tokens:**
- `--duration-[fast|normal|slow]`
- `--easing-[default|in|out|spring]`

**Commit:** `design: establish design token definitions`

---

### Task 2: Configure component library baseline

[ ] Install and configure the primary component library (shadcn, Radix, or per project stack)
[ ] Apply token values to the component library configuration
[ ] Verify focus rings, hit targets, and color contrast meet the baseline in `references/architecture-conventions.md`
[ ] Test dark mode token variants if in scope (check PRD Section 5)

**Commit:** `design: configure component library with project tokens`

---

### Task 3: Document token usage patterns

[ ] Write `docs/design-system.md` with:
  - Token reference table
  - Which component library is in use and why
  - How to add a new token (process, naming convention)
  - Semantic color usage guide (when to use `--color-semantic-error` vs `--color-brand-primary`)
[ ] If design MCP available: document how to reference the MCP for component generation

**Commit:** `docs: design system token reference and usage guide`

---

### Task 4: Smoke-test the design system

[ ] Render a test page with: heading, body text, primary button, secondary button, input field, error state, success badge
[ ] Verify all tokens resolve correctly (no `var(--color-undefined)` fallbacks)
[ ] Verify `prefers-reduced-motion` is respected by at least one animated element
[ ] Verify color contrast on primary and secondary text meets WCAG AA (4.5:1 for normal text)

**Commit:** `test: design system smoke test page`

---

**Exit criteria:**
- `pnpm build` (or equivalent) passes with design token configuration
- Smoke-test page renders all components without errors
- No undefined token references
- Primary text color passes WCAG AA contrast check
- Skeleton loader pattern for future use is defined (even if not yet used)
