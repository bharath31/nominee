import type { Effect } from './policy.js'
import type { ApprovalDecision } from './strategy.js'

export type AuditEventType =
  | 'action.planned'
  | 'policy.decision'
  | 'capability.issued'
  | 'capability.consumed'
  | 'execution.started'
  | 'execution.succeeded'
  | 'execution.failed'
  | 'token.issued'
  | 'token.cached'
  | 'token.error'
  | 'token.exchanged'
  | 'token.invalidated'
  | 'approval.requested'
  | 'approval.resolved'
  | 'authz.checked'

/**
 * A structured record of every privileged operation, carrying the identity
 * chain (user -> agent -> sub-agent). Feed it to a log sink to answer
 * "who authorized this action?".
 */
export interface AuditEvent {
  type: AuditEventType
  /** The principal the operation was performed on behalf of. */
  user: string
  /** The acting agent, if one was configured. */
  agent?: string
  /** Third-party connection involved, for token events. */
  connection?: string
  /** Action name, for approval / authz events. */
  action?: string
  /** Resource, for authz events. */
  resource?: string
  tenant?: string
  actionId?: string
  policyVersion?: string
  /** Outcome: approval decision, or boolean authz result. */
  decision?: ApprovalDecision | boolean
  /** Policy verdict, for `policy.decision` events. */
  effect?: Effect
  /**
   * Present only in observe mode: the policy decision was recorded but did
   * not itself block execution. This event does not prove the callback ran or
   * completed; normal runtime and integrity failures still apply.
   */
  enforcement?: 'observe'
  /** Compact label of the deciding rule, e.g. `"deny:email.forward"`. */
  rule?: string
  /** Reason recorded by the deciding rule or engine. */
  reason?: string
  /** Delegation chain of agent identities, when known. */
  chain?: string[]
  /** Epoch milliseconds. */
  at: number
  /** Free-form extra context (error message, approval detail, …). */
  detail?: unknown
}
