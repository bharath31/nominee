# nominee-mastra

Decision-bound tools for Mastra.

```ts
import { Nominee, allow, ask } from 'nominee'
import { nomineeTool } from 'nominee-mastra'
import { z } from 'zod'

const closeIssue = nomineeTool({
  id: 'close-issue',
  description: 'Close one GitHub issue',
  inputSchema: z.object({ repo: z.string(), issue: z.number() }),
  outputSchema: z.object({ closed: z.boolean() }),
  nominee: new Nominee({
    policy: {
      rules: [allow('github.issue.read'), ask('github.issue.close')],
      fallback: 'deny',
    },
  }),
  action: 'github.issue.close',
  user: ({ requestContext }) => String(requestContext.userId),
  resource: ({ input }) => `repo:${input.repo}#${input.issue}`,
  connection: 'github',
  scopes: ['issues:write'],
  nativeApprovals: true,
  execute: async ({ repo, issue }, { token }) => {
    await closeGitHubIssue({ repo, issue, token })
    return { closed: true }
  },
})
```

Set `nativeApprovals: true` to map Nominee `ask` rules into Mastra's native
pause/resume flow for Mastra agent tools. The adapter binds approval evidence
to Mastra's runtime-generated `toolCallId`; workflow or direct execution
without that marker fails closed to Nominee's portable durable approval handle
(`ActionPendingError`). Leave `nativeApprovals` off to use that portable flow
everywhere. In both modes, denied calls never reach `execute`, and credentials
are resolved only after capability consumption.
