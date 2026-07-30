import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { Nominee, allow } from 'nominee'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { type McpToolExtra, nomineeMcpHandler, registerNomineeTool } from '../src/index.js'

const extra = {
  signal: new AbortController().signal,
  requestId: 1,
  sendNotification: async () => undefined,
  sendRequest: async () => {
    throw new Error('not implemented')
  },
} as unknown as McpToolExtra

describe('nominee-mcp', () => {
  it('executes an allowed MCP tool with a bound credential', async () => {
    const execute = vi.fn(async (_input: { issue: number }, context: { token?: string }) => ({
      content: [{ type: 'text' as const, text: context.token ?? 'missing' }],
    }))
    const handler = nomineeMcpHandler({
      name: 'issue_close',
      inputSchema: z.object({ issue: z.number() }),
      nominee: new Nominee({
        policy: [allow('issue.close')],
        strategy: async () => 'fresh-token',
      }),
      action: 'issue.close',
      user: 'user-1',
      connection: 'github',
      scopes: ['issues:write'],
      execute,
    })

    await expect(handler({ issue: 42 }, extra)).resolves.toEqual({
      content: [{ type: 'text', text: 'fresh-token' }],
    })
    expect(execute).toHaveBeenCalledOnce()
  })

  it('never executes a denied MCP tool', async () => {
    const execute = vi.fn()
    const handler = nomineeMcpHandler({
      name: 'repo_delete',
      inputSchema: z.object({ repo: z.string() }),
      nominee: new Nominee({ policy: { rules: [], fallback: 'deny' } }),
      user: 'user-1',
      execute,
    })

    await expect(handler({ repo: 'acme/api' }, extra)).rejects.toThrow(/policy denied/)
    expect(execute).not.toHaveBeenCalled()
  })

  it('registers on the current MCP SDK server API', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' })
    const registered = registerNomineeTool(server, {
      name: 'search',
      description: 'Search',
      inputSchema: z.object({ query: z.string() }),
      nominee: new Nominee({ policy: [allow('search')] }),
      user: 'user-1',
      execute: async ({ query }) => ({
        content: [{ type: 'text', text: query }],
      }),
    })

    expect(registered.enabled).toBe(true)
    expect(registered.description).toBe('Search')
  })
})
