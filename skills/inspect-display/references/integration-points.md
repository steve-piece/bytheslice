<!-- skills/inspect-display/references/integration-points.md -->
<!-- Forward-looking reference: where /inspect-display should integrate with the rest of the ByTheSlice pipeline once this skill stabilizes. Not implemented yet; captured here so future PRs have context. -->

# Integration points for `/inspect-display`

This skill ships as a **standalone, operator-invoked** command in its first slice. The integrations below are deliberately deferred so the skill can prove itself in isolation first. Each section describes the proposed change, the rationale, and the file scope.

---

## 1. `/pizza-party` per-pie checkpoint (proposed: next slice)

**Problem:** `/pizza-party` bakes every pie with no human in the loop after its interview. Each slice is verified and each pie gets a design critique at its boundary, but nothing walks the whole product until Phase 8's smoke check against the order ticket's Acceptance list. A cross-cutting regression introduced in pie 2 (a broken nav, an auth redirect loop) might not be noticed until pie 5, by which point several pies build on the broken foundation.

**Proposal:** Add a configurable checkpoint that dispatches `inspect-display` after every N pies merge into the ship branch (Phase 6).

**Config** (`bytheslice.config.json`): a new `runPipeline` block. The old one, read only by `/run-the-day`, was removed from the schema in 6.0.0; this proposal would bring it back for pies:

```jsonc
{
  "runPipeline": {
    "platformWalkEvery": 2,     // pies between walks; 0 = disabled
    "checkpointMode": "background" // "background" | "foreground"
  }
}
```

`haltOn` does not fit here: `/pizza-party` never pauses after its interview. A walk verdict instead resolves like any other would-be stop under its no-stop rule:
- `verdict: broken`: one fix through `/special-order` (a new slice covering the top gaps), baked before the next pie; still broken, record it under **Deferred** in the order ticket and continue.
- `verdict: drifted`: record the top gaps under **Decisions made without you** and continue.
- `verdict: clean`: one **Progress** line.

**Skill changes:**
- `skills/pizza-party/SKILL.md`: in Phase 6, after a pie merges, dispatch `inspect-display` if `pieIndex % platformWalkEvery == 0`, and apply the verdict rules above
- `skills/setup-shop/references/bytheslice-config-schema.md`: document the new `runPipeline` block (pies, no `haltOn`)

**File scope:** ~3 files, well under the slice cap. Eligible for its own slice once this skill (standalone) is proven.

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
