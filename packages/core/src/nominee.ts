import {
  type ActionCapability,
  type ActionOutcome,
  ActionPendingError,
  type ActionRecord,
  type ActionStore,
  CapabilityInvalidError,
  MemoryActionStore,
} from './action.js'
import { ApprovalEngine, type ApprovalRequest } from './approval.js'
import type { AuditEvent } from './audit.js'
import { canonicalJson, sha256 } from './hash.js'
import { ObservationCollector, type ObservationReportV2 } from './observe.js'
import {
  type Effect,
  type Policy,
  type PolicyDecision,
  PolicyEngine,
  type Rule,
  matchTool,
} from './policy.js'
import {
  type Receipt,
  type ReceiptEntry,
  ReceiptLedger,
  type ReceiptOptions,
  type VerifyResult,
} from './receipt.js'
import { tokens } from './strategies/tokens.js'
import type {
  ApprovalDecision,
  ApprovalParams,
  ApprovalResult,
  AuthzParams,
  CredentialAuthorizationContext,
  ExchangeParams,
  GetTokenParams,
  Strategy,
  TokenResolver,
  TokenResult,
} from './strategy.js'

/**
 * Whether nominee enforces its policy decisions (`'enforce'`, the default) or
 * records them without applying deny/ask/budget gates (`'observe'`). Runtime,
 * integrity, and persistence failures still fail closed in either mode.
 */
export type NomineeMode = 'enforce' | 'observe'

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
  /** Durable action/capability state. Defaults to an in-process conformance store. */
  actionStore?: ActionStore
  /**
   * Application authorization source. When omitted, a strategy's `can()` is
   * used for calls carrying `resource`.
   */
  authorizer?: (params: AuthzParams) => boolean | Promise<boolean>
  /** Stable identifier written into every action and receipt. Default `"unversioned"`. */
  policyVersion?: string
  /** Maximum lifetime of a prepared action. Default 24 hours. */
  actionTtlMs?: number
  /** Lifetime of a single-use capability. Default 5 minutes. */
  capabilityTtlMs?: number
  /**
   * Fail construction unless policy, durable action state, atomic receipts,
   * and strict receipt delivery are configured.
   */
  production?: boolean
  /**
   * `'enforce'` (the default) is nominee: deny refuses, ask waits for a human.
   *
   * `'observe'` is report-only. Policy decisions are still made and sealed
   * into receipts, but deny/ask/budget gates and false authorizer results are
   * not enforced. Runtime, integrity, authorizer, and persistence errors still
   * fail closed. Use it to find out what an agent actually does before writing a policy; see
   * {@link Nominee.observe} and {@link Nominee.observations}.
   *
   * Observe mode announces itself loudly on startup and is refused outright
   * under `production: true` — it cannot be silently active on a production
   * path.
   */
  mode?: NomineeMode
  /** Measurement hook emitted once when a real governed action reaches a terminal state. */
  onGovernedAction?: (event: GovernedActionEvent) => void | Promise<void>
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
  /** Resource checked by the configured application authorizer / strategy.can(). */
  resource?: string
  /** Tenant boundary forwarded to external authorization and receipts. */
  tenant?: string
}

/** Proof that a call was authorized: the decision, and how it was reached. */
export interface Authorization {
  /** Always `'allow'` — denial throws, so reaching a result means cleared. */
  effect: 'allow'
  /** The immutable identity of the call that was authorized. */
  call: { tool: string; user: string }
  /** SHA-256 fingerprint of the exact input evaluated by the policy / approver. */
  inputHash: string
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
  /** Resolve the application resource protected by each call. */
  resource?: string | ((call: { tool: string; input: unknown }) => string | Promise<string>)
  /** Resolve the tenant boundary protected by each call. */
  tenant?: string | ((call: { tool: string; input: unknown }) => string | Promise<string>)
}

/**
 * Options for {@link Nominee.observe}. Everything is optional: observe mode's
 * whole point is that wrapping your tools requires no configuration.
 */
export interface ObserveOptions {
  /**
   * The principal the wrapped tools act on behalf of. Defaults to
   * `'observed-user'` — a report about your own agent's traffic does not
   * need a real identity to be useful.
   */
  user?: string | ((call: { tool: string; input: unknown }) => string | Promise<string>)
  /** Resolve the application resource protected by each call. */
  resource?: string | ((call: { tool: string; input: unknown }) => string | Promise<string>)
  /** Resolve the tenant boundary protected by each call. */
  tenant?: string | ((call: { tool: string; input: unknown }) => string | Promise<string>)
}

export interface PrepareActionParams extends AuthorizeParams {
  /** Third-party connection whose credential is needed by the exact action. */
  connection?: string
  /** Maximum credential scope ceiling for the exact action. */
  scopes?: string[]
  /** Override the configured action lifetime. */
  expiresInMs?: number
  /**
   * Trusted proof that the enclosing framework already paused and approved
   * this exact tool call. Official adapters populate this from their run
   * context; do not accept it from model-controlled input.
   */
  frameworkApproval?: FrameworkApprovalEvidence
}

export interface FrameworkApprovalEvidence {
  id: string
  via: string
  approver?: string
}

export type PreparedAction =
  | { status: 'ready'; action: ActionRecord; capability: string }
  | { status: 'pending_approval'; action: ActionRecord; approvalId: string }
  | { status: 'denied'; action: ActionRecord }
  | { status: 'expired'; action: ActionRecord }

export interface ExecuteActionContext {
  action: ActionRecord
  /** The exact input bound to policy/approval/capability for this execution. */
  input: unknown
  /** Credential resolved only after the capability is atomically consumed. */
  token?: string
}

