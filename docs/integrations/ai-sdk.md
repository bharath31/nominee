# Vercel AI SDK Integration

The `nominee-ai` package guards Vercel AI SDK tools with Nominee's authorization engine.
The key in the `tools` object is the policy action checked by `guardTools`.

## Installation

This example uses OpenAI as the model provider and Zod for tool schemas:

```bash
npm install nominee nominee-ai ai @ai-sdk/openai zod
```

## Usage

```typescript
import { openai } from '@ai-sdk/openai'
import { generateText, tool } from 'ai'
import { Nominee, allow, ask } from 'nominee'
import { guardTools } from 'nominee-ai'
import { z } from 'zod'

const nominee = new Nominee({
  policy: {
    rules: [allow('getWeather'), ask('sendEmail')],
    fallback: 'deny',
  },
})

const rawTools = {
  getWeather: tool({
    description: 'Get the current weather',
    inputSchema: z.object({ location: z.string() }),
    execute: async ({ location }) => `Weather in ${location} is sunny.`,
  }),
  sendEmail: tool({
    description: 'Send an email',
    inputSchema: z.object({ to: z.string(), body: z.string() }),
    execute: async ({ to }) => `Email sent to ${to}.`,
  }),
}

const result = await generateText({
  model: openai('gpt-5-mini'),
  prompt: 'What is the weather in London?',
  tools: guardTools(nominee, rawTools, { user: 'user-123' }),
})

console.log(result.text)
```

AI SDK tools use `inputSchema` (`ai@5+` / `ai@7`). The older `parameters` field
does not type-check against the peer range in `packages/ai/package.json`.
`guardTools` routes each `execute` through `nominee.run()` — do not call
`authorize()` as the execution path.

The OpenAI Agents SDK adapter still uses `parameters` on `nomineeTool` (that
SDK has not renamed the field). See [`openai-agents.md`](openai-agents.md).

Set `OPENAI_API_KEY` before running the example. An `allow` decision executes immediately, a
`deny` decision never calls the underlying tool, and an `ask` decision uses the approval handler
configured on the `Nominee` instance. Use `nomineeTool` instead when a tool also needs a fresh
third-party token, resource authorization, or an action name different from its object key.
