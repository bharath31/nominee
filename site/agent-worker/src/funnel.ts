interface FunnelDataset {
  writeDataPoint(point: {
    blobs: string[]
    doubles: number[]
    indexes: string[]
  }): void
}

interface FunnelEnv {
  FUNNEL?: FunnelDataset
}

const PUBLIC_FUNNEL_EVENTS = new Set([
  'cli_proof_completed',
  'playground_run',
  'playground_allowed',
  'playground_blocked',
  'playground_approval_requested',
  'playground_approved',
  'playground_denied',
])

const INSTALLATION_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const CLI_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/

export interface PublicFunnelEvent {
  event: string
  detail: string
  cliVersion: string
}

/** Validate the intentionally tiny public collector payload. */
export function parsePublicFunnelEvent(body: unknown): PublicFunnelEvent | null {
  if (!body || typeof body !== 'object') return null
  const payload = body as {
    event?: unknown
    installationId?: unknown
    cliVersion?: unknown
  }
  if (typeof payload.event !== 'string' || !PUBLIC_FUNNEL_EVENTS.has(payload.event)) return null

  if (payload.event !== 'cli_proof_completed') {
    return { event: payload.event, detail: '', cliVersion: '' }
  }
  if (typeof payload.installationId !== 'string' || !INSTALLATION_ID.test(payload.installationId)) {
    return null
  }
  if (
    typeof payload.cliVersion !== 'string' ||
    payload.cliVersion.length > 64 ||
    !CLI_VERSION.test(payload.cliVersion)
  ) {
    return null
  }
  return {
    event: payload.event,
    detail: payload.installationId,
    cliVersion: payload.cliVersion,
  }
}

/** Best-effort internal write; `false` means no analytics record was accepted. */
export function trackFunnel(
  env: FunnelEnv,
  event: string,
  detail = '',
  cliVersion = '',
): boolean {
  if (!env.FUNNEL) return false
  try {
    env.FUNNEL.writeDataPoint({
      blobs: [event, detail, cliVersion],
      doubles: [1],
      indexes: [event],
    })
    return true
  } catch {
    return false
  }
}
