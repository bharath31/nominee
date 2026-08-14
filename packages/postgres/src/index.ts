import {
  type ActionCapability,
  ActionNotFoundError,
  type ActionOutcome,
  type ActionRecord,
  ActionStateError,
  type ActionStatus,
  type ActionStore,
  type ApplyActionDecision,
  type ApplyActionDecisionResult,
  type AtomicReceiptOptions,
  type AtomicReceiptStore,
  type BudgetRequirement,
  CapabilityInvalidError,
  type Receipt,
  type ReceiptEntry,
  type ResolveActionApproval,
  sealReceipt,
} from 'nominee'
export { POSTGRES_SCHEMA } from './schema.js'

export interface PostgresQueryResult<
  Row extends Record<string, unknown> = Record<string, unknown>,
> {
  rows: Row[]
  rowCount?: number | null
}

/** The subset of `pg.Client` used by nominee. */
export interface PostgresClient {
  query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ): Promise<PostgresQueryResult<Row>>
}

/** Transaction boundary used by the control store. */
export interface PostgresDatabase {
  transaction<T>(operation: (client: PostgresClient) => Promise<T>): Promise<T>
}

/** Structural subset of a `pg.Pool`; `pg` remains an application dependency. */
export interface PostgresPool {
  connect(): Promise<PostgresClient & { release(): void }>
}

/** Adapt a standard `pg.Pool` without making `pg` a nominee dependency. */
export function postgresDatabase(pool: PostgresPool): PostgresDatabase {
  return {
    async transaction<T>(operation: (client: PostgresClient) => Promise<T>): Promise<T> {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const result = await operation(client)
        await client.query('COMMIT')
        return result
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined)
        throw error
      } finally {
        client.release()
      }
    },
  }
}

/**
 * Durable source of truth for action state, budget reservations, single-use
 * capabilities, outcomes, and tamper-evident receipt streams.
 */
export class PostgresControlStore implements ActionStore, AtomicReceiptStore {
  readonly durable = true

  constructor(private readonly database: PostgresDatabase) {}

  async create(action: ActionRecord): Promise<void> {
    await this.database.transaction(async (client) => {
      await client.query(
        `INSERT INTO nominee_actions
          (id, status, version, capability_hash, record, created_at, expires_at)
         VALUES ($1, $2, $3, NULL, $4::jsonb, $5, $6)`,
        [
          action.id,
          action.status,
          action.version,
          JSON.stringify(action),
          action.createdAt,
          action.expiresAt,
        ],
      )
      await insertEvent(client, action, 'create')
    })
  }

  async get(actionId: string): Promise<ActionRecord | null> {
    return this.database.transaction(async (client) => {
      const action = await selectAction(client, actionId, true)
      if (!action) return null
      return expireIfNeeded(client, action)
    })
  }

