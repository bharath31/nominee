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
import { Agent, run } from '@openai/agents'
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
  user: 'user-123',
  resource: ({ input }) => `repo:${input.repo}#${input.issue}`,
  connection: 'github',
  scopes: ['issues:write'],
  execute: async ({ repo, issue }, { token }) => {
    const response = await fetch(`https://api.github.com/repos/${repo}/issues/${issue}`, {
      method: 'PATCH',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ state: 'closed' }),
    })
    if (!response.ok) throw new Error(`GitHub returned ${response.status}`)
    return `Closed ${repo}#${issue}`
  },
})

const agent = new Agent({ name: 'support-agent', tools: [closeIssue] })
const result = await run(agent, 'Close issue 42 in acme/widgets')
console.log(result.finalOutput)
```

Set `OPENAI_API_KEY` before running the example, and configure a Nominee token strategy for the
`github` connection. For `ask` rules, the SDK's `needsApproval` hook pauses execution. When the run
resumes, the adapter verifies the approved tool-call ID before recording the
approval evidence and executing the tool. Denials remain exceptions and never
call the underlying function.
