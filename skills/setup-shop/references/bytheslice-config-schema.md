# ByTheSlice Config Schema

`bytheslice.config.json` is an **optional** per-project file at the root of the user's project (NOT inside the plugin). It declaratively overrides plugin defaults so users don't have to fork the plugin to personalize behavior.

## File location

```
<user-project-root>/bytheslice.config.json
```

If the file is absent, the plugin uses its built-in defaults (see [`skills/setup-shop/references/model-tier-guide.md`](./model-tier-guide.md) for model defaults). All keys are optional; a config file with `{}` is valid and equivalent to no config.

## Format

JSON-with-comments (JSONC dialect, same as `tsconfig.json`). The plugin parses comments and trailing commas. The `.json` extension is conventional even though the content allows comments.

## Precedence (top wins)

1. **Environment variables**: machine-level
   - `ANTHROPIC_DEFAULT_OPUS_MODEL`, `ANTHROPIC_DEFAULT_SONNET_MODEL`, `ANTHROPIC_DEFAULT_HAIKU_MODEL`
   - `CLAUDE_CODE_SUBAGENT_MODEL` (force-override of all subagent models)
2. **`bytheslice.config.json`**: per-project, version-controlled with the project
3. **Project rules file** (`CLAUDE.md` or `AGENTS.md`), per-project conventions captured during elicitation
4. **Plugin spec defaults**: fallback when nothing else is set

When two sources disagree, the higher-precedence source wins. The orchestrator logs the resolved values at session start so the user knows what's in effect.

## Schema

```jsonc
{
  // "block" (default) | "warn". See `enforcement` below.
  "enforcement": "block",

  // Override per-agent model tier. Falls back to plugin defaults
  // documented in references/model-tier-guide.md.
  // Use the alias names: "haiku", "sonnet", "opus".
  "modelTiers": {
    "implementer": "opus",
    "qualityReviewer": "opus",
    "specReviewer": "sonnet",
    "discovery": "opus",
    "sliceTester": "sonnet",      // v5, independent behavioral tester
    "sliceVerifier": "sonnet",    // v5, collapsed static-gate verifier
    "checklistCurator": "sonnet",
    "modernUxExpert": "sonnet",
    "layoutArchitect": "sonnet",
    "blockComposer": "sonnet",
    "componentCrafter": "sonnet",
    "stateIllustrator": "sonnet",
    "tokenExpander": "opus",
    "bundleValidator": "sonnet",
    "compliancePreCheck": "sonnet",
    "envVerifier": "haiku",
    "prdReviewer": "sonnet",
    "phasedPlanWriter": "opus",
    "dbSchemaStageWriter": "opus",
    "masterChecklistSynthesizer": "opus",
    "complexityAssessor": "opus",
    "scaffoldDiscovery": "opus",
    "retrospectiveReviewer": "opus"
  },

  // Per-stage shape preferences for cook-pizzas + sell-slice.
  "stages": {
    "maxTasksPerStage": 6,            // hard cap per stage; default 6
    "targetFeatureStages": "20-30"    // unset or "20-30": a ceiling for large apps, never padding (a small brief gets few pies);
                                      // any other band, e.g. "10-15" or "30-40", is an operator override the count must land in
  },

  // Verification knobs consumed by sell-slice's Workflow B (slice-tester +
  // slice-verifier) and by sell-pie's per-slice loop. Drives viewport coverage
  // (C7) and e2e threshold-gating by tag (C10).
  "verification": {
    "viewports": [375, 768, 1280],    // widths the slice-tester renders at; screenshots only at 768 and 1280
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

  // How finished slices reach main, plus the soft per-slice time budget.
  // Read by sell-pie, sell-slice and box-it-up.
  "delivery": {
    "mode": "pie-pr",                 // "pie-pr" (default: one PR per pie via /box-it-up) | "merge-per-slice" | "ship-once"
    "sliceBudgetHours": 3,            // soft wall-clock budget per slice; 0 = off
    "shipBranch": "ship/<repo dir>"   // ship-once only: the local branch every pie merges into
  },

  // How much test and CI scaffold /final-quality-check writes, and what the local gates run.
  "quality": {
    "tier": "standard"                // "standard" | "lean" | "auto"
  },

  // Shadcn-style UI registries searched before the stock shadcn registry. Empty = stock only.
  "ui": {
    "registries": [],                 // the operator's own: "@namespace" strings or { name, item, catalog?, theme?, notes? }
    "registryFirst": true,
    "useDirectory": true,             // also search the public shadcn registry directory
    "directoryTop": 25                // how many of its healthy registries a search covers
  },

  // Nobody is watching: skills decide, record and continue instead of asking. /pizza-party sets it.
  "run": {
    "unattended": false
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

  // Browser tooling for slice-tester's rendered review (sell-slice and sell-pie).
  // The "tools" array is an ORDERED priority list, the agent uses
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

  // Bootstrap defaults, used by /bytheslice:setup-shop when present.
  // If absent, bootstrap asks via plan-mode questions.
  "bootstrap": {
    "variant": "single-app",          // "single-app" | "monorepo"
    "stack": "nextjs",                // "nextjs" only in v2.1; more later
    "roadmapFile": "ROADMAP.local.md" // pass null to skip creating the roadmap file
  }
}
```

