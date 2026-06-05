# ByTheSlice Config Schema

`bytheslice.config.json` is an **optional** per-project file at the root of the user's project (NOT inside the plugin). It declaratively overrides plugin defaults so users don't have to fork the plugin to personalize behavior.

## File location

```
<user-project-root>/bytheslice.config.json
```

If the file is absent, the plugin uses its built-in defaults (see [`skills/setup-shop/references/model-tier-guide.md`](./model-tier-guide.md) for model defaults). All keys are optional — a config file with `{}` is valid and equivalent to no config.

## Format

JSON-with-comments (JSONC dialect — same as `tsconfig.json`). The plugin parses comments and trailing commas. The `.json` extension is conventional even though the content allows comments.

## Precedence (top wins)

1. **Environment variables** — machine-level
   - `ANTHROPIC_DEFAULT_OPUS_MODEL`, `ANTHROPIC_DEFAULT_SONNET_MODEL`, `ANTHROPIC_DEFAULT_HAIKU_MODEL`
   - `CLAUDE_CODE_SUBAGENT_MODEL` (force-override of all subagent models)
2. **`bytheslice.config.json`** — per-project, version-controlled with the project
3. **Project rules file** (`CLAUDE.md` or `AGENTS.md`) — per-project conventions captured during elicitation
4. **Plugin spec defaults** — fallback when nothing else is set

When two sources disagree, the higher-precedence source wins. The orchestrator logs the resolved values at session start so the user knows what's in effect.

## Schema

```jsonc
{
  // Override per-agent model tier. Falls back to plugin defaults
  // documented in references/model-tier-guide.md.
  // Use the alias names: "haiku", "sonnet", "opus".
  "modelTiers": {
    "implementer": "opus",
    "qualityReviewer": "opus",
    "specReviewer": "sonnet",
    "discovery": "haiku",
    "sliceTester": "sonnet",      // v5 — independent behavioral tester
    "sliceVerifier": "sonnet",    // v5 — collapsed static-gate verifier
    "ciCdGuardrails": "sonnet",   // deprecated alias of sliceVerifier (through 5.1)
    "checklistCurator": "sonnet",
    "stageRunner": "opus",
    "prReviewer": "sonnet",
    "modernUxExpert": "sonnet",
    "layoutArchitect": "sonnet",
    "blockComposer": "sonnet",
    "componentCrafter": "sonnet",
    "stateIllustrator": "sonnet",
    "visualReviewer": "sonnet",
    "tokenExpander": "opus",
    "bundleValidator": "sonnet",
    "compliancePreCheck": "sonnet",
    "envVerifier": "haiku",
    "prdReviewer": "sonnet",
    "phasedPlanWriter": "sonnet",
    "dbSchemaStageWriter": "sonnet",
    "masterChecklistSynthesizer": "sonnet",
    "retrospectiveReviewer": "opus"
  },

  // Per-stage shape preferences for cook-pizzas + sell-slice.
  "stages": {
    "maxTasksPerStage": 6,            // hard cap per stage; default 6
    "targetFeatureStages": "20-30"    // splitter aims for this band; "10-15" or "30-40" also reasonable
  },

  // Verification knobs consumed by sell-slice's Workflow B (slice-tester +
  // slice-verifier) and by sell-pie's per-slice loop. Drives viewport coverage
  // (C7) and e2e threshold-gating by tag (C10).
  "verification": {
    "viewports": [375, 1280],         // widths the slice-tester renders/screenshots at; default mobile + desktop
    "e2e": {
      "feature": "always",            // run the slice's own feature e2e: "always" | "critical-only" | "off"
      "regressionCore": "critical-only", // run the core regression suite: "always" | "critical-only" | "off"
      "visual": "off"                 // run visual-regression e2e: "always" | "critical-only" | "off"
    }
  },

  // Flow knobs that govern the HITL collapse in sell-slice / sell-pie.
  "flow": {
    "autoApproveBuildPlan": false,    // skip the Phase 2 build-plan authorization stop (always auto under the /sell-pie loop)
    "libraryGate": "self-critique"    // net-new-component library gate: "self-critique" | "human" | "off"
  },

  // Default review sensitivity for pies that omit the `<!-- review: ... -->`
  // annotation in the master checklist. A pie's own annotation always wins.
  "review": {
    "default": "boundary"             // "boundary" = autonomous /sell-pie; "continuous" = forced /sell-slice mode
  },

  // Which MCPs the project has installed. Read by sell-slice (frontend pipeline),
  // sell-slice, set-display-case.
  // If the project rules file ALSO declares MCPs, this config wins.
  "mcps": {
    "shadcn": true,
    "magic": false,
    "figma": false,
    "chromeDevTools": true,
    "supabase": false
  },

  // Visual review tooling for sell-slice's visual-reviewer.
  // The "tools" array is an ORDERED priority list — the agent uses
  // the first available one. Defaults match the plugin's hardcoded
  // priority: claude-in-chrome > chrome-devtools-mcp > playwright > vizzly.
  "visualReview": {
    "tools": ["claude-in-chrome", "chrome-devtools-mcp", "playwright", "vizzly"],
    "vizzly": false   // disable Vizzly entirely (e.g., no account / cost concerns)
  },

  // Add project-specific HITL categories beyond the four built-in
  // (prd_ambiguity, external_credentials, destructive_operation, creative_direction).
  // Sub-agents that want to escalate use these category names; the orchestrator
  // surfaces the right prompt to the user.
  "hitl": {
    "additionalCategories": [
      // { "name": "legal_review", "promptHint": "Legal sign-off needed before this lands." }
    ]
  },

  // External rule-file imports (matches cook-pizzas elicitation Q9).
  // When non-empty, cook-pizzas skips Q9 and uses these directly.
  "rules": {
    "imports": [
      // "https://github.com/your-org/agentic-rules/blob/main/monorepo-nextjs/CLAUDE.md"
    ]
  },

  // Bootstrap defaults — used by /bytheslice:setup-shop when present.
  // If absent, bootstrap asks via plan-mode questions.
  "bootstrap": {
    "variant": "single-app",          // "single-app" | "monorepo"
    "stack": "nextjs",                // "nextjs" only in v2.1; more later
    "roadmapFile": "ROADMAP.local.md" // pass null to skip creating the roadmap file
  },

  // Run-pipeline behavior — periodic platform-walk checkpoints during
  // autonomous multi-stage runs. Read by /bytheslice:run-the-day only.
  "runPipeline": {
    "platformWalkEvery": 5,    // 0 = disabled; positive int = dispatch /inspect-display every N completed stages
    "haltOn": "broken",        // "broken" (default) | "drifted" | "never" — when to pause for human review
    "checkpointMode": "foreground" // "foreground" (default — visible in progress report) | "background" (logged only)
  }
}
```