  async applyDecision(
    actionId: string,
    decision: ApplyActionDecision,
    budgets: BudgetRequirement[],
  ): Promise<ApplyActionDecisionResult> {
    return this.database.transaction(async (client) => {
      const action = await requireAction(client, actionId)
      expectStatus(action, ['planned'])
      const now = Date.now()
      const requirements = [...budgets].sort((left, right) => left.key.localeCompare(right.key))
      const enforcedEffect = decision.enforcement === 'observe' ? 'allow' : decision.effect

      if (decision.effect === 'allow') {
        for (const budget of requirements) {
          await client.query(
            `INSERT INTO nominee_budgets (key, committed)
             VALUES ($1, 0)
             ON CONFLICT (key) DO NOTHING`,
            [budget.key],
          )
          const counter = await client.query<{ committed: string | number }>(
            'SELECT committed FROM nominee_budgets WHERE key = $1 FOR UPDATE',
            [budget.key],
          )
          await client.query(
            `DELETE FROM nominee_budget_reservations
             WHERE key = $1 AND state = 'reserved' AND expires_at <= $2`,
            [budget.key, now],
          )
          const reserved = await client.query<{ count: string | number }>(
            `SELECT count(*) AS count
             FROM nominee_budget_reservations
             WHERE key = $1 AND state = 'reserved'`,
            [budget.key],
          )
          const used =
            Number(counter.rows[0]?.committed ?? 0) + Number(reserved.rows[0]?.count ?? 0)
          if (used >= budget.limit) {
            return { action, exhausted: budget }
          }
        }
      }

      const reservations =
        decision.effect === 'allow'
          ? requirements.map((budget) => ({
              ...budget,
              actionId,
              expiresAt: action.expiresAt,
              state: 'reserved' as const,
            }))
          : []
      for (const reservation of reservations) {
        await client.query(
          `INSERT INTO nominee_budget_reservations
            (action_id, key, limit_value, state, expires_at)
           VALUES ($1, $2, $3, 'reserved', $4)`,
          [actionId, reservation.key, reservation.limit, reservation.expiresAt],
        )
      }

      const status: ActionStatus =
        enforcedEffect === 'allow'
          ? 'policy_checked'
          : enforcedEffect === 'ask'
            ? 'pending_approval'
            : 'denied'
      const next = updateRecord(action, {
        status,
        policyEffect: decision.effect,
        policyRule: decision.rule,
        policyReason: decision.reason,
        enforcement: decision.enforcement,
        externalAuthorization: decision.externalAuthorization,
        approval: enforcedEffect === 'ask' ? decision.approval : undefined,
        budgets: reservations,
      })
      await writeAction(client, next, 'apply_decision')
      return { action: next }
    })
  }

  async attachApprovalProvider(
    actionId: string,
    provider: { id: string; expiresAt: number },
  ): Promise<ActionRecord> {
    return this.database.transaction(async (client) => {
      const action = await requireAction(client, actionId)
      expectStatus(action, ['pending_approval'])
      if (!action.approval) {
        throw new ActionStateError(actionId, action.status, 'approval metadata')
      }
      const next = updateRecord(action, {
        approval: {
          ...action.approval,
          providerId: provider.id,
          expiresAt: Math.min(action.approval.expiresAt, provider.expiresAt),
        },
      })
      await writeAction(client, next, 'attach_approval_provider')
      return next
    })
  }

  async resolveApproval(
    actionId: string,
    resolution: ResolveActionApproval,
  ): Promise<ActionRecord> {
    return this.database.transaction(async (client) => {
      const action = await requireAction(client, actionId)
      expectStatus(action, ['pending_approval'])
      if (!action.approval) {
        throw new ActionStateError(actionId, action.status, 'approval metadata')
      }
      const status: ActionStatus =
        resolution.decision === 'approved'
          ? 'approved'
          : resolution.decision === 'expired'
            ? 'expired'
            : 'denied'
      if (status !== 'approved') {
        await releaseReservations(client, actionId)
      }
      const next = updateRecord(action, {
        status,
        approval: {
          ...action.approval,
          decision: resolution.decision,
          approver: resolution.approver,
          via: resolution.via,
          providerId: resolution.providerId ?? action.approval.providerId,
          resolvedAt: resolution.resolvedAt,
        },
        ...(status === 'approved'
          ? {}
          : { budgets: (action.budgets ?? []).filter((budget) => budget.state === 'committed') }),
      })
      await writeAction(client, next, 'resolve_approval')
      return next
    })
  }

  async issueCapability(actionId: string, capability: ActionCapability): Promise<ActionRecord> {
    return this.database.transaction(async (client) => {
      const action = await requireAction(client, actionId)
      expectStatus(action, ['policy_checked', 'approved', 'capability_issued'])
      if (capability.expiresAt > action.expiresAt) {
        throw new CapabilityInvalidError('nominee: capability cannot outlive its action')
      }
      const next = updateRecord(action, { status: 'capability_issued', capability })
      await writeAction(client, next, 'issue_capability', capability.tokenHash)
      return next
    })
  }

