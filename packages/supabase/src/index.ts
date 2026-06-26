import type { GetTokenParams, Strategy, TokenResult } from 'nominee'

/** How to refresh a stored provider refresh token into a live access token. */
export interface SupabaseConnectionConfig {
  /** Provider OAuth2 token endpoint, e.g. `https://github.com/login/oauth/access_token`. */
  tokenEndpoint: string
  clientId: string
  clientSecret?: string
}

/** Which columns hold the per-(user, connection) token data. */
export interface SupabaseColumns {
  /** Column matching the nominee `user`. Default `user_id`. */
  user?: string
  /** Column matching the nominee `connection` (the provider). Default `provider`. */
  connection?: string
  /** Column holding the provider refresh token. Default `refresh_token`. */
  refreshToken?: string
  /** Column holding a cached provider access token. Default `access_token`. */
  accessToken?: string
  /** Column holding the access token expiry (ISO string or epoch). Default `expires_at`. */
  expiresAt?: string
}

export interface SupabaseOptions {
  /** Your project URL, e.g. `https://abcd.supabase.co`. */
  url: string
  /** A Supabase API key — service_role (server-side) or anon (with RLS). */
  key: string
  /** Postgres schema. Default `public`. */
  schema?: string
  /** Table holding the provider tokens. Default `agent_connections`. */
  table?: string
  /** Column overrides. */
  columns?: SupabaseColumns
  /**
   * Per-connection refresh config. When a stored access token is missing or
   * stale, nominee refreshes the stored refresh token against this endpoint.
   * Omit a connection to only ever return its stored access token.
   */
  connections?: Record<string, SupabaseConnectionConfig>
  /**
   * After a refresh, write the new access token (and expiry, and rotated refresh
   * token) back to the row. Default true when an `accessToken` column is set.
   */
  persist?: boolean
  /** Custom fetch (defaults to global `fetch`). Useful for tests. */
  fetch?: typeof fetch
}

interface TokenEndpointResponse {
  access_token: string
  expires_in?: number
  scope?: string
  refresh_token?: string
}

const DEFAULT_COLUMNS: Required<SupabaseColumns> = {
  user: 'user_id',
  connection: 'provider',
  refreshToken: 'refresh_token',
  accessToken: 'access_token',
  expiresAt: 'expires_at',
}

function parseExpiry(v: unknown): number | undefined {
  if (v == null) return undefined
  if (typeof v === 'number') return v < 1e12 ? v * 1000 : v // seconds vs ms
  const t = Date.parse(String(v))
  return Number.isNaN(t) ? undefined : t
}

/**
 * Supabase strategy for nominee — proves the layer is provider-neutral.
 *
 * Supabase is your token store: a row per (user, provider) holds the provider's
 * refresh token (Supabase Auth hands you `provider_refresh_token` once, at
 * sign-in — you persist it). nominee reads that row over PostgREST and, when the
 * cached access token is missing or stale, refreshes it at the provider and
 * (optionally) writes the fresh one back. Zero dependencies — just `fetch`.
 *
 * The agent code is identical to the Auth0 or OAuth2 path; only this line differs.
 */
export function Supabase(options: SupabaseOptions): Strategy {
  const doFetch = options.fetch ?? globalThis.fetch
  if (typeof doFetch !== 'function') {
    throw new Error('nominee(supabase): no global fetch available; pass options.fetch')
  }
  const schema = options.schema ?? 'public'
  const table = options.table ?? 'agent_connections'
  const col = { ...DEFAULT_COLUMNS, ...options.columns }
  const persist = options.persist ?? Boolean(options.columns?.accessToken ?? true)
  const base = options.url.replace(/\/+$/, '')
  const restUrl = `${base}/rest/v1/${table}`

  const authHeaders = (write: boolean): Record<string, string> => ({
    apikey: options.key,
    authorization: `Bearer ${options.key}`,
    [write ? 'Content-Profile' : 'Accept-Profile']: schema,
  })

  const filter = (params: GetTokenParams) =>
    `${col.user}=eq.${encodeURIComponent(params.user)}&${col.connection}=eq.${encodeURIComponent(
      params.connection,
    )}`

  async function readRow(params: GetTokenParams): Promise<Record<string, unknown>> {
    const res = await doFetch(`${restUrl}?${filter(params)}&select=*&limit=1`, {
      headers: { ...authHeaders(false), accept: 'application/json' },
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`nominee(supabase): read failed ${res.status} ${text}`.trim())
    }
    const rows = (await res.json()) as Array<Record<string, unknown>>
    const row = rows?.[0]
    if (!row) {
      throw new Error(
        `nominee(supabase): no row in "${table}" for user="${params.user}" connection="${params.connection}"`,
      )
    }
    return row
  }

  async function refresh(
    conn: SupabaseConnectionConfig,
    refreshToken: string,
    scopes?: string[],
  ): Promise<TokenResult & { refreshToken?: string }> {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: conn.clientId,
    })
    if (conn.clientSecret) body.set('client_secret', conn.clientSecret)
    if (scopes?.length) body.set('scope', scopes.join(' '))

    const res = await doFetch(conn.tokenEndpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        accept: 'application/json',
      },
      body,
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`nominee(supabase): provider refresh failed ${res.status} ${text}`.trim())
    }
    const json = (await res.json()) as TokenEndpointResponse
    const result: TokenResult & { refreshToken?: string } = { token: json.access_token }
    if (typeof json.expires_in === 'number') result.expiresAt = Date.now() + json.expires_in * 1000
    if (json.scope) result.scopes = json.scope.split(' ')
    if (json.refresh_token) result.refreshToken = json.refresh_token
    return result
  }

  async function persistRow(
    params: GetTokenParams,
    fresh: TokenResult & { refreshToken?: string },
  ): Promise<void> {
    const patch: Record<string, unknown> = { [col.accessToken]: fresh.token }
    if (fresh.expiresAt) patch[col.expiresAt] = new Date(fresh.expiresAt).toISOString()
    if (fresh.refreshToken) patch[col.refreshToken] = fresh.refreshToken
    await doFetch(`${restUrl}?${filter(params)}`, {
      method: 'PATCH',
      headers: {
        ...authHeaders(true),
        'content-type': 'application/json',
        prefer: 'return=minimal',
      },
      body: JSON.stringify(patch),
    }).catch(() => {
      // Persist is best-effort: a write failure must not break the token fetch.
    })
  }

  return {
    name: 'supabase',
    async getToken(params) {
      const row = await readRow(params)

      // 1. A stored access token that's still fresh → return it as-is.
      const stored = row[col.accessToken]
      const storedExp = parseExpiry(row[col.expiresAt])
      if (typeof stored === 'string' && stored && storedExp && storedExp > Date.now()) {
        return { token: stored, expiresAt: storedExp }
      }

      // 2. Otherwise refresh, if this connection has refresh config.
      const conn = options.connections?.[params.connection]
      const refreshToken = row[col.refreshToken]
      if (conn && typeof refreshToken === 'string' && refreshToken) {
        const fresh = await refresh(conn, refreshToken, params.scopes)
        if (persist) await persistRow(params, fresh)
        const { refreshToken: _r, ...result } = fresh
        return result
      }

      // 3. No refresh config — return the stored access token even if its expiry
      //    is unknown (nominee will simply re-read it next time).
      if (typeof stored === 'string' && stored) {
        return storedExp ? { token: stored, expiresAt: storedExp } : { token: stored }
      }

      throw new Error(
        `nominee(supabase): no usable token for connection="${params.connection}" — set connections.${params.connection} to enable refresh, or store an ${col.accessToken}`,
      )
    },
  }
}
