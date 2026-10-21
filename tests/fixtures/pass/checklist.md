<!-- tests/fixtures/pass/checklist.md -->
<!-- Pinned master checklist shaped like the plugin repo's own, parsed by the Pass mod and the kitchen parser alike. -->

# ByTheSlice (fixture): Master Checklist

Fixture for the Pass checklist parser. Counts are pinned in mod/checklist.test.ts and tests/pass/parity.test.js.

**Cadence.** One Pie per PR: `/sell-pie` bakes, `/box-it-up` opens the boundary PR and merges.

---

## Prep - Pie 1: Foundations (run once before any feature work)

This is Pie 1 (Foundations): the run-once standalone skills.

[x] Slice 1.1 - Display case built: n/a for this repo (no app UI to preview)
[x] Slice 1.2 - Quality line installed: `bash hooks/test.sh` plus `claude plugin validate`
[x] Slice 1.3 - Shop open: n/a (no external service credentials)
<!-- Slice 1.4 (DB schema foundation) intentionally absent: no backend in scope. -->

---

## Pie 2 - v4.2 Hook and Subagent Enhancements [x]    <!-- review: boundary -->
**Pie scope:** tighten the hook infrastructure | **MVP:** Yes | **Depends on:** none
**Review:** boundary
Status: Completed. Slice 2.1 shipped as v4.2.0.

### Slice 2.1 - Hooks tightening (v4.2.1) [x]
Status: Completed (shipped in v4.2.0, commit 4eec517)
**Type:** infrastructure | **Plan:** [stage_1_v4.2.1_hooks_tightening.md](stage_1_v4.2.1_hooks_tightening.md)

### Slice 2.2 - sell-slice agent expansion [x]
Status: Completed (superseded by v5.0.0)
**Type:** infrastructure

---

## Pie 3 - Native Agent Registration [x]    <!-- review: continuous -->
**Pie scope:** register the markdown subagent roster as native plugin agents | **MVP:** Yes | **Depends on:** Pie 2
**Review:** continuous
Status: Shipped. Released as 5.1.0.

### Slice 3.1 - Register 48 agents in plugin.json [x]
Status: Completed (commit 8453de9)

### Slice 3.2 - Normalize agent frontmatter [x]
Status: Completed (commit 8453de9)

---

## Pie 4 - Live Kitchen [x]    <!-- review: boundary -->
**Pie scope:** wire the Slice Kitchen mockup to real project state | **MVP:** Yes | **Depends on:** Pie 3
<!-- kitchen-piece-exemption: walls, menu | Foundations are fulfilled by the existing plugin scaffold. -->
**Review:** boundary
Status: All three slices complete and pushed. Ready for /box-it-up.

### Slice 4.1 - Activity feed [x]
Status: Completed. Hook checks and plugin validation passed.
**Type:** infrastructure | **Plan:** [stage_41_activity_feed.md](stage_41_activity_feed.md)

### Slice 4.2 - Kitchen viewer [x]
Status: Completed and pushed in e179740.
**Type:** full-stack

### Slice 4.3 - Real cast [x]
Status: Completed and pushed in a19e1eb.
**Type:** frontend

```text
## Pie 9 - A heading inside a fence is never parsed [ ]
### Slice 9.1 - Nor is this one [ ]
```

---

## Pie 5 - The Pass [ ]    <!-- review: boundary -->
**Pie scope:** ship the Pass mod (every check warns) | **MVP:** Yes | **Depends on:** Pie 4
**Review:** boundary
Status: Not Started. Plans written 2026-10-20.

### Slice 5.1 - Pass pane and band [ ]
Status: Not Started
**Type:** infrastructure | **Plan:** [stage_51_pass_pane.md](stage_51_pass_pane.md)

### Slice 5.2 - Ledger and status tool [ ]
Status: Not Started
**Type:** infrastructure | **Plan:** [stage_52_pass_ledger.md](stage_52_pass_ledger.md)

### Slice 5.3 - Pass checks as warnings [ ]
Status: Not Started
**Type:** infrastructure

### Slice 5.4 - Hook reduction [ ]
Status: Not Started
**Type:** infrastructure

### Slice 5.5 - Watchdog and HITL inbox [ ]
Status: Not Started
**Type:** infrastructure

### Slice 5.6 - Team mode [ ]
Status: Not Started
**Type:** infrastructure

### Slice 5.7 - Review, collaboration and progress [ ]
Status: Not Started
**Type:** infrastructure

### Slice 5.8 - Docs and release [ ]
Status: Not Started
**Type:** infrastructure

---

## Pie 6 - Frontend Path [ ]    <!-- review: boundary -->
**Pie scope:** make the frontend path verifiable | **MVP:** Yes | **Depends on:** Pie 5
Status: Not Started.

### Slice 6.1 - Frontend build manifest [ ]
Status: Not Started

### Slice 6.2 - Frontend small fixes [ ]
Status: Not Started

---

## MVP Summary

| Pie | Slice | Name | Type | Status |
|-----|-------|------|------|--------|
| 2 | 2.1 | Hooks tightening (v4.2.1) | infrastructure | [x] |
| 5 | 5.1 | Pass pane and band | infrastructure | [ ] |
