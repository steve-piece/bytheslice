---
type: llm
---

You see only the agent's final message. Whether the token file changed is graded separately.

PASS if the message reports that the shared `--error` token (or the error text color) was changed to fix the contrast failure, and treats the failure as something it fixed. Mentioning that other surfaces using the token change too is fine.
FAIL if the message asks the operator whether or how to fix it, offers options for the operator to choose between instead of fixing, calls the failure out of the slice's scope, app-wide, pre-existing or the operator's call, or defers it to a follow-up or a later slice.
