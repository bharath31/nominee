# OpenAI Agents SDK Integration

The `nominee-openai` package provides an adapter for the OpenAI Agents SDK, enabling Nominee policies on OpenAI agent tool calls.

## Installation

```bash
npm install nominee nominee-openai openai
```

## Usage

Use `guardTools` (or the equivalent API provided by `nominee-openai`) to secure your OpenAI tools.

```typescript
import { Nominee, allow, ask } from 'nominee';
import { guardTools } from 'nominee-openai';
import OpenAI from 'openai';

const nominee = new Nominee({
  policy: {
    rules: [allow('search.*'), ask('database.*')],
    fallback: 'ask'
  }
});

const client = new OpenAI();

const rawTools = [
  {
    type: 'function',
    function: {
      name: 'search_web',
      description: 'Search the web',
      parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] }
    }
  }
];

const executeFns = {
  search_web: async ({ query }) => { return { results: [] }; }
};

// Guard execution
const tools = guardTools(nominee, rawTools, executeFns, { user: 'user-123' });

// Pass to OpenAI Agents SDK
const runner = client.beta.chat.completions.runTools({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Search for recent news' }],
  tools: tools.definitions
}).on('message', (msg) => console.log(msg));

// Handle execution through the guarded wrapper
// ...
```
