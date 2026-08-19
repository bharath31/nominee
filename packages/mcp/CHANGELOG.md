# nominee-mcp

## 3.0.0

### Patch Changes

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

## 2.5.0

### Patch Changes

- fa7324e: Surface pending approvals as structured MCP tool results from `registerNomineeTool`, and resolve end-user identity from auth claims rather than OAuth clientId.

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
