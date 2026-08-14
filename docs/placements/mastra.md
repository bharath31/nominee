# Mastra listing

**Route in:** Mastra integrations docs. They want an issue first.
**Issue template:** https://github.com/mastra-ai/mastra/issues/new?template=integration_request.yml
**Partnering write-up:** https://mastra.ai/blog/partnering-with-mastra
**Maintainer (beyond the PR):** ashwin@mastra.ai
**Discord:** https://discord.gg/BTYqqHKUrf
**Guide:** [docs/integrations/mastra.md](../integrations/mastra.md)
**Package:** `nominee-mastra`

## Suggested blurb

Mastra tools whose side effects run through nominee’s decision-bound lifecycle:
allow / ask / deny, exact-input capabilities, fresh tokens at execute, receipts
for refusals as well as approvals. Native or portable approval.

```ts
import { nomineeTool } from 'nominee-mastra'
```

- npm: https://www.npmjs.com/package/nominee-mastra
- Guide: https://github.com/bharath31/nominee/blob/main/docs/integrations/mastra.md
- Site: https://nominee.dev/?utm_source=mastra&utm_medium=placement

Mastra already has strong workflow and approval primitives. nominee is the
application-authorization layer underneath, not a replacement runtime.

## Integration-request issue body (paste)

```
Service Name: nominee (`nominee-mastra`)
Website: https://nominee.dev/?utm_source=mastra&utm_medium=placement
API / docs: https://github.com/bharath31/nominee/blob/main/docs/integrations/mastra.md
npm: https://www.npmjs.com/package/nominee-mastra
Public example: https://github.com/bharath31/nominee/tree/main/packages/mastra

Use case: Mastra tools whose side effects must go through allow/ask/deny,
exact-input capabilities, and receipts — including denials. Native Mastra
approval stays; nominee is the application PEP underneath, not a second
agent runtime.

I have searched existing issues.
This is a maintained package in our repo (not a request that Mastra own the code).
```

## Owner checklist

- [ ] Search mastra-ai/mastra issues for “nominee”
- [ ] File the integration request issue (required before a docs PR)
- [ ] Discord ping + optional mail to ashwin@mastra.ai
- [ ] Follow their docs contribution guide after they accept
- [ ] Paste the live URL into [README.md](README.md)
