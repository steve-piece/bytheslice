---
title: Token Completeness Checklist
purpose: Authoritative list of token categories the compliance-pre-check agent verifies. The design-system gate refuses to complete until every required category is satisfied.
---

# Token Completeness Checklist

This is the canonical gate. `agents/compliance-pre-check.md` runs against this list. Every **required** category must be fully present before the gate passes. **Optional** categories are noted — include them if relevant to the project.

Values are never dictated here — they vary per project. This checklist concerns **category coverage**, not specific values.

---

## Surface Colors (required)

Every token below must have a light-mode value AND a dark-mode value.

| Token | Notes |
| --- | --- |
| `--background` | Page/app background |
| `--foreground` | Default text on background |
| `--card` | Card surface background |
| `--card-foreground` | Text on card |
| `--popover` | Popover/dropdown background |
| `--popover-foreground` | Text on popover |

**Layer contrast (required).** `--background`, `--card`, `--popover`, `--muted` and `--sidebar` form a layer stack, and adjacent layers must be visibly distinct in light AND dark mode: at least about 2 points of OKLCH lightness apart (2 to 6 is the target), with a higher layer lighter in dark mode. `compliance-pre-check` computes the deltas from the values in the CSS entry file and fails the gate on a pair under 2. Every `-foreground` token meets WCAG AA (4.5:1) on its own layer. See the default UI rules ([`../../sell-slice/references/ui-rules.md`](../../sell-slice/references/ui-rules.md)).

---

## Brand Colors (required)

Every token below must have a light-mode value AND a dark-mode value.

| Token | Notes |
| --- | --- |
| `--primary` | Primary action color |
| `--primary-foreground` | Text/icon on primary |
| `--secondary` | Secondary action or surface color |
| `--secondary-foreground` | Text/icon on secondary |
| `--accent` | Highlight, hover, or emphasis color |
| `--accent-foreground` | Text/icon on accent |

---

## Semantic Colors (required — partial)

Required: `--destructive` and `--destructive-foreground`. The others are recommended but optional.

| Token | Required | Notes |
| --- | --- | --- |
| `--destructive` | Yes | Error, delete, danger |
| `--destructive-foreground` | Yes | Text on destructive |
| `--success` | Optional | Confirmation, completion |
| `--success-foreground` | Optional | Text on success |
| `--warning` | Optional | Caution, degraded state |
| `--warning-foreground` | Optional | Text on warning |
| `--info` | Optional | Informational, neutral notice |
| `--info-foreground` | Optional | Text on info |

---

## Neutrals (required)

Every token below must have a light-mode value AND a dark-mode value.

| Token | Notes |
| --- | --- |
| `--muted` | Subdued background (disabled, inactive) |
| `--muted-foreground` | Subdued text |
| `--border` | Default border color |
| `--input` | Input field border/background |
| `--ring` | Focus ring color |

---

## Charts (required — minimum 5)

| Token | Notes |
| --- | --- |
| `--chart-1` | First data series color |
| `--chart-2` | Second data series color |
| `--chart-3` | Third data series color |
| `--chart-4` | Fourth data series color |
| `--chart-5` | Fifth data series color |

Additional chart tokens (`--chart-6` and beyond) are optional. Each chart token must have light-mode and dark-mode values.

---

## Sidebar Tokens (required IF project has an app shell)

If the project includes a persistent sidebar, navigation drawer, or app shell layout — these tokens are required. If it is a marketing-only site or a layout without a sidebar, this entire category may be omitted.

| Token | Notes |
| --- | --- |
| `--sidebar` | Sidebar background |
| `--sidebar-foreground` | Text and icons in sidebar |
| `--sidebar-primary` | Active/selected item in sidebar |
| `--sidebar-primary-foreground` | Text on active sidebar item |
| `--sidebar-accent` | Hover state in sidebar |
| `--sidebar-accent-foreground` | Text on sidebar hover |
| `--sidebar-border` | Sidebar edge/separator |
| `--sidebar-ring` | Focus ring within sidebar |

---

## Typography — Font Families (required)

| Token | Required | Notes |
| --- | --- | --- |
| `--font-sans` | Yes | Primary sans-serif stack |
| `--font-serif` | Yes | Serif stack (may be same as sans for non-editorial projects) |
| `--font-mono` | Yes | Monospace stack for code, data |
| `--font-display` | Optional | Display/headline variant |
| `--font-logo` | Optional | Logotype or wordmark font |

---

## Typography — Type Scale (required — pick ONE approach and document)

