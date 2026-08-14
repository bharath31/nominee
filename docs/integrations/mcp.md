# Model Context Protocol (MCP) Integration

The `nominee-mcp` package registers decision-bound tools on the current MCP TypeScript SDK's
high-level `McpServer`.

## Installation

```bash
npm install nominee nominee-mcp @modelcontextprotocol/sdk zod
```

## Usage

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { Nominee, allow, ask } from 'nominee'
import { registerNomineeTool } from 'nominee-mcp'
import { z } from 'zod'

const nominee = new Nominee({
  policy: {
    rules: [allow('github.issue.read'), ask('github.issue.create')],
    fallback: 'deny',
  },
})

const server = new McpServer({ name: 'github-server', version: '1.0.0' })

registerNomineeTool(server, {
  name: 'read_issue',
  description: 'Read a GitHub issue',
  action: 'github.issue.read',
  inputSchema: z.object({ repo: z.string(), issueNumber: z.number().int().positive() }),
  nominee,
  user: 'user-123',
  execute: async ({ repo, issueNumber }) => ({
    content: [{ type: 'text', text: `${repo} issue ${issueNumber}` }],
  }),
})

await server.connect(new StdioServerTransport())
```

`registerNomineeTool` accepts the server and one configuration object. The configuration uses
`inputSchema` (not the old `schema` option) and requires both `nominee` and `user`. Set
`connection` to fetch a fresh token at execution time, or use resolver functions for `user`,
`resource`, `tenant`, and `connection` when they depend on the MCP request.
