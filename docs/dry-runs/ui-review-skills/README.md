# Dry run: UI review skills on a sample frontend slice (2026-10-27)

Both new review agents ran once against `tests/fixtures/ui-review-sample/` (a static "Team members" staff list with the `?data=` switch), on sonnet, dispatched in the fallback agent shape because the installed plugin did not yet register them.

| Agent | Result | Report |
|---|---|---|
| `break-ui-runner` | 11 findings: 3 Broken, 4 Ugly, 4 Fragile, 5 decisions; 1440, 768, 390 and RTL measured, zoom 200% and dark mode labeled inferred | [break-ui/report.md](break-ui/report.md) |
| `design-critic` | 22/40 (Acceptable), Operate mode, 3 P1 and 2 P2, 3 open questions; `DEGRADED: single-context` banner, no launcher run | [design-critique/report.md](design-critique/report.md) |

The two overlapped on the clipped list and the 390 row layout, and each found things the other did not: break-ui caught the broken emoji initial, pluralization, the blank-vs-"n/a" title and the production-bundled fixtures; the critique caught that expired licenses (the page's job) get no visual priority, plus contrast failures on every status badge and the muted text.

Lessons folded back into the agents:

- **Report-write fallback.** The host refused `break-ui-runner`'s write of `report.md` ("subagents should return findings as text"), while `design-critic`'s write went through. Both contracts now carry `report_written` and `report_markdown`, and the conductor writes the file when the agent could not. The break-ui report here was written that way, unchanged.
- **390-wide screenshots.** Headless Chrome's `--window-size` floors at about 500px, so its "390" shots are a wider layout cropped. Both agents now take narrow screenshots with viewport emulation and treat the DOM numbers as authoritative.

The sample's defects are intentional and stay unfixed; it is a reusable target for the next dry run.
