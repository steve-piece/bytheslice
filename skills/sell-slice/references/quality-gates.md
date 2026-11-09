# Quality gates are binding

<!-- skills/sell-slice/references/quality-gates.md -->
<!-- The one rule for what an agent does when a configured quality gate fails: it goes to the fix loop and gets fixed, never to the operator as a decision or a follow-up. Read by the conductors, the testers, the verifier, the fixers and the UI review agents. -->

The operator decides which gates a project runs when they set it up (`/setup-shop`, `/final-quality-check`, `bytheslice.config.json`). That decision is already made. When an enabled gate fails during a run, the failure is not a question for the operator: it is a fix target, and it goes to the fix loop like any other failure until the gate passes.

`gates.enforcement: "fix"` in `bytheslice.config.json` states this rule, and it is the default when the key is absent. See [`bytheslice-config-schema.md`](../../setup-shop/references/bytheslice-config-schema.md#gates).

## Gate classes

| Class | Run by | Check keys and findings it covers |
|---|---|---|
| `lint` | `slice-verifier`, CI | `lint` |
| `typecheck` | `slice-verifier`, CI | `typecheck` |
| `build` | `slice-verifier`, CI | `build` |
| `tests` | `slice-verifier`, CI | `unit_integration` |
| `e2e` | `slice-verifier`, CI | `feature_e2e`, `regression_core_e2e`, `smoke_e2e` |
| `visual` | `slice-verifier`, `slice-tester`, CI | `visual_e2e`, and the tester's rendered design-system match |
| `design-system` | `slice-verifier`, CI | `design_system`: the raw-value grep, and statics findings `E1 UNKNOWN_TOKEN`, `E2 VAR_FALLBACK`, `E3 UNKNOWN_MOTION` |
| `accessibility` | `slice-tester`, `slice-verifier`, `design-critic`, `break-ui-runner` | every `a11y.*` key (WCAG AA contrast, keyboard order, visible focus, focus trap, error not by color alone, reduced motion, dark-mode contrast), statics findings `E4 IMG_NO_ALT` and `E5 INPUT_NO_LABEL`, and any measured finding under a WCAG threshold (contrast under 4.5:1 or 3:1, a target under 24 by 24 CSS px, a control with no accessible name, a focus stop with no visible indicator) |
| `ci` | CI at the PR (`/box-it-up`) | every check the PR's workflows run |
| `declared` | `slice-verifier` | each `gates.declared` entry, and every command the project's `.husky/pre-push` hook or CI workflows run that no class above covers |

`ci_integrity` and the manifest under-declaration backstop are always binding. They guard the gates themselves, so they can never be advisory.

## Which gates are enabled

A gate is enabled when the project is configured to run it:

- the installed quality line (`/final-quality-check`, `quality.tier`) and the project's CI workflows and pre-push hook;
- each `verification.e2e.*` suite not set to `"off"` (a suite the config turns off, or one the lean tier drops, is not enabled and does not run);
- `design-system` whenever the slice touches frontend code and the project has a design system;
- `accessibility` on every slice with UI (the `slice-tester` pass is always on);
- every `gates.declared` entry.

A class listed in `gates.advisory` is still run and reported, but it is advisory: its failures go to `warnings`, never fail the slice and never enter the fix loop. Only the operator puts a class there. An agent never adds one, and never treats a class as advisory because it was not listed as binding.

## The rule

1. **A failing enabled gate is a fix target.** The agent that finds it puts it in `fix_targets` and fails its verdict. It never lands in `warnings`, a "Decisions for you" list, `open_questions`, a Progress Report risk, a PR body follow-up or a HITL.
2. **The conductor routes it to the fix loop** (`/sell-slice` 5.4, the `/sell-pie` per-slice Workflow, `/box-it-up` Phase 3a) without asking, like a lint or type error.
3. **Scope is no exemption.** Fix the root cause where it lives: a shared design token, a global stylesheet, a component, config or file the slice only consumes, or a pre-existing line outside the diff. "Out of slice scope", "app-wide token", "pre-existing" and "the operator's call" are never reasons to leave a failing gate unfixed.
4. **The threshold makes the design call.** When a gate fails on a value (a contrast ratio, a target size), the fix is the nearest value that clears the threshold, keeping the token's hue and role (for example, darkening an error color until its text clears 4.5:1). That is not `creative_direction`: the gate already decided.
5. **The cap still holds.** The fix loop keeps its caps: 3 local fix loops per slice, 3 CI fix rounds per PR, the repeated-signature bail. A gate still failing when a cap runs out is the usual cap-exhaustion HITL, with the gate named as still failing (not as a follow-up). Under an unattended run it defers the slice, as every cap exhaustion does.

## When to escalate instead

Only these, and only through the normal HITL categories:

| The fix | Category |
|---|---|
| is destructive: data loss, a migration on shared data, a force push, deleting a shared resource | `destructive_operation` |
| needs a secret or an account only the operator holds | `external_credentials` |
| needs a new dependency | the slice's approval batch (the existing rule); the gate stays binding |
| exhausted its fix cap | the cap-exhaustion HITL |

A gate in `gates.advisory` is not escalated either: it is reported as a warning.

## Closeout wording

A Progress Report, slice closeout, pie boundary report or PR body never presents a failing enabled gate as "your call", "for your decision", "a follow-up", "out of scope" or an open risk. Either the gate passes, or the report names it as still failing after the exhausted fix cap, with the HITL that raised it. Advisory-gate findings are listed under warnings and say they are advisory.
