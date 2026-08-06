---
'nominee': patch
'nominee-ai': patch
'nominee-eve': patch
'nominee-auth0': patch
'nominee-supabase': patch
'nominee-postgres': patch
'nominee-openai': patch
'nominee-mastra': patch
'nominee-mcp': patch
'nominee-cli': patch
---

Fix `npx nominee-cli` crashing on launch. The published `nominee@2.2.0` core
package predates the `formatReceipts` export that `nominee-cli@2.2.0` already
depends on, so every invocation of the CLI (`npx nominee-cli`, `verify`,
`check`) currently throws `SyntaxError: The requested module 'nominee' does
not provide an export named 'formatReceipts'` against the live npm registry.
This changeset republishes the linked package set so the CLI's dependency is
satisfied again. No source changes beyond the version bump — `formatReceipts`
has been present in `packages/core/src` since it was added; it was simply
never carried forward into a new npm release.
