import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Nominee, allow, deny } from 'nominee'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { parseReceipts, verifyFile } from '../src/verify.js'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'nominee-cli-verify-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

async function buildReceipts() {
  const nominee = new Nominee({
    policy: { rules: [allow('email.read'), deny('email.forward')], fallback: 'deny' },
    receipts: { key: 'test-key' },
  })
  await nominee.authorize({ tool: 'email.read', user: 'alice' })
  await nominee.authorize({ tool: 'email.forward', user: 'alice' }).catch(() => {})
  return [...nominee.receipts]
}

describe('parseReceipts', () => {
  it('parses a JSON array', async () => {
    const receipts = await buildReceipts()
    expect(parseReceipts(JSON.stringify(receipts))).toEqual(receipts)
  })

  it('parses newline-delimited JSON (toJSONL format)', async () => {
    const receipts = await buildReceipts()
    const jsonl = receipts.map((r) => JSON.stringify(r)).join('\n')
    expect(parseReceipts(jsonl)).toEqual(receipts)
  })

  it('treats an empty file as no receipts', () => {
    expect(parseReceipts('  \n ')).toEqual([])
  })
})

describe('verifyFile', () => {
  it('reports an intact chain', async () => {
    const receipts = await buildReceipts()
    const file = join(dir, 'good.json')
    writeFileSync(file, JSON.stringify(receipts, null, 2))

    const result = verifyFile(file, { key: 'test-key' })
    expect(result).toEqual({ ok: true, message: `✓ ${receipts.length} receipts intact` })
  })

  it('detects a tampered receipt', async () => {
    const receipts = await buildReceipts()
    const doctored = receipts.map((r, i) => (i === 1 ? { ...r, tool: 'tampered' } : r))
    const file = join(dir, 'bad.json')
    writeFileSync(file, JSON.stringify(doctored, null, 2))

    const result = verifyFile(file, { key: 'test-key' })
    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/^✕ broken at #1/)
  })

  it('fails cleanly for a missing file', () => {
    const result = verifyFile(join(dir, 'does-not-exist.json'))
    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/^✗ cannot read/)
  })
})
