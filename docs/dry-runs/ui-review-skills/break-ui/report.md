# break-ui report: slice 0.1 Team members (dry run)

- **Slice:** 0.1, frontend (sample: `tests/fixtures/ui-review-sample/`)
- **Route:** `/index.html`, served at `http://127.0.0.1:4599/index.html`
- **Switch:** `?data=demo|worst|empty|one|many` (`lib/switch.js`, gated on a localhost host because the sample is static HTML)
- **Widths:** 1440, 768, 390, measured in same-origin iframes of exactly those widths
- **Tooling:** built-in browser (DOM reads) plus headless Chrome for screenshots
- **Run:** 2026-10-27, `break-ui-runner` on sonnet (fallback agent shape). The agent's own write of this file was refused by the host's subagent file policy, so the conductor wrote it from the agent's returned findings, unchanged.

**Result:** 11 findings: 3 Broken, 4 Ugly, 4 Fragile. Worst: the fixed 360px `overflow: hidden` list makes rows and the row action unreachable, and the list renders 50 of 1,284 rows while the header says 1284.

## Part 1: What broke

| # | Severity | Field | Worst-case value | What happens (measured) | Fix | Where |
|---|---|---|---|---|---|---|
| BU-0.1-1 | Broken | the list itself | `many` (1,284 rows); `worst` at 390 and 768 | `.list` is `height: 360px; overflow: hidden` with no scroll. `many`: scrollHeight 3009 vs 360 visible; JS renders 50 rows while the header says 1284 members. `worst` at 390 and 768: last row cut by 80px. | `max-height` plus `overflow-y: auto`, or paginate with "Showing 50 of 1,284"; drop `slice(0, 50)` or make it real pagination | `styles.css:18`, `team.js:13` |
| BU-0.1-2 | Broken | row more-actions button | any row at 390, demo rows included | The row is wider than the card: the action's right edge is 460 vs the card's 366 (escapes by 94px), hidden by the list's `overflow: hidden`. Document overflow reads 0, so nothing flags it. Unreachable. | `min-width: 0` on `.who`; `flex-shrink: 0` on `.badge`, `.seats`, `.more`; hide or stack `.title` under 480px | `styles.css:21, 24, 25, 29` |
| BU-0.1-3 | Broken | initials | `🌵 Desert Crew Bot` | `name.split(' ')[0][0]` takes half a surrogate pair: code units `d83c` + `44`, a replacement glyph then "D". | Segment by grapheme (`Intl.Segmenter` or `Array.from`) and skip non-letter leading clusters | `team.js:7` |
| BU-0.1-4 | Ugly | avatar | any long row at 390 | Avatar squishes to 8 to 22px wide by 32px tall (rows 0 to 5: 20, 15, 8, 17, 12, 22). | `flex-shrink: 0` on `.avatar` | `styles.css:20` |
| BU-0.1-5 | Ugly | seats, member count, seat total | 1, 0, 9999; `one` state | "1 seats", "0 seats" at every width, "1 members" in `one`. "9999 seats" wraps to 39px tall at 1440 (fixed `width: 70px`); the row grows 60 to 80px at 768. Header reads "10014 seats", "1284 members" with no separator. | `Intl.PluralRules`; `white-space: nowrap` and `min-width` on `.seats`; `Intl.NumberFormat`; `tabular-nums` | `team.js:9, 21`, `styles.css:29` |
| BU-0.1-6 | Ugly | title | "Senior Regional Compliance and Safety Coordinator, Western Operations" | Ellipsis-truncated (scrollWidth exceeds clientWidth by 289px at 1440) with no `title` attribute or other way to read it. | `title` attribute or tooltip; full value in a detail view | `team.js:19`, `styles.css:24` |
| BU-0.1-7 | Ugly | title | `""` vs `undefined` | `r.title ?? "n/a"` catches only null and undefined: `""` renders a blank cell, `undefined` renders "n/a". | `r.title?.trim() \|\| "No title"` | `team.js:19` |
| BU-0.1-8 | Fragile | name, email, title | any value with `<` or `&` | Values go into `innerHTML` unescaped; the worst fixture has no HTML-special row, so this is untested. | `textContent` or an escape helper | `team.js:17` |
| BU-0.1-9 | Fragile | row action, filter button | n/a | Hit areas 22x23 and 22x30px; no `:focus-visible` rules; the row action has no accessible name. | 44x44 hit area, `aria-label="More actions"`, focus ring token | `styles.css:17`, `team.js:22` |
| BU-0.1-10 | Fragile | data-switch wiring | n/a | `team.js` imports `member-fixtures.js` statically, so the worst and many sets ship in the production bundle although the switch ignores them. | Dynamic `import()` behind the dev check | `team.js:3` |
| BU-0.1-11 | Fragile | fixture coverage | n/a | `worst` stops short of the stated limits (longest name 38 of 120, email 77 of 254, title 70 of 80); no HTML-special row, no RTL-script name, no null name; `one` has seats 3, so seat pluralization is not covered. Not extended this run, by instruction. | Extend `worst` to the limits and add the missing catalog rows | `lib/member-fixtures.js:9` |

