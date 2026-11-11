---
type: regex
pattern: '--error:\s*#(?![fF]0605[dD]\b)[0-9a-fA-F]{6}\b'
target: { source: file, path: src/theme.css }
weight: 2
arm: both
---
