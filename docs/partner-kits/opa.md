# Partner kit: Open Policy Agent (OPA)

**What nominee adds.** OPA is a general-purpose policy decision point — it
can express arbitrarily rich Rego logic over whatever input you send it. But
it has no concept of an AI agent's tool call lifecycle: it doesn't pause a
call for human approval, doesn't issue a fresh scoped credential at
execution time, and doesn't produce a tamper-evident record of what an agent
actually did. Nominee is the enforcement point in front of it: a policy
rule's `when` predicate sends OPA the exact tuple it's deciding —
`{ user, tool, resource, tenant, input }` — and OPA's `{ allow, reason }`
verdict is carried straight through onto nominee's hash-chained receipt,
unchanged, alongside the approval/credential/budget machinery OPA doesn't
provide.

## Runnable recipe

[`examples/opa-recipe`](../../examples/opa-recipe) — a nominee rule fronting
a mocked OPA-shaped decision function, with the real-server swap documented:

```bash
cd examples/opa-recipe
pnpm demo   # alice (billing-admin) allowed a $500 refund, bob (support-agent, capped at $100) denied
pnpm test   # asserts both paths
```

The one-line swap to a live OPA server (from the recipe's README):

```bash
curl -X POST http://localhost:8181/v1/data/nominee/billing/refund/allow \
  -H 'content-type: application/json' \
  -d '{"input": {"user": "alice", "tool": "billing.refund", "resource": "order:ord-42", "tenant": "acme", "input": {"amount": 500}}}'
# { "result": { "allow": true, "reason": "..." } }
```

## Known limitation

The recipe's `when` predicate can only return `boolean` today
(`RuleOptions.when`, `packages/core/src/policy.ts:45`), so OPA's per-call
`reason` is attached by writing it onto the matched rule object as a side
effect before returning — documented as not safe under concurrent calls in
the recipe's README. The same gap exists in the built-in
`NomineeOptions.authorizer` PDP hook, which is also boolean-only and
currently discards any reason on denial (`nominee.ts:407`). See
[`examples/opa-recipe/README.md#known-limitation-flagged-not-worked-around-in-core`](../../examples/opa-recipe/README.md#known-limitation-flagged-not-worked-around-in-core).

## Not a replacement for

OPA itself, or Rego. Nominee does not evaluate policy bundles or replace
`opa eval` — it calls out to whichever OPA deployment you already run for
the decision, then adds the agent-specific lifecycle (approval, fresh
credentials, receipts) around it.
