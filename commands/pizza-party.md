<!-- commands/pizza-party.md -->
<!-- Slash command that loads the pizza-party skill: the end-to-end conductor. One interview, then setup, PRD, roadmap, every pie, one PR, a deploy and a run record, with no human stops. -->

---
description: Build a whole app end to end from a short brief. One interview up front, then no stops; /setup-shop, /create-menu, /cook-pizzas, the Prep pie, every pie through /sell-pie with all gates local, one PR that ships the app, a deploy to whichever host the operator has authorized (or an artifact or localhost link), and a run record for comparing runs over time. Every decision a skill would normally ask about is decided and recorded in docs/pizza-party/order.md. Best launched under a goal, for example /goal Build this app end to end with /pizza-party, followed by the brief.
---

# /pizza-party

Load and follow the [`pizza-party`](../skills/pizza-party/SKILL.md) skill.

The operator answers one interview; after that the run decides, records and continues until it hands back a URL. The order ticket at `docs/pizza-party/order.md` holds the brief, the answers, the acceptance list, every decision made without the operator and every deferral. `node scripts/pizza-party.js runs` compares runs of the same brief across models and plugin versions.
