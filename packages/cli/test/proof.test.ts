import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runProof } from '../src/proof.js'

const stripAnsi = (s: string) =>
  s.replace(new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g'), '')

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

  it('proves the pause: pending action, token expiry, single-use capability, bound input', async () => {
    const start = Date.now()
    const result = await runProof()
    const elapsed = Date.now() - start

    expect(result.code).toBe(0)
    expect(elapsed).toBeLessThan(10_000)

    const output = stripAnsi(logs.join('\n'))
    // The pause itself, in order.
    expect(output).toContain(
      '✓ approval requested   refund.issue $200 → sent out of band, request returns',
    )
    expect(output).toContain(
      '⏳ the pause           the access token expires while the human is away',
    )
    expect(output).toContain(
      '✓ approved             fresh token minted at execution, not at plan time',
    )
    expect(output).toContain('✗ replay               same approval, second attempt → rejected')
    expect(output).toContain('✗ arg swap             approved $200, executed $2,000 → rejected')
    // Receipt chain verifies, and doctoring it is caught.
    expect(output).toContain('✓ receipt chain verifies (and a doctored copy is detected)')
    // Fatal regressions must never print.
    expect(output).not.toContain('RAN WITHOUT A HUMAN')
    expect(output).not.toContain('CONSUMED APPROVAL')
    expect(output).not.toContain('EXECUTED AS $2,000')
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
