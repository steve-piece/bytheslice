# Default Project Setup

The canonical Phased stack. Apply these unless a PRD explicitly overrides in section 0.1.

**No vendor is a default.** Hosting, database, auth, email, payments and every other third-party service are **whatever the operator has authorized**: the providers named in the brief, the plan-mode answers, or (under `run.unattended: true`) the order ticket's **Answers** at `docs/pizza-party/order.md`. The vendors named below are examples of each category, listed alphabetically, never a recommendation. When nothing names a provider for a service the app needs, write the category in the PRD and tag the provider `[TBD-ASSUMPTION]` (interactive) or record the pick under the ticket's "Decisions made without you" (unattended), preferring a local option (SQLite, local auth, console email) over an unauthorized vendor.

---

## Architecture Conditional (Required: Read Before Section 4)

The architecture default is conditional, not fixed. Evaluate based on project scope:

| Project type | Default architecture |
| --- | --- |
| Marketing-only single site (no auth, no dashboard, no admin, no client portal) | Single Next.js app: NOT a monorepo |
| Marketing + any authenticated experience (auth, admin, client dashboard, user portal: any combination) | Turborepo monorepo |

If scope is unclear after reading the brief, surface this in the plan-mode question gate before generating Section 4.

---

## Foundation

| Layer | Default |
| --- | --- |
| Package management | pnpm |
| Deployment | The host the operator authorized (examples: Cloudflare, Fly, Netlify, Railway, Render, Vercel); none named means localhost |
| Version control | GitHub (feature branches + PRs to `main`) |
| Node runtime | Node.js LTS |

---

## Core Dependencies

- Next.js (App Router)
- React
- TypeScript (strict mode)
- Tailwind CSS
- Class Variance Authority
- Framer Motion
- Lucide Icons
- shadcn/ui
- Zod
- The client library of the chosen database and auth providers (when the app has them)

## Dev Dependencies

- ESLint
- Prettier
- Husky (pre-commit hooks)
- Vitest (unit testing)
- Playwright (end-to-end testing)

---

## 3rd Party Services

Include a category only when the PRD needs it, and fill its provider from what the operator authorized (see the note at the top). Examples per category are alphabetical and not a recommendation.

| Category | Examples | Local option when none is authorized |
| --- | --- | --- |
| Database | Neon, PlanetScale, Supabase, Turso, a self-hosted Postgres | SQLite file, or a local Postgres |
| Auth | Auth.js, Better Auth, Clerk, Supabase Auth, WorkOS | Local session, or magic-link-to-console |
| Email | Postmark, Resend, SendGrid, SES | Console logger |
| Payments | Lemon Squeezy, Paddle, Stripe | None: defer the payment slices |
| Hosting | Cloudflare, Fly, Netlify, Railway, Render, Vercel | Localhost |
| File storage | Cloudflare R2, S3, Supabase Storage, UploadThing | Local filesystem (gitignored folder) |

---

## Optional / Project-Specific

Include only when the PRD calls for them.

| Service | When to Use |
| --- | --- |
| An AI SDK (examples: Anthropic SDK, OpenAI SDK, Vercel AI SDK) | Any LLM or generative AI feature |
| An AI gateway (examples: Cloudflare AI Gateway, OpenRouter, Vercel AI Gateway) | Routing and observability for multi-model LLM calls |
| Twilio | SMS, OTP, voice |
| Storybook | Custom UI component libraries |
| E2B | Sandboxed agent execution in MicroVMs |

---

## Environment Variable Conventions

Naming conventions for the providers below apply only when the operator chose that provider. Any other provider follows its own documented names.

### Supabase (current naming, post-rename)

| Variable | Format | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<project>.supabase.co` | Project URL, client + server |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` | `sb_publishable_xxx` | Client-side publishable key (replaces legacy anon key) |
| `SUPABASE_SECRET_KEY` | `sb_secret_xxx` | Server-side secret key (replaces legacy service role key) |

