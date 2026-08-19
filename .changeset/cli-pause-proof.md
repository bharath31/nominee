---
'nominee-cli': minor
---

The zero-arg `npx nominee-cli` proof now demonstrates the decision-bound
lifecycle instead of plain allow/ask/deny outcomes: the $200 refund pauses with
`ActionPendingError` and returns an `actionId` without holding the connection
open; the plan-time access token expires while the human is away; out-of-band
approval resumes the action and a fresh token is minted only at execution,
after the single-use capability is consumed; replaying the consumed approval
is rejected; and the approved $200 cannot be executed as a $2,000. The receipt
chain still verifies, and a doctored copy is detected. `nominee-cli observe`
now labels its output as a built-in demo agent that never touches your code,
with a pointer to `nominee.observe(yourTools)`.