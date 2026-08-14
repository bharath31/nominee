import { randomUUID } from 'node:crypto'
import type { ApprovalRequest, ObservationReport, Receipt } from 'nominee'

const DEFAULT_URL = 'http://127.0.0.1:4317'
const DEFAULT_APPROVAL_WAIT_MS = 5 * 60_000
const DEFAULT_TRANSPORT_TIMEOUT_MS = 5_000

export interface ConsoleBridgeOptions {
  /** Console origin. Defaults to NOMINEE_CONSOLE_URL or http://127.0.0.1:4317. */
  url?: string
  /** Producer token printed by `nominee console`. Defaults to NOMINEE_CONSOLE_TOKEN. */
  token?: string
  /** Receipt stream name. A random per-process name is used by default. */
  stream?: string
  /** Called with transport failures. Defaults to a concise console.error. */
  onError?: (error: Error) => void
  /** Test/runtime fetch override. */
  fetch?: typeof globalThis.fetch
}

export interface ObservationFollower {
  /** Stop publishing snapshots and wait for any in-flight publish to settle. */
  stop(): Promise<void>
}

export interface ConsoleBridge {
  /** Compose directly into NomineeOptions.onApprovalRequest. Failures resolve as deny/expired. */
  onApprovalRequest(request: ApprovalRequest): Promise<void>
  /** Compose into receipts.onReceipt (prefer delivery: 'strict' for fail-closed delivery). */
  onReceipt(receipt: Receipt): Promise<void>
  /** Publish a sanitized ObservationReport snapshot to the live console. */
  publishObservations(report: ObservationReport): Promise<void>
  /** Periodically publish `nominee.observations()` without adding a core telemetry hook. */
  followObservations(read: () => ObservationReport, intervalMs?: number): ObservationFollower
  readonly stream: string
}

function normalizeOrigin(value: string): string {
  const url = new URL(value)
  if (
    url.protocol !== 'http:' ||
    !['127.0.0.1', 'localhost', '::1', '[::1]'].includes(url.hostname)
  ) {
    throw new Error('nominee console bridge URL must be an http:// loopback address')
  }
  url.pathname = ''
  url.search = ''
  url.hash = ''
  return url.origin
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Connect a running agent to the explicitly local console. Nothing is sent unless the caller
 * composes these hooks or calls `publishObservations`; the core package still phones nowhere.
 */
export function createConsoleBridge(options: ConsoleBridgeOptions = {}): ConsoleBridge {
  const origin = normalizeOrigin(options.url ?? process.env.NOMINEE_CONSOLE_URL ?? DEFAULT_URL)
  const token = options.token ?? process.env.NOMINEE_CONSOLE_TOKEN
  if (!token) {
    throw new Error(
      'nominee console bridge needs NOMINEE_CONSOLE_TOKEN (printed by `nominee console`)',
    )
  }
  const fetcher = options.fetch ?? globalThis.fetch
  const stream = options.stream ?? `process-${randomUUID()}`
  const reportError =
    options.onError ??
    ((error: Error) => {
      console.error(`nominee console bridge: ${error.message}`)
    })

  async function post(path: string, body: unknown, signal?: AbortSignal): Promise<Response> {
    const response = await fetcher(`${origin}${path}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: signal ?? AbortSignal.timeout(DEFAULT_TRANSPORT_TIMEOUT_MS),
    })
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new Error(
        `console returned ${response.status}${detail ? `: ${detail.slice(0, 160)}` : ''}`,
      )
    }
    return response
  }

  const publishObservations = async (report: ObservationReport): Promise<void> => {
    await post('/api/observations', { stream, report })
  }

  return {
    stream,

    async onApprovalRequest(request) {
      const waitMs =
        typeof request.timeoutMs === 'number' && request.timeoutMs > 0
          ? request.timeoutMs
          : DEFAULT_APPROVAL_WAIT_MS
      try {
        const response = await post(
          '/api/approvals',
          {
            id: request.id,
            user: request.user,
            action: request.action,
            detail: request.detail,
            timeoutMs: waitMs,
          },
          AbortSignal.timeout(waitMs + 2_000),
        )
        const result = (await response.json()) as { decision?: unknown }
        if (!['approved', 'denied', 'expired'].includes(String(result.decision))) {
          throw new Error('console returned an invalid approval decision')
        }
        request.resolve(result.decision as 'approved' | 'denied' | 'expired')
      } catch (error) {
        const expired = error instanceof DOMException && error.name === 'TimeoutError'
        request.resolve(expired ? 'expired' : 'denied')
        reportError(
          new Error(
            `${expired ? 'approval expired' : 'approval denied because the console is unavailable'} (${errorMessage(error)})`,
          ),
        )
      }
    },

    async onReceipt(receipt) {
      await post('/api/receipts', { stream, receipt })
    },

    publishObservations,

    followObservations(read, intervalMs = 1_000) {
      if (!Number.isFinite(intervalMs) || intervalMs < 100) {
        throw new Error('observation publish interval must be at least 100ms')
      }
      let stopped = false
      let running = false
      let pendingSnapshot = false
      let inFlight: Promise<void> = Promise.resolve()
      const publish = () => {
        if (stopped) return
        if (running) {
          pendingSnapshot = true
          return
        }
        running = true
        inFlight = (async () => {
          do {
            pendingSnapshot = false
            try {
              await publishObservations(read())
            } catch (error) {
              reportError(new Error(`observation publish failed (${errorMessage(error)})`))
            }
          } while (pendingSnapshot && !stopped)
        })().finally(() => {
          running = false
        })
      }
      publish()
      const timer = setInterval(publish, intervalMs)
      timer.unref?.()
      return {
        async stop() {
          stopped = true
          pendingSnapshot = false
          clearInterval(timer)
          await inFlight
        },
      }
    },
  }
}
