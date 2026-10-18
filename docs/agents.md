<p align="center"><img src="../assets/brand/logo.png" alt="ByTheSlice" width="260"></p>

# 🍕 Agent Roster

Every ByTheSlice subagent in one table, in plain English. The 49 unique live agents are registered plugin agents: type `@bytheslice:<name>` in any Claude Code session to aim one at something directly, or just run the skills and let them dispatch. Registration means each agent's model tier, effort level, and tool allowlist are enforced by the platform, not just suggested.

Bold rows mark the skill each group of agents belongs to. The six agents at the bottom are v4 leftovers that stay on disk for back-compat but are not registered.

| Agent | Kitchen character | What it does |
|---|---|---|
| **🍕 /setup-shop** | | |
| `bootstrap-runner` | Bo | Creates a brand-new project skeleton (Next.js app or monorepo) and makes the first git commit. Only runs when you start from an empty folder. |
| `ci-cd-detector` | Dot | Peeks at the repo to see whether the standard CI safety nets (test workflows, pre-push hook, PR template) already exist, and lists whatever is missing. |
| `config-generator` | Cora | Turns your setup answers into the `bytheslice.config.json` settings file, so later commands know your preferences without asking again. |
| **🍕 /create-menu** | | |
| `brief-analyzer` | Bree | Reads your project brief and spots what is vague or missing, then proposes a short list of questions to ask you before the PRD gets written. |
| `consistency-checker` | Constance | Proofreads the draft PRD against itself, making sure every feature, requirement, and answer you gave actually shows up in the right section. |
| `prd-reviewer` | Prue | Final quality check on the finished PRD: compares it against your original materials and returns pass or revise. |
| **🍕 /cook-pizzas** | | |
| `stage-decomposer` | Stan | Reads the PRD and proposes how to cut the project into Pies and Slices, then shows you the roadmap for approval before anything is written. |
| `rules-assembler` | Russ | Builds the project rules file (CLAUDE.md or AGENTS.md) by layering house rules, your own imports, and design-system rules in the right priority order. |
| `phased-plan-writer` | Phil | Writes the detailed plan file for one feature slice. Many copies run in parallel, one per slice, and it also handles new slices added later by /special-order. |
| `db-schema-stage-writer` | Deb | Writes the plan for the database-schema slice, adapted to your database tooling (Supabase, Prisma, Drizzle). Only runs if your project has a database. |
| `master-checklist-synthesizer` | Max | Collects what every plan writer produced and assembles the single master checklist that drives all future work. Pure bookkeeping, no creative decisions. |
| **🍕 /set-display-case** | | |
| `bundle-validator` | Val | Checks a design bundle exported from claude.ai/design: right folder shape, all design tokens present, nothing missing. Reports specific gaps. |
| `compliance-pre-check` | Coco | The design-system gatekeeper: refuses to call the design system done until every required token category (colors, spacing, type, and so on) is filled in. |
| `library-route-scaffolder` | Lars | Builds the hidden `/library` page, an in-app showroom where every UI component is previewed before it ships, and keeps it out of your site's navigation and search. |
| `token-expander` | Tia | If you have no design bundle, this turns a written brand description into a full set of design tokens and shows you the values for approval before writing files. |
| **🍕 /final-quality-check** | | |
| `scaffold-discovery` | Sky | Fingerprints the repo first: package manager, framework, monorepo or not, existing CI workflows, database presence. Everyone downstream reads its report. |
| `framework-detector` | Fred | Decides which end-to-end testing setup fits (usually Playwright), and which apps in a monorepo need their own test config. |
| `e2e-installer` | Ed | Installs the end-to-end test framework, adds the standard test scripts, and writes the first starter tests so the suite is never empty. |
| `workflow-writer` | Wren | Writes the GitHub Actions workflow files (CI, E2E, design-system compliance, and schema drift when you have a database), skipping any that already exist. |
| `lint-config-writer` | Linda | Adds the lint rules that catch hardcoded colors and spacing (anything that bypasses your design tokens), and tidies `.gitignore` for test artifacts. |
| `a11y-discovery-runner` | Ally | Runs a scoped shadscan accessibility scan to surface issues no other gate catches, throws out anything pointing at your `/library` mockups, and hands back the rest as leads to check by hand. It never blocks, never scores you, and never fixes anything. |
| `husky-installer` | Hux | Sets up the git pre-push hook so the full check suite runs on your machine before code can leave it. |
| `branch-protection-writer` | Locke | Generates a one-time script you run to lock the main branch on GitHub so nothing merges without green checks. |
| `local-gates-runner` | Ollie | Runs the entire gate suite locally (lint, types, tests, E2E, visual) before the first push, so problems get fixed on the branch instead of in a red PR. |
| **🍕 /open-the-shop** | | |
| `env-scanner` | Enzo | Finds every `.env.example` in the repo and lists all the keys your project expects, without ever reading actual secret values. |
| `checklist-generator` | Chet | Turns the key list into a human checklist grouped by service (Supabase, Stripe, Resend, and friends) with direct links to where each credential is created. |
| `env-verifier` | Vera | Confirms your `.env.local` files actually have every required key filled with real, non-placeholder values. Never reads or logs the values themselves. |
| `github-secrets-scanner` | Gus | Scans the CI workflows for the secrets they reference, so you know exactly which keys must also be added in GitHub's repository settings. |
| **🍕 /sell-slice** | | |
| `discovery` | Pip | Fast, read-only reconnaissance: maps which files, symbols, and callers the slice will touch, so the build plan is grounded in the real codebase. |
| `checklist-curator` | Ezra | Picks the next slice off the master checklist, defines pass/fail acceptance tests for it, and proposes the exact checklist update. Suggests, never edits. |
| `rules-loader` | Bea | Loads the project rules file and `bytheslice.config.json`, and hands back the resolved settings the rest of the pipeline should obey. |
| `implementer` | Ren | The builder. Writes the code and its unit tests for one checklist item, updates the DB schema first when needed, and declares everything it produced in a build manifest. Never grades its own work. |
| `spec-reviewer` | Spence | Checks the builder's work against the plan: was the checklist item actually delivered, with no scope creep, following project conventions? |
| `quality-reviewer` | Quinn | Checks the builder's work for craft: types, tests, edge cases, security smells, and schema-before-queries. Cannot write files, by construction. |
| `slice-tester` | Tay | The independent QA. Gets only the build manifest and the slice's definition of done (never the builder's chatter), then actually exercises the feature: clicks through the UI or round-trips real data, and reports evidence per claim. |
| `slice-verifier` | Inez | Runs every static gate exactly once (lint, types, build, tests, E2E, design-token grep, CI integrity) and cross-checks the diff to catch anything the manifest under-declared. |
| `fix-attempter` | Fitz | When a check fails, makes the smallest possible fix for that one failure. No refactors, no scope growth. |
| `debug-instrumenter` | Dee | If the first fix did not take, adds temporary tagged logging around the failure so the next fix attempt has real data. The tags are stripped once everything is green. |
| **🍕 /sell-slice frontend pipeline** | | |
| `modern-ux-expert` | Mo | Researches how best-in-class products solve this screen and writes a short UX spec with the chosen patterns and a few visual references. |
| `layout-architect` | Lyle | Writes the route files, page shells, and breakpoint plan (the skeleton of the screen), leaving the components' inner workings to others. |
| `block-composer` | Blake | Covers as much of the UI as possible with ready-made shadcn blocks before any custom code, and reports exactly what percent is covered and where the gaps are. |
| `component-crafter` | Kit | Hand-builds only the pieces block-composer could not cover, using design tokens exclusively: no raw colors, fonts, or spacing values. |
| `library-entry-writer` | Libby | Puts every new or visually changed component in the `/library` showroom with all its variants and states, so you approve the look before it touches production routes. |
| `state-illustrator` | Lu | Sweeps the UI for missing loading skeletons, empty states, error states, and success confirmations, and fills in the gaps. |
| **🍕 /box-it-up** | | |
| `ci-fix-attempter` | Dex | When the PR's CI goes red, reads the failing checks and pushes the smallest fix that makes them green again. Never weakens tests to pass, never force-pushes. |
| **🍕 /inspect-display** | | |
| `platform-walker` | Wally | Drives a real browser through every route of your running app, screenshots everything, reads the console, and returns a ranked list of what looks broken, stubbed, or empty. |
| **🍕 /special-order** | | |
| `complexity-assessor` | Cass | Sizes up a mid-project feature request: one slice or several, what type, what it depends on, roughly how much work. Plans only, writes nothing. |
| **🍕 /close-shop** | | |
| `retrospective-reviewer` | Rhea | Reads the project's history (logs, commits, PRs, escalations) and identifies recurring friction the plugin itself caused. |
| `proposal-drafter` | Paz | Turns those findings into ready-to-apply patch files against the plugin repo, one per improvement. Barred from modifying /close-shop itself. |
| **🗄️ Deprecated (on disk, not registered)** | | |
| `basic-checks-runner` | Not registered | Old lint/types/build runner from /sell-slice v4. Folded into `slice-verifier`. |
| `aggregating-test-reviewer` | Not registered | Old all-in-one test reviewer from /sell-slice v4. Split between `slice-verifier` (static half) and `slice-tester` (behavioral half). |
| `ci-cd-guardrails` | Not registered | Old per-slice CI-safety pass from /sell-slice v4. Now the CI-integrity check inside `slice-verifier`. |
| `visual-reviewer` | Not registered | Old screenshot reviewer from the v4 frontend pipeline. Folded into `slice-tester`'s rendered design-system checks. |
| `stage-runner` | Not registered | v4 /run-the-day wrapper that ran one stage by calling /sell-slice. Superseded by /sell-pie. |
| `pr-reviewer` | Not registered | v4 /run-the-day post-merge sanity check. Superseded by /box-it-up's CI watch plus `slice-verifier`'s CI-integrity check. |

## Scene roles and extra instances

The [kitchen roster](../skills/open-kitchen/kitchen.html) groups characters into Opening crew, Test kitchen, Display case, The line, The pass, Back door and Review board. Those scene divisions may differ from the owning skill groups in the table above.

- **Chef Nico** is the orchestrator, the lead session that keeps the line moving. It is not a separately registered plugin agent.
- **Sal** represents `/box-it-up` at the front window. It is a skill character rather than another registered agent.
- **Dom** is `implementer#2`, the second simultaneous instance of the registered `implementer` role. Ren is the first instance. Dom does not increase the unique registered-agent count.
- **Pia** is the `plater` scene helper that collects slices and plates pies. It is not a registered plugin agent.
- Additional simultaneous plugin instances use numbered helpers in the matching division, such as `line helper 1`. Unknown plugin roles use line helpers. Non-plugin agents appear as numbered **Temp** helpers at the pass, preserving their actual agent type in the role description.

The six deprecated agents above stay distinct from the 49 registered roles and have no documented named live-character assignment.
