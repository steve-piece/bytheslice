⚠️ DEGRADED: single-context (launcher not vendored; ByTheSlice no-launcher mode)

# Design critique: Team members (pie 0 dry run)

Scope: pie. Surface: http://127.0.0.1:4599/index.html (default demo data). Mode: Operate (admin tool, scan and act).
Context read: tests/fixtures/ui-review-sample/DESIGN.md. PRODUCT.md absent.

## Assessment A (written before any DOM measurement)

### Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Status is a small tinted pill; the header count says "4 members, 7 seats" with no hint that one license is expired. Nothing says how many need attention. |
| 2 | Match System / Real World | 2 | "1 seats" (no pluralization). "seats" is unexplained next to a person. "n/a" shown as a job title when missing. |
| 3 | User Control and Freedom | 2 | Only one primary action and a row menu that is a bare glyph; no way to act on an expired member from the row. |
| 4 | Consistency and Standards | 3 | Calm, one blue primary, status colors only for status, as DESIGN.md says. Row is a div soup rather than a table, so no column semantics. |
| 5 | Error Prevention | 3 | Little to break on a read surface. Invite is one click away with no destructive neighbors. |
| 6 | Recognition Rather Than Recall | 2 | No column headers. The filter control is an unlabeled funnel icon; the user must guess what it filters by. |
| 7 | Flexibility and Efficiency | 1 | No sort, no status filter chips, no keyboard row actions. Finding expired members means reading every row. |
| 8 | Aesthetic and Minimalist Design | 3 | Clean and restrained. Lost points: title column floats at a different x per row, and the avatars are all one lavender with no meaning. |
| 9 | Error Recovery | 2 | No error or loading state is visible. The silent 50-row cap and fixed-height clipped list (see below) hide data without telling the user. |
| 10 | Help and Documentation | 2 | No explanation of seats or why a license expired; no empty-state guidance beyond "No members yet." with no invite call to action. |
| **Total** | | **22/40** | **Acceptable (low end)** |

### Design Specificity Verdict

Category-interchangeable. It is a competent generic SaaS team list. Nothing in it reflects field services or the stated job: the one thing DESIGN.md says must be easy to find (expired licenses) has no more visual weight than "active". A different product's staff table could ship this unchanged.

### Overall Impression

Tidy and calm, but it answers "who is on the team" rather than the stated purpose, "who needs attention". The biggest opportunity is making expired and invited states do work: surface a count, lift them to the top or into a filter, and give the row a direct action. On a phone the page is broken: the layout is wider than 390px and the Invite button, seat counts and row menus are cut off.

### What's Working

1. Restraint matches DESIGN.md: zinc surfaces, a single blue primary, color reserved for status. It reads calm and trustworthy.
2. The name plus muted email stack with initials avatars is a fast, familiar scan pattern, and the 20px title with an inline summary count sets context well.
3. Realistic seed data (diverse names, plausible emails, all three statuses present) lets the surface show its real behavior, and the dev data switch exists for stress cases.

### Priority Issues

1. **[P1] Expired status has no more weight than active.** The page's stated job is spotting expired licenses. All four rows share the same weight, the same 12px pill, and rows are unsorted, so Tomás Ibarra (expired) sits last and is easy to miss as the list grows. Fix: put an attention summary in the header ("1 expired, 1 invited"), sort attention states first or add status filter chips, and give the expired pill a small icon plus stronger treatment while keeping color for status only.
2. **[P1] The layout breaks at 390px.** The row is a no-wrap flex line with fixed-width columns inside a card that clips overflow. Seat counts and the row menu are pushed past the card edge and cannot be reached (no sideways scroll to get to them either), the avatars are squeezed to 11 to 23px wide ovals, the job title is truncated to "Op...", and Invite member wraps to two lines. Fix: below roughly 640px drop the title column (or stack it under the name), keep status and the row menu visible, wrap the page header, and set avatars to flex-shrink 0.
3. **[P1] Silent data loss at volume.** The list is 360px tall with hidden overflow and the script slices to 50 rows. With 1284 members the user sees about six rows, cannot scroll, and the header still says 1284. Fix: let the list grow with the page, paginate or virtualize with "showing 50 of 1284", and keep the header count honest.
4. **[P2] Controls are unlabeled and the filter does nothing visible.** The funnel icon, the row menu glyph and the search field have no visible label; the icon controls are tiny. Fix: label them, enlarge targets, replace the funnel with a labeled Status filter.
5. **[P2] Copy and structure.** "1 seats", "n/a" as a title, the "members, seats" count with no definition, no column headers, and the empty state offers no invite action. Fix: pluralize, show an em-free placeholder for a missing title, add a semantic table with headers, and add an Invite action to the empty state.

### Persona Red Flags

**Sam (admin on a deadline, Operate persona):** opens the page to find who is out of compliance. No count, no sort, no filter by status; must read every row. At 1284 members the expired person is not even visible.

**Jordan (first-timer):** sees "3 seats" next to a person with no explanation, an unlabeled funnel and a "..." glyph. Does not know whether the row menu offers "Resend invite".

