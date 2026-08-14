// The `nominee` default command: a support-agent policy proof that runs with
// zero network calls and zero environment variables.
//
// One refund tool gets three outcomes from ordered rules:
//   - $25 runs immediately;
//   - $200 waits for a person, then runs after approval;
//   - $2,000 is denied before the refund function is called.
// A customer export is denied too. The proof finishes by verifying the receipt
// chain and showing that removing a denial from the log is detectable.
import { Nominee, allow, ask, deny, lte, verifyReceipts } from 'nominee'

const dim = (s: string) => `\x1b[2m${s}\x1b[0m`
const red = (s: string) => `\x1b[31m${s}\x1b[0m`
const green = (s: string) => `\x1b[32m${s}\x1b[0m`
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`

export interface ProofResult {
  /** 0 when each policy outcome and receipt invariant holds; 1 otherwise. */
  code: number
}

interface RefundInput {
  orderId: string
  amount: number
}

/** Run the support-agent policy proof and print it to stdout. */
export async function runProof(): Promise<ProofResult> {
  const refunds: RefundInput[] = []
  let customerExportRan = false

  // Your tools stay plain functions.
  const rawTools = {
    'orders.read': async ({ orderId }: { orderId: string }) => ({
      orderId,
      customer: 'Acme Co.',
      total: 240,
      status: 'delivered',
    }),
    'refund.issue': async (input: RefundInput) => {
      refunds.push(input)
      return `refunded $${input.amount} for ${input.orderId}`
    },
    'customers.export': async () => {
      customerExportRan = true
      return 'exported customer data'
    },
  }

  const nominee = new Nominee({
    agent: 'support-agent',
    policy: {
      rules: [
        allow('orders.read'),
        allow<RefundInput>('refund.issue', {
          when: lte('amount', 50),
          reason: 'small refunds may run automatically',
        }),
        ask<RefundInput>('refund.issue', {
          when: lte('amount', 500),
          reason: 'a person approves larger refunds',
        }),
        deny('refund.issue', { reason: 'refund is over the agent limit' }),
        deny('customers.export', { reason: 'the support agent cannot export customer data' }),
      ],
      fallback: 'deny',
    },
    receipts: { key: 'demo-signing-key' },
    onApprovalRequest: (req) => {
      const amount = (req.detail as RefundInput | undefined)?.amount
      console.log(yellow(`  ? agent paused — waiting for your approval of the $${amount} refund`))
      console.log(yellow('  ✓ demo approver approves this exact refund'))
      req.approve()
    },
  })

  const tools = nominee.guard(rawTools, { user: 'alice' })
  let largeRefundBlocked = false

  console.log(bold('\nA support agent wants to act for a customer.\n'))
  console.log('  allow  read an order')
  console.log('  allow  refunds up to $50')
  console.log('  ask   refunds up to $500')
  console.log('  deny  larger refunds and customer exports')

  console.log(bold('\n1. Read order ord_42\n'))
  const order = await tools['orders.read']({ orderId: 'ord_42' })
  console.log(green(`  ✓ allowed → ${order.customer}, $${order.total}, ${order.status}`))

  console.log(bold('\n2. Issue a $25 refund\n'))
  console.log(
    green(`  ✓ allowed → ${await tools['refund.issue']({ orderId: 'ord_42', amount: 25 })}`),
  )

  console.log(bold('\n3. Issue a $200 refund\n'))
  console.log(
    green(`  ✓ approved once → ${await tools['refund.issue']({ orderId: 'ord_42', amount: 200 })}`),
  )

  console.log(bold('\n4. Issue a $2,000 refund\n'))
  try {
    await tools['refund.issue']({ orderId: 'ord_42', amount: 2_000 })
    console.log(red('  ✗ $2,000 REFUND RAN — this line must never print'))
  } catch (error) {
    largeRefundBlocked = true
    console.log(green(`  ✓ blocked before refund.issue ran → ${(error as Error).message}`))
  }

  console.log(bold('\n5. Export all customer data\n'))
  try {
    await tools['customers.export']()
    console.log(red('  ✗ CUSTOMER EXPORT RAN — this line must never print'))
  } catch (error) {
    console.log(green(`  ✓ blocked before customers.export ran → ${(error as Error).message}`))
  }

  const verified = nominee.verifyReceipts()
  console.log(
    `\n  receipt chain: ${
      verified.ok ? green(`✓ ${verified.checked} receipts verify`) : red('BROKEN')
    }`,
  )

  const doctored = nominee.receipts
    .filter((receipt) => receipt.effect !== 'deny')
    .map((receipt, seq) => ({ ...receipt, seq }))
  const audit = verifyReceipts(doctored, { key: 'demo-signing-key' })
  console.log(
    `  denial removed from log: ${
      audit.ok ? red('undetected!') : green(`✓ detected at receipt #${audit.brokenAt}`)
    }`,
  )

  console.log(dim('\nYour agent asked. Your rules decided what ran.\n'))
  console.log(bold('Install: npm i nominee'))

  const refundAmounts = refunds.map((refund) => refund.amount)
  const brokenInvariant =
    !largeRefundBlocked ||
    customerExportRan ||
    refundAmounts.join(',') !== '25,200' ||
    !verified.ok ||
    audit.ok
  return { code: brokenInvariant ? 1 : 0 }
}
