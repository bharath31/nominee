# nominee-cli

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