## Keys

### `modelTiers`

Maps agent name → tier alias. Agent names use camelCase (e.g. `qualityReviewer`, `sliceVerifier`). Values must be one of `"haiku" | "sonnet" | "opus"`. Unknown agent names are ignored (with a one-line warning at session start).

The v5 verification agents are `sliceTester` (independent behavioral tester) and `sliceVerifier` (collapsed static-gate verifier). The legacy keys `ciCdGuardrails`, `basicChecksRunner`, and `aggregatingTestReviewer` are **deprecated aliases of `sliceVerifier`** (retained through 5.1 for v4 back-compat) — setting any of them is equivalent to setting `sliceVerifier`. See [`model-tier-guide.md`](./model-tier-guide.md) for the full per-agent table and the deprecation mapping.

Why use this instead of the env vars: env vars override the tier *globally* (every agent typed `opus` becomes the same model). Config overrides individual agent assignments. They compose — env vars handle the alias resolution, the config picks which alias each agent uses.

### `stages.maxTasksPerStage`

Default `6`. Lower = more, smaller stages. Upper bound `8` (above this stages won't fit in a single fresh Claude session reliably).

### `stages.targetFeatureStages`

Default `"20-30"`. The phased-plan splitter aims for a stage count in this band by tuning the split granularity. Smaller number = larger slices.

### `verification`

Knobs for Workflow B (the verify-once stage of `/sell-slice`, also driven per-slice by `/sell-pie`). Each key is independent; omit any to take the default.

- **`viewports`** *(int[], default `[375, 1280]`)* — the widths the `slice-tester` renders and screenshots `frontend` slices at (C7). The list is mobile-first; add widths (e.g. `[375, 768, 1280]`) for finer breakpoint coverage. The `slice-tester` exercises every declared affordance at each width.
- **`e2e`** *(object)* — threshold-gates which e2e suites the `slice-verifier` runs by tag (C10). Each value is `"always" | "critical-only" | "off"`:
  - **`feature`** *(default `"always"`)* — the slice's own feature e2e specs. `"critical-only"` runs just specs tagged critical; `"off"` skips them.
  - **`regressionCore`** *(default `"critical-only"`)* — the cross-slice core regression suite. Defaults to critical-only so per-slice loops stay cheap; raise to `"always"` near a UAT date.
  - **`visual`** *(default `"off"`)* — visual-regression e2e. Off by default because the `slice-tester` already does a rendered design-system match; turn `"always"` on when a project pins screenshots in CI.

### `flow`

Governs the v5 HITL collapse. Each key is independent.

- **`autoApproveBuildPlan`** *(bool, default `false`)* — when `true`, `/sell-slice` skips its Phase 2 build-plan authorization stop and proceeds straight to building. This stop is **always** auto-approved when the slice runs under the `/sell-pie` loop, regardless of this setting; the flag only affects standalone `/sell-slice`.
- **`libraryGate`** *(string, default `"self-critique"`)* — controls the net-new-component library gate (Phase 4.5):
  - `"self-critique"` *(default)* — the agent self-reviews net-new components against the design system and proceeds without a human stop unless it flags a concern.
  - `"human"` — always stop for human approval of net-new components (restores the v4 hard gate).
  - `"off"` — skip the library gate entirely (only sensible when the design-system Pie has already front-loaded all component approval).

### `review`

- **`default`** *(string, default `"boundary"`)* — the review sensitivity applied to a pie that omits the `<!-- review: ... -->` annotation in the master checklist. `"boundary"` lets `/sell-pie` run that pie autonomously with one HITL at the pie boundary; `"continuous"` forces `/sell-pie` into `/sell-slice` (high-touch) mode for it. **A pie's own annotation always wins over this default** — this key only fills the gap for unannotated pies. Per-slice `hitl_required` frontmatter still fires inside an autonomous pie either way.

### `mcps`

Boolean per known MCP. The plugin reads this AND the project rules file's MCP section; the config wins on conflict. Use `true` to declare an MCP available, `false` to declare it unavailable (so the agents won't try to call it).

