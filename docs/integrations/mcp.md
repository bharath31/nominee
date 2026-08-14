# Governed MCP server in ten minutes

MCP OAuth (and Enterprise-Managed Authorization) authorizes the **connection**:
which client may talk to which server. It says nothing about **which tool
arguments may execute** once that connection is open. Nominee is the action
layer: `allow` / `ask` / `deny` on the exact call, before the handler runs.

This is blast-radius containment, not detection. A hijacked model can still
*ask* to forward the inbox. The deny rule still stops the tool.

Do not say nominee "stops prompt injection." The model can be successfully
hijacked; the exfiltration still does not execute.

## 1. Install

```bash
npm install nominee nominee-mcp @modelcontextprotocol/sdk zod
```

## 2. Wrap each mutating tool

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { Nominee, allow, ask, deny } from 'nominee'
import { mcpEndUser, registerNomineeTool } from 'nominee-mcp'
import { z } from 'zod'

const nominee = new Nominee({
  policy: {
    rules: [
      allow('email.read'),
      deny('email.forward', { reason: 'external forwarding is exfiltration' }),
      ask('email.delete'),
    ],
    fallback: 'deny',
  },
})

const server = new McpServer({ name: 'inbox-tools', version: '1.0.0' })

registerNomineeTool(server, {
  name: 'forward_email',
  description: 'Forward one email',
  action: 'email.forward',
  inputSchema: z.object({ to: z.string(), id: z.string() }),
  nominee,
  // clientId is the OAuth application, shared by every end user. Prefer
  // extra.sub from your auth layer; stdio with no authInfo may use a fallback.
  user: ({ extra }) => mcpEndUser(extra, 'local-stdio-user'),
  execute: async ({ to, id }) => {
    await forward(id, to)
    return { content: [{ type: 'text', text: `Forwarded ${id}` }] }
  },
})

await server.connect(new StdioServerTransport())
```

`registerNomineeTool` uses `inputSchema` (not `schema`) and requires `nominee`
and `user`. Set `connection` to fetch a fresh token at execution time. Resolvers
for `user`, `resource`, `tenant`, and `connection` may depend on the MCP request.

## 3. Prove the deny before you trust the server

The runnable proof is [`examples/prompt-injection-blocked`](../../examples/prompt-injection-blocked):
an email tells the agent to forward the inbox; the model obeys; `email.forward`
is denied before the mailer runs. Same boundary as an MCP tool handler.

```bash
pnpm --filter prompt-injection-blocked demo
```

## 4. Durable approvals

MCP's high-level `McpServer` catches thrown errors and turns them into
`CallToolResult { isError: true }`. `registerNomineeTool` therefore converts
`ActionPendingError` into a structured result:

```ts
{
  isError: true,
  structuredContent: { nominee: 'pending_approval', actionId, approvalId }
}
```

Persist **both** `actionId` and the original tool input (the durable action
record stores only `inputHash`). After approval:

```ts
await nominee.resolveActionApproval(actionId, { decision: 'approved', approver, via })
const resumed = await nominee.resumeAction(actionId)
await nominee.executeCapability(resumed.capability, originalInput, execute)
```

The low-level `nomineeMcpHandler()` still throws `ActionPendingError` if you
need the exception at a custom transport. Denied calls never reach `execute`.

For Postgres-backed production wiring see
[`examples/mcp-action-server`](../../examples/mcp-action-server).

## 5. Observe first (optional)

```ts
const nominee = new Nominee({ mode: 'observe' })
```

`registerNomineeTool` still routes through `run()`, but asks and denies are
recorded rather than enforced. Observe mode is not a security control and cannot
be combined with `production: true`.

## Registry

A draft `server.json` for the reference server lives at
[`examples/mcp-action-server/server.json`](../../examples/mcp-action-server/server.json).
Publishing to the official MCP registry is a separate authenticated step — see
[`docs/placements/mcp-registry.md`](../placements/mcp-registry.md).
