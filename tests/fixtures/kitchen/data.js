// tests/fixtures/kitchen/data.js
// Defines deterministic checklist and activity fixtures for kitchen state and transport tests.
'use strict';

const checklist = `# Fixture Kitchen
## Prep - Pie 1: Foundations
- [x] Slice 1.1 - Display case: n/a
- [x] Slice 1.2 - Quality line
- [x] Slice 1.3 - Open
## Pie 2 - First delivery [x]
### Slice 2.1 - Already delivered [x]
## Pie 4 - Live Kitchen [ ]
Status: In Progress
### Slice 4.1 - Activity [x]
### Slice 4.2 - Viewer [ ]
Status: Not Started
### Slice 4.3 - Cast [ ]
## Slice 7.1 - One quick order [ ]
Status: In Progress
`;

const activity = [
  { t: 1000, sid: 'old', ev: 'SessionStart' },
  { t: 1100, sid: 'old', ev: 'SubagentStart', aid: 'stale', agent: 'bytheslice:discovery' },
  { t: 2000, sid: 'current', ev: 'SessionStart' },
  { t: 2100, sid: 'current', ev: 'UserPromptExpansion', skill: 'bytheslice:sell-pie', src: 'user' },
  { t: 2200, sid: 'current', ev: 'PreToolUse', agent: 'bytheslice:implementer', label: 'P4 S4.2 build: café', pie: 4, slice: '4.2' },
  { t: 2300, sid: 'current', ev: 'SubagentStart', agent: 'bytheslice:implementer', aid: 'cook', pie: 4, slice: '4.2' },
];

module.exports = { checklist, activity };
