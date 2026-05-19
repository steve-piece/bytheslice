---
name: inspect-display
description: Walk the display tray and eyeball every pie that's already on display — a cross-cutting, platform-wide visual walkthrough of a running web app. Catches what's broken, mocked, or empty across the WHOLE product, not just the latest slice. Read-only. Use before UAT, before a demo, after a batch of `/box-it-up` runs, or any time the checklist and reality have drifted.
user-invocable: true
triggers: ["/bytheslice:inspect-display", "/inspect-display", "walk the display", "case walk", "/bytheslice:walk-platform", "/walk-platform", "walk the platform", "walk the app", "audit the app", "audit the platform", "pre-uat walk", "smoke test the whole app", "platform-wide visual audit"]
---
<!-- skills/inspect-display/SKILL.md -->
<!-- On-demand, platform-wide visual walkthrough. Pizza-shop framing: walk past the display tray, eyes on every pie that's already up. Complements (does not replace) /sell-slice's per-slice visual-reviewer: that agent reviews ONE slice against its declared states; this skill walks EVERY route to catch unrelated regressions, mock-data leaks, dead links, and dynamic-route validation gaps. Read-only. -->

# /inspect-display

`/sell-slice`'s frontend pipeline already runs a sophisticated **per-slice** visual reviewer (Phase 4.7) that checks the just-built slice against the design system at 4 viewports. That's the right gate when shipping a single slice.

`/inspect-display` is a **different shape**: a cross-cutting, on-demand walkthrough of the *whole running app*. It answers questions the per-slice review can't — "did this slice break an unrelated page?", "what's mock vs real across the product?", "are there 404s on footer links?", "do my dynamic routes actually validate the id?". Run it when checklist claims and runtime reality might have drifted.

> [!IMPORTANT]
> **Read-only by design.** This skill never edits code, never bypasses auth, never triggers mutations. It surfaces gaps; the operator decides what to fix.

---

## Mode detection

`/inspect-display` is **always standalone**. It walks every route of a running web app and produces a read-only report. Whether or not a master checklist exists is irrelevant — the skill never edits code, never opens PRs, never modifies any checklist row.

If the running app has a `docs/plans/00_master_checklist.md`, the skill will include a "checklist drift" section in the report (e.g. *"Stage 12 is marked Completed but `/host/dashboard` shows mock data"*) — but the checklist itself stays untouched.

## When this is the right tool

- **Before UAT** — verify the platform is actually ready, not just claimed ready.
- **Before a demo** — find what a clicking user would notice first.
- **After several `/box-it-up` runs** — catch silent regressions on surfaces nobody touched.
- **Pre-`/special-order`** — baseline the existing state before bolting on more.
- **When the master checklist disagrees with reality** — drift detection is exactly this skill's job.

Not the right tool for:
- Per-slice spec compliance — that's the existing `visual-reviewer` in `sell-slice` Phase 4.7.
- Static code analysis — this skill needs the app actually running.
- Accessibility deep-dives — use the `accessibility-review` design skill.

---

## Subagent Roster

| Phase | Agent file | Model | Effort | Mode |
|-------|-----------|-------|--------|------|
| 2 (the walk itself) | [agents/platform-walker.md](agents/platform-walker.md) | sonnet | high | read-only |

The walk itself runs as one sub-agent dispatch — sub-agents have isolated context, which is the right shape for an iterative click-through that would otherwise burn the orchestrator's context window on screenshots.

---

## Inputs and Preconditions

> Skill-routing preconditions (checklist gate, branch sanity) are pre-enforced by `hooks/precheck-skill.sh` **when hooks are active**. If `BTS_HOOKS_DISABLED=1` or `disableAllHooks` is set, run those checks inline via tools and proceed silently. The browser-MCP availability check below is skill-specific and runs in-skill regardless.

