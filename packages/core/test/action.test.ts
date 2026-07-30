import { describe, expect, it, vi } from 'vitest'
import {
  ActionOutcomePersistenceError,
  ActionPendingError,
  type ActionStore,
  type AtomicReceiptStore,
  AuthorizationInputChangedError,
  CapabilityInvalidError,
  ExternalAuthorizationDeniedError,
  type GetTokenParams,
  MemoryActionStore,
  MemoryAtomicReceiptStore,
  Nominee,
  ReceiptLedger,
  allow,
  ask,
} from '../src/index.js'

describe('decision-bound actions', () => {
  it('binds resource authorization and credentials to one exact execution', async () => {
    const authorize = vi.fn(async () => true)
    const getToken = vi.fn(async (_params: GetTokenParams) => ({
      token: 'fresh-token',
      scopes: ['issues:write'],
    }))
    const governed = vi.fn()
    const nominee = new Nominee({
      policy: { rules: [allow('issue.close')], fallback: 'deny' },
      policyVersion: 'policy-42',
      authorizer: authorize,
      strategy: { name: 'broker', getToken },
      onGovernedAction: governed,
    })

    await expect(
      nominee.run(
        {
          tool: 'issue.close',
          user: 'user-1',
          tenant: 'acme',
          resource: 'repo:acme/api#42',
          input: { reason: 'fixed' },
          connection: 'github',
          scopes: ['issues:write'],
        },
        async ({ action, token }) => ({ actionId: action.id, token }),
      ),
    ).resolves.toMatchObject({ token: 'fresh-token' })

    expect(authorize).toHaveBeenCalledWith(
      expect.objectContaining({
        user: 'user-1',
        action: 'issue.close',
        resource: 'repo:acme/api#42',
        tenant: 'acme',
      }),
    )
    expect(getToken).toHaveBeenCalledWith(
      expect.objectContaining({
        user: 'user-1',
        connection: 'github',
        scopes: ['issues:write'],
        authorization: expect.objectContaining({
          action: 'issue.close',
          resource: 'repo:acme/api#42',
          tenant: 'acme',
          policyVersion: 'policy-42',
        }),
      }),
    )
    expect(governed).toHaveBeenCalledOnce()
    expect(governed).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'issue.close', status: 'succeeded' }),
    )
    expect(nominee.receipts.map((receipt) => receipt.type)).toContain('execution.succeeded')
  })

  it('rechecks resource authorization after approval and before execution', async () => {
    const authorize = vi
      .fn<(params: { resource: string }) => Promise<boolean>>()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
    const store = new MemoryActionStore()
    const execute = vi.fn(async () => 'closed')
    const nominee = new Nominee({
      actionStore: store,
      policy: { rules: [allow('issue.close')], fallback: 'deny' },
      authorizer: authorize,
    })

    await expect(
      nominee.run(
        {
          tool: 'issue.close',
          user: 'user-1',
          resource: 'repo:acme/api#42',
          input: { reason: 'fixed' },
        },
        execute,
      ),
    ).rejects.toBeInstanceOf(ExternalAuthorizationDeniedError)
    expect(authorize).toHaveBeenCalledTimes(2)
    expect(execute).not.toHaveBeenCalled()
    await expect(store.listRecent()).resolves.toEqual([
      expect.objectContaining({
        status: 'failed',
        outcome: expect.objectContaining({
          error: expect.stringContaining('external authorization denied'),
        }),
      }),
    ])
  })

  it('executes a single-use capability exactly once under concurrency', async () => {
    const nominee = new Nominee({
      policy: { rules: [allow('charge.capture')], fallback: 'deny' },
    })
    const prepared = await nominee.prepareAction({
      tool: 'charge.capture',
      user: 'user-1',
      input: { payment: 'pay_1' },
    })
    expect(prepared.status).toBe('ready')
    if (prepared.status !== 'ready') throw new Error('expected a ready action')

    const execute = vi.fn(async () => 'captured')
    const attempts = await Promise.allSettled(
      Array.from({ length: 20 }, () =>
        nominee.executeCapability(prepared.capability, { payment: 'pay_1' }, execute),
      ),
    )

    expect(attempts.filter((attempt) => attempt.status === 'fulfilled')).toHaveLength(1)
    expect(
      attempts
        .filter((attempt): attempt is PromiseRejectedResult => attempt.status === 'rejected')
        .every((attempt) => attempt.reason instanceof CapabilityInvalidError),
    ).toBe(true)
    expect(execute).toHaveBeenCalledOnce()
  })

  it('rejects tool input changed after policy evaluation', async () => {
    const nominee = new Nominee({ policy: [allow('email.send')] })
    const prepared = await nominee.prepareAction({
      tool: 'email.send',
      user: 'user-1',
      input: { to: 'finance@acme.com', amount: 10 },
    })
    if (prepared.status !== 'ready') throw new Error('expected a ready action')
    const execute = vi.fn()

    await expect(
      nominee.executeCapability(
        prepared.capability,
        { to: 'attacker.example', amount: 10 },
        execute,
      ),
    ).rejects.toBeInstanceOf(AuthorizationInputChangedError)
    expect(execute).not.toHaveBeenCalled()
  })

  it('fails closed and terminates the action when policy evaluation throws', async () => {
    const store = new MemoryActionStore()
    const governed = vi.fn()
    const nominee = new Nominee({
      actionStore: store,
      policy: [
        allow('payment.capture', {
          when: () => {
            throw new Error('policy backend unavailable')
          },
        }),
      ],
      onGovernedAction: governed,
    })

    await expect(
      nominee.prepareAction({
        tool: 'payment.capture',
        user: 'user-1',
        input: { payment: 'pay_1' },
      }),
    ).rejects.toThrow('policy backend unavailable')
    await expect(store.listRecent()).resolves.toEqual([
      expect.objectContaining({
        status: 'denied',
        policyReason: 'policy evaluation failed: policy backend unavailable',
      }),
    ])
    expect(governed).toHaveBeenCalledWith(expect.objectContaining({ status: 'denied' }))
  })

  it('rejects a non-boolean resource authorization decision', async () => {
    const store = new MemoryActionStore()
    const nominee = new Nominee({
      actionStore: store,
      policy: [allow('issue.close')],
      authorizer: async () => undefined as unknown as boolean,
    })

    await expect(
      nominee.prepareAction({
        tool: 'issue.close',
        user: 'user-1',
        resource: 'repo:acme/api#42',
      }),
    ).rejects.toThrow(/non-boolean decision/)
    await expect(store.listRecent()).resolves.toEqual([
      expect.objectContaining({
        status: 'denied',
        policyReason: expect.stringContaining('external authorization failed'),
      }),
    ])
  })

  it('reserves budgets across nominee instances sharing the store', async () => {
    const store = new MemoryActionStore()
    const options = {
      actionStore: store,
      policy: { rules: [allow('search', { max: 1 })], fallback: 'deny' as const },
      policyVersion: 'v1',
    }
    const first = new Nominee(options)
    const second = new Nominee(options)

    await first.run({ tool: 'search', user: 'user-1', input: { q: 'one' } }, async () => 'one')
    const next = await second.prepareAction({
      tool: 'search',
      user: 'user-1',
      input: { q: 'two' },
    })

    expect(next.status).toBe('pending_approval')
    expect(next.action.policyReason).toMatch(/budget of 1 calls exhausted/)
  })

  it('isolates durable budgets for the same local user id across tenants', async () => {
    const store = new MemoryActionStore()
    const options = {
      actionStore: store,
      policy: { rules: [allow('search', { max: 1 })], fallback: 'deny' as const },
      policyVersion: 'v1',
    }

    await new Nominee(options).run(
      { tool: 'search', user: 'user-1', tenant: 'acme', input: { q: 'one' } },
      async () => 'one',
    )
    await expect(
      new Nominee(options).run(
        { tool: 'search', user: 'user-1', tenant: 'globex', input: { q: 'two' } },
        async () => 'two',
      ),
    ).resolves.toBe('two')
  })

  it('resumes a manually approved action from another nominee instance', async () => {
    const store = new MemoryActionStore()
    const first = new Nominee({ actionStore: store, policy: [ask('wire.send')] })
    const second = new Nominee({ actionStore: store, policy: [ask('wire.send')] })
    const pending = await first.prepareAction({
      tool: 'wire.send',
      user: 'user-1',
      input: { cents: 500 },
    })
    expect(pending.status).toBe('pending_approval')

    await second.resolveActionApproval(pending.action.id, {
      decision: 'approved',
      approver: 'manager-1',
      via: 'dashboard',
    })
    const resumed = await second.resumeAction(pending.action.id)
    if (resumed.status !== 'ready') throw new Error('expected a ready action')

    await expect(
      second.executeCapability(resumed.capability, { cents: 500 }, async () => 'sent'),
    ).resolves.toBe('sent')
    await expect(second.resumeAction(pending.action.id)).rejects.toThrow(/cannot be resumed/)
  })

  it('surfaces pending approval from the one-call run API', async () => {
    const nominee = new Nominee({ policy: [ask('wire.send')] })
    await expect(
      nominee.run({ tool: 'wire.send', user: 'user-1' }, async () => 'sent'),
    ).rejects.toBeInstanceOf(ActionPendingError)
  })

  it('accepts trusted approval evidence from an enclosing framework', async () => {
    const nominee = new Nominee({ policy: [ask('email.send')] })
    await expect(
      nominee.run(
        {
          tool: 'email.send',
          user: 'user-1',
          input: { to: 'outside.example' },
          frameworkApproval: { id: 'openai-call-1', via: 'openai-agents' },
        },
        async () => 'sent',
      ),
    ).resolves.toBe('sent')
    expect(nominee.receipts.filter((receipt) => receipt.type === 'approval.resolved')).toHaveLength(
      1,
    )
  })

  it('requires durable control-plane primitives in production mode', async () => {
    expect(
      () =>
        new Nominee({
          production: true,
          policy: { rules: [allow('read')], fallback: 'deny' },
        }),
    ).toThrow(/durable actionStore.*atomic durable receipt store.*strict/)

    const actionStore = durableProxy<ActionStore>(new MemoryActionStore())
    const receiptStore = durableProxy<AtomicReceiptStore>(new MemoryAtomicReceiptStore())
    const nominee = new Nominee({
      production: true,
      policy: { rules: [allow('read')], fallback: 'deny' },
      actionStore,
      receipts: { store: receiptStore, delivery: 'strict' },
    })
    await expect(nominee.authorize({ tool: 'read', user: 'user-1' })).rejects.toThrow(
      /not decision-bound/,
    )
  })

  it('requires an actual deny fallback and preserves production mode through delegation', async () => {
    const actionStore = durableProxy<ActionStore>(new MemoryActionStore())
    const receiptStore = durableProxy<AtomicReceiptStore>(new MemoryAtomicReceiptStore())
    expect(
      () =>
        new Nominee({
          production: true,
          policy: { rules: [allow('read')], fallback: 'ask' },
          actionStore,
          receipts: { store: receiptStore, delivery: 'strict' },
        }),
    ).toThrow(/default-deny policy/)

    const nominee = new Nominee({
      production: true,
      policy: { rules: [allow('read')], fallback: 'deny' },
      strategy: async () => 'root-token',
      actionStore,
      receipts: { store: receiptStore, delivery: 'strict' },
    })
    const child = nominee.delegate('researcher')
    await expect(child.authorize({ tool: 'read', user: 'user-1' })).rejects.toThrow(
      /not decision-bound/,
    )
    await expect(child.token({ user: 'user-1', connection: 'github' })).rejects.toThrow(
      /unbound token/,
    )
  })

  it('does not execute when required pre-execution evidence cannot be persisted', async () => {
    const nominee = new Nominee({
      policy: { rules: [allow('charge.capture')], fallback: 'deny' },
      receipts: {
        delivery: 'strict',
        onReceipt: (receipt) => {
          if (receipt.type === 'capability.consumed') throw new Error('receipt sink unavailable')
        },
      },
    })
    const prepared = await nominee.prepareAction({
      tool: 'charge.capture',
      user: 'user-1',
      input: { payment: 'pay_1' },
    })
    if (prepared.status !== 'ready') throw new Error('expected a ready action')
    const execute = vi.fn(async () => 'captured')

    await expect(
      nominee.executeCapability(prepared.capability, { payment: 'pay_1' }, execute),
    ).rejects.toMatchObject({
      name: 'ActionOutcomePersistenceError',
      actionId: prepared.action.id,
      executionStatus: 'failed',
    })
    expect(execute).not.toHaveBeenCalled()
    await expect(nominee.getAction(prepared.action.id)).resolves.toMatchObject({
      status: 'failed',
      outcome: { error: 'receipt persistence failed before tool execution' },
    })
  })

  it('reports a committed side effect whose success evidence could not be persisted', async () => {
    const nominee = new Nominee({
      policy: { rules: [allow('charge.capture')], fallback: 'deny' },
      receipts: {
        delivery: 'strict',
        onReceipt: (receipt) => {
          if (receipt.type === 'execution.succeeded') throw new Error('receipt sink unavailable')
        },
      },
    })
    const prepared = await nominee.prepareAction({
      tool: 'charge.capture',
      user: 'user-1',
      input: { payment: 'pay_1' },
    })
    if (prepared.status !== 'ready') throw new Error('expected a ready action')
    const execute = vi.fn(async () => 'captured')

    await expect(
      nominee.executeCapability(prepared.capability, { payment: 'pay_1' }, execute),
    ).rejects.toBeInstanceOf(ActionOutcomePersistenceError)
    expect(execute).toHaveBeenCalledOnce()
    await expect(nominee.getAction(prepared.action.id)).resolves.toMatchObject({
      status: 'succeeded',
      outcome: { resultHash: expect.any(String) },
    })
  })
})

describe('atomic receipt streams', () => {
  it('sequences concurrent writers into one verifiable chain', async () => {
    const store = new MemoryAtomicReceiptStore()
    const ledgers = Array.from(
      { length: 20 },
      () => new ReceiptLedger({ store, stream: 'tenant-1', key: 'secret' }),
    )

    await Promise.all(
      ledgers.map((ledger, index) =>
        ledger.appendAtomic({ type: 'test', user: `user-${index}`, input: { index } }),
      ),
    )
    const receipts = await store.list('tenant-1')

    expect(receipts.map((receipt) => receipt.seq)).toEqual(
      Array.from({ length: 20 }, (_, index) => index),
    )
    expect(await ledgers[0]?.verifyAtomic()).toEqual({ ok: true, checked: 20 })
  })
})

function durableProxy<T extends { readonly durable: boolean }>(target: T): T {
  return new Proxy(target, {
    get(object, property) {
      if (property === 'durable') return true
      const value = Reflect.get(object, property)
      return typeof value === 'function' ? value.bind(object) : value
    },
  })
}
