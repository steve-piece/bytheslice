<!-- skills/sell-slice/references/ui-rules.md -->
<!-- The default UI rules every UI agent follows unless the project's design system or the operator says otherwise: modern minimal surfaces, popular web apps as the quality bar, layered surfaces with real contrast through tokens, and descriptions in tooltips. design-critic reviews against them. -->

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

## 5. Navigable

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
