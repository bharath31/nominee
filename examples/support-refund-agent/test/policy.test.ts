import { Nominee } from 'nominee'
import { describe, expect, it } from 'vitest'
import { refundRules } from '../src/policy.js'

describe('support refund policy', () => {
  const nominee = new Nominee({
    policy: { rules: refundRules, fallback: 'deny' },
    onApprovalRequest: () => {},
  })

  it.each([
    [25, 'allow'],
    [200, 'ask'],
    [2_000, 'deny'],
  ] as const)('$%s refund returns %s', async (amount, effect) => {
    await expect(
      nominee.check({
        tool: 'support.refund',
        input: { amount, orderId: 'ord_42' },
        user: 'agent-1',
      }),
    ).resolves.toMatchObject({ effect })
  })
})
