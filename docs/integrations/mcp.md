# Model Context Protocol (MCP) Integration

The `nominee-mcp` package lets you build MCP servers that enforce Nominee authorization policies on every tool call.

## Installation

```bash
npm install nominee nominee-mcp @modelcontextprotocol/sdk
```

## Usage

Use `registerNomineeTool` to add an MCP tool protected by Nominee.

```typescript
import { Nominee, allow, ask } from 'nominee';
import { registerNomineeTool } from 'nominee-mcp';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const nominee = new Nominee({
  policy: {
    rules: [allow('github.issue.read'), ask('github.issue.create')],
    fallback: 'deny'
  }
});

const server = new Server({ name: 'github-server', version: '1.0.0' }, { capabilities: { tools: {} } });

registerNomineeTool(server, nominee, {
  name: 'read_issue',
  description: 'Read a GitHub issue',
  action: 'github.issue.read', // Maps to policy
  schema: z.object({ repo: z.string(), issue_number: z.number() }),
  execute: async (input, { user }) => {
    return { content: [{ type: 'text', text: `Issue ${input.issue_number}` }] };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
```
