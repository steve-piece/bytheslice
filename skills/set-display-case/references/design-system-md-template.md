---
title: design-system.md Template
purpose: Template for the docs/design-system.md output artifact. Fill in project-specific token values and decisions. This file serves as the canonical human-readable reference for the project design system.
---

# design-system.md Template

This is the structural template for the design system documentation file written by `set-display-case`. The skill fills in actual project values from the validated bundle (Mode A) or approved token set (Mode B). Never copy placeholder values into a real project.

**Target path:** `docs/design-system.md` in the project root.

---

## Template

```markdown
# Design System

> This file is the canonical design token reference for this project.
> All styling decisions must reference tokens defined here.
> To add or change a token: update this file, then update `globals.css`, then update `tailwind.config.ts`.

---

## Surface Colors

**What this is:** The base layer colors that define page and component surfaces — the backgrounds that everything else sits on.

| Token | Light | Dark | Usage |
| --- | --- | --- | --- |
| `--background` | TBD | TBD | Page/app background |
| `--foreground` | TBD | TBD | Default text on background |
| `--card` | TBD | TBD | Card surface background |
| `--card-foreground` | TBD | TBD | Text on card |
| `--popover` | TBD | TBD | Popover/dropdown background |
| `--popover-foreground` | TBD | TBD | Text on popover |

---

## Brand Colors

**What this is:** The project's primary, secondary, and accent action colors. These define the visual identity and appear on interactive elements like buttons, links, and highlighted states.

| Token | Light | Dark | Usage |
| --- | --- | --- | --- |
| `--primary` | TBD | TBD | Primary action color |
| `--primary-foreground` | TBD | TBD | Text/icon on primary |
| `--secondary` | TBD | TBD | Secondary action or surface color |
| `--secondary-foreground` | TBD | TBD | Text/icon on secondary |
| `--accent` | TBD | TBD | Highlight, hover, or emphasis color |
| `--accent-foreground` | TBD | TBD | Text/icon on accent |

---

## Semantic Colors

**What this is:** Colors that communicate system state — errors, success confirmations, warnings, and informational notices. These are not decorative; they carry meaning.

| Token | Required | Light | Dark | Usage |
| --- | --- | --- | --- | --- |
| `--destructive` | Yes | TBD | TBD | Error, delete, danger |
| `--destructive-foreground` | Yes | TBD | TBD | Text on destructive |
| `--success` | Optional | TBD | TBD | Confirmation, completion |
| `--success-foreground` | Optional | TBD | TBD | Text on success |
| `--warning` | Optional | TBD | TBD | Caution, degraded state |
| `--warning-foreground` | Optional | TBD | TBD | Text on warning |
| `--info` | Optional | TBD | TBD | Informational, neutral notice |
| `--info-foreground` | Optional | TBD | TBD | Text on info |

> Remove optional rows that are not used in this project.

---

## Neutrals

**What this is:** Supporting colors for disabled states, subdued text, borders, input fields, and focus rings. These are intentionally low-contrast and quiet.

| Token | Light | Dark | Usage |
| --- | --- | --- | --- |
| `--muted` | TBD | TBD | Subdued background (disabled, inactive) |
| `--muted-foreground` | TBD | TBD | Subdued text |
| `--border` | TBD | TBD | Default border color |
| `--input` | TBD | TBD | Input field border/background |
| `--ring` | TBD | TBD | Focus ring color |

---

## Charts

**What this is:** A sequential palette for data visualization series. Each token maps to one data series. Colors must be distinguishable from each other and accessible.

| Token | Light | Dark |
| --- | --- | --- |
| `--chart-1` | TBD | TBD |
| `--chart-2` | TBD | TBD |
| `--chart-3` | TBD | TBD |
| `--chart-4` | TBD | TBD |
| `--chart-5` | TBD | TBD |

> Additional chart tokens (`--chart-6` and beyond) may be added if the project requires more series.

---

## Sidebar (if app shell)

**What this is:** Tokens specific to the persistent sidebar or navigation shell. Include this section only if the project has a sidebar layout. Remove this entire section for marketing sites or layouts without a sidebar.

| Token | Light | Dark | Usage |
| --- | --- | --- | --- |
| `--sidebar` | TBD | TBD | Sidebar background |
| `--sidebar-foreground` | TBD | TBD | Text and icons in sidebar |
| `--sidebar-primary` | TBD | TBD | Active/selected item |
| `--sidebar-primary-foreground` | TBD | TBD | Text on active sidebar item |
| `--sidebar-accent` | TBD | TBD | Hover state in sidebar |
| `--sidebar-accent-foreground` | TBD | TBD | Text on sidebar hover |
| `--sidebar-border` | TBD | TBD | Sidebar edge/separator |
| `--sidebar-ring` | TBD | TBD | Focus ring within sidebar |

---

## Typography — Font Families

**What this is:** The font stack definitions for the project. These are bound to Tailwind utilities (`font-sans`, `font-serif`, `font-mono`) via `tailwind.config.ts`.

| Token | Value | Usage |
| --- | --- | --- |
| `--font-sans` | TBD | Primary sans-serif stack |
| `--font-serif` | TBD | Serif stack |
| `--font-mono` | TBD | Monospace stack for code and data |
| `--font-display` | TBD (optional) | Display/headline variant |
| `--font-logo` | TBD (optional) | Logotype or wordmark font |

> Remove optional rows if not used.

---

## Typography — Type Scale

**What this is:** The size ramp for text throughout the project. Choose one approach and document it here — do not mix approaches within the same project.

**Approach chosen:** TBD — Size tokens (Option A) or Semantic tokens (Option B)

### Option A — Size Tokens (numeric scale)

| Token | Value | Usage |
| --- | --- | --- |
| `--text-xs` | TBD | 12px equivalent |
| `--text-sm` | TBD | 14px equivalent |
| `--text-base` | TBD | 16px equivalent |
| `--text-lg` | TBD | 18px equivalent |
| `--text-xl` | TBD | 20px equivalent |
| `--text-2xl` | TBD | 24px equivalent |
| `--text-3xl` | TBD | 30px equivalent |
| `--text-4xl` | TBD | 36px equivalent |

### Option B — Semantic Tokens (role-named scale)

| Token | Value | Role |
| --- | --- | --- |
| `--text-caption` | TBD | Smallest, labels/metadata |
| `--text-body-sm` | TBD | Compact body |
| `--text-body` | TBD | Default body |
| `--text-body-lg` | TBD | Emphasized body |
| `--text-heading-sm` | TBD | Section heading |
| `--text-heading` | TBD | Page heading |
| `--text-heading-lg` | TBD | Hero heading |
| `--text-display` | TBD | Marketing/hero display |

> Remove the option not chosen.

---

## Typography — Weights, Leading, Tracking

**What this is:** The full scale of font weights, line heights, and letter spacing values used in the project. Document even if mapping to Tailwind defaults.

### Font Weights

| Name | Value |
| --- | --- |
| Regular | 400 |
| Medium | 500 |
| Semibold | 600 |
| Bold | 700 |

### Line Heights (Leading)

| Name | Value |
| --- | --- |
| Tight | TBD |
| Normal | TBD |
| Relaxed | TBD |

### Letter Spacing (Tracking)

| Name | Value |
| --- | --- |
| Tight | TBD |
| Normal | TBD |
| Wide | TBD |

---

## Radius

**What this is:** The border-radius scale. The base `--radius` value sets the visual personality (sharp vs. rounded) and all derivatives scale from it.

| Token | Value | Usage |
| --- | --- | --- |
| `--radius` | TBD | Base radius value |
| `--radius-sm` | TBD | Inputs, tags |
| `--radius-md` | TBD | Cards, modals |
| `--radius-lg` | TBD | Panels |
| `--radius-xl` | TBD | Extra-large surfaces |
| `--radius-pill` | TBD | Badges, pills (fully rounded ends) |
| `--radius-full` | 9999px | Circles — avatars, icon buttons |

---

## Spacing

**What this is:** The spacing scale used for margin, padding, gap, and layout dimensions.

**Spacing Decision:** TBD — Using Tailwind default 4px-base scale, or a custom scale (list values below if custom).

> If using Tailwind defaults: record that decision here and remove the table below.

| Name | Value |
| --- | --- |
| TBD | TBD |

---

## Shadows

**What this is:** Elevation shadows that create depth and layer hierarchy. Each level corresponds to a z-layer in the UI.

| Token | Value | Usage |
| --- | --- | --- |
| `--shadow-sm` | TBD | Subtle lift — inputs, micro-elements |
| `--shadow-md` | TBD | Card elevation |
| `--shadow-lg` | TBD | Dropdown, popover |
| `--shadow-xl` | TBD | Modal, drawer |
| `--shadow-2xl` | TBD | Maximum elevation — lightbox, command palette |

> Optional brand shadows (e.g., `--shadow-brand`, `--shadow-glow`): TBD

---

## Motion

**What this is:** Duration and easing values for transitions and animations. Consistent motion timing prevents jarring UI.

**Motion Decision:** TBD — Defined as CSS custom properties in `globals.css`, or as Tailwind theme extensions in `tailwind.config.ts`.

### Duration Scale

| Token / Name | Value | Usage |
| --- | --- | --- |
| Fast | TBD (target ≤150ms) | Micro-interactions, tooltips |
| Normal | TBD (target 200–300ms) | Standard transitions |
| Slow | TBD (target 400–500ms) | Page transitions, large panels |

### Easing Curves

| Token / Name | Value | Usage |
| --- | --- | --- |
| Default | TBD | General ease |
| In | TBD | Elements entering |
| Out | TBD | Elements leaving |
| Spring | TBD | Bouncy/expressive moments |

---

## Breakpoints

**What this is:** Viewport breakpoints used for responsive layouts.

**Breakpoint Decision:** TBD — Using Tailwind defaults, or a custom scale (list values below if custom).

| Name | Value |
| --- | --- |
| `sm` | 640px |
| `md` | 768px |
| `lg` | 1024px |
| `xl` | 1280px |
| `2xl` | 1536px |

> If using Tailwind defaults, note that here and leave the table as documentation. Add or remove rows for custom breakpoints.

---

## Z-index

**What this is:** A named layering scale so that stacking contexts are explicit and predictable across the codebase. Never use arbitrary numbers — always reference a named layer.

| Layer | Value | Usage |
| --- | --- | --- |
| Base | TBD | Default document flow |
| Raised | TBD | Slightly elevated elements (sticky headers) |
| Dropdown | TBD | Menus and select dropdowns |
| Sticky | TBD | Fixed/sticky navigation |
| Overlay | TBD | Backdrop/scrim |
| Modal | TBD | Dialogs, drawers |
| Toast | TBD | Notification toasts |
| Tooltip | TBD | Tooltips — always topmost |

---

## Dark Mode

**What this is:** The implementation strategy for dark mode token overrides.

**Dark Mode Strategy:** TBD — `.dark` class on `<html>` element (Tailwind `darkMode: 'class'`), or `[data-theme="dark"]` attribute, or system `prefers-color-scheme`.

**Coverage:** Every color token defined in the Surface Colors, Brand Colors, Semantic Colors, Neutrals, Charts, and Sidebar sections above must have both a light and dark value. The `compliance-pre-check` agent enforces this.

**Color Format:** TBD — OKLCH, HSL, or hex. Document the chosen format here; all tokens in `globals.css` must use the same format consistently.

---

## Provenance

This file was generated by the `/set-display-case` skill.

- **Source mode:** TBD — `bundle` (Claude Design export validated) or `brief` (brand brief expanded by token-expander agent)
- **Generated:** TBD — replace with ISO date when the gate completes
- **Token bundle reference:** TBD — path to `docs/design-bundle/` (Mode A) or "N/A — brief mode" (Mode B)
- **Registry theme:** TBD, the registry name, theme item and install command when Mode B installed a configured registry's `theme` item, plus the brand-layer variables that were set; "none" otherwise. With a registry theme, list the derived token vocabulary its items use (state, soft, radius, shadow and focus classes) so gap components reuse it.

To regenerate or update this file, run `/set-display-case` with the updated bundle or brief. Do not edit token values directly without also updating `globals.css` and `tailwind.config.ts`.

## Decisions made without review

> Present only when `/set-display-case` ran with `run.unattended: true`. One bullet per prompt the run answered on its own. Review these first.

- **<question>:** <answer taken>. <one line: why, and how to revisit (re-run `/set-display-case`, or edit the brand layer)>
```

---

## Rules for Filling This Template

1. **Never leave TBD in a real project.** Every TBD slot must be replaced with an actual value before the `compliance-pre-check` gate can pass.
2. **Remove optional sections** that are not applicable to the project (sidebar for non-app-shell projects, optional semantic colors, optional font families).
3. **Remove the unchosen type scale option** (Option A or Option B) — leave only the one the project uses.
4. **Color format consistency**: once a color format is chosen (OKLCH, HSL, hex), use it throughout. Document the choice under "Dark Mode — Color Format."
5. **Unattended runs only**: keep the "Decisions made without review" section and fill one bullet per prompt answered by `run.unattended`. On an attended run, remove the section.
6. **Spacing and breakpoints**: if using Tailwind defaults, record that decision explicitly and leave the default values as documentation. Do not remove the table: it serves as evidence that the decision was made intentionally.

## Semantic map

One look per meaning. Every role, status, category or other repeated domain value gets exactly one icon, color token and badge variant, exported from one module (for example `lib/semantics.ts`) that every component reads. The first slice that introduces a value adds its row here and in the module.

| Value | Icon | Color token | Badge variant | Used for |
|---|---|---|---|---|
