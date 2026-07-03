import { describe, expect, it } from 'vitest'
import { PolicyEngine, allow, ask, deny, matchTool } from '../src/index.js'

describe('matchTool', () => {
  it('matches exact names', () => {
    expect(matchTool('email.forward', 'email.forward')).toBe(true)
    expect(matchTool('email.forward', 'email.forwardAll')).toBe(false)
  })

  it('matches * wildcards anywhere', () => {
    expect(matchTool('github.*', 'github.merge_pr')).toBe(true)
    expect(matchTool('github.*', 'gitlab.merge_pr')).toBe(false)
    expect(matchTool('*.delete', 'repo.delete')).toBe(true)
    expect(matchTool('*', 'anything.at.all')).toBe(true)
    expect(matchTool('email.*.bulk', 'email.send.bulk')).toBe(true)
  })

  it('does not partially match', () => {
    expect(matchTool('github', 'github.merge_pr')).toBe(false)
  })

  it('escapes regex specials in patterns', () => {
    expect(matchTool('a+b', 'a+b')).toBe(true)
    expect(matchTool('a+b', 'aab')).toBe(false)
    expect(matchTool('a.b', 'axb')).toBe(false)
  })
})

describe('PolicyEngine', () => {
  const call = (tool: string, input?: unknown) => ({ tool, input, user: 'alice' })

  it('first matching rule wins', async () => {
    const engine = new PolicyEngine([
      { rules: [deny('email.forward'), allow('email.*')], fallback: 'deny' },
    ])
    expect((await engine.evaluate(call('email.forward'))).effect).toBe('deny')
    expect((await engine.evaluate(call('email.read'))).effect).toBe('allow')
  })

  it('falls back to ask by default, honors explicit fallback', async () => {
    const defaultFallback = new PolicyEngine([{ rules: [allow('a.*')] }])
    expect((await defaultFallback.evaluate(call('b.x'))).effect).toBe('ask')

    const denyFallback = new PolicyEngine([{ rules: [allow('a.*')], fallback: 'deny' }])
    expect((await denyFallback.evaluate(call('b.x'))).effect).toBe('deny')
  })

  it('skips rules whose when predicate rejects (sync and async)', async () => {
    const engine = new PolicyEngine([
      {
        rules: [
          allow('email.forward', {
            when: ({ input }) => (input as { to: string }).to.endsWith('@acme.com'),
          }),
          allow('pay.invoice', {
            when: async ({ input }) => (input as { amount: number }).amount < 100,
          }),
        ],
        fallback: 'deny',
      },
    ])
    expect((await engine.evaluate(call('email.forward', { to: 'boss@acme.com' }))).effect).toBe(
      'allow',
    )
    expect((await engine.evaluate(call('email.forward', { to: 'x@evil.top' }))).effect).toBe('deny')
    expect((await engine.evaluate(call('pay.invoice', { amount: 50 }))).effect).toBe('allow')
    expect((await engine.evaluate(call('pay.invoice', { amount: 5000 }))).effect).toBe('deny')
  })

  it('reports the deciding rule and reason', async () => {
    const engine = new PolicyEngine([
      { rules: [deny('repo.delete', { reason: 'never delete repos' })] },
    ])
    const d = await engine.evaluate(call('repo.delete'))
    expect(d.ruleId).toBe('deny:repo.delete')
    expect(d.reason).toBe('never delete repos')
  })

  it('escalates an exhausted allow budget to ask', async () => {
    const engine = new PolicyEngine([{ rules: [allow('search.*', { max: 2 })], fallback: 'deny' }])
    expect((await engine.evaluate(call('search.web'))).effect).toBe('allow')
    expect((await engine.evaluate(call('search.web'))).effect).toBe('allow')
    const third = await engine.evaluate(call('search.web'))
    expect(third.effect).toBe('ask')
    expect(third.escalated).toBe('budget')
  })

  it('tracks budgets per user', async () => {
    const engine = new PolicyEngine([{ rules: [allow('t', { max: 1 })] }])
    expect((await engine.evaluate({ tool: 't', user: 'alice' })).effect).toBe('allow')
    expect((await engine.evaluate({ tool: 't', user: 'bob' })).effect).toBe('allow')
    expect((await engine.evaluate({ tool: 't', user: 'alice' })).effect).toBe('ask')
  })

  it('does not consume budget on commit: false or on non-allow outcomes', async () => {
    const engine = new PolicyEngine([{ rules: [allow('t', { max: 1 })] }])
    await engine.evaluate({ tool: 't', user: 'alice' }, { commit: false })
    await engine.evaluate({ tool: 't', user: 'alice' }, { commit: false })
    expect((await engine.evaluate({ tool: 't', user: 'alice' })).effect).toBe('allow')

    const chained = new PolicyEngine([{ rules: [allow('t', { max: 5 })] }, { rules: [deny('t')] }])
    await chained.evaluate({ tool: 't', user: 'alice' }) // denied by second policy
    // Budget untouched: a fresh single-policy view would still allow 5 times.
    expect((await chained.evaluate({ tool: 't', user: 'alice' })).effect).toBe('deny')
  })

  it('strictest outcome wins across a delegation chain', async () => {
    const parent = new PolicyEngine([{ rules: [allow('github.*'), deny('email.*')] }])
    const child = parent.narrow({ rules: [deny('github.merge_*')], fallback: 'allow' })

    // Child narrows: parent allowed github.merge_pr, child denies it.
    expect((await child.evaluate(call('github.merge_pr'))).effect).toBe('deny')
    // Child cannot widen: parent denies email even though child allows.
    expect((await child.evaluate(call('email.send'))).effect).toBe('deny')
    // Untouched by child rules: parent's allow stands.
    expect((await child.evaluate(call('github.read'))).effect).toBe('allow')
    // Parent engine unchanged.
    expect((await parent.evaluate(call('github.merge_pr'))).effect).toBe('allow')
  })

  it('ask beats allow, deny beats ask in a chain', async () => {
    const parent = new PolicyEngine([{ rules: [allow('t')] }])
    expect((await parent.narrow({ rules: [ask('t')] }).evaluate(call('t'))).effect).toBe('ask')
    expect(
      (
        await parent
          .narrow({ rules: [ask('t')] })
          .narrow({ rules: [deny('t')] })
          .evaluate(call('t'))
      ).effect,
    ).toBe('deny')
  })

  it('allows everything with no policy configured', async () => {
    const engine = new PolicyEngine([])
    const d = await engine.evaluate(call('anything'))
    expect(d.effect).toBe('allow')
    expect(d.reason).toBe('no policy configured')
  })
})

