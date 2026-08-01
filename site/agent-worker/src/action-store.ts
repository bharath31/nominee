import {
  ActionNotFoundError,
  ActionStateError,
  CapabilityInvalidError,
  type ActionCapability,
  type ActionOutcome,
  type ActionRecord,
  type ActionStatus,
  type ActionStore,
  type ApplyActionDecision,
  type ApplyActionDecisionResult,
  type BudgetRequirement,
  type ResolveActionApproval,
} from 'nominee'

/**
 * The subset of DurableObjectStorage this store needs. Narrower than the real
 * type so tests can pass an in-memory fake instead of a Miniflare instance.
 */
export interface ActionRecordStorage {
  get<T = unknown>(key: string): Promise<T | undefined>
  put<T>(key: string, value: T): Promise<void>
  delete(key: string): Promise<boolean>
}

const actionKey = (id: string) => `nominee:action:${id}`
const capabilityKey = (tokenHash: string) => `nominee:capability:${tokenHash}`
const budgetKey = (key: string) => `nominee:budget:${key}`
const INDEX_KEY = 'nominee:action-index'

function isTerminal(status: ActionStatus): boolean {
  return (
    status === 'succeeded' ||
    status === 'failed' ||
    status === 'denied' ||
    status === 'expired'
  )
}

/**
 * Durable ActionStore for one Cloudflare Durable Object session. Ports
 * nominee's in-memory reference store (packages/core/src/action.ts) onto
 * DurableObjectStorage instead of a Map, so the decision-bound action
 * lifecycle survives hibernation and worker eviction.
 *
 * A DO instance here backs exactly one agent session and sees requests one
 * at a time, so this does not need PostgresControlStore's cross-replica
 * transaction machinery — the storage read-modify-write pattern below is
 * sufficient for this demo's traffic (one action, resolved by one approval).
 */
export class DurableObjectActionStore implements ActionStore {
  readonly durable = true

  constructor(private readonly storage: ActionRecordStorage) {}

  async create(action: ActionRecord): Promise<void> {
    const existing = await this.storage.get<ActionRecord>(actionKey(action.id))
    if (existing) throw new ActionStateError(action.id, action.status, 'new id')
    await this.storage.put(actionKey(action.id), action)
    await this.addToIndex(action.id)
  }

  async get(actionId: string): Promise<ActionRecord | null> {
    const action = await this.storage.get<ActionRecord>(actionKey(actionId))
    if (!action) return null
    if (action.expiresAt <= Date.now() && !isTerminal(action.status)) {
      return this.update(action, { ...this.releaseReservationPatch(action), status: 'expired' })
    }
    return action
  }

  async applyDecision(
    actionId: string,
    decision: ApplyActionDecision,
    budgets: BudgetRequirement[],
  ): Promise<ApplyActionDecisionResult> {
    const action = await this.require(actionId)
    this.expect(action, ['planned'])

    const now = Date.now()
    await this.cleanupExpiredReservations(now)
    if (decision.effect === 'allow') {
      for (const budget of budgets) {
        const active = await this.activeReservations(budget.key, now)
        const committed = (await this.storage.get<number>(budgetKey(budget.key))) ?? 0
        if (committed + active >= budget.limit) {
          return { action, exhausted: budget }
        }
      }
    }

    const reservations =
      decision.effect === 'allow'
        ? budgets.map((budget) => ({
            ...budget,
            actionId,
            expiresAt: action.expiresAt,
            state: 'reserved' as const,
          }))
        : []
    const status: ActionStatus =
      decision.effect === 'allow'
        ? 'policy_checked'
        : decision.effect === 'ask'
          ? 'pending_approval'
          : 'denied'
    const next = await this.update(action, {
      status,
      policyEffect: decision.effect,
      policyRule: decision.rule,
      policyReason: decision.reason,
      externalAuthorization: decision.externalAuthorization,
      approval: decision.approval,
      budgets: reservations,
    })
    return { action: next }
  }

