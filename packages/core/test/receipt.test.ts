import { describe, expect, it } from 'vitest'
import {
  type Receipt,
  ReceiptLedger,
  formatReceipts,
  formatReceiptsCsv,
  verifyReceipts,
} from '../src/index.js'

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

  it('flushes async receipt sinks in sequence', async () => {
    const seen: number[] = []
    const ledger = new ReceiptLedger({
      onReceipt: async (receipt) => {
        await new Promise((resolve) => setTimeout(resolve, 5))
        seen.push(receipt.seq)
      },
    })
    ledger.append(entry())
    ledger.append(entry({ effect: 'allow' }))

    expect(seen).toEqual([])
    await ledger.flush()
    expect(seen).toEqual([0, 1])
  })

  it('surfaces async sink failures and stops later delivery', async () => {
    const seen: number[] = []
    const ledger = new ReceiptLedger({
      onReceipt: async (receipt) => {
        seen.push(receipt.seq)
        if (receipt.seq === 0) throw new Error('sink unavailable')
      },
    })
    ledger.append(entry())
    ledger.append(entry({ effect: 'allow' }))

    await expect(ledger.flush()).rejects.toThrow('sink unavailable')
    ledger.append(entry({ effect: 'deny' }))
    await expect(ledger.flush()).rejects.toThrow('sink unavailable')
    expect(seen).toEqual([0])
  })

  it('resumes an existing chain instead of starting a second genesis', () => {
    const first = new ReceiptLedger()
    first.append(entry({ tool: 't0' }))
    first.append(entry({ tool: 't1' }))
    const checkpoint = first.all[1] as Receipt

    const resumed = new ReceiptLedger({ resume: { seq: first.size, prev: checkpoint.hash } })
    const r2 = resumed.append(entry({ tool: 't2' }))
    expect(r2.seq).toBe(2)
    expect(r2.prev).toBe(checkpoint.hash)

    // The resumed segment verifies on its own from the checkpoint...
    expect(resumed.verify()).toEqual({ ok: true, checked: 1 })
    // ...and the full concatenated history verifies as one chain from genesis.
    const full = [...first.all, ...resumed.all]
    expect(verifyReceipts(full)).toEqual({ ok: true, checked: 3 })
  })

  it('detects tampering across a resume checkpoint', () => {
    const first = new ReceiptLedger()
    first.append(entry({ tool: 't0' }))
    const checkpoint = first.all[0] as Receipt

    const resumed = new ReceiptLedger({ resume: { seq: first.size, prev: checkpoint.hash } })
    resumed.append(entry({ tool: 't1' }))

    const tampered = [{ ...checkpoint, tool: 'doctored' }, ...resumed.all] as Receipt[]
    expect(verifyReceipts(tampered).ok).toBe(false)

    // Verifying just the resumed segment against the wrong checkpoint prev fails too.
    expect(
      verifyReceipts([...resumed.all], { resume: { seq: first.size, prev: 'genesis' } }).ok,
    ).toBe(false)
  })

  it('bounds retained in-memory receipts while preserving the visible chain window', () => {
    const ledger = new ReceiptLedger({ retain: 2 })
    ledger.append(entry({ tool: 't0' }))
    ledger.append(entry({ tool: 't1' }))
    ledger.append(entry({ tool: 't2' }))

    expect(ledger.size).toBe(2)
    expect(ledger.all.map((receipt) => receipt.seq)).toEqual([1, 2])
    expect(ledger.verify()).toEqual({ ok: true, checked: 2, retainedWindow: true })
  })

  it('formats a compact receipt chain summary', () => {
    const ledger = new ReceiptLedger()
    ledger.append(entry({ tool: 'email.read', effect: 'allow' }))

    expect(formatReceipts(ledger.all)).toMatch(
      /^#0 policy\.decision email\.read allow [a-f0-9]{12}$/,
    )
  })

  it('appends rule and truncated reason when verbose', () => {
    const ledger = new ReceiptLedger()
    ledger.append(
      entry({
        tool: 'email.forward',
        effect: 'deny',
        rule: 'deny:email.forward',
        reason: 'external forwarding is exfiltration and this reason is deliberately long',
      }),
    )
    const compact = formatReceipts(ledger.all)
    expect(compact).toMatch(/^#0 policy\.decision email\.forward deny [a-f0-9]{12}$/)
    expect(compact).not.toContain('deny:email.forward')
    const verbose = formatReceipts(ledger.all, { verbose: true })
    expect(verbose).toContain('deny:email.forward')
    expect(verbose).toContain('external forwarding is exfiltration')
    expect(verbose.endsWith('…') || verbose.includes('…')).toBe(true)
  })

  it('exports CSV without raw input and still verifies the original chain', () => {
    const ledger = new ReceiptLedger({ input: 'raw' })
    ledger.append(
      entry({
        tool: 'email.forward',
        effect: 'deny',
        rule: 'deny:email.forward',
        reason: 'external, "quoted"',
        decision: 'denied',
        input: { to: 'attacker@evil.top', secret: 'hunter2' },
      }),
    )
    const csv = formatReceiptsCsv(ledger.all)
    expect(
      csv.startsWith('seq,at,type,user,tool,effect,decision,rule,reason,inputHash,prev,hash'),
    ).toBe(true)
    expect(csv).toContain('"external, ""quoted"""')
    expect(csv).not.toContain('hunter2')
    expect(csv).not.toContain('attacker@evil.top')
    const lines = csv.trim().split('\n')
    expect(lines).toHaveLength(2)
    const cols = lines[1]?.match(/("([^"]|"")*"|[^,]*)/g) ?? []
    expect(cols[0]).toBe('0')
    expect(verifyReceipts([...ledger.all]).ok).toBe(true)
  })
})
