import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { main } from '../src/cli.js'
import { runObserve } from '../src/observe.js'

describe('nominee observe', () => {
  let logs: string[]

  beforeEach(() => {
    logs = []
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.join(' '))
    })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('runs the sample agent, blocks nothing, and reports what it saw', async () => {
    const result = await runObserve()
    const output = logs.join('\n')

    expect(result.code).toBe(0)
    // The demo label must be impossible to miss, above the report.
    expect(output).toContain(
      "Sample report from nominee's built-in demo agent — it never touches your code.",
    )
    expect(output).toContain('nominee.observe(yourTools) wraps the tools you pass it')
    expect(output).toContain('it only sees')
    // And it sits above the report, not below it.
    expect(output.indexOf('Sample report from nominee')).toBeLessThan(
      output.indexOf('ENFORCEMENT WAS OFF'),
    )
    expect(output).toContain('ENFORCEMENT WAS OFF')
    expect(output).toContain('refund.issue')
    expect(output).toContain('customers.export')
    // The $2,000 refund is the whole point: it ran.
    expect(output).toContain('2000')
    expect(output).toContain('[unbounded]')
  })

  it('writes a machine-readable report with --out', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'nominee-observe-'))
    const out = join(dir, 'observations.json')
    try {
      const code = await main(['observe', '--out', out])
      expect(code).toBe(0)

      const report = JSON.parse(readFileSync(out, 'utf8'))
      expect(report.mode).toBe('observe')
      expect(report.version).toBe(2)
      expect(report.totals.calls).toBe(9)
      const refund = report.tools.find((tool: { tool: string }) => tool.tool === 'refund.issue')
      expect(refund.unboundedArguments).toEqual(['amount'])
      expect(refund.arguments[0].range).toMatchObject({ min: 5, max: 2000 })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('rejects --out without a file', async () => {
    const code = await main(['observe', '--out'])
    expect(code).toBe(1)
    expect(logs.join('\n')).toContain('Usage: nominee observe')
  })
})
