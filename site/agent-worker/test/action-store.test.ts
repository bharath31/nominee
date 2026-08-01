import { Nominee, allow, ask } from 'nominee'
import { describe, expect, it } from 'vitest'
import { DurableObjectActionStore, type ActionRecordStorage } from '../src/action-store.js'

/** Map-backed stand-in for DurableObjectStorage.get/put/delete. */
function fakeStorage(onPut?: (key: string) => void): ActionRecordStorage {
  const data = new Map<string, unknown>()
  return {
    async get<T>(key: string) {
      return data.get(key) as T | undefined
    },
    async put<T>(key: string, value: T) {
      onPut?.(key)
      data.set(key, value)
    },
    async delete(key: string) {
      return data.delete(key)
    },
  }
}

describe('DurableObjectActionStore', () => {
  it('runs an ask action through prepare -> resolve -> resume -> execute', async () => {
    const store = new DurableObjectActionStore(fakeStorage())
    const nominee = new Nominee({
      policy: { rules: [allow('github.read'), ask('gist.publish')], fallback: 'deny' },
      policyVersion: 'v1',
      actionStore: store,
      strategy: async () => 'fresh-github-token',
    })

    const input = { description: 'session', public: false }
    const prepared = await nominee.prepareAction({
      tool: 'gist.publish',
      input,
      user: 'user-1',
      connection: 'github',
      scopes: ['gist'],
    })
    expect(prepared.status).toBe('pending_approval')
    if (prepared.status !== 'pending_approval') throw new Error('unreachable')

    await nominee.resolveActionApproval(prepared.action.id, {
      decision: 'approved',
      approver: 'user-1',
      via: 'email',
    })

    const resumed = await nominee.resumeAction(prepared.action.id)
    expect(resumed.status).toBe('ready')
    if (resumed.status !== 'ready') throw new Error('unreachable')

    const result = await nominee.executeCapability(resumed.capability, input, async ({ token }) => {
      expect(token).toBe('fresh-github-token')
      return { published: true }
    })
    expect(result).toEqual({ published: true })

    const record = await store.get(prepared.action.id)
    expect(record?.status).toBe('succeeded')
  })

  it('denies and never issues a capability', async () => {
    const store = new DurableObjectActionStore(fakeStorage())
    const nominee = new Nominee({
      policy: { rules: [ask('gist.publish')], fallback: 'deny' },
      policyVersion: 'v1',
      actionStore: store,
    })

    const prepared = await nominee.prepareAction({
      tool: 'gist.publish',
      input: { description: 'session' },
      user: 'user-1',
    })
    if (prepared.status !== 'pending_approval') throw new Error('unreachable')

    await nominee.resolveActionApproval(prepared.action.id, { decision: 'denied', via: 'email' })
    const resumed = await nominee.resumeAction(prepared.action.id)
    expect(resumed.status).toBe('denied')

    const record = await store.get(prepared.action.id)
    expect(record?.status).toBe('denied')
    expect(record?.capability).toBeUndefined()
  })

  it('survives being reconstructed from the same storage, like a DO waking from hibernation', async () => {
    const storage = fakeStorage()
    const policy = { rules: [ask('gist.publish')], fallback: 'deny' as const }

    const first = new Nominee({ policy, policyVersion: 'v1', actionStore: new DurableObjectActionStore(storage) })
    const prepared = await first.prepareAction({
      tool: 'gist.publish',
      input: { description: 'session' },
      user: 'user-1',
    })
    if (prepared.status !== 'pending_approval') throw new Error('unreachable')

    // A fresh Nominee + store instance over the same storage, as the worker
    // reconstructs both on every wake.
    const second = new Nominee({
      policy,
      policyVersion: 'v1',
      actionStore: new DurableObjectActionStore(storage),
      strategy: async () => 'fresh-github-token',
    })
    await second.resolveActionApproval(prepared.action.id, { decision: 'approved', via: 'email' })
    const resumed = await second.resumeAction(prepared.action.id)
    expect(resumed.status).toBe('ready')
  })

  it('expires an action with reservations in one action-record write', async () => {
    const writes: string[] = []
    const store = new DurableObjectActionStore(fakeStorage((key) => writes.push(key)))
    await store.create({
      id: 'act_reserved_stale',
      version: 0,
      status: 'policy_checked',
      user: 'user-1',
      action: 'gist.publish',
      inputHash: 'hash',
      policyVersion: 'v1',
      createdAt: Date.now() - 1000,
      updatedAt: Date.now() - 1000,
      expiresAt: Date.now() - 1,
      budgets: [
        {
          key: 'user-1:gist.publish',
          limit: 1,
          actionId: 'act_reserved_stale',
          expiresAt: Date.now() - 1,
          state: 'reserved',
        },
      ],
    })
    writes.length = 0

    const record = await store.get('act_reserved_stale')

    expect(record?.status).toBe('expired')
    expect(record?.budgets).toEqual([])
    expect(writes).toEqual(['nominee:action:act_reserved_stale'])
  })

  it('transitions a stale pending action to expired on read', async () => {
    const store = new DurableObjectActionStore(fakeStorage())
    await store.create({
      id: 'act_stale',
      version: 0,
      status: 'pending_approval',
      user: 'user-1',
      action: 'gist.publish',
      inputHash: 'hash',
      policyVersion: 'v1',
      createdAt: Date.now() - 1000,
      updatedAt: Date.now() - 1000,
      expiresAt: Date.now() - 1,
    })

    const record = await store.get('act_stale')
    expect(record?.status).toBe('expired')
  })
})
