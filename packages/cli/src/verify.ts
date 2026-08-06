/**
 * `nominee verify <file>` — verify a receipt chain exported from a running
 * nominee agent. Accepts either a JSON array of `Receipt` objects (e.g.
 * `JSON.stringify(nominee.receipts)`) or newline-delimited JSON, the format
 * produced by `ReceiptLedger.toJSONL()`.
 */
import { readFileSync } from 'node:fs'
import { type Receipt, verifyReceipts } from 'nominee'

export interface VerifyFileResult {
  ok: boolean
  message: string
}

export function parseReceipts(raw: string): Receipt[] {
  const trimmed = raw.trim()
  if (trimmed === '') return []
  try {
    const parsed = JSON.parse(trimmed)
    if (Array.isArray(parsed)) return parsed as Receipt[]
  } catch {
    // Not a single JSON document — fall through to JSONL.
  }
  return trimmed.split('\n').map((line) => JSON.parse(line) as Receipt)
}

export function verifyFile(file: string, opts: { key?: string } = {}): VerifyFileResult {
  let raw: string
  try {
    raw = readFileSync(file, 'utf8')
  } catch (err) {
    return { ok: false, message: `✗ cannot read ${file}: ${(err as Error).message}` }
  }

  let receipts: Receipt[]
  try {
    receipts = parseReceipts(raw)
  } catch (err) {
    return { ok: false, message: `✗ cannot parse ${file}: ${(err as Error).message}` }
  }

  const result = verifyReceipts(receipts, { key: opts.key })
  if (result.ok) return { ok: true, message: `✓ ${result.checked} receipts intact` }
  return {
    ok: false,
    message: `✕ broken at #${result.brokenAt}${result.reason ? ` (${result.reason})` : ''}`,
  }
}
