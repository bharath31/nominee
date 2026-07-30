import { describe, expect, it, vi } from 'vitest'
import { usageReporter } from '../src/index.js'

const action = {
  actionId: 'act_1',
  user: 'alice@example.com',
  tenant: 'acme',
  action: 'refund.create',
  resource: 'order:42',
  status: 'succeeded' as const,
  at: 1_785_345_600_000,
}

describe('usageReporter', () => {
  it('emits stable pseudonyms without raw application data', async () => {
    const sink = vi.fn()
    const report = usageReporter({ key: 'installation-secret', sink })
    await report(action)
    await report({ ...action, actionId: 'act_2', resource: 'order:99' })

    const first = sink.mock.calls[0]?.[0]
    const second = sink.mock.calls[1]?.[0]
    expect(first.principalId).toBe(second.principalId)
    expect(first.eventId).not.toBe(second.eventId)
    expect(first).not.toHaveProperty('user')
    expect(first).not.toHaveProperty('tenant')
    expect(first).not.toHaveProperty('resource')
    expect(first).not.toHaveProperty('action')
    expect(JSON.stringify(first)).not.toContain('alice@example.com')
    expect(JSON.stringify(first)).not.toContain('acme')
  })

  it('is best-effort by default and can be made strict', async () => {
    const failure = new Error('collector unavailable')
    const onError = vi.fn()
    await expect(
      usageReporter({
        key: 'key',
        sink: async () => {
          throw failure
        },
        onError,
      })(action),
    ).resolves.toBeUndefined()
    expect(onError).toHaveBeenCalledWith(failure)

    await expect(
      usageReporter({
        key: 'key',
        sink: async () => {
          throw failure
        },
        onError: () => {
          throw new Error('error handler unavailable')
        },
      })(action),
    ).resolves.toBeUndefined()

    await expect(
      usageReporter({
        key: 'key',
        delivery: 'strict',
        sink: async () => {
          throw failure
        },
      })(action),
    ).rejects.toThrow('collector unavailable')
  })
})
