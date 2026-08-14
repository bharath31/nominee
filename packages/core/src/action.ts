import type { ApprovalDecision } from './strategy.js'

export type ActionStatus =
  | 'planned'
  | 'policy_checked'
  | 'pending_approval'
  | 'approved'
  | 'capability_issued'
  | 'executing'
  | 'succeeded'
  | 'failed'
  | 'denied'
  | 'expired'

export interface BudgetRequirement {
  /** Stable key for the policy/rule/principal budget. */
  key: string
  limit: number
}

export interface BudgetReservation extends BudgetRequirement {
  actionId: string
  expiresAt: number
  state: 'reserved' | 'committed'
}

export interface ActionApproval {
  id: string
  providerId?: string
  decision?: ApprovalDecision
  approver?: string
  via?: string
  requestedAt: number
  resolvedAt?: number
  expiresAt: number
}

export interface ActionCapability {
  id: string
  /** Only the SHA-256 digest is persisted. The bearer secret is returned once. */
  tokenHash: string
  issuedAt: number
  expiresAt: number
  consumedAt?: number
  connection?: string
  scopes?: string[]
}

export interface ActionOutcome {
  at: number
  resultHash?: string
  error?: string
}

/**
 * Durable source of truth for one exact agent action. Tool input is represented
 * only by its canonical hash; applications may keep raw input in their own
 * encrypted workflow state.
 */
export interface ActionRecord {
  id: string
  version: number
  status: ActionStatus
  user: string
  tenant?: string
  agent?: string
  chain?: string[]
  action: string
  resource?: string
  inputHash: string
  policyVersion: string
  /** The policy's actual verdict, even when observe mode does not enforce it. */
  policyEffect?: 'allow' | 'ask' | 'deny'
  policyRule?: string
  policyReason?: string
  /** Present when a non-allow verdict was recorded but deliberately not enforced. */
  enforcement?: 'observe'
  externalAuthorization?: boolean
  connection?: string
  scopes?: string[]
  approval?: ActionApproval
  capability?: ActionCapability
  budgets?: BudgetReservation[]
  outcome?: ActionOutcome
  createdAt: number
  updatedAt: number
  expiresAt: number
}

export interface ApplyActionDecision {
  effect: 'allow' | 'ask' | 'deny'
  rule?: string
  reason?: string
  externalAuthorization?: boolean
  approval?: ActionApproval
  /**
   * Apply the lifecycle as allowed while preserving {@link effect} as the
   * policy verdict. Custom stores must honor this marker to support observe
   * mode; ignoring it fails closed rather than issuing an observe capability.
   */
  enforcement?: 'observe'
}

export interface ApplyActionDecisionResult {
  action: ActionRecord
  /** Present when an atomic budget reservation could not be acquired. */
  exhausted?: BudgetRequirement
}

export interface ResolveActionApproval {
  decision: ApprovalDecision
  approver?: string
  via?: string
  providerId?: string
  resolvedAt: number
}

/**
 * Persistence contract for the decision-bound action lifecycle.
 *
 * Production implementations MUST make every method atomic across replicas.
 * In particular, `consumeCapability` is the serialization point: exactly one
 * caller may move a capability from `capability_issued` to `executing`, and it
 * must commit the action's budget reservations in the same transaction.
 */
export interface ActionStore {
  readonly durable: boolean
  create(action: ActionRecord): Promise<void>
  get(actionId: string): Promise<ActionRecord | null>
  applyDecision(
    actionId: string,
    decision: ApplyActionDecision,
    budgets: BudgetRequirement[],
  ): Promise<ApplyActionDecisionResult>
  attachApprovalProvider(
    actionId: string,
    provider: { id: string; expiresAt: number },
  ): Promise<ActionRecord>
  resolveApproval(actionId: string, resolution: ResolveActionApproval): Promise<ActionRecord>
  issueCapability(actionId: string, capability: ActionCapability): Promise<ActionRecord>
  consumeCapability(params: {
    tokenHash: string
    inputHash: string
    now: number
  }): Promise<ActionRecord>
  complete(
    actionId: string,
    outcome: ActionOutcome & { status: 'succeeded' | 'failed' },
  ): Promise<ActionRecord>
  listRecent?(limit?: number): Promise<ActionRecord[]>
}

export class ActionNotFoundError extends Error {
  constructor(readonly actionId: string) {
    super(`nominee: action ${actionId} was not found or expired`)
    this.name = 'ActionNotFoundError'
  }
}

