import { createRemoteJWKSet, jwtVerify } from 'jose'
import type {
  ApprovalParams,
  ApprovalPollResult,
  ApprovalResult,
  GetTokenParams,
  PendingApproval,
  PollApprovalParams,
  StartApprovalParams,
  Strategy,
  TokenResult,
} from 'nominee'

interface PostgresQueryResult<Row extends Record<string, unknown> = Record<string, unknown>> {
  rows: Row[]
}

interface PostgresClient {
  query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ): Promise<PostgresQueryResult<Row>>
}

interface PostgresDatabase {
  transaction<T>(operation: (client: PostgresClient) => Promise<T>): Promise<T>
}

const FEDERATED_GRANT =
  'urn:auth0:params:oauth:grant-type:token-exchange:federated-connection-access-token'
const FEDERATED_REQUESTED_TOKEN =
  'http://auth0.com/oauth/token-type/federated-connection-access-token'
const SUBJECT_REFRESH = 'urn:ietf:params:oauth:token-type:refresh_token'
const SUBJECT_ACCESS = 'urn:ietf:params:oauth:token-type:access_token'
const CIBA_GRANT = 'urn:openid:params:grant-type:ciba'

/** TTL of the built-in mock token (ms). Also the demo's compressed-expiry window. */
export const MOCK_TTL_MS = 3000

export interface Auth0CibaOptions {
  /**
   * Map a nominee user id to an Auth0 `login_hint` (typically the user's `sub`).
   * Defaults to the user id verbatim.
   */
  loginHint?: (user: string) => string | Promise<string>
  /**
   * Short message shown to the user on their device when approving. Auth0
   * limits this to ~64 chars. Defaults to `Approve: <action>`.
   */
  bindingMessage?: (params: ApprovalParams) => string | Promise<string>
  /** Scope requested for the approval. Default `"openid"`. */
  scope?: string
  /** API audience for the approval token, if your tenant requires one. */
  audience?: string
  /** Override the server-provided poll interval (ms). */
  pollIntervalMs?: number
  /** Durable request state used to resume polling after restart. */
  store?: CibaStore
  /** Per-request fetch deadline. Default 15 seconds. */
  requestTimeoutMs?: number
  /**
   * Override ID-token verification. The callback MUST verify signature,
   * issuer, audience, expiry, and return a trusted `sub`.
   */
  verifyIdToken?: (idToken: string) => Promise<Record<string, unknown>>
}

export interface Auth0Options {
  /** Your Auth0 tenant domain, e.g. `your-tenant.us.auth0.com`. */
  domain: string
  clientId: string
  clientSecret: string
  /**
   * Resolve the user's Auth0 token used as the token-exchange subject — read it
   * from your session store. Return the user's **refresh token** (recommended,
   * durable) or access token (set {@link subjectTokenType} to `"access_token"`).
   */
  subjectToken: (params: GetTokenParams) => string | Promise<string>
  /** Type of the subject token. Default `"refresh_token"`. */
  subjectTokenType?: 'refresh_token' | 'access_token'
  /**
   * Enable human-in-the-loop approval via CIBA (push/SMS to the user's device).
   * Omit to disable native approval — nominee then falls back to its built-in
   * approval engine.
   */
  ciba?: Auth0CibaOptions
  /** Custom fetch implementation (defaults to global `fetch`). Useful for tests. */
  fetch?: typeof fetch
}

interface TokenResponse {
  access_token?: string
  id_token?: string
  expires_in?: number
  scope?: string
}

interface BcAuthorizeResponse {
  auth_req_id: string
  expires_in?: number
  interval?: number
}

export interface CibaState {
  id: string
  user: string
  action: string
  expectedApprover: string
  inputHash?: string
  policyVersion?: string
  resource?: string
  tenant?: string
  intervalMs: number
  nextPollAt: number
  expiresAt: number
}

export interface CibaStore {
  readonly durable: boolean
  get(id: string): Promise<CibaState | null>
  put(state: CibaState): Promise<void>
  /**
   * Atomically claim a due poll and move `nextPollAt` forward. Returns null
   * when another worker already claimed it or the request does not exist.
   */
  claimPoll(id: string, now: number): Promise<CibaState | null>
  update(id: string, patch: Partial<CibaState>): Promise<CibaState>
  delete(id: string): Promise<void>
}

export class MemoryCibaStore implements CibaStore {
  readonly durable = false
  private readonly states = new Map<string, CibaState>()

