# nominee-eve

**Vercel Eve adapter for [nominee](https://www.npmjs.com/package/nominee)** — inject fresh tokens and human-in-the-loop approval into Eve agent tools.

```bash
npm install nominee nominee-eve
```

## What it does

Wraps Eve's `defineTool()` to automatically:
- Fetch a **fresh token** for the given OAuth connection and inject it into `ctx.token`
- Gate execution behind a **human approval** request before the tool runs
- Surface the current `user` in every tool call context

> Eve is ESM-only, so `nominee-eve` is ESM-only too.

## Usage

```ts
// agent/tools/star_repo.ts
import { nomineeTool } from 'nominee-eve'
import { Nominee, tokens } from 'nominee'
import { z } from 'zod'

const nominee = new Nominee({
  strategy: tokens(({ connection }) =>
    process.env[`${connection.toUpperCase()}_TOKEN`]!
  ),
  onApprovalRequest: async (req) => notifyUser(req),
})

export const starRepo = nomineeTool({
  nominee,
  user: 'user_123',
  connection: 'github',   // fresh GitHub token injected into ctx.token
  description: 'Star a GitHub repository on behalf of the user',
  parameters: z.object({
    repo: z.string().describe('owner/repo to star'),
  }),
  execute: async ({ repo }, ctx) => {
    await fetch(`https://api.github.com/user/starred/${repo}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${ctx.token}` },
    })
    return { starred: repo }
  },
})
```

## Gate with human approval

```ts
export const deleteFile = nomineeTool({
  nominee,
  user: 'user_123',
  connection: 'drive',
  approval: true,          // pauses until user approves
  action: 'delete_file',
  description: 'Delete a file from Google Drive',
  parameters: z.object({ fileId: z.string() }),
  execute: async ({ fileId }, ctx) => {
    return deleteFromDrive(fileId, ctx.token)
  },
})
```

## `withNominee` — set defaults once

```ts
import { withNominee } from 'nominee-eve'

const { nomineeTool } = withNominee(nominee, {
  user: 'user_123',
  connection: 'github',
})

export const tool1 = nomineeTool({ ... })
export const tool2 = nomineeTool({ ... })
```

## Tool context

```ts
execute: async (input, ctx) => {
  ctx.token   // fresh OAuth token (if connection set)
  ctx.user    // current user ID
  ctx.eve     // raw Eve tool context
}
```

## License

MIT
