import { hmacSha256 } from './hash.js'
import type { GovernedActionEvent } from './nominee.js'

export interface AnonymousUsageEvent {
  schemaVersion: 1
  type: 'governed_action'
  /** Stable, installation-scoped id suitable for daily unique counts. */
  principalId: string
  /** Stable tenant pseudonym, when the application supplied a tenant. */
  tenantId?: string
  /** Idempotency key for deduplicating retries. */
  eventId: string
  status: GovernedActionEvent['status']
  at: number
  /** Included only when `includeAction` is explicitly enabled. */
  action?: string
}

export interface UsageReporterOptions {
  /** Installation-specific secret used to pseudonymize principals and tenants. */
  key: string
  sink: (event: AnonymousUsageEvent) => void | Promise<void>
  /** Include the policy action name. Default false. */
  includeAction?: boolean
  /** Default best-effort. Strict propagates sink failures to the caller. */
  delivery?: 'best-effort' | 'strict'
  onError?: (error: unknown) => void
}

/**
 * Build an opt-in, privacy-preserving `onGovernedAction` callback.
 *
 * It never sends raw user ids, tenant ids, resources, tool input, credentials,
 * results, or receipt contents. The application owns the sink and transport.
 */
export function usageReporter(
  options: UsageReporterOptions,
): (event: GovernedActionEvent) => Promise<void> {
  if (!options.key) throw new Error('nominee: usageReporter requires a non-empty key')
  return async (event) => {
    const usage: AnonymousUsageEvent = {
      schemaVersion: 1,
      type: 'governed_action',
      principalId: hmacSha256(options.key, `${event.tenant ?? ''}\0${event.user}`),
      ...(event.tenant ? { tenantId: hmacSha256(options.key, event.tenant) } : {}),
      eventId: hmacSha256(options.key, event.actionId),
      status: event.status,
      at: event.at,
      ...(options.includeAction ? { action: event.action } : {}),
    }
    try {
      await options.sink(usage)
    } catch (error) {
      try {
        options.onError?.(error)
      } catch {
        // Error reporting cannot make best-effort measurement block an action.
      }
      if (options.delivery === 'strict') throw error
    }
  }
}
