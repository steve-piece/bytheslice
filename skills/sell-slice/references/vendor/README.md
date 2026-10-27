# Vendored third-party UI review skills

Two third-party skills, copied verbatim at pinned commits. ByTheSlice agents read them as reference text; neither is installed, registered or run as a skill, and no upstream installer was run. Trialed on a real Next.js 16 + Tailwind 4 + shadcn app on 2026-10-27 (15 defects found, all fixed and verified).

| Folder | Upstream | Pinned commit | Upstream paths copied | License |
|---|---|---|---|---|
| `break-ui/` | https://github.com/emilkowalski/skills | `2d228630ba1446365f614a108cb8252f1feda202` | `skills/break-ui/SKILL.md`, `skills/break-ui/CATALOG.md`, `LICENSE` | MIT, Copyright (c) 2026 Emil Kowalski |
| `impeccable/` | https://github.com/pbakaus/impeccable | `d34c87e1a00989ae8dbdd7f6b30b70f23319e860` | `skill/SKILL.src.md`, `skill/reference/critique.md`, `skill/reference/mode-operate.md`, `skill/reference/mode-read.md`, `skill/reference/mode-persuade.md`, `skill/reference/craft-floor.md`, `LICENSE`, `NOTICE.md` | Apache-2.0 |

## Rules for these files

- **Verbatim.** The copied files are unmodified (no ByTheSlice edits, including punctuation), so each one can be diffed against its upstream path at the pinned commit. ByTheSlice's own behavior lives in the wrapper agents, which override the upstream text where the two conflict. Each upstream LICENSE and NOTICE travels with its files.
- **No launcher, no binary.** Impeccable's `scripts/` folder (the `impeccable` launcher that downloads and runs a checksum-verified binary for `context`, `detect`, `critique-storage` and the live overlay) is deliberately not vendored. ByTheSlice uses the skill's documented launcher-unavailable path only: Assessment A inline under a `DEGRADED: single-context` banner, with read-only DOM measurements standing in for the detector. Running the launcher, `npx impeccable`, or any download it triggers needs explicit operator approval through a HITL first. `tests/vendor/vendor.test.js` fails if a `scripts/` folder or an executable file lands here.
- **Not registered.** These folders sit under `references/`, so no host discovers `break-ui/SKILL.md` as a skill. Upstream "Initial Response", interactive questions, `{{placeholder}}` commands, critique persistence and per-client blocks (`<codex>`) do not apply; the wrapper agents say what does.
- **Updating.** Re-copy from upstream at a new commit, update the commit in this table and in `tests/vendor/vendor.test.js`, and re-read the diff for new launcher calls or instructions before merging.

## Who reads what

| Wrapper agent | Reads | Dispatched by |
|---|---|---|
| [`break-ui-runner`](../../agents/frontend/break-ui-runner.md) | `break-ui/SKILL.md`, `break-ui/CATALOG.md` | `/sell-slice` Phase 5.1b and `/sell-pie` Workflow B, per frontend slice with data-bound UI |
| [`design-critic`](../../agents/frontend/design-critic.md) | `impeccable/SKILL.src.md` (Modes only), `impeccable/reference/critique.md` (Assessment A, scoring, severity, personas), the matching `mode-*.md`, `craft-floor.md` (for `proposedFix` wording) | `/inspect-display` Phase 2b, the Library Preview Gate (Phase 4.5), and the `/sell-pie` pie boundary |
