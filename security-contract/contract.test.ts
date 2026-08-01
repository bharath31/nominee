import {
  ActionPendingError,
  ActionStateError,
  AuthorizationInputChangedError,
  CapabilityInvalidError,
  MemoryActionStore,
  MemoryAtomicReceiptStore,
  Nominee,
  PolicyDeniedError,
  allow,
  ask,
  deny,
} from 'nominee'
import { beforeEach, describe, expect, it } from 'vitest'

describe('Security Contract Suite', () => {
  let nominee: Nominee

  beforeEach(() => {
    nominee = new Nominee({
      policy: {
        rules: [
          deny('sensitive.op'),
          allow('safe.op'),
          ask('review.op'),
          allow('budget.op', { max: 1 }),
        ],
        fallback: 'deny',
      },
      agent: 'security-tester',
    })
  })

  it('deny-before-execute: denied operations throw before execution', async () => {
    await expect(
      nominee.authorize({
        tool: 'sensitive.op',
        input: { data: 'test' },
        user: 'u1',
      }),
    ).rejects.toThrow(PolicyDeniedError)
  })

  it('approval/input binding: input mutation after approval throws AuthorizationInputChangedError', async () => {
    const prepareRes = await nominee.prepareAction({
      tool: 'review.op',
      input: { query: 'test' },
      user: 'u1',
    })
    expect(prepareRes.status).toBe('pending_approval')
    if (prepareRes.status !== 'pending_approval') return

    await nominee.resolveActionApproval(prepareRes.action.id, {
      decision: 'approved',
      approver: 'admin',
      via: 'test',
    })

    const resumed = await nominee.resumeAction(prepareRes.action.id)
    expect(resumed.status).toBe('ready')
    if (resumed.status !== 'ready') return

    await expect(
      nominee.executeCapability(resumed.capability, { query: 'malicious' }, async () => {}),
    ).rejects.toThrow(AuthorizationInputChangedError)
  })

  it('capability single-use: capability expires after execution', async () => {
    const prepareRes = await nominee.prepareAction({
      tool: 'safe.op',
      input: { arg: 1 },
      user: 'u1',
    })

    expect(prepareRes.status).toBe('ready')
    if (prepareRes.status !== 'ready') return

    const capability = prepareRes.capability

    let ran = false
    await nominee.executeCapability(capability, { arg: 1 }, async () => {
      ran = true
    })
    expect(ran).toBe(true)

    await expect(nominee.executeCapability(capability, { arg: 1 }, async () => {})).rejects.toThrow(
      CapabilityInvalidError,
    )
  })

  it('cache separation: user and tool combinations are isolated', async () => {
    const res1 = await nominee.prepareAction({ tool: 'safe.op', input: {}, user: 'userA' })
    const res2 = await nominee.prepareAction({ tool: 'safe.op', input: {}, user: 'userB' })

    expect(res1.status).toBe('ready')
    expect(res2.status).toBe('ready')
    if (res1.status === 'ready' && res2.status === 'ready') {
      expect(res1.capability).not.toBe(res2.capability)
    }
  })

  it('atomic budgets: exhausted budget escalates or denies', async () => {
    // Budget limit is max: 1
    const res1 = await nominee.prepareAction({ tool: 'budget.op', input: {}, user: 'u1' })
    expect(res1.status).toBe('ready')
    if (res1.status !== 'ready') return

    // Actually consume the capability so the budget counts it
    await nominee.executeCapability(res1.capability, {}, async () => {})

    // Try a second action, which should be rejected because budget is exhausted
    const res2 = await nominee.prepareAction({ tool: 'budget.op', input: {}, user: 'u1' })
    // In our policy, the fallback is 'ask', and budget exhaustion escalates to the fallback
    expect(res2.status).toBe('pending_approval')
  })
})
