import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runCheck } from '../src/check.js'

const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url))

describe('runCheck', () => {
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

  it('exits 0 when every rule matches a sample call (Rule[] default export)', async () => {
    const result = await runCheck(fixture('reachable-policy.mjs'))
    expect(result.code).toBe(0)
    const output = logs.join('\n')
    expect(output).toContain('✓ allow:email.read matched at least one sample call')
    expect(output).toContain('✓ deny:email.forward matched at least one sample call')
    expect(output).toContain('All rules reachable.')
  })

  it('exits 1 and suggests a fix when a rule never matches (Policy default export)', async () => {
    const result = await runCheck(fixture('unreachable-policy.mjs'))
    expect(result.code).toBe(1)
    const output = logs.join('\n')
    expect(output).toContain('✗ allow:emial.send never matched any sample call')
    expect(output).toContain('did you mean "email.read"?')
    expect(output).toContain('1 rule pattern(s) never matched a sample call.')
  })

  it('exits 1 for a policy file that does not exist', async () => {
    const result = await runCheck(fixture('does-not-exist.mjs'))
    expect(result.code).toBe(1)
    expect(logs.join('\n')).toContain('✗ policy file not found')
  })

  it('exits 1 when the default export is not a Rule[] or Policy shape', async () => {
    const result = await runCheck(fixture('invalid-policy.mjs'))
    expect(result.code).toBe(1)
    expect(logs.join('\n')).toContain('must have a default export')
  })
})