- Repo root is a runnable web app (or monorepo of web apps).
- `package.json` (or `turbo.json` / `pnpm-workspace.yaml` / `nx.json`) declares a `dev` script.
- At least one browser MCP is available:
  - `mcp__Claude_in_Chrome__*` (preferred)
  - `mcp__chrome-devtools__*`
  - `mcp__Claude_Preview__*`
  - `mcp__computer-use__*` (last resort)
- `.env.local` (or equivalent) is populated enough for the dev server to boot.

If no browser MCP is available, the skill stops and surfaces `needs_human: external_credentials` — there's no point producing a fake report.

---

## Workflow

### Phase 0 — Pre-flight

1. Detect the framework(s) in use (Next.js app/pages router, SvelteKit, Remix, Astro, Nuxt, Vite). Check `package.json` dependencies + presence of router-specific dirs (`app/`, `pages/`, `src/routes/`).
2. Detect dev-server invocation: prefer `pnpm dev` if `pnpm-workspace.yaml` exists, `npm run dev` otherwise. For monorepos, capture all app names + their declared ports (from `package.json` scripts or `turbo.json`).
3. Confirm at least one browser MCP is available. If multiple, capture the priority order: Claude in Chrome → Chrome DevTools MCP → Claude Preview → computer use.

### Phase 1 — Boot the dev server

1. Spawn the dev-server command with the shell's `run_in_background: true`. Capture the PID for cleanup.
2. Poll each declared port with `curl -s -o /dev/null -w "%{http_code}" http://localhost:<port>` in a short until-loop. Do not sleep blindly.
3. Wait for at least one route to return 200 (or 3xx) on every declared port before proceeding. Cap the wait at **90 seconds** — beyond that, surface as `needs_human: external_credentials` (likely env config gap).

### Phase 2 — Dispatch the platform-walker subagent

Read [agents/platform-walker.md](agents/platform-walker.md) and dispatch via the `Task` tool. Pass:

- The detected framework(s)
- The list of apps + ports
- The path to one real id for each dynamic route (probe the seed/test data; if none available, mark dynamic routes as skipped with a note)
- The browser MCP priority order
- The target output directory for screenshots (default `./.inspect-display/<yyyy-mm-dd-hhmm>/`)

The sub-agent does the actual walk: route discovery, browser driving, screenshotting, gap detection, ranked-report assembly. It runs in its own context — the orchestrator does not see every screenshot, only the structured return contract.

### Phase 3 — Cleanup

1. Kill the dev-server PID captured in Phase 1. Fallback sweep: `pkill -f "next dev" || true`, `pkill -f "vite" || true`, `pkill -f "turbo dev" || true`.
2. Close any browser sessions the sub-agent opened.
3. Confirm no orphan processes are holding the ports.

### Phase 4 — Surface the report

The sub-agent's return contract includes a markdown report path. Surface to the operator:

- Path to the full report
- Top 5 gaps from the ranked list (verbatim, with file paths)
- Screenshot directory path
- Total routes walked / 404s found / auth-walled / dynamic-validation failures

If `verdict: drifted` (any user-visible gap was found), prompt the operator:

> "Walkthrough complete. <N> gaps flagged, top-ranked: <one-line summary>. Open the full report?"

Always provide a recommended answer. Never auto-open browsers from this skill.

---

## HITL Handling

The skill surfaces these categories via the standard return contract:

- `external_credentials` — no browser MCP available, dev server failed to boot within 90s, env vars missing
- `prd_ambiguity` — multiple dev-server commands possible and no `bytheslice.config.json` hint to pick
- `destructive_operation` — never produced by this skill (read-only by construction)
- `creative_direction` — never produced by this skill (no design judgment calls)

The walker sub-agent never prompts the user directly — it returns structured fields that the orchestrator bubbles up.

---

## Hard Constraints

