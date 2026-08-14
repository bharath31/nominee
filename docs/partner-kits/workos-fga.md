# Partner kit: WorkOS FGA (and OpenFGA)

**What nominee adds.** WorkOS FGA (and OpenFGA) answer one question well:
"does this user have relation X to this object?" That's a relationship
check, not an authorization decision for an *agent tool call* — it doesn't
know about call budgets, human-in-the-loop escalation for high-risk actions,
credential freshness, or a tamper-evident record of what was decided and
why. Nominee is the enforcement point in front of the check: a policy rule's
`when` predicate calls FGA's `Check` API, and FGA's answer (including its
`reason`/warning text) is carried straight through onto nominee's
hash-chained receipt, unchanged. This kit points at the runnable proof, not
a duplicate of it.

## Runnable recipe

[`examples/fga-recipe`](../../examples/fga-recipe) — a nominee rule fronting
a mocked `{ user, relation, object } → { allowed, reason }` check (the shape
of both OpenFGA's and WorkOS FGA's `Check` API), with the real-store swap
documented for both:

```bash
cd examples/fga-recipe
pnpm demo   # alice (owner) allowed, bob (viewer) denied, receipts carry the FGA reason
pnpm test   # asserts both paths
```

**Runnable?** [`examples/fga-recipe`](../../examples/fga-recipe) —
`pnpm --filter fga-recipe test`. The WorkOS/OpenFGA SDK snippet below is the
documented swap, not a live store in this repo.

The one-line swap to a live store (from the recipe's README):

```ts
// WorkOS FGA SDK
const { allowed, warnings } = await workos.fga.check({
  checks: [{
    resource: { resourceType: 'document', resourceId: docId },
    relation: 'owner',
    subject: { resourceType: 'user', resourceId: userId },
  }],
})
```

## Known limitation

The recipe's `when` predicate can only return `boolean` today
(`RuleOptions.when`, `packages/core/src/policy.ts:45`), so a *per-call*
reason from FGA is attached by writing it onto the matched rule object as a
side effect before returning — documented as not safe under concurrent
calls in the recipe's README. See
[`examples/fga-recipe/README.md#known-limitation-flagged-not-worked-around-in-core`](../../examples/fga-recipe/README.md#known-limitation-flagged-not-worked-around-in-core).

## Not a replacement for

WorkOS FGA or OpenFGA. Nominee does not store relationship tuples, compute
graph-based access checks, or replace `Check`/`ListObjects` — it calls out to
whichever relationship store you already run and records the answer.
