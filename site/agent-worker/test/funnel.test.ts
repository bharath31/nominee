import { describe, expect, it, vi } from 'vitest'
import { parsePublicFunnelEvent, trackFunnel } from '../src/funnel.js'

describe('public funnel events', () => {
  it('requires a version-4 installation UUID and CLI version', () => {
    expect(parsePublicFunnelEvent({ event: 'cli_proof_completed' })).toBeNull()
    expect(
      parsePublicFunnelEvent({
        event: 'cli_proof_completed',
        installationId: 'not-a-uuid',
        cliVersion: '2.2.3',
      }),
    ).toBeNull()
    expect(
      parsePublicFunnelEvent({
        event: 'cli_proof_completed',
        installationId: 'd9428888-122b-4f24-8f56-31f6c4c6d1aa',
        cliVersion: 'caller-version',
      }),
    ).toBeNull()
    expect(
      parsePublicFunnelEvent({
        event: 'cli_proof_completed',
        installationId: 'd9428888-122b-4f24-8f56-31f6c4c6d1aa',
        cliVersion: '2.2.3',
      }),
    ).toEqual({
      event: 'cli_proof_completed',
      detail: 'd9428888-122b-4f24-8f56-31f6c4c6d1aa',
      cliVersion: '2.2.3',
    })
  })

  it('reports whether Analytics Engine accepted the event', () => {
    expect(trackFunnel({}, 'cli_proof_completed', 'install', '2.2.3')).toBe(false)

    const writeDataPoint = vi.fn()
    expect(
      trackFunnel({ FUNNEL: { writeDataPoint } }, 'cli_proof_completed', 'install', '2.2.3'),
    ).toBe(true)
    expect(writeDataPoint).toHaveBeenCalledWith({
      blobs: ['cli_proof_completed', 'install', '2.2.3'],
      doubles: [1],
      indexes: ['cli_proof_completed'],
    })
  })
})
