import { describe, expect, it } from 'vitest'
import { type Receipt, ReceiptLedger, verifyReceipts } from '../src/index.js'

const entry = (over: Partial<Parameters<ReceiptLedger['append']>[0]> = {}) => ({
  type: 'policy.decision',
  user: 'alice',
  ...over,
})

describe('ReceiptLedger', () => {
  it('chains receipts and verifies a clean chain', () => {
    const ledger = new ReceiptLedger()
    ledger.append(entry({ tool: 'email.read', effect: 'allow' }))
    ledger.append(entry({ tool: 'email.forward', effect: 'deny' }))
    ledger.append(entry({ type: 'approval.resolved', decision: 'approved' }))

    expect(ledger.size).toBe(3)
    expect(ledger.all[0]?.prev).toBe('genesis')
    expect(ledger.all[1]?.prev).toBe(ledger.all[0]?.hash)
    expect(ledger.verify()).toEqual({ ok: true, checked: 3 })
  })

  it('detects content tampering', () => {
    const ledger = new ReceiptLedger()
    ledger.append(entry({ effect: 'allow' }))
    ledger.append(entry({ effect: 'deny', tool: 'repo.delete' }))

    const receipts: Receipt[] = ledger
      .toJSONL()
      .split('\n')
      .map((line) => JSON.parse(line))
    receipts[1] = { ...receipts[1], effect: 'allow' } as Receipt
    const result = verifyReceipts(receipts)
    expect(result.ok).toBe(false)
    expect(result.brokenAt).toBe(1)
    expect(result.reason).toBe('content does not match hash')
  })

  it('detects deletion and reordering', () => {
    const ledger = new ReceiptLedger()
    for (let i = 0; i < 3; i++) ledger.append(entry({ tool: `t${i}` }))
    const receipts = [...ledger.all]

    const missing = [receipts[0], receipts[2]] as Receipt[]
    expect(verifyReceipts(missing).ok).toBe(false)

    const swapped = [receipts[1], receipts[0], receipts[2]] as Receipt[]
    expect(verifyReceipts(swapped).ok).toBe(false)
  })

  it('hashes input by default, never storing it', () => {
    const ledger = new ReceiptLedger()
    const r = ledger.append(entry({ input: { to: 'attacker@evil.top', secret: 'hunter2' } }))
    expect(r.input).toBeUndefined()
    expect(r.inputHash).toMatch(/^[0-9a-f]{64}$/)
    // Provable: the same input re-hashes to the same value.
    const again = new ReceiptLedger().append(
      entry({ input: { secret: 'hunter2', to: 'attacker@evil.top' } }),
    )
    expect(again.inputHash).toBe(r.inputHash)
  })

  it('supports raw and none input modes', () => {
    const raw = new ReceiptLedger({ input: 'raw' }).append(entry({ input: { a: 1 } }))
    expect(raw.input).toEqual({ a: 1 })
    expect(raw.inputHash).toBeUndefined()

    const none = new ReceiptLedger({ input: 'none' }).append(entry({ input: { a: 1 } }))
    expect(none.input).toBeUndefined()
    expect(none.inputHash).toBeUndefined()
  })

  it('signs with an HMAC key so verification needs the key', () => {
    const ledger = new ReceiptLedger({ key: 's3cret' })
    ledger.append(entry())
    ledger.append(entry({ effect: 'deny' }))

    expect(ledger.verify().ok).toBe(true)
    const receipts = [...ledger.all]
    expect(verifyReceipts(receipts, { key: 's3cret' }).ok).toBe(true)
    expect(verifyReceipts(receipts, { key: 'wrong' }).ok).toBe(false)
    expect(verifyReceipts(receipts).ok).toBe(false)
  })

  it('round-trips through JSONL', () => {
    const ledger = new ReceiptLedger()
    ledger.append(entry({ tool: 'a' }))
    ledger.append(entry({ tool: 'b', chain: ['orchestrator', 'researcher'] }))
    const parsed: Receipt[] = ledger
      .toJSONL()
      .split('\n')
      .map((line) => JSON.parse(line))
    expect(verifyReceipts(parsed)).toEqual({ ok: true, checked: 2 })
  })

  it('streams receipts to onReceipt', () => {
    const seen: Receipt[] = []
    const ledger = new ReceiptLedger({ onReceipt: (r) => seen.push(r) })
    ledger.append(entry())
    ledger.append(entry({ effect: 'allow' }))
    expect(seen.map((r) => r.seq)).toEqual([0, 1])
  })
})
