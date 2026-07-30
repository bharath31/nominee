import { describe, expect, it, vi } from 'vitest'
import {
  ApprovalDeniedError,
  AuthorizationInputChangedError,
  Nominee,
  PolicyDeniedError,
  allow,
  ask,
  deny,
} from '../src/index.js'

describe('Nominee.authorize', () => {
  it('works policy-only, with no strategy at all', async () => {
    const n = new Nominee({ policy: [allow('email.read')] })
    const auth = await n.authorize({ tool: 'email.read', user: 'alice' })
    expect(auth.effect).toBe('allow')
    expect(auth.decision.ruleId).toBe('allow:email.read')
  })

  it('allows everything (with a receipt) when no policy is configured', async () => {
    const n = new Nominee({})
    const auth = await n.authorize({ tool: 'anything', user: 'alice' })
    expect(auth.effect).toBe('allow')
    expect(auth.decision.reason).toBe('no policy configured')
    expect(n.receipts).toHaveLength(1)
  })

  it('throws PolicyDeniedError carrying the decision and receipt', async () => {
    const n = new Nominee({
      policy: { rules: [deny('repo.delete', { reason: 'not even once' })], fallback: 'allow' },
    })
    const err = await n
      .authorize({ tool: 'repo.delete', user: 'alice', input: { repo: 'a/b' } })
      .catch((e) => e)
    expect(err).toBeInstanceOf(PolicyDeniedError)
    expect(err.message).toContain('repo.delete')
    expect(err.message).toContain('not even once')
    expect(err.decision.effect).toBe('deny')
    expect(err.receipt?.effect).toBe('deny')
    // The refusal itself is on the receipt chain.
    expect(n.receipts.at(-1)?.type).toBe('policy.decision')
    expect(n.verifyReceipts().ok).toBe(true)
  })

  it('escalates ask rules to the approval engine, passing input as detail', async () => {
    const seen: unknown[] = []
    const n = new Nominee({
      policy: [ask('email.forward')],
      onApprovalRequest: (req) => {
        seen.push(req.detail)
        req.approve()
      },
    })
    const auth = await n.authorize({
      tool: 'email.forward',
      user: 'alice',
      input: { to: 'boss@acme.com' },
    })
    expect(auth.effect).toBe('allow')
    expect(auth.approval?.decision).toBe('approved')
    expect(seen).toEqual([{ to: 'boss@acme.com' }])
  })

  it('throws ApprovalDeniedError when the human denies an ask', async () => {
    const n = new Nominee({
      policy: [ask('email.forward')],
      onApprovalRequest: (req) => req.deny(),
    })
    await expect(n.authorize({ tool: 'email.forward', user: 'alice' })).rejects.toBeInstanceOf(
      ApprovalDeniedError,
    )
  })

  it('honors requireApproval even when the policy allows', async () => {
    const onApprovalRequest = vi.fn((req) => req.approve())
    const n = new Nominee({ policy: [allow('t')], onApprovalRequest })
    const auth = await n.authorize({ tool: 't', user: 'alice', requireApproval: true })
    expect(auth.effect).toBe('allow')
    expect(onApprovalRequest).toHaveBeenCalledOnce()
  })

  it('sends exhausted budgets to a human', async () => {
    const onApprovalRequest = vi.fn((req) => req.approve())
    const n = new Nominee({
      policy: { rules: [allow('search', { max: 1 })], fallback: 'deny' },
      onApprovalRequest,
    })
    await n.authorize({ tool: 'search', user: 'alice' })
    expect(onApprovalRequest).not.toHaveBeenCalled()
    await n.authorize({ tool: 'search', user: 'alice' })
    expect(onApprovalRequest).toHaveBeenCalledOnce()
    const escalation = n.receipts.filter((r) => r.type === 'policy.decision').at(-1)
    expect(escalation?.escalated).toBe('budget')
    expect(escalation?.effect).toBe('ask')
  })

  it('check() previews without consuming budgets or asking anyone', async () => {
    const onApprovalRequest = vi.fn()
    const n = new Nominee({
      policy: { rules: [allow('t', { max: 1 }), ask('risky')], fallback: 'deny' },
      onApprovalRequest,
    })
    expect((await n.check({ tool: 't', user: 'alice' })).effect).toBe('allow')
    expect((await n.check({ tool: 'risky', user: 'alice' })).effect).toBe('ask')
    expect((await n.check({ tool: 'nope', user: 'alice' })).effect).toBe('deny')
    expect(onApprovalRequest).not.toHaveBeenCalled()
    expect(n.receipts).toHaveLength(0)
    // Budget still intact after the previews.
    expect((await n.authorize({ tool: 't', user: 'alice' })).effect).toBe('allow')
  })

  it('records policy decisions and approvals on one verifiable chain', async () => {
    const n = new Nominee({
      policy: [allow('a'), ask('b')],
      onApprovalRequest: (req) => req.approve(),
    })
    await n.authorize({ tool: 'a', user: 'alice', input: { x: 1 } })
    await n.authorize({ tool: 'b', user: 'alice' })
    const types = n.receipts.map((r) => r.type)
    expect(types).toEqual([
      'policy.decision',
      'policy.decision',
      'approval.requested',
      'approval.resolved',
    ])
    // Input is hashed onto the decision receipt, not stored.
    expect(n.receipts[0]?.inputHash).toMatch(/^[0-9a-f]{64}$/)
    expect(n.receipts[0]?.input).toBeUndefined()
    expect(n.verifyReceipts().ok).toBe(true)
  })

  it('waits for strict receipt delivery before authorization returns', async () => {
    let release = () => {}
    const sinkGate = new Promise<void>((resolve) => {
      release = resolve
    })
    const n = new Nominee({
      policy: [allow('refund')],
      receipts: { delivery: 'strict', onReceipt: () => sinkGate },
    })
    let settled = false
    const authorization = n
      .authorize({ tool: 'refund', user: 'alice', input: { amount: 10 } })
      .then(() => {
        settled = true
      })

    await Promise.resolve()
    expect(settled).toBe(false)
    release()
    await authorization
    expect(settled).toBe(true)
  })

  it('fails closed when strict receipt delivery fails', async () => {
    const execute = vi.fn(async (_input: { amount: number }) => 'done')
    const n = new Nominee({
      policy: [allow('refund')],
      receipts: {
        delivery: 'strict',
        onReceipt: async () => {
          throw new Error('audit store unavailable')
        },
      },
    })
    const tools = n.guard({ refund: execute }, { user: 'alice' })

    await expect(tools.refund({ amount: 10 })).rejects.toThrow('audit store unavailable')
    expect(execute).not.toHaveBeenCalled()
  })
})

