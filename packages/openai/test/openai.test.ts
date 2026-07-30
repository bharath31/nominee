import { RunContext } from '@openai/agents'
import { Nominee, allow, ask } from 'nominee'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { nomineeTool } from '../src/index.js'

describe('nominee-openai', () => {
  it('executes an allowed OpenAI tool through a single-use action', async () => {
    const execute = vi.fn(async (input: { issue: number }) => ({ closed: input.issue }))
    const tool = nomineeTool({
      name: 'issue_close',
      description: 'Close an issue',
      parameters: z.object({ issue: z.number() }),
      nominee: new Nominee({ policy: [allow('issue.close')] }),
      action: 'issue.close',
      user: ({ context }) => context.context.user,
      execute,
    })
    const context = new RunContext({ user: 'user-1' })

    await expect(tool.invoke(context, JSON.stringify({ issue: 42 }))).resolves.toEqual({
      closed: 42,
    })
    expect(execute).toHaveBeenCalledOnce()
  })

  it('maps Nominee ask rules to native OpenAI approval and records the approval', async () => {
    const nominee = new Nominee({ policy: [ask('wire.send')] })
    const tool = nomineeTool({
      name: 'wire_send',
      description: 'Send a wire',
      parameters: z.object({ cents: z.number() }),
      nominee,
      action: 'wire.send',
      user: 'user-1',
      execute: async () => 'sent',
    })
    const context = new RunContext({ user: 'user-1' })
    expect(await tool.needsApproval(context, { cents: 500 }, 'call-1')).toBe(true)

    const approvedContext = {
      ...context,
      isToolApproved: ({ callId }: { toolName: string; callId: string }) => callId === 'call-1',
    } as RunContext<{ user: string }>
    await expect(
      tool.invoke(approvedContext, JSON.stringify({ cents: 500 }), {
        toolCall: {
          type: 'function_call',
          callId: 'call-1',
          name: 'wire_send',
          arguments: JSON.stringify({ cents: 500 }),
        },
      }),
    ).resolves.toBe('sent')
    expect(nominee.receipts.map((receipt) => receipt.type)).toContain('approval.resolved')
  })

  it('never executes a denied tool', async () => {
    const execute = vi.fn()
    const tool = nomineeTool({
      name: 'repo_delete',
      description: 'Delete a repository',
      parameters: z.object({ repo: z.string() }),
      nominee: new Nominee({
        policy: { rules: [], fallback: 'deny' },
      }),
      user: 'user-1',
      execute,
    })

    await expect(
      tool.invoke(new RunContext(), JSON.stringify({ repo: 'acme/api' })),
    ).rejects.toThrow(/policy denied/)
    expect(execute).not.toHaveBeenCalled()
  })
})
