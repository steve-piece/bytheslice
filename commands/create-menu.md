<!-- commands/create-menu.md -->
<!-- Slash command that loads the create-menu skill: generate a complete PRD from a free-form project brief. Pizza-shop framing: pick today's pre-made pies. -->

---
description: Create the day's pre-made pizza menu. Generate a complete PRD (Product Requirements Document) from a free-form project brief. Use when the user provides a project description and wants a structured PRD, says "create a PRD", "write a PRD", "generate a PRD", "build a PRD", or "document requirements". Follows the Phased PRD Template v2 with 8 sections (0 to 7). References bundled defaults for tech stack, architecture, and delivery conventions.
---

# /create-menu

Load and follow the [`create-menu`](../skills/create-menu/SKILL.md) skill.

The skill generates a complete, canonical PRD from a free-form project brief:

1. Enters plan mode to resolve ambiguity (tech stack, architecture, delivery conventions) before writing any content.
2. Fills all 8 sections (0 to 7) of the Phased PRD Template v2 using the project brief and any uploaded specs or brand assets.
3. Applies bundled defaults (tech stack, architecture, delivery conventions) unless the user explicitly overrides them.
4. Invokes the `prd-reviewer` subagent as a final quality gate before handing the document back.

No hosting, database, auth or email vendor is a default: providers are whatever the operator authorized. Under `run.unattended: true` (set by `/pizza-party`) the skill reads `docs/pizza-party/order.md` first, takes its clarifying answers from it, records every other pick in the ticket, and never stops on the reviewer loop.

## When to use this command

Use `/create-menu` when you have a project description (however rough) and want a structured, implementation-ready PRD. The skill handles ambiguity resolution internally, you do not need a polished brief.

For converting a completed PRD into phased implementation plans, use `/cook-pizzas`.
