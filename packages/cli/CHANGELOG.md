# nominee-cli

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
