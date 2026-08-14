# Vercel AI SDK listing

**Route in:** docs PR + community integrations list.
**Guide:** [docs/integrations/ai-sdk.md](../integrations/ai-sdk.md)
**Package:** `nominee-ai` — `nomineeTool` for resource/connection/scopes;
`guardTools(nominee, tools, { user })` only binds policy to a user.

## Suggested PR title

Add nominee as a community integration for tool-call authorization and HITL

## Body (paste)

Vercel AI SDK already has excellent human-in-the-loop primitives. nominee sits
under them when the decision must also include application user/resource
authorization, exact-input binding, a fresh credential at execute time, and a
hash-chained receipt — including denials. Use `nomineeTool` for those
requirements; `guardTools` only passes `{ tool, input, user }`.

```ts
import { nomineeTool } from 'nominee-ai'
import { z } from 'zod'

const merge = nomineeTool({
  nominee,
  action: 'github.merge',
  user: session.userId,
  resource: ({ input }) => `pr:${input.number}`,
  connection: 'github',
  scopes: ['repo'],
  inputSchema: z.object({ number: z.number() }),
  execute: async (_input, { token }) => {
    await mergePullRequest(token)
    return 'merged'
  },
})
```

- npm: https://www.npmjs.com/package/nominee-ai
- Guide: https://github.com/bharath31/nominee/blob/main/docs/integrations/ai-sdk.md
- Site: https://nominee.dev/?utm_source=vercel-ai-sdk&utm_medium=placement

nominee does not replace `needsApproval` / `stopWhen`. Use those when they cover
the whole boundary. Add nominee when the same rules must hold across workers,
frameworks, or a pause that outlives the request.

## Owner checklist

- [ ] Confirm the current AI SDK docs path for community integrations / HITL
- [ ] Open the PR against that repo (not this one)
- [ ] After merge, paste the live URL into [README.md](README.md)
