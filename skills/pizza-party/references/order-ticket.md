# The order ticket

`/pizza-party` writes `docs/pizza-party/order.md` at the end of the interview and keeps it current for the whole run. It is the run's memory: every later phase, every sub-skill running under `run.unattended: true`, and the conductor after a compaction read it instead of asking. Write it as plain Markdown with exactly these `##` sections, in this order. `scripts/pizza-party.js record` counts the list items under **Decisions made without you** and **Deferred**, so keep each entry one `- ` line.

```markdown
# Order: <App name>

Started: <ISO time> · Plugin: <version> · Model: <model id> · Brief: <brief id>

## Brief

<the operator's brief, verbatim>

## Answers

- **App name / folder:** <name> at <absolute path>
- **Stack:** <framework, language, package manager>
- **Host:** <provider and why, or "none: localhost">
- **Database:** <provider and project/schema, or "local SQLite">
- **Auth:** <approach>
- **Look:** <brand words, colors, theme source>
- **UI registries:** <names, or "stock shadcn only">
- **GitHub:** <owner/repo, private>
- <one line per extra interview question: **<topic>:** <answer>>

## Acceptance

- [ ] <one line per success criterion in the brief, written so it can be checked against the running app>

## Decisions made without you

- <phase> · <what was decided> · <why, in a clause>

## Deferred

- <slice or item> · <reason> · <what was tried>

## Progress

- <phase> · <status: done | running | deferred> · <one-line result, e.g. "PRD at docs/prd-health-app.md">
```

Rules:

- **Answers** come only from the operator (the brief or the interview). Anything the run decides goes under **Decisions made without you**, never into **Answers**.
- **Acceptance** is derived from the brief's own success language at the end of the interview, before any building; the final smoke check ticks it.
- **Progress** gets one line per phase as it starts and finishes. After a compaction the conductor reads this section first.
- Never put a secret, token, key value or password anywhere in the ticket. Name the variable, never its value.
