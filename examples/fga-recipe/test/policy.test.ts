import { PolicyDeniedError } from 'nominee'
import { describe, expect, it } from 'vitest'
import { checkFga } from '../src/fga.js'
import { buildNominee } from '../src/policy.js'

describe('fga-recipe: when predicate calling a mocked OpenFGA/WorkOS-FGA Check', () => {
  it('allow path: the FGA reason lands on the receipt unchanged', async () => {
    const nominee = buildNominee()
    const call = { tool: 'document.delete', user: 'alice', resource: 'document:doc-1' }

    const expected = await checkFga({ user: call.user, relation: 'owner', object: call.resource })
    expect(expected.allowed).toBe(true)

    const authorization = await nominee.authorize(call)
    expect(authorization.effect).toBe('allow')
    expect(authorization.decision.reason).toBe(expected.reason)
    expect(authorization.receipt?.reason).toBe(expected.reason)
    expect(authorization.receipt?.effect).toBe('allow')
  })

  it('deny path: the FGA reason lands on the receipt unchanged', async () => {
    const nominee = buildNominee()
    const call = { tool: 'document.delete', user: 'bob', resource: 'document:doc-1' }

    const expected = await checkFga({ user: call.user, relation: 'owner', object: call.resource })
    expect(expected.allowed).toBe(false)

    await expect(nominee.authorize(call)).rejects.toThrow(PolicyDeniedError)

    try {
      await nominee.authorize(call)
      throw new Error('unreachable: authorize() should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(PolicyDeniedError)
      const denied = err as PolicyDeniedError
      expect(denied.decision.reason).toBe(expected.reason)
      expect(denied.receipt?.reason).toBe(expected.reason)
      expect(denied.receipt?.effect).toBe('deny')
    }
  })
})
