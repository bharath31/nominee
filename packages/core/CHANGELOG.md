# nominee

## 2.2.0

### Minor Changes

- 227d887: Add the decision-bound action lifecycle, atomic durable PostgreSQL stores,
  verified resumable CIBA approvals, execution outcomes, privacy-safe usage
  measurement, and first-class OpenAI Agents, Mastra, and MCP adapters.

## 2.1.0

### Minor Changes

- 9ad3cd0: Pivot: nominee is now the authorization layer for AI agents, not just a token
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

## 2.0.2

### Patch Changes

- Release 2.0.2 to realign all packages on one clean, publishable version.

  `nominee@2.0.1` and `nominee-supabase@2.0.1` published successfully, but
  `nominee-ai`, `nominee-eve`, and `nominee-auth0` had **both 2.0.0 and 2.0.1
  burned** on npm (published then unpublished earlier — npm permanently retires
  those exact version numbers, so `changeset publish` keeps getting "cannot
  publish over previously published version"). 2.0.2 is unused for every package,
  so it publishes cleanly and brings the whole linked group back in lockstep.

## 2.0.1

### Patch Changes

- Release 2.0.1 and fix unintended major version bumps.

  Two things in one release:

  1. **Unblock publishing.** The `2.0.0` version number was burned on npm for
     `nominee-ai`, `nominee-eve`, and `nominee-auth0` (published then unpublished
     on 2026-06-20), so npm permanently rejects republishing it and the Release
     workflow stayed red. Bumping to `2.0.1` publishes a fresh, clean version.

  2. **Fix the versioning.** `2.0.0` itself was an _accident_: a single
     `nominee-auth0: minor` changeset got escalated to a whole-group **major** by
     changesets' `fixed`-group behavior. The config now uses `linked` instead of
     `fixed`, so the packages still share a version line but a `minor` changeset
     bumps a minor and a `patch` bumps a patch — no surprise majors.

## 2.0.0

## 1.1.0

### Minor Changes

- Add sub-agent delegation. `delegate(actor)` returns a child Nominee that shares the parent's token cache and audit stream but records an extended identity chain, so a delegated action is attributed to `user → orchestrator → sub-agent`. `exchange({ user, connection, actor, scopes })` performs an RFC 8693 token exchange for a downscoped token bound to a sub-agent (requires a strategy that implements `exchange`), emitting `token.exchanged` with the chain.

## 1.0.0

### Minor Changes

- f1593cf: Approval requests passed to `onApprovalRequest` now carry `approve()`, `deny()`, and `resolve(decision)` methods, so you can settle them inline without capturing the `Nominee` instance (no more self-reference / type-annotation dance). `resolveApproval(id, decision)` still works.
- Add single-flight refresh coalescing and `invalidate()`.

  `token()` now deduplicates concurrent cache-miss calls — N parallel calls share one fetch instead of stampeding the token endpoint. The in-flight promise map is cleaned up in `finally` so a failed refresh never blocks the next attempt.

  `invalidate(user, connection)` drops the cached entry and emits a `token.invalidated` audit event. Use it when a token is known-bad (e.g. a 401 came back from the API) to force a fresh fetch on the next `token()` call.
