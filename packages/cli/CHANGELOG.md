# nominee-cli

## 3.0.0

### Minor Changes

- f167493: The zero-arg `npx nominee-cli` proof now demonstrates the decision-bound
  lifecycle instead of plain allow/ask/deny outcomes: the $200 refund pauses with
  `ActionPendingError` and returns an `actionId` without holding the connection
  open; the plan-time access token expires while the human is away; out-of-band
  approval resumes the action and a fresh token is minted only at execution,
  after the single-use capability is consumed; replaying the consumed approval
  is rejected; and the approved $200 cannot be executed as a $2,000. The receipt
  chain still verifies, and a doctored copy is detected. `nominee-cli observe`
  now labels its output as a built-in demo agent that never touches your code,
  with a pointer to `nominee.observe(yourTools)`.

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

## 2.8.0

### Patch Changes

- Updated dependencies [c68e48d]
  - nominee@2.8.0

## 2.6.0

### Minor Changes

- 450634b: Add an authenticated loopback-only console for observation reports, live
  receipt verdicts, one-time approvals, honest chain verification, and starter
  policy generation, plus an explicit opt-in bridge for running agents.

## 2.5.0

### Minor Changes

- fa7324e: `nominee check` reports rules shadowed by an earlier matching pattern and accepts `--tools` extra sample names (built-ins remain unless `--replace-samples`).
- fa7324e: Inventory available observe-mode tools and generate an evidence-commented,
  default-deny starter policy from an observation report.

### Patch Changes

- Updated dependencies [fa7324e]
  - nominee@2.5.0

## 2.4.0

### Minor Changes

- c6ae510: Keep the bundled proof signal as a trial and add `nominee activate`, which locally verifies a
  non-empty policy plus an intact, matching enforced execution before offering a separate,
  fully-disclosed developer activation report.

### Patch Changes

- Updated dependencies [887ae0b]
  - nominee@2.4.0

## 2.3.0

### Minor Changes

- b3d3c6b: Offer a one-time, fully disclosed opt-in activation report after the offline
  proof succeeds, with `DO_NOT_TRACK` support. The choice is persisted before a
  bounded request, the CLI reports its own installed version, and optional
  reporting can never change the proof's successful exit.
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

### Patch Changes

- Updated dependencies [2d8a966]
  - nominee@2.3.0

## 2.2.3

### Patch Changes

- 009418d: Replace the default prompt-injection demo with a support-agent refund policy proof, and make the
  published npm binary execute reliably through its symlink.

## 2.2.2

### Patch Changes

- 39bc69b: Fix `npx nominee-cli` silently doing nothing (exit 0, zero output) for every
  real invocation. npm installs a package's `bin` as a symlink
  (`node_modules/.bin/nominee` -> `dist/cli.js`); the entry point's "is this
  being run directly" check compared `import.meta.url` (resolved, real path)
  against the unresolved symlink path in `process.argv[1]`, so the comparison
  was always false in the one scenario that matters — the actual `npx`/`npm`
  bin invocation — and `main()` was never called. The existing test suite only
  called the exported `main()` function directly and never exercised the
  symlinked bin path, so this shipped undetected. Fixes the check by
  realpath-resolving `process.argv[1]` before comparing, and adds a regression
  test that spawns the built entry point through an actual symlink.

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
- Updated dependencies [9f2e7d3]
  - nominee@2.2.1
