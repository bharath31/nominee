import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Nominee, allow } from 'nominee'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runVerify } from '../src/verify.js'

describe('runVerify', () => {
  let dir: string
  let logs: string[]

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'nominee-cli-verify-'))
    logs = []
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.join(' '))
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    rmSync(dir, { recursive: true, force: true })
  })

  async function seedReceipts(): Promise<unknown[]> {
    const nominee = new Nominee({
      policy: [allow('email.read')],
      receipts: { key: 'test-key' },
    })
    await nominee.authorize({ tool: 'email.read', user: 'alice' })
    await nominee.authorize({ tool: 'email.read', user: 'alice' })
    return [...nominee.receipts]
  }

  it('prints intact and exits 0 for a valid exported chain', async () => {
    const receipts = await seedReceipts()
    const file = join(dir, 'receipts.json')
    writeFileSync(file, JSON.stringify(receipts))

    process.env.NOMINEE_RECEIPT_KEY = 'test-key'
    try {
      const result = runVerify(file)
      expect(result.code).toBe(0)
      expect(logs.join('\n')).toContain('✓ 2 receipts intact')
    } finally {
      process.env.NOMINEE_RECEIPT_KEY = undefined
    }
  })

  it('reports a broken chain and exits 1 when a receipt is tampered with', async () => {
    const receipts = (await seedReceipts()) as Array<{ reason?: string }>
    const tampered = receipts.map((r, i) => (i === 0 ? { ...r, reason: 'tampered' } : r))
    const file = join(dir, 'tampered.json')
    writeFileSync(file, JSON.stringify(tampered))

    process.env.NOMINEE_RECEIPT_KEY = 'test-key'
    try {
      const result = runVerify(file)
      expect(result.code).toBe(1)
      expect(logs.join('\n')).toContain('✗ broken at #0')
    } finally {
      process.env.NOMINEE_RECEIPT_KEY = undefined
    }
  })

  it('exits 1 for a file that does not exist', () => {
    const result = runVerify(join(dir, 'missing.json'))
    expect(result.code).toBe(1)
    expect(logs.join('\n')).toContain('✗ could not read')
  })

  it('exits 1 for a file that is not a JSON array of receipts', () => {
    const file = join(dir, 'not-an-array.json')
    writeFileSync(file, JSON.stringify({ not: 'an array' }))

    const result = runVerify(file)
    expect(result.code).toBe(1)
    expect(logs.join('\n')).toContain('✗ could not parse')
  })
})
