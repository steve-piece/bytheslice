---
stage: 3
name: "Environment Setup Gate"
type: env-setup
slice: horizontal
mvp: true
depends_on: [1, 2]
estimated_tasks: 3
hitl_required: true
hitl_reason: "external_credentials"
linear_milestone: null
completion_criteria:
  - tests_passing
  - all_env_vars_populated
  - local_dev_boots
  - services_reachable
---

<!-- docs/plans/stage_3_env_setup_gate.md -->
<!-- Stage 3: environment setup gate — populate all external credentials before feature work begins -->

# Stage 3 — Environment Setup Gate

**Goal:** Populate all external credentials and verify local development boots end-to-end before any feature stages begin.

**Architecture:** This is a blocking gate. No feature stage (5+) should begin until every environment variable is populated and `local_dev_boots` is confirmed. The `open-the-shop` skill is the execution surface for this stage.

**Unattended runs:** `hitl_required: true` stays as written; it is what an interactive `/sell-pie` or `/sell-slice` run honors. Under `run.unattended` (`/pizza-party`), the Prep pie never goes through `/sell-pie`: the conductor runs `/open-the-shop`'s provider path directly (pizza-party Phase 5), where provider tooling writes `.env.local` and a service with no authorized provider gets a local substitute or a recorded deferral. So the flag never defers this stage in an unattended run.

**Architecture note (project-specific):** [project-specific — from Q4, Q5, Q8, Q10, Q11]
- Architecture variant: single-app | monorepo (from Q8)
- Auth provider: [from Q10]
- Database tooling: [from Q4]
- Deployment target: [from Q11]
- Expected `.env.example` paths: [from architecture variant scan]

**Tech stack:** Per project stack (database client, auth SDK, deployment CLI)

**Dependencies from prior stages:**
- Stage 1 (design-system-gate): complete
- Stage 2 (ci-cd-scaffold): complete

> **HITL note:** This stage is `hitl_required: true` because external credentials require human action — creating accounts, generating API keys, configuring OAuth redirect URIs. The orchestrator will pause and prompt you before this stage begins.

> **Unattended variant (`run.unattended: true`, set by `/pizza-party`):** nothing pauses. `/open-the-shop` takes its provider-provisioned path (`skills/open-the-shop/references/provider-provisioning.md` in the plugin): the providers the operator authorized before the run, and chose in the order ticket's **Answers**, write `.env.local` through their own tooling piped into `merge-env.js`, so the agent never sees or prints a value. A required service with no authorized provider gets a local substitute (SQLite or a local database, a local session or magic-link-to-console auth, a console email logger, the local filesystem for storage), recorded in the ticket. A required service with neither defers the slices that need it (row stays `[ ]`, `**Status:** deferred: needs <service> credentials`) instead of blocking the run. An optional key is left out and excused. Every choice is one line under "Decisions made without you".

---

## Tasks

### Task 1: Create .env.example and document all required vars

- [ ] Create `.env.example` at the expected path(s) for the architecture variant:
  - Single-app: `.env.example` at project root
  - Monorepo: `.env.example` per app + optional shared `.env.example`

- [ ] Document every required environment variable with:
  - Name
  - Description
  - Where to get the value (e.g., "Supabase dashboard → Project Settings → API")
  - Whether it is public (`NEXT_PUBLIC_`) or server-only

Env var groups to populate (project-specific list — from Q4/Q10/Q11 + PRD Section 4):
- [ ] Database connection (see Q4 tooling)
- [ ] Auth provider credentials (see Q10)
- [ ] Deployment platform vars (see Q11)
- [ ] Any additional integrations from PRD Section 4

**Commit:** `env: add .env.example with all required variables documented`

---

### Task 2: Human setup (HITL), or provider provisioning (unattended)

> **Interactive (the default):** the orchestrator pauses here. The human must:

- [ ] Create accounts / projects for each external service
- [ ] Generate API keys and credentials
- [ ] Configure OAuth redirect URIs and allowed origins
- [ ] Populate `.env.local` (single-app) or per-app `.env.local` files (monorepo)

Once all variables are populated, signal the orchestrator to continue.

> **Unattended (`run.unattended: true`):** no pause. Run the provider-provisioned path instead:

- [ ] Confirm each provider the ticket's **Answers** chose is authorized (its read-only check passes, or its MCP is connected)
- [ ] Fill `.env.local` from that provider's tooling through `merge-env.js` (fill only missing keys; never read, echo or print a value)
- [ ] For each key still missing: excuse it (optional), write a local substitute (required, substitute exists), or defer the slices that need it (required, no substitute)
- [ ] Record every pick, substitute, excused key and deferral in the order ticket

---

### Task 3: Verify local dev boots

- [ ] Run `pnpm dev` (or equivalent); confirm no missing env var errors
- [ ] Confirm database connection succeeds (run a simple query)
- [ ] Confirm auth provider is reachable (check health endpoint or test sign-in)
- [ ] Confirm any additional services from PRD Section 4 are reachable
- [ ] Run `pnpm test` (or equivalent); confirm passing
- [ ] Under the lean quality tier, also run `pnpm test:e2e:smoke` once: the smoke spec is the first e2e run that needs a populated env

**Commit:** `env: verify all services reachable in local dev`

---

**Exit criteria:**
- `.env.example` committed with all required vars documented
- All vars populated in local `.env.local`
- `pnpm dev` (or equivalent) starts without errors
- Database connection verified
- Auth provider reachable
- `pnpm test` passes

**Exit criteria (unattended variant, in place of "All vars populated"):**
- Every key in `.env.example` is populated in `.env.local` by provider tooling or a recorded local substitute, or excused as optional, or its slices are deferred with the reason recorded
- No secret value appears in any file but `.env.local`, or in the transcript
