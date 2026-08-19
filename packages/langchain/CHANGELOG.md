# nominee-langchain

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

## 2.7.0

### Minor Changes

- c98a564: Add `nominee-langchain`: LangChain JS `tool()` wrappers that route through
  `nominee.run()`, so deny never reaches execute and ask surfaces
  `ActionPendingError` for durable resume.
