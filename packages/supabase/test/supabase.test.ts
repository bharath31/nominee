import { Nominee } from 'nominee'
import { describe, expect, it, vi } from 'vitest'
import { Supabase } from '../src/index.js'

interface Call {
  url: string
  method: string
  body?: string
}

/**
 * Routes the two endpoints the strategy touches: PostgREST on the project URL
 * (GET reads the row, PATCH persists), and the provider OAuth token endpoint.
 */
function mock(opts: { row?: Record<string, unknown> | null; token?: unknown }) {
  const calls: Call[] = []
  const fetch = vi.fn(async (url: string, init?: { method?: string; body?: unknown }) => {
    const method = init?.method ?? 'GET'
    calls.push({ url, method, body: init?.body ? String(init.body) : undefined })
    const ok = (data: unknown) => ({
      ok: true,
      status: 200,
      json: async () => data,
      text: async () => JSON.stringify(data),
    })
    if (url.includes('/rest/v1/')) {
      if (method === 'GET') return ok(opts.row == null ? [] : [opts.row])
      return ok(null) // PATCH persist
    }
    return ok(opts.token) // provider token endpoint
  })
  return { fetch: fetch as unknown as typeof globalThis.fetch, calls }
}

const conn = {
  github: {
    tokenEndpoint: 'https://github.com/login/oauth/access_token',
    clientId: 'cid',
    clientSecret: 'sec',
  },
}

describe('Supabase strategy', () => {
  it('returns a stored access token while it is still fresh (no refresh)', async () => {
    const { fetch, calls } = mock({
      row: {
        access_token: 'stored_at',
        expires_at: new Date(Date.now() + 3_600_000).toISOString(),
      },
    })
    const n = new Nominee({ strategy: Supabase({ url: 'https://p.supabase.co', key: 'k', fetch }) })

    expect(await n.token({ user: 'u1', connection: 'github' })).toBe('stored_at')
    expect(calls.filter((c) => !c.url.includes('/rest/v1/'))).toHaveLength(0) // never hit provider
  })

  it('refreshes a stale token against the provider and persists it', async () => {
    const { fetch, calls } = mock({
      row: {
        access_token: 'old_at',
        expires_at: new Date(Date.now() - 1000).toISOString(), // expired
        refresh_token: 'rt_1',
      },
      token: { access_token: 'fresh_at', expires_in: 3600, refresh_token: 'rt_2' },
    })
    const n = new Nominee({
      strategy: Supabase({ url: 'https://p.supabase.co', key: 'k', connections: conn, fetch }),
    })

    expect(await n.token({ user: 'u1', connection: 'github' })).toBe('fresh_at')

    const provider = calls.find((c) => c.url.includes('github.com'))
    expect(provider?.body).toContain('grant_type=refresh_token')
    expect(provider?.body).toContain('refresh_token=rt_1')

    const patch = calls.find((c) => c.method === 'PATCH')
    expect(patch).toBeTruthy()
    expect(patch?.body).toContain('fresh_at')
    expect(patch?.body).toContain('rt_2') // rotated refresh token written back
  })

  it('refreshes when there is no cached access token, only a refresh token', async () => {
    const { fetch } = mock({
      row: { refresh_token: 'rt_only' },
      token: { access_token: 'minted', expires_in: 3600 },
    })
    const n = new Nominee({
      strategy: Supabase({ url: 'https://p.supabase.co', key: 'k', connections: conn, fetch }),
    })
    expect(await n.token({ user: 'u1', connection: 'github' })).toBe('minted')
  })

  it('throws a clear error when the row is missing', async () => {
    const { fetch } = mock({ row: null })
    const n = new Nominee({ strategy: Supabase({ url: 'https://p.supabase.co', key: 'k', fetch }) })
    await expect(n.token({ user: 'ghost', connection: 'github' })).rejects.toThrow(/no row/)
  })

  it('honors custom table and column names', async () => {
    const { fetch, calls } = mock({
      row: { uid: 'u1', prov: 'gh', at: 'x', exp: new Date(Date.now() + 3_600_000).toISOString() },
    })
    const n = new Nominee({
      strategy: Supabase({
        url: 'https://p.supabase.co',
        key: 'k',
        table: 'tokens',
        columns: { user: 'uid', connection: 'prov', accessToken: 'at', expiresAt: 'exp' },
        fetch,
      }),
    })
    expect(await n.token({ user: 'u1', connection: 'gh' })).toBe('x')
    const get = calls.find((c) => c.method === 'GET')
    expect(get?.url).toContain('/rest/v1/tokens?')
    expect(get?.url).toContain('uid=eq.u1')
    expect(get?.url).toContain('prov=eq.gh')
  })
})
