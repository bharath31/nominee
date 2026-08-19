# langchain-approval

What happens when an `ask` rule fires inside a LangChain JS agent — and how to
recover when the human approves out of band.

LangChain JS has no resumable tool-approval primitive, so an `ask` throws
`ActionPendingError` straight out of `invoke()`. This example shows the full
loop a real app has to run:

1. `invoke()` throws immediately with an `actionId` — no hung connection.
2. The approval is resolved out of band
   (`resolveActionApproval(id, { decision: 'approved', ... })`).
3. `resumeAction(id)` returns `{ status: 'ready', capability }` — **it does not
   execute**. You must have persisted the original input yourself (the durable
   action record stores only its hash).
4. `executeCapability(capability, originalInput, fn)` executes exactly the
   approved input — a mutated input is rejected at capability consumption and
   recorded as a deny on the receipt chain.

## Run

```bash
node run.mjs
```

No keys. No network. A scripted model drives a real LangChain agent loop.
Exit code 0 means every invariant held.

## What to notice

- The receipt chain shows the whole pause: `approval.requested` →
  `approval.resolved` → `capability.issued` → `capability.consumed`.
- `#15 policy.decision ... deny tool input changed after authorization` — the
  arg-swap ($200 approved, $2,000 executed) is refused and it is **on the
  record**.
- The "you must persist the input" requirement is the part that surprises
  developers — the durable action store keeps only the input's hash.