- **Read-only.** No code edits, no DB writes, no auth bypass, no mutation buttons clicked.
- **Never log in.** Auth-walled routes are logged as `auth-walled` and skipped.
- **No fabricated rows.** If a route can't be reached, report it as unreachable — do not fill in a "looks fine" row.
- **Cap the dev-server wait at 90 seconds.** Beyond that → HITL `external_credentials`.
- **Subagent prompts live in `./agents/*.md`.** This SKILL.md is workflow only — never inline the sub-agent prompt here.
- **Cleanup is non-negotiable.** Dev servers and browser sessions get killed at the end, including on error paths.
- **Always provide a recommended answer** at every elicitation point.

---

## Triggers

Follow this skill whenever the user:

- runs `/inspect-display` (or `/bytheslice:inspect-display`)
- says "walk the platform", "walk the app", "audit the app/platform", "pre-uat walk", "smoke test the whole app"
- asks "what's actually working in <app>" / "what's mock vs real" / "what would a real user notice"
- has just finished a batch of `/box-it-up` runs and wants a cross-cutting verification

If the user wants per-slice spec compliance (4-viewport screenshots against the design system for one slice), redirect to `/sell-slice`'s Phase 4.7 — that's `visual-reviewer`, not this skill.

---

## Completion Checklist

Walk this at the end of every run. Do not report complete until every box is `[x]`.

### 1. Pre-flight passed

[ ] Framework(s) detected.
[ ] Dev-server command identified.
[ ] At least one browser MCP available.

### 2. Dev server booted

[ ] Background dev server started, PID captured.
[ ] At least one route returned 200/3xx on every declared port before walking began.
[ ] Wait did not exceed 90 seconds.

### 3. Walk complete

[ ] Platform-walker sub-agent dispatched and returned.
[ ] Structured return contract received with `status` and `verdict`.
[ ] Screenshot directory exists and is non-empty.

### 4. Cleanup done

[ ] Dev-server PID killed (or fallback `pkill` ran).
[ ] No orphan processes holding the ports.
[ ] Any browser sessions opened by the walker were closed.

### 5. Report surfaced

[ ] Operator received the full-report path, top-5 ranked gaps, screenshot directory.
[ ] If `verdict: drifted`, operator was prompted with a recommended next action.

---

## Sub-agent return contract

When `/inspect-display` is invoked as a sub-skill (e.g. by `/run-the-day` as a periodic checkpoint — see the future roadmap in `references/integration-points.md`):

```yaml
status: complete | failed | needs_human
summary: <one paragraph — apps walked, routes covered, top finding, overall verdict>
verdict: clean | drifted | broken
counts:
  routes_walked: <int>
  routes_404: <int>
  routes_500: <int>
  routes_auth_walled: <int>
  routes_with_mock_data: <int>
  dynamic_routes_unvalidated: <int>
top_gaps:
  - rank: 1
    description: <one line>
    file_or_route: <path or URL>
    user_impact: high | medium | low
  # up to 10
report_path: <path to full markdown report>
screenshot_dir: <path>
artifacts:
  - <report path>
  - <screenshot dir>
needs_human: false | true
hitl_category: null | "external_credentials" | "prd_ambiguity"
hitl_question: null | "<plain-language question>"
hitl_context: null | "<what triggered this>"
```

---

## Relationship to other skills

| Skill | Scope | Triggered by | Output |
|---|---|---|---|
| `inspect-display` (this) | Whole product, every route | Operator on demand | Ranked-gap report across all apps |
| `visual-reviewer` (in `sell-slice` Phase 4.7) | One slice, its declared states | `sell-slice` automatically | Pass/fail verdict + causative-agent attribution for one slice |
| `accessibility-review` (design plugin) | One design or page | Operator on demand | WCAG 2.1 AA audit |

These do not overlap. `visual-reviewer` answers "did this slice meet spec." `inspect-display` answers "what's the state of the whole product right now."

See `references/integration-points.md` for proposed integrations with `/run-the-day` (periodic checkpoint) and `/close-shop` (retrospective augmentation).
