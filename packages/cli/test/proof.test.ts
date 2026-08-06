import { describe, expect, it } from 'vitest'
import { runProof } from '../src/proof.js'

describe('runProof', () => {
  it('blocks the injected exfiltration and prints a verified receipt chain', async () => {
    const lines: string[] = []
    await runProof((line) => lines.push(line))
    const output = lines.join('\n')

    expect(output).toContain('BLOCKED before the tool ran')
    expect(output).toContain('external forwarding is exfiltration')
    expect(output).toContain('BLOCKED by the human')
    expect(output).toContain('forwarded 1 emails to boss@acme.com')
    expect(output).toContain('✓ 18 receipts intact')
    expect(output).toContain('✓ detected — broken at #7')
    expect(output).not.toContain('EXFILTRATED')
    expect(output).toContain('Install: npm i nominee')
  })

  it('finishes well under 10 seconds with zero network calls', async () => {
    const start = Date.now()
    await runProof(() => {})
    expect(Date.now() - start).toBeLessThan(10_000)
  })
})