Choose either **size tokens** or **semantic tokens** — do not mix. Document the decision in `docs/design-system.md`.

**Option A — Size tokens** (numeric scale):

| Token | Size |
| --- | --- |
| `--text-xs` | 12px equivalent |
| `--text-sm` | 14px equivalent |
| `--text-base` | 16px equivalent |
| `--text-lg` | 18px equivalent |
| `--text-xl` | 20px equivalent |
| `--text-2xl` | 24px equivalent |
| `--text-3xl` | 30px equivalent |
| `--text-4xl` | 36px equivalent |

**Option B — Semantic tokens** (role-named scale):

| Token | Role |
| --- | --- |
| `--text-caption` | Smallest, labels/metadata |
| `--text-body-sm` | Compact body |
| `--text-body` | Default body |
| `--text-body-lg` | Emphasized body |
| `--text-heading-sm` | Section heading |
| `--text-heading` | Page heading |
| `--text-heading-lg` | Hero heading |
| `--text-display` | Marketing/hero display |

---

## Typography — Weights, Leading, Tracking (required)

Document the full scale even if mapping to Tailwind defaults. Must be in `docs/design-system.md`.

| Category | Required entries |
| --- | --- |
| Font weights | At minimum: regular (400), medium (500), semibold (600), bold (700) |
| Line heights (leading) | At minimum: tight, normal, relaxed |
| Letter spacing (tracking) | At minimum: tight, normal, wide |

---

## Radius (required)

| Token | Notes |
| --- | --- |
| `--radius` | Base radius value |
| `--radius-sm` | Small radius (inputs, tags) |
| `--radius-md` | Medium radius (cards, modals) |
| `--radius-lg` | Large radius (panels) |
| `--radius-xl` | Extra-large radius |
| `--radius-pill` | Fully rounded ends (badges, pills) |
| `--radius-full` | Circle (avatars, icons) |

---

## Spacing (required)

Tailwind's default 4px-base spacing scale is acceptable. If using it, record that decision explicitly in `docs/design-system.md` under "Spacing Decision." If using a custom scale, document the full scale with values.

---

## Shadows (required)

| Token | Notes |
| --- | --- |
| `--shadow-sm` | Subtle lift (inputs, micro-elements) |
| `--shadow-md` | Card elevation |
| `--shadow-lg` | Dropdown, popover |
| `--shadow-xl` | Modal, drawer |
| `--shadow-2xl` | Maximum elevation (lightbox, command palette) |

Brand-specific shadows (e.g., `--shadow-brand`, `--shadow-glow`) are optional. Document them if used.

---

## Motion (required)

| Category | Required entries |
| --- | --- |
| Duration scale | At minimum: fast (≤150ms), normal (200–300ms), slow (400–500ms) |
| Easing curves | At minimum: default (ease), in, out, spring/bounce |

Document as CSS custom properties (e.g., `--duration-fast: 150ms`) OR as Tailwind theme extensions. Either form is acceptable; document the choice.

---

## Breakpoints (required)

Document the breakpoint scale in `docs/design-system.md`. Tailwind defaults are acceptable — record that decision. Custom breakpoints must list each name and pixel value.

Minimum breakpoints to document: `sm` (640px), `md` (768px), `lg` (1024px), `xl` (1280px), `2xl` (1536px).

---

## Z-index (required)

Document a layered z-index scale in `docs/design-system.md`. Values must be named by layer, not arbitrary numbers.

Example layer names (adapt to project): `base`, `raised`, `dropdown`, `sticky`, `overlay`, `modal`, `toast`, `tooltip`.

---

## Dark Mode (required)

Every **color token** must have both a light-mode value and a dark-mode value. No exceptions.

Implementation: use CSS custom properties scoped to `.dark` (or `[data-theme="dark"]`) — either via Tailwind's `darkMode: 'class'` strategy or an equivalent. Document the strategy in `docs/design-system.md`.

**Compliance check:** `compliance-pre-check` will flag any color token that appears in `:root` but has no corresponding dark variant.

---

## Gate Rule

`compliance-pre-check` returns `status: pass` only when:

1. All **required** categories above are covered
2. All **conditional** categories (sidebar) are covered if their condition is met
3. Every color token has both a light and dark variant
4. The type scale approach (Option A or B) is documented in `docs/design-system.md`
5. Spacing and breakpoint decisions are documented (even if using Tailwind defaults)

Partial satisfaction of any required category = `status: fail` with a list of the specific missing tokens.
