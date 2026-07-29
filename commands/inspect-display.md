<!-- commands/inspect-display.md -->
<!-- Slash command that loads the inspect-display skill: on-demand cross-cutting visual walkthrough of a running web app. Pizza-shop framing: walk past the display tray, eyes on every pie that's already up. Complements (does not replace) the per-slice slice-tester in /sell-slice's Workflow B. -->

---
description: Walk the display tray and eyeball every pie that's already on display. Cross-cutting visual walkthrough of a running web app. Discovers every route, drives a live browser through them, captures screenshots and console output, and surfaces a ranked report of what's broken, mocked, stubbed, or empty across the whole product. Run before UAT, before a demo, or after a batch of `/box-it-up` runs to catch silent regressions on surfaces nobody touched. Read-only. Different from the per-slice slice-tester in `/sell-slice`'s Workflow B: that gates ONE slice against spec; this walks EVERY route to find drift between claimed and real.
argument-hint: [optional scope hints like "marketplace only", "skip /host-resources", or a specific app name]
---

# /inspect-display

Load and follow the [`inspect-display`](../skills/inspect-display/SKILL.md) skill.

`/sell-slice` already runs a sophisticated per-slice behavioral review (the `slice-tester` agent in Workflow B, which covers rendered design-system match plus console and network checks): that's the right gate when shipping one slice. `/inspect-display` is a different shape: a cross-cutting, on-demand walkthrough of the *whole running app* to catch what per-slice review can't.

The workflow:

1. **Pre-flight.** Detect framework(s), dev-server command, available browser MCP.
2. **Boot.** Start the dev server in background, poll until ready (90s cap).
3. **Walk.** Dispatch the `platform-walker` sub-agent, which discovers every route, drives the browser through them, screenshots each one, detects mock-data leaks via code reads, and validates dynamic routes against bogus ids.
4. **Cleanup.** Kill the dev server, close browser sessions.
5. **Report.** Surface the ranked top-N gaps + paths to the full report and screenshot directory.

Use this when:
- Preparing for UAT
- Preparing for a demo
- A batch of slices just shipped and you want to verify nothing else broke
- Master checklist and runtime reality might have drifted

Not the right tool for per-slice spec compliance: that's the `slice-tester` agent inside `/sell-slice`'s Workflow B.

$ARGUMENTS