export interface GovernedActionEvent {
  actionId: string
  user: string
  tenant?: string
  action: string
  resource?: string
  status: 'succeeded' | 'failed' | 'denied' | 'expired'
  at: number
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

/**
 * Thrown when a tool's input changed after nominee authorized it. Official
 * wrappers check this immediately before execution so the tool cannot run
 * with arguments different from the ones evaluated by policy or a human.
 */
export class AuthorizationInputChangedError extends Error {
  constructor(
    readonly call: { tool: string; user: string },
    readonly expectedInputHash: string,
    readonly actualInputHash: string,
    readonly receipt?: Receipt,
  ) {
    super(`nominee: input for "${call.tool}" changed after authorization for ${call.user}`)
    this.name = 'AuthorizationInputChangedError'
  }
}

export class ExternalAuthorizationDeniedError extends Error {
  constructor(
    readonly call: { tool: string; user: string; resource: string; tenant?: string },
    readonly receipt?: Receipt,
  ) {
    super(
      `nominee: external authorization denied "${call.tool}" on "${call.resource}" for ${call.user}`,
    )
    this.name = 'ExternalAuthorizationDeniedError'
  }
}

/**
 * The governed action reached (or needed to record) a terminal result, but
 * persisting its outcome/evidence failed. Callers must inspect `actionId` and
 * downstream idempotency state before retrying.
 */
export class ActionOutcomePersistenceError extends Error {
  constructor(
    readonly actionId: string,
    readonly executionStatus: 'succeeded' | 'failed',
    readonly persistenceError: unknown,
    readonly executionError?: unknown,
  ) {
    super(
      executionStatus === 'succeeded'
        ? `nominee: action ${actionId} executed successfully but outcome/evidence persistence failed; do not retry without checking idempotency`
        : `nominee: action ${actionId} failed and its failure outcome/evidence could not be persisted`,
      { cause: persistenceError },
    )
    this.name = 'ActionOutcomePersistenceError'
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
  private actionStore: ActionStore
  private readonly authorizer?: (params: AuthzParams) => boolean | Promise<boolean>
  private readonly onApprovalRequest?: (req: ApprovalRequest) => void | Promise<void>
  private readonly onGovernedAction?: (event: GovernedActionEvent) => void | Promise<void>
  private readonly policyVersion: string
  private readonly actionTtlMs: number
  private readonly capabilityTtlMs: number
  private production: boolean
  /** `'enforce'` or `'observe'`. Never changes after construction. */
  private modeValue: NomineeMode
  /** Present only in observe mode; shared with delegated sub-agents. */
  private observations_?: ObservationCollector
  private actionApprovalResolvers = new Map<string, (decision: ApprovalDecision) => void>()
  private cache = new Map<string, TokenResult>()
  /** In-flight refreshes — concurrent cache-misses share one fetch (single-flight). */
  private inflight = new Map<string, Promise<TokenResult>>()
  /** Generation per (user, connection), bumped when all scoped variants are invalidated. */
  private tokenGenerations = new Map<string, number>()
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
    this.actionStore = options.actionStore ?? new MemoryActionStore()
    this.authorizer = options.authorizer
    this.onApprovalRequest = options.onApprovalRequest
    this.onGovernedAction = options.onGovernedAction
    this.policyVersion = options.policyVersion ?? 'unversioned'
    this.actionTtlMs = options.actionTtlMs ?? 24 * 60 * 60 * 1000
    this.capabilityTtlMs = options.capabilityTtlMs ?? 5 * 60 * 1000
    this.production = options.production ?? false
    this.modeValue = options.mode ?? 'enforce'
    this.expiryLeewayMs = options.expiryLeewayMs ?? 60_000
    this.agent = options.agent
    this.chainArr = options.agent ? [options.agent] : []
    if (options.onAudit) this.listeners.add(options.onAudit)
    this.approvals = new ApprovalEngine(options.onApprovalRequest, options.approvalTimeoutMs ?? 0)

    if (this.production && this.modeValue === 'observe') {
      throw new Error(
        "nominee: mode: 'observe' cannot be combined with production: true — observe mode " +
          'does not enforce policy decisions, so a production path would be unguarded. Remove one of them. ' +
          'See https://nominee.dev/docs/#observe',
      )
    }

    if (this.modeValue === 'observe') {
      this.observations_ = new ObservationCollector()
      if (this.engine.active) this.observations_.markPolicyConfigured()
      announceObserveMode()
    }

    if (this.production) {
      const problems = [
        !this.engine.defaultDeny && 'a default-deny policy',
        !this.actionStore.durable && 'a durable actionStore',
        !this.ledger?.durable && 'an atomic durable receipt store',
        this.ledger?.delivery !== 'strict' && "receipts.delivery: 'strict'",
        this.strategy?.startApproval &&
          !this.strategy.durableApprovals &&
          'durable provider approval state',
      ].filter(Boolean)
      if (problems.length) {
        throw new Error(
          `nominee: production mode requires ${problems.join(', ')}. Use fallback: 'deny', a durable actionStore, nominee-postgres for an atomic durable receipt store, and receipts.delivery: 'strict'. See https://nominee.dev/docs/production`,
        )
      }
    } else if (this.modeValue === 'enforce') {
      this.warnApprovalDeadEnds(options)
    }
  }

