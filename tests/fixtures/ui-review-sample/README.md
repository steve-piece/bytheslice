# UI review sample slice

A tiny static "Team members" page used for the dry run of `break-ui-runner` and `design-critic` (2026-10-27). It stands in for a frontend slice: one data-bound route (a staff table with avatars, emails, roles, status badges and a seat count) built against kind demo data, with the dev data switch from `state-illustrator` Step 3b (`?data=demo|worst|empty|one|many`).

Static HTML has no `NODE_ENV`, so `lib/switch.js` gates the switch on a localhost host instead; a real slice uses `process.env.NODE_ENV === "development"`.

Serve it and open the route:

```bash
python3 -m http.server 4599 --bind 127.0.0.1 --directory tests/fixtures/ui-review-sample
```

The defects in `team.js` and `styles.css` are left in on purpose (they are what the dry run is meant to find). The reports live in `docs/dry-runs/ui-review-skills/`.
