<!-- skills/open-the-shop/references/known-services-catalog.md -->
<!-- Extensible catalog mapping env var prefix patterns to external services. Used by open-the-shop Phase 1 to detect which services a project requires. To add a new service: append a new entry following the ENTRY FORMAT below. -->

# Known Services Catalog

This catalog maps environment variable prefix patterns to external service identities. The `open-the-shop` skill uses this during Phase 1 (service detection) to group keys by service and generate targeted provisioning checklists.

## How to Add a New Service

Copy the entry template at the bottom of this file and fill in every field. Entries are matched in order: put more specific patterns (e.g. `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY`) before broad prefixes (e.g. `SUPABASE_*`).

---

## Service Entries

### Supabase

```yaml
service: Supabase
prefixes:
  - NEXT_PUBLIC_SUPABASE_URL
  - NEXT_PUBLIC_SUPABASE_ANON_KEY
  - NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY
  - SUPABASE_SECRET_KEY
  - SUPABASE_SERVICE_ROLE_KEY
  - SUPABASE_JWT_SECRET
  - SUPABASE_*
provisioning_url: https://supabase.com/dashboard
notes: >
  Create a new Supabase project. Keys are found under Project Settings → API.
  SUPABASE_SECRET_KEY uses the format sb_secret_xxx (newer Supabase projects).
  SUPABASE_SERVICE_ROLE_KEY is the legacy equivalent: never expose in the browser.
ci_secrets_needed: [SUPABASE_SERVICE_ROLE_KEY, SUPABASE_SECRET_KEY]
```

### Stripe

```yaml
service: Stripe
prefixes:
  - STRIPE_SECRET_KEY
  - STRIPE_PUBLISHABLE_KEY
  - NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  - STRIPE_WEBHOOK_SECRET
  - STRIPE_*
provisioning_url: https://dashboard.stripe.com/apikeys
notes: >
  Create or select a Stripe account. Live and test keys are separate.
  STRIPE_WEBHOOK_SECRET is generated when you create a webhook endpoint
  (Developers → Webhooks → Add endpoint). For local dev, use the Stripe CLI
  to get a local webhook secret: stripe listen --print-secret
ci_secrets_needed: [STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET]
```

### Resend

```yaml
service: Resend
prefixes:
  - RESEND_API_KEY
  - RESEND_FROM_EMAIL
  - RESEND_*
provisioning_url: https://resend.com/api-keys
notes: >
  Create a Resend account and generate an API key. Verify your sending domain
  under Domains before going to production.
ci_secrets_needed: [RESEND_API_KEY]
```

### Clerk

```yaml
service: Clerk
prefixes:
  - CLERK_SECRET_KEY
  - NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
  - CLERK_WEBHOOK_SECRET
  - CLERK_*
  - NEXT_PUBLIC_CLERK_*
provisioning_url: https://dashboard.clerk.com
notes: >
  Create a Clerk application. Keys are found under Configure → API Keys.
  CLERK_WEBHOOK_SECRET is generated per-endpoint under Webhooks in the Clerk dashboard.
ci_secrets_needed: [CLERK_SECRET_KEY, CLERK_WEBHOOK_SECRET]
```

### Auth0

```yaml
service: Auth0
prefixes:
  - AUTH0_SECRET
  - AUTH0_BASE_URL
  - AUTH0_ISSUER_BASE_URL
  - AUTH0_CLIENT_ID
  - AUTH0_CLIENT_SECRET
  - AUTH0_DOMAIN
  - AUTH0_*
provisioning_url: https://manage.auth0.com
notes: >
  Create an Auth0 tenant. Application credentials are under Applications → Your App → Settings.
  AUTH0_SECRET is a random 32-byte hex value you generate locally (e.g. openssl rand -hex 32).
ci_secrets_needed: [AUTH0_CLIENT_SECRET, AUTH0_SECRET]
```

### NextAuth

```yaml
service: NextAuth
prefixes:
  - NEXTAUTH_SECRET
  - NEXTAUTH_URL
  - NEXTAUTH_*
provisioning_url: https://next-auth.js.org/configuration/options
notes: >
  NEXTAUTH_SECRET is generated locally: openssl rand -base64 32
  NEXTAUTH_URL is your app's canonical URL (e.g. http://localhost:3000 for dev).
  No external account provisioning required for the core config values.
ci_secrets_needed: [NEXTAUTH_SECRET]
```

### PostHog

```yaml
service: PostHog
prefixes:
  - NEXT_PUBLIC_POSTHOG_KEY
  - POSTHOG_API_KEY
  - NEXT_PUBLIC_POSTHOG_HOST
  - POSTHOG_*
  - NEXT_PUBLIC_POSTHOG_*
provisioning_url: https://app.posthog.com/settings/project
notes: >
  Create a PostHog project. The project API key is on the Project Settings page.
  NEXT_PUBLIC_POSTHOG_HOST defaults to https://app.posthog.com (or your self-hosted URL).
ci_secrets_needed: []
```

### Sentry

```yaml
service: Sentry
prefixes:
  - SENTRY_DSN
  - NEXT_PUBLIC_SENTRY_DSN
  - SENTRY_ORG
  - SENTRY_PROJECT
  - SENTRY_AUTH_TOKEN
  - SENTRY_*
  - NEXT_PUBLIC_SENTRY_*
provisioning_url: https://sentry.io/settings/
notes: >
  Create a Sentry project. The DSN is found under Settings → Projects → Your Project → Client Keys.
  SENTRY_AUTH_TOKEN is required for source map uploads in CI (Settings → Auth Tokens).
ci_secrets_needed: [SENTRY_AUTH_TOKEN]
```

