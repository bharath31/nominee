import { PolicyDeniedError } from 'nominee'
import { describe, expect, it } from 'vitest'
import { checkOpa } from '../src/opa.js'
import { buildNominee } from '../src/policy.js'

describe('opa-recipe: when predicate calling a mocked OPA decision point', () => {
  it('allow path: the OPA reason lands on the receipt unchanged', async () => {
    const nominee = buildNominee()
    const call = {
      tool: 'billing.refund',
      user: 'alice',
      tenant: 'acme',
      resource: 'order:ord-42',
      input: { amount: 500, orderId: 'ord-42' },
    }

    const expected = await checkOpa(call)
    expect(expected.allow).toBe(true)

    const authorization = await nominee.authorize(call)
    expect(authorization.effect).toBe('allow')
    expect(authorization.decision.reason).toBe(expected.reason)
    expect(authorization.receipt?.reason).toBe(expected.reason)
    expect(authorization.receipt?.effect).toBe('allow')
  })

  it('deny path: the OPA reason lands on the receipt unchanged', async () => {
    const nominee = buildNominee()
    const call = {
      tool: 'billing.refund',
      user: 'bob',
      tenant: 'acme',
      resource: 'order:ord-77',
      input: { amount: 500, orderId: 'ord-77' },
    }

    const expected = await checkOpa(call)
    expect(expected.allow).toBe(false)

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
