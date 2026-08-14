import { describe, expect, it, vi } from 'vitest'
import { parsePublicFunnelEvent, trackFunnel } from '../src/funnel.js'

describe('public funnel events', () => {
  it.each(['cli_proof_completed', 'developer_activated'])(
    'requires a version-4 installation UUID and CLI version for %s',
    (event) => {
      expect(parsePublicFunnelEvent({ event })).toBeNull()
      expect(
        parsePublicFunnelEvent({
          event,
          installationId: 'not-a-uuid',
          cliVersion: '2.2.3',
        }),
      ).toBeNull()
      expect(
        parsePublicFunnelEvent({
          event,
          installationId: 'd9428888-122b-4f24-8f56-31f6c4c6d1aa',
          cliVersion: 'caller-version',
        }),
      ).toBeNull()
      expect(
        parsePublicFunnelEvent({
          event,
          installationId: 'd9428888-122b-4f24-8f56-31f6c4c6d1aa',
          cliVersion: '2.2.3',
        }),
      ).toEqual({
        event,
        detail: 'd9428888-122b-4f24-8f56-31f6c4c6d1aa',
        cliVersion: '2.2.3',
      })
    },
  )

  it('accepts the exact six playground outcomes and acquisition actions', () => {
    for (const event of [
      'viewed',
      'edited_policy',
      'ran_call',
      'blocked',
      'approval_requested',
      'approved',
      'site_npm_click',
      'site_github_click',
      'site_cli_copy',
    ]) {
      expect(parsePublicFunnelEvent({ event })).toEqual({ event, detail: '', cliVersion: '' })
    }
    expect(parsePublicFunnelEvent({ event: 'playground_run' })).toBeNull()
    expect(parsePublicFunnelEvent({ event: 'arbitrary' })).toBeNull()
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
