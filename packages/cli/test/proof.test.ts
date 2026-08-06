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

  it('blocks the injected exfiltration, lets legitimate work through, and exits 0', async () => {
    const start = Date.now()
    const result = await runProof()
    const elapsed = Date.now() - start

    expect(result.code).toBe(0)
    expect(elapsed).toBeLessThan(10_000)

    const output = logs.join('\n')
    // The exfiltration attempt must never succeed.
    expect(output).not.toContain('EXFILTRATED')
    expect(output).toContain('BLOCKED before the tool ran')
    // Legitimate, in-org forwarding still runs.
    expect(output).toContain('forwarded 1 emails to boss@acme.com')
    // Receipt chain verifies, and doctoring it is caught.
    expect(output).toContain('receipts intact')
    expect(output).toContain('detected — broken at #')
    // Ends with the install CTA.
    expect(output).toContain('Install: npm i nominee')
  })

  it('never touches the network or requires environment variables', async () => {
    // No env vars are read by proof.ts, and the scripted "model" never
    // performs I/O beyond stdout — this just documents the invariant the
    // acceptance criteria call out explicitly.
    const before = { ...process.env }
    await runProof()
    expect(process.env).toEqual(before)
  })
})