### `visualReview`

`tools` is an ordered priority list. The visual-reviewer agent walks the list and uses the first tool that's available in the current environment. `vizzly: false` skips Vizzly even if it's in the `tools` list.

### `hitl.additionalCategories`

Each entry is `{ name: string, promptHint: string }`. Sub-agents that want to escalate set `hitl_category` to the `name` value; the orchestrator translates the `promptHint` into a user prompt.

### `rules.imports`

URLs to external rule files (the same shape as elicitation Q9). When this array is non-empty, `cook-pizzas` skips Q9 entirely and uses these imports instead — useful for re-running the planner without re-prompting.

### `bootstrap`

Defaults for `/bytheslice:setup-shop`. When present, bootstrap skips its plan-mode question gate and uses these values directly. Useful for repeatable scaffolding (CI / templates).

### `runPipeline`

Controls periodic platform-walk checkpoints during autonomous multi-stage runs (`/bytheslice:run-the-day`). Each key is independent — set only what you want to override.

- **`platformWalkEvery`** *(int, default `0` = disabled)* — dispatch `/bytheslice:inspect-display` every N completed stages. The walk runs **after** the per-stage gate checklist passes for stage N — so a failing gate halts the run before the walk would have run. Recommended values: `5` for 20-stage plans, `10` for plans where individual stages already include heavy per-slice review.
- **`haltOn`** *(string, default `"broken"`)* — when the walk's `verdict` should pause the autonomous run:
  - `"broken"` *(default)* — pause only when the walk reports `verdict: broken` (conversion flow or auth broken, or >25% of public routes 404/500). The orchestrator prompts the user with `hitl_category: prd_ambiguity` and the walk's top gaps.
  - `"drifted"` — pause on `verdict: drifted` OR `broken`. Stricter; useful when shipping toward a UAT date.
  - `"never"` — log the walk's findings in the progress report but never pause. Truly autonomous.
- **`checkpointMode`** *(string, default `"foreground"`)* — `"foreground"` includes the walk's verdict + top 3 gaps in the per-stage Progress Report. `"background"` logs the report path silently and omits gap detail from the report unless `haltOn` fires.

The walk is read-only by construction (it never edits code or pushes commits), so the run-the-day gate state is unaffected by checkpoint dispatch on its own. Only the `haltOn` rule influences whether the run advances.

If `platformWalkEvery: 0` (the default), the entire checkpoint flow is a no-op — run-the-day behaves exactly as it did before this config existed.

## How the plugin reads this file

At session start, every ByTheSlice skill checks for `bytheslice.config.json` at the project root, parses it as JSONC, and merges it with the precedence above. The orchestrator (`/bytheslice:run-the-day`) logs the resolved settings in its first message so the user sees what's in effect.

If the file is malformed JSON, the plugin halts with an HITL prompt asking the user to fix it (HITL category: `prd_ambiguity` — closest fit). It does NOT fall through to defaults silently — silent fallthrough on a config error would surprise users.

## Forking is still allowed

If the config doesn't expose enough knobs, fork the plugin. But please open an issue first describing what you wanted to override — most reasonable knobs should live in this schema.
