import { ApprovalEngine, type ApprovalRequest } from './approval.js'
import type { AuditEvent } from './audit.js'
import { type Effect, type Policy, type PolicyDecision, PolicyEngine, type Rule } from './policy.js'
import { type Receipt, ReceiptLedger, type ReceiptOptions, type VerifyResult } from './receipt.js'
import { tokens } from './strategies/tokens.js'
import type {
  ApprovalDecision,
  ApprovalParams,
  ApprovalResult,
  AuthzParams,
  ExchangeParams,
  GetTokenParams,
  Strategy,
  TokenResolver,
  TokenResult,
} from './strategy.js'

export interface NomineeOptions {
  /**
   * The authorization policy: ordered allow / deny / ask rules over tool
   * calls, built with the `allow` / `deny` / `ask` helpers. A plain array is
   * shorthand for `{ rules, fallback: 'ask' }`. Without a policy, `authorize`
   * and `guard` allow everything (and still write receipts) — add rules to
   * restrict.
   */
  policy?: Policy | Rule[]
  /**
   * Receipt ledger configuration: HMAC signing key, input recording mode
   * (`'hash'` by default — never stores user data), and an `onReceipt` sink.
   * Pass `false` to disable receipts entirely.
   */
  receipts?: ReceiptOptions | false
  /**
   * How tokens are brokered, when your tools need third-party credentials.
   * Either a full {@link Strategy} (Auth0, OAuth2, …) or — the simplest path —
   * a plain {@link TokenResolver} function that returns a token. Optional:
   * a policy-only nominee needs no strategy.
   */
  strategy?: Strategy | TokenResolver
  /** Called when an approval is pending and the strategy has no native flow. */
  onApprovalRequest?: (req: ApprovalRequest) => void | Promise<void>
  /** Receive every audit event. */
  onAudit?: (event: AuditEvent) => void
  /** Default approval wait time in ms before expiring. `0` = wait forever. */
  approvalTimeoutMs?: number
  /** Treat tokens as stale this many ms before real expiry. Default 60_000. */
  expiryLeewayMs?: number
  /** Acting agent identity, recorded in the audit chain. */
  agent?: string
}

export interface TokenParams extends GetTokenParams {
  /** Bypass the cache and force a fresh fetch from the strategy. */
  force?: boolean
}

/** A tool call submitted for authorization. */
export interface AuthorizeParams {
  /** Tool name matched against policy rules, e.g. `"email.forward"`. */
  tool: string
  /** The tool's input — visible to `when` predicates, hashed onto the receipt. */
  input?: unknown
  /** The principal the agent acts on behalf of. */
  user: string
  /** Force a human approval even when the policy allows the call. */
  requireApproval?: boolean
  /** Approval timeout override (ms) when this call escalates to a human. */
  timeoutMs?: number
}

/** Proof that a call was authorized: the decision, and how it was reached. */
export interface Authorization {
  /** Always `'allow'` — denial throws, so reaching a result means cleared. */
  effect: 'allow'
  /** The policy decision (its `effect` is `'ask'` when a human cleared it). */
  decision: PolicyDecision
  /** Present when the call was cleared by a human approval. */
  approval?: ApprovalResult
  /** The receipt sealed for this decision, when receipts are enabled. */
  receipt?: Receipt
}

/** Options for {@link Nominee.guard}. */
export interface GuardOptions {
  /**
   * The principal the wrapped tools act on behalf of: a fixed id, or a
   * function of `{ tool, input }` (resolve it from your session/context).
   */
  user: string | ((call: { tool: string; input: unknown }) => string | Promise<string>)
}

/** Thrown by {@link Nominee.approve} when a request is denied or expires. */
export class ApprovalDeniedError extends Error {
  constructor(readonly result: ApprovalResult) {
    super(`nominee: approval ${result.decision} (id=${result.id})`)
    this.name = 'ApprovalDeniedError'
  }
}

/**
 * Thrown by {@link Nominee.authorize} (and tools wrapped with
 * {@link Nominee.guard}) when the policy denies a call. Carries the decision
 * and the sealed receipt of the refusal — the paper trail of the attempt.
 */
export class PolicyDeniedError extends Error {
  constructor(
    readonly call: { tool: string; user: string },
    readonly decision: PolicyDecision,
    readonly receipt?: Receipt,
  ) {
    const rule = decision.ruleId ? ` (rule ${decision.ruleId})` : ''
    const reason = decision.reason ? ` — ${decision.reason}` : ''
    super(`nominee: policy denied "${call.tool}" for ${call.user}${rule}${reason}`)
    this.name = 'PolicyDeniedError'
  }
}

type AnyFn = (...args: any[]) => any