### Vercel

```yaml
service: Vercel
prefixes:
  - VERCEL_TOKEN
  - VERCEL_ORG_ID
  - VERCEL_PROJECT_ID
  - VERCEL_*
provisioning_url: https://vercel.com/account/tokens
notes: >
  VERCEL_TOKEN is a personal or team access token (Account Settings → Tokens).
  VERCEL_ORG_ID and VERCEL_PROJECT_ID are found via `vercel link` or in project settings.
  These values are typically only needed in CI, not in .env.local for local dev.
ci_secrets_needed: [VERCEL_TOKEN, VERCEL_ORG_ID, VERCEL_PROJECT_ID]
```

### GitHub

```yaml
service: GitHub
prefixes:
  - GITHUB_TOKEN
  - GITHUB_APP_ID
  - GITHUB_APP_PRIVATE_KEY
  - GITHUB_CLIENT_ID
  - GITHUB_CLIENT_SECRET
  - GITHUB_*
provisioning_url: https://github.com/settings/tokens
notes: >
  GITHUB_TOKEN is a Personal Access Token (classic) or a fine-grained PAT.
  For GitHub Apps: APP_ID and PRIVATE_KEY are found in the app's settings page.
  GITHUB_CLIENT_ID and CLIENT_SECRET are OAuth App credentials (Settings → Developer settings → OAuth Apps).
ci_secrets_needed: [GITHUB_TOKEN]
```

### OpenAI

```yaml
service: OpenAI
prefixes:
  - OPENAI_API_KEY
  - OPENAI_ORG_ID
  - OPENAI_*
provisioning_url: https://platform.openai.com/api-keys
notes: >
  Generate an API key under API Keys in the OpenAI platform.
  OPENAI_ORG_ID is found under Settings → Organization → General.
ci_secrets_needed: [OPENAI_API_KEY]
```

### Anthropic

```yaml
service: Anthropic
prefixes:
  - ANTHROPIC_API_KEY
  - ANTHROPIC_*
provisioning_url: https://console.anthropic.com/settings/keys
notes: >
  Generate an API key in the Anthropic Console under API Keys.
ci_secrets_needed: [ANTHROPIC_API_KEY]
```

### Upstash (Redis / Kafka / QStash)

```yaml
service: Upstash
prefixes:
  - UPSTASH_REDIS_REST_URL
  - UPSTASH_REDIS_REST_TOKEN
  - UPSTASH_KAFKA_REST_URL
  - UPSTASH_KAFKA_REST_USERNAME
  - UPSTASH_KAFKA_REST_PASSWORD
  - QSTASH_TOKEN
  - QSTASH_CURRENT_SIGNING_KEY
  - QSTASH_NEXT_SIGNING_KEY
  - UPSTASH_*
  - QSTASH_*
provisioning_url: https://console.upstash.com
notes: >
  Create an Upstash database or queue. Credentials are shown on the database detail page.
  QStash tokens are under the QStash section in the same console.
ci_secrets_needed: [UPSTASH_REDIS_REST_TOKEN, QSTASH_TOKEN]
```

### PlanetScale

```yaml
service: PlanetScale
prefixes:
  - DATABASE_URL
  - PLANETSCALE_*
provisioning_url: https://app.planetscale.com
notes: >
  DATABASE_URL for PlanetScale follows the format:
  mysql://user:pass@host/db?sslaccept=strict
  Get the connection string from your database → Connect → Connect with Prisma (or your ORM).
ci_secrets_needed: [DATABASE_URL]
```

### Neon (Postgres)

```yaml
service: Neon
prefixes:
  - NEON_DATABASE_URL
  - DATABASE_URL
  - NEON_*
provisioning_url: https://console.neon.tech
notes: >
  DATABASE_URL follows the format: postgresql://user:pass@host/db?sslmode=require
  Get the connection string from your project dashboard → Connection Details.
  Use a separate branch URL for CI if using Neon branching.
ci_secrets_needed: [DATABASE_URL]
```

### Liveblocks

```yaml
service: Liveblocks
prefixes:
  - LIVEBLOCKS_SECRET_KEY
  - NEXT_PUBLIC_LIVEBLOCKS_PUBLIC_KEY
  - LIVEBLOCKS_*
  - NEXT_PUBLIC_LIVEBLOCKS_*
provisioning_url: https://liveblocks.io/dashboard
notes: >
  Create a Liveblocks project. Keys are found under Settings → API Keys.
ci_secrets_needed: [LIVEBLOCKS_SECRET_KEY]
```

---

## Entry Template

Use this template to add a new service. Copy, fill in, and insert before the closing `---`:

```yaml
service: <Human-readable service name>
prefixes:
  - EXACT_KEY_NAME           # list exact matches first
  - PREFIX_*                 # then wildcard prefixes
provisioning_url: https://...
notes: >
  Brief instructions for where to get each key. Include format hints if the
  value has a specific pattern (e.g. sb_secret_xxx). One paragraph max.
ci_secrets_needed: [KEY_1, KEY_2]   # empty array [] if none
```