  async get(id: string): Promise<CibaState | null> {
    const state = this.states.get(id)
    return state ? structuredClone(state) : null
  }

  async put(state: CibaState): Promise<void> {
    this.states.set(state.id, structuredClone(state))
  }

  async claimPoll(id: string, now: number): Promise<CibaState | null> {
    const state = this.states.get(id)
    if (!state || state.nextPollAt > now) return null
    const claimed = { ...state, nextPollAt: now + state.intervalMs }
    this.states.set(id, claimed)
    return structuredClone(claimed)
  }

  async update(id: string, patch: Partial<CibaState>): Promise<CibaState> {
    const state = this.states.get(id)
    if (!state) throw new Error(`nominee-auth0: CIBA request "${id}" was not found`)
    const next = { ...state, ...patch }
    this.states.set(id, structuredClone(next))
    return next
  }

  async delete(id: string): Promise<void> {
    this.states.delete(id)
  }
}

/** Idempotent PostgreSQL schema for {@link PostgresCibaStore}. */
export const POSTGRES_CIBA_SCHEMA = `
CREATE TABLE IF NOT EXISTS nominee_ciba_requests (
  id text PRIMARY KEY,
  state jsonb NOT NULL,
  next_poll_at bigint NOT NULL,
  expires_at bigint NOT NULL
);

CREATE INDEX IF NOT EXISTS nominee_ciba_requests_expiry_idx
  ON nominee_ciba_requests (expires_at);
`

/** Durable Auth0 CIBA request state using nominee-postgres' transaction adapter. */
export class PostgresCibaStore implements CibaStore {
  readonly durable = true

  constructor(private readonly database: PostgresDatabase) {}

  async get(id: string): Promise<CibaState | null> {
    return this.database.transaction(async (client) => readCibaState(client, id, false))
  }

  async put(state: CibaState): Promise<void> {
    await this.database.transaction(async (client) => {
      await client.query(
        `INSERT INTO nominee_ciba_requests (id, state, next_poll_at, expires_at)
         VALUES ($1, $2::jsonb, $3, $4)`,
        [state.id, JSON.stringify(state), state.nextPollAt, state.expiresAt],
      )
    })
  }

  async claimPoll(id: string, now: number): Promise<CibaState | null> {
    return this.database.transaction(async (client) => {
      const state = await readCibaState(client, id, true)
      if (!state || state.nextPollAt > now) return null
      const claimed = { ...state, nextPollAt: now + state.intervalMs }
      await writeCibaState(client, claimed)
      return claimed
    })
  }

  async update(id: string, patch: Partial<CibaState>): Promise<CibaState> {
    return this.database.transaction(async (client) => {
      const state = await readCibaState(client, id, true)
      if (!state) throw new Error(`nominee-auth0: CIBA request "${id}" was not found`)
      const next = { ...state, ...patch }
      await writeCibaState(client, next)
      return next
    })
  }

  async delete(id: string): Promise<void> {
    await this.database.transaction(async (client) => {
      await client.query('DELETE FROM nominee_ciba_requests WHERE id = $1', [id])
    })
  }
}

async function readCibaState(
  client: PostgresClient,
  id: string,
  lock: boolean,
): Promise<CibaState | null> {
  const result = await client.query<{ state: unknown }>(
    `SELECT state FROM nominee_ciba_requests WHERE id = $1${lock ? ' FOR UPDATE' : ''}`,
    [id],
  )
  const state = result.rows[0]?.state
  if (!state) return null
  return (typeof state === 'string' ? JSON.parse(state) : state) as CibaState
}

async function writeCibaState(client: PostgresClient, state: CibaState): Promise<void> {
  await client.query(
    `UPDATE nominee_ciba_requests
     SET state = $2::jsonb, next_poll_at = $3, expires_at = $4
     WHERE id = $1`,
    [state.id, JSON.stringify(state), state.nextPollAt, state.expiresAt],
  )
}

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })

