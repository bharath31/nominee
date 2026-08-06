---
'nominee-cli': patch
---

Fix `npx nominee-cli` silently doing nothing (exit 0, zero output) for every
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
