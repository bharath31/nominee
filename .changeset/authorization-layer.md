---
"nominee": minor
"nominee-ai": minor
"nominee-eve": minor
"nominee-auth0": minor
"nominee-supabase": minor
---

Pivot: nominee is now the authorization layer for AI agents, not just a token
broker. New in the dependency-free core:

- Policy engine: declarative `allow`/`deny`/`ask` rules over tool calls — glob
  tool-name patterns, argument-level `when` predicates, call budgets (`max`
  escalates to a human when exhausted), configurable fallback. First match
  wins; the model cannot talk its way past a deny.
- `nominee.authorize()` / `.check()` / `.guard()`: `guard()` wraps a whole
  tools object (plain functions or any framework's `{ execute }` tools) in
  one line. Denials throw `PolicyDeniedError` before the tool runs.
- Receipts: every decision, approval, and token grant is sealed into a
  hash-chained, optionally HMAC-signed, tamper-evident ledger (own SHA-256,
  zero deps). Inputs are hashed by default. `verifyReceipts()` detects edits,
  deletions, and reordering, and can resume verification from a checkpoint
  for long-running or hibernating agents.
- Delegation narrowing: sub-agent policies can only narrow authority
  (deny > ask > allow across the chain); receipts carry the full chain.
- Strategy is now optional: a policy-only nominee needs no token provider.

`nominee-ai` gains `guardTools()`; `nomineeTool` in both the AI SDK and Eve
adapters now enforces policy (`approval: true` forces an `ask`). Fully
backward compatible — no existing constructor option changes shape.
