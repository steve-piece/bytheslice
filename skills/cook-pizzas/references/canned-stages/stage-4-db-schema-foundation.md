---
stage: 4
name: "Database Schema Foundation"
type: db-schema
slice: horizontal
mvp: true
depends_on: [1, 2, 3]
estimated_tasks: 4
hitl_required: false
hitl_reason: null
linear_milestone: null
completion_criteria:
  - tests_passing
  - migration_applied
  - types_generated
  - rls_policies_verified
---

<!-- docs/plans/stage_4_db_schema_foundation.md -->
<!-- Stage 4: database schema foundation — entity definitions, migrations, type generation, security baseline -->

# Stage 4 — Database Schema Foundation

**Goal:** Establish the complete database schema (all entities, relationships, indexes) before any feature stage reads or writes data.

**Architecture:** This is a horizontal foundation stage. All feature stages that touch data (type `backend`, `full-stack`) depend on the schema and types produced here. The `db-schema-drift` CI job (added in Stage 2) validates that the schema source matches applied migrations.

**Architecture note (project-specific):** [populated by db-schema-stage-writer based on Q4, Q5, Q8]
- Database tooling: Supabase | Prisma | Drizzle | other (from Q4)
- Schema file location: [tooling-specific, from db-schema-stage-writer]
- Entities detected from PRD Section 4: [list populated by db-schema-stage-writer]

**Tech stack:**
- Database tooling: [from Q4]
- Type generation: [tooling-specific]

**Dependencies from prior stages:**
- Stage 3 (env-setup-gate): database connection credentials populated

---

## Tasks

### Task 1: Define schema source of truth

- [ ] Create the schema file at the tooling-specific location:
  - Supabase: `supabase/migrations/<timestamp>_initial_schema.sql`
  - Prisma: `prisma/schema.prisma`
  - Drizzle: `db/schema.ts`

- [ ] Define ALL entities detected from PRD Section 4:
  - Table/model names
  - Fields with data types and constraints
  - Foreign key relationships
  - Indexes (primary key, unique, foreign key, query-critical indexes)

- [ ] Apply the migration / push the schema:
  - Supabase: `supabase db push` or `supabase migration apply`
  - Prisma: `prisma migrate dev --name initial_schema`
  - Drizzle: `drizzle-kit push` or `drizzle-kit generate && drizzle-kit migrate`

**Commit:** `db: define initial schema for [entity list]`

---

### Task 2: Generate TypeScript types

- [ ] Run the type generation command:
  - Supabase: `supabase gen types typescript --local > types/supabase.ts`
  - Prisma: `prisma generate` (generates Prisma client + types)
  - Drizzle: types are inferred from schema; export from `db/schema.ts`

- [ ] Verify generated types are importable and correct (write a minimal type-check script)
- [ ] Commit generated type file if it's not gitignored

**Commit:** `db: generate TypeScript types from schema`

---

### Task 3: Security baseline (Supabase only — skip if not Supabase)

> Reference: `references/architecture-conventions.md` — Security baseline — Supabase

- [ ] Enable RLS on every user-scoped table (`ALTER TABLE <table> ENABLE ROW LEVEL SECURITY`)
- [ ] Write at least one RLS policy per table for each operation (SELECT, INSERT, UPDATE, DELETE) that user-scoped clients will perform
- [ ] Verify service-role key is NOT referenced in any client-side file
- [ ] Verify all database functions invoked by user-scoped clients use `SECURITY DEFINER` with `SET search_path = ''`

**Commit:** `security: enable RLS and write initial policies for all user-scoped tables`

---

### Task 4: Seed data for development

- [ ] Write a seed script at `db/seed/` (or equivalent tooling path) with:
  - At least 2 test users per role (if auth is in scope)
  - Representative sample data for each entity (at least 5 rows per major entity)
  - Seed data that exercises relationship constraints

- [ ] Verify seed script runs cleanly on a fresh schema
- [ ] Document how to reset and re-seed in project README or docs

**Commit:** `db: add seed script for development and testing`

---

**Exit criteria:**
- Schema applied to local database without errors
- TypeScript types generated and importable
- `pnpm typecheck` (or `tsc --noEmit`) passes
- Seed script runs without errors
- RLS enabled and policies verified (Supabase only)
- Local drift check clean: `supabase db diff` empty, `prisma migrate status` up to date, or `drizzle-kit check` passes (the `db-schema-drift` CI job runs at the PR, gate tier 4, not per slice)
- DB tests ran before each task commit (gate tier 2: this slice touches the schema)