  async resolveApproval(
    actionId: string,
    resolution: ResolveActionApproval,
  ): Promise<ActionRecord> {
    const action = await this.require(actionId)
    this.expect(action, ['pending_approval'])
    if (!action.approval) throw new ActionStateError(actionId, action.status, 'approval metadata')

    const status: ActionStatus =
      resolution.decision === 'approved'
        ? 'approved'
        : resolution.decision === 'expired'
          ? 'expired'
          : 'denied'
    return this.update(action, {
      ...(status !== 'approved' ? this.releaseReservationPatch(action) : {}),
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
  }

  async attachApprovalProvider(
    actionId: string,
    provider: { id: string; expiresAt: number },
  ): Promise<ActionRecord> {
    const action = await this.require(actionId)
    this.expect(action, ['pending_approval'])
    if (!action.approval) throw new ActionStateError(actionId, action.status, 'approval metadata')
    return this.update(action, {
      approval: {
        ...action.approval,
        providerId: provider.id,
        expiresAt: Math.min(action.approval.expiresAt, provider.expiresAt),
      },
    })
  }

  async issueCapability(actionId: string, capability: ActionCapability): Promise<ActionRecord> {
    const action = await this.require(actionId)
    this.expect(action, ['policy_checked', 'approved', 'capability_issued'])
    if (capability.expiresAt > action.expiresAt) {
      throw new CapabilityInvalidError('nominee: capability cannot outlive its action')
    }
    if (await this.storage.get(capabilityKey(capability.tokenHash))) {
      throw new CapabilityInvalidError('nominee: capability token hash already exists')
    }
    if (action.capability) await this.storage.delete(capabilityKey(action.capability.tokenHash))
    const next = await this.update(action, { status: 'capability_issued', capability })
    await this.storage.put(capabilityKey(capability.tokenHash), actionId)
    return next
  }

  async consumeCapability(params: {
    tokenHash: string
    inputHash: string
    now: number
  }): Promise<ActionRecord> {
    const actionId = await this.storage.get<string>(capabilityKey(params.tokenHash))
    if (!actionId) throw new CapabilityInvalidError()
    const action = await this.require(actionId)
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

    const budgets: NonNullable<ActionRecord['budgets']> = []
    for (const budget of action.budgets ?? []) {
      if (budget.state === 'committed') {
        budgets.push(budget)
        continue
      }
      const committed = (await this.storage.get<number>(budgetKey(budget.key))) ?? 0
      await this.storage.put(budgetKey(budget.key), committed + 1)
      budgets.push({ ...budget, state: 'committed' })
    }
    return this.update(action, {
      status: 'executing',
      capability: { ...capability, consumedAt: params.now },
      budgets,
    })
  }

  async complete(
    actionId: string,
    outcome: ActionOutcome & { status: 'succeeded' | 'failed' },
  ): Promise<ActionRecord> {
    const action = await this.require(actionId)
    this.expect(action, ['executing'])
    return this.update(action, { status: outcome.status, outcome })
  }

  async listRecent(limit = 50): Promise<ActionRecord[]> {
    const ids = await this.index()
    const actions: ActionRecord[] = []
    for (const id of ids) {
      const action = await this.storage.get<ActionRecord>(actionKey(id))
      if (action) actions.push(action)
    }
    return actions.sort((a, b) => b.createdAt - a.createdAt).slice(0, limit)
  }

  private async require(actionId: string): Promise<ActionRecord> {
    const action = await this.storage.get<ActionRecord>(actionKey(actionId))
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

  private async update(action: ActionRecord, patch: Partial<ActionRecord>): Promise<ActionRecord> {
    const next: ActionRecord = {
      ...action,
      ...patch,
      version: action.version + 1,
      updatedAt: Date.now(),
    }
    await this.storage.put(actionKey(action.id), next)
    return next
  }

  private async index(): Promise<string[]> {
    return (await this.storage.get<string[]>(INDEX_KEY)) ?? []
  }

  private async addToIndex(actionId: string): Promise<void> {
    const ids = await this.index()
    ids.push(actionId)
    await this.storage.put(INDEX_KEY, ids)
  }

  private async activeReservations(key: string, now: number): Promise<number> {
    let count = 0
    for (const id of await this.index()) {
      const action = await this.storage.get<ActionRecord>(actionKey(id))
      for (const reservation of action?.budgets ?? []) {
        if (reservation.key === key && reservation.state === 'reserved' && reservation.expiresAt > now) {
          count++
        }
      }
    }
    return count
  }

  private async cleanupExpiredReservations(now: number): Promise<void> {
    for (const id of await this.index()) {
      const action = await this.storage.get<ActionRecord>(actionKey(id))
      if (action && action.expiresAt <= now && !isTerminal(action.status)) {
        await this.update(action, { ...this.releaseReservationPatch(action), status: 'expired' })
      }
    }
  }

  private releaseReservationPatch(action: ActionRecord): Partial<ActionRecord> {
    if (!action.budgets?.some((budget) => budget.state === 'reserved')) return {}
    return { budgets: action.budgets.filter((budget) => budget.state === 'committed') }
  }
}