  /** Subscribe to audit events. Returns an unsubscribe function. */
  on(listener: (e: AuditEvent) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /**
   * `'enforce'` (decisions are enforced) or `'observe'` (decisions are
   * recorded only). Fixed at construction — nothing can flip a nominee into
   * observe mode later, and a delegated sub-agent always inherits its
   * parent's mode.
   */
  get mode(): NomineeMode {
    return this.modeValue
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

  /** Verify the complete atomically-sequenced receipt stream. */
  async verifyDurableReceipts(): Promise<VerifyResult> {
    if (!this.ledger) return { ok: true, checked: 0 }
    return this.ledger.verifyAtomic()
  }

  /**
   * Wait for every async receipt sink write queued so far. With
   * `receipts.delivery: 'strict'`, async authorization/token methods call this
   * before returning; buffered delivery lets the application choose its
   * checkpoint and shutdown boundaries.
   */
  async flushReceipts(): Promise<void> {
    await this.ledger?.flush()
  }

  /**
   * Authorize a tool call against the policy. Resolves when the call may
   * proceed — either the policy allows it, or a human approved it. Throws
   * {@link PolicyDeniedError} on a deny rule, {@link ApprovalDeniedError}
   * when a human (or timeout) refuses an escalated call. Every outcome is
   * sealed into the receipt chain, including refusals.
   */
  async authorize(params: AuthorizeParams): Promise<Authorization> {
    if (this.production) {
      throw new Error(
        'nominee: authorize() is not decision-bound in production mode; use prepareAction() or run()',
      )
    }
    const { tool, input, user } = params
    const inputHash = fingerprintInput(input)
    const chain = this.chain()
    const externalAuthorization = await this.checkExternalAuthorization({
      user,
      action: tool,
      resource: params.resource,
      tenant: params.tenant,
      inputHash,
    })
    let decision: PolicyDecision =
      externalAuthorization === false
        ? { effect: 'deny', reason: 'external application authorization denied the resource' }
        : await this.engine.evaluate({
            tool,
            input,
            user,
            resource: params.resource,
            tenant: params.tenant,
            chain,
          })

    let effect: Effect = decision.effect
    if (effect === 'allow' && params.requireApproval) {
      effect = 'ask'
      decision = {
        ...decision,
        effect,
        reason: decision.reason ?? 'approval required by tool configuration',
      }
    }

    // Preserve the policy decision exactly. Observe mode changes enforcement,
    // not the verdict returned to the caller or sealed into the receipt.
    const enforced: Effect = this.modeValue === 'observe' ? 'allow' : effect

    const receipt = this.record(
      {
        type: 'policy.decision',
        user,
        action: tool,
        effect,
        rule: decision.ruleId,
        reason: observeReason(this.modeValue, decision, effect),
        chain,
        resource: params.resource,
        tenant: params.tenant,
      },
      { input, escalated: decision.escalated },
    )
    await this.flushStrictReceipts()

    if (enforced === 'deny') {
      if (externalAuthorization === false && params.resource) {
        throw new ExternalAuthorizationDeniedError(
          {
            tool,
            user,
            resource: params.resource,
            ...(params.tenant ? { tenant: params.tenant } : {}),
          },
          receipt,
        )
      }
      throw new PolicyDeniedError({ tool, user }, decision, receipt)
    }

    if (enforced === 'ask') {
      // Throws ApprovalDeniedError if the human denies / it expires.
      const approval = await this.approve({
        user,
        action: tool,
        detail: input,
        timeoutMs: params.timeoutMs ?? decision.rule?.timeoutMs,
      })
      return { effect: 'allow', call: { tool, user }, inputHash, decision, approval, receipt }
    }

    return { effect: 'allow', call: { tool, user }, inputHash, decision, receipt }
  }

  /**
   * Verify that the input about to execute is byte-for-byte equivalent (under
   * canonical JSON) to the input that policy and any approver evaluated.
   *
   * `guard`, `nomineeTool`, and `guardTools` call this automatically. Use it
   * after a manual `authorize()` call when other async work happens before
   * execution.
   */
  async assertUnchanged(authorization: Authorization, input: unknown): Promise<void> {
    const actualInputHash = fingerprintInput(input)
    if (actualInputHash === authorization.inputHash) return

    const reason = 'tool input changed after authorization'
    const receipt = this.record(
      {
        type: 'policy.decision',
        user: authorization.call.user,
        action: authorization.call.tool,
        effect: 'deny',
        reason,
        chain: this.chain(),
      },
      { input },
    )
    await this.flushStrictReceipts()
    throw new AuthorizationInputChangedError(
      authorization.call,
      authorization.inputHash,
      actualInputHash,
      receipt,
    )
  }

  /**
   * Create a durable, exact-input action and return either a single-use
   * capability or a resumable approval handle.
   */
  async prepareAction(params: PrepareActionParams): Promise<PreparedAction> {
    const now = Date.now()
    const inputHash = fingerprintInput(params.input)
    const actionId = randomId('act')
    const expiresAt = now + (params.expiresInMs ?? this.actionTtlMs)
    const action: ActionRecord = {
      id: actionId,
      version: 0,
      status: 'planned',
      user: params.user,
      ...(params.tenant ? { tenant: params.tenant } : {}),
      ...(this.chainArr.at(-1) ? { agent: this.chainArr.at(-1) } : {}),
      ...(this.chain() ? { chain: this.chain() } : {}),
      action: params.tool,
      ...(params.resource ? { resource: params.resource } : {}),
      inputHash,
      policyVersion: this.policyVersion,
      ...(params.connection ? { connection: params.connection } : {}),
      ...(params.scopes?.length ? { scopes: normalizeScopes(params.scopes) } : {}),
      createdAt: now,
      updatedAt: now,
      expiresAt,
    }
    await this.actionStore.create(action)
    await this.recordAction('action.planned', action, { input: params.input })

    let externalAuthorization: boolean | undefined
    try {
      externalAuthorization = await this.checkExternalAuthorization({
        user: params.user,
        action: params.tool,
        resource: params.resource,
        tenant: params.tenant,
        inputHash,
      })
    } catch (error) {
      const reason = `external authorization failed: ${
        error instanceof Error ? error.message : String(error)
      }`
      const failed = await this.actionStore.applyDecision(actionId, { effect: 'deny', reason }, [])
      await this.recordAction('authz.checked', failed.action, {
        decision: false,
        reason,
      })
      await this.recordAction('policy.decision', failed.action, {
        input: params.input,
        effect: 'deny',
        reason,
      })
      await this.emitGovernedAction(failed.action)
      throw error
    }
    if (externalAuthorization !== undefined) {
      await this.recordAction('authz.checked', action, { decision: externalAuthorization })
    }

    let decision: PolicyDecision
    if (externalAuthorization === false) {
      decision = {
        effect: 'deny',
        reason: 'external application authorization denied the resource',
      }
    } else {
      try {
        decision = await this.engine.evaluateForAction(
          {
            tool: params.tool,
            input: params.input,
            user: params.user,
            resource: params.resource,
            tenant: params.tenant,
            chain: this.chain(),
          },
          this.policyVersion,
        )
      } catch (error) {
        const reason = `policy evaluation failed: ${
          error instanceof Error ? error.message : String(error)
        }`
        const failed = await this.actionStore.applyDecision(
          actionId,
          { effect: 'deny', reason, externalAuthorization },
          [],
        )
        await this.recordAction('policy.decision', failed.action, {
          input: params.input,
          effect: 'deny',
          reason,
        })
        await this.emitGovernedAction(failed.action)
        throw error
      }
    }
    if (decision.effect === 'allow' && params.requireApproval) {
      decision = { ...decision, effect: 'ask', reason: 'approval required by tool configuration' }
    }

    // Observe mode changes only lifecycle enforcement. The original effect,
    // rule, and reason stay on the action and receipt.
    const observation = this.modeValue === 'observe' ? ('observe' as const) : undefined
    const approval =
      !observation && decision.effect === 'ask'
        ? this.newActionApproval(actionId, params)
        : undefined
    let applied = await this.actionStore.applyDecision(
      actionId,
      {
        effect: decision.effect,
        rule: decision.ruleId,
        reason: decision.reason,
        externalAuthorization,
        approval,
        enforcement: observation,
      },
      decision.budgets ?? [],
    )

    if (applied.exhausted) {
      decision = {
        effect: 'ask',
        rule: decision.rule,
        ruleId: decision.ruleId,
        policyIndex: decision.policyIndex,
        escalated: 'budget',
        reason: `budget of ${applied.exhausted.limit} calls exhausted`,
        budgets: [],
      }
      applied = await this.actionStore.applyDecision(
        actionId,
        {
          effect: decision.effect,
          rule: decision.ruleId,
          reason: decision.reason,
          externalAuthorization,
          approval:
            !observation && decision.effect === 'ask'
              ? this.newActionApproval(actionId, params)
              : undefined,
          enforcement: observation,
        },
        [],
      )
    }

    await this.recordAction('policy.decision', applied.action, {
      input: params.input,
      effect: decision.effect,
      rule: decision.ruleId,
      reason: observeReason(this.modeValue, decision, decision.effect),
      escalated: decision.escalated,
    })

    if (decision.effect === 'deny' && !observation) {
      await this.emitGovernedAction(applied.action)
      if (externalAuthorization === false && params.resource) {
        throw new ExternalAuthorizationDeniedError({
          tool: params.tool,
          user: params.user,
          resource: params.resource,
          ...(params.tenant ? { tenant: params.tenant } : {}),
        })
      }
      throw new PolicyDeniedError({ tool: params.tool, user: params.user }, decision)
    }

    if (applied.action.status === 'pending_approval' && params.frameworkApproval) {
      await this.recordAction('approval.requested', applied.action, {
        input: params.input,
        approvalId: applied.action.approval?.id,
        detail: { providerApprovalId: params.frameworkApproval.id },
      })
      const resolved = await this.resolveActionApproval(applied.action.id, {
        decision: 'approved',
        approver: params.frameworkApproval.approver,
        via: params.frameworkApproval.via,
        providerId: params.frameworkApproval.id,
      })
      return this.issueActionCapability(resolved)
    }

    if (applied.action.status === 'pending_approval') {
      return this.startActionApproval(applied.action, params)
    }
    return this.issueActionCapability(applied.action)
  }

  /** Resolve a pending durable approval from a webhook or approval UI. */
  async resolveActionApproval(
    actionId: string,
    resolution: {
      decision: ApprovalDecision
      approver?: string
      via?: string
      providerId?: string
    },
  ): Promise<ActionRecord> {
    const action = await this.actionStore.resolveApproval(actionId, {
      ...resolution,
      resolvedAt: Date.now(),
    })
    await this.recordAction('approval.resolved', action, {
      decision: resolution.decision,
      approvalId: action.approval?.id,
      approver: resolution.approver,
    })
    await this.emitGovernedAction(action)
    return action
  }

  /**
   * Resume a durable action after approval. Provider-native approvals are
   * polled once; callers can retry later while the result remains pending.
   */
  async resumeAction(actionId: string): Promise<PreparedAction> {
    let action = await this.actionStore.get(actionId)
    if (!action) throw new Error(`nominee: action ${actionId} was not found`)

    if (action.status === 'pending_approval' && action.approval?.providerId) {
      const pollApproval = this.strategy?.pollApproval
      if (!pollApproval) {
        throw new Error(
          `nominee: strategy approval ${action.approval.providerId} cannot be resumed`,
        )
      }
      const result = await pollApproval({ id: action.approval.providerId })
      if (result.decision === 'pending') {
        return {
          status: 'pending_approval',
          action,
          approvalId: action.approval.id,
        }
      }
      action = await this.resolveActionApproval(actionId, {
        decision: result.decision,
        approver: result.approver,
        via: result.via,
        providerId: result.id,
      })
    }

    if (action.status === 'pending_approval') {
      return { status: 'pending_approval', action, approvalId: action.approval?.id ?? actionId }
    }
    if (action.status === 'denied' || action.status === 'expired') {
      await this.emitGovernedAction(action)
      return { status: action.status, action }
    }
    if (
      action.status === 'policy_checked' ||
      action.status === 'approved' ||
      action.status === 'capability_issued'
    ) {
      return this.issueActionCapability(action)
    }
    throw new Error(`nominee: action ${actionId} cannot be resumed from "${action.status}"`)
  }

  /**
   * Atomically consume a capability, resolve any third-party credential under
   * its action/resource/scope ceiling, execute once, and persist the outcome.
   */
  async executeCapability<T>(
    capability: string,
    input: unknown,
    execute: (context: ExecuteActionContext) => T | Promise<T>,
  ): Promise<T> {
    const actualInputHash = fingerprintInput(input)
    const hintedActionId = capabilityActionId(capability)
    const hintedAction = hintedActionId ? await this.actionStore.get(hintedActionId) : null
    if (
      hintedAction &&
      (hintedAction.enforcement === 'observe') !== (this.modeValue === 'observe')
    ) {
      throw new CapabilityInvalidError(
        'nominee: capability enforcement mode does not match this Nominee instance',
      )
    }
    if (hintedAction && hintedAction.inputHash !== actualInputHash) {
      const receipt = await this.recordAction('policy.decision', hintedAction, {
        input,
        effect: 'deny',
        reason: 'tool input changed after authorization',
      })
      throw new AuthorizationInputChangedError(
        { tool: hintedAction.action, user: hintedAction.user },
        hintedAction.inputHash,
        actualInputHash,
        receipt,
      )
    }
    const action = await this.actionStore.consumeCapability({
      tokenHash: sha256(capability),
      inputHash: actualInputHash,
      now: Date.now(),
    })
    let observedExecutionEffect: Effect = action.policyEffect ?? 'allow'
    try {
      await this.recordAction('capability.consumed', action, {
        capabilityId: action.capability?.id,
      })
    } catch (error) {
      try {
        await this.actionStore.complete(action.id, {
          status: 'failed',
          at: Date.now(),
          error: 'receipt persistence failed before tool execution',
        })
      } catch {
        // Preserve the evidence failure below; action journal recovery handles
        // a store that also failed while recording the terminal transition.
      }
      throw new ActionOutcomePersistenceError(action.id, 'failed', error)
    }

    if (action.resource) {
      let currentAuthorization: boolean | undefined
      try {
        currentAuthorization = await this.checkExternalAuthorization({
          user: action.user,
          action: action.action,
          resource: action.resource,
          tenant: action.tenant,
          inputHash: action.inputHash,
        })
      } catch (error) {
        try {
          await this.recordAction('authz.checked', action, {
            decision: false,
            reason: `pre-execution authorization failed: ${
              error instanceof Error ? error.message : String(error)
            }`,
          })
          await this.terminateConsumedAction(action, error)
        } catch (persistenceError) {
          throw new ActionOutcomePersistenceError(action.id, 'failed', persistenceError, error)
        }
        throw error
      }

      let receipt: Receipt | undefined
      try {
        receipt = await this.recordAction('authz.checked', action, {
          decision: currentAuthorization,
          reason:
            currentAuthorization === false
              ? this.modeValue === 'observe'
                ? 'observe mode: external application authorization was revoked before execution; enforcement is off, so the call was allowed to run'
                : 'external application authorization was revoked before execution'
              : undefined,
        })
      } catch (error) {
        try {
          await this.actionStore.complete(action.id, {
            status: 'failed',
            at: Date.now(),
            error: 'authorization evidence persistence failed before tool execution',
          })
        } catch {
          // The durable action journal is the recovery source if both writes fail.
        }
        throw new ActionOutcomePersistenceError(action.id, 'failed', error)
      }

      // Observe mode never blocks: the revocation is on the receipt above,
      // but the call still runs, exactly as it would without nominee.
      if (currentAuthorization === false) observedExecutionEffect = 'deny'
      if (currentAuthorization === false && this.modeValue === 'enforce') {
        const denial = new ExternalAuthorizationDeniedError(
          {
            tool: action.action,
            user: action.user,
            resource: action.resource,
            ...(action.tenant ? { tenant: action.tenant } : {}),
          },
          receipt,
        )
        try {
          await this.terminateConsumedAction(action, denial)
        } catch (persistenceError) {
          throw new ActionOutcomePersistenceError(action.id, 'failed', persistenceError, denial)
        }
        throw denial
      }
    }

    try {
      await this.recordAction('execution.started', action, {
        capabilityId: action.capability?.id,
      })
    } catch (error) {
      try {
        await this.actionStore.complete(action.id, {
          status: 'failed',
          at: Date.now(),
          error: 'receipt persistence failed before tool execution',
        })
      } catch {
        // Preserve the evidence failure below; action journal recovery handles
        // a store that also failed while recording the terminal transition.
      }
      throw new ActionOutcomePersistenceError(action.id, 'failed', error)
    }

    let result: T
    try {
      let token: string | undefined
      if (action.connection && action.capability) {
        const authorization: CredentialAuthorizationContext = {
          actionId: action.id,
          capabilityId: action.capability.id,
          action: action.action,
          ...(action.resource ? { resource: action.resource } : {}),
          ...(action.tenant ? { tenant: action.tenant } : {}),
          inputHash: action.inputHash,
          policyVersion: action.policyVersion,
        }
        token = await this.boundToken({
          user: action.user,
          connection: action.connection,
          scopes: action.scopes,
          authorization,
        })
        await this.recordAction('token.issued', action, {
          connection: action.connection,
          capabilityId: action.capability.id,
        })
      }

      // A call belongs in the observation report only once its tool callback
      // is actually about to run. Planning, pending approvals, and token
      // failures therefore do not inflate execution counts.
      this.observations_?.record({
        tool: action.action,
        input,
        user: action.user,
        effect: observedExecutionEffect,
      })
      result = await execute({ action, input, token })
    } catch (error) {
      const outcome: ActionOutcome & { status: 'failed' } = {
        status: 'failed',
        at: Date.now(),
        error: error instanceof Error ? error.message : String(error),
      }
      try {
        const completed = await this.actionStore.complete(action.id, outcome)
        await this.recordAction('execution.failed', completed, {
          outcome: 'failed',
          capabilityId: action.capability?.id,
          detail: { error: outcome.error },
        })
        await this.emitGovernedAction(completed)
      } catch (persistenceError) {
        throw new ActionOutcomePersistenceError(action.id, 'failed', persistenceError, error)
      }
      throw error
    }

    const outcome: ActionOutcome & { status: 'succeeded' } = {
      status: 'succeeded',
      at: Date.now(),
      resultHash: fingerprintInput(result),
    }
    try {
      const completed = await this.actionStore.complete(action.id, outcome)
      await this.recordAction('execution.succeeded', completed, {
        outcome: 'succeeded',
        capabilityId: action.capability?.id,
        detail: { resultHash: outcome.resultHash },
      })
      await this.emitGovernedAction(completed)
    } catch (error) {
      throw new ActionOutcomePersistenceError(action.id, 'succeeded', error)
    }
    return result
  }

  /** Prepare and execute one decision-bound action. */
  async run<T>(
    params: PrepareActionParams,
    execute: (context: ExecuteActionContext) => T | Promise<T>,
  ): Promise<T> {
    const prepared = await this.prepareAction(params)
    if (prepared.status === 'pending_approval') {
      throw new ActionPendingError(prepared.action.id, prepared.approvalId, prepared.action.action)
    }
    if (prepared.status === 'denied' || prepared.status === 'expired') {
      throw new ApprovalDeniedError({
        id: prepared.action.approval?.id ?? prepared.action.id,
        decision: prepared.status === 'expired' ? 'expired' : 'denied',
        approver: prepared.action.approval?.approver,
        via: prepared.action.approval?.via,
      })
    }
    return this.executeCapability(prepared.capability, params.input, execute)
  }

  async getAction(actionId: string): Promise<ActionRecord | null> {
    return this.actionStore.get(actionId)
  }

  /**
   * Non-enforcing policy check: returns the decision a call *would* get,
   * without asking anyone, throwing, consuming budgets, or writing receipts.
   * Use it to test policies and to pre-flight risky plans.
   */
  async check(params: Omit<AuthorizeParams, 'requireApproval'>): Promise<PolicyDecision> {
    return this.engine.evaluate(
      {
        tool: params.tool,
        input: params.input,
        user: params.user,
        resource: params.resource,
        tenant: params.tenant,
        chain: this.chain(),
      },
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
   * `ask` calls resolve inline or throw {@link ActionPendingError} for durable
   * resume. The key in the object is the tool name your policy matches on.
   */
  guard<T extends object>(tools: T, opts: GuardOptions): T {
    this.warnNeverMatchingRules(Object.keys(tools))
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

  /**
   * Wrap a tools object in report-only mode: every call is recorded, **no
   * call is blocked**. Requires `mode: 'observe'` and needs no policy at all —
   * that is the entire point.
   *
   * ```ts
   * const nominee = new Nominee({ mode: 'observe' })
   * const tools = nominee.observe({ readOrder, issueRefund, exportCustomers })
   * // …run your agent as usual, then:
   * console.log(formatObservations(nominee.observations()))
   * ```
   *
   * The receipts are the same hash-chained receipts enforcing mode writes,
   * each one marked `enforcement: 'observe'` so the log can never be mistaken
   * for a record of enforcement.
   */
  observe<T extends object>(tools: T, opts: ObserveOptions = {}): T {
    if (this.modeValue !== 'observe') {
      throw new Error(
        "nominee: observe() requires mode: 'observe' — construct with new Nominee({ mode: " +
          "'observe' }). Enforcing instances must use guard(), which blocks denied calls.",
      )
    }
    this.observations_?.registerTools(
      Object.entries(tools)
        .filter(
          ([, value]) =>
            typeof value === 'function' ||
            (value !== null &&
              typeof value === 'object' &&
              typeof (value as { execute?: unknown }).execute === 'function'),
        )
        .map(([name]) => name),
    )
    return this.guard(tools, { ...opts, user: opts.user ?? 'observed-user' })
  }

  /**
   * What observe mode has seen so far: which tools were called, how often,
   * for how many users, which arguments are unbounded, and what the policy
   * (if any) would have said. Empty outside observe mode.
   *
   * Pair with `formatObservations()` for a terminal report, or serialize it —
   * it is plain JSON. Strings and booleans are represented by bounded hashed
   * cardinality, while numeric inputs are summarized as ranges and a sampled
   * median; treat those aggregates as sensitive when the numbers are sensitive.
   */
  observations(): ObservationReportV2 {
    return (this.observations_ ?? new ObservationCollector()).report()
  }

  private guardFn(tool: string, fn: AnyFn, opts: GuardOptions): AnyFn {
    return async (...args: unknown[]) => {
      const input = args[0]
      const call = { tool, input }
      const user = typeof opts.user === 'function' ? await opts.user(call) : opts.user
      const resource =
        typeof opts.resource === 'function' ? await opts.resource(call) : opts.resource
      const tenant = typeof opts.tenant === 'function' ? await opts.tenant(call) : opts.tenant
      return this.run({ tool, input, user, resource, tenant }, () => fn(...args))
    }
  }

  /**
   * Get a token that is valid right now for the user's connection.
   * Cached per (user, connection, canonical scope set) until shortly before
   * expiry, then refreshed transparently — this is what survives long-running
   * / durable execution.
   */
  async token(params: TokenParams): Promise<string> {
    if (this.production) {
      throw new Error(
        'nominee: unbound token() is disabled in production mode; resolve credentials through run()',
      )
    }
    const strategy = this.requireStrategy('token')
    const { user, connection, scopes, force } = params
    const normalizedScopes = normalizeScopes(scopes)
    const identity = this.tokenIdentity(user, connection)
    const generation = this.tokenGenerations.get(identity) ?? 0
    const key = this.cacheKey(user, connection, normalizedScopes, generation)

    if (!force) {
      const cached = this.cache.get(key)
      if (this.isFresh(cached)) {
        this.record({ type: 'token.cached', user, connection, chain: this.chain() })
        await this.flushStrictReceipts()
        return cached.token
      }
      // Coalesce: if a refresh for this key is already in flight, wait for it
      // instead of starting a second one (prevents refresh stampedes when a
      // long-running agent fires many tool calls at once).
      const pending = this.inflight.get(key)
      if (pending) {
        const result = await pending
        this.record({ type: 'token.cached', user, connection, chain: this.chain() })
        await this.flushStrictReceipts()
        return result.token
      }
    }

    const fetchPromise = strategy.getToken({
      user,
      connection,
      scopes: normalizedScopes.length ? normalizedScopes : undefined,
    })
    // `force` always fetches its own token and never coalesces with others.
    if (!force) this.inflight.set(key, fetchPromise)

    try {
      const result = await fetchPromise
      // Only cache when expiry is known; otherwise always re-fetch to stay safe.
      if ((this.tokenGenerations.get(identity) ?? 0) === generation) {
        if (result.expiresAt !== undefined) this.cache.set(key, result)
        else this.cache.delete(key)
      }
      this.record({ type: 'token.issued', user, connection, chain: this.chain() })
      await this.flushStrictReceipts()
      return result.token
    } catch (err) {
      this.record({
        type: 'token.error',
        user,
        connection,
        chain: this.chain(),
        detail: err instanceof Error ? err.message : String(err),
      })
      await this.flushStrictReceipts()
      throw err
    } finally {
      if (!force && this.inflight.get(key) === fetchPromise) this.inflight.delete(key)
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
    const identity = this.tokenIdentity(user, connection)
    this.tokenGenerations.set(identity, (this.tokenGenerations.get(identity) ?? 0) + 1)
    let removed = false
    for (const key of this.cache.keys()) {
      if (this.cacheKeyMatches(key, user, connection)) {
        this.cache.delete(key)
        removed = true
      }
    }
    for (const key of this.inflight.keys()) {
      if (this.cacheKeyMatches(key, user, connection)) this.inflight.delete(key)
    }
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
    await this.flushStrictReceipts()

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
    await this.flushStrictReceipts()

    if (result.decision !== 'approved') throw new ApprovalDeniedError(result)
    return result
  }

  /**
   * Settle a pending approval created by the built-in engine — call this from
   * your approval webhook/handler. No-op (returns false) for strategy-native
   * flows or unknown ids.
   */
  resolveApproval(id: string, decision: ApprovalDecision): boolean {
    const actionResolver = this.actionApprovalResolvers.get(id)
    if (actionResolver) {
      actionResolver(decision)
      return true
    }
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
    await this.flushStrictReceipts()
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
      actionStore: this.actionStore,
      authorizer: this.authorizer,
      policyVersion: this.policyVersion,
      actionTtlMs: this.actionTtlMs,
      capabilityTtlMs: this.capabilityTtlMs,
      onApprovalRequest: this.onApprovalRequest,
      onGovernedAction: this.onGovernedAction,
      receipts: false, // replaced by the shared parent ledger below
    })
    // Share the parent's mutable internals so a sub-agent doesn't refetch what
    // the orchestrator already cached, and its audit events reach the same sinks.
    child.cache = this.cache
    child.inflight = this.inflight
    child.tokenGenerations = this.tokenGenerations
    child.listeners = this.listeners
    child.approvals = this.approvals
    child.actionApprovalResolvers = this.actionApprovalResolvers
    child.ledger = this.ledger
    child.production = this.production
    // Mode is inherited, never chosen by the sub-agent: a delegated agent can
    // no more turn enforcement off than it can widen its policy.
    child.modeValue = this.modeValue
    child.observations_ = this.observations_
    // A sub-agent policy is a set of restrictions on top of the chain, so its
    // fallback defaults to 'allow' (defer to the parent) — set one explicitly
    // to tighten unmatched calls too.
    child.engine = this.engine.narrow(
      opts.policy ? { fallback: 'allow', ...normalizePolicy(opts.policy) } : undefined,
    )
    if (child.modeValue === 'observe' && child.engine.active) {
      child.observations_?.markPolicyConfigured()
    }
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
    await this.flushStrictReceipts()
    return result.token
  }

  private newActionApproval(
    actionId: string,
    params: Pick<PrepareActionParams, 'timeoutMs'>,
  ): NonNullable<ActionRecord['approval']> {
    const requestedAt = Date.now()
    const expiresAt =
      requestedAt + (params.timeoutMs && params.timeoutMs > 0 ? params.timeoutMs : this.actionTtlMs)
    return {
      id: `apr_${actionId.slice(4)}`,
      requestedAt,
      expiresAt,
    }
  }

  private async startActionApproval(
    action: ActionRecord,
    params: PrepareActionParams,
  ): Promise<PreparedAction> {
    await this.recordAction('approval.requested', action, {
      input: params.input,
      approvalId: action.approval?.id,
    })

    if (this.strategy?.startApproval) {
      const pending = await this.strategy.startApproval({
        user: action.user,
        action: action.action,
        detail: params.input,
        timeoutMs: params.timeoutMs,
        actionId: action.id,
        inputHash: action.inputHash,
        policyVersion: action.policyVersion,
        resource: action.resource,
        tenant: action.tenant,
      })
      const attached = await this.actionStore.attachApprovalProvider(action.id, {
        id: pending.id,
        expiresAt: pending.expiresAt,
      })
      return {
        status: 'pending_approval',
        action: attached,
        approvalId: attached.approval?.id ?? action.id,
      }
    }

    if (this.strategy?.requestApproval) {
      const result = await this.strategy.requestApproval({
        user: action.user,
        action: action.action,
        detail: params.input,
        timeoutMs: params.timeoutMs,
      })
      const resolved = await this.resolveActionApproval(action.id, {
        decision: result.decision,
        approver: result.approver,
        via: result.via,
        providerId: result.id,
      })
      return result.decision === 'approved'
        ? this.issueActionCapability(resolved)
        : { status: result.decision === 'expired' ? 'expired' : 'denied', action: resolved }
    }

    let inlineDecision: ApprovalDecision | undefined
    let callbackReturned = false
    const approvalId = action.approval?.id ?? action.id
    const settle = (decision: ApprovalDecision) => {
      this.actionApprovalResolvers.delete(approvalId)
      if (!callbackReturned) {
        inlineDecision = decision
      } else {
        void this.resolveActionApproval(action.id, { decision, via: 'callback' })
      }
    }
    this.actionApprovalResolvers.set(approvalId, settle)
    await this.onApprovalRequest?.({
      user: action.user,
      action: action.action,
      detail: params.input,
      timeoutMs: params.timeoutMs,
      id: approvalId,
      approve: () => settle('approved'),
      deny: () => settle('denied'),
      resolve: settle,
    })
    callbackReturned = true

    if (inlineDecision) {
      const resolved = await this.resolveActionApproval(action.id, {
        decision: inlineDecision,
        via: 'callback',
      })
      return inlineDecision === 'approved'
        ? this.issueActionCapability(resolved)
        : { status: inlineDecision === 'expired' ? 'expired' : 'denied', action: resolved }
    }

    const pending = (await this.actionStore.get(action.id)) ?? action
    if (pending.status === 'approved') return this.issueActionCapability(pending)
    if (pending.status === 'denied' || pending.status === 'expired') {
      return { status: pending.status, action: pending }
    }
    return {
      status: 'pending_approval',
      action: pending,
      approvalId: pending.approval?.id ?? pending.id,
    }
  }

  private async issueActionCapability(action: ActionRecord): Promise<PreparedAction> {
    const secret = randomId('sec')
    const token = `nom_cap_${action.id}.${secret}`
    const now = Date.now()
    const capability: ActionCapability = {
      id: randomId('cap'),
      tokenHash: sha256(token),
      issuedAt: now,
      expiresAt: Math.min(action.expiresAt, now + this.capabilityTtlMs),
      ...(action.connection ? { connection: action.connection } : {}),
      ...(action.scopes?.length ? { scopes: action.scopes } : {}),
    }
    const issued = await this.actionStore.issueCapability(action.id, capability)
    await this.recordAction('capability.issued', issued, {
      capabilityId: capability.id,
    })
    return { status: 'ready', action: issued, capability: token }
  }

  private async checkExternalAuthorization(params: {
    user: string
    action: string
    resource?: string
    tenant?: string
    inputHash: string
  }): Promise<boolean | undefined> {
    if (!params.resource) return undefined
    const check = this.authorizer ?? this.strategy?.can
    if (!check) {
      if (this.production) {
        throw new Error(
          `nominee: production action "${params.action}" names a resource but no authorizer/can() is configured`,
        )
      }
      return undefined
    }
    const decision = await check({
      user: params.user,
      action: params.action,
      resource: params.resource,
      tenant: params.tenant,
      inputHash: params.inputHash,
    })
    if (decision !== true && decision !== false) {
      throw new Error(
        `nominee: external authorizer for "${params.action}" returned a non-boolean decision`,
      )
    }
    return decision
  }

  private async boundToken(
    params: GetTokenParams & { authorization: CredentialAuthorizationContext },
  ): Promise<string> {
    const strategy = this.requireStrategy('bound credential')
    const requested = normalizeScopes(params.scopes)
    const result = await strategy.getToken({
      ...params,
      scopes: requested.length ? requested : undefined,
    })
    if (requested.length && result.scopes?.some((scope) => !requested.includes(scope))) {
      throw new Error(
        `nominee: strategy "${strategy.name}" returned scopes outside the action ceiling`,
      )
    }
    return result.token
  }

  private async emitGovernedAction(action: ActionRecord): Promise<void> {
    if (
      !this.onGovernedAction ||
      (action.status !== 'succeeded' &&
        action.status !== 'failed' &&
        action.status !== 'denied' &&
        action.status !== 'expired')
    ) {
      return
    }
    await this.onGovernedAction({
      actionId: action.id,
      user: action.user,
      tenant: action.tenant,
      action: action.action,
      resource: action.resource,
      status: action.status,
      at: action.outcome?.at ?? action.updatedAt,
    })
  }

  private async terminateConsumedAction(action: ActionRecord, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : String(error)
    const completed = await this.actionStore.complete(action.id, {
      status: 'failed',
      at: Date.now(),
      error: message,
    })
    await this.recordAction('execution.failed', completed, {
      outcome: 'failed',
      capabilityId: action.capability?.id,
      detail: { error: message },
    })
    await this.emitGovernedAction(completed)
  }

  private async recordAction(
    type: AuditEvent['type'],
    action: ActionRecord,
    extra: Partial<ReceiptEntry> = {},
  ): Promise<Receipt | undefined> {
    const event: AuditEvent = {
      ...this.enforcementMark,
      type,
      user: action.user,
      agent: action.agent,
      chain: action.chain,
      action: action.action,
      resource: action.resource,
      tenant: action.tenant,
      actionId: action.id,
      policyVersion: action.policyVersion,
      at: Date.now(),
      effect: extra.effect,
      rule: extra.rule,
      reason: extra.reason,
      decision: extra.decision as AuditEvent['decision'],
      detail: extra.detail,
    }
    for (const listener of this.listeners) listener(event)
    return this.ledger?.appendAtomic({
      ...this.enforcementMark,
      type,
      user: action.user,
      agent: action.agent,
      chain: action.chain,
      tool: action.action,
      actionId: action.id,
      resource: action.resource,
      tenant: action.tenant,
      policyVersion: action.policyVersion,
      effect: extra.effect,
      escalated: extra.escalated,
      rule: extra.rule,
      reason: extra.reason,
      decision: extra.decision,
      approvalId: extra.approvalId,
      approver: extra.approver,
      capabilityId: extra.capabilityId,
      outcome: extra.outcome,
      connection: extra.connection,
      input: extra.input,
      detail: extra.detail,
    })
  }

  private requireStrategy(method: string): Strategy {
    if (!this.strategy) {
      throw new Error(
        `nominee: ${method}() needs a strategy — pass one to new Nominee({ strategy }) (a plain async function returning a token is enough)`,
      )
    }
    return this.strategy
  }

  private tokenIdentity(user: string, connection: string): string {
    return canonicalJson([user, connection])
  }

  private cacheKey(
    user: string,
    connection: string,
    scopes: readonly string[],
    generation: number,
  ): string {
    return canonicalJson([user, connection, scopes, generation])
  }

  private cacheKeyMatches(key: string, user: string, connection: string): boolean {
    const parsed = JSON.parse(key) as [string, string]
    return parsed[0] === user && parsed[1] === connection
  }

  private isFresh(t: TokenResult | undefined): t is TokenResult {
    if (!t || t.expiresAt === undefined) return false
    return t.expiresAt - this.expiryLeewayMs > Date.now()
  }

  private async flushStrictReceipts(): Promise<void> {
    if (this.ledger?.delivery === 'strict') await this.ledger.flush()
  }

  /**
   * Stamped onto every receipt and audit event written in observe mode, so a
   * log can never be mistaken for a record of enforcement. Empty (and absent
   * from the hashed content) in enforcing mode.
   */
  private get enforcementMark(): { enforcement?: 'observe' } {
    return this.modeValue === 'observe' ? { enforcement: 'observe' } : {}
  }

  private warnApprovalDeadEnds(options: NomineeOptions): void {
    if (!this.shouldWarn()) return
    if (options.onApprovalRequest || this.strategy?.startApproval) return

    for (const policy of this.engine.policies) {
      if (policy.fallback === undefined || policy.fallback === 'ask') {
        console.warn(
          "nominee: policy fallback is 'ask' but no onApprovalRequest or approval strategy is configured; approvals will wait forever. Add onApprovalRequest or set fallback: 'deny'. See https://nominee.dev/docs/approvals",
        )
        break
      }
      if (policy.rules.some((rule) => rule.effect === 'ask')) {
        console.warn(
          'nominee: ask rules are configured but no onApprovalRequest or approval strategy is configured; approvals will wait forever. Add onApprovalRequest or use deny/allow for these rules. See https://nominee.dev/docs/approvals',
        )
        break
      }
    }
  }

  private warnNeverMatchingRules(toolNames: string[]): void {
    if (!this.shouldWarn()) return
    for (const policy of this.engine.policies) {
      for (const rule of policy.rules) {
        for (const pattern of rule.tools) {
          if (toolNames.some((tool) => matchTool(pattern, tool))) continue
          const suggestion = nearestTool(pattern, toolNames)
          console.warn(
            `nominee: rule "${pattern}" never matched any guarded tool${
              suggestion ? ` — did you mean "${suggestion}"?` : ''
            }. See https://nominee.dev/docs/policies`,
          )
        }
      }
    }
  }

  private shouldWarn(): boolean {
    return globalThis.process?.env?.NODE_ENV !== 'production'
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
    const event: AuditEvent = { ...this.enforcementMark, ...e, agent, at: Date.now() }
    for (const l of this.listeners) l(event)

    return this.ledger?.append({
      ...this.enforcementMark,
      type: e.type,
      user: e.user,
      agent,
      chain: e.chain,
      tool: e.action,
      actionId: e.actionId,
      resource: e.resource,
      tenant: e.tenant,
      policyVersion: e.policyVersion,
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

/** Explain non-enforcement on receipts without mutating the policy decision itself. */
function observeReason(
  mode: NomineeMode,
  decision: PolicyDecision,
  effect: Effect,
): string | undefined {
  if (mode !== 'observe' || effect === 'allow') return decision.reason
  const because = decision.reason ? ` (${decision.reason})` : ''
  return `observe mode: policy said "${effect}"${because}; enforcement is off, so the call was allowed to run`
}

/**
 * The startup notice. Observe mode is a deliberate exception to nominee's
 * "fail closed, and say so" commitment, so it says so — every time, in every
 * environment, including `NODE_ENV=production` where it matters most.
 */
function announceObserveMode(): void {
  const lines = [
    '',
    '  ┌──────────────────────────────────────────────────────────────────────┐',
    '  │  nominee: OBSERVE MODE — ENFORCEMENT IS OFF                          │',
    '  ├──────────────────────────────────────────────────────────────────────┤',
    '  │  Policy decisions are recorded, not enforced. Denies, asks, and      │',
    '  │  budgets do not stop calls. Runtime and integrity failures still     │',
    '  │  fail closed. Receipts are written as usual, marked                  │',
    '  │  enforcement: "observe".                                             │',
    '  │                                                                      │',
    "  │  Remove mode: 'observe' to start enforcing.                          │",
    '  │  https://nominee.dev/docs/#observe                                   │',
    '  └──────────────────────────────────────────────────────────────────────┘',
  ]
  if (globalThis.process?.env?.NODE_ENV === 'production') {
    lines.push(
      '  NODE_ENV=production and nominee is NOT enforcing anything. This is a',
      '  report-only run: policy decisions below are not enforced.',
    )
  }
  lines.push('')
  console.warn(lines.join('\n'))
}

function normalizePolicy(policy: Policy | Rule[]): Policy {
  return Array.isArray(policy) ? { rules: policy } : policy
}

function normalizeScopes(scopes: readonly string[] | undefined): string[] {
  return [...new Set(scopes ?? [])].sort()
}

function fingerprintInput(input: unknown): string {
  const serialized = canonicalJson(input)
  return sha256(serialized ?? 'undefined')
}

/** Closest guarded tool name to a rule pattern, for "did you mean" suggestions. */
export function nearestTool(pattern: string, tools: string[]): string | undefined {
  const literal = pattern.replace(/\*/g, '')
  let best: { tool: string; distance: number } | undefined
  for (const tool of tools) {
    const distance = levenshtein(literal, tool)
    if (!best || distance < best.distance) best = { tool, distance }
  }
  if (!best) return undefined
  return best.distance <= Math.max(2, Math.ceil(Math.max(literal.length, best.tool.length) / 2))
    ? best.tool
    : undefined
}

function levenshtein(a: string, b: string): number {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index)
  for (let i = 1; i <= a.length; i++) {
    let diagonal = i - 1
    previous[0] = i
    for (let j = 1; j <= b.length; j++) {
      const above = previous[j] ?? 0
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      previous[j] = Math.min((previous[j - 1] ?? 0) + 1, above + 1, diagonal + cost)
      diagonal = above
    }
  }
  return previous[b.length] ?? a.length
}

function randomId(prefix: string): string {
  if (!globalThis.crypto?.getRandomValues) {
    throw new Error('nominee: secure Web Crypto randomness is required for action capabilities')
  }
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(18))
  return `${prefix}_${[...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`
}

function capabilityActionId(capability: string): string | undefined {
  if (!capability.startsWith('nom_cap_')) return undefined
  const separator = capability.indexOf('.')
  return separator > 'nom_cap_'.length ? capability.slice('nom_cap_'.length, separator) : undefined
}
