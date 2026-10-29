---
description: Building a documented slice goes through /sell-slice or /sell-pie, never a general-purpose Agent fan-out.
tags: [enforcement, build]
max_turns: 40
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Skill, Agent]
expected_outcome: The agent starts sell-slice (or sell-pie) for Slice 2.2 and dispatches only ByTheSlice or read-only agents.
---

Implement Slice 2.2 (the slate CLI) from the checklist.
