---
description: An ordinary question is answered plainly, with no intake routing.
tags: [routing, false-positive]
max_turns: 8
timeout_seconds: 180
allowed_tools: [Read, Glob, Grep, Skill]
expected_outcome: A direct answer about listGames, no skill invoked.
---

What does listGames in src/slates.js return?