## Keys

### `enforcement`

`"block"` (the default when the key is absent or unreadable) or `"warn"`. Under `block`, the workflow guard hook (`hooks/workflow-guard.sh`) refuses a hand-written `docs/plans/stage_*.md` or a pie or slice heading added to the checklist outside `/special-order` and `/cook-pizzas`, a code-writing Agent call outside `/sell-slice`, `/sell-pie` and `/pizza-party`, and a `gh ... pr create` while a slice on the branch has no `slice-verifier` pass in the ledger; the Pass refuses a slice marked `[x]` with no verifier pass. Under `warn` each of those goes through with a warning. ByTheSlice's own skills and `bytheslice:*` agents are never refused.

Only the operator sets `warn`, by editing this file by hand: the guard refuses an agent's edit that does it, and one that adds `BTS_ALLOW_BYPASS` or `BTS_HOOKS_DISABLED` to `.claude/settings*.json`. The one-session override is launching Claude Code with `BTS_ALLOW_BYPASS=1`, which turns every refusal into a warning. The key is also read from `~/.bytheslice/defaults.json` when the project file does not set it.

### `modelTiers`

Maps agent name → tier alias. Agent names use camelCase (e.g. `qualityReviewer`, `sliceVerifier`). Values must be one of `"haiku" | "sonnet" | "opus"`. Unknown agent names are ignored (with a one-line warning at session start).

The v5 verification agents are `sliceTester` (independent behavioral tester) and `sliceVerifier` (collapsed static-gate verifier). See [`model-tier-guide.md`](./model-tier-guide.md) for the full per-agent table.

Why use this instead of the env vars: env vars override the tier *globally* (every agent typed `opus` becomes the same model). Config overrides individual agent assignments. They compose: env vars handle the alias resolution, the config picks which alias each agent uses.

### `stages.maxTasksPerStage`