The legacy JWT-based `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are being phased out. Use the new naming for all new projects.

### Stripe

| Variable | Purpose |
| --- | --- |
| `STRIPE_SECRET_KEY` | Server-side API calls |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Client-side Stripe.js |
| `STRIPE_WEBHOOK_SECRET` | Webhook signature verification |

### Resend

| Variable | Purpose |
| --- | --- |
| `RESEND_API_KEY` | Email send authentication |
| `RESEND_FROM_EMAIL` | Default from address |

### Vercel AI Gateway

| Variable | Purpose |
| --- | --- |
| `AI_GATEWAY_API_KEY` | Gateway authentication |

---

## Token Category Contract

Every project must define values for all applicable token categories before any UI work begins. This contract is enforced by the design-system gate (Stage 1). Categories list what must exist: actual values vary per project.

| Category | Required tokens | Notes |
| --- | --- | --- |
| Surface colors | `--background`, `--foreground`, `--card`, `--card-foreground`, `--popover`, `--popover-foreground` | Required for all projects |
| Brand colors | `--primary`, `--primary-foreground`, `--secondary`, `--secondary-foreground`, `--accent`, `--accent-foreground` | Required for all projects |
| Semantic colors | `--destructive`, `--destructive-foreground`; optional `--success`, `--warning`, `--info` | `--destructive` always required |
| Neutrals | `--muted`, `--muted-foreground`, `--border`, `--input`, `--ring` | Required for all projects |
| Charts | `--chart-1` through `--chart-5` minimum | Required when any data visualization is in scope |
| Sidebar (if app shell) | `--sidebar`, `--sidebar-foreground`, `--sidebar-primary`, `--sidebar-accent`, `--sidebar-border`, `--sidebar-ring` | Required only if project includes a sidebar shell |
| Type families | `--font-sans`, `--font-serif`, `--font-mono`; optional `--font-display`, `--font-logo` | `--font-sans` always required |
| Type scale | EITHER size tokens OR semantic tokens: must pick one and document the choice | Required; record which system is used |
| Weights / leading / tracking | Scale documented | Required |
| Radius | `--radius` plus `-sm/-md/-lg/-xl/-pill/-full` derivatives | Required |
| Spacing | Scale documented (Tailwind default acceptable: record decision) | Required |
| Shadows | `--shadow-sm` through `--shadow-2xl` plus brand-specific | Required |
| Motion | Duration scale + easing curves | Required for any animated UI |
| Breakpoints | Documented | Required |
| Z-index | Layered scale | Required |
| Dark mode | Every color token defined for dark variant | Required if dark mode is in scope |

Design-system gate refuses to complete until all applicable categories are satisfied.

---

## Architecture Conventions

- All database tables have row-level access control (RLS policies where the database supports them) before launch
- Server actions for mutations; API routes only when serving external clients
- Shared packages in monorepo for `ui`, `db`, `config`, `utils` (monorepo projects only)
- Apps live under `apps/`, packages under `packages/` (monorepo projects only)
- Migrations managed via the chosen database's tooling, committed to repo
- Environment files: `.env.local` (dev), the chosen host's environment settings (preview/staging/prod)

## Testing Conventions

- Vitest for unit and integration tests, colocated next to source files
- Playwright for end-to-end flows, in `e2e/` directory at app root
- Coverage gate in CI for changed files
- Pre-commit hook runs lint + type check + affected unit tests

## CI/CD Conventions

- GitHub Actions for CI (lint, type check, test, build)
- CD through the chosen host (preview per PR where the host supports it, production on merge to `main`)
- Required PR checks before merge: passing CI, at least 1 review
- Database migrations run with the chosen database's tooling before deploy

## UX Defaults

- Mobile-first responsive design
- WCAG 2.1 AA accessibility minimum
- All interactive elements have loading, empty, and error states
- Toast notifications via shadcn/ui sonner component
- Forms validated client-side with Zod and server-side with Zod
