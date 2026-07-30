import { describe, expect, it, vi } from 'vitest'
import { Memory, Nominee } from '../src/index.js'
import type { Strategy } from '../src/index.js'

describe('Nominee.token', () => {
  it('returns a token from the strategy', async () => {
    const n = new Nominee({ strategy: Memory({ tokens: { u1: { github: 'tok_1' } } }) })
    expect(await n.token({ user: 'u1', connection: 'github' })).toBe('tok_1')
  })

  it('caches tokens with a known expiry and reuses them', async () => {
    const getToken = vi.fn(async () => ({ token: 'tok', expiresAt: Date.now() + 3_600_000 }))
    const strategy: Strategy = { name: 'counting', getToken }
    const n = new Nominee({ strategy })

    await n.token({ user: 'u1', connection: 'github' })
    await n.token({ user: 'u1', connection: 'github' })

    expect(getToken).toHaveBeenCalledTimes(1)
  })

  it('does NOT cache tokens with unknown expiry (always re-fetches)', async () => {
    const getToken = vi.fn(async () => ({ token: 'tok' })) // no expiresAt
    const n = new Nominee({ strategy: { name: 'x', getToken } })

    await n.token({ user: 'u1', connection: 'github' })
    await n.token({ user: 'u1', connection: 'github' })

    expect(getToken).toHaveBeenCalledTimes(2)
  })

  it('refreshes when the cached token is within the expiry leeway', async () => {
    let n = 0
    const getToken = vi.fn(async () => ({ token: `tok_${++n}`, expiresAt: Date.now() + 30_000 }))
    const engine = new Nominee({ strategy: { name: 'x', getToken }, expiryLeewayMs: 60_000 })

    // expiresAt (+30s) is inside the 60s leeway → treated as stale → refetch every time
    expect(await engine.token({ user: 'u1', connection: 'github' })).toBe('tok_1')
    expect(await engine.token({ user: 'u1', connection: 'github' })).toBe('tok_2')
    expect(getToken).toHaveBeenCalledTimes(2)
  })

  it('force bypasses the cache', async () => {
    const getToken = vi.fn(async () => ({ token: 'tok', expiresAt: Date.now() + 3_600_000 }))
    const n = new Nominee({ strategy: { name: 'x', getToken } })

    await n.token({ user: 'u1', connection: 'github' })
    await n.token({ user: 'u1', connection: 'github', force: true })

    expect(getToken).toHaveBeenCalledTimes(2)
  })

  it('caches per (user, connection)', async () => {
    const getToken = vi.fn(async (p: { user: string; connection: string }) => ({
      token: `${p.user}:${p.connection}`,
      expiresAt: Date.now() + 3_600_000,
    }))
    const n = new Nominee({ strategy: { name: 'x', getToken } })

    expect(await n.token({ user: 'u1', connection: 'github' })).toBe('u1:github')
    expect(await n.token({ user: 'u2', connection: 'github' })).toBe('u2:github')
    expect(await n.token({ user: 'u1', connection: 'slack' })).toBe('u1:slack')
    expect(getToken).toHaveBeenCalledTimes(3)
  })

  it('separates cache entries by canonical scope set', async () => {
    const getToken = vi.fn(async (params: { scopes?: string[] }) => ({
      token: params.scopes?.join('+') ?? 'unscoped',
      expiresAt: Date.now() + 3_600_000,
    }))
    const n = new Nominee({ strategy: { name: 'scoped', getToken } })

    expect(
      await n.token({ user: 'u1', connection: 'github', scopes: ['repo:read', 'user:read'] }),
    ).toBe('repo:read+user:read')
    expect(
      await n.token({
        user: 'u1',
        connection: 'github',
        scopes: ['user:read', 'repo:read', 'repo:read'],
      }),
    ).toBe('repo:read+user:read')
    expect(await n.token({ user: 'u1', connection: 'github', scopes: ['repo:admin'] })).toBe(
      'repo:admin',
    )

    expect(getToken).toHaveBeenCalledTimes(2)
    expect(getToken.mock.calls[0]?.[0].scopes).toEqual(['repo:read', 'user:read'])
  })

  it('does not coalesce concurrent requests for different scopes', async () => {
    const getToken = vi.fn(async (params: { scopes?: string[] }) => {
      await new Promise((resolve) => setTimeout(resolve, 10))
      return {
        token: params.scopes?.join('+') ?? 'unscoped',
        expiresAt: Date.now() + 3_600_000,
      }
    })
    const n = new Nominee({ strategy: { name: 'scoped', getToken } })

    const [read, admin] = await Promise.all([
      n.token({ user: 'u1', connection: 'github', scopes: ['repo:read'] }),
      n.token({ user: 'u1', connection: 'github', scopes: ['repo:admin'] }),
    ])

    expect(read).toBe('repo:read')
    expect(admin).toBe('repo:admin')
    expect(getToken).toHaveBeenCalledTimes(2)
  })

  it('propagates strategy errors', async () => {
    const n = new Nominee({ strategy: Memory() })
    await expect(n.token({ user: 'nope', connection: 'github' })).rejects.toThrow(/no token/)
  })

  it('coalesces concurrent refreshes into one fetch (single-flight)', async () => {
    let calls = 0
    const getToken = vi.fn(async () => {
      calls++
      await new Promise((r) => setTimeout(r, 10))
      return { token: `tok_${calls}`, expiresAt: Date.now() + 3_600_000 }
    })
    const n = new Nominee({ strategy: { name: 'x', getToken } })

    const results = await Promise.all(
      Array.from({ length: 5 }, () => n.token({ user: 'u1', connection: 'github' })),
    )

    expect(getToken).toHaveBeenCalledTimes(1)
    expect(results).toEqual(['tok_1', 'tok_1', 'tok_1', 'tok_1', 'tok_1'])
  })

  it('force does not coalesce with an in-flight refresh', async () => {
    let calls = 0
    const getToken = vi.fn(async () => {
      calls++
      await new Promise((r) => setTimeout(r, 10))
      return { token: `tok_${calls}`, expiresAt: Date.now() + 3_600_000 }
    })
    const n = new Nominee({ strategy: { name: 'x', getToken } })

    await Promise.all([
      n.token({ user: 'u1', connection: 'github' }),
      n.token({ user: 'u1', connection: 'github', force: true }),
    ])
    expect(getToken).toHaveBeenCalledTimes(2)
  })

  it('invalidate() drops the cache and emits token.invalidated', async () => {
    let n = 0
    const getToken = vi.fn(async () => ({ token: `tok_${++n}`, expiresAt: Date.now() + 3_600_000 }))
    const events: string[] = []
    const nom = new Nominee({
      strategy: { name: 'x', getToken },
      onAudit: (e) => events.push(e.type),
    })

    await nom.token({ user: 'u1', connection: 'github' }) // tok_1, cached
    expect(nom.invalidate('u1', 'github')).toBe(true)
    expect(nom.invalidate('u1', 'github')).toBe(false) // already gone
    expect(await nom.token({ user: 'u1', connection: 'github' })).toBe('tok_2') // re-resolved
    expect(events).toContain('token.invalidated')
    expect(getToken).toHaveBeenCalledTimes(2)
  })

  it('invalidate() drops every scoped cache variant for the connection', async () => {
    let calls = 0
    const getToken = vi.fn(async (params: { scopes?: string[] }) => ({
      token: `${params.scopes?.join('+')}:${++calls}`,
      expiresAt: Date.now() + 3_600_000,
    }))
    const nom = new Nominee({ strategy: { name: 'scoped', getToken } })

    expect(await nom.token({ user: 'u1', connection: 'github', scopes: ['repo:read'] })).toBe(
      'repo:read:1',
    )
    expect(await nom.token({ user: 'u1', connection: 'github', scopes: ['repo:admin'] })).toBe(
      'repo:admin:2',
    )
    expect(nom.invalidate('u1', 'github')).toBe(true)
    expect(await nom.token({ user: 'u1', connection: 'github', scopes: ['repo:read'] })).toBe(
      'repo:read:3',
    )
    expect(await nom.token({ user: 'u1', connection: 'github', scopes: ['repo:admin'] })).toBe(
      'repo:admin:4',
    )
  })

  it('re-resolves after a durable resume (holds a resolver, not a token)', async () => {
    // The strategy reads the current token from a store on every call — exactly
    // how you wire a refresh token from durable storage.
    const store = { access: 'tok_morning', exp: Date.now() + 3_600_000 }
    const strategy: Strategy = {
      name: 'store',
      getToken: async () => ({ token: store.access, expiresAt: store.exp }),
    }

    // Morning: the agent gets a token.
    const morning = new Nominee({ strategy })
    expect(await morning.token({ user: 'u1', connection: 'github' })).toBe('tok_morning')

    // Hours pass, the upstream token rotates, and the agent's instance was
    // serialized away. A fresh instance resumes with the same strategy config.
    store.access = 'tok_afternoon'
    const afternoon = new Nominee({ strategy })

    // It carries no stale captured token — it re-resolves a live one.
    expect(await afternoon.token({ user: 'u1', connection: 'github' })).toBe('tok_afternoon')
  })
})