  async consumeCapability(params: {
    tokenHash: string
    inputHash: string
    now: number
  }): Promise<ActionRecord> {
    return this.database.transaction(async (client) => {
      const result = await client.query<{ record: unknown }>(
        `SELECT record
         FROM nominee_actions
         WHERE capability_hash = $1
         FOR UPDATE`,
        [params.tokenHash],
      )
      const action = parseRecord(result.rows[0]?.record)
      const capability = action?.capability
      if (
        !action ||
        action.status !== 'capability_issued' ||
        !capability ||
        capability.tokenHash !== params.tokenHash ||
        capability.expiresAt <= params.now ||
        action.expiresAt <= params.now ||
        action.inputHash !== params.inputHash
      ) {
        throw new CapabilityInvalidError()
      }

      for (const budget of action.budgets ?? []) {
        if (budget.state === 'committed') continue
        await client.query('UPDATE nominee_budgets SET committed = committed + 1 WHERE key = $1', [
          budget.key,
        ])
        await client.query(
          `UPDATE nominee_budget_reservations
           SET state = 'committed'
           WHERE action_id = $1 AND key = $2 AND state = 'reserved'`,
          [action.id, budget.key],
        )
      }
      const next = updateRecord(action, {
        status: 'executing',
        capability: { ...capability, consumedAt: params.now },
        budgets: (action.budgets ?? []).map((budget) => ({
          ...budget,
          state: 'committed' as const,
        })),
      })
      await writeAction(client, next, 'consume_capability', null)
      return next
    })
  }

  async complete(
    actionId: string,
    outcome: ActionOutcome & { status: 'succeeded' | 'failed' },
  ): Promise<ActionRecord> {
    return this.database.transaction(async (client) => {
      const action = await requireAction(client, actionId)
      expectStatus(action, ['executing'])
      const next = updateRecord(action, { status: outcome.status, outcome })
      await writeAction(client, next, `complete_${outcome.status}`, null)
      return next
    })
  }

  async listRecent(limit = 50): Promise<ActionRecord[]> {
    return this.database.transaction(async (client) => {
      const result = await client.query<{ record: unknown }>(
        `SELECT record
         FROM nominee_actions
         ORDER BY created_at DESC
         LIMIT $1`,
        [limit],
      )
      return result.rows
        .map((row) => parseRecord(row.record))
        .filter((action): action is ActionRecord => Boolean(action))
    })
  }

  async append(
    stream: string,
    entry: ReceiptEntry,
    options: AtomicReceiptOptions,
  ): Promise<Receipt> {
    return this.database.transaction(async (client) => {
      await client.query(
        `INSERT INTO nominee_receipt_streams (stream, next_seq, prev_hash)
         VALUES ($1, 0, 'genesis')
         ON CONFLICT (stream) DO NOTHING`,
        [stream],
      )
      const result = await client.query<{ next_seq: string | number; prev_hash: string }>(
        `SELECT next_seq, prev_hash
         FROM nominee_receipt_streams
         WHERE stream = $1
         FOR UPDATE`,
        [stream],
      )
      const checkpoint = result.rows[0]
      if (!checkpoint) throw new Error(`nominee-postgres: receipt stream "${stream}" was not found`)
      const receipt = sealReceipt(
        entry,
        { seq: Number(checkpoint.next_seq), prev: checkpoint.prev_hash },
        options,
      )
      await client.query(
        `INSERT INTO nominee_receipts (stream, seq, receipt)
         VALUES ($1, $2, $3::jsonb)`,
        [stream, receipt.seq, JSON.stringify(receipt)],
      )
      await client.query(
        `UPDATE nominee_receipt_streams
         SET next_seq = $2, prev_hash = $3
         WHERE stream = $1`,
        [stream, receipt.seq + 1, receipt.hash],
      )
      return receipt
    })
  }

