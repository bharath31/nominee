// `nominee observe` — the discovery command. It runs a sample support agent
// with NO policy at all, in observe mode, and prints what the agent turned out
// to be able to do. Nothing is blocked; that is the point. The same two lines
// (`new Nominee({ mode: 'observe' })` + `nominee.observe(tools)`) go around a
// real agent's tools.
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Nominee, formatObservations } from 'nominee'

const dim = (s: string) => `\x1b[2m${s}\x1b[0m`
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`

export interface ObserveCommandResult {
  /** 0 when the sample agent ran unblocked and produced a report; 1 otherwise. */
  code: number
}

interface RefundInput {
  orderId: string
  amount: number
}

/**
 * Run the sample agent in observe mode and print the report. With `out`, the
 * machine-readable report is written there too for inspection or as input to
 * the caller's own policy-generation workflow.
 */
export async function runObserve(out?: string): Promise<ObserveCommandResult> {
  const nominee = new Nominee({ mode: 'observe', agent: 'support-agent' })

  // No policy, no rules, no decisions to make yet — just the tools an agent
  // already has.
  const tools = nominee.observe({
    'orders.read': async ({ orderId }: { orderId: string }) => ({ orderId, total: 240 }),
    'refund.issue': async (input: RefundInput) => `refunded $${input.amount}`,
    'customers.export': async (_input: { format: string }) => 'exported customer data',
  })

  console.log(bold('\nRunning a support agent for one session. Nothing is enforced.\n'))

  for (const orderId of ['ord_42', 'ord_43', 'ord_44']) {
    await tools['orders.read']({ orderId })
  }
  for (const amount of [5, 25, 40, 180, 2_000]) {
    await tools['refund.issue']({ orderId: 'ord_42', amount })
  }
  await tools['customers.export']({ format: 'csv' })

  console.log(formatObservations(nominee.observations()))

  console.log(
    yellow(
      '\n  Every one of those calls ran, including the $2,000 refund and the customer export.',
    ),
  )
  console.log(dim('  That is what your agent can do today, with or without nominee.\n'))

  if (out) {
    const path = resolve(process.cwd(), out)
    writeFileSync(path, `${JSON.stringify(nominee.observations(), null, 2)}\n`)
    console.log(`  Report written to ${out}`)
  }

  console.log(bold('Wrap your own tools:'))
  console.log("  const nominee = new Nominee({ mode: 'observe' })")
  console.log('  const tools = nominee.observe(yourTools)')
  console.log(dim('\n  Then `npx nominee-cli` to see what enforcing those calls looks like.\n'))

  const report = nominee.observations()
  return { code: report.totals.calls === 9 && report.tools.length === 3 ? 0 : 1 }
}
