import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { checkPolicy, loadPolicy } from '../src/check.js'

const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url))

describe('loadPolicy', () => {
  it('accepts a default-exported Rule[] array', async () => {
    const policy = await loadPolicy(fixture('good-policy.mjs'))
    expect(policy.rules).toHaveLength(2)
  })

  it('accepts a default-exported options object with a policy', async () => {
    const policy = await loadPolicy(fixture('typo-policy.mjs'))
    expect(policy.rules).toHaveLength(1)
    expect(policy.fallback).toBe('deny')
  })

  it('rejects an export that is neither shape', async () => {
    await expect(loadPolicy(fixture('invalid-policy.mjs'))).rejects.toThrow(/must default-export/)
  })
})

describe('checkPolicy', () => {
  it('reports every rule matched at least one sample call', async () => {
    const result = await checkPolicy(fixture('good-policy.mjs'))
    expect(result.ok).toBe(true)
    expect(result.rules.every((r) => r.matched)).toBe(true)
    expect(result.decisions.find((d) => d.tool === 'email.read')?.effect).toBe('allow')
    expect(result.decisions.find((d) => d.tool === 'db.query')?.effect).toBe('ask')
  })

  it('flags a rule that never matches any sample call, with a suggestion', async () => {
    const result = await checkPolicy(fixture('typo-policy.mjs'))
    expect(result.ok).toBe(false)
    expect(result.rules).toEqual([
      expect.objectContaining({ pattern: 'emial.read', matched: false, suggestion: 'email.read' }),
    ])
  })
})
