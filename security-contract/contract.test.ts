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
  verifyReceipts,
} from 'nominee'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

/**
 * Observe mode is a deliberate, announced exception to enforcement: it records
 * decisions instead of applying them. These tests exist to prove it is only
 * that — a mode that must be asked for by name, that says so on every receipt
 * it writes, that cannot reach a production configuration, and that weakens
 * none of the guarantees above.
 */
describe('Observe Mode Contract', () => {
  const policy = {
    rules: [deny('sensitive.op'), allow('safe.op'), ask('review.op')],
    fallback: 'deny' as const,
  }
  let warn: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    warn.mockRestore()
  })

  it('is off unless asked for by name: the default is enforcement', async () => {
    const defaultMode = new Nominee({ policy, agent: 'security-tester' })
    expect(defaultMode.mode).toBe('enforce')
    await expect(
      defaultMode.run({ tool: 'sensitive.op', input: {}, user: 'u1' }, async () => 'ran'),
    ).rejects.toThrow(PolicyDeniedError)
  })

  it('cannot be silently active in a production configuration', () => {
    expect(
      () =>
        new Nominee({
          mode: 'observe',
          production: true,
          policy,
          actionStore: new MemoryActionStore(),
          receipts: { store: new MemoryAtomicReceiptStore(), delivery: 'strict' },
        }),
    ).toThrow(/cannot be combined with production: true/)
  })

  it('announces that enforcement is off before anything runs', () => {
    new Nominee({ mode: 'observe', policy, agent: 'security-tester' })
    const notice = warn.mock.calls.map((args: unknown[]) => String(args[0])).join('\n')
    expect(notice).toContain('ENFORCEMENT IS OFF')
  })

  it('records the deny it did not enforce, and marks the receipt as unenforced', async () => {
    const observing = new Nominee({ mode: 'observe', policy, agent: 'security-tester' })
    const result = await observing.run(
      { tool: 'sensitive.op', input: { data: 'test' }, user: 'u1' },
      async () => 'ran',
    )
    expect(result).toBe('ran')

    const decision = observing.receipts.find((r) => r.type === 'policy.decision')
    // The verdict is preserved — not rewritten into an allow.
    expect(decision?.effect).toBe('deny')
    // …and no reader can mistake it for a record of enforcement.
    expect(decision?.enforcement).toBe('observe')
    expect(observing.receipts.every((r) => r.enforcement === 'observe')).toBe(true)
    expect((await observing.verifyReceipts()).ok).toBe(true)
    expect(verifyReceipts([...observing.receipts]).ok).toBe(true)
  })

  it('does not weaken input binding: mutated arguments still fail', async () => {
    const observing = new Nominee({ mode: 'observe', policy, agent: 'security-tester' })
    const prepared = await observing.prepareAction({
      tool: 'safe.op',
      input: { query: 'test' },
      user: 'u1',
    })
    expect(prepared.status).toBe('ready')
    if (prepared.status !== 'ready') return

    await expect(
      observing.executeCapability(prepared.capability, { query: 'malicious' }, async () => {}),
    ).rejects.toThrow(AuthorizationInputChangedError)
  })

  it('does not weaken capability single-use', async () => {
    const observing = new Nominee({ mode: 'observe', policy, agent: 'security-tester' })
    const prepared = await observing.prepareAction({ tool: 'safe.op', input: {}, user: 'u1' })
    expect(prepared.status).toBe('ready')
    if (prepared.status !== 'ready') return

    await observing.executeCapability(prepared.capability, {}, async () => {})
    await expect(
      observing.executeCapability(prepared.capability, {}, async () => {}),
    ).rejects.toThrow(CapabilityInvalidError)
  })

  it('cannot be entered by a sub-agent: mode is inherited, never chosen', async () => {
    const enforcing = new Nominee({ policy, agent: 'security-tester' })
    const sub = enforcing.delegate('sub-agent', { policy: { rules: [], fallback: 'allow' } })
    expect(sub.mode).toBe('enforce')
    await expect(
      sub.run({ tool: 'sensitive.op', input: {}, user: 'u1' }, async () => 'ran'),
    ).rejects.toThrow(PolicyDeniedError)

    // …and a sub-agent of an observing parent stays in the same report.
    const observing = new Nominee({ mode: 'observe', policy, agent: 'security-tester' })
    expect(observing.delegate('sub-agent').mode).toBe('observe')
  })

  it('cannot be turned on after construction', () => {
    const enforcing = new Nominee({ policy, agent: 'security-tester' })
    expect(() => {
      ;(enforcing as unknown as { mode: string }).mode = 'observe'
    }).toThrow()
    expect(enforcing.mode).toBe('enforce')
    expect(() => enforcing.observe({ 'safe.op': async () => 'ran' })).toThrow(
      /requires mode: 'observe'/,
    )
  })
})
