# fga-recipe — a nominee rule fronting a relationship-based PDP

nominee is the enforcement point (PEP), not the decision point (PDP). This
recipe shows the seam for a relationship-based authorizer — the shape used
by OpenFGA and WorkOS FGA's `Check` API: a nominee `when` predicate calls a
mocked `{ user, relation, object } → { allowed, reason }` check, and the
decision's human-readable `reason` ends up on nominee's receipt, unchanged.

**No FGA store, no network.** The check function (`src/fga.ts`) is mocked
and in-process, on purpose — the point is the contract at the seam, not
standing up OpenFGA or WorkOS FGA. Pointing the same code at a real store is
a one-line swap (below).

## The contract

```ts
interface FgaCheckRequest {
  user: string
  relation: string
  object: string
}

interface FgaCheckResponse {
  allowed: boolean
  reason?: string
}
```

`src/policy.ts` builds a rule pair for `document.delete`, which requires the
`owner` relation. The `when` predicate on the allow rule derives `object`
from the call's `resource` (e.g. `"document:doc-1"`) and calls
`checkFga({ user, relation: 'owner', object })`. `decision.reason` is
written onto whichever rule ends up matching, so it is recorded on the
`policy.decision` receipt — inspect it via `authorization.receipt.reason`
(allow path) or `policyDeniedError.receipt.reason` (deny path).

## Run it

```bash
# from the repo root
pnpm install
cd examples/fga-recipe
pnpm demo
```

Expected: alice (`owner` of `document:doc-1`) is allowed to delete it; bob
(only a `viewer`) is denied the same call; both receipts carry the FGA
decision's `reason` verbatim; the receipt chain verifies.

## Run the tests

```bash
cd examples/fga-recipe
pnpm test        # vitest: asserts both the allow and deny paths
pnpm typecheck
```

## Swapping in a real relationship store

Same request, same response shape — only the transport changes.

**OpenFGA** — `POST /stores/{store_id}/check`:

```bash
curl -X POST "$OPENFGA_API_URL/stores/$OPENFGA_STORE_ID/check" \
  -H 'content-type: application/json' \
  -d '{"tuple_key": {"user": "user:alice", "relation": "owner", "object": "document:doc-1"}}'
# { "allowed": true, "resolution": "..." }
```

`src/fga.ts` exports `checkFgaViaRealFga` — a reference implementation of
that call, never invoked by the demo or its tests (no network in the
demo/CI path):

```ts
export async function checkFgaViaRealFga(request: FgaCheckRequest): Promise<FgaCheckResponse> {
  const res = await fetch(`${process.env.OPENFGA_API_URL}/stores/${process.env.OPENFGA_STORE_ID}/check`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      tuple_key: { user: `user:${request.user}`, relation: request.relation, object: request.object },
    }),
  })
  const body = (await res.json()) as { allowed?: boolean; resolution?: string }
  return { allowed: body.allowed === true, reason: body.resolution }
}
```

**WorkOS FGA** — SDK, equivalent call:

```ts
const { allowed, warnings } = await workos.fga.check({
  checks: [
    {
      resource: { resourceType: 'document', resourceId: request.object.split(':')[1] },
      relation: request.relation,
      subject: { resourceType: 'user', resourceId: request.user },
    },
  ],
})
return { allowed, reason: warnings?.[0]?.message }
```

To go live: in `src/policy.ts`, replace the `checkFga` import with
`checkFgaViaRealFga` (or the WorkOS equivalent) — same
`(request) => Promise<{ allowed, reason }>` shape, no other code changes.

## Known limitation (flagged, not worked around in core)

Identical root cause to [`examples/opa-recipe`](../opa-recipe/README.md#known-limitation-flagged-not-worked-around-in-core):
nominee's `when` predicate can only return `boolean | Promise<boolean>`
(`packages/core/src/policy.ts:45`), and a rule's `reason` is a plain string
fixed when the rule is built via `allow()`/`deny()`/`ask()`
(`RuleOptions.reason`, `policy.ts:52`). There is **no supported channel** for
a `when` predicate to hand a *per-call* reason back to the policy engine for
the receipt — only a rule's own static, construction-time reason ever lands
there (`policy.ts:297`).

This recipe's workaround, same as opa-recipe: since the engine reads
`rule.reason` only *after* `await rule.when(call)` resolves (`policy.ts:266`
then `:297`), `when` writes the FGA decision's `reason` onto the matched
rule object as a side effect before returning the boolean (see
`src/policy.ts`). That reproduces the contract for this demo and its tests,
but it is impure (`when`'s doc comment asks for "pure and fast" predicates,
`policy.ts:41-44`) and **not safe under concurrent calls** sharing the same
rule objects.

**What would fix this properly** (not implemented — flagged per the task
instructions, no core API was added or changed): let `when` optionally
return `{ matched: boolean; reason?: string }` in addition to a plain
boolean, and have `PolicyEngine.evaluateOne` prefer that per-call reason
over the rule's static one when computing `PolicyDecision.reason`.

## Before enforcing an existing agent

This recipe intentionally enforces its authorization decision. To inventory
existing tools first, construct Nominee with `mode: 'observe'`: policy denies
and approval gates are recorded rather than enforced, while `observations()`
reports execution attempts and argument shapes. It retains no raw
string/boolean values or user IDs; numeric aggregates may be sensitive. Remove
the mode to enforce; observe mode is not a security control.