/**
 * The nominee engine — the authorization layer between an agent and its
 * tools. Every tool call is checked against a declarative policy
 * (allow / deny / ask), risky calls pause for human approval, every decision
 * is sealed into a tamper-evident receipt chain, and tools that need
 * third-party credentials get a fresh token at call time (never up front).
 */
export class Nominee {
  readonly strategy?: Strategy
  // Not readonly: a delegated sub-agent (see `delegate`) shares the parent's
  // cache, in-flight map, listeners, ledger, and approval engine by pointing
  // at them.
  private approvals: ApprovalEngine
  private engine: PolicyEngine
  private ledger?: ReceiptLedger
  private cache = new Map<string, TokenResult>()
  /** In-flight refreshes — concurrent cache-misses share one fetch (single-flight). */
  private inflight = new Map<string, Promise<TokenResult>>()
  private listeners = new Set<(e: AuditEvent) => void>()
  private readonly expiryLeewayMs: number
  private readonly agent?: string
  /** Delegation chain of agent identities: `[orchestrator, …, sub-agent]`. */
  private chainArr: string[]

  constructor(options: NomineeOptions = {}) {
    this.strategy =
      typeof options.strategy === 'function' ? tokens(options.strategy) : options.strategy
    this.engine = new PolicyEngine(options.policy ? [normalizePolicy(options.policy)] : [])
    if (options.receipts !== false) {
      this.ledger = new ReceiptLedger(options.receipts ?? {})
    }
    this.expiryLeewayMs = options.expiryLeewayMs ?? 60_000
    this.agent = options.agent
    this.chainArr = options.agent ? [options.agent] : []
    if (options.onAudit) this.listeners.add(options.onAudit)
    this.approvals = new ApprovalEngine(options.onApprovalRequest, options.approvalTimeoutMs ?? 0)
  }

