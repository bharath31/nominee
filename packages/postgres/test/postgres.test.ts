import { Nominee, allow, deny } from 'nominee'
import { newDb } from 'pg-mem'
import { afterEach, describe, expect, it } from 'vitest'
import {
  POSTGRES_SCHEMA,
  PostgresControlStore,
  type PostgresPool,
  postgresDatabase,
} from '../src/index.js'

const pools: Array<{ end(): Promise<void> }> = []

afterEach(async () => {
  await Promise.all(pools.splice(0).map((pool) => pool.end()))
})

async function setup() {
  const memory = newDb()
  memory.public.none(POSTGRES_SCHEMA)
  const adapter = memory.adapters.createPg()
  const pool = new adapter.Pool()
  pools.push(pool)
  const store = new PostgresControlStore(postgresDatabase(pool as unknown as PostgresPool))
  return { pool, store }
}

describe('PostgresControlStore', () => {
  it('runs a production action with durable state and receipts', async () => {
    const { pool, store } = await setup()
    const nominee = new Nominee({
      production: true,
      policy: { rules: [allow('issue.close')], fallback: 'deny' },
      policyVersion: 'v1',
      actionStore: store,
      receipts: {
        store,
        stream: 'tenant-acme',
        key: 'receipt-secret',
        delivery: 'strict',
      },
    })

    await expect(
      nominee.run(
        { tool: 'issue.close', user: 'user-1', input: { issue: 42 } },
        async () => 'closed',
      ),
    ).resolves.toBe('closed')
    expect(await nominee.verifyDurableReceipts()).toEqual({ ok: true, checked: 6 })

    const actions = await store.listRecent()
    expect(actions[0]).toMatchObject({
      status: 'succeeded',
      policyVersion: 'v1',
      outcome: { resultHash: expect.stringMatching(/^[0-9a-f]{64}$/) },
    })
    const events = await pool.query(
      'SELECT operation FROM nominee_action_events ORDER BY version ASC',
    )
    expect(events.rows.map((event: { operation: string }) => event.operation)).toEqual([
      'create',
      'apply_decision',
      'issue_capability',
      'consume_capability',
      'complete_succeeded',
    ])
  })

  it('enforces a shared budget across independent production instances', async () => {
    const { store } = await setup()
    const makeNominee = () =>
      new Nominee({
        production: true,
        policy: { rules: [allow('search', { max: 1 })], fallback: 'deny' },
        policyVersion: 'v1',
        actionStore: store,
        receipts: { store, stream: 'budget', delivery: 'strict' },
      })

    await makeNominee().run(
      { tool: 'search', user: 'user-1', input: { q: 'first' } },
      async () => 'first',
    )
    const second = await makeNominee().prepareAction({
      tool: 'search',
      user: 'user-1',
      input: { q: 'second' },
    })

    expect(second.status).toBe('pending_approval')
    expect(second.action.policyReason).toContain('budget of 1 calls exhausted')
  })

  it('preserves an observed denial while allowing the durable action to execute', async () => {
    const { store } = await setup()
    const nominee = new Nominee({
      mode: 'observe',
      policy: { rules: [deny('issue.close')], fallback: 'deny' },
      actionStore: store,
      receipts: { store, stream: 'observed-denial', delivery: 'strict' },
    })

    await expect(
      nominee.run(
        { tool: 'issue.close', user: 'user-1', input: { issue: 42 } },
        async () => 'closed',
      ),
    ).resolves.toBe('closed')

    const actions = await store.listRecent()
    expect(actions[0]).toMatchObject({
      status: 'succeeded',
      policyEffect: 'deny',
      enforcement: 'observe',
    })
  })

  it('invalidates a capability after one successful consumption', async () => {
    const { store } = await setup()
    const nominee = new Nominee({
      policy: { rules: [allow('payment.capture')], fallback: 'deny' },
      actionStore: store,
      receipts: { store, stream: 'capabilities', delivery: 'strict' },
    })
    const prepared = await nominee.prepareAction({
      tool: 'payment.capture',
      user: 'user-1',
      input: { payment: 'pay_1' },
    })
    if (prepared.status !== 'ready') throw new Error('expected ready action')

    await expect(
      nominee.executeCapability(prepared.capability, { payment: 'pay_1' }, async () => 'ok'),
    ).resolves.toBe('ok')
    await expect(
      nominee.executeCapability(prepared.capability, { payment: 'pay_1' }, async () => 'again'),
    ).rejects.toThrow(/capability is invalid/)
  })

  it('detects receipt-tail truncation against the transactional stream checkpoint', async () => {
    const { pool, store } = await setup()
    const nominee = new Nominee({
      policy: { rules: [allow('issue.close')], fallback: 'deny' },
      actionStore: store,
      receipts: { store, stream: 'tail-check', delivery: 'strict' },
    })
    await nominee.run(
      { tool: 'issue.close', user: 'user-1', input: { issue: 42 } },
      async () => 'closed',
    )
    await pool.query(
      `DELETE FROM nominee_receipts
       WHERE stream = 'tail-check'
         AND seq = (SELECT max(seq) FROM nominee_receipts WHERE stream = 'tail-check')`,
    )

    await expect(nominee.verifyDurableReceipts()).rejects.toThrow(/checkpoint mismatch/)
  })
})
