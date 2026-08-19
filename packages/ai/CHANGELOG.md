# nominee-ai

## 3.0.0

### Minor Changes

- eb5b290: `guardTools` now accepts the full per-call context of `nomineeTool`: `resource` and `tenant` (static values or resolvers of the tool's input and tool-call options), `connection`, and `scopes`. Every resolved value is forwarded to `nominee.run()`, so tenant- and resource-scoped policy rules and token strategies work through the whole-object one-liner. Existing `guardTools(nominee, tools, { user })` calls are unchanged.

### Patch Changes

- f67b49a: Post-merge review fixes for the Wave-1 credibility PRs:

  - **CI actually runs the API-surface gate now.** `ci.yml` builds before
    `brand/check-surfaces.mjs`, and the check fails in CI when
    `packages/core/dist` is absent instead of silently skipping — so a
    reintroduced phantom method like `nominee.onGovernedAction()` fails the
    pipeline, as the README audit intended.
  - **`guardTools` documents its token boundary.** `connection` / `scopes`
    on the one-liner authorize a fresh token through your strategy (policy,
    external authorization, receipt log), but the wrapped tool's plain
    `execute` never receives it — use `nomineeTool` when the tool itself
    must call the third-party API, and note that `connection` on a
    policy-only nominee fails closed at call time.
  - **`guardTools` gets coverage for static `tenant` / `resource` values,
    `ActionPendingError` when an ask outlives the request, and
    `AuthorizationInputChangedError` when input mutates after approval.**
  - **The CLI pause proof tightens its arg-swap criterion** to count only
    `AuthorizationInputChangedError` — proof that the approval is bound to
    the exact approved input, not a looser consumed-capability error.
  - **`packages/core/README.md` Full API block gains `assertUnchanged`,
    `observe()`, and `observations()`.**

- 833a7af: Document the out-of-band approval path — the approval that outlives the request. New
  site page at `nominee.dev/docs/approvals` with the four-step flow (catch
  `ActionPendingError` and persist the action id and the original input,
  `resolveActionApproval()`, `resumeAction()`, `executeCapability()`); a compressed
  four-step section in the core README quickstart; a "What happens on `ask`"
  subsection in every adapter README; and `examples/support-refund-agent` named as the
  canonical reference implementation.
- c53fc13: Repositioned the package surfaces around the pause narrative: npm package
  descriptions now lead with the consequence of approvals that outlive the
  request — a token minted at execution, bound to the arguments a human
  reviewed, spendable once, sealed into a hash-chained receipt — instead of a
  capability list. The core and adapter READMEs align with the same story,
  budget examples use `maxCalls` (lifetime call count, no time window, never
  resets, escalates to `ask` on exhaustion), and every tamper-evidence claim
  now carries its trust boundary (tamper-evident against a downstream log
  editor, not non-repudiation against the agent host).
- Updated dependencies [486f59d]
- Updated dependencies [f67b49a]
- Updated dependencies [833a7af]
- Updated dependencies [c53fc13]
- Updated dependencies [136561f]
  - nominee@3.0.0

## 2.4.0

### Patch Changes

- 1b7f5a7: Document the CommonJS + ai@7 Node ≥22.12 require()-of-ESM trap in the package README.

## 2.2.1

### Patch Changes

- 9f2e7d3: Fix `npx nominee-cli` crashing on launch. The published `nominee@2.2.0` core
  package predates the `formatReceipts` export that `nominee-cli@2.2.0` already
  depends on, so every invocation of the CLI (`npx nominee-cli`, `verify`,
  `check`) currently throws `SyntaxError: The requested module 'nominee' does
not provide an export named 'formatReceipts'` against the live npm registry.
  This changeset republishes the linked package set so the CLI's dependency is
  satisfied again. No source changes beyond the version bump — `formatReceipts`
  has been present in `packages/core/src` since it was added; it was simply
  never carried forward into a new npm release.

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

- Updated dependencies
  - nominee@2.0.2

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

- Updated dependencies
  - nominee@2.0.1

## 2.0.0

### Patch Changes

- nominee@2.0.0

## 1.1.0

### Patch Changes

- Updated dependencies
  - nominee@1.1.0

## 1.0.0

### Patch Changes

- Updated dependencies [f1593cf]
- Updated dependencies
  - nominee@1.0.0
