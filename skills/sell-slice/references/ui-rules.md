<!-- skills/sell-slice/references/ui-rules.md -->
<!-- The default UI rules every UI agent follows unless the project's design system or the operator says otherwise: modern minimal surfaces, popular web apps as the quality bar, layered surfaces with real contrast through tokens, descriptions in tooltips, tokens first with one look per meaning, fast input, no layout shift and consistent micro-copy. design-critic reviews against them. -->

# Default UI rules

These hold in every project unless its `docs/design-system.md` or the operator says otherwise. The agents that build UI (`modern-ux-expert`, `layout-architect`, `block-composer`, `component-crafter`, `state-illustrator`, the implementer on a UI task) follow them; `design-critic` reviews against them; `/set-display-case` writes the short form into the project rules file.

## 1. Modern, minimal, clean surfaces

- **One primary action per view.** Secondary actions are outline or ghost buttons, or live in an overflow menu.
- **Space separates, not lines.** Use the spacing scale and surface contrast to group content; add a border only where two same-layer areas would otherwise merge.
- **Restraint.** One accent color. No decorative gradients, glows, heavy shadows or motion that carries no meaning.
- **Hierarchy through size and weight.** Two or three text sizes per view; secondary text uses the muted foreground token, never a new gray.
- **Density fits the job.** Logs, tables and dashboards are compact; forms and onboarding breathe.

## 2. Popular web apps are the quality bar

Before composing a surface, name one or two well-known apps that solve the same pattern and match their density, hierarchy and interaction model (for example Linear for lists and issue flows, Stripe or Vercel dashboards for tables and settings, Notion for editing, Raycast or Arc for command menus, Strava or Apple Fitness for activity logs). `modern-ux-expert` records them in the UX spec. The test for every finished surface: would it look at home next to those apps?

## 3. Layered surfaces with real contrast, all through tokens

- **A small layer stack.** Page `--background`, raised `--card`, overlay `--popover`, recessed `--muted` (wells, table headers, input fills). The sidebar is its own layer (`--sidebar`).
- **Adjacent layers are visibly distinct** in light and in dark mode: about 2 to 6 points of OKLCH lightness apart (roughly 3 to 8 percent in HSL lightness), so a card reads as a card without needing a border. In dark mode a higher layer is lighter, not darker.
- **Text meets WCAG AA on every layer:** 4.5:1 for body text, 3:1 for large text and UI glyphs, checked against the layer the text actually sits on.
- **Every color is a token, one token per role.** No raw hex, rgb or palette classes in components. The same role uses the same token everywhere: one border token, one muted-foreground token for secondary text, semantic tokens for success, warning and destructive, used sparingly.

## 4. Descriptions go into tooltips

AI agents tend to scatter explanations across cards, section headers and form fields. Surfaces carry **labels, values and actions**; explanations move out of the way:

- **Helper paragraphs, field descriptions and "what this does" copy** go into a tooltip on an info icon beside the label (or on the control itself), or a popover when the help is longer than two sentences.
- **Inline helper text** is one short line at most, and only where it prevents an error (a format hint such as `YYYY-MM-DD` belongs in the placeholder or that one line).
- **Page and section headers** are a title plus an optional one-line subtitle, never an introductory paragraph.
- **Empty, loading and error states** are one short sentence and one action.
- **Never hide what someone must read before acting:** the consequences of a destructive action stay in its confirm dialog, and validation errors stay inline.
- **Tooltips are accessible:** a keyboard-focusable trigger, `aria-describedby`, one or two sentences, and the same tooltip component everywhere.

## 5. Tokens first, one meaning one look

- **Tokens are built before any feature UI** (`/set-display-case`, the Prep pie) and every slice uses them; a slice never adds a raw value, and a missing token is added to the design system first.
- **A semantic map, defined once.** Every role, status, category or other repeated domain value (an admin role, a "planned" vs "completed" workout, a meal type) gets exactly one icon, one color token and one badge variant, recorded in the **Semantic map** section of `docs/design-system.md` and exported from one module (for example `lib/semantics.ts`). Components read from that module; they never pick an icon or color for a domain value inline. The first slice that introduces a value adds it to the map.
- **Same pattern, same component.** One tooltip, one dialog, one toast, one badge, one empty-state component across the app.

## 6. Fast input

- Smart defaults: today's date, the last value used, the most common choice preselected.
- The first field is focused when a form opens; Enter (or Cmd/Ctrl+Enter in a multi-line form) submits; Escape closes.
- Inputs use the right type and input mode (number, date, email) so mobile keyboards fit the field.
- Never ask for what the app already knows or can infer.

## 7. No layout shift

- Loading states are skeletons the size of the content, never a spinner that collapses the layout.
- Saves are optimistic: the change shows at once and rolls back with a message if it fails.
- Reserve space for images, badges and async counts so nothing jumps when they arrive.

## 8. Consistent micro-copy

- Sentence case everywhere (titles, buttons, labels, menu items).
- Buttons are verbs that say what happens ("Save meal", "Log workout"), never "OK" or "Submit".
- One icon set across the app, one stroke weight and size scale; icons accompany labels rather than replace them, except universally known ones in toolbars (with an accessible name and a tooltip).
- The same thing has the same name everywhere (never "entry" in one place and "record" in another).

## 9. Navigable

- The current location is always visible; primary navigation is at most two levels deep.
- Every surface is reachable without hover alone, and every action has a visible label or an accessible name.

## What design-critic checks

| Code | Finding when |
|---|---|
| `surface-contrast` | Two adjacent layers' computed backgrounds are under about 2 OKLCH lightness points apart (or the same color separated only by a border), in either mode |
| `text-contrast` | Text fails AA against the layer it sits on |
| `description-sprawl` | Visible explanatory text outside the main content runs over about 140 characters or two lines in a card, section header, form field or empty state: move it to a tooltip |
| `raw-color` | A component uses a color that is not a token (also the static check's job) |
| `extra-primary` | A view shows more than one primary-styled action |
| `semantic-drift` | The same role, status or domain value renders with a different icon, color or badge in two places, or a component picks them inline instead of from the semantic map |
| `layout-shift` | Content jumps when data, images or badges load (measured with a layout-shift observer while the page loads) |
| `copy-drift` | Title case, non-verb buttons ("OK", "Submit"), or two names for one thing |
