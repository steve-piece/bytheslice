# Stage Frontmatter Contract

Every stage plan file produced by `cook-pizzas` (and consumed by `sell-slice` / `sell-pie` / `run-the-day`) must begin with this YAML frontmatter block. All fields are mandatory. No omissions, no extras.

> **v5 Pie/Slice fields.** As of v5.0.0 each stage file also carries `pie`, `slice` (as `"<N.M>"`), and inherits a `review` annotation from its pie. These slot the flat stage into the two-level Pie/Slice hierarchy without removing any v4 field. See [Pie/Slice fields (v5)](#pieslice-fields-v5) below. The dual-read rule means a v4 file that omits them still parses — see [Dual-read: v4 flat vs v5 nested](#dual-read-v4-flat-vs-v5-nested).

## Template

```yaml
---
stage: <int>
pie: <int>                # v5: which Pie this slice belongs to
slice: "<N.M>"            # v5: dotted slice id, e.g. "2.6" — string, quoted
review: boundary | continuous   # v5: inherited from the pie (boundary = autonomous; continuous = forces /sell-slice mode)
name: "<Title Case>"
type: design-system | ci-cd | env-setup | db-schema | frontend | backend | full-stack | infrastructure
mvp: true | false
depends_on: [<stage_ints>]
estimated_tasks: <int, 1-6>
hitl_required: false | true
hitl_reason: null | "prd_ambiguity" | "external_credentials" | "destructive_operation" | "creative_direction"
linear_milestone: null | "<id>"
completion_criteria:
  - tests_passing
  - <other criteria specific to stage type>
---
```

> **Note on `slice`.** The field name `slice` is reused from v4, where it was an enum (`vertical | horizontal`). In v5 it carries the **dotted slice id** as a quoted string (`"2.6"`). The old `vertical | horizontal` distinction is captured by `type` + `pie` ordering (foundation pies are early; feature slices are vertical) and is no longer a separate field. Dual-read tolerates both shapes — see below.

## Field definitions

| Field | Type | Description |
|-------|------|-------------|
| `stage` | integer | Stage number, sequential from 1. Retained in v5 so v4 tooling and the dual-read parser keep working; `pie`/`slice` are the v5 primary keys. |
| `pie` | integer | **v5.** Which Pie (coherent 3–8-slice chapter) this slice belongs to. Foundation work lives in early pies; features follow. Sequential from 1. |
| `slice` | string | **v5.** Dotted slice id, quoted, e.g. `"2.6"` — `pie` number, dot, slice index within the pie. Replaces the v4 `vertical \| horizontal` enum (see note above the field table). |
| `review` | enum | **v5.** `boundary` (default — pie runs autonomously, one HITL at the pie boundary) or `continuous` (forces `/sell-pie` into `/sell-slice` mode for the whole pie — used for Payments, Auth, real-data migrations). Inherited identically by every slice in a pie. |
| `name` | string | Human-readable stage name in Title Case |
| `type` | enum | See type table below |
| `mvp` | boolean | `true` if this stage ships before launch; `false` if post-launch Phase 2 |
| `depends_on` | int[] | Stage numbers that must complete before this stage begins. Use `[]` for stage 1. |
| `estimated_tasks` | integer | Number of tasks in the slice plan, 1-6 (never exceed 6 — the per-slice cap is ~6 tasks / ~15 files) |
| `hitl_required` | boolean | `true` if this slice cannot proceed without human input. Fires even inside an autonomous (`review: boundary`) pie. |
| `hitl_reason` | enum or null | Required when `hitl_required: true`. One of the four HITL categories. |
| `linear_milestone` | string or null | Linear milestone ID if project uses Linear tracking (from Q2). `null` otherwise. |
| `completion_criteria` | string[] | Testable, binary conditions. Always include `tests_passing`. |

## Type values

| Value | When to use |
|-------|-------------|
| `design-system` | Stage 1 — design system gate |
| `ci-cd` | Stage 2 — CI/CD scaffold |
| `env-setup` | Stage 3 — environment setup gate |
| `db-schema` | Stage 4 — database schema foundation |
| `frontend` | Feature stages that are UI-only (no backend data layer in this stage) |
| `backend` | Feature stages that are API/server-only |
| `full-stack` | Feature stages that include UI + data layer together |
| `infrastructure` | Non-feature work: observability, rate limiting, caching setup, etc. |

## HITL reason values

| Value | Trigger |
|-------|---------|
| `prd_ambiguity` | PRD contains a conflict, gap, or drift that requires human decision |
| `external_credentials` | Stage requires secrets, OAuth setup, or 3rd-party account configuration |
| `destructive_operation` | Stage involves schema migration on real data, prod deploys, or hard deletes |
| `creative_direction` | Stage requires a subjective brand or copy decision |

## Canned stage defaults

The four foundation stages are the early slices of **Pie 1** (the foundations pie) and inherit `review: boundary`.

| Stage | `pie` | `slice` | `type` | `review` | `mvp` | `depends_on` | `hitl_required` |
|-------|-------|---------|--------|----------|-------|--------------|-----------------|
| 1 (design-system-gate) | `1` | `"1.1"` | `design-system` | `boundary` | `true` | `[]` | `false` |
| 2 (ci-cd-scaffold) | `1` | `"1.2"` | `ci-cd` | `boundary` | `true` | `[1]` | `false` |
| 3 (env-setup-gate) | `1` | `"1.3"` | `env-setup` | `boundary` | `true` | `[1, 2]` | `true` / `external_credentials` |
| 4 (db-schema-foundation) | `1` | `"1.4"` | `db-schema` | `boundary` | `true` | `[1, 2, 3]` | `false` |

> The design-system slice is where design HITL is front-loaded, so feature pies compose pre-approved components and rarely stop for design. A v4 flat checklist that has not been re-pied leaves `pie`/`slice`/`review` absent; the dual-read parser still accepts it (foundations remain stages 1–4).

## Pie/Slice fields (v5)

The flat 20–30 stages become a **two-level Pie/Slice hierarchy** in v5. The frontmatter gains three fields to locate each slice in that hierarchy:

- **`pie`** (int) — the coherent chapter the slice belongs to. A pie is 3–8 slices with low cross-coupling and is the unit of `/sell-pie` autonomy, the HITL checkpoint, the PR, the context-refresh, and the worktree. Foundation work (design system, CI, env, db schema) is in early pies.
- **`slice`** (string, `"<N.M>"`) — the dotted id: the slice's pie number, then its index within that pie, e.g. `"2.6"`. Quote it so YAML reads it as a string, not a float. Within a file, `slice`'s leading number always equals `pie`.
- **`review`** (enum) — a **pie property** inherited identically by every slice in the pie:
  - `boundary` (default) — the pie runs autonomously under `/sell-pie`; the only human checkpoint is at the pie boundary (before the PR merges).
  - `continuous` — forces `/sell-pie` into high-touch `/sell-slice` mode for the entire pie. Use for sensitive chapters: Payments, Auth, real-data migrations.

`review` governs the **loop**; `hitl_required` governs the **single slice**. A `review: boundary` pie still halts on any slice whose `hitl_required: true` (e.g. an `external_credentials` slice inside an otherwise-autonomous pie). The two are independent and both apply.

> **Agents never call `ask_user_input_v0`.** A writer that detects a blocking ambiguity sets `hitl_required: true` + the matching `hitl_reason` in frontmatter and returns `needs_human` with `hitl_category`/`hitl_context` in its envelope; the orchestrator owns the human prompt. The frontmatter fields are metadata the orchestrator reads — they are not a request for input on their own.

## Dual-read: v4 flat vs v5 nested

The hook parser (`hooks/lib/checklist.sh`) and every consumer read **both** layouts. A migration is never forced and plan files are never silently rewritten.

| | v4 flat (still valid) | v5 nested |
|---|---|---|
| Checklist heading | `## Stage N — <name>` | `## Pie N — <name>` then `### Slice N.M — <name>` |
| Frontmatter keys | `stage`, no `pie`/`slice`/`review` | `stage` **and** `pie`, `slice: "<N.M>"`, `review` |
| Produced by | v4 `/cook-pizzas`, or v5 before `--repie` | v5 `/cook-pizzas`, or v4 after `/cook-pizzas --repie` |

Rules:

- A file that carries only the v4 keys remains contract-valid. Consumers fall back to `stage` ordering when `pie`/`slice` are absent.
- `/sell-slice` runs on either layout. `/sell-pie` **refuses a flat checklist** and points the user at `/cook-pizzas --repie` (explicit, opt-in conversion) — it never auto-rewrites.
- When both are present, `pie`/`slice` are authoritative for v5 routing; `stage` is retained only for back-compat and stable sort.

## Completion criteria conventions

`completion_criteria:` in frontmatter is a list of **slug-form metadata** used by the master-checklist-synthesizer to generate the `[ ]` rows on `docs/plans/00_master_checklist.md`. These slugs are NOT what `/goal` evaluates directly — they drive checklist row generation only.

Every stage must include `tests_passing`. Common additional criteria by type:

- `design-system`: `token_files_committed`, `design_system_compliance_check_passing`, `storybook_builds`
- `ci-cd`: `ci_workflow_green_on_main`, `e2e_suite_passing`, `branch_protection_configured`
- `env-setup`: `all_env_vars_populated`, `local_dev_boots`, `services_reachable`
- `db-schema`: `migration_applied`, `types_generated`, `rls_policies_verified` (Supabase only)
- `frontend` / `full-stack`: `tests_passing`, `route_renders_without_error`, `visual_review_passed`
- `backend`: `tests_passing`, `api_contract_verified`

## Body: Exit criteria contract

Separate from the frontmatter slugs, every stage/slice file's body MUST end with an `**Exit criteria:**` bullet block. This block is the single source of truth that `/bytheslice:sell-slice` Phase 2.5 lifts verbatim into the session-scoped `/goal` condition, and that the `slice-tester` derives its bespoke test plan from (alongside the build manifest). In a v5 nested checklist, **each slice carries its own Exit-criteria block**.

Every line MUST be:

1. **Transcript-verifiable** — the `/goal` evaluator does not run commands or read files independently; it only judges what Claude has already surfaced in the conversation. Write criteria that Claude's own output can demonstrate.
2. **Binary** — either met or not met.
3. **Specific to this slice** — name the routes, files, suites, or subagent verdicts that prove intent.

See `references/templates.md` → "Exit-criteria contract (consumed by `/goal`)" for full guidance and good/bad examples. The `phased-plan-writer` agent is the enforcement point.

## Cross-skill linking

This contract is referenced by:
- `skills/cook-pizzas/agents/` — all stage/slice writer agents (emit `pie`/`slice`/`review` per pie)
- `skills/sell-pie/SKILL.md` — reads `pie`/`slice`/`review` to drive the per-pie loop (refuses flat checklists)
- `skills/sell-slice/SKILL.md` — receives slice frontmatter as execution context
- `skills/run-the-day/SKILL.md` — chains `/sell-pie` across pies; routes by `type`
- `hooks/lib/checklist.sh` — dual-read parser for `## Stage N` and `## Pie N` / `### Slice N.M`
