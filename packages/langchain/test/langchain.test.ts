import { ActionPendingError, Memory, Nominee, PolicyDeniedError, allow, ask } from 'nominee'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { nomineeTool, withNominee } from '../src/index.js'

function makeNominee(over: Partial<ConstructorParameters<typeof Nominee>[0]> = {}) {
  return new Nominee({
    strategy: Memory({ tokens: { 'user-1': { github: 'gh_tok_123' } } }),
    ...over,
  })
}

describe('nominee-langchain', () => {
  it('executes an allowed LangChain tool through Nominee', async () => {
    const execute = vi.fn(
      async (input: { transactionId: string }) => `Refunded ${input.transactionId}`,
    )
    const refund = nomineeTool({
      name: 'payments_refund',
      description: 'Refund a payment',
      schema: z.object({ transactionId: z.string() }),
      nominee: makeNominee({ policy: [allow('payments.refund')] }),
      action: 'payments.refund',
      user: 'user-1',
      resource: ({ input }) => `payment:${input.transactionId}`,
      execute,
    })

    await expect(refund.invoke({ transactionId: 'tx-1' })).resolves.toBe('Refunded tx-1')
    expect(execute).toHaveBeenCalledOnce()
  })

  it('injects a fresh token for the connection', async () => {
    let seen: string | undefined
    const tool = nomineeTool({
      name: 'issue_close',
      description: 'Close an issue',
      schema: z.object({ repo: z.string() }),
      nominee: makeNominee({ policy: [allow('github.issue.close')] }),
      action: 'github.issue.close',
      user: 'user-1',
      connection: 'github',
      execute: async (_input, { token }) => {
        seen = token
        return 'ok'
      },
    })

    await tool.invoke({ repo: 'acme/api' })
    expect(seen).toBe('gh_tok_123')
  })

  it('resolves the user from LangChain runnable config metadata', async () => {
    let seenUser: string | undefined
    const tool = nomineeTool({
      name: 'whoami',
      description: 'Echo the principal',
      schema: z.object({}),
      nominee: makeNominee({ policy: [allow('whoami')] }),
      action: 'whoami',
      user: ({ config }) => String(config?.metadata?.userId ?? ''),
      execute: async (_input, { user }) => {
        seenUser = user
        return user
      },
    })

    await tool.invoke({}, { metadata: { userId: 'user-1' } })
    expect(seenUser).toBe('user-1')
  })

  it('never executes a denied LangChain tool', async () => {
    const execute = vi.fn()
    const tool = nomineeTool({
      name: 'repo_delete',
      description: 'Delete a repo',
      schema: z.object({ repo: z.string() }),
      nominee: makeNominee({ policy: { rules: [], fallback: 'deny' } }),
      user: 'user-1',
      execute,
    })

    await expect(tool.invoke({ repo: 'acme/api' })).rejects.toBeInstanceOf(PolicyDeniedError)
    expect(execute).not.toHaveBeenCalled()
  })

  it('surfaces ActionPendingError for ask without an inline handler', async () => {
    const execute = vi.fn()
    const tool = nomineeTool({
      name: 'wire_send',
      description: 'Send a wire',
      schema: z.object({ cents: z.number() }),
      nominee: makeNominee({ policy: [ask('wire.send')] }),
      action: 'wire.send',
      user: 'user-1',
      execute,
    })

    await expect(tool.invoke({ cents: 500 })).rejects.toBeInstanceOf(ActionPendingError)
    expect(execute).not.toHaveBeenCalled()
  })

  it('withNominee supplies nominee and a default user', async () => {
    const bound = withNominee(makeNominee({ policy: [allow('ping')] }), { user: 'user-1' })
    const ping = bound({
      name: 'ping',
      description: 'Ping',
      schema: z.object({ n: z.number() }),
      action: 'ping',
      execute: async ({ n }) => n,
    })
    await expect(ping.invoke({ n: 7 })).resolves.toBe(7)
  })
})
