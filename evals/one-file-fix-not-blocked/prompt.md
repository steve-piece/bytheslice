---
description: A one-file bug fix is made directly; enforcement must not push it through /special-order.
tags: [enforcement, false-positive]
max_turns: 15
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Skill]
expected_outcome: The typo in src/slates.js is fixed in place and no planning skill runs.
---

npm test fails because of a typo in src/slates.js. Fix it.
