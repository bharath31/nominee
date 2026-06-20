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

  it('propagates strategy errors', async () => {
    const n = new Nominee({ strategy: Memory() })
    await expect(n.token({ user: 'nope', connection: 'github' })).rejects.toThrow(/no token/)
  })
})
