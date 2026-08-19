# nominee

## 3.0.0

### Major Changes

- 486f59d: Receipt delivery is now **strict by default**, and the policy budget option was
  renamed to `maxCalls`. Both are breaking changes bundled into this release.

  ## `receipts.delivery` defaults to `'strict'`

  Previously the default was `'buffered'`: a receipt sink that threw or rejected
  latched a flag and the tool still ran, with the audit silently lost. For a
  product whose differentiator is evidence, that is a security bug. Now:

  - A sink that throws or rejects **fails the call** — the tool does not run with
    its audit lost.
  - Pass `delivery: 'buffered'` explicitly to restore the legacy best-effort
    behaviour (a failing sink defers the error to `flushReceipts()`; treat a
    rejecting flush as lost audit evidence). `production: true` refuses
    `'buffered'`.
  - `nominee.verifyReceipts()` is now **async** and, when an atomic receipt store
    is configured, verifies the durable stream together with the in-process
    window — a production instance never gets a vacuous `{ ok: true, checked: 0 }`.

  ## `max` is renamed to `maxCalls`

  `allow('refund.issue', { max: 20 })` counts **calls**, not spend, with no time
  window and no reset. The name invited the wrong reading. The option is now
  `maxCalls`; the deprecated `max` alias keeps working (one warning per process)
  and setting both throws. Durable budget counters are unaffected by the rename.

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
- 136561f: Fix the README "Full API" blocks: `onGovernedAction` is a constructor
  option, not a method — it is now documented where it actually is, and
  `nominee.receipts` is called out as a getter, not a method.
  `brand/check-surfaces.mjs` now verifies every `nominee.<member>` named in
  the two README API blocks against the built `Nominee` class.

## 2.8.0

### Minor Changes

- c68e48d: Seal receipt schema version `v: 1` into every new receipt hash. `verifyReceipts` still accepts unversioned legacy records and mixed chains, and fails closed on an unknown `v`.

## 2.5.0

### Minor Changes

- fa7324e: Inventory available observe-mode tools and generate an evidence-commented,
  default-deny starter policy from an observation report.

## 2.4.0

### Minor Changes

- 887ae0b: Add `and`/`or`/`not`, `lte`, and `inList` policy helpers, plus `formatReceipts({ verbose })` and `formatReceiptsCsv`.

## 2.3.0

### Minor Changes

- 2d8a966: Add observe mode: a first-class, report-only mode over your existing tools.

  `new Nominee({ mode: 'observe' })` plus `nominee.observe(tools)` needs no
  policy and does not enforce deny, ask, or budget decisions. Runtime and
  integrity failures still fail closed. Policy verdicts are recorded into the
  same hash-chained receipts before execution continues, so you can find out what
  an agent actually does before deciding what it should be allowed to do.
  `nominee.observations()` returns a JSON report (callbacks that actually started,
  argument types and observed ranges, fingerprint-based bounded cardinality,
  which arguments are unbounded, and what a policy would have said) without
  retaining raw string/boolean values or user IDs. Numeric samples and aggregates
  are bounded but can be sensitive. `formatObservations()` prints the report.

  Observe mode is a discovery tool, not a security control, and the safety rails
  say so: enforcement remains the default, `production: true` refuses to combine
  with it, startup emits an unmissable notice that enforcement is off, every
  receipt and audit event carries `enforcement: 'observe'` alongside the verdict
  the policy actually reached, and delegated sub-agents inherit the mode rather
  than choosing it. Input binding, single-use capabilities, and the receipt chain
  are unchanged.

  `npx nominee-cli observe` demonstrates it on a sample agent, with `--out <file>`
  to write the JSON report.

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