describe('when predicate typing', () => {
  // The published README/llms.txt snippet, verbatim — must compile without a
  // cast. `input` defaults to `any` so untyped property access just works.
  it('compiles the untyped README snippet and narrows correctly', async () => {
    const engine = new PolicyEngine([
      {
        rules: [
          allow('email.forward', { when: ({ input }) => input.to.endsWith('@acme.com') }),
          deny('email.forward', { reason: 'external forwarding is exfiltration' }),
        ],
        fallback: 'deny',
      },
    ])
    const call = (to: string) => ({ tool: 'email.forward', input: { to }, user: 'alice' })
    expect((await engine.evaluate(call('a@acme.com'))).effect).toBe('allow')
    expect((await engine.evaluate(call('a@evil.com'))).effect).toBe('deny')
  })

  it('supports an explicit type argument for stricter callers', async () => {
    const engine = new PolicyEngine([
      {
        rules: [
          allow<{ to: string }>('email.forward', {
            when: ({ input }) => input?.to.endsWith('@acme.com') ?? false,
          }),
        ],
        fallback: 'deny',
      },
    ])
    const d = await engine.evaluate({
      tool: 'email.forward',
      input: { to: 'a@acme.com' },
      user: 'a',
    })
    expect(d.effect).toBe('allow')
  })
})
