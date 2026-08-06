// `nominee verify <file>` — verify a hash-chained receipt export offline.
import { readFileSync } from 'node:fs'
import { type Receipt, verifyReceipts } from 'nominee'

export interface VerifyCommandResult {
  code: number
}

/**
 * Verify a JSON file of exported receipts — the exact array you get from
 * `JSON.stringify(nominee.receipts)` (or any durable store's equivalent
 * export). See packages/cli/README.md for the expected shape.
 */
export function runVerify(filePath: string): VerifyCommandResult {
  let raw: string
  try {
    raw = readFileSync(filePath, 'utf8')
  } catch (error) {
    console.log(`✗ could not read ${filePath}: ${(error as Error).message}`)
    return { code: 1 }
  }

  let receipts: Receipt[]
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      throw new Error('expected a JSON array of receipts')
    }
    receipts = parsed as Receipt[]
  } catch (error) {
    console.log(`✗ could not parse ${filePath}: ${(error as Error).message}`)
    return { code: 1 }
  }

  // Signed chains need the same key they were sealed with. Unsigned (plain
  // sha256) chains verify with no key at all — the common case.
  const key = process.env.NOMINEE_RECEIPT_KEY
  const result = verifyReceipts(receipts, key ? { key } : {})

  if (result.ok) {
    console.log(`✓ ${result.checked} receipts intact`)
    return { code: 0 }
  }

  console.log(`✗ broken at #${result.brokenAt} (${result.reason})`)
  return { code: 1 }
}
