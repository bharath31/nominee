import express from 'express'
import { ActionPendingError, Nominee, PolicyDeniedError } from 'nominee'
import { nomineeTool } from 'nominee-ai'
import { POSTGRES_SCHEMA, PostgresControlStore, postgresDatabase } from 'nominee-postgres'
import { Pool } from 'pg'
import { z } from 'zod'

import { type RefundInput, refundRules } from './policy.js'
import { escapeHtml, isAuthorizedApprover } from './security.js'

const app = express()
app.use(express.urlencoded({ extended: true }))
app.use(express.json())

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL || 'postgresql://root:password@localhost:5432/nominee_test',
})

async function init() {
  await pool.query(POSTGRES_SCHEMA)

  const control = new PostgresControlStore(postgresDatabase(pool))
  const nominee = new Nominee({
    production: true,
    policy: {
      rules: refundRules,
      fallback: 'deny',
    },
    actionStore: control,
    receipts: {
      store: control,
      stream: 'tenant:demo',
      key: process.env.RECEIPT_KEY || 'test-key',
      delivery: 'strict',
    },
  })

  const issueRefund = async ({ amount, orderId }: RefundInput) => {
    return `Refunded $${amount} for order ${orderId}`
  }

  const refundTool = nomineeTool({
    nominee,
    user: 'agent-1',
    action: 'support.refund',
    description: 'Refund a customer',
    inputSchema: z.object({ amount: z.number(), orderId: z.string() }),
    execute: issueRefund,
  })

  app.get('/', async (_req, res) => {
    res.send(`
      <h1>Support refund agent</h1>
      <p>$25 runs. $200 waits for approval. $2,000 is blocked.</p>
      <form method="post" action="/refund">
        <label>Order <input name="orderId" value="ord_42" required></label>
        <label>Amount <input name="amount" type="number" value="200" required></label>
        <button>Run refund tool</button>
      </form>
    `)
  })

  app.post('/refund', async (req, res) => {
    const parsed = z
      .object({ amount: z.coerce.number().positive(), orderId: z.string().min(1) })
      .safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'amount and orderId are required' })
      return
    }

    try {
      const result = await refundTool.execute(parsed.data, {
        toolCallId: `demo_${Date.now()}`,
        messages: [],
      })
      res.json({ status: 'completed', result })
    } catch (error) {
      if (error instanceof ActionPendingError) {
        res.status(202).json({
          status: 'waiting_for_approval',
          actionId: error.actionId,
          approvalId: error.approvalId,
          input: parsed.data,
          next: 'POST /approve, then POST /refund/resume with the same input',
        })
        return
      }
      if (error instanceof PolicyDeniedError) {
        res.status(403).json({ status: 'blocked', error: error.message })
        return
      }
      throw error
    }
  })

  app.post('/approve', async (req, res) => {
    const authHeader = req.headers.authorization
    if (!isAuthorizedApprover(authHeader, process.env.APPROVER_CREDENTIAL)) {
      res.status(401).send('Unauthorized')
      return
    }
    const actionId = String(req.body.actionId ?? '')
    if (!actionId) {
      res.status(400).send('actionId is required')
      return
    }
    await nominee.resolveActionApproval(actionId, {
      decision: 'approved',
      approver: 'admin',
      via: 'web',
    })
    res.json({ status: 'approved', actionId, next: 'POST /refund/resume' })
  })

  app.post('/deny', async (req, res) => {
    const authHeader = req.headers.authorization
    if (!isAuthorizedApprover(authHeader, process.env.APPROVER_CREDENTIAL)) {
      res.status(401).send('Unauthorized')
      return
    }
    const actionId = String(req.body.actionId ?? '')
    if (!actionId) {
      res.status(400).send('actionId is required')
      return
    }
    await nominee.resolveActionApproval(actionId, {
      decision: 'denied',
      approver: 'admin',
      via: 'web',
    })
    res.json({ status: 'denied', actionId })
  })

  app.post('/refund/resume', async (req, res) => {
    if (!isAuthorizedApprover(req.headers.authorization, process.env.APPROVER_CREDENTIAL)) {
      res.status(401).send('Unauthorized')
      return
    }
    const parsed = z
      .object({
        actionId: z.string().min(1),
        amount: z.coerce.number(),
        orderId: z.string().min(1),
      })
      .safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'actionId, amount, and orderId are required' })
      return
    }
    const { actionId, ...input } = parsed.data
    const resumed = await nominee.resumeAction(actionId)
    if (resumed.status !== 'ready') {
      res.status(409).json({ status: resumed.status, actionId })
      return
    }
    const result = await nominee.executeCapability(resumed.capability, input, () =>
      issueRefund(input),
    )
    res.json({ status: 'completed', result })
  })

  app.use(
    (error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      const message = error instanceof Error ? error.message : String(error)
      res.status(500).send(escapeHtml(message))
    },
  )

  app.listen(3000, () => console.log('Listening on http://localhost:3000'))
}

init().catch(console.error)
