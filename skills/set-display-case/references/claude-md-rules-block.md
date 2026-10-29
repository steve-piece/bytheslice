---
title: Design System Rules Block Template
purpose: Verbatim rules block that set-display-case appends to the project rules file (CLAUDE.md or AGENTS.md). set-display-case fills in the token catalog path and project-specific code patterns, then appends it.
---

# Design System Rules Block Template

The `set-display-case` skill appends the block below to the project rules file (the file may be named `CLAUDE.md`, `AGENTS.md`, or an equivalent — the skill detects which is present). This file is the authoritative source for that block's content and structure.

## How set-display-case uses this template

1. The skill reads this file after all token artifacts have been written.
2. It fills in the `Token catalog` path (always `docs/design-system.md`) and populates the "Project-specific code patterns" subsection with only the code-pattern answers the user provided in Step 4.
3. If a code-pattern question was skipped or answered with "None yet" / "No data tables" / "No data-dense UI", that pattern is **omitted entirely** — do not add placeholder text.
4. It keeps the "Registries first" subsection (with the configured registry names filled in, in order) only when `ui.registries` is non-empty, and removes it otherwise. Registry URLs and names come from config, never from this template.
5. The completed block is appended to the project rules file. Existing content is never overwritten.
6. A horizontal rule (`---`) is inserted before the block if the rules file already has content, to create a clear visual separator.

---

## Rules Block (append verbatim, then fill placeholders)

```markdown
## Design System Rules (enforced by CI)

Token catalog: `docs/design-system.md`. Every styling decision references tokens.

### Allowed
- Tailwind semantic utilities mapped to tokens
- shadcn/ui primitives (use tokens internally)
- Arbitrary values ONLY when referencing a token: `w-[var(--container-md)]`

### Forbidden
- Raw color utilities (`bg-red-500`, `text-blue-600`, etc.)
- Hex/RGB/HSL/OKLCH literals in className or style
- Inline `style={{}}` with hardcoded values
- New CSS files outside globals.css
- Hardcoded font-family values; use `font-sans/serif/mono/display`

### When you need a new token
1. Add to `docs/design-system.md` and `globals.css`
2. Reference via Tailwind config; never inline
3. Update this catalog

### Preview-first UI workflow

UI changes go through the operator-only `/library` showcase route BEFORE landing in any production route. `/sell-slice`'s Phase 4.5 (Library Preview Gate) enforces this — non-skippable for new components AND for consumer-side edits that change a user-visible surface (props, copy, content, variants, states, or styles) of an existing library component. Pure internal refactors with no rendered-output delta are exempt.

- **`?tab=<id>` routing.** One page route at `/library` reads `?tab=<id>` and resolves it against the single grouped registry in `_registry/registry.tsx` (legacy alias, then exact id, then the pinned `DEFAULT_TAB`), so an unknown id falls back instead of throwing. Each entry is one file under `_entries/<id>-entry.tsx`; the URL is always `/library?tab=<id>`.
- **One entry per component / block.** Each entry renders the full variants × states matrix (default / hover / focus / disabled / loading / empty / error / populated) and registers with one line in `LIBRARY_GROUPS`. Ids are the deep-link contract: never renamed or reused; a retired id goes into `LEGACY_TAB_ALIASES`.
- **Source-path copy buttons.** Every entry uses `<EntryHeader sourcePath=…>` and `<EntrySection sourcePath=… sourceLines=…>` so the operator can click an icon button next to the H1 (or any state H3) and paste a Markdown link like `[Disabled](components/ui/button.tsx:42-58)` straight into a Claude Code chat.
- **HARD STOP at the preview gate.** No production-route import happens until the user explicitly approves the entry. The orchestrator surfaces a self-critique block (skipped states, untested edge cases, close-but-not-exact tokens) and a clickable `http://localhost:<port>/library?tab=<id>` URL per entry before asking for approval.
- **Closing narrative.** Stages that land UI write a one-paragraph design-story summary (what was built · why this shape · what was left out · what reviewers should pay attention to) into the commit body, so the PR description carries the rationale forward.

### UI defaults

- Modern, minimal, clean surfaces: one primary action per view, space and surface contrast to group content, one accent color, no decorative effects.
- Popular web apps that solve the same pattern are the quality bar (name them in the UX spec).
- Layered surfaces through tokens only: `--background`, `--card`, `--popover`, `--muted` and `--sidebar` stay visibly distinct in light and dark mode, and every text color meets WCAG AA on the layer it sits on.
- Explanations go into tooltips (an info icon beside the label, or a popover for longer help). Surfaces carry labels, values and actions; headers are a title and at most a one-line subtitle; inline helper text is one short line, only where it prevents an error.
- Consistent labeling: every role, status, type or other repeated domain value is shown with the same label and the same treatment everywhere (whatever fits: text, badge, chip, icon, color), defined once in the **Semantic map** of `docs/design-system.md` and exported from one module; components never choose them inline, and nothing gets decoration it does not need. One component per pattern (tooltip, dialog, toast, badge, empty state).
- Fast input: smart defaults, the first field focused, Enter submits, Escape closes, the right input types.
- No layout shift: skeletons sized like the content, optimistic saves, reserved space for async content.
- Micro-copy: sentence case, verb buttons ("Save meal"), one icon set, one name per thing.

### Registries first

<!-- Fill in the operator's own registries in order, or say "the public shadcn registry directory" when they have none. -->
UI installs pre-built pages, blocks and components before anything is hand-written: from <the operator's registries, in order | the public shadcn registry directory> and then stock shadcn, a page over a block over a component (`node <plugin>/scripts/ui-sources.js` resolves the list, `npx shadcn@latest search` finds items). Install with `yes n | npx shadcn@latest add <item> --yes`, never `--overwrite`. Never re-create an item a registry offers, never edit an installed item to restyle it (change tokens or pass `className`), and build anything no registry covers with the registry's token vocabulary. Registry blocks are presentational: pass data through their props and delete any `<name>.mock.ts` they shipped.

Before adding a new library entry, ask: does an existing primitive already cover this? Should it be extended instead? Is this composition library-worthy or does it belong inline in the consuming feature? Reserve the library for things that recur in 3+ places or have non-trivial behavior worth previewing in isolation.

### Project-specific code patterns
> Captured during the design system gate. These are project preferences, not universal rules.
> Examples (only present if applicable to the project): variant system library to use, status indicator visual pattern, numeric column treatment, icon library, etc.
```

---

## Placeholder Reference

When the skill fills in this template, it replaces the "Project-specific code patterns" section body with the user's actual answers. The result looks like the example below — only the answered questions appear, formatted as a definition list:

```markdown
### Project-specific code patterns
> Captured during the design system gate. These are project preferences, not universal rules.

- **Variant library:** CVA (class-variance-authority)
- **Status indicators:** Soft pill badges
- **Icon library:** Lucide
```

If no code-pattern questions were answered, the subsection heading and its blockquote description are kept, but no bullet list is added — this signals to future agents that the patterns are intentionally deferred, not forgotten.

---

## Formatting Rules for the Appended Block

1. **Checkbox syntax:** GitHub task-list items, `- [ ]` and `- [x]`, one per line. Never a bare `[ ]` without the list marker, since that renders as plain text.
2. **No platform-specific bare references:** write "project rules file" rather than "cursor rules" or "claude rules."
3. **No model version pinning** in any content derived from this template.
4. **No hardcoded values** in the token catalog path — always `docs/design-system.md`.
5. **Append only:** the skill must never overwrite or truncate the existing rules file.
