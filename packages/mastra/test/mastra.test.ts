import { RequestContext } from '@mastra/core/request-context'
import { ActionPendingError, Nominee, allow, ask } from 'nominee'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { nomineeTool } from '../src/index.js'

const executionContext = (userId = 'user-1') =>
  ({
    requestContext: new RequestContext([['userId', userId]]),
    observe: {
      span: async (_name: string, operation: () => unknown) => operation(),
      log: () => undefined,
    },
    agent: {
      agentId: 'agent-1',
      toolCallId: 'call-1',
      messages: [],
      suspend: async () => undefined,
    },
  }) as never

describe('nominee-mastra', () => {
  it('executes an allowed Mastra tool through Nominee', async () => {
    const execute = vi.fn(async (input: { issue: number }) => ({ closed: input.issue }))
    const tool = nomineeTool({
      id: 'issue-close',
      description: 'Close an issue',
      inputSchema: z.object({ issue: z.number() }),
      outputSchema: z.object({ closed: z.number() }),
      nominee: new Nominee({ policy: [allow('issue.close')] }),
      action: 'issue.close',
      user: ({ requestContext }) => String(requestContext.userId),
      execute,
    })

    await expect(tool.execute?.({ issue: 42 }, executionContext())).resolves.toEqual({
      closed: 42,
    })
    expect(execute).toHaveBeenCalledOnce()
  })

  it('can map Nominee ask rules to Mastra native approval', async () => {
    const nominee = new Nominee({ policy: [ask('wire.send')] })
    const tool = nomineeTool({
      id: 'wire-send',
      description: 'Send a wire',
      inputSchema: z.object({ cents: z.number() }),
      outputSchema: z.object({ sent: z.boolean() }),
      nominee,
      action: 'wire.send',
      user: 'user-1',
      nativeApprovals: true,
      execute: async () => ({ sent: true }),
    })
    const needsApproval =
      typeof tool.requireApproval === 'function'
        ? await tool.requireApproval({ cents: 500 })
        : tool.requireApproval
    expect(needsApproval).toBe(true)
    await expect(tool.execute?.({ cents: 500 }, executionContext())).resolves.toEqual({
      sent: true,
    })
    expect(nominee.receipts.map((receipt) => receipt.type)).toContain('approval.resolved')
  })

  it('does not infer native approval without a Mastra agent tool-call id', async () => {
    const execute = vi.fn(async () => ({ sent: true }))
    const tool = nomineeTool({
      id: 'wire-send',
      description: 'Send a wire',
      inputSchema: z.object({ cents: z.number() }),
      outputSchema: z.object({ sent: z.boolean() }),
      nominee: new Nominee({ policy: [ask('wire.send')] }),
      action: 'wire.send',
      user: 'user-1',
      nativeApprovals: true,
      execute,
    })
    const context = {
      requestContext: new RequestContext(),
      observe: {
        span: async (_name: string, operation: () => unknown) => operation(),
        log: () => undefined,
      },
    } as never

    await expect(tool.execute?.({ cents: 500 }, context)).rejects.toBeInstanceOf(ActionPendingError)
    expect(execute).not.toHaveBeenCalled()
  })

  it('never executes a denied Mastra tool', async () => {
    const execute = vi.fn()
    const tool = nomineeTool({
      id: 'repo-delete',
      description: 'Delete a repo',
      inputSchema: z.object({ repo: z.string() }),
      nominee: new Nominee({ policy: { rules: [], fallback: 'deny' } }),
      user: 'user-1',
      execute,
    })

    await expect(tool.execute?.({ repo: 'acme/api' }, executionContext())).rejects.toThrow(
      /policy denied/,
    )
    expect(execute).not.toHaveBeenCalled()
  })
})
