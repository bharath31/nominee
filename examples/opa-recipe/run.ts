// A nominee `when` predicate calling a (mocked) OPA-shaped decision point.
//
// The policy hands `{ user, tool, resource, tenant, input }` to `checkOpa`
// and gets back `{ allow, reason }` — nominee's rule matches on `allow`, and
// the same `reason` lands on the resulting receipt, unchanged. No OPA
// server, no network: see README.md for the one-line swap to a real one.
//
//   node --import tsx/esm run.ts   (or: pnpm demo)
import { PolicyDeniedError, formatReceipts } from 'nominee'
import { buildNominee } from './src/policy.js'

const dim = (s: string) => `\x1b[2m${s}\x1b[0m`
const red = (s: string) => `\x1b[31m${s}\x1b[0m`
const green = (s: string) => `\x1b[32m${s}\x1b[0m`
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`

const nominee = buildNominee()

console.log(bold('\n1. alice (billing-admin) requests a $500 refund\n'))
const allowed = await nominee.authorize({
  tool: 'billing.refund',
  user: 'alice',
  tenant: 'acme',
  resource: 'order:ord-42',
  input: { amount: 500, orderId: 'ord-42' },
})
console.log(green(`  ✓ allowed — receipt reason: "${allowed.receipt?.reason}"`))

console.log(bold('\n2. bob (support-agent, $100 ceiling) requests a $500 refund\n'))
try {
  await nominee.authorize({
    tool: 'billing.refund',
    user: 'bob',
    tenant: 'acme',
    resource: 'order:ord-77',
    input: { amount: 500, orderId: 'ord-77' },
  })
  console.log(red('  ✗ ALLOWED — this line must never print'))
  process.exit(1)
} catch (err) {
  if (err instanceof PolicyDeniedError) {
    console.log(red(`  ✓ denied — receipt reason: "${err.receipt?.reason}"`))
  } else {
    throw err
  }
}

console.log(bold('\n3. the receipt chain — the OPA decision reason travels with each entry\n'))
console.log(formatReceipts(nominee.receipts))

const ok = await nominee.verifyReceipts()
console.log(
  `\n  chain verifies: ${ok.ok ? green(`✓ ${ok.checked} receipts intact`) : red('BROKEN')}`,
)
console.log(dim('\nSame code, real OPA server: see README.md for the fetch-based swap.\n'))
