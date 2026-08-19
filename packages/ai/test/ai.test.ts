import {
  ActionPendingError,
  AuthorizationInputChangedError,
  Memory,
  Nominee,
  PolicyDeniedError,
  allow,
  ask,
  deny,
} from 'nominee'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { guardTools, nomineeTool, withNominee } from '../src/index.js'

// Minimal stand-in for the AI SDK's ToolCallOptions.
const fakeOptions = { toolCallId: 'call_1', messages: [] } as never

function makeNominee(over: Partial<ConstructorParameters<typeof Nominee>[0]> = {}) {
  return new Nominee({
    strategy: Memory({ tokens: { u1: { github: 'gh_tok_123' } } }),
    ...over,
  })
}

// AI SDK tools may carry execute as optional; tests invoke it directly.
function exec(tool: { execute?: (...args: any[]) => any }, input: unknown) {
  if (typeof tool.execute !== 'function') throw new Error('tool has no execute')
  return tool.execute(input, fakeOptions)
}

describe('nominee-ai', () => {
  it('produces an AI SDK tool with description + execute', () => {
    const tool = nomineeTool({
      nominee: makeNominee(),
      user: 'u1',
      description: 'noop',
      inputSchema: z.object({ x: z.number() }),
      execute: async ({ x }) => x,
    })
    expect(tool.description).toBe('noop')
    expect(typeof tool.execute).toBe('function')
  })

  it('injects a fresh token for the connection', async () => {
    let seen: string | undefined
    const tool = nomineeTool({
      nominee: makeNominee(),
      user: 'u1',
      connection: 'github',
      description: 'use gh',
      inputSchema: z.object({ repo: z.string() }),
      execute: async (_input, { token }) => {
        seen = token
        return 'ok'
      },
    })
    await exec(tool, { repo: 'a/b' })
    expect(seen).toBe('gh_tok_123')
  })

  it('resolves the user from a function of the tool-call options', async () => {
    let seenUser: string | undefined
    const tool = nomineeTool({
      nominee: makeNominee(),
      user: (options) => (options.toolCallId === 'call_1' ? 'u1' : 'other'),
      description: 'whoami',
      inputSchema: z.object({}),
      execute: async (_input, { user }) => {
        seenUser = user
        return user
      },
    })
    await exec(tool, {})
    expect(seenUser).toBe('u1')
  })

  it('requires approval before execute and proceeds when approved', async () => {
    const executed = vi.fn(async () => 'done')
    const nominee = makeNominee({
      onApprovalRequest: (req) => {
        nominee.resolveApproval(req.id, 'approved')
      },
    })
    const tool = nomineeTool({
      nominee,
      user: 'u1',
      approval: true,
      action: 'close_issue',
      description: 'close',
      inputSchema: z.object({ issue: z.number() }),
      execute: executed,
    })
    await expect(exec(tool, { issue: 1 })).resolves.toBe('done')
    expect(executed).toHaveBeenCalledOnce()
  })

  it('aborts execute when approval is denied', async () => {
    const executed = vi.fn(async () => 'done')
    const nominee = makeNominee({
      onApprovalRequest: (req) => {
        nominee.resolveApproval(req.id, 'denied')
      },
    })
    const tool = nomineeTool({
      nominee,
      user: 'u1',
      approval: true,
      description: 'danger',
      inputSchema: z.object({}),
      execute: executed,
    })
    await expect(exec(tool, {})).rejects.toThrow(/approval denied/)
    expect(executed).not.toHaveBeenCalled()
  })

  it('aborts execute when input changes while approval is pending', async () => {
    const input = { issue: 1 }
    const executed = vi.fn(async () => 'done')
    const nominee = makeNominee({
      policy: [ask('close_issue')],
      onApprovalRequest: (req) => {
        input.issue = 999
        req.approve()
      },
    })
    const tool = nomineeTool({
      nominee,
      user: 'u1',
      action: 'close_issue',
      description: 'close',
      inputSchema: z.object({ issue: z.number() }),
      execute: executed,
    })

    await expect(exec(tool, input)).rejects.toBeInstanceOf(AuthorizationInputChangedError)
    expect(executed).not.toHaveBeenCalled()
  })

  it('withNominee binds the instance and default user', async () => {
    const tool = withNominee(makeNominee(), { user: 'u1' })({
      connection: 'github',
      description: 'bound',
      inputSchema: z.object({}),
      execute: async (_input, { token, user }) => `${user}:${token}`,
    })
    await expect(exec(tool, {})).resolves.toBe('u1:gh_tok_123')
  })

  it('enforces a deny rule on nomineeTool via its action name', async () => {
    const executed = vi.fn(async () => 'done')
    const nominee = makeNominee({
      policy: { rules: [deny('repo.delete')], fallback: 'allow' },
    })
    const tool = nomineeTool({
      nominee,
      user: 'u1',
      action: 'repo.delete',
      description: 'delete a repo',
      inputSchema: z.object({ repo: z.string() }),
      execute: executed,
    })
    await expect(exec(tool, { repo: 'a/b' })).rejects.toBeInstanceOf(PolicyDeniedError)
    expect(executed).not.toHaveBeenCalled()
  })

  it('guardTools wraps a whole tools object, keyed by tool name', async () => {
    const nominee = makeNominee({
      policy: { rules: [allow('search'), deny('exfiltrate')], fallback: 'deny' },
    })
    const search = vi.fn(async ({ q }: { q: string }) => `hits: ${q}`)
    const exfiltrate = vi.fn(async () => 'secrets')
    const tools = guardTools(
      nominee,
      {
        search: { description: 's', inputSchema: z.object({ q: z.string() }), execute: search },
        exfiltrate: { description: 'x', inputSchema: z.object({}), execute: exfiltrate },
      } as never,
      { user: 'u1' },
    ) as {
      search: { description?: string; execute?: (...args: unknown[]) => unknown }
      exfiltrate: { description?: string; execute?: (...args: unknown[]) => unknown }
    }

    expect(tools.search.description).toBe('s')
    await expect(exec(tools.search, { q: 'a' })).resolves.toBe('hits: a')
    await expect(exec(tools.exfiltrate, {})).rejects.toBeInstanceOf(PolicyDeniedError)
    expect(exfiltrate).not.toHaveBeenCalled()
    // Refusal is on the receipt chain.
    expect(nominee.receipts.at(-1)?.effect).toBe('deny')
    expect(nominee.verifyReceipts().ok).toBe(true)
  })

  it('guardTools passes a tenant resolver into policy when-clauses', async () => {
    const nominee = makeNominee({
      policy: {
        rules: [allow('search', { when: ({ tenant }) => tenant === 'acme' })],
        fallback: 'deny',
      },
    })
    const search = vi.fn(async () => 'hits')
    const tools = guardTools(nominee, { search: { execute: search } } as never, {
      user: 'u1',
      tenant: (input) => (input as { org: string }).org,
    }) as { search: { execute: (...args: unknown[]) => unknown } }

    await expect(exec(tools.search, { org: 'acme' })).resolves.toBe('hits')
    expect(search).toHaveBeenCalledOnce()
    await expect(exec(tools.search, { org: 'globex' })).rejects.toBeInstanceOf(PolicyDeniedError)
    expect(search).toHaveBeenCalledTimes(1)
  })

  it('guardTools passes a resource resolver into policy when-clauses', async () => {
    const nominee = makeNominee({
      policy: {
        rules: [allow('doc.read', { when: ({ resource }) => resource === 'doc:42' })],
        fallback: 'deny',
      },
    })
    const readDoc = vi.fn(async () => 'content')
    const tools = guardTools(nominee, { 'doc.read': { execute: readDoc } } as never, {
      user: 'u1',
      resource: (input) => `doc:${(input as { id: number }).id}`,
    }) as { 'doc.read': { execute: (...args: unknown[]) => unknown } }

    await expect(exec(tools['doc.read'], { id: 42 })).resolves.toBe('content')
    expect(readDoc).toHaveBeenCalledOnce()
    await expect(exec(tools['doc.read'], { id: 43 })).rejects.toBeInstanceOf(PolicyDeniedError)
    expect(readDoc).toHaveBeenCalledTimes(1)
  })

  it('guardTools accepts a static tenant value (no resolver)', async () => {
    const nominee = makeNominee({
      policy: {
        rules: [allow('search', { when: ({ tenant }) => tenant === 'acme' })],
        fallback: 'deny',
      },
    })
    const search = vi.fn(async () => 'hits')
    const tools = guardTools(nominee, { search: { execute: search } } as never, {
      user: 'u1',
      tenant: 'acme',
    }) as { search: { execute: (...args: unknown[]) => unknown } }

    await expect(exec(tools.search, { q: 'anything' })).resolves.toBe('hits')
    expect(search).toHaveBeenCalledOnce()
  })

  it('guardTools accepts a static resource value (no resolver)', async () => {
    const nominee = makeNominee({
      policy: {
        rules: [allow('doc.read', { when: ({ resource }) => resource === 'doc:42' })],
        fallback: 'deny',
      },
    })
    const readDoc = vi.fn(async () => 'content')
    const tools = guardTools(nominee, { 'doc.read': { execute: readDoc } } as never, {
      user: 'u1',
      resource: 'doc:42',
    }) as { 'doc.read': { execute: (...args: unknown[]) => unknown } }

    await expect(exec(tools['doc.read'], { id: 1 })).resolves.toBe('content')
    expect(readDoc).toHaveBeenCalledOnce()
  })

  it('guardTools surfaces ActionPendingError when an ask outlives the request', async () => {
    const nominee = makeNominee({ policy: [ask('close_issue')] })
    const closeIssue = vi.fn(async () => 'done')
    const tools = guardTools(nominee, { close_issue: { execute: closeIssue } } as never, {
      user: 'u1',
    }) as { close_issue: { execute: (...args: unknown[]) => unknown } }

    await expect(exec(tools.close_issue, { issue: 1 })).rejects.toBeInstanceOf(ActionPendingError)
    expect(closeIssue).not.toHaveBeenCalled()
  })

  it('guardTools aborts execute when input changes after approval', async () => {
    const input = { issue: 1 }
    const closeIssue = vi.fn(async () => 'done')
    const nominee = makeNominee({
      policy: [ask('close_issue')],
      onApprovalRequest: (req) => {
        input.issue = 999
        req.approve()
      },
    })
    const tools = guardTools(nominee, { close_issue: { execute: closeIssue } } as never, {
      user: 'u1',
    }) as { close_issue: { execute: (...args: unknown[]) => unknown } }

    await expect(exec(tools.close_issue, input)).rejects.toBeInstanceOf(
      AuthorizationInputChangedError,
    )
    expect(closeIssue).not.toHaveBeenCalled()
  })

  it('guardTools forwards connection and scopes to the tokens strategy', async () => {
    const getToken = vi.fn(
      async (_params: { user: string; connection: string; scopes?: string[] }) => ({
        token: 'gh_via_guard',
      }),
    )
    const nominee = new Nominee({
      strategy: { name: 'spy', getToken },
      policy: { rules: [allow('search')], fallback: 'deny' },
    })
    const search = vi.fn(async () => 'hits')
    const tools = guardTools(nominee, { search: { execute: search } } as never, {
      user: 'u1',
      connection: 'github',
      scopes: ['repo'],
    }) as { search: { execute: (...args: unknown[]) => unknown } }

    await expect(exec(tools.search, {})).resolves.toBe('hits')
    expect(search).toHaveBeenCalledOnce()
    expect(getToken).toHaveBeenCalledOnce()
    expect(getToken.mock.calls[0]?.[0]).toMatchObject({
      user: 'u1',
      connection: 'github',
      scopes: ['repo'],
    })
  })
})