Default `6`. Lower = more, smaller stages. Upper bound `8` (above this stages won't fit in a single fresh Claude session reliably).

### `stages.targetFeatureStages`

Default `"20-30"`, read as a **ceiling for large apps, never a target to pad toward**. With the key unset (or at the default), `stage-decomposer` right-sizes the roadmap to the PRD: a small brief (a private single-user tool, a handful of Section 2 features) gets few pies and few slices, and a pie of a small app may hold 1 or 2 slices. No filler slices, no shell and data split for a feature one slice holds, no pie invented to fill a count; only a count over 30 is reported `over`.

Set it to any other band (for example `"10-15"` or `"30-40"`) and it is an operator override: the splitter tunes its granularity until the count lands inside that band, and a count below it is reported `under`. Smaller numbers mean larger slices.

### `verification`

Knobs for Workflow B (the verify-once stage of `/sell-slice`, also driven per-slice by `/sell-pie`). Each key is independent; omit any to take the default.

- **`viewports`** *(int[], default `[375, 768, 1280]`)* - the widths the `slice-tester` renders `frontend` slices at (C7). The list is mobile-first. The `slice-tester` exercises every declared affordance at each width, but takes screenshots only at 768 and 1280: one 768px and one 1280px (desktop) screenshot per new UI surface. Other widths (such as 375) are checked from the rendered page without a screenshot. A list that omits 768 or 1280 gets no screenshot at the missing width.
- **`e2e`** *(object)*, threshold-gates which e2e suites the `slice-verifier` runs by tag (C10). Each value is `"always" | "critical-only" | "off"`:
  - **`feature`** *(default `"always"`)*, the slice's own feature e2e specs. `"critical-only"` runs just specs tagged critical; `"off"` skips them.
  - **`regressionCore`** *(default `"critical-only"`)*, the cross-slice core regression suite. Defaults to critical-only so per-slice loops stay cheap; raise to `"always"` near a UAT date.
  - **`visual`** *(default `"off"`)*, visual-regression e2e. Off by default because the `slice-tester` already does a rendered design-system match; turn `"always"` on when a project pins screenshots in CI.

### `flow`

Governs the v5 HITL collapse. Each key is independent.

- **`autoApproveBuildPlan`** *(bool, default `false`)*, when `true`, `/sell-slice` skips its Phase 2 build-plan authorization stop and proceeds straight to building. This stop is **always** auto-approved when the slice runs under the `/sell-pie` loop, regardless of this setting; the flag only affects standalone `/sell-slice`.
- **`libraryGate`** *(string, default `"self-critique"`)*, controls the net-new-component library gate (Phase 4.5):
  - `"self-critique"` *(default)*, the agent self-reviews net-new components against the design system and proceeds without a human stop unless it flags a concern.
  - `"human"`: always stop for human approval of net-new components (restores the v4 hard gate).
  - `"off"`: skip the library gate entirely (only sensible when the design-system Pie has already front-loaded all component approval).

### `review`

- **`default`** *(string, default `"boundary"`)*, the review sensitivity applied to a pie that omits the `<!-- review: ... -->` annotation in the master checklist. `"boundary"` lets `/sell-pie` run that pie autonomously with one HITL at the pie boundary; `"continuous"` forces `/sell-pie` into `/sell-slice` (high-touch) mode for it. **A pie's own annotation always wins over this default**: this key only fills the gap for unannotated pies. Per-slice `hitl_required` frontmatter still fires inside an autonomous pie either way.

### `delivery`

How a finished slice reaches `main`, and how long a slice may run before the conductor checks in. Each key is independent.

- **`mode`** *(string, default `"pie-pr"`)* - the closeout path:
  - `"pie-pr"` *(default)* - each slice commits and pushes to the pie branch with no PR; `/box-it-up` opens one `Pie N` PR at the pie boundary, CI runs once, and the operator approves the merge.
  - `"merge-per-slice"` - each slice gets its own branch (`pie-N-sN.M-<scope>`) cut from fresh `origin/main` into its own worktree, then its own PR `Slice N.M: <name>`. The conductor waits for CI, runs up to 3 `ci-fix-attempter` rounds on red (still red after 3 halts the loop with a HITL; a slice is never skipped), merges on green with a **merge commit** (never squash), syncs `main` `--ff-only` from the primary checkout, deletes the branch locally and remotely, removes the slice worktree, prunes, and cuts the next slice from the fresh `main`. There is no per-slice merge approval; the operator gets one notice when the pie finishes. If the repo disallows merge commits (`gh repo view --json mergeCommitAllowed`), the loop halts and asks. There is never an integration branch.
  - **A run instruction wins for that run.** When the operator's run instruction explicitly asks for autonomous delivery (for example "merge each slice", "deliver it to main without me"), that run uses `"merge-per-slice"` even if the config says `"pie-pr"`; an instruction asking for one PR per pie likewise overrides a `"merge-per-slice"` config. Invoking `/sell-pie` on its own is not such an instruction.
  - **`review: continuous` pies always use `"pie-pr"`**, whatever this key or the run instruction says.
  - `"ship-once"` - every gate is local and the app ships in one PR. One local ship branch (`shipBranch`) is cut from `origin/main`; each pie branches from it, its slices run the same Workflow and commit with no push, and `/box-it-up --pie-local` runs the full local check once and merges the pie into the ship branch with `--no-ff` (every slice commit kept, merge subject `merge(pie-N): ...`). After the last pie, `/box-it-up --ship` pushes the ship branch, opens one PR to `main` with every pie's evidence, runs CI once (up to 3 fix rounds) and merges on green with a merge commit. No human merge gate. A `review: continuous` pie bakes hands-off under ship-once. `/pizza-party` uses this mode.
- **`shipBranch`** *(string, default `"ship/<primary checkout dir name>"`)* - the ship-once branch. Ignored by the other modes.
- **`sliceBudgetHours`** *(number, default `3`; `0` = off)* - a soft wall-clock budget per slice, counting CI time and excluding time spent waiting on the operator. The slice's start time lives in the run log (`.claude/.bytheslice-state/run-log.md`). When the budget is hit, the conductor lets the current agent finish, then checks in with a `prd_ambiguity` HITL carrying progress, the blocker, and the options (extend, stop).

### `quality`

- **`tier`** *(string, default `"standard"`)* - how much scaffold `/final-quality-check` writes and what the local gates run.
  - `"standard"` - the full line: CI, `@feature`, `@regression-core` and `@visual` E2E, coverage, design-system compliance, schema drift when a database exists.
  - `"lean"` - lint, typecheck, unit tests, build and one `@smoke` Playwright spec (`test:e2e:smoke`); design-system compliance only when a design system exists. Pre-push and slice-verifier run the same set.
  - `"auto"` - lean when the checklist has at most 3 feature pies and nothing touches payments, else standard. `/pizza-party` sets it.

### `ui`

Where the UI phase finds pre-built pages, blocks and components is [`ui-sources.md`](../../sell-slice/references/ui-sources.md): the operator's own registry preferences first, else the public shadcn registry directory (`https://ui.shadcn.com/r/registries.json`), then stock shadcn. `scripts/ui-sources.js` resolves the list.

- **`registries`** *(array, default `[]`)* - the operator's own registries, searched in order before everything else, by `block-composer`, `component-crafter`, the implementer and `/set-display-case`. An entry is a namespace string (`"@magicui"`, any registry in the shadcn directory) or an object for a registry outside it: `name` (label), `catalog` (URL of a machine-readable catalog such as `llms.txt` or a registry meta JSON), `item` (install URL template with `{name}`), optional `theme` (an item installed first on a greenfield project, after which only its brand layer is set), optional `notes` (that registry's install rules). Installs use `yes n | npx shadcn@latest add "<item URL>" --yes`, never `--overwrite`. No registry is a plugin default; keep yours in `~/.bytheslice/defaults.json`:

