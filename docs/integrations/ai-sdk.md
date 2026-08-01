# Vercel AI SDK Integration

The `nominee-ai` package provides a native adapter for the Vercel AI SDK, allowing you to wrap standard AI SDK tools with Nominee's authorization engine.

## Installation

```bash
npm install nominee nominee-ai ai
```

## Usage

Use `guardTools` to wrap a map of AI SDK tools before passing them to `generateText` or `streamText`.

```typescript
import { Nominee, allow, ask, deny } from 'nominee';
import { guardTools } from 'nominee-ai';
import { generateText, tool } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

// 1. Initialize Nominee
const nominee = new Nominee({
  policy: {
    rules: [
      allow('weather.get'),
      ask('email.send'),
      deny('system.reboot')
    ],
    fallback: 'ask'
  }
});

// 2. Define standard AI SDK tools
const rawTools = {
  getWeather: tool({
    description: 'Get the current weather',
    parameters: z.object({ location: z.string() }),
    execute: async ({ location }) => `Weather in ${location} is sunny.`
  }),
  sendEmail: tool({
    description: 'Send an email',
    parameters: z.object({ to: z.string(), subject: z.string(), body: z.string() }),
    execute: async ({ to, subject, body }) => `Email sent to ${to}.`
  })
};

// 3. Wrap tools with Nominee
const tools = guardTools(nominee, rawTools, { user: 'user-123' });

// 4. Run the agent
const result = await generateText({
  model: openai('gpt-4o'),
  prompt: 'Send an email to alice@example.com saying hi.',
  tools
});
```
