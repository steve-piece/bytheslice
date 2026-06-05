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

---

## Tasks

### Task 1: Create .env.example and document all required vars

[ ] Create `.env.example` at the expected path(s) for the architecture variant:
  - Single-app: `.env.example` at project root
  - Monorepo: `.env.example` per app + optional shared `.env.example`

[ ] Document every required environment variable with:
  - Name
  - Description
  - Where to get the value (e.g., "Supabase dashboard → Project Settings → API")
  - Whether it is public (`NEXT_PUBLIC_`) or server-only

Env var groups to populate (project-specific list — from Q4/Q10/Q11 + PRD Section 4):
[ ] Database connection (see Q4 tooling)
[ ] Auth provider credentials (see Q10)
[ ] Deployment platform vars (see Q11)
[ ] Any additional integrations from PRD Section 4

**Commit:** `env: add .env.example with all required variables documented`

---

### Task 2: Human setup (HITL)

> The orchestrator pauses here. The human must:

[ ] Create accounts / projects for each external service
[ ] Generate API keys and credentials
[ ] Configure OAuth redirect URIs and allowed origins
[ ] Populate `.env.local` (single-app) or per-app `.env.local` files (monorepo)

Once all variables are populated, signal the orchestrator to continue.

---

### Task 3: Verify local dev boots

[ ] Run `pnpm dev` (or equivalent); confirm no missing env var errors
[ ] Confirm database connection succeeds (run a simple query)
[ ] Confirm auth provider is reachable (check health endpoint or test sign-in)
[ ] Confirm any additional services from PRD Section 4 are reachable
[ ] Run `pnpm test` (or equivalent); confirm passing

**Commit:** `env: verify all services reachable in local dev`

---

**Exit criteria:**
- `.env.example` committed with all required vars documented
- All vars populated in local `.env.local`
- `pnpm dev` (or equivalent) starts without errors
- Database connection verified
- Auth provider reachable
- `pnpm test` passes
