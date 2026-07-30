# nominee-mcp

Decision-bound MCP tool handlers for the official Model Context Protocol SDK.

```ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { Nominee, allow, ask } from 'nominee'
import { registerNomineeTool } from 'nominee-mcp'
import { z } from 'zod'

const server = new McpServer({ name: 'support-tools', version: '1.0.0' })
const nominee = new Nominee({
  policy: {
    rules: [allow('github.issue.read'), ask('github.issue.close')],
    fallback: 'deny',
  },
})

registerNomineeTool(server, {
  name: 'close_issue',
  description: 'Close one GitHub issue',
  inputSchema: z.object({ repo: z.string(), issue: z.number() }),
  nominee,
  action: 'github.issue.close',
  user: ({ extra }) => extra.authInfo?.clientId ?? 'anonymous',
  resource: ({ input }) => `repo:${input.repo}#${input.issue}`,
  connection: 'github',
  scopes: ['issues:write'],
  execute: async ({ repo, issue }, { token }) => {
    await closeGitHubIssue({ repo, issue, token })
    return { content: [{ type: 'text', text: 'Issue closed' }] }
  },
})
```

MCP does not define a universal human-approval resume protocol. A Nominee
`ask` therefore throws `ActionPendingError`; catch it at your transport/job
boundary, persist the action id, resolve it through your approval UI, then call
`resumeAction()` and `executeCapability()`. Denied calls never reach the MCP
handler.
