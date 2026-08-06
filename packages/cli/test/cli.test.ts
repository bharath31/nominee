import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { main } from '../src/cli.js'

describe('cli dispatch', () => {
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

  it('runs the proof for no arguments and exits 0', async () => {
    const code = await main([])
    expect(code).toBe(0)
    expect(logs.join('\n')).toContain('Install: npm i nominee')
  }, 10_000)

  it('prints usage and exits 1 for "verify" with no file', async () => {
    const code = await main(['verify'])
    expect(code).toBe(1)
    expect(logs.join('\n')).toContain('Usage: nominee verify <file>')
  })

  it('prints usage and exits 1 for "check" with no file', async () => {
    const code = await main(['check'])
    expect(code).toBe(1)
    expect(logs.join('\n')).toContain('Usage: nominee check <policy-file>')
  })

  it('shows help and exits 0 for --help', async () => {
    const code = await main(['--help'])
    expect(code).toBe(0)
    expect(logs.join('\n')).toContain('Usage:')
  })

  it('reports an unknown command and exits 1', async () => {
    const code = await main(['bogus'])
    expect(code).toBe(1)
    expect(logs.join('\n')).toContain('unknown command "bogus"')
  })

  it('reports "console" as not yet implemented and exits 1', async () => {
    const code = await main(['console'])
    expect(code).toBe(1)
    expect(logs.join('\n')).toContain('not implemented yet')
  })
})
