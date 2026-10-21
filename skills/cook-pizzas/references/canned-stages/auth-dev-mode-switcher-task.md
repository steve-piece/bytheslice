# Dev-Mode Auth Helpers — Required Task Snippet

This task is injected into any stage detected as auth-tagged by `phased-plan-writer`. It bundles two dev-only deliverables that ship together: a localhost auto-login (opt-in via env flag) and a seeded-user switcher banner for RBAC iteration. It counts as **one** task against the 6-task-per-stage cap.

**Detection signals (any one is sufficient):**
- Stage name contains: `auth`, `login`, `session`, `rbac`, `permission`
- Stage type is `frontend` or `full-stack` AND PRD Section 2 mentions auth flows
- PRD Section 2 has a feature labeled `[auth]`

---

## Task to inject verbatim

- [ ] **Dev-mode auth helpers (localhost only)** — both sub-bullets ship together
    - **Localhost auto-login** (opt-in via env flag)
        - Active ONLY when `process.env.NODE_ENV === 'development'` AND `process.env.DEV_AUTH_BYPASS === 'true'` — both required
        - With the flag unset or `false`, the real login flow runs unchanged so devs can exercise the actual auth UI locally
        - Default user resolves from `DEV_DEFAULT_USER_EMAIL` env → falls back to first seeded user in `db/seed/users.ts` (or project equivalent) → if neither resolves, `console.warn` and fall through to the real login redirect (no crash)
        - Implemented at the auth middleware / route-guard layer: when both flags are set and the request has no session, server-side mint a session for the default user and continue — no redirect to login
        - Helper `lib/dev/auto-login.ts` throws `new Error('Dev-only')` at import time if `NODE_ENV !== 'development'`
        - Middleware import is gated so prod bundles do not include the helper (dynamic `await import()` behind the `NODE_ENV` check, or env-conditional barrel)
        - Documented in `.env.example` with `DEV_AUTH_BYPASS` (default: unset) and `DEV_DEFAULT_USER_EMAIL`, plus comment: "Dev-only. Set DEV_AUTH_BYPASS=true to skip the login screen on localhost. Leave unset to test the real auth flow."
    - **User switcher banner** (RBAC iteration)
        - Component renders ONLY when `process.env.NODE_ENV === 'development'`
        - Fixed position, top of viewport, dismissible (reappears on refresh)
        - Shows: current user email + role + tenant (if multi-tenant)
        - Dropdown lists all seeded test users from `db/seed/users.ts` (or equivalent)
        - Click on user → calls `actions/dev/dev-switch-user.ts` (dev-only Server Action) to re-mint the session
        - Server action guarded with `if (process.env.NODE_ENV !== 'development') throw new Error('Dev-only')`
        - Component path: `components/dev/user-switcher-banner.tsx`, mounted in root layout behind `{process.env.NODE_ENV === 'development' && <UserSwitcherBanner />}`
        - When the bypass flag is off, the banner only appears after a real login
    - **Shared tests (both sub-bullets)**
        - e2e (dev, flag on): protected route returns 200 with no prior session (auto-login fires); switching users via banner persists across navigation
        - e2e (dev, flag off): protected route returns 302 → login (real auth flow intact); banner is not rendered until a real session is established
        - e2e (prod build): banner does NOT render and the auto-login middleware path is unreachable regardless of flag value (assert protected route → 302 to login even with `DEV_AUTH_BYPASS=true`)
        - Build-time: importing anything from `lib/dev/*` under `NODE_ENV=production` throws (unit test or CI guard)
    - **Gate tiers for these tests:** the prod-import unit test runs while coding (tier 1); the three e2e cases are this task's own tests and run before its commit (tier 2); the prod-bundle grep runs in `slice-verifier`'s one slice-end pass (tier 3) and in CI at the PR (tier 4). None of them needs the full suite per commit.

---

## Extended implementation notes

When expanding the above task into a full stage task block, include:

**Files to create:**
- `lib/dev/auto-login.ts` — dev-only auto-login helper (throws on prod import)
- `components/dev/user-switcher-banner.tsx` — the banner component
- `actions/dev/dev-switch-user.ts` — dev-only Server Action (only imported conditionally)
- Updates to the project's auth middleware / route guard (location depends on the provider chosen in cook-pizzas Q10)
- `.env.example` additions for `DEV_AUTH_BYPASS` and `DEV_DEFAULT_USER_EMAIL`

**Auth-provider integration points (adapt to Q10 selection):**
- **Clerk:** wrap `clerkMiddleware()` so dev requests with the bypass flag set get a manually-minted session via `clerkClient.sessions.createSession()` for the default user, then continue.
- **Auth.js / NextAuth:** in `middleware.ts`, when bypass conditions are met and `auth()` returns no session, set the session cookie directly using the project's session strategy (JWT: sign a token for the default user; database: insert a session row) before falling through to the handler.
- **Supabase Auth:** in the server-side Supabase client wrapper (commonly under `packages/supabase` or `lib/supabase/server.ts`), when bypass conditions are met and `getUser()` returns null, call `auth.admin.generateLink({ type: 'magiclink', email })` for the default user and exchange it for a session, or use service-role `auth.admin.createUser` + `signInWithPassword` against a known dev-only password. Cookie writes must happen via the Next.js `cookies()` API in the request scope.
- **Lucia:** call `lucia.createSession(userId, {})` and set the session cookie in the middleware response.
- **None / custom:** add the bypass at whatever request-scope layer establishes session identity for the rest of the app.

**Implementation constraints:**
- Banner is mounted in root layout with `{process.env.NODE_ENV === 'development' && <UserSwitcherBanner />}`
- Dev-only helpers throw `new Error('Dev-only')` at top-of-module if `NODE_ENV !== 'development'`
- When `DEV_AUTH_BYPASS` is unset/false, the middleware path that mints the dev session is skipped entirely — real auth runs as in production
- The switcher must stay usable on top of the auto-login: switching writes the new user back into the session cookie / store, and refreshes pick up the override
- Seed file path defaults to `db/seed/users.ts`; adapt to project's actual seed location
- Prod bundles must contain no traces of `lib/dev/*`, `components/dev/*`, or `actions/dev/*` — verify with a build-output grep in CI

**Commit:** `dev: add auto-login + user switcher for local development`

---

> **Why this is required:** The two single largest friction points in auth-heavy projects during dev are (1) the login screen blocking every fresh session boot and (2) constantly re-logging to test RBAC paths. The auto-login eliminates (1) when devs opt in via env flag — and the flag-gated design keeps the real login flow trivially testable on localhost. The switcher eliminates (2) once any session exists. Both have a zero-prod footprint by construction.