**Casey (mobile, in the field):** opens the page on a phone. Seat counts and the row menu are off-screen and unreachable, avatars are squashed, and Invite wraps to two cramped lines. Cannot act on a member from the device that field staff actually carry.

### Minor Observations

- Avatar initials are all one tint (initials contrast is fine at 14.4:1).
- Title column left edge drifts row to row (ragged), which makes the column hard to scan.
- Nav links are plain anchors with href "#".
- Row hover and keyboard focus states are not visible in source.

### Questions to Consider

- If the page's job is attention, what if the first thing on it were the people who need attention?
- Does a row need a visible primary action (Resend, Renew) rather than a hidden menu?
- Should seats live in a column at all, or in the header summary?

## Measured evidence (detector replaced)

Taken after Assessment A was saved, in a live tab (built-in browser, own tab, closed after). Viewport emulation 1440x1000 and 390x844.

**Target sizes (WCAG 2.2 AA minimum 24x24):**
- Fails at 1440: nav links 60x17, 35x17, 39x17; row menu buttons 22x23 (x4); filter button 22x30 (width under 24). Search input 996x30 and Invite 108x32 pass.
- At 390 (touch layout, target 44x44): only Invite (93x47) passes 44; search is 286x30, row menus 22x23, filter 22x30, nav links 17px tall.

**Heading outline:** one `h1` ("Team members"), no other headings, no skips. Pass. No `table`, `th` or `role` semantics anywhere: the list is div rows, so there are no column headers to announce. `nav` has no accessible label.

**Accessible names:** 2 controls have no real name. The search input has only a placeholder ("Search members") and no label; the filter button has only a `title` ("Filter"), which is a weak name. The row menu buttons have visible text "⋯" which screen readers read as an ellipsis or nothing useful (they count as named but meaningless).

**Focus:** the page defines no focus styles. A real Tab press lands on Overview, Team, Billing, then Invite member, in layout order, and the browser default ring (outline auto, `:focus-visible` true) shows. Passes by the UA default; no custom, branded indicator. Order matches visual layout.

**Computed contrast (text vs effective background):**

| Element | Ratio | Needs | Result |
|---|---|---|---|
| Email and title muted text (14px, #8b8b93 on #fff) | 3.38 | 4.5 | Fail |
| Header count "4 members" (on #f7f7f8) | 3.16 | 4.5 | Fail |
| Inactive nav links | 3.38 | 4.5 | Fail |
| Row menu glyph and filter icon | 3.38 | 3 (UI) | Pass for icon, fail if read as text |
| Badge active (12px, #16a34a on #dcfce7) | 3.00 | 4.5 | Fail |
| Badge invited (12px, #d97706 on #fef3c7) | 2.86 | 4.5 | Fail |
| Badge expired (12px, #dc2626 on #fee2e2) | 3.95 | 4.5 | Fail |
| Primary button (white on #2563eb) | 5.17 | 4.5 | Pass |
| Avatar initials | 14.38 | 4.5 | Pass |
| Search placeholder | 4.6 (rgb 117) | 4.5 | Pass |

All three status badges fail contrast, and the most important one (invited, then expired) is among the weakest. This reinforces issue 1.

**Layout measurements:**
- Title column left edge by row at 1440: 875, 875, 872, 868 px (ragged, drifts 7px).
- List container is a fixed 360px with `overflow: hidden`; the four demo rows fit, so the clip is only visible with more data (source: `styles.css` `.list`, `team.js` `rows.slice(0, 50)`).
- At 390: page `scrollWidth` equals 390 (no page scroll), but seats and row menu right edges sit at 397 to 446px, past the 390px viewport and past the clipped card. Avatar widths 16, 23, 15, 11 px (specified 32).

**Where measurement changed Assessment A:** A guessed the funnel and menu were small; measured 22x30 and 22x23, under the 24px floor. A flagged only muted-text contrast risk loosely; measurement shows all three badges and the muted text fail. A said the Invite button was clipped on mobile; measurement shows it is not clipped (it wraps), so issue 2 was corrected to name seats, menus and avatars instead. Everything else in A is unchanged.

## Run Notes

- Context files read: tests/fixtures/ui-review-sample/DESIGN.md. PRODUCT.md absent; not invented.
- Source read: index.html, styles.css, team.js, lib/member-fixtures.js, lib/switch.js, README.md.
- Tooling tier: headless Chrome for the two saved screenshots; built-in browser MCP (own tab) for measurements; no launcher, no binaries run beyond headless Chrome screenshots.
- Screenshot caveat: `team-390.png` came from headless Chrome, whose layout viewport at 390 appeared wider than 390 (Invite looked clipped there). The live 390 emulation in the browser tab is authoritative for the measurements and for the corrected issue 2 text.
- Default demo data only; the `?data=` stress states were not critiqued (that is break-ui-runner's job).
- Tabs closed: yes (tab-2 closed, viewport reset to desktop).
