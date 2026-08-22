import { describe, expect, it, vi } from 'vitest'
import { funnelDays, readFunnelAggregate, trackFunnel } from '../api/agent/_funnel.js'

describe('Vercel funnel storage', () => {
  it('pseudonymizes installation IDs before writing aggregate counters', async () => {
    const evalRedis = vi.fn(async () => 1)
    const installationId = 'd9428888-122b-4f24-8f56-31f6c4c6d1aa'

    await expect(
      trackFunnel('developer_activated', installationId, '3.0.0', {
        client: { eval: evalRedis } as never,
        hashKey: 'test-only-secret',
        now: Date.parse('2026-08-22T12:00:00Z'),
      }),
    ).resolves.toBe(true)

    expect(evalRedis).toHaveBeenCalledOnce()
    expect(JSON.stringify(evalRedis.mock.calls[0])).not.toContain(installationId)
    expect(JSON.stringify(evalRedis.mock.calls[0])).toContain('developer_activated')
  })

  it('fails closed when installation pseudonymization is not configured', async () => {
    const evalRedis = vi.fn(async () => 1)
    await expect(
      trackFunnel('developer_activated', 'd9428888-122b-4f24-8f56-31f6c4c6d1aa', '3.0.0', {
        client: { eval: evalRedis } as never,
        hashKey: '',
      }),
    ).resolves.toBe(false)
    expect(evalRedis).not.toHaveBeenCalled()
  })

  it('returns only aggregate counts for a bounded date range', async () => {
    const hgetall = vi
      .fn()
      .mockResolvedValueOnce({ cli_proof_completed: 2, developer_activated: 1 })
      .mockResolvedValueOnce({ viewed: 3, session_start: 4 })

    const report = await readFunnelAggregate(
      '2026-08-21',
      '2026-08-22',
      { hgetall } as never,
    )

    expect(report).toMatchObject({ trials: 9, activatedDevelopers: 1 })
    expect(report.counts).toMatchObject({ cli_proof_completed: 2, viewed: 3, session_start: 4 })
    expect(() => funnelDays('2026-01-01', '2026-08-22')).toThrow(/92 days/)
  })
})
