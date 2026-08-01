import express from 'express'
import { Nominee, allow, ask, deny } from 'nominee'
import { nomineeTool } from 'nominee-ai'
import { POSTGRES_SCHEMA, PostgresControlStore, postgresDatabase } from 'nominee-postgres'
import { Pool } from 'pg'
import { z } from 'zod'

import { isAuthorizedApprover } from './security.js'

const app = express()
app.use(express.urlencoded({ extended: true }))

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
      rules: [
        allow('support.refund', { when: ({ input }) => input.amount <= 50 }),
        ask('support.refund'),
      ],
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

  const refundTool = nomineeTool({
    nominee,
    user: 'agent-1',
    action: 'support.refund',
    description: 'Refund a customer',
    inputSchema: z.object({ amount: z.number(), orderId: z.string() }),
    execute: async ({ amount, orderId }) => {
      return `Refunded $${amount} for order ${orderId}`
    },
  })

  app.get('/', async (req, res) => {
    // In a real app we would query the pending actions
    res.send('<h1>Pending Approvals</h1><p>Check the console</p>')
  })

  app.post('/approve', async (req, res) => {
    const authHeader = req.headers.authorization
    if (!isAuthorizedApprover(authHeader, process.env.APPROVER_CREDENTIAL)) {
      res.status(401).send('Unauthorized')
      return
    }
    const { actionId } = req.body
    await nominee.resolveActionApproval(actionId, {
      decision: 'approved',
      approver: 'admin',
      via: 'web',
    })
    res.redirect('/')
  })

  app.post('/deny', async (req, res) => {
    const authHeader = req.headers.authorization
    if (!isAuthorizedApprover(authHeader, process.env.APPROVER_CREDENTIAL)) {
      res.status(401).send('Unauthorized')
      return
    }
    const { actionId } = req.body
    await nominee.resolveActionApproval(actionId, {
      decision: 'denied',
      approver: 'admin',
      via: 'web',
    })
    res.redirect('/')
  })

  app.listen(3000, () => console.log('Listening on 3000'))
}

init().catch(console.error)
