# nominee-mcp

Decision-bound MCP tool handlers for the official Model Context Protocol SDK.

**MCP OAuth authorizes the connection. nominee authorizes the action.** A
connected server can still exfiltrate if the model asks; `registerNomineeTool`
checks `allow` / `ask` / `deny` before the handler runs. That contains blast
radius. It does not detect prompt injection.

Quickstart: https://nominee.dev/docs/mcp/

To inventory MCP tool callbacks before writing a policy, construct the same
Nominee instance with `mode: 'observe'`. `registerNomineeTool` still routes
through `run()`, but asks and denies are recorded rather than enforced.
Observation reports do not retain raw string/boolean values or user IDs;
numeric aggregates may be sensitive. Observe mode is not a security control
and cannot be combined with `production: true`.

```ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { Nominee, allow, ask } from 'nominee'
import { mcpEndUser, registerNomineeTool } from 'nominee-mcp'
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
  user: ({ extra }) => mcpEndUser(extra, 'local-stdio-user'),
  resource: ({ input }) => `repo:${input.repo}#${input.issue}`,
  connection: 'github',
  scopes: ['issues:write'],
  execute: async ({ repo, issue }, { token }) => {
    await closeGitHubIssue({ repo, issue, token })
    return { content: [{ type: 'text', text: 'Issue closed' }] }
  },
})

await server.connect(new StdioServerTransport())
```

MCP does not define a universal human-approval resume protocol. The high-level
`McpServer` catches thrown errors, so `registerNomineeTool` returns
`{ isError: true, structuredContent: { nominee: 'pending_approval', actionId, approvalId } }`.
Persist that `actionId` **and the original tool input**, resolve it through your
approval UI, then call `resumeAction()` and `executeCapability()`. The standalone
`nomineeMcpHandler()` still throws `ActionPendingError`. Denied calls never reach
the MCP handler.
