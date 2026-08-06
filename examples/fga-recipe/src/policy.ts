import { Nominee, type NomineeOptions, type Rule, allow, deny } from 'nominee'
import { checkFga } from './fga.js'

/**
 * Build the allow/deny rule pair for one FGA-gated tool. A single `when`
 * predicate calls the (mocked) OpenFGA/WorkOS-FGA-shaped `Check` function
 * with `{ user, relation, object }` and returns its `allowed` boolean.
 *
 * `resourceOf` derives the FGA object (e.g. `"document:doc-1"`) from the
 * call's `resource` field; `relation` is the fixed relation this tool
 * requires (e.g. `"owner"`).
 *
 * FLAGGED LIMITATION (see README "Known limitation" section — identical
 * root cause to the opa-recipe): `when` may only return
 * `boolean | Promise<boolean>` (packages/core/src/policy.ts:45), and a
 * rule's `reason` is a static string fixed at construction
 * (`RuleOptions.reason`, policy.ts:52) — there is no supported channel for
 * `when` to hand a *per-call* reason back to the engine for the receipt.
 * Because the engine reads `rule.reason` only *after*
 * `await rule.when(call)` resolves (policy.ts:266 and :297), this recipe has
 * `when` write the FGA decision's `reason` onto the two rule objects as a
 * side effect before returning the match — the closest approximation
 * reachable with today's public API. It is impure (`when`'s doc comment
 * asks for "pure and fast" predicates) and unsafe under concurrent calls
 * sharing the same rule objects; safe here because this demo and its test
 * issue one call at a time. No core code was changed to make this work.
 */
export function fgaGatedRules(
  tool: string,
  relation: string,
  resourceOf: (resource?: string) => string,
): Rule[] {
  const allowRule = allow(tool)
  const denyRule = deny(tool)

  allowRule.when = async (call: { user: string; resource?: string }) => {
    const decision = await checkFga({
      user: call.user,
      relation,
      object: resourceOf(call.resource),
    })
    allowRule.reason = decision.reason
    denyRule.reason = decision.reason
    return decision.allowed === true
  }

  return [allowRule, denyRule]
}

export function buildNominee(
  opts: { onApprovalRequest?: NomineeOptions['onApprovalRequest'] } = {},
) {
  return new Nominee({
    agent: 'docs-agent',
    policy: {
      rules: fgaGatedRules(
        'document.delete',
        'owner',
        (resource) => resource ?? 'document:unknown',
      ),
      fallback: 'deny',
    },
    receipts: { key: process.env.NOMINEE_RECEIPT_KEY ?? 'demo-signing-key' },
    onApprovalRequest: opts.onApprovalRequest,
  })
}
