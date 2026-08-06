# opa-recipe — a nominee rule fronting an OPA-shaped PDP

nominee is the enforcement point (PEP), not the decision point (PDP). This
recipe shows the seam: a nominee `when` predicate calls an OPA-shaped decision
function and uses its verdict to decide the call — and the decision's
human-readable `reason` ends up on nominee's receipt, unchanged.

**No OPA server, no network.** The decision function (`src/opa.ts`) is
mocked and in-process, on purpose — the point is the contract at the seam,
not standing up OPA. Pointing the same code at a real OPA instance is a
one-line swap (below).

## The contract

```ts
interface OpaAuthzRequest {
  user: string
  tool: string
  resource?: string
  tenant?: string
  input?: unknown
}

interface OpaDecision {
  allow: boolean
  reason?: string
}
```

`src/policy.ts` builds a rule pair per guarded tool. The `when` predicate on
the allow rule calls `checkOpa(request)` with exactly `{ user, tool,
resource, tenant, input }`, taken straight off the call nominee is deciding,
and returns `decision.allow`. `decision.reason` is written onto whichever
rule ends up matching, so it is recorded on the `policy.decision` receipt —
inspect it via `authorization.receipt.reason` (allow path) or
`policyDeniedError.receipt.reason` (deny path).

## Run it

```bash
# from the repo root
pnpm install
cd examples/opa-recipe
pnpm demo
```

Expected: alice (`billing-admin`) is allowed a $500 refund; bob
(`support-agent`, capped at $100) is denied the same request; both receipts
carry the OPA decision's `reason` verbatim; the receipt chain verifies.

## Run the tests

```bash
cd examples/opa-recipe
pnpm test        # vitest: asserts both the allow and deny paths
pnpm typecheck
```

## Swapping in a real OPA server

Same request, same response shape — only the transport changes. OPA's
`POST /v1/data/<policy>` API takes `{ "input": <your object> }` and returns
`{ "result": <your policy's output> }`:

```bash
curl -X POST http://localhost:8181/v1/data/nominee/billing/refund/allow \
  -H 'content-type: application/json' \
  -d '{"input": {"user": "alice", "tool": "billing.refund", "resource": "order:ord-42", "tenant": "acme", "input": {"amount": 500}}}'
# { "result": { "allow": true, "reason": "..." } }
```

`src/opa.ts` exports `checkOpaViaRealOpa` — a reference implementation of
that call, never invoked by the demo or its tests (no network in the
demo/CI path):

```ts
export async function checkOpaViaRealOpa(request: OpaAuthzRequest): Promise<OpaDecision> {
  const res = await fetch(`${process.env.OPA_URL}/v1/data/nominee/${request.tool.replace(/\./g, '/')}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ input: request }),
  })
  const body = (await res.json()) as { result?: { allow?: boolean; reason?: string } }
  return { allow: body.result?.allow === true, reason: body.result?.reason }
}
```

To go live: in `src/policy.ts`, replace the `checkOpa` import with
`checkOpaViaRealOpa` (same `(request) => Promise<{ allow, reason }>` shape —
no other code changes).

## Known limitation (flagged, not worked around in core)

nominee's `when` predicate can only return `boolean | Promise<boolean>`
(`packages/core/src/policy.ts:45`), and a rule's `reason` is a plain string
fixed when the rule is built via `allow()`/`deny()`/`ask()`
(`RuleOptions.reason`, `policy.ts:52`). There is **no supported channel** for
a `when` predicate to hand a *per-call* reason back to the policy engine for
the receipt — only a rule's own static, construction-time reason ever lands
there (`policy.ts:297`).

This recipe's workaround: the engine reads `rule.reason` only *after*
`await rule.when(call)` resolves (`policy.ts:266` then `:297`), so `when`
writes the OPA decision's `reason` onto the matched rule object as a side
effect before returning the boolean (see `src/policy.ts`). That reproduces
the contract for this demo and its tests, but it is impure — the doc comment
on `when` explicitly asks for predicates to be "pure and fast"
(`policy.ts:41-44`) — and it is **not safe under concurrent calls** that
share the same rule objects, since two in-flight calls would race to set and
read `.reason` on the same rule.

A related, sharper version of the same gap: `NomineeOptions.authorizer` is
already the built-in generic PDP hook (`nominee.ts:79`,
`AuthzParams`/`strategy.ts:143-152`) but it is typed
`(params: AuthzParams) => boolean | Promise<boolean>` — boolean only — and on
denial nominee always records the fixed string `'external application
authorization denied the resource'` (`nominee.ts:407`), discarding any reason
the authorizer might have computed, on both the allow and deny paths.

**What would fix this properly** (not implemented — flagged per the task
instructions, no core API was added or changed): let `when` (and
`authorizer`) optionally return `{ matched: boolean; reason?: string }` in
addition to a plain boolean, and have `PolicyEngine.evaluateOne` prefer that
per-call reason over the rule's static one when computing `PolicyDecision.reason`.