describe('Nominee.guard', () => {
  const policy = {
    rules: [
      allow('search'),
      deny('exfiltrate', { reason: 'blocked by policy' }),
      allow('email.forward', {
        when: ({ input }) => (input as { to: string }).to.endsWith('@acme.com'),
      }),
    ],
    fallback: 'deny' as const,
  }

  it('wraps plain async functions by object key', async () => {
    const n = new Nominee({ policy })
    const tools = n.guard(
      {
        search: async ({ q }: { q: string }) => `results for ${q}`,
        exfiltrate: async () => 'secrets',
      },
      { user: 'alice' },
    )
    await expect(tools.search({ q: 'x' })).resolves.toBe('results for x')
    await expect(tools.exfiltrate()).rejects.toBeInstanceOf(PolicyDeniedError)
  })

  it('never runs the underlying tool on deny', async () => {
    const spy = vi.fn()
    const n = new Nominee({ policy })
    const tools = n.guard({ exfiltrate: spy }, { user: 'alice' })
    await expect(tools.exfiltrate()).rejects.toThrow()
    expect(spy).not.toHaveBeenCalled()
  })

  it('never runs with input changed while approval was pending', async () => {
    const input = { amount: 10 }
    const execute = vi.fn(async ({ amount }: { amount: number }) => amount)
    const n = new Nominee({
      policy: [ask('refund')],
      onApprovalRequest: (req) => {
        input.amount = 100_000
        req.approve()
      },
    })
    const tools = n.guard({ refund: execute }, { user: 'alice' })

    await expect(tools.refund(input)).rejects.toBeInstanceOf(AuthorizationInputChangedError)
    expect(execute).not.toHaveBeenCalled()
    expect(n.receipts.at(-1)?.effect).toBe('deny')
    expect(n.receipts.at(-1)?.reason).toBe('tool input changed after authorization')
  })

  it('persists an input-drift refusal before strict mode rejects', async () => {
    let release = () => {}
    const driftSink = new Promise<void>((resolve) => {
      release = resolve
    })
    const input = { amount: 10 }
    const execute = vi.fn(async ({ amount }: { amount: number }) => amount)
    const n = new Nominee({
      policy: [ask('refund')],
      receipts: {
        delivery: 'strict',
        onReceipt: (receipt) =>
          receipt.reason === 'tool input changed after authorization' ? driftSink : undefined,
      },
      onApprovalRequest: (req) => {
        input.amount = 100_000
        req.approve()
      },
    })
    const tools = n.guard({ refund: execute }, { user: 'alice' })
    let settled = false
    const call = tools.refund(input)
    void call
      .finally(() => {
        settled = true
      })
      .catch(() => {})

    await vi.waitFor(() => {
      expect(n.receipts.at(-1)?.reason).toBe('tool input changed after authorization')
    })
    expect(settled).toBe(false)
    expect(execute).not.toHaveBeenCalled()

    release()
    await expect(call).rejects.toBeInstanceOf(AuthorizationInputChangedError)
    expect(settled).toBe(true)
  })

  it('wraps framework-style { execute } tool objects, preserving other fields', async () => {
    const n = new Nominee({ policy })
    const tools = n.guard(
      {
        search: {
          description: 'Search the web',
          inputSchema: { type: 'object' },
          execute: async ({ q }: { q: string }) => `hits: ${q}`,
        },
        'email.forward': {
          description: 'Forward an email',
          execute: async ({ to }: { to: string }) => `sent to ${to}`,
        },
      },
      { user: 'alice' },
    )
    expect(tools.search.description).toBe('Search the web')
    await expect(tools.search.execute({ q: 'x' })).resolves.toBe('hits: x')
    await expect(tools['email.forward'].execute({ to: 'boss@acme.com' })).resolves.toBe(
      'sent to boss@acme.com',
    )
    await expect(tools['email.forward'].execute({ to: 'x@evil.top' })).rejects.toBeInstanceOf(
      PolicyDeniedError,
    )
  })

  it('resolves the user per call from a function', async () => {
    const users: string[] = []
    const n = new Nominee({
      policy: { rules: [allow('*')] },
      onAudit: (e) => users.push(e.user),
    })
    const tools = n.guard(
      { t: async (input: { u: string }) => input.u },
      { user: ({ input }) => (input as { u: string }).u },
    )
    await tools.t({ u: 'carol' })
    expect(users.length).toBeGreaterThan(0)
    expect(new Set(users)).toEqual(new Set(['carol']))
  })

  it('passes non-tool values through untouched', async () => {
    const n = new Nominee({})
    const guarded = n.guard({ note: 'not a tool' as const, t: async () => 1 }, { user: 'a' })
    expect(guarded.note).toBe('not a tool')
  })
})