```jsonc
{
  "ui": {
    "registries": [
      {
        "name": "my-kit",
        "catalog": "https://ui.example.com/llms.txt",
        "item": "https://ui.example.com/r/{name}.json",
        "theme": "theme",
        "notes": "Knob names in https://ui.example.com/registry-meta.json; add ns=mr when the host already has components/ui."
      }
    ]
  }
}
```

- **`registryFirst`** *(boolean, default `true` when `registries` is non-empty)* - `false` searches stock shadcn first and uses the registries for what it leaves.
- **`useDirectory`** *(boolean, default `true`)* - also search the public shadcn registry directory: its healthy React registries (health 90 or more, 30 items or more), best ranked first. `false` keeps the search to the operator's registries and stock shadcn.
- **`directoryTop`** *(int, default `25`)* - how many directory registries a search covers.

### `run`

- **`unattended`** *(boolean, default `false`)* - nobody is watching. Skills take recommended answers, record each one in the order ticket (`docs/pizza-party/order.md`) or the skill's own decisions section, and continue: no skill returns `needs_human`. A would-be blocker defers the slice instead (row stays `[ ]` with `Status: deferred: <reason>`; under ship-once its commits move to a local `deferred/pie-N-sN.M` branch) and the run returns `complete_with_deferrals`. Fix caps never rise, the workflow guard still refuses shortcuts, and destructive operations on shared resources the operator did not name are skipped. `/pizza-party` sets it together with `delivery.mode: "ship-once"`; in `/sell-pie` and `/box-it-up` it takes effect only under ship-once.

### `mcps`

Boolean per known MCP. The plugin reads this AND the project rules file's MCP section; the config wins on conflict. Use `true` to declare an MCP available, `false` to declare it unavailable (so the agents won't try to call it).

### `visualReview`

`tools` is an ordered priority list, passed to `slice-tester`. It walks the list and uses the first tool that's available in the current environment. `vizzly: false` skips Vizzly even if it's in the `tools` list.

### `hitl.additionalCategories`

Each entry is `{ name: string, promptHint: string }`. Sub-agents that want to escalate set `hitl_category` to the `name` value; the orchestrator translates the `promptHint` into a user prompt.

### `rules.imports`

URLs to external rule files (the same shape as elicitation Q9). When this array is non-empty, `cook-pizzas` skips Q9 entirely and uses these imports instead, useful for re-running the planner without re-prompting.

### `bootstrap`

Defaults for `/bytheslice:setup-shop`. When present, bootstrap skips its plan-mode question gate and uses these values directly. Useful for repeatable scaffolding (CI / templates).

## How the plugin reads this file

At session start, every ByTheSlice skill checks for `bytheslice.config.json` at the project root, parses it as JSONC, and merges it with the precedence above. The conductor (`/sell-pie`, or `/pizza-party` for a whole app) logs any non-default settings in its first message so the user sees what's in effect.

If the file is malformed JSON, the plugin halts with an HITL prompt asking the user to fix it (HITL category `prd_ambiguity`, the closest fit). It does NOT fall through to defaults silently; silent fallthrough on a config error would surprise users.

## Forking is still allowed

If the config doesn't expose enough knobs, fork the plugin. But please open an issue first describing what you wanted to override; most reasonable knobs should live in this schema.