## Part 2: Decisions for you

1. **Overflowing list: scroll, paginate or virtualize?** Paginate at 50 with "Showing 50 of 1,284" and full-set search; virtualization is overkill here.
2. **Row layout at 390: stack or drop columns?** Stack title and seats under the name; keep the badge and the action on the right.
3. **Long title: truncate or wrap?** End-truncate with a tooltip (secondary metadata).
4. **Empty title: "n/a" or a dash?** One muted "No title", so it reads as intentional.
5. **Long email: wrap or middle-truncate?** Middle-truncate with a tooltip if row height must stay constant; today it wraps at hyphens and the row grows to 99px at 390.

## Part 3: What held up

- Name and email fit or wrap without escaping at 1440 and 768; escapes happen only at 390.
- Document-level horizontal overflow is 0 in every state and width (the clipping hides inside `.list`, which is finding BU-0.1-2).
- The header holds at 390: Invite's right edge equals the card edge, search is 286px wide, the h1 wraps to two lines.
- The empty state renders "No members yet." with "0 members · 0 seats" at all widths.
- CJK name and title render correctly; Vietnamese diacritics are not clipped.
- RTL at 1440 has no overflow.
- The `?data=` switch is ignored off localhost: with the hostname stubbed, `app.example.com` and `192.168.1.5` give `demo`, `localhost` gives `worst`.
- "Jo" / `jo@nw.example` renders cleanly.
- Zero console errors in all five states.

## Checks

| Check | Result | Note |
|---|---|---|
| width 1440 | measured | |
| width 768 | measured | |
| width 390 | measured | |
| zoom 200% | inferred | All CSS is px, so raising the root font size changed nothing; 200% zoom is a roughly 195px layout at 390, worse than the measured 390 breaks. |
| dark mode | inferred | No `prefers-color-scheme` rules or dark tokens in `styles.css`. |
| RTL | measured | `dir="rtl"` on body at 1440. |

## Screenshots

Headless Chrome's minimum window is about 500px, so the `-390` images show a wider layout cropped to 390; the DOM numbers above are authoritative.

- [team-demo-1440.png](team-demo-1440.png)
- [team-worst-1440.png](team-worst-1440.png)
- [team-demo-390.png](team-demo-390.png)
- [team-worst-390.png](team-worst-390.png)
- [team-many-390.png](team-many-390.png)

## Routing (what the conductor would do)

BU-0.1-1 to BU-0.1-7 (Broken and Ugly) join the fix loop as `fix_targets` for `ui-fix-attempter` (opus), then `break-ui-runner` re-checks in `recheck` mode. BU-0.1-8 to BU-0.1-11 and the five decisions are non-forcing warnings in the Progress Report, with the recommendations applied by default.
