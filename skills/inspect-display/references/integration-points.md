<!-- skills/inspect-display/references/integration-points.md -->
<!-- Forward-looking reference: where /inspect-display should integrate with the rest of the ByTheSlice pipeline once this skill stabilizes. Not implemented yet; captured here so future PRs have context. -->

# Integration points for `/inspect-display`

This skill ships as a **standalone, operator-invoked** command in its first slice. The integrations below are deliberately deferred so the skill can prove itself in isolation first. Each section describes the proposed change, the rationale, and the file scope.

---

## 1. `/run-the-day` periodic checkpoint (proposed: next slice)

**Problem:** `/run-the-day` runs in autonomous multi-stage mode without a human in the loop. A regression introduced in stage 7 might not be noticed until stage 15, by which point the autonomous run has racked up 8 commits that all build on the broken foundation.

**Proposal:** Add a configurable checkpoint that dispatches `inspect-display` every N stages.

**Config addition** (`bytheslice.config.json`):

```jsonc
{
  "runPipeline": {
    "platformWalkEvery": 5,     // 0 = disabled
    "haltOn": "broken",         // "drifted" | "broken" | "never"
    "checkpointMode": "background" // "background" | "foreground"
  }
}
```

**Skill changes:**
- `skills/run-the-day/SKILL.md`: add Phase 2.5 between stage dispatches that dispatches `inspect-display` if `stageIndex % platformWalkEvery == 0`
- `skills/setup-shop/references/bytheslice-config-schema.md`: document the new `runPipeline.platformWalkEvery` etc. keys

**Halt rules:**
- `haltOn: "broken"` (default), pause for user input if `verdict: broken`
- `haltOn: "drifted"`: pause if `verdict: drifted` OR `broken`
- `haltOn: "never"`: log the report but never pause (truly autonomous)

**File scope:** ~4 files, well under the slice cap. Eligible for its own slice once this slice (the standalone skill) is merged and proven.

---

## 2. `/close-shop` retrospective augmentation (proposed: future)

**Problem:** `/close-shop` currently analyzes workflow friction (commits, PR records, HITL escalations) but has no visibility into *product state*. If the per-stage gates passed but the product is half-mocked, the retrospective won't surface that; it's a meta-friction signal.

**Proposal:** Add `inspect-display` to Step 2 of `/close-shop` (the "read execution data" phase). Pass the walk's drift counts to the `retrospective-reviewer` agent as input.

**Skill changes:**
- `skills/close-shop/SKILL.md`: add inspect-display invocation in Step 2 (or make it an opt-in flag)
- `skills/close-shop/agents/retrospective-reviewer.md`: extend the input contract to include `platform_walk_findings` and add an "are the per-stage gates catching what they should?" pattern to the analysis

**Why this matters:** if the retrospective sees that `inspect-display` is finding mock-data leaks on slices that already passed `slice-tester`, that's evidence the per-slice gate has a blind spot, and the retrospective can propose a Phase 6.5 mock-data check to plug it.

**File scope:** ~2-3 files. Eligible for its own slice after #1 lands.

---

## 3. Explicitly NOT integrating

These integrations were considered and rejected:

| Integration | Why skip |
|---|---|
| `/box-it-up --with-platform-walk` flag | Slice-level CI + `slice-tester` already gate the diff. A full platform walk on every push burns time on unchanged surfaces. If an operator wants this, they can invoke `/inspect-display` manually before `/box-it-up`. |
| `/special-order` baseline snapshot | `/special-order` already does discovery. Adding a platform walk before every feature adds time without proportional signal; the operator can invoke `/inspect-display` separately if they suspect rot. |
| Replacing `slice-tester` | `slice-tester` does the per-slice rendered review against the manifest and Exit criteria; `inspect-display` does cross-cutting route coverage. Different scopes, both valuable. Keep both. |

---

## Open questions for future slices

- **Caching the route list.** Discovery is deterministic from the file system; for large monorepos, caching the discovered route list (with a hash of the relevant `app/`, `pages/`, `src/routes/` trees) would let repeat walks skip the discovery phase. Worth it once a project hits ~100+ routes.
- **Diff mode.** `/inspect-display --since=HEAD~5` could walk only the routes whose wrapper files changed in the last N commits. Useful as a pre-`/box-it-up` smoke test without the full-walk cost.
- **Comparison mode.** `/inspect-display --baseline=<previous-walk-dir>` could diff this walk's findings against a prior walk's findings, surfacing "what newly broke" vs "what was already broken." Useful for tracking drift over time.

None of these block the initial skill. Capture them here so a future contributor sees the design space.
