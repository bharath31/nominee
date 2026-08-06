import { Nominee, type NomineeOptions, type Rule, allow, deny } from 'nominee'
import { checkOpa } from './opa.js'

/**
 * Build the allow/deny rule pair for one OPA-gated tool. A single `when`
 * predicate calls the (mocked) OPA decision function with
 * `{ user, tool, resource, tenant, input }` and returns its `allow` boolean,
 * exactly the contract this recipe demonstrates.
 *
 * FLAGGED LIMITATION (see README "Known limitation" section): `when` may
 * only return `boolean | Promise<boolean>` (packages/core/src/policy.ts:45),
 * and a rule's `reason` is a plain string fixed when the rule is built
 * (`RuleOptions.reason`, policy.ts:52) — there is no supported way for a
 * `when` predicate to hand a *per-call* reason back to the policy engine for
 * the receipt. The engine happens to read `rule.reason` only *after*
 * `await rule.when(call)` resolves (policy.ts:266 and :297), so this recipe
 * has `when` write the OPA decision's `reason` onto the two rule objects as
 * a side effect before returning the match. That is the closest
 * approximation reachable with today's public API, but it is impure (the
 * doc comment on `when` asks for "pure and fast" predicates) and would race
 * if the same rule objects were evaluated concurrently for two different
 * calls. It is safe here because this demo and its test issue one call at a
 * time. No core code was changed to make this work.
 */
export function opaGatedRules(tool: string): Rule[] {
  const allowRule = allow(tool)
  const denyRule = deny(tool)

  allowRule.when = async (call: {
    user: string
    tool: string
    resource?: string
    tenant?: string
    input?: unknown
  }) => {
    const decision = await checkOpa({
      user: call.user,
      tool: call.tool,
      resource: call.resource,
      tenant: call.tenant,
      input: call.input,
    })
    allowRule.reason = decision.reason
    denyRule.reason = decision.reason
    return decision.allow === true
  }

  return [allowRule, denyRule]
}

export function buildNominee(
  opts: { onApprovalRequest?: NomineeOptions['onApprovalRequest'] } = {},
) {
  return new Nominee({
    agent: 'billing-agent',
    policy: {
      rules: opaGatedRules('billing.refund'),
      fallback: 'deny',
    },
    receipts: { key: process.env.NOMINEE_RECEIPT_KEY ?? 'demo-signing-key' },
    onApprovalRequest: opts.onApprovalRequest,
  })
}
