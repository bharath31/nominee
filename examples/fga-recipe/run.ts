// A nominee `when` predicate calling a (mocked) OpenFGA/WorkOS-FGA-shaped
// relationship check.
//
// The policy hands `{ user, relation, object }` to `checkFga` and gets back
// `{ allowed, reason }` — nominee's rule matches on `allowed`, and the same
// `reason` lands on the resulting receipt, unchanged. No FGA store, no
// network: see README.md for the one-line swap to a real one.
//
//   node --import tsx/esm run.ts   (or: pnpm demo)
import { PolicyDeniedError, formatReceipts } from 'nominee'
import { buildNominee } from './src/policy.js'

const dim = (s: string) => `\x1b[2m${s}\x1b[0m`
const red = (s: string) => `\x1b[31m${s}\x1b[0m`
const green = (s: string) => `\x1b[32m${s}\x1b[0m`
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`

const nominee = buildNominee()

console.log(bold('\n1. alice (owner of document:doc-1) deletes it\n'))
const allowed = await nominee.authorize({
  tool: 'document.delete',
  user: 'alice',
  resource: 'document:doc-1',
})
console.log(green(`  ✓ allowed — receipt reason: "${allowed.receipt?.reason}"`))

console.log(bold('\n2. bob (only a viewer of document:doc-1) tries to delete it\n'))
try {
  await nominee.authorize({
    tool: 'document.delete',
    user: 'bob',
    resource: 'document:doc-1',
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

console.log(bold('\n3. the receipt chain — the FGA decision reason travels with each entry\n'))
console.log(formatReceipts(nominee.receipts))

const ok = await nominee.verifyReceipts()
console.log(
  `\n  chain verifies: ${ok.ok ? green(`✓ ${ok.checked} receipts intact`) : red('BROKEN')}`,
)
console.log(dim('\nSame code, real OpenFGA/WorkOS FGA: see README.md for the swap.\n'))