export class ActionStateError extends Error {
  constructor(
    readonly actionId: string,
    readonly status: ActionStatus,
    expected: string,
  ) {
    super(`nominee: action ${actionId} is "${status}", expected ${expected}`)
    this.name = 'ActionStateError'
  }
}

export class CapabilityInvalidError extends Error {
  constructor(message = 'nominee: capability is invalid, expired, changed, or already consumed') {
    super(message)
    this.name = 'CapabilityInvalidError'
  }
}

export class ActionPendingError extends Error {
  constructor(
    readonly actionId: string,
    readonly approvalId: string,
    readonly action?: string,
  ) {
    const label = action ? `"${action}"` : `action ${actionId}`
    super(
      `nominee: ${label} is waiting for a human (actionId=${actionId}, approvalId=${approvalId}). Resolve it with nominee.resolveActionApproval('${actionId}', { decision: 'approved' }) then nominee.resumeAction('${actionId}'). See https://nominee.dev/docs/approvals`,
    )
    this.name = 'ActionPendingError'
  }
}

/**
 * In-process conformance implementation. It has the same transition and
 * single-consumption semantics as a durable store, but does not survive a
 * restart and therefore deliberately advertises `durable = false`.
 */
export class MemoryActionStore implements ActionStore {
  readonly durable = false
  private readonly actions = new Map<string, ActionRecord>()
  private readonly capabilities = new Map<string, string>()
  private readonly committedBudgets = new Map<string, number>()

  async create(action: ActionRecord): Promise<void> {
    if (this.actions.has(action.id)) throw new ActionStateError(action.id, action.status, 'new id')
    this.actions.set(action.id, structuredClone(action))
  }

  async get(actionId: string): Promise<ActionRecord | null> {
    const action = this.actions.get(actionId)
    if (!action) return null
    if (action.expiresAt <= Date.now() && !isTerminal(action.status)) {
      this.releaseReservations(action)
      const expired = this.update(action, { status: 'expired' })
      return structuredClone(expired)
    }
    return structuredClone(action)
  }

  async applyDecision(
    actionId: string,
    decision: ApplyActionDecision,
    budgets: BudgetRequirement[],
  ): Promise<ApplyActionDecisionResult> {
    const action = this.require(actionId)
    this.expect(action, ['planned'])

    const now = Date.now()
    this.cleanupExpiredReservations(now)
    const enforcedEffect = decision.enforcement === 'observe' ? 'allow' : decision.effect
    if (decision.effect === 'allow') {
      for (const budget of budgets) {
        const active = this.activeReservations(budget.key, now)
        const committed = this.committedBudgets.get(budget.key) ?? 0
        if (committed + active >= budget.limit) {
          return { action: structuredClone(action), exhausted: budget }
        }
      }
    }

    const reservations =
      decision.effect === 'allow'
        ? budgets.map<BudgetReservation>((budget) => ({
            ...budget,
            actionId,
            expiresAt: action.expiresAt,
            state: 'reserved',
          }))
        : []
    const status: ActionStatus =
      enforcedEffect === 'allow'
        ? 'policy_checked'
        : enforcedEffect === 'ask'
          ? 'pending_approval'
          : 'denied'
    const next = this.update(action, {
      status,
      policyEffect: decision.effect,
      policyRule: decision.rule,
      policyReason: decision.reason,
      enforcement: decision.enforcement,
      externalAuthorization: decision.externalAuthorization,
      approval: enforcedEffect === 'ask' ? decision.approval : undefined,
      budgets: reservations,
    })
    return { action: structuredClone(next) }
  }

  async resolveApproval(
    actionId: string,
    resolution: ResolveActionApproval,
  ): Promise<ActionRecord> {
    const action = this.require(actionId)
    this.expect(action, ['pending_approval'])
    if (!action.approval) throw new ActionStateError(actionId, action.status, 'approval metadata')

    const status: ActionStatus =
      resolution.decision === 'approved'
        ? 'approved'
        : resolution.decision === 'expired'
          ? 'expired'
          : 'denied'
    if (status !== 'approved') this.releaseReservations(action)
    const next = this.update(action, {
      status,
      approval: {
        ...action.approval,
        decision: resolution.decision,
        approver: resolution.approver,
        via: resolution.via,
        providerId: resolution.providerId ?? action.approval.providerId,
        resolvedAt: resolution.resolvedAt,
      },
    })
    return structuredClone(next)
  }