  async list(stream: string): Promise<Receipt[]> {
    return this.database.transaction(async (client) => {
      const streamResult = await client.query<{
        next_seq: string | number
        prev_hash: string
      }>(
        `SELECT next_seq, prev_hash
         FROM nominee_receipt_streams
         WHERE stream = $1
         FOR SHARE`,
        [stream],
      )
      const checkpoint = streamResult.rows[0]
      if (!checkpoint) return []
      const result = await client.query<{ receipt: unknown }>(
        `SELECT receipt
         FROM nominee_receipts
         WHERE stream = $1
         ORDER BY seq ASC`,
        [stream],
      )
      const receipts = result.rows.map((row) => parseReceipt(row.receipt))
      const expectedCount = Number(checkpoint.next_seq)
      const actualTip = receipts.at(-1)?.hash ?? 'genesis'
      if (receipts.length !== expectedCount || actualTip !== checkpoint.prev_hash) {
        throw new Error(`nominee-postgres: receipt stream "${stream}" checkpoint mismatch`)
      }
      return receipts
    })
  }
}

async function selectAction(
  client: PostgresClient,
  actionId: string,
  lock: boolean,
): Promise<ActionRecord | null> {
  const result = await client.query<{ record: unknown }>(
    `SELECT record FROM nominee_actions WHERE id = $1${lock ? ' FOR UPDATE' : ''}`,
    [actionId],
  )
  return parseRecord(result.rows[0]?.record)
}

async function requireAction(client: PostgresClient, actionId: string): Promise<ActionRecord> {
  const action = await selectAction(client, actionId, true)
  if (!action) throw new ActionNotFoundError(actionId)
  if (action.expiresAt <= Date.now() && !isTerminal(action.status)) {
    await expireIfNeeded(client, action)
    throw new ActionNotFoundError(actionId)
  }
  return action
}

async function expireIfNeeded(client: PostgresClient, action: ActionRecord): Promise<ActionRecord> {
  if (action.expiresAt > Date.now() || isTerminal(action.status)) return action
  await releaseReservations(client, action.id)
  const expired = updateRecord(action, {
    status: 'expired',
    budgets: (action.budgets ?? []).filter((budget) => budget.state === 'committed'),
  })
  await writeAction(client, expired, 'expire', null)
  return expired
}

async function releaseReservations(client: PostgresClient, actionId: string): Promise<void> {
  await client.query(
    `DELETE FROM nominee_budget_reservations
     WHERE action_id = $1 AND state = 'reserved'`,
    [actionId],
  )
}

async function writeAction(
  client: PostgresClient,
  action: ActionRecord,
  operation: string,
  capabilityHash: string | null | undefined = undefined,
): Promise<void> {
  const values: unknown[] = [
    action.id,
    action.status,
    action.version,
    JSON.stringify(action),
    action.expiresAt,
  ]
  const capabilitySql =
    capabilityHash === undefined ? '' : `, capability_hash = $${values.push(capabilityHash)}`
  await client.query(
    `UPDATE nominee_actions
     SET status = $2, version = $3, record = $4::jsonb, expires_at = $5${capabilitySql}
     WHERE id = $1`,
    values,
  )
  await insertEvent(client, action, operation)
}

async function insertEvent(
  client: PostgresClient,
  action: ActionRecord,
  operation: string,
): Promise<void> {
  await client.query(
    `INSERT INTO nominee_action_events (action_id, version, operation, record, at)
     VALUES ($1, $2, $3, $4::jsonb, $5)`,
    [action.id, action.version, operation, JSON.stringify(action), action.updatedAt],
  )
}

function updateRecord(action: ActionRecord, patch: Partial<ActionRecord>): ActionRecord {
  return {
    ...action,
    ...patch,
    version: action.version + 1,
    updatedAt: Date.now(),
  }
}

function expectStatus(action: ActionRecord, expected: ActionStatus[]): void {
  if (!expected.includes(action.status)) {
    throw new ActionStateError(action.id, action.status, expected.join(' or '))
  }
}

function parseRecord(value: unknown): ActionRecord | null {
  if (!value) return null
  return (typeof value === 'string' ? JSON.parse(value) : value) as ActionRecord
}

function parseReceipt(value: unknown): Receipt {
  return (typeof value === 'string' ? JSON.parse(value) : value) as Receipt
}

function isTerminal(status: ActionStatus): boolean {
  return (
    status === 'succeeded' || status === 'failed' || status === 'denied' || status === 'expired'
  )
}
