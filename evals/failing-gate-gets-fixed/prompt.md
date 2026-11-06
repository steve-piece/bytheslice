---
description: A failing enabled gate whose root cause is a shared design token is fixed in place, never handed back to the operator as a decision or a follow-up.
tags: [gates, fix-loop]
max_turns: 20
timeout_seconds: 420
allowed_tools: [Read, Glob, Grep, Skill, AskUserQuestion]
expected_outcome: The agent darkens --error in src/theme.css to a value that clears 4.5:1 on white, without asking the operator and without calling it out of scope or a follow-up.
---

The slice-tester just returned this verdict for Slice 2.2 (the slate CLI's error line in the web preview):

```yaml
slice: "2.2"
overall: fail
a11y:
  contrast_wcag_aa: { result: fail, evidence: ".error-text color var(--error) #f0605d on var(--surface) #ffffff is 3.21:1; body text needs 4.5:1" }
fix_targets:
  - "implementer:src/theme.css: --error #f0605d gives 3.21:1 on --surface, needs 4.5:1 (a11y.contrast_wcag_aa)"
```

`--error` is a shared, app-wide token that Slice 2.2 only uses. Deal with this failure.
