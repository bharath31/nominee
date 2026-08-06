const NOMINEE_URL = 'https://esm.sh/nominee@2.2.1?bundle'
const pendingRuns = new Map()

const nomineeModule = import(NOMINEE_URL)
  .then((module) => {
    self.postMessage({ type: 'ready' })
    return module
  })
  .catch((error) => {
    self.postMessage({ type: 'load-error', text: String(error) })
    throw error
  })

function receiptSnapshot(nominee) {
  return nominee.receipts.slice(-16).map((receipt) => ({
    seq: receipt.seq,
    type: receipt.type,
    tool: receipt.tool,
    effect: receipt.effect,
    decision: receipt.decision,
    outcome: receipt.outcome,
    hash: receipt.hash.slice(0, 8),
  }))
}

function proof(nominee) {
  return {
    receipts: receiptSnapshot(nominee),
    verified: nominee.verifyReceipts().ok,
  }
}

async function executeRefund({ nominee, runId, input }, capability) {
  await nominee.executeCapability(capability, input, async () => {
    self.postMessage({
      type: 'executed',
      runId,
      text: `refund.issue ran for $${input.amount.toLocaleString()}.`,
    })
    return { refundId: 'ref_7H2', ...input }
  })
  self.postMessage({
    type: 'complete',
    runId,
    text: 'Refund complete. The receipt chain proves the tool ran.',
    ...proof(nominee),
  })
}

async function run({ runId, amount, source }) {
  const { Nominee, allow, ask, deny } = await nomineeModule

  let rules
  try {
    const buildRules = new Function(
      'allow',
      'ask',
      'deny',
      `'use strict'; return (${source});`,
    )
    rules = buildRules(allow, ask, deny)
    if (!Array.isArray(rules)) throw new Error('The editor must return an array of rules.')
  } catch (error) {
    self.postMessage({
      type: 'policy-error',
      runId,
      text: error instanceof Error ? error.message : String(error),
    })
    return
  }

  const nominee = new Nominee({
    agent: 'support-playground',
    policy: { rules, fallback: 'deny' },
    receipts: { key: 'browser-playground-demo-key' },
  })

  try {
    const order = await nominee.run(
      { tool: 'orders.read', input: { orderId: 'ord_42' }, user: 'playground-user' },
      async () => ({
        orderId: 'ord_42',
        customer: 'Acme Co.',
        total: 240,
        status: 'delivered',
      }),
    )
    self.postMessage({
      type: 'step',
      runId,
      text: `Read ${order.orderId}: ${order.customer}, $${order.total}, ${order.status}.`,
    })

    const input = { orderId: order.orderId, amount }
    const prepared = await nominee.prepareAction({
      tool: 'refund.issue',
      input,
      user: 'playground-user',
    })
    if (prepared.status === 'pending_approval') {
      pendingRuns.set(runId, { nominee, runId, input, actionId: prepared.action.id })
      self.postMessage({ type: 'approval', runId, amount, ...proof(nominee) })
      return
    }
    if (prepared.status !== 'ready') {
      throw new Error(`refund action ended as ${prepared.status}`)
    }
    await executeRefund({ nominee, runId, input }, prepared.capability)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    self.postMessage({
      type: 'blocked',
      runId,
      text: `Blocked before refund.issue ran: ${message}`,
      ...proof(nominee),
    })
  }
}

async function decide({ runId, decision }) {
  const pending = pendingRuns.get(runId)
  if (!pending) return
  pendingRuns.delete(runId)

  const { nominee, actionId, input } = pending
  await nominee.resolveActionApproval(actionId, {
    decision,
    approver: 'playground-user',
    via: 'playground',
  })
  const resumed = await nominee.resumeAction(actionId)
  if (resumed.status === 'ready') {
    await executeRefund(pending, resumed.capability)
    return
  }
  self.postMessage({
    type: 'blocked',
    runId,
    text: 'You denied the refund. refund.issue never ran.',
    ...proof(nominee),
  })
}

self.addEventListener('message', ({ data }) => {
  if (data.type === 'decision') {
    decide(data).catch((error) => {
      self.postMessage({
        type: 'policy-error',
        runId: data.runId,
        text: error instanceof Error ? error.message : String(error),
      })
    })
    return
  }

  if (data.type === 'run') {
    run(data).catch((error) => {
      self.postMessage({
        type: 'policy-error',
        runId: data.runId,
        text: error instanceof Error ? error.message : String(error),
      })
    })
  }
})
