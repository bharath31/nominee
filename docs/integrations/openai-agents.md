# OpenAI Agents SDK Integration

`nominee-openai` adapts Nominee's decision-bound authorization to function tools
from the OpenAI Agents SDK.

## Installation

```bash
npm install nominee nominee-openai @openai/agents zod
```

## Usage

Wrap the function passed to an OpenAI `Agent` with `nomineeTool`. The adapter
performs policy evaluation before tool execution and provides a fresh token only
when the exact, authorized call is consumed.

```typescript
import { Agent } from '@openai/agents'
import { Nominee, allow, ask } from 'nominee'
import { nomineeTool } from 'nominee-openai'
import { z } from 'zod'

const nominee = new Nominee({
  policy: {
    rules: [allow('github.issue.read'), ask('github.issue.close')],
    fallback: 'deny',
  },
})

const closeIssue = nomineeTool({
  name: 'close_issue',
  description: 'Close one GitHub issue',
  parameters: z.object({ repo: z.string(), issue: z.number() }),
  nominee,
  action: 'github.issue.close',
  user: ({ context }) => context.context.userId,
  resource: ({ input }) => `repo:${input.repo}#${input.issue}`,
  connection: 'github',
  scopes: ['issues:write'],
  execute: async ({ repo, issue }, { token }) => {
    return closeGitHubIssue({ repo, issue, token })
  },
})

const agent = new Agent({ name: 'support-agent', tools: [closeIssue] })
```

For `ask` rules, the SDK's `needsApproval` hook pauses execution. When the run
resumes, the adapter verifies the approved tool-call ID before recording the
approval evidence and executing the tool. Denials remain exceptions and never
call the underlying function.