  /** Subscribe to audit events. Returns an unsubscribe function. */
  on(listener: (e: AuditEvent) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /** The receipt chain: every decision, approval, and token grant so far. */
  get receipts(): readonly Receipt[] {
    return this.ledger?.all ?? []
  }

  /** Re-verify the receipt chain (hashes, links, sequence). */
  verifyReceipts(): VerifyResult {
    if (!this.ledger) return { ok: true, checked: 0 }
    return this.ledger.verify()
  }

  /**
   * Authorize a tool call against the policy. Resolves when the call may
   * proceed — either the policy allows it, or a human approved it. Throws
   * {@link PolicyDeniedError} on a deny rule, {@link ApprovalDeniedError}
   * when a human (or timeout) refuses an escalated call. Every outcome is
   * sealed into the receipt chain, including refusals.
   */
  async authorize(params: AuthorizeParams): Promise<Authorization> {
    const { tool, input, user } = params
    const chain = this.chain()
    const decision = await this.engine.evaluate({ tool, input, user, chain })

    let effect: Effect = decision.effect
    if (effect === 'allow' && params.requireApproval) {
      effect = 'ask'
      decision.reason ??= 'approval required by tool configuration'
    }

    const receipt = this.record(
      {
        type: 'policy.decision',
        user,
        action: tool,
        effect,
        rule: decision.ruleId,
        reason: decision.reason,
        chain,
      },
      { input, escalated: decision.escalated },
    )

    if (effect === 'deny') {
      throw new PolicyDeniedError({ tool, user }, decision, receipt)
    }

    if (effect === 'ask') {
      // Throws ApprovalDeniedError if the human denies / it expires.
      const approval = await this.approve({
        user,
        action: tool,
        detail: input,
        timeoutMs: params.timeoutMs ?? decision.rule?.timeoutMs,
      })
      return { effect: 'allow', decision, approval, receipt }
    }

    return { effect: 'allow', decision, receipt }
  }

  /**
   * Non-enforcing policy check: returns the decision a call *would* get,
   * without asking anyone, throwing, consuming budgets, or writing receipts.
   * Use it to test policies and to pre-flight risky plans.
   */
  async check(params: Omit<AuthorizeParams, 'requireApproval'>): Promise<PolicyDecision> {
    return this.engine.evaluate(
      { tool: params.tool, input: params.input, user: params.user, chain: this.chain() },
      { commit: false },
    )
  }

  /**
   * Wrap a tools object so every call is authorized first — the one-line
   * integration. Works with plain async functions and with any framework
   * whose tools expose an `execute` (Vercel AI SDK, Eve, Mastra, OpenAI
   * Agents, MCP servers):
   *
   * ```ts
   * const tools = nominee.guard({ searchEmail, forwardEmail, deleteRepo }, {
   *   user: 'alice',
   * })
   * ```
   *
   * Denied calls throw {@link PolicyDeniedError} before the tool runs;
   * `ask` calls block until a human decides. The key in the object is the
   * tool name your policy matches on.
   */
  guard<T extends object>(tools: T, opts: GuardOptions): T {
    const out: Record<string, unknown> = {}
    for (const [name, value] of Object.entries(tools)) {
      if (typeof value === 'function') {
        out[name] = this.guardFn(name, value as AnyFn, opts)
      } else if (
        value !== null &&
        typeof value === 'object' &&
        typeof (value as { execute?: unknown }).execute === 'function'
      ) {
        const original = (value as { execute: AnyFn }).execute.bind(value)
        out[name] = { ...(value as object), execute: this.guardFn(name, original, opts) }
      } else {
        out[name] = value
      }
    }
    return out as T
  }

  private guardFn(tool: string, fn: AnyFn, opts: GuardOptions): AnyFn {
    return async (...args: unknown[]) => {
      const input = args[0]
      const user = typeof opts.user === 'function' ? await opts.user({ tool, input }) : opts.user
      await this.authorize({ tool, input, user })
      return fn(...args)
    }
  }

  /**
   * Get a token that is valid right now for the user's connection.
   * Cached per (user, connection) until shortly before expiry, then refreshed
   * transparently — this is what survives long-running / durable execution.
   */
  async token(params: TokenParams): Promise<string> {
    const strategy = this.requireStrategy('token')
    const { user, connection, scopes, force } = params
    const key = this.cacheKey(user, connection)

    if (!force) {
      const cached = this.cache.get(key)
      if (this.isFresh(cached)) {
        this.record({ type: 'token.cached', user, connection, chain: this.chain() })
        return cached.token
      }
      // Coalesce: if a refresh for this key is already in flight, wait for it
      // instead of starting a second one (prevents refresh stampedes when a
      // long-running agent fires many tool calls at once).
      const pending = this.inflight.get(key)
      if (pending) {
        const result = await pending
        this.record({ type: 'token.cached', user, connection, chain: this.chain() })
        return result.token
      }
    }

    const fetchPromise = strategy.getToken({ user, connection, scopes })
    // `force` always fetches its own token and never coalesces with others.
    if (!force) this.inflight.set(key, fetchPromise)

    try {
      const result = await fetchPromise
      // Only cache when expiry is known; otherwise always re-fetch to stay safe.
      if (result.expiresAt !== undefined) this.cache.set(key, result)
      else this.cache.delete(key)
      this.record({ type: 'token.issued', user, connection, chain: this.chain() })
      return result.token
    } catch (err) {
      this.record({
        type: 'token.error',
        user,
        connection,
        chain: this.chain(),
        detail: err instanceof Error ? err.message : String(err),
      })
      throw err
    } finally {
      if (!force) this.inflight.delete(key)
    }
  }

  /**
   * Drop any cached token for (user, connection) so the next {@link token} call
   * re-resolves from the strategy. Call this after you revoke access upstream
   * (at your provider or token store): because nominee resolves at call time and
   * never holds a token longer than the cache, the revocation takes effect on the
   * very next call — `invalidate` just makes it immediate instead of waiting out
   * the expiry leeway. Returns true if a cached entry was removed.
   */
  invalidate(user: string, connection: string): boolean {
    const removed = this.cache.delete(this.cacheKey(user, connection))
    this.record({ type: 'token.invalidated', user, connection, chain: this.chain() })
    return removed
  }

  /**
   * Block until a human approves `action`. Uses the strategy's native flow
   * (e.g. Auth0 CIBA) if present, otherwise the built-in engine — settle those
   * via {@link resolveApproval}. Throws {@link ApprovalDeniedError} on
   * denial/expiry.
   */
  async approve(params: ApprovalParams): Promise<ApprovalResult> {
    const { user, action } = params
    this.record(
      {
        type: 'approval.requested',
        user,
        action,
        chain: this.chain(),
        detail: params.detail,
      },
      { input: params.detail, omitDetail: true },
    )

    const result = this.strategy?.requestApproval
      ? await this.strategy.requestApproval(params)
      : await this.approvals.request(params)

    this.record({
      type: 'approval.resolved',
      user,
      action,
      decision: result.decision,
      chain: this.chain(),
    })

    if (result.decision !== 'approved') throw new ApprovalDeniedError(result)
    return result
  }

  /**
   * Settle a pending approval created by the built-in engine — call this from
   * your approval webhook/handler. No-op (returns false) for strategy-native
   * flows or unknown ids.
   */
  resolveApproval(id: string, decision: ApprovalDecision): boolean {
    return this.approvals.resolve(id, decision)
  }

  /** Fine-grained authorization check. Requires a strategy that implements `can`. */
  async can(params: AuthzParams): Promise<boolean> {
    const strategy = this.requireStrategy('can')
    if (!strategy.can) {
      throw new Error(
        `nominee: strategy "${strategy.name}" does not implement can() (authorization)`,
      )
    }
    const allowed = await strategy.can(params)
    this.record({
      type: 'authz.checked',
      user: params.user,
      action: params.action,
      resource: params.resource,
      decision: allowed,
      chain: this.chain(),
    })
    return allowed
  }

  /**
   * Spawn a sub-agent that shares this nominee's strategy, token cache,
   * receipt chain, and audit stream but records an extended identity chain —
   * every event from the child carries `user → …this chain → actor`, so a
   * delegated action is attributable to the exact sub-agent that took it.
   *
   * A sub-agent's policy can only *narrow* authority: pass extra rules and
   * the strictest outcome across the whole chain wins (deny > ask > allow).
   * A sub-agent can never allow what its parent denies.
   *
   * ```ts
   * const researcher = orchestrator.delegate('research-agent', {
   *   policy: [deny('email.*'), deny('github.merge_*')],
   * })
   * ```
   */
  delegate(actor: string, opts: { policy?: Policy | Rule[] } = {}): Nominee {
    const child = new Nominee({
      strategy: this.strategy,
      agent: this.agent,
      expiryLeewayMs: this.expiryLeewayMs,
      receipts: false, // replaced by the shared parent ledger below
    })
    // Share the parent's mutable internals so a sub-agent doesn't refetch what
    // the orchestrator already cached, and its audit events reach the same sinks.
    child.cache = this.cache
    child.inflight = this.inflight
    child.listeners = this.listeners
    child.approvals = this.approvals
    child.ledger = this.ledger
    // A sub-agent policy is a set of restrictions on top of the chain, so its
    // fallback defaults to 'allow' (defer to the parent) — set one explicitly
    // to tighten unmatched calls too.
    child.engine = this.engine.narrow(
      opts.policy ? { fallback: 'allow', ...normalizePolicy(opts.policy) } : undefined,
    )
    child.chainArr = [...this.chainArr, actor]
    return child
  }

  /**
   * Exchange the user's token for a downscoped one bound to a sub-agent `actor`
   * (RFC 8693 token exchange). Requires a strategy that implements `exchange`.
   * Emits `token.exchanged` with the delegation chain.
   */
  async exchange(params: ExchangeParams): Promise<string> {
    const strategy = this.requireStrategy('exchange')
    if (!strategy.exchange) {
      throw new Error(
        `nominee: strategy "${strategy.name}" does not implement exchange() (token exchange)`,
      )
    }
    const result = await strategy.exchange(params)
    this.record({
      type: 'token.exchanged',
      user: params.user,
      connection: params.connection,
      chain: [...this.chainArr, params.actor],
    })
    return result.token
  }

  private requireStrategy(method: string): Strategy {
    if (!this.strategy) {
      throw new Error(
        `nominee: ${method}() needs a strategy — pass one to new Nominee({ strategy }) (a plain async function returning a token is enough)`,
      )
    }
    return this.strategy
  }

  private cacheKey(user: string, connection: string): string {
    return `${user}::${connection}`
  }

  private isFresh(t: TokenResult | undefined): t is TokenResult {
    if (!t || t.expiresAt === undefined) return false
    return t.expiresAt - this.expiryLeewayMs > Date.now()
  }

  /**
   * Notify audit listeners and seal a receipt for one event. `extra.input`
   * is recorded on the receipt per the ledger's input mode (hashed by
   * default); `omitDetail` keeps free-form detail off the receipt when the
   * input already carries it.
   */
  private record(
    e: Omit<AuditEvent, 'at' | 'agent'>,
    extra: { input?: unknown; escalated?: 'budget'; omitDetail?: boolean } = {},
  ): Receipt | undefined {
    // `agent` is the leaf of the chain — the identity that actually acted.
    const agent = this.chainArr.length ? this.chainArr[this.chainArr.length - 1] : undefined
    const event: AuditEvent = { ...e, agent, at: Date.now() }
    for (const l of this.listeners) l(event)

    return this.ledger?.append({
      type: e.type,
      user: e.user,
      agent,
      chain: e.chain,
      tool: e.action,
      connection: e.connection,
      effect: e.effect,
      rule: e.rule,
      reason: e.reason,
      decision: e.decision,
      escalated: extra.escalated,
      detail: extra.omitDetail ? undefined : e.detail,
      input: extra.input,
    })
  }

  private chain(): string[] | undefined {
    return this.chainArr.length ? this.chainArr : undefined
  }
}

function normalizePolicy(policy: Policy | Rule[]): Policy {
  return Array.isArray(policy) ? { rules: policy } : policy
}
