# nominee-ai

**Vercel AI SDK adapter for [nominee](https://www.npmjs.com/package/nominee)** — inject fresh tokens and human-in-the-loop approval into AI SDK tools.

```bash
npm install nominee nominee-ai
```

## What it does

Wraps the Vercel AI SDK's `tool()` to automatically:
- Fetch a **fresh token** for the given OAuth connection and inject it into `ctx.token`
- Gate execution behind a **human approval** request before the tool runs
- Surface the current `user` in every tool call context

Works with any AI SDK model provider and also covers **Cloudflare Agents** (which use the AI SDK).

## Usage

```ts
import { Nominee, tokens } from 'nominee'
import { nomineeTool, withNominee } from 'nominee-ai'
import { generateText } from 'ai'
import { openai } from '@ai-sdk/openai'
import { z } from 'zod'

const nominee = new Nominee({
  strategy: tokens(({ connection }) =>
    process.env[`${connection.toUpperCase()}_TOKEN`]!
  ),
  onApprovalRequest: async (req) => notifyUser(req),
})

// Create a tool with automatic token injection
const starRepo = nomineeTool({
  nominee,
  user: 'user_123',
  connection: 'github',   // token for this connection is injected into ctx
  description: 'Star a GitHub repository',
  parameters: z.object({ repo: z.string() }),
  execute: async ({ repo }, ctx) => {
    // ctx.token is a fresh GitHub token — fetched at call time, never stale
    await fetch(`https://api.github.com/user/starred/${repo}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${ctx.token}` },
    })
    return `Starred ${repo}`
  },
})

const { text } = await generateText({
  model: openai('gpt-4o'),
  tools: { starRepo },
  prompt: 'Star the vercel/ai repo for me',
})
```

## Gate with human approval

```ts
const deleteFile = nomineeTool({
  nominee,
  user: 'user_123',
  connection: 'drive',
  approval: true,                    // pauses until user approves
  action: 'delete_file',
  description: 'Delete a file',
  parameters: z.object({ path: z.string() }),
  execute: async ({ path }, ctx) => {
    // only runs after approval
    return deleteFromDrive(path, ctx.token)
  },
})
```

## `withNominee` — set defaults once

```ts
const { nomineeTool } = withNominee(nominee, {
  user: 'user_123',
  connection: 'github',
})

// All tools created with this instance share the same user/connection defaults
const tool1 = nomineeTool({ ... })
const tool2 = nomineeTool({ ... })
```

## Tool context

```ts
execute: async (input, ctx) => {
  ctx.token   // fresh OAuth token (if connection set)
  ctx.user    // current user ID
  ctx.ai      // raw AI SDK tool context
}
```

## License

MIT