  async attachApprovalProvider(
    actionId: string,
    provider: { id: string; expiresAt: number },
  ): Promise<ActionRecord> {
    const action = this.require(actionId)
    this.expect(action, ['pending_approval'])
    if (!action.approval) throw new ActionStateError(actionId, action.status, 'approval metadata')
    const next = this.update(action, {
      approval: {
        ...action.approval,
        providerId: provider.id,
        expiresAt: Math.min(action.approval.expiresAt, provider.expiresAt),
      },
    })
    return structuredClone(next)
  }

  async issueCapability(actionId: string, capability: ActionCapability): Promise<ActionRecord> {
    const action = this.require(actionId)
    this.expect(action, ['policy_checked', 'approved', 'capability_issued'])
    if (capability.expiresAt > action.expiresAt) {
      throw new CapabilityInvalidError('nominee: capability cannot outlive its action')
    }
    if (this.capabilities.has(capability.tokenHash)) {
      throw new CapabilityInvalidError('nominee: capability token hash already exists')
    }
    if (action.capability) this.capabilities.delete(action.capability.tokenHash)
    const next = this.update(action, { status: 'capability_issued', capability })
    this.capabilities.set(capability.tokenHash, actionId)
    return structuredClone(next)
  }

  async consumeCapability(params: {
    tokenHash: string
    inputHash: string
    now: number
  }): Promise<ActionRecord> {
    const actionId = this.capabilities.get(params.tokenHash)
    if (!actionId) throw new CapabilityInvalidError()
    const action = this.require(actionId)
    const capability = action.capability
    if (
      action.status !== 'capability_issued' ||
      !capability ||
      capability.tokenHash !== params.tokenHash ||
      capability.expiresAt <= params.now ||
      action.expiresAt <= params.now ||
      action.inputHash !== params.inputHash
    ) {
      throw new CapabilityInvalidError()
    }

    const budgets = (action.budgets ?? []).map((budget) => {
      if (budget.state === 'committed') return budget
      this.committedBudgets.set(budget.key, (this.committedBudgets.get(budget.key) ?? 0) + 1)
      return { ...budget, state: 'committed' as const }
    })
    const next = this.update(action, {
      status: 'executing',
      capability: { ...capability, consumedAt: params.now },
      budgets,
    })
    return structuredClone(next)
  }

  async complete(
    actionId: string,
    outcome: ActionOutcome & { status: 'succeeded' | 'failed' },
  ): Promise<ActionRecord> {
    const action = this.require(actionId)
    this.expect(action, ['executing'])
    const next = this.update(action, { status: outcome.status, outcome })
    return structuredClone(next)
  }

  async listRecent(limit = 50): Promise<ActionRecord[]> {
    return [...this.actions.values()]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit)
      .map((action) => structuredClone(action))
  }

  private require(actionId: string): ActionRecord {
    const action = this.actions.get(actionId)
    if (!action || (action.expiresAt <= Date.now() && !isTerminal(action.status))) {
      throw new ActionNotFoundError(actionId)
    }
    return action
  }

  private expect(action: ActionRecord, statuses: ActionStatus[]): void {
    if (!statuses.includes(action.status)) {
      throw new ActionStateError(action.id, action.status, statuses.join(' or '))
    }
  }

  private update(action: ActionRecord, patch: Partial<ActionRecord>): ActionRecord {
    const next: ActionRecord = {
      ...action,
      ...patch,
      version: action.version + 1,
      updatedAt: Date.now(),
    }
    this.actions.set(action.id, structuredClone(next))
    return next
  }

  private activeReservations(key: string, now: number): number {
    let count = 0
    for (const action of this.actions.values()) {
      for (const reservation of action.budgets ?? []) {
        if (
          reservation.key === key &&
          reservation.state === 'reserved' &&
          reservation.expiresAt > now
        ) {
          count++
        }
      }
    }
    return count
  }

  private cleanupExpiredReservations(now: number): void {
    for (const action of this.actions.values()) {
      if (action.expiresAt <= now && !isTerminal(action.status)) {
        this.releaseReservations(action)
        this.update(action, { status: 'expired' })
      }
    }
  }

  private releaseReservations(action: ActionRecord): void {
    if (!action.budgets?.some((budget) => budget.state === 'reserved')) return
    action.budgets = action.budgets.filter((budget) => budget.state === 'committed')
  }
}

function isTerminal(status: ActionStatus): boolean {
  return (
    status === 'succeeded' || status === 'failed' || status === 'denied' || status === 'expired'
  )
}
