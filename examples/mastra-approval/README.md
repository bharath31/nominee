# mastra-approval

What nominee adds over Mastra's own suspend/approve primitives.

Mastra has a native tool-approval path (`nativeApprovals`) and nominee-mastra
bridges it: the SDK's approval request becomes nominee evidence, and the
approved call executes as a one-shot, exact-input-bound capability. But
`nativeApprovals` is **off by default** — out of the box, a Mastra `ask` throws
`ActionPendingError` out of the agent loop, and a direct tool call throws it too.

This example runs the whole matrix:

- **A — native bridge, approve path**: the agent suspends with
  `providerApprovalId`, `state.approve()` resumes it, and the executed tool is
  recorded in nominee receipts as a decision-bound action.
- **B — native bridge, decline path**: the tool never executes; the receipts
  show no capability was issued.
- **C1 — nativeApprovals OFF**: the agent loop does not throw — the tool call
  is skipped and the model just sees the loop continue (which is why you must
  opt in explicitly).
- **C2 — direct tool call with nativeApprovals OFF**: throws
  `ActionPendingError` with an `actionId` — the out-of-band recovery loop from
  the [out-of-band approvals docs](/docs/approvals/) applies.

## Run

```bash
node run.mjs
```

No keys. No network. A scripted model drives a real Mastra Agent loop.
Exit code 0 means every invariant held.
