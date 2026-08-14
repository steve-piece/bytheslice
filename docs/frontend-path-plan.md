<!-- docs/frontend-path-plan.md -->
# Frontend path — implementation plan

Working plan for the frontend and verification changes assessed against Kaelig
Deloumeau-Prigent's eight-agent design-system pipeline and Penpot's agile-design
write-up. **Status: proposed, not scheduled.** Nothing here is implemented.

Twelve changes across ten files. **Zero new subagents**, so `agents[]` is untouched
and the roster stays at 49 — which is also why none of this carries adapter-drift
exposure. Nine of the twelve touch the frontend path.

Every defect claim below was verified against source before being written down.
Line references are against `3cad5c9`.

## Contents

- [Verified defects](#verified-defects)
- [Assessment](#assessment)
- [The twelve changes](#the-twelve-changes)
- [The UX decision](#the-ux-decision)
- [Deliberately rejected](#deliberately-rejected)
- [Sequencing](#sequencing)
- [Open questions](#open-questions)
- [Deferred — Pencil](#deferred--pencil-pendev)

---

## Verified defects

Re-derived against source rather than taken from agent output. These are bugs, not
preferences — true regardless of which enhancements are accepted.

### 1. Frontend slices emit no build manifest

`skills/sell-slice/SKILL.md:123` routes `frontend` through
`modern-ux-expert ‖ layout-architect → block-composer → component-crafter → library gate`.
No `implementer` runs — and the implementer is the manifest's emitter. Zero of the seven
frontend agents mention `manifest`.

But `slice-tester` derives its whole test plan from that manifest, and `slice-verifier`'s
under-declaration backstop compares its diff-derived affordance count against it. On the
one slice type this work is about, the strongest anti-collusion mechanism in the plugin
compares against an undefined number, and the tester has nothing to falsify.

### 2. The Library Preview Gate's hook is dormant under `/sell-pie`

`hooks/library-gate-guard.sh:59` reads `[ "$STATE_SKILL" != "sell-slice" ] && exit 0`,
so the guard exits immediately in the unattended mode — the one place where autonomy makes
it matter. `bts_detect_skill` (`hooks/lib/checklist.sh:166`) already returns the literal
`sell-pie`, and `:161` confirms it is ordered ahead of `sell-slice` deliberately, so the
state is on disk today. One line.

### 3. Two live agents defer to a verifier that never loads

`component-crafter.md:116` closes its most important hard constraint — token-only output —
with "The visual-reviewer will catch it." `state-illustrator.md:128` does the same for
`prefers-reduced-motion`. `visual-reviewer` appears **zero** times in
`.claude-plugin/plugin.json` `agents[]`: it is deprecated and never loads. Both agents are
relaxing their own first-pass care against a safety net that is not there.

### 4. Two agents write the same file concurrently

`SKILL.md:253` asserts the Understand pair "have no ordering dependency; run them together."
`layout-architect` contradicts this three times in its own file: `:25` lists the UX spec as
an input, `:45` mandates reading it *in full*, and `:72` **appends** `## Breakpoint Plan` to
it. Dispatched in parallel, the mandated read finds a file that does not exist yet and the
two writes race.

### 5. Token *references* are never resolved

`slice-verifier.md:70` greps for raw values — hex, `rgb(`, `hsl(`, raw px — and never checks
that a `var(--token)` points at a token that exists. `component-crafter.md:55` explicitly
blesses CSS-variable arbitrary values, so `bg-[var(--brand-primary-500)]` against a real
`--primary` contains no hex, no rgb, no raw px: it passes the design-system gate clean,
compiles, lints, typechecks, builds, and renders unstyled. This is the article's
27-fabricated-token failure, live and reachable.

### 6. Accessibility is zero in the per-slice loop

`grep -cniE 'a11y|accessib|wcag|aria|contrast|keyboard'` returns **0** on both
`slice-tester.md` and `slice-verifier.md`. The full checklist survives verbatim in the
deprecated, unregistered `frontend/visual-reviewer.md:87-111` — a silent regression from the
v4→v5 fold-in, not a design decision.

`/final-quality-check`'s `a11y-discovery-runner` does **not** close this: it runs once per
*project* at prep time, whole-codebase and non-blocking. Every slice built afterward still
ships unchecked.

---

## Assessment

### Where the article is ahead

- A dedicated dependency API audit with a NAMED artifact and a mandatory pre-flight read. Verified: grep for Context7/resolve-library-id/query-docs across skills/ returns zero across all 49 registered agents. No agent anywhere can look up what an installed dependency already does. block-composer's shadcn MCP queries an EXTERNAL registry of what you could install; nothing audits what IS installed. Tier-2 tooling gap, so no prompt closes it — the tool grant has to come first. It is the one genuine capability hole.

- Accessibility as a first-class concern. Verified: grep -cniE 'a11y|accessib|wcag|aria|contrast|keyboard' returns 0 on both slice-tester.md and slice-verifier.md. The full checklist survives only in the deprecated, unregistered frontend/visual-reviewer.md:87-111. Frontend slices ship today with WCAG 2.1 AA specified in the PRD template and verified nowhere. A silent regression from the v4-to-v5 fold-in, not a design choice.

- Token EXISTENCE checking. slice-verifier §4 greps for raw values that should be tokens and never verifies a referenced token NAME exists. component-crafter.md:55 explicitly blesses w-[var(--container-md)], so bg-[var(--brand-primary-500)] against a real --primary contains no hex, no rgb, no raw px, passes the design-system gate clean, compiles under Tailwind, passes lint/typecheck/build, and renders unstyled. The 27-fabricated-token failure is live and reachable.

- Budgets that bail on RECURRENCE, not count. box-it-up/SKILL.md:122 literally says 'Three identical-cause failures in a row signal a structural problem' and then implements a plain counter, so three identical failures burn the same three expensive loops as three different ones — each re-driving Chrome and re-screenshotting.

- A regression guard. Nothing reverts a fix-attempter patch that turns a green check red, and slice-verifier's carry-forward rule ('only re-run a check the fixer's last patch could plausibly have changed') is an unaided LLM judgment with no revert primitive behind it.

- An honest standing statement of what the pipeline cannot check. All four HITL categories are reactive — an agent must NOTICE. The article's own central case (checkmark = single vs multi select) is precisely the one the agent did NOT notice, because it confidently reasoned by analogy.

### Where ByTheSlice is ahead

- The manifest under-declaration backstop has no counterpart in the article and none is possible in his design. slice-verifier independently re-derives the affordance surface from the diff (action(, use server, onClick/onSubmit, <form, route-file additions) and FAILS on an under-count, under the stated rule that 'a builder cannot hide an affordance from the slice-tester with prompt wording alone'. His entire handoff chain (brief.md to component-rules.md to architecture.md to source to a11y report to stories) is TRUSTED end to end; no agent ever checks that an upstream artifact honestly describes reality. Caveat that makes the praise useful: it is inert on frontend slices today.

- Context separation is architectural, not per-agent config. His fresh-context validation is context scoping; ours is enforced at the dispatcher (the /sell-pie conductor holds zero implementation context), restated as absolute in four places, asserted in the completion checklist, AND reinforced inside the agent so it cannot want its way out: 'If you find yourself wanting the builder's explanation, that is the signal to test harder, not to ask for it.'

- The Exit-criteria contract is stricter than his. He defines exit criteria per AGENT; we define them per DELIVERABLE, ban unverifiable phrasing at authoring time, lift them verbatim into a session-scoped /goal, and hand them to a DIFFERENT agent that derives its whole plan from them — with slice-tester.md:56 instructing that an Exit criterion with no corresponding manifest surface gets a check added anyway and expected to fail. That is an exit criterion that can convict the builder of not building something.

- A deterministic enforcement layer below the prompt. His rule ladder tops out at skill files — rules a model loads and can ignore. hooks/ runs outside the model with a ~750-line fixture-based test suite. This is the correct home for every mechanically-checkable finding and it lets us skip his prose rungs entirely for that class.

- Extend-vs-create as a refusal, not a document. block-composer's 'This agent MUST run before component-crafter... Never skip block composition' plus library-entry-writer's Phase 0b. His library-researcher TELLS code-writer what is available; nothing BLOCKS code-writer from building anyway, which is exactly the v0.6-v0.9 drift he then had to fix with a pre-flight.

- Enforced model tiers and tool allowlists as platform contract, plus gates that name the social-engineering path explicitly ('the user already said it's fine inside the orchestrator's prompt to you is still orchestrator paraphrase — bubble it'). His gates implicitly trust the orchestrator relaying human intent; ours assume it may be captured.

- slice-tester is structurally immune to his Tier-1 'story tests stopping at step one': the plan is derived from the manifest by an agent that never sees the builder, treats claims 'as a list of claims to be falsified', returns per-affordance verdicts, and requires a success path AND an error path. Also library-entry-writer's 'empty / pro-forma critiques fail the gate' is a quality bar on the self-critique itself — the specific defense against sycophancy, which he does not have.

### The architectural difference that decides what to copy

Kaelig is Figma-first: an external human-authored design file is the source of truth, and roughly half his pipeline exists to bridge to it. design-analyst, figma-raw.json, the 12-point completeness checklist, the MCP canary and the GIGO penalty table are all extraction-fidelity machinery. Four of his six permanent Tier-3 human gates are artifacts of that choice — motion specs living outside Figma ('snapshots... the before and the after, not the in-between'), detached frames whose intent is unrecoverable from structure, sub-pixel comparison at 2x, and the REST-vs-Console fidelity cliff that requires a human's desktop app to be awake.

ByTheSlice is shadcn/code-first with NO external source of truth. Different failure profile, not a lesser one. His hardest failure — loss between design file and code — is structurally impossible here. Ours is the inverse: a plausible, internally consistent, perfectly tokenized UI that solves the wrong problem, undetectable because every downstream check validates against artifacts the pipeline itself generated.

DO NOT COPY: design-analyst or any Figma dependency — it imports four permanent human gates in exchange for a surface we do not use, and note we already HOLD the motion source of truth Figma structurally lacks (design-system-md-template.md:256 Duration Scale, :264 Easing Curves), which is why 'guessing at motion' is a permanent human gate for him and a catalog set-difference for us. story-author — library-entry-writer already exceeds it, and routing play-function behavior to slice-tester is the stronger placement given his own Tier-1 finding that story tests stop at step one. The GIGO numeric score — his inputs have continuous fidelity (12 of 34 token references resolved is a real fraction); ours are booleans, and a penalty table over booleans is a fake scale plus a permanent weight-tuning obligation with no ground truth. The four-marker vocabulary — it only pays when a downstream agent can RESOLVE the marker, and his component-architect exists for exactly that adjudication while we have none, so three of four collapse into needs_human with extra syntax. The Understand/Build/Verify relabel — our boundaries are already enforced harder; borrow the vocabulary as a PLACEMENT TEST only: anything producing knowledge goes before the builder and may be shared, anything judging goes after and must be starved.

TRANSFERS DIRECTLY: the rule+tool+grep triad, where only the grep is load-bearing; bail on repeated error signature; revert on regression; the mandatory pre-flight read of a named artifact.

NEEDS TRANSLATION: the library-researcher becomes a conditional STEP inside block-composer writing docs/component-rules-<slice>.md, not a standing agent — because block-composer already runs first, already reads the installed surface, and its scored output rewards NOT building. The accessibility-auditor becomes a checklist inside slice-tester, which already drives Chrome. The MCP canary becomes a recorded achieved tier, because the agent already knows which tool it drove — it is simply never asked.

---

## The twelve changes

Ranked by value delivered over weight added.

| # | Change | File | Effort |
|---|---|---|---|
| 1 | [Frontend slices must emit a build manifest — state-illustrator is the emitter](#1-frontend-slices-must-emit-a-build-manifest--state-illustrator-is-the-emitter) | `skills/sell-slice/agents/frontend/state-illustrator.md` | small |
| 2 | [Pass the slice's Exit criteria to all six frontend producers](#2-pass-the-slices-exit-criteria-to-all-six-frontend-producers) | `skills/sell-slice/SKILL.md` | trivial |
| 3 | [Arm the Library Preview Gate's deterministic backstop under /sell-pie](#3-arm-the-library-preview-gates-deterministic-backstop-under-sell-pie) | `hooks/library-gate-guard.sh` | trivial |
| 4 | [Repair phantom enforcement and give the two write-capable agents without allowlists a tools: field](#4-repair-phantom-enforcement-and-give-the-two-write-capable-agents-without-allowlists-a-tools-field) | `skills/sell-slice/agents/frontend/component-crafter.md` | trivial |
| 5 | [Token-existence, var() fallback ban, motion catalog and two a11y source patterns — one bundled script, one existing check key](#5-token-existence-var-fallback-ban-motion-catalog-and-two-a11y-source-patterns--one-bundled-script-one-existing-check-key) | `skills/sell-slice/scripts/verify-frontend-statics.sh` | small |
| 6 | [Restore the rendered accessibility pass into slice-tester, inline, and record the tooling tier actually achieved](#6-restore-the-rendered-accessibility-pass-into-slice-tester-inline-and-record-the-tooling-tier-actually-achieved) | `skills/sell-slice/agents/slice-tester.md` | small |
| 7 | [Bail on repeated error signature, make carry-forward mechanical, revert on regression](#7-bail-on-repeated-error-signature-make-carry-forward-mechanical-revert-on-regression) | `skills/sell-slice/agents/fix-attempter.md` | trivial |
| 8 | [Serialize modern-ux-expert then layout-architect](#8-serialize-modern-ux-expert-then-layout-architect) | `skills/sell-slice/SKILL.md` | trivial |
| 9 | [Sanction ONE user-outcome Exit-criteria form, and give it a source](#9-sanction-one-user-outcome-exit-criteria-form-and-give-it-a-source) | `skills/cook-pizzas/agents/phased-plan-writer.md` | small |
| 10 | [Dependency capability audit as a conditional STEP inside block-composer, with a mandatory pre-flight in component-crafter](#10-dependency-capability-audit-as-a-conditional-step-inside-block-composer-with-a-mandatory-pre-flight-in-component-crafter) | `skills/sell-slice/agents/frontend/block-composer.md` | medium |
| 11 | [block-composer's undefined behavior when shadcn MCP is absent, and the narrowed HITL enums](#11-block-composers-undefined-behavior-when-shadcn-mcp-is-absent-and-the-narrowed-hitl-enums) | `skills/sell-slice/agents/frontend/block-composer.md` | trivial |
| 12 | [Version bump, doc-count lockstep, and the unquoted-colon YAML hazard](#12-version-bump-doc-count-lockstep-and-the-unquoted-colon-yaml-hazard) | `.claude-plugin/plugin.json` | trivial |

### 1. Frontend slices must emit a build manifest — state-illustrator is the emitter

**File:** `skills/sell-slice/agents/frontend/state-illustrator.md` · **Type:** edit-agent · **Effort:** small

**Why**

The only item that is a verified correctness bug rather than a preference, and every other frontend improvement rides on it. Today slice-tester is handed a manifest that was never produced, and the plugin's strongest anti-collusion mechanism compares its diff-derived count against an undefined number. The completion-checklist line asserting 'the builder emitted a complete build manifest' is unsatisfiable on the slice type this whole exercise targets.

**What**

Verified: grep -rl manifest skills/sell-slice/agents/frontend/ returns 0 files across all seven frontend agents. Add a new Step 4 after the state-filling step:

'### Step 4 — Emit the build manifest (Appendix A)

On type: frontend no implementer runs, so without this step slice-tester has no claims to falsify and slice-verifier's under-declaration backstop has no declared count. You are the emitter because you run last and have already read every implemented file in full for Step 1.

DERIVE IT FROM THE FILES ON DISK. Do not reconcile against upstream returns — slice-verifier already re-derives the surface from the diff independently, and a second weaker copy of that check run by the emitter itself is worthless. Walk the implemented-files list: every onClick/onSubmit/onChange driving a user-observable result, every <form, every use server function, every action( call site, every route file under the framework roots. Declare the affordances YOU added in Step 3 — retry buttons, empty-state CTAs, dismiss controls. Those are the ones most often missed, because the agent that adds them has historically not been the agent that declares them. Declare the loading-to-populated and error-to-retry-to-populated transitions; the bidirectional transition rule is what makes slice-tester actually drive them.

Do not soften an affordance out because it looks trivial. Under-declaring never hides a surface; it only converts a pass into a fail.'

Output contract gains build_manifest: in the exact Appendix A shape (slice / routes / components[].affordances / serverActions / transitions / note).

Hard constraint: 'The manifest is not optional on type: frontend. If you cannot produce it, return status: needs_human, hitl_category: prd_ambiguity. Never return complete with an empty manifest — that is a silent pass for a slice nothing will test.'

ORCHESTRATOR WIRING, both skills: sell-slice/SKILL.md:239 asserts 'the builder... emits the build manifest' while :123 routes frontend to the internal pipeline and dispatches implementer only for backend/full-stack/db-schema/infrastructure. Rewrite to name state-illustrator as the frontend emitter. Add a mode: "manifest-only" fallback dispatch for a frontend slice with zero interactive surfaces. Mirror into sell-pie/SKILL.md:126 and its completion checklist at :233 — otherwise the fix exists only in the high-touch path while the autonomous mode stays broken.

NON-NEGOTIABLE COMPANION in slice-verifier: manifest_declared == 0 on a type: frontend slice is needs_human, never pass.

**How it answers the critics**

Over-engineering critic ranked it gap zero and killed only A's three-source manifest_reconciliation block as a weaker duplicate of the backstop — cut adopted, so the manifest is derived from disk alone. Spec critic flagged that A landed the wiring only in sell-slice while sell-pie carries the identical claim; the sell-pie mirror is included. No new agent, no roster delta, no manifest edit.

---

### 2. Pass the slice's Exit criteria to all six frontend producers

**File:** `skills/sell-slice/SKILL.md` · **Type:** edit-skill · **Effort:** trivial

**Why**

The six agents that actually build the frontend are the only participants in the entire pipeline never told the definition of done, while slice-tester is asked to falsify their claims against exactly that document. Highest value-per-byte change in the set: seven one-line edits, zero latency, zero new files, zero roster delta.

**What**

Verified: grep -rli 'exit criteri' skills/sell-slice/agents/frontend/ returns 0 files.

Add one line to the Phase 4 dispatch block: 'Pass the slice's Exit criteria verbatim in every frontend producer's input contract. Withholding the builder's reasoning from the tester is the point of context separation; withholding the shared standard from the builder was never part of it.'

Add one bullet to the Inputs section of each of modern-ux-expert.md, layout-architect.md, block-composer.md, component-crafter.md, library-entry-writer.md, state-illustrator.md:
'- Exit criteria: the slice's acceptance contract, verbatim from its plan file. You are graded against this.'

Mirror the dispatch line into sell-pie/SKILL.md.

**How it answers the critics**

Neither critic touched it; every proposal that included it kept it. It is the article's principle 4 applied to the half of our pipeline that was accidentally excluded from it.

---

### 3. Arm the Library Preview Gate's deterministic backstop under /sell-pie

**File:** `hooks/library-gate-guard.sh` · **Type:** edit-hook · **Effort:** trivial

**Why**

CLAUDE.md and the README describe the Library Preview Gate as deterministically hook-enforced. It is completely dormant in /sell-pie — the v5 forefront, the unattended mode, the one place where autonomy makes it matter. A headline design control that is theater exactly where nobody is watching.

**What**

Line 59 reads: [ "$STATE_SKILL" != "sell-slice" ] && exit 0
Replace with: case "$STATE_SKILL" in sell-slice|sell-pie) ;; *) exit 0 ;; esac

That is the whole fix. I read the source: precheck-skill.sh writes last-precheck.json UNCONDITIONALLY at lines 84-95, outside its per-skill case statement, from SKILL=$(bts_detect_skill "$PROMPT"), and bts_detect_skill puts sell-pie first in its alternation and already returns the literal string. "skill": "sell-pie" is on disk today. No precheck branch is required.

Add two cases to hooks/test.sh using the existing write_state/run_hook/assert_* helpers: guard fires with skill=sell-pie; guard still exits 0 for an unrelated skill. All fail-open properties preserved unchanged — the four early exits, the session-id dedup, BTS_HOOKS_DISABLED, and exit 0 always.

**How it answers the critics**

Spec critic verified the guard line and REFUTED B/C's claim that a precheck-skill.sh sell-pie branch is a prerequisite; I checked the source myself and the spec critic is right, so that branch is cut — adding it introduces new BLOCK/WARN preconditions on /sell-pie and needs its own argument and tests. B's item (3), matching approved component_id against the write path, is also cut: the guarded path is a production route, not a component file, and B specifies no join — an unmatched join turns a quiet gate into one that warns on every production write.

---

### 4. Repair phantom enforcement and give the two write-capable agents without allowlists a tools: field

**File:** `skills/sell-slice/agents/frontend/component-crafter.md` · **Type:** edit-agent · **Effort:** trivial

**Why**

Two live agents are writing code under a false belief that something downstream is checking them — an agent's care on its own first pass degrades when it thinks a verifier will catch it. And docs/agents.md:3 advertises that per-agent tool allowlists are 'enforced by the platform, not just suggested' while the verifier and the entry-writer, whose entire reason for existing is that it must not touch production routes, ship with none.

**What**

component-crafter.md:116 closes the agent's single most important hard constraint with 'The visual-reviewer will catch it.' Verified: visual-reviewer appears 0 times in .claude-plugin/plugin.json agents[], so it does not load. Replace with: 'slice-verifier's design-system static grep and token-existence check catch this statically, and slice-tester catches the rendered mismatch.'

state-illustrator.md:128 — same fix for prefers-reduced-motion: 'a defect slice-tester's prefers-reduced-motion check catches' (true once change 6 lands).

Add a standing authoring rule to docs/architecture.md: no agent may name a verifier that is not in the live dispatch table.

FRONTMATTER, slice-verifier.md (currently name/description/model/effort only):
```yaml
tools:
  - Read
  - Glob
  - Grep
  - Bash
```
Omitting Write/Edit makes its documented 'Read-and-run, never author' invariant structural.

FRONTMATTER, library-entry-writer.md:
```yaml
tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Bash
  - mcp__Shadcn_UI__get_component
  - mcp__Shadcn_UI__get_component_demo
  - mcp__Shadcn_UI__list_components
```
BASH IS REQUIRED. I verified library-entry-writer.md:152 instructs 'git add every new or modified file under <library_root>/'. Both proposals that added this allowlist omitted Bash, which would silently break staging at the very HITL gate they were strengthening.

**How it answers the critics**

Both critics killed the no-Bash version of the library-entry-writer allowlist; I adopted the fix rather than the cut, which is what the spec critic explicitly recommended ('include Bash, or move the git add to the orchestrator'). Keeping the allowlist with Bash preserves the gain — no Write scope beyond library_root stated in hard constraints, no ability to invoke record-library-approval.sh — without the break.

---

### 5. Token-existence, var() fallback ban, motion catalog and two a11y source patterns — one bundled script, one existing check key

**File:** `skills/sell-slice/scripts/verify-frontend-statics.sh` · **Type:** new-script · **Effort:** small

**Why**

The fabricated-token failure is live and reachable: component-crafter.md:55 explicitly blesses CSS-variable arbitrary values, so bg-[var(--brand-primary-500)] against a real --primary contains no hex, no rgb, no raw px, passes §4 with zero findings, compiles, lints, typechecks, builds — and renders nothing. A prompt instruction is sampled and competes for attention; a grep has compliance 1.0 and is independent of the agent that could fail it. The catalog already exists in two machine-parseable forms, so this is a set difference, not a new capability.

**What**

NEW FILE at skills/sell-slice/scripts/. This placement is load-bearing and verified: package.json files allowlists "scripts/install", NOT scripts/, so a root-level script does not ship via npm — but "skills" is allowlisted, and "skills": "./skills" is present in BOTH .claude-plugin/plugin.json and .cursor-plugin/plugin.json, and skills is the one path key that ADDS rather than REPLACES. So this ships on both clients and both install paths with ZERO manifest edits.

Invocation: bash "<plugin-root>/skills/sell-slice/scripts/verify-frontend-statics.sh" --base <sha> (same <plugin-root> convention SKILL.md already documents for record-library-approval.sh). Bash, matching the hooks/*.sh idiom — no node dependency introduced.

ALLOWLIST = union of: every token in the | Token | Light | Dark | tables of docs/design-system.md; every --x: declared under :root / .dark / @theme in the generated CSS entry; tailwind.config theme bindings. Missing all three → exit 2, 'no token catalog resolvable' (loud, never a silent pass).

OFFENDER CLASSES over git diff --name-only <base>...HEAD filtered to .tsx/.jsx/.ts/.css:
- E1 UNKNOWN_TOKEN — any var(--x) or semantic utility whose name is not in ALLOWED. Report file:line, the fabricated name, nearest real token by edit distance.
- E2 VAR_FALLBACK — any var(--x, ...). Banned outright: the fallback renders a plausible value and makes a fabricated token invisible. Today's hex grep catches var(--x, #333) incidentally but not var(--fake, var(--real)).
- E3 UNKNOWN_MOTION — duration/easing literals absent from the Duration Scale (design-system-md-template.md:256) and Easing Curves (:264).
- E4 <img with no alt= (explicit alt="" passes — a decorative declaration).
- E5 <input/<select/<textarea with no bound <label htmlFor=, aria-label, or aria-labelledby.

stdout is terse and is the entire product: one line per offender, then a one-line summary. Exit 0 clean, 1 with offenders, 2 on unresolvable inputs. No network, no installs, deterministic.

slice-verifier.md §4: add the invocation as a SUB-CHECK of the EXISTING design_system check key. Do not add new atomic check keys — verify-once (C5) is preserved by construction and no check can now run twice.

**How it answers the critics**

Over-engineering critic killed A's separate frontend-static-gates.md spec file (two sources of truth for one behavior) and its 7-rule static a11y table plus routing table (double coverage against the rendered Tab sweep, and bloat in the agent whose governing rule is 'each check runs exactly once'). Both cuts adopted. PARTIAL REBUTTAL: I keep two of the seven — missing alt and unlabeled inputs — because the rendered pass empirically catches focus suppression and Tab-unreachability but NOT a missing accessible name on an image; they cost two regexes in a script already running and add no check key. Also killed: A's §4c hand-roll signature check, which cascades off the killed capability map — the pre-flight plus rules_consumed is enough enforcement for now.

---

### 6. Restore the rendered accessibility pass into slice-tester, inline, and record the tooling tier actually achieved

**File:** `skills/sell-slice/agents/slice-tester.md` · **Type:** edit-agent · **Effort:** small

**Why**

A verified regression from the v4-to-v5 fold-in that nobody decided. The text already exists in the repo, the agent already drives Chrome and screenshots per surface per state, so a Tab sweep plus a computed-style read is marginal cost on an open session. It is also the only UX dimension natively machine-checkable with a binary verdict — exactly the shape the Exit-criteria contract demands, where every other UX signal must be softened to fit.

**What**

Verified: grep -cniE 'a11y|accessib|wcag|aria|contrast|keyboard' returns 0 on slice-tester.md and 0 on slice-verifier.md. The checklist survives verbatim at frontend/visual-reviewer.md:87-111, in a file that is deprecated and absent from agents[].

Add '### 2a. Accessibility (frontend / full-stack with UI)' to the frontend route, lifted near-verbatim, with executable procedures against surfaces already being screenshotted:
- Contrast: read computed foreground and effective background per text node; assert 4.5:1 body, 3:1 large text and non-text UI boundaries.
- Keyboard reachability: Tab from document.body until focus cycles; assert every manifest affordance appears in the ordered set and the order tracks bounding-box reading order.
- Focus visible: at each stop, diff computed outline/box-shadow/border against unfocused; a null diff is a fail.
- Focus trap: open each declared modal/popover, Tab past the last element, assert focus returns inside and restores to the trigger on close.
- Error state not color-only: in the error state already forced, assert a text node or icon accompanies the color change.
- prefers-reduced-motion: emulate the media query, assert animation suppressed.
- Dark-mode contrast parity where dark mode exists.

Appendix-B contract gains:
a11y: { contrast_wcag_aa, keyboard_nav, focus_visible, focus_trap, error_not_color_only, prefers_reduced_motion, dark_mode_parity } each pass|fail|not_applicable
tooling_tier_used: claude_in_chrome | chrome_devtools_mcp | playwright | vizzly

VERDICT RULE: any a11y fail forces overall: fail. Keep it blocking. An interface a keyboard cannot reach is not working software, and downgrading it to advisory is how the check dies.

ONE HONESTY SENTENCE in Hard Constraints, replacing the whole manual-checklist apparatus both proposals wanted: 'A green a11y verdict covers the machine-checkable band only — roughly 30-50% of WCAG. Screen-reader behavior on VoiceOver/NVDA/JAWS/TalkBack is not automatable and is never implied by this result.'

HOVER HONESTY: the existing frontend row asserts 'hover tooltips produce a state change'. Append: '(a dispatched pointerenter is a point, not a cursor path — record pass_discrete, not pass).'

ALSO, a live dependency none of the proposals flagged: slice-tester.md:82 anchors the hardcoded browser-tooling ladder to frontend/visual-reviewer.md. Move the ladder text into slice-tester in this same edit, or any future deprecation removes a live dependency of the highest-value frontend gate.

**How it answers the critics**

Over-engineering critic killed the separate rendered-a11y-checklist.md reference (~25 lines with exactly one reader is a permanent drift surface bought for nothing) — inlined. Killed A's manual_verification_required[] (four hardcoded byte-identical items on every slice; text with zero variance carries zero information) and the advisory[] / 00_slice-notes.md / box-it-up print chain (docs/plans/ is gitignored — I verified — so the ledger is per-machine, invisible in review, dead on reinstall). Both cuts adopted; replaced by the one honesty sentence. Keeping the verdict BLOCKING against the predictable first-pie fail-rate spike is deliberate — see open questions.

---

### 7. Bail on repeated error signature, make carry-forward mechanical, revert on regression

**File:** `skills/sell-slice/agents/fix-attempter.md` · **Type:** edit-agent · **Effort:** trivial

**Why**

box-it-up:122 literally says 'Three identical-cause failures in a row signal a structural problem' and then implements a plain counter, so an identical failure burns three full loops — each re-dispatching slice-tester, re-booting the browser, re-screenshotting. This is a NET LATENCY SAVING that partly funds change 8. The mechanical carry-forward is strictly more deterministic than today, re-runs strictly fewer checks than an LLM erring conservative, preserves C5 by construction, and is what makes the regression case detectable at all.

**What**

SIGNATURE: signature = sha1(normalize(first_error_line + '|' + file + '|' + check_id)), where normalize strips line/column numbers, absolute path prefixes and timestamps. The orchestrator passes the previous attempt's signature in the dispatch. On a match, fix-attempter does NOT attempt a second fix — it returns immediately with bail_reason: repeated_signature and needs_human: true. String equality, not judgment.

PUBLISHED BUDGET in-prompt: 'You get at most 3 attempts across this slice, and 1 if your error signature repeats. Write the careful fix now.'

REVERT ON REGRESSION, new hard constraint: 'If the orchestrator reports that a previously-green check went red after your last patch, revert that patch rather than stacking a second fix on top of it. A fix that breaks a passing gate is not a fix.'

slice-verifier.md:18 — replace the soft carry-forward rule ('only re-run a check the fixer's last patch could plausibly have changed') with: 'Re-run check C if and only if C's declared input file set INTERSECTS fix-attempter.files_changed[]. Input sets: lint/typecheck/build = all changed files; unit_integration = changed files plus test siblings; design_system = changed .tsx/.jsx/.css; ci_integrity = changed .github/workflows/**; manifest_backstop = any changed file.'

Also fix fix-attempter's stale description, which still names basic-checks-runner and aggregating-test-reviewer (both deprecated in v5).

Mirror the signature bail into box-it-up/SKILL.md's CI-fix loop, which already states the idea in prose at :122.

**How it answers the critics**

Over-engineering critic killed C's rule_candidate field (its only consumer was the killed rule ladder) while explicitly keeping the signature bail as separable and deterministic. Adopted exactly. No ledger, no promotion gate, no classifier.

---

### 8. Serialize modern-ux-expert then layout-architect

**File:** `skills/sell-slice/SKILL.md` · **Type:** edit-skill · **Effort:** trivial

**Why**

Even discounting the design handoff entirely, two agents concurrently writing one markdown artifact is corruption, not slowness. Serializing fixes the voided handoff and the write race for one cost.

**What**

SKILL.md:253 asserts 'They have no ordering dependency; run them together.' That is false in three places in layout-architect's own file: :3 says 'after modern-ux-expert produces the UX spec', :26 lists the ux-spec as an orchestrator-provided input, :45 mandates 'Read docs/ux-spec-<slice>.md in full'. And :72 APPENDS '## Breakpoint Plan' to the same file modern-ux-expert is still writing.

Replace Phase 4 step 1 with:
'1. modern-ux-expert writes docs/ux-spec-<slice>.md.
 2. layout-architect (SERIAL, after 1) writes route files and layout components, then appends ## Breakpoint Plan to the same spec. These are not parallel. layout-architect Step 1 mandates a full read of the spec and Step 4 appends to it; dispatched together, the read finds nothing and the two writes race. The earlier claim that there is no ordering dependency was the bug.'

layout-architect Step 1 gains a guard: 'If docs/ux-spec-<slice>.md does not exist, return status: needs_human, hitl_category: prd_ambiguity. Do not proceed from the PRD alone.'

layout-architect Step 4 gains: 'You are the second and final writer of this file. Append only; never rewrite a section modern-ux-expert authored.'

Mirror into sell-pie/SKILL.md.

**How it answers the critics**

Neither critic killed it; the over-engineering critic named it the only unavoidable latency in the correct-sized change (+60-120s per frontend slice, including trivial ones) and the first thing to cut if latency bites. Keep the cheaper fallback in your pocket: leave them parallel, drop layout-architect's mandatory read to 'if present', and have it return breakpoint_plan in its output contract (which it already carries at :104) instead of appending to the shared file. That kills the race without the dispatch cost, at the price of leaving the design handoff advisory.

---

### 9. Sanction ONE user-outcome Exit-criteria form, and give it a source

**File:** `skills/cook-pizzas/agents/phased-plan-writer.md` · **Type:** edit-agent · **Effort:** small

**Why**

Only two channels survive context separation into slice-tester — the manifest (a surface inventory) and the Exit criteria. A user outcome must ride the Exit criteria or it is invisible to verification, which is exactly why docs/ux-spec-<slice>.md died: written by two agents, read back by nothing outside the producers. The user-flow lines have a REQUIRED READER (phased-plan-writer), so they pass the ceremony test that killed every other proposed UX artifact.

**What**

phased-plan-writer.md:136's contract teaches by two worked examples that BOTH replace a human-judgment statement with a machine assertion, so a writer following it produces zero user-outcome criteria. Add a third worked example at the same verifiability bar:

'For a frontend or full-stack slice that owns a user-flow step, include exactly ONE user-outcome line in this form:
  slice-tester completed <flow step> end-to-end on /<route> with zero console errors (screenshot in transcript)
This is binary, transcript-verifiable and agent-checkable. It is NOT a licence for "looks good" or "feels intuitive", which remain banned. A slice owning no flow step writes no user-outcome line — do not manufacture one.'

THE SOURCE, and this is the entire pie-level artifact: extend the existing ## Pie N block in cook-pizzas/references/templates.md with four lines, written by the EXISTING master-checklist-synthesizer from stage-decomposer's return — no new agent, no new file:
  **User flow:**
  1. <step> — Slice N.1
  2. <step> — Slice N.3
3-7 steps, each naming an owning slice id. A step no slice owns is a DECOMPOSITION DEFECT surfaced in the existing Phase 2 approval prompt the user already answers — zero added human steps, and re-bundling is still free at that point.

HARD CAVEAT for the checklist parser, verified against hooks/lib/checklist.sh: write steps as '1. <step> — Slice N.1', NEVER as '### Slice N.1' headings, or bts_slice_counts double-counts every slice in the pie.

Mirror the Exit-criteria form into cook-pizzas/references/templates.md so the writer and the template cannot drift.

**How it answers the critics**

Over-engineering critic killed pie-outcome-writer outright (B's own risk section leads with it becoming ceremony and supplies the single-agent fallback itself) and killed the full pie header block as downstream of it. PARTIAL REBUTTAL: I keep four lines of it — the user flow only — because it is the SOURCE the Exit-criteria form consumes and its unowned-step check is a real decomposition signal with a mechanical consumer. Cut: the job story (Klement form, no consumer), the 'done for the user' sentence (duplicates the last slice's criterion), and the known-limits block (static text with zero variance).

---

### 10. Dependency capability audit as a conditional STEP inside block-composer, with a mandatory pre-flight in component-crafter

**File:** `skills/sell-slice/agents/frontend/block-composer.md` · **Type:** edit-agent · **Effort:** medium

**Why**

Verified: grep -rli 'context7' skills/ returns zero — no docs-lookup tool is granted to any of the 49 agents. Tier-2 gap, so no prompt closes it. This is the article's origin failure (300 lines of hand-rolled keyboard nav that @floating-ui already shipped as hooks), and it only bites on the gaps path, which is why the gate keeps it free on the common slice.

**What**

Frontmatter tools: append THREE Context7 identifier forms, because nothing validates the choice and a wrong one is silently absent — this is the same house hedge slice-tester already uses for Claude-in-Chrome:
  - mcp__Context7__query-docs
  - mcp__context7__query-docs
  - mcp__plugin_context7_context7__query-docs
plus the matching three resolve-library-id forms.

NEW STEP 2b, DETERMINISTIC GATE (take C's keyword form over a model judging 'is this behavioral'): runs only when Step 2 produced a gap AND the slice plan or Exit criteria match keyboard|arrow|focus|trap|dismiss|combobox|listbox|menu|dialog|popover|tooltip|drag|reorder|virtual|infinite|autocomplete|typeahead|command palette|table|form. Otherwise SKIP and say so in the summary. Most slices skip.

Procedure: read package.json deps, intersect with the gap set, and for each candidate call resolve-library-id then query-docs. CAP: 3 lookups per slice; on the 4th needed, record capability_unknown and stop. Never crawl node_modules for API surface beyond shipped .d.ts.

Write docs/component-rules-<slice>.md ONLY if it produced rules:
  ## CR — Mandatory
  **CR-1** — <capability>. <package>@<version> provides <exact exported API>. Import from '<path>'. **Do not implement this manually.**
  ## AR — Advisory
  ## No dependency covers
The prohibition sentence is mandatory on every CR. 'X provides useListNavigation' is information a builder ignores; 'use it, do not implement this manually' is a rule it can be graded against.

DEGRADATION MUST DISTINGUISH TWO CASES: tool_absent (the identifier is not in the allowlist — a permanent configuration defect, surfaced at the pie boundary) vs lookup_failed (transient). Both degrade to capability_unknown, which is today's baseline behavior — never below it.

component-crafter.md Step 1, as instruction #1 ahead of the existing design-system read: 'MANDATORY PRE-FLIGHT — read docs/component-rules-<slice>.md if it exists before writing a line. Every CR rule is binding. Report rules_consumed: [] and rules_deviated: [{id, rationale}]. A silent deviation is a defect.'

**How it answers the critics**

Both critics killed it AS AN AGENT and allowed it as a step: B's three justifications collapse because the artifact IS the fresh-context channel regardless of author, A doesn't fold rules into gaps[] either, and block-composer is explicitly forbidden from writing components so there is no self-critique trap. Also killed: A's dependency-capability-map.md — A itself admits it will drift, nothing maintains it, and a wrongly-covered row is worse than an uncovered gap because the agent skips the lookup that would have been correct. Spec critic's Context7-identifier warning drives the three-form hedge and the tool_absent/lookup_failed split; without them a permanent misconfiguration reports as a transient outage forever. This is the second thing to cut if the budget is tight.

---

### 11. block-composer's undefined behavior when shadcn MCP is absent, and the narrowed HITL enums

**File:** `skills/sell-slice/agents/frontend/block-composer.md` · **Type:** edit-agent · **Effort:** trivial

**Why**

This is a plugin installed into other people's projects; the MCP will sometimes be missing and the behavior is currently undefined. And five of six producers are structurally unable to report the most likely thing they will encounter.

**What**

Verified: grep -inE 'not installed|fallback|absent' block-composer.md returns nothing, while both siblings handle the analogous Figma case explicitly (component-crafter.md:118, layout-architect.md:116). Add:

'shadcn MCP is required, not optional. Unlike Figma MCP for your siblings, block composition has no meaningful degraded mode: without the registry you cannot distinguish "no block exists" from "I could not look." If it is unreachable, return status: needs_human, hitl_category: prd_ambiguity: "shadcn MCP is not reachable, so I cannot tell whether a block already covers these surfaces. Install it, or confirm you want every surface hand-crafted for this slice." Do NOT report ui_coverage_percent: 0 and hand every surface to component-crafter — that is silent degradation wearing a number.'

COVERAGE AS A ROUTER, NOT A FLOOR: ui_coverage_percent currently has exactly one consumer anywhere, an equality test against 100. Add: 'When coverage < 60 AND any gap matches the Step 2b keyword gate, state in the summary that this slice is hand-rolling territory.' No threshold, no block — a hard floor fires on legitimately novel slices and becomes the gate operators learn to wave through.

Add installed_files: [] to the output contract (what npx shadcn@latest add actually wrote — today nothing downstream can verify an install).

Widen the hitl_category enum from creative_direction-only to all four on modern-ux-expert, layout-architect, block-composer, component-crafter and state-illustrator. Today a producer that finds the ux-spec absent has no legal category under which to report it.

**How it answers the critics**

Neither critic touched either item. The router framing rather than a floor is the over-engineering critic's own preferred shape for the coverage number.

---

### 12. Version bump, doc-count lockstep, and the unquoted-colon YAML hazard

**File:** `.claude-plugin/plugin.json` · **Type:** edit-manifest · **Effort:** trivial

**Why**

Pure hygiene, but the stale Cursor marketplace description survived a major version bump precisely because nothing checks it, and the repo test is the cheapest permanent fix.

**What**

No agents[] edit is needed — this recommendation adds zero agents, which is why it carries zero adapter-drift exposure.

Still worth landing in the same PR:
- THREE agent counts exist today before anyone edits anything: plugin.json description says 'All 49 live subagents', marketplace.json says 49, docs/agents.md:3 says 48, and 55 files sit on disk. Reconcile to 49 registered plus 6 documented deprecated shims.
- Quote all 13 SKILL.md description strings. skills/set-display-case/SKILL.md's is bare and contains 'design system: tokens' — an unquoted colon-space is a hard YAML parse error under a strict parser and loads only under Claude Code's lenient one.
- Sync description and keywords across .claude-plugin/plugin.json, .cursor-plugin/plugin.json and both marketplace.json files, and rewrite .cursor-plugin/marketplace.json's description, which is version-stamped 5.1.0 while describing v4 (no Pies, no /sell-pie, no Library Preview Gate).
- Add a ~30-line repo test asserting (a) every skills/*/agents/**/*.md is in agents[] or on an explicit deprecated allowlist, and (b) name/version/description equal across all five manifest twins. This closes exactly the gaps the plugins auditor documents itself as not covering — it never opens the agent files and only diffs the plugin.json pair.
- Bump to 5.2.0 (MINOR). Deployment reality: a changed agent file takes effect NEXT SESSION, and a cache-installed plugin needs a reinstall because the cache is a snapshot copy.

**How it answers the critics**

Spec critic killed the .cursor-plugin agents[] array in B and C outright: Cursor's manifest superset DOES consume agents, as a DIRECTORY STRING, and both proposals wrote an array of nested file paths whose acceptance nothing has verified — worst case the whole Cursor manifest fails validation and Cursor users lose the 13 skills and 13 commands they have today, for a benefit both proposals describe as parity with no Cursor-side effect. Cut; only the description/keyword sync survives. C's package.json files widening is also unnecessary once the script lives under skills/.

---

## The UX decision

THE DECISION: UX enters at the PIE level, is owned by cook-pizzas, and is projected into each slice as ONE line in the Exit criteria. No new artifact file, no new agent, no new human step.

WHY PIE AND NOT SLICE, argued from ByTheSlice's own decomposition rule rather than UX theory: 'Every PRD Section 2 feature defaults to >=2 slices: (a) shell slice — route, layout, empty/loading/error states; (b) data slice.' After a shell slice ships, the route renders, the empty state is correct, and the user can complete nothing. A slice-level 'did the user accomplish the job' gate is unanswerable on roughly half of all frontend slices — it would fail spuriously or be waived by convention, and a routinely-waived gate is worse than none because it trains the loop to ignore gates. Meanwhile cook-pizzas' own worked example, 'Blog Editor' = editor frontend slice + server-actions slice + publish-flow slice, IS a user task decomposed into three slices. The pie is already the smallest unit at which a user can complete a job.

THE STRONGEST OBJECTION AND THE ANSWER: 'an artifact one level up will be read by nobody — which is empirically what happened to docs/ux-spec-<slice>.md, and that one is already at the slice level.' Correct, and it is the key insight: the ux-spec did not fail because of its altitude, so lowering altitude cannot fix it. It failed because it is free-standing with no channel into the tester — and it cannot simply be added to slice-tester's inputs, because it IS builder reasoning. Placement optimizes cost; PROJECTION optimizes enforcement.

THE ARTIFACT: four lines under the existing ## Pie N heading in docs/plans/00_master_checklist.md, written by the EXISTING master-checklist-synthesizer from stage-decomposer's return.
  **User flow:**
  1. <step> — Slice N.1
  2. <step> — Slice N.3
3-7 steps, each naming an owning slice id. That is the whole artifact. It has a required reader (phased-plan-writer consumes each step as one slice's user-outcome Exit criterion) and a second mechanical use (a step no slice owns is a decomposition defect, surfaced in the Phase 2 approval prompt the user already answers). Deliberately excluded: job stories, personas, emotions, channels, touchpoints, pain-point maps, and a 'done for the user' sentence that duplicates the last slice's criterion.

THE PROJECTION, and why it is legal where the ux-spec is not: the flow is authored at roadmap time, before any builder exists. It is a pre-declared acceptance contract, the same class of artifact as the Exit criteria themselves — not builder rationalization. Context separation excludes the builder's reasoning, not the acceptance contract. Sanctioned form, at the verifiability bar the contract already demands: 'slice-tester completed <flow step> end-to-end on /<route> with zero console errors (screenshot in transcript)'.

CREDIBLE VALIDATION, all inside slice-tester, which already drives Chrome: keyboard-only traversal (Tab is a keystroke; reachability is binary). Focus visibility and focus trap (a computed-style diff). Contrast ratios (arithmetic). Error-recovery paths — the highest value per marginal token in the whole list, because the tester already forces at least one error path per server action; the only addition is judging the message for what happened, how to retry, and whether input was preserved. Empty/loading/error state coverage — already built in state-illustrator; the only defect is the missing wire from PRD 5.4. Microcopy — credible ONLY as a set-membership check against PRD 5.1 Voice & Tone and 5.3 prohibited language; without that list it is vibes.

THEATER, named so nobody builds it: first-click testing (an agent that has read the manifest cannot be naive; its number would be a fabricated ~100%), simulated-user or persona roleplay (a model reports on its training priors, not the interface), and Nielsen's 10 as a gate (a review instrument, not an information carrier; one LLM pass is one evaluator against a method that assumes several aggregated).

WHAT THIS HONESTLY DOES NOT DELIVER: this is a channel, not a UX practice. There is still no user research, no discovery, and no compositional review of the assembled flow. Penpot's warning is about composition — the design system guarantees the parts are consistent, the Library Gate guarantees the parts are correct, and nothing guarantees the assembled thing accomplishes anything, because /library?tab=<id> is a decontextualized harness by design and that is exactly why it is cheap. Ship the channel, watch two or three pies, and see whether the user-outcome lines are load-bearing or ceremony. If they are real, THAT is when a richer artifact has earned an owner.

---

## Deliberately rejected

Recorded so they are not re-proposed. Each was considered and cut for the stated reason.

- A design-analyst / Figma extraction equivalent. Being code-first DELETES four of the article's six permanent Tier-3 human gates: motion specs living outside Figma, detached frames whose intent is unrecoverable from structure, sub-pixel comparison at 2x, and the REST-vs-Console fidelity cliff that requires a human's desktop app awake. We already hold the motion source of truth Figma structurally lacks (design-system-md-template.md:256 Duration Scale, :264 Easing Curves), which is why change 5 closes 'guessing at motion' deterministically and he cannot. set-display-case already occupies the extraction role at the correct amortization: once per project, not once per component.

- Any new subagent, including both of Proposal B's and Proposal C's one. dependency-auditor collapses under B's own three justifications (the artifact IS the fresh-context channel regardless of author; block-composer is explicitly forbidden from writing components, so there is no self-critique trap). pie-outcome-writer is conceded by B's own risk section as most likely to become ceremony, with the single-agent fallback supplied by B itself. Roster stays at 49, which is also why this recommendation needs no manifest edit at all.

- Proposal C's Slice Surface Contract, Gate U-to-B, the single-json-fence rule and the contract_drift check. A third declaration of intent when Exit criteria plus manifest plus diff already close the triangle, and the failure it claims to catch is already caught — if the builder built the wrong thing, the Exit criteria fail. In exchange it buys a JSON schema, a parsing rule, a reference file, a new check key, and a brand-new way to halt an autonomous pie that C concedes 'will fire in the field before it stops firing.'

- Every ledger: docs/plans/00_ledger.md, 00_slice-notes.md, docs/frontend-rules.md, the three-rung rule ladder and its promotion gate. I verified docs/plans/ is gitignored, so anything placed there is per-machine, invisible in code review and dead on reinstall. The declared downstream consumer in every case is close-shop's retrospective-reviewer, which is experimental, throttled to one PR per week, runs on a phantom hitl_log that nothing in the plugin writes, and targets ~/bytheslice so it does not work for anyone who installed from a marketplace. The repo already ran this experiment: docs/ux-spec-<slice>.md is written by two agents and read back by nothing outside the producers.

- advisory[], manual_verification_required[], known-limits.md and the box-it-up print block. Each is defined by what it does NOT do — 'never blocks', 'never affects overall', 'informational'. manual_verification_required[] emits four hardcoded byte-identical items on every frontend slice; text with zero variance carries zero information. Replaced entirely by one honesty sentence in slice-tester's Hard Constraints.

- A numeric GIGO input-quality score with an 80% hard stop. His inputs have continuous fidelity (12 of 34 token references resolved is a real fraction); ours are booleans — does the design-system path resolve, is there an Exit criteria block, is the ux-spec written. Summing -0.30 and -0.02 into 0.72 to compare against 0.80 is a fake scale over a set of booleans plus a permanent weight-tuning obligation with no ground truth, and a miscalibrated hard stop blocks an autonomous pie for a reason the operator cannot argue with. The behavior it buys already exists at slice-verifier.md:34.

- A runtime round-trip MCP canary. The agent already knows which tool it drove — it just drove it. tooling_tier_used costs one YAML line versus per-tool health-check logic maintained across four tools with different interfaces. Build the canary only if recorded tiers show frequent unexplained degradation.

- The [BLOCKING]/[CONCERN]/[PENDING]/[SUGGESTION] marker vocabulary. It only pays off when a downstream agent is COMPETENT to resolve the marker, and his component-architect exists for exactly that adjudication while we have none — so for 'is this checkmark single- or multi-select', three of four collapse into needs_human with extra syntax to maintain. block-composer's typed gaps[] already implements the one resolvable case, and better, because a schema-checkable array beats a string marker a grep has to find.

- Per-agent iteration budgets on the six frontend producers. 'An agent without exit criteria runs forever' presupposes a loop; five of six are dispatched once, write files and return. A budget on a non-looping agent is decoration — all three proposals said so in their own rejection sections and added them anyway. Budgets stay where looping actually happens: the fix loop, the verifier, the tester.

- Renaming modern-ux-expert and renumbering Phase 4 to 4.U/4.B. The rename churns two manifests, docs/agents.md, README, CHANGELOG and every user's modelTiers.modernUxExpert key — which setup-shop/references/bytheslice-config-schema.md:46 documents as a live v5 key, so C's claim that it 'has no v4 consumer' is wrong and an override would silently revert to sonnet. C's own verdict: 'if you cut one thing, cut this.' The renumber is label churn across eight files for boundaries we already enforce harder than the article.

- Adding an agents[] array to .cursor-plugin/plugin.json. Cursor's manifest superset consumes agents as a DIRECTORY STRING; both proposals wrote an array of nested file paths whose acceptance nothing has verified. If Cursor validates shape the way Claude Code does, the whole manifest fails and Cursor users lose the 13 skills and 13 commands they have working today — for a benefit both proposals describe as parity with no Cursor-side effect.

- A precheck-skill.sh sell-pie branch as a prerequisite for the guard fix. I read the source: last-precheck.json is written unconditionally at lines 84-95, outside the case statement, and bts_detect_skill already returns the literal 'sell-pie'. The state is on disk today. Adding the branch is a real, separate behavior change introducing new BLOCK/WARN preconditions on /sell-pie and needs its own argument and tests.

- First-click testing, LLM simulated-user studies, and Nielsen's 10 as a per-slice gate. Named so nobody builds them later. First-click validity derives entirely from a naive user's first instinct; an agent that has read the build manifest — which names every route, component and affordance — cannot be naive, so its number is a fabricated ~100%. A model roleplaying a user reports on its training priors. Both emit a confident green signal over an unchecked dimension: the fabricated-token pathology applied to UX. A fake UX verdict is strictly worse than none, because it converts an honest gap into a trusted lie. Nielsen's 10 is a category error as a carrier — the same ten items on every slice carry zero slice-specific information, and its checkable subset is already covered by state-illustrator and slice-verifier.

- A user-journey map, and an automated pie-boundary cognitive-walkthrough agent. The journey map has the worst information-per-human-minute ratio available and duplicates the pie roadmap, which is already a crude journey. The walkthrough METHOD is credible — scenario-driven, two of its four per-step questions mechanically checkable, fewer findings at higher severity — but it needs a dev server booted at a boundary that does not boot one today, plus a new agent, to pre-empt a human who is already stopping and never auto-approving.

- Migrating hooks/hooks.json off the undocumented bare event map. Real debt — every deterministic guarantee rides on that file and ByTheSlice 5.0.0 is the reference library's own cited instance of the shape — but bundling a parser-shape migration into a frontend change is how both land badly. Its own PR.

---

## Sequencing

Two pies, seven slices. The dependency order is strict, and the first pie is worth shipping even if the second is rejected outright.

PIE 1 — "Make the frontend path verifiable" (4 slices, one PR). Everything here is a correctness fix or a restoration; nothing depends on a design decision that follows.

  Slice 1.1 — Frontend build manifest. Change 1 alone: state-illustrator Step 4, the sell-slice and sell-pie orchestrator wiring, the manifest-only fallback dispatch, and slice-verifier's zero-declared to needs_human rule. Ship this by itself and let it run one real pie. Every other frontend improvement rides on it, and if it is wrong you want a clean bisect.

  Slice 1.2 — The trivial batch: changes 2, 3, 4, 11. Exit criteria to six producers, library-gate-guard line 59 plus its two hooks/test.sh cases, phantom-enforcer fixes, both tools: allowlists, the shadcn-MCP-absent branch, the HITL enum widening. All frontmatter and one-line edits, no behavior risk, no new files. This is an afternoon and it is where most of the separation-of-concerns payoff actually lands.

  Slice 1.3 — Deterministic statics: change 5. The bundled script plus the slice-verifier §4 sub-check. Self-contained, one new file, no agent behavior change.

  Slice 1.4 — Rendered a11y and the loop budgets: changes 6 and 7 together. This is where the frontend fail rate moves, so it goes last in the pie and gets its own commit. Expect thrash on the first pie after adoption.

PIE 2 — "Make the builder know what it is building" (3 slices, one PR). Start only after Pie 1 has run through at least one real project pie.

  Slice 2.1 — Serialize the Understand pair: change 8. Isolated so its latency cost is measurable against Pie 1's baseline, and so it can be reverted to the cheaper breakpoint_plan-in-contract variant without touching anything else.

  Slice 2.2 — The UX channel: change 9. The sanctioned Exit-criteria form, the user-flow lines in the pie template, the phased-plan-writer and templates.md mirror. Then WATCH for two or three pies: are those lines real and load-bearing, or ceremony? If they are real, that is when a richer pie-level UX artifact has earned an owner. Building the artifact first and hoping a consumer materializes is exactly how ux-spec died.

  Slice 2.3 — Dependency audit: change 10, with change 12's hygiene riding along. Last because it is the largest, the most conditional, and the one gated on an unresolved external fact (which Context7 identifier your install exposes).

Do NOT ship this as one 17-file change across two delivery skills. That is how you inherit the stale-spec class this work is partly written to fix — sell-slice/SKILL.md:286/:319/:454 still instruct a three-registry shape set-display-case:196 is forbidden to generate, and that drift arrived exactly this way.

---

## Open questions

Decisions that change the design. Unresolved.

1. Serialization: do you pay 60-120 seconds on EVERY frontend slice, including a static marketing page that gains nothing, to fix the ux-spec handoff and the concurrent write? The cheaper variant fixes only the write race: keep the two parallel, drop layout-architect's mandatory read to 'if present', and have it return breakpoint_plan in its output contract (which it already carries) instead of appending to the shared file. That leaves the design handoff advisory. Your call turns on how many of your frontend slices are display-only.

2. Accessibility blocking vs graced: focus-ring suppression and unnamed icon buttons are endemic in generated UI, so change 6 will raise the frontend fail rate — possibly sharply — on the first pie or two, and every failure routes into a fix loop capped at 3. I recommend keeping it blocking and, if it thrashes, recording a one-pie grace period rather than softening the verdict, because downgrading a11y to advisory is how the check dies. But you own the tolerance for a noisy first pie.

3. Which Context7 identifier does your install actually expose — mcp__Context7__* (connector/user scope), mcp__context7__* (project scope), or mcp__plugin_context7_context7__* (plugin-bundled)? A wrong entry in a subagent tools: allowlist means the tool is silently absent and the audit reports a permanent misconfiguration as transient degradation forever. Change 10 hedges all three, but confirming against a real install before shipping would let you drop two and keep the frontmatter honest.

4. Deprecation endgame at 5.2.0: six agent files sit on disk unregistered, model-tier-guide.md retains three deprecated aliases 'through 5.1', and three different agent counts already exist in the tree (49 in plugin.json, 48 in docs/agents.md, 55 on disk). Do the shims get deleted at 5.2, or does the alias window extend? Change 6 has a stake in this — slice-tester.md:82 currently anchors its browser-tooling ladder to the deprecated frontend/visual-reviewer.md, so deleting that file without moving the ladder removes a live dependency of the highest-value frontend gate.

---

## Deferred — Pencil (pen.dev)

**Status: on hold.** Recorded as a future recommendation, not part of the twelve changes.
Nothing is wired and the delivery path is unchanged until it is.

### Why this is a different trade from Figma

This plan rejects a Figma dependency because it imports four permanent human gates in
exchange for a surface ByTheSlice does not use. Pencil imports **one**, because of an
asymmetry Figma structurally cannot offer:

> **Reading a `.pen` file needs nothing. Writing one needs the app.**

A `.pen` is plain JSON in the repo — `version`, `themes`, `imports`, `variables`,
`children` — git-diffable, beside the source. Any agent with `Read` parses it with no MCP
and no app running. Authoring goes through `execute` (Insert / Update / Replace / Move /
Delete / SetVariables / TakeScreenshot) and `get_app_state`, which is live-editor state:
the docs require pen.dev to be running.

So the imported gate lands only on the authoring half, which is human-present by nature.
The consuming half is a file read with **no degraded-fidelity tier** — there is no
REST-vs-Console cliff to hard-stop on, which is the specific thing that forces Kaelig's
GIGO quality score and his MCP canary.

It also fills the hole this assessment names. The characteristic ByTheSlice failure is *a
plausible, internally consistent, perfectly tokenized UI that solves the wrong problem*,
undetectable because every check validates against artifacts the pipeline itself generated.
A `.pen` file would be the first externally-authored artifact in the system.

### Recommended shape, when the time comes

- **Tokens: code → Pencil, one way.** `set-display-case` stays source of truth and pushes
  tokens via `SetVariables`. Pencil's `variables` are a real typed token system with
  theme-axis resolution (`{"value":"#FFF","theme":{"mode":"light"}}`) and `$`-reference
  syntax, mapping close to 1:1 onto the `docs/design-system.md` token tables. A design can
  then only reference variables that exist in the document, making fabricated tokens
  structurally impossible on the design side while change 5 covers the code side. No
  bidirectional merge policy to maintain.
- **Handoff: batch, in `set-display-case`.** Read `reusable: true` components out of `.pen`
  files and write `/library` entries in bulk, once per design pass. Keeps the per-slice path
  unchanged and fast, and matches how designs actually get made — in bursts, not one per
  slice.
- **Authoring: defer to `pencil-dev-skill@claude-community`.** It already covers the
  nine-tool authoring cookbook. Duplicating it buys nothing and pins us to a format whose
  own docs reserve the right to break (`version: "2.14"` at time of writing).

### What to check before integrating

Answers to these change the shape above.

- **Do bulk runs stay coherent?** "Create 5 variations of this button" is the documented
  example. If variation 4 drifts off the token set, the handoff needs a validation step.
- **How readable is a real `.pen` diff?** If a small visual change produces a large
  positional diff, the files are git-versioned without being meaningfully reviewable —
  which changes whether designs belong in the PR at all.
- **Does `reusable: true` survive the actual workflow?** The handoff reads components, not
  frames. Drawing screens rather than marking components leaves nothing structured to
  import.
- **How do overrides behave?** There are no native props or variants; instances customize
  through a `descendants` override map. Whether that maps onto shadcn props cleanly decides
  how much the handoff agent must infer.
- **Is the app-running requirement painful in practice?** It only binds authoring in theory.
  If `get_app_state` turns out to be needed for reads too, the consuming half stops being
  autonomous and the whole trade changes.

---

## Provenance

Produced by a 15-agent workflow across five phases — research, gap analysis, three competing
proposals at different intensity levels, two adversarial critics (over-engineering and
spec-conformance), and synthesis. Roughly 2.6M subagent tokens.

Sources: [Building design system components with AI agent
teams](https://www.kaelig.fr/design-system-components-with-ai-agent-teams/) ·
[Agile design 101](https://penpot.app/blog/agile-design-101-how-teams-build-better-products-faster/)
· [docs.pencil.dev](https://docs.pencil.dev/)

Plugin-spec conformance checked against the `dev-workflow/plugins` reference library in
`steve-piece/steves-got-skills`. Claude Code targets only — Cursor parity is explicitly out
of scope for this plan.