/**
 * Auth0 strategy for nominee — the flagship, most complete strategy.
 *
 * - `getToken` brokers a fresh third-party token via **Auth0 Token Vault**
 *   (federated-connection token exchange), so your agent acts on the user's
 *   GitHub / Slack / Google / … without you ever touching those credentials.
 * - `requestApproval` runs **CIBA** human-in-the-loop: the user approves on
 *   their phone, then the agent resumes.
 *
 * Works with any nominee adapter (`nominee-ai`, `nominee-eve`) or standalone.
 *
 * ```ts
 * import { Nominee } from 'nominee'
 * import { Auth0 } from 'nominee-auth0'
 *
 * const nominee = new Nominee({
 *   strategy: Auth0({
 *     domain: process.env.AUTH0_DOMAIN!,
 *     clientId: process.env.AUTH0_CLIENT_ID!,
 *     clientSecret: process.env.AUTH0_CLIENT_SECRET!,
 *     subjectToken: ({ user }) => store.getRefreshToken(user), // your session store
 *     ciba: { loginHint: (user) => store.getAuth0Sub(user) },
 *   }),
 * })
 *
 * const token = await nominee.token({ user, connection: 'github' }) // always fresh
 * ```
 */
export function Auth0(options: Auth0Options): Strategy {
  const doFetch = options.fetch ?? globalThis.fetch
  if (typeof doFetch !== 'function') {
    throw new Error('nominee-auth0: no global fetch available; pass options.fetch')
  }
  const base = `https://${options.domain}`
  const subjectTokenType =
    options.subjectTokenType === 'access_token' ? SUBJECT_ACCESS : SUBJECT_REFRESH
  const cibaStore = options.ciba?.store ?? new MemoryCibaStore()
  const requestTimeoutMs = options.ciba?.requestTimeoutMs ?? 15_000
  const jwks = createRemoteJWKSet(new URL(`${base}/.well-known/jwks.json`))

  const signal = () => AbortSignal.timeout(requestTimeoutMs)

  async function verifyApprover(idToken: string): Promise<string> {
    const payload = options.ciba?.verifyIdToken
      ? await options.ciba.verifyIdToken(idToken)
      : (
          await jwtVerify(idToken, jwks, {
            issuer: `${base}/`,
            audience: options.clientId,
          })
        ).payload
    if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
      throw new Error('nominee-auth0: verified CIBA ID token has no subject')
    }
    return payload.sub
  }

  async function getToken(params: GetTokenParams): Promise<TokenResult> {
    const subjectToken = await options.subjectToken(params)
    const body = {
      grant_type: FEDERATED_GRANT,
      subject_token_type: subjectTokenType,
      subject_token: subjectToken,
      requested_token_type: FEDERATED_REQUESTED_TOKEN,
      connection: params.connection,
      client_id: options.clientId,
      client_secret: options.clientSecret,
      ...(params.scopes?.length ? { scope: params.scopes.join(' ') } : {}),
    }

    const res = await doFetch(`${base}/oauth/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body),
      signal: signal(),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(
        `nominee-auth0: Token Vault exchange for connection "${params.connection}" failed (${res.status}) ${text}`.trim(),
      )
    }

    const json = (await res.json()) as TokenResponse
    if (!json.access_token) {
      throw new Error('nominee-auth0: Token Vault exchange returned no access_token')
    }
    const result: TokenResult = { token: json.access_token }
    if (typeof json.expires_in === 'number') result.expiresAt = Date.now() + json.expires_in * 1000
    if (json.scope) result.scopes = json.scope.split(' ')
    return result
  }

  async function startApproval(params: StartApprovalParams): Promise<PendingApproval> {
    const ciba = options.ciba
    if (!ciba) {
      throw new Error(
        'nominee-auth0: approval requested but CIBA is not configured. Add `ciba` to Auth0() options, or remove `approval` from the tool.',
      )
    }

    const rawHint = ciba.loginHint ? await ciba.loginHint(params.user) : params.user
    // Auth0 CIBA requires `login_hint` as an `iss_sub` JSON object, not a bare
    // subject. Accept a pre-built JSON string (passed through as-is) or wrap a
    // plain subject — so callers can just return the user's `sub`.
    let expectedApprover = rawHint
    let loginHint: string
    if (rawHint.trim().startsWith('{')) {
      let parsed: unknown
      try {
        parsed = JSON.parse(rawHint)
      } catch {
        throw new Error('nominee-auth0: CIBA login_hint is not valid JSON')
      }
      if (
        !parsed ||
        typeof parsed !== 'object' ||
        typeof (parsed as { sub?: unknown }).sub !== 'string'
      ) {
        throw new Error('nominee-auth0: CIBA login_hint JSON must contain a subject')
      }
      expectedApprover = (parsed as { sub: string }).sub
      loginHint = rawHint
    } else {
      loginHint = JSON.stringify({ format: 'iss_sub', iss: `${base}/`, sub: rawHint })
    }
    const bindingMessage = ciba.bindingMessage
      ? await ciba.bindingMessage(params)
      : `Approve: ${params.action}`

    // 1. Backchannel authorization request.
    const authBody = new URLSearchParams({
      client_id: options.clientId,
      client_secret: options.clientSecret,
      scope: ciba.scope ?? 'openid',
      login_hint: loginHint,
      binding_message: bindingMessage,
    })
    if (ciba.audience) authBody.set('audience', ciba.audience)

    const authRes = await doFetch(`${base}/bc-authorize`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: authBody,
      signal: signal(),
    })
    if (!authRes.ok) {
      const text = await authRes.text().catch(() => '')
      throw new Error(`nominee-auth0: CIBA bc-authorize failed (${authRes.status}) ${text}`.trim())
    }
    const auth = (await authRes.json()) as BcAuthorizeResponse
    if (!auth.auth_req_id) {
      throw new Error('nominee-auth0: CIBA bc-authorize returned no auth_req_id')
    }
    const now = Date.now()
    const intervalMs = ciba.pollIntervalMs ?? (auth.interval ?? 5) * 1000
    const serverExpiresAt = now + (auth.expires_in ?? 300) * 1000
    const expiresAt = params.timeoutMs
      ? Math.min(serverExpiresAt, now + params.timeoutMs)
      : serverExpiresAt
    await cibaStore.put({
      id: auth.auth_req_id,
      user: params.user,
      action: params.action,
      expectedApprover,
      inputHash: params.inputHash,
      policyVersion: params.policyVersion,
      resource: params.resource,
      tenant: params.tenant,
      intervalMs,
      nextPollAt: now + intervalMs,
      expiresAt,
    })
    return { id: auth.auth_req_id, expiresAt, nextPollAt: now + intervalMs }
  }

  async function pollApproval(params: PollApprovalParams): Promise<ApprovalPollResult> {
    const existing = await cibaStore.get(params.id)
    if (!existing) {
      throw new Error(`nominee-auth0: CIBA request "${params.id}" was not found`)
    }
    const now = Date.now()
    if (existing.expiresAt <= now) {
      await cibaStore.delete(params.id)
      return { id: params.id, decision: 'expired', via: 'ciba' }
    }
    if (existing.nextPollAt > now) {
      return { id: params.id, decision: 'pending', nextPollAt: existing.nextPollAt }
    }
    const state = await cibaStore.claimPoll(params.id, now)
    if (!state) {
      const latest = await cibaStore.get(params.id)
      return {
        id: params.id,
        decision: 'pending',
        ...(latest ? { nextPollAt: latest.nextPollAt } : {}),
      }
    }

    const pollRes = await doFetch(`${base}/oauth/token`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        accept: 'application/json',
      },
      body: new URLSearchParams({
        grant_type: CIBA_GRANT,
        auth_req_id: state.id,
        client_id: options.clientId,
        client_secret: options.clientSecret,
      }),
      signal: signal(),
    })

    if (pollRes.ok) {
      const token = (await pollRes.json()) as TokenResponse
      if (!token.id_token) {
        await cibaStore.delete(state.id)
        throw new Error('nominee-auth0: CIBA approval returned no id_token')
      }
      const approver = await verifyApprover(token.id_token)
      await cibaStore.delete(state.id)
      if (approver !== state.expectedApprover) {
        throw new Error(
          `nominee-auth0: CIBA approver mismatch (expected "${state.expectedApprover}")`,
        )
      }
      return { id: state.id, decision: 'approved', approver, via: 'ciba' }
    }

    const err = (await pollRes.json().catch(() => ({}))) as { error?: string }
    if (err.error === 'authorization_pending') {
      return { id: state.id, decision: 'pending', nextPollAt: state.nextPollAt }
    }
    if (err.error === 'slow_down') {
      const slowed = await cibaStore.update(state.id, {
        intervalMs: state.intervalMs + 5_000,
        nextPollAt: Date.now() + state.intervalMs + 5_000,
      })
      return { id: state.id, decision: 'pending', nextPollAt: slowed.nextPollAt }
    }
    if (err.error === 'access_denied' || err.error === 'expired_token') {
      await cibaStore.delete(state.id)
      return {
        id: state.id,
        decision: err.error === 'access_denied' ? 'denied' : 'expired',
        via: 'ciba',
      }
    }
    throw new Error(`nominee-auth0: CIBA poll failed (${pollRes.status}) ${err.error ?? ''}`.trim())
  }

  async function requestApproval(params: ApprovalParams): Promise<ApprovalResult> {
    const pending = await startApproval({
      ...params,
      actionId: `legacy_${Date.now()}`,
      inputHash: 'legacy',
      policyVersion: 'legacy',
    })
    while (Date.now() < pending.expiresAt) {
      const state = await cibaStore.get(pending.id)
      if (!state) throw new Error(`nominee-auth0: CIBA request "${pending.id}" was not found`)
      await sleep(Math.max(0, state.nextPollAt - Date.now()))
      const result = await pollApproval({ id: pending.id })
      if (result.decision !== 'pending') return result
    }
    await cibaStore.delete(pending.id)
    return { id: pending.id, decision: 'expired', via: 'ciba' }
  }

  return options.ciba
    ? {
        name: 'auth0',
        durableApprovals: cibaStore.durable,
        getToken,
        startApproval,
        pollApproval,
        requestApproval,
      }
    : { name: 'auth0', getToken }
}

export interface Auth0AutoOptions extends Partial<Auth0Options> {
  /** Force mock mode regardless of env (used by tests/demos). Default: auto-detect. */
  mock?: boolean
  /** Env source. Default: `process.env`. */
  env?: Record<string, string | undefined>
}

function mockStrategy(): Strategy {
  return {
    name: 'auth0-mock',
    async getToken({ connection, user }: GetTokenParams): Promise<TokenResult> {
      return { token: `mock-${connection}-token-for-${user}`, expiresAt: Date.now() + MOCK_TTL_MS }
    },
    async requestApproval(_params: ApprovalParams): Promise<ApprovalResult> {
      // Simulate a CIBA push the user approves on their phone.
      await sleep(1500)
      return { id: `mock-${Date.now()}`, decision: 'approved' }
    },
  }
}

/**
 * Zero-config Auth0 strategy. Reads `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`,
 * `AUTH0_CLIENT_SECRET`, `AUTH0_REFRESH_TOKEN`, and `AUTH0_USER_SUB` from the
 * environment. When the core creds are absent it transparently falls back to a
 * built-in mock (short-TTL token + auto-approve) so an example runs with zero
 * setup. Configure the env (e.g. via `pnpm setup`) and the *same call* becomes
 * real Token Vault + CIBA — no code change.
 *
 * ```ts
 * const nominee = new Nominee({ strategy: auth0() })
 * ```
 */
export function auth0(options: Auth0AutoOptions = {}): Strategy {
  const env = options.env ?? (typeof process !== 'undefined' ? process.env : {})
  const domain = options.domain ?? env.AUTH0_DOMAIN
  const clientId = options.clientId ?? env.AUTH0_CLIENT_ID
  const clientSecret = options.clientSecret ?? env.AUTH0_CLIENT_SECRET

  const present = [domain, clientId, clientSecret].filter(Boolean).length
  const haveAll = present === 3

  if (options.mock === true) return mockStrategy()

  if (!haveAll) {
    // A half-set env signals intent to run real — fail loudly instead of mocking.
    if (present > 0) {
      const missing = [
        !domain && 'AUTH0_DOMAIN',
        !clientId && 'AUTH0_CLIENT_ID',
        !clientSecret && 'AUTH0_CLIENT_SECRET',
      ]
        .filter(Boolean)
        .join(', ')
      throw new Error(
        `nominee-auth0: incomplete Auth0 config (missing ${missing}). Run \`pnpm setup\` to provision your tenant, or unset all AUTH0_* vars to use mock mode.`,
      )
    }
    return mockStrategy()
  }

  // Real mode: resolve the subject (refresh) token + optional CIBA from env.
  let subjectToken = options.subjectToken
  if (!subjectToken) {
    const rt = env.AUTH0_REFRESH_TOKEN
    if (!rt) {
      throw new Error(
        'nominee-auth0: AUTH0_REFRESH_TOKEN is not set. Run `pnpm setup` to mint one (or pass subjectToken).',
      )
    }
    subjectToken = () => rt
  }

  const ciba =
    options.ciba ??
    (env.AUTH0_USER_SUB ? { loginHint: () => env.AUTH0_USER_SUB as string } : undefined)

  return Auth0({
    domain: domain as string,
    clientId: clientId as string,
    clientSecret: clientSecret as string,
    subjectToken,
    ...(options.subjectTokenType ? { subjectTokenType: options.subjectTokenType } : {}),
    ...(ciba ? { ciba } : {}),
    ...(options.fetch ? { fetch: options.fetch } : {}),
  })
}
