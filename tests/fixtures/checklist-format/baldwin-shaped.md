# Master Checklist: Armor Shop

> Shaped like a long-lived client checklist (2026-11-03): dated notes above the pies, heading-comment statuses, a duplicate Prep slice heading, a slice id with a letter, one pie written only as a table, and summary tables below.

## Client feedback, 2026-10-25

- Vocabulary Status cells render plain Active or Inactive text.

## Checklist audit, 2026-09-10

| Pie | Verdict | What the audit found |
|---|---|---|
| 2 Marketing | **Complete** | Three slices, all boxes ticked |
| 5 Security | Partial | 5.2 owes its retention windows |

## Prep (Pie 1 Foundations, run once before any feature work) <!-- Status: Completed, 2026-07-22 -->

- [x] Slice 1.0: Monorepo conversion      completed 2026-07-19
- [x] Slice 1.1: Display case built       completed 2026-07-20
- [x] Slice 1.2: Quality line installed   completed 2026-07-21
- [x] Slice 1.3: Shop open                completed 2026-07-22
- [x] Slice 1.4: DB schema foundation     completed 2026-07-22

### Slice 1.4: DB Schema Foundation    <!-- Status: Completed, 2026-07-22 -->
**Status:** Completed
**Type:** db-schema | **Depends on:** Slices 1.0, 1.2, 1.3

Exit criteria:
- [x] `packages/db` typechecks
- [x] Every table has RLS enabled

---

## Pie 2: Marketing Completion    <!-- review: boundary --> <!-- Status: Completed, 2026-08-25 -->
**Pie scope:** finish the marketing pages | **MVP:** Yes

### Slice 2.1: About Page    <!-- Status: Completed, 2026-07-22 -->
**Status:** Completed
**Type:** frontend

### Slice 2.2: Products Page    <!-- Status: Completed, 2026-07-23 -->
**Type:** frontend

### Slice 2.3: Privacy Policy    <!-- Status: Completed, 2026-07-24 -->
**Type:** frontend

## Pie 3: Quote Builder    <!-- review: continuous --> <!-- Status: Completed, reconciled 2026-11-03 -->

### Slice 3.1: Packages as Bundles    <!-- Status: Completed, 2026-08-27 -->
**Status:** Completed

### Slice 3.2: Quote Schema    <!-- Status: Completed, verified 2026-10-21 -->
**Status:** Completed

### Slice 3.2a: Writable-Column Projection    <!-- Status: Completed 2026-08-31 -->
**Status:** Completed

### Slice 3.3: Two-Pane Builder UI    <!-- Status: Completed, verified 2026-10-21 -->
**Status:** Completed

## Pie 4: In-Stock Marketplace    <!-- review: boundary -->

| Slice | Stage | Deliverable / Plan | Tasks | Implementation |
|---|---|---|---|---|
| 4.1 | 44 | [Listing Records](stage_44_listing_records.md) | 5 | Completed, verified 2026-10-21 |
| 4.2 | 45 | [Listing Editor](stage_45_listing_editor.md) | 5 | Completed, verified 2026-10-21 |
| 4.3 | 46 | [Listing Photos](stage_46_listing_photos.md) | 6 | Not Started |

## Pie 5: Security Conditions of Acceptance    <!-- review: continuous -->

### Slice 5.1: RLS Coverage Tests    <!-- Status: Completed, verified 2026-10-21 -->
**Status:** Completed

### Slice 5.2: Retention and Secure Deletion    <!-- Status: Partial: secure deletion verified; retention windows owed -->
**Status:** Partial

### Slice 5.3: Rate Limiting    <!-- Status: Completed, verified 2026-10-21 -->
**Status:** Completed

## MVP Summary

| Pie | Slice | Name | Type | Status |
|---|---|---|---|---|
| 1 | 1.0 | Monorepo Conversion | infrastructure | [x] |
| 2 | 2.1 | About Page | frontend | [x] |
| 5 | 5.2 | Retention and Secure Deletion | full-stack | [~] |

## Unnumbered work, 2026-09-07: the admin shell, client direction

**Status is no longer picked, it happens.** A quote is a draft until it is sent.
