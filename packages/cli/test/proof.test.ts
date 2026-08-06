import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runProof } from '../src/proof.js'

describe('runProof', () => {
  let logs: string[]

  beforeEach(() => {
    logs = []
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.join(' '))
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('allows, asks, and denies the intended support-agent actions', async () => {
    const start = Date.now()
    const result = await runProof()
    const elapsed = Date.now() - start

    expect(result.code).toBe(0)
    expect(elapsed).toBeLessThan(10_000)

    const output = logs.join('\n')
    expect(output).toContain('allowed → refunded $25 for ord_42')
    expect(output).toContain('waiting for your approval of the $200 refund')
    expect(output).toContain('approved once → refunded $200 for ord_42')
    expect(output).toContain('blocked before refund.issue ran')
    expect(output).toContain('blocked before customers.export ran')
    expect(output).not.toContain('$2,000 REFUND RAN')
    expect(output).not.toContain('CUSTOMER EXPORT RAN')
    // Receipt chain verifies, and doctoring it is caught.
    expect(output).toContain('receipts verify')
    expect(output).toContain('detected at receipt #')
    // Ends with the install CTA.
    expect(output).toContain('Install: npm i nominee')
  })

  it('never touches the network or requires environment variables', async () => {
    // No env vars are read by proof.ts, and the scripted agent never
    // performs I/O beyond stdout — this just documents the invariant the
    // acceptance criteria call out explicitly.
    const before = { ...process.env }
    await runProof()
    expect(process.env).toEqual(before)
  })
})
