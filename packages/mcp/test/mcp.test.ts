import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { ActionPendingError, Nominee, allow, ask } from 'nominee'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import {
  type McpToolExtra,
  isNomineePendingResult,
  mcpEndUser,
  nomineeMcpHandler,
  registerNomineeTool,
} from '../src/index.js'

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

  it('mcpEndUser refuses OAuth clientId as the application user', () => {
    expect(mcpEndUser(extra, 'local-stdio-user')).toBe('local-stdio-user')
    const withClient = {
      ...extra,
      authInfo: { token: 't', clientId: 'oauth-app', scopes: [] },
    } as unknown as McpToolExtra
    expect(() => mcpEndUser(withClient, 'local-stdio-user')).toThrow(/end-user subject/)
    const withSub = {
      ...extra,
      authInfo: {
        token: 't',
        clientId: 'oauth-app',
        scopes: [],
        extra: { sub: 'user-99' },
      },
    } as unknown as McpToolExtra
    expect(mcpEndUser(withSub)).toBe('user-99')
  })

  it('turns ActionPendingError into a structured MCP result on McpServer', async () => {
    const execute = vi.fn()
    let captured: ((input: { issue: number }, extra: McpToolExtra) => Promise<unknown>) | undefined
    const server = {
      registerTool: (
        _name: string,
        _def: unknown,
        handler: (input: { issue: number }, extra: McpToolExtra) => Promise<unknown>,
      ) => {
        captured = handler
        return { enabled: true }
      },
    } as unknown as McpServer

    registerNomineeTool(server, {
      name: 'close_issue',
      inputSchema: z.object({ issue: z.number() }),
      nominee: new Nominee({
        policy: { rules: [ask('issue.close')], fallback: 'deny' },
      }),
      action: 'issue.close',
      user: 'user-1',
      execute,
    })

    const result = (await captured?.({ issue: 1 }, extra)) as {
      isError?: boolean
      structuredContent?: unknown
    }
    expect(execute).not.toHaveBeenCalled()
    expect(isNomineePendingResult(result as never)).toBe(true)
    expect((result.structuredContent as { actionId: string }).actionId).toMatch(/^act_/)

    const lowLevel = nomineeMcpHandler({
      name: 'close_issue',
      inputSchema: z.object({ issue: z.number() }),
      nominee: new Nominee({
        policy: { rules: [ask('issue.close')], fallback: 'deny' },
      }),
      action: 'issue.close',
      user: 'user-1',
      execute,
    })
    await expect(lowLevel({ issue: 1 }, extra)).rejects.toBeInstanceOf(ActionPendingError)
  })
})