describe('delegation narrowing', () => {
  it('sub-agents can only narrow authority, and share the receipt chain', async () => {
    const orchestrator = new Nominee({
      agent: 'orchestrator',
      policy: { rules: [allow('github.*'), deny('email.*')], fallback: 'deny' },
    })
    const researcher = orchestrator.delegate('researcher', {
      policy: [deny('github.merge_*', { reason: 'sub-agents cannot merge' })],
    })

    // Parent still allowed.
    await expect(
      orchestrator.authorize({ tool: 'github.merge_pr', user: 'alice' }),
    ).resolves.toMatchObject({ effect: 'allow' })
    // Child is narrowed.
    await expect(
      researcher.authorize({ tool: 'github.merge_pr', user: 'alice' }),
    ).rejects.toBeInstanceOf(PolicyDeniedError)
    // Child cannot widen what the parent denies.
    await expect(
      researcher.authorize({ tool: 'email.send', user: 'alice' }),
    ).rejects.toBeInstanceOf(PolicyDeniedError)
    // Child inherits parent allows it didn't touch.
    await expect(
      researcher.authorize({ tool: 'github.read', user: 'alice' }),
    ).resolves.toMatchObject({ effect: 'allow' })

    // One shared chain; child receipts carry the delegation chain.
    const chains = orchestrator.receipts.map((r) => r.chain)
    expect(chains[0]).toEqual(['orchestrator'])
    expect(chains[1]).toEqual(['orchestrator', 'researcher'])
    expect(orchestrator.verifyReceipts().ok).toBe(true)
    expect(orchestrator.receipts.length).toBe(4)
  })
})

describe('strategy-optional token()', () => {
  it('throws a helpful error without a strategy', async () => {
    const n = new Nominee({ policy: [allow('*')] })
    await expect(n.token({ user: 'a', connection: 'github' })).rejects.toThrow(/needs a strategy/)
  })
})
