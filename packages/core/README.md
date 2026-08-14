<h1 align="center">nominee</h1>

<p align="center">
  <a href="https://www.npmjs.com/package/nominee"><img src="https://img.shields.io/npm/v/nominee?style=flat-square&colorA=0a0a0f&colorB=7c3aed" alt="npm" /></a>
  <a href="https://github.com/bharath31/nominee/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/nominee?style=flat-square&colorA=0a0a0f&colorB=555" alt="license" /></a>
</p>

<p align="center">
  <strong>Your agent calls tools. Your rules decide what runs.</strong><br />
  Open-source TypeScript checks before every AI tool call.<br />
  Zero dependencies, framework-neutral, no SaaS.
</p>

---

## Installation

```bash
npm i nominee
```

No signup. No SaaS account. No vendor lock-in. Zero runtime dependencies.

---

## What it does

Your framework decides which tool the agent requests. nominee checks your rules before the tool function runs.

nominee sits between the model and your tools, in-process, and gives every tool call:

1. **Policy** — declarative `allow` / `deny` / `ask` rules: glob patterns, argument-level conditions, call budgets. The model cannot talk its way past a `deny`.
2. **Approvals** — `ask` pauses the call until a human decides, with the full arguments in front of them.
3. **Receipts** — every decision (including refusals) sealed into a hash-chained, optionally HMAC-signed, tamper-evident log. Inputs hashed, never stored.

---

## Don't have rules yet? Start by looking

Observe mode wraps your existing tools with no policy required and records
deny, ask, and budget decisions without enforcing them. It records which tool
callbacks actually start, into the same hash-chained receipts, and reports
argument shapes, numeric ranges, and hashed cardinalities without enumerating
string values. Runtime and integrity failures still fail closed.

```ts
import { Nominee, formatObservations } from 'nominee'

const nominee = new Nominee({ mode: 'observe' })
const tools = nominee.observe({ readOrder, issueRefund, exportCustomers })

// …run your agent as usual, then:
console.log(formatObservations(nominee.observations()))
```

```text
nominee observe — 9 call(s) across 3 tool(s)
ENFORCEMENT WAS OFF: every observed call reached its tool callback.

  tool              calls  kind
  refund.issue          5  mutate
                      ↳ amount: number, observed 5–2000 (median 40)  [unbounded]
  orders.read           3  read
  customers.export      1  unknown
```

It is a discovery tool, not a security control, and it says so: startup prints
an unmissable notice that enforcement is off, every receipt carries
`enforcement: 'observe'`, and `production: true` refuses to construct with it.
See [docs/observe.md](https://github.com/bharath31/nominee/blob/main/docs/observe.md).

---

## Quickstart

```ts
import { Nominee, allow, deny, ask } from 'nominee'

const nominee = new Nominee({
  policy: {
    rules: [
      allow('orders.read'),
      allow('refund.issue', { when: ({ input }) => input.amount <= 50 }),
      ask('refund.issue', { when: ({ input }) => input.amount <= 500 }),
      deny('refund.issue'),
      deny('customers.export'),
    ],
    fallback: 'deny',
  },
  onApprovalRequest: (req) => notifySlack(req), // req.approve() / req.deny()
})

// One line. Works with plain functions or any framework's { execute } tools.
const tools = nominee.guard(
  {
    'orders.read': readOrder,
    'refund.issue': issueRefund,
    'customers.export': exportCustomers,
  },
  { user: 'alice' },
)
```

Denied calls throw `PolicyDeniedError` **before the tool runs**. An `ask` can
resolve inline or surface `ActionPendingError` with a durable action id for
later resume. Every outcome lands on the receipt chain.

Run the production refund example with Vercel AI SDK tools, durable approvals,
and PostgreSQL stores:
[`examples/support-refund-agent`](https://github.com/bharath31/nominee/tree/main/examples/support-refund-agent).

The supporting prompt-injection proof shows the same enforcement boundary
against untrusted model input:
[`examples/prompt-injection-blocked`](https://github.com/bharath31/nominee/tree/main/examples/prompt-injection-blocked).

---

## Policy semantics

- **First match wins** within a policy; rules are checked in order.
- **No match → `fallback`** (default `'ask'`; set `'deny'` for default-deny).
- **`when` predicates** see `{ tool, input, user, tenant, resource, chain }`.
- **Budgets**: `allow('search.*', { max: 20 })` — the 21st call escalates to a human.
- **Delegation can only narrow**: across `delegate()` chains the strictest outcome wins (deny > ask > allow).

```ts
const researcher = nominee.delegate('researcher', {
  policy: [deny('email.*'), deny('github.merge_*')],
})
// researcher's receipts carry chain: ['orchestrator', 'researcher']

// Dry-run without consuming budgets or asking anyone:
await nominee.check({ tool: 'repo.delete', user: 'alice' }) // → { effect: 'deny', … }
```

---

## Receipts

```ts
const nominee = new Nominee({
  policy,
  receipts: {
    key: process.env.RECEIPT_KEY,          // optional HMAC signing
    delivery: 'strict',                    // fail closed if the async sink fails
    onReceipt: (r) => auditLog.write(r),   // may return a Promise
  },
})

nominee.receipts          // the chain so far
nominee.verifyReceipts()  // { ok: true, checked: 128 }
await nominee.flushReceipts()

// Later, offline, from your exported log:
import { verifyReceipts } from 'nominee'
formatReceipts(nominee.receipts)
verifyReceipts(exported, { key })  // { ok: false, brokenAt: 41, reason: '…' }
```

Each receipt's hash covers its content plus the previous hash — editing or deleting *any* record breaks verification of everything after it. Inputs are recorded as `inputHash` by default: you can prove what an approver saw without writing user data into logs.

For a threat model that includes whole-database rollback, anchor the signed
stream tip in an external append-only system; a valid older chain is still a
valid chain without that checkpoint.

A durable or hibernating agent that reconstructs its `Nominee` instance across restarts can persist receipts itself and pass `receipts: { resume: { seq, prev } }` — the sequence number and hash to continue from — so the new ledger picks up the same chain instead of starting a second genesis.

---

## Human-in-the-Loop Approvals

```ts
// Legacy single-process API: blocks until the user responds.
await nominee.approve({ user: 'alice', action: 'repo.delete', detail: { repo: 'a/b' } })

// Settle from your webhook (Slack button, push notification, UI):
nominee.resolveApproval(approvalId, 'approved') // or 'denied'
```

For durable workflows, use `prepareAction()`, persist the pending action id,
then call `resolveActionApproval()` / `resumeAction()` after the user decides.
Strategies can carry native approval flows —
[`nominee-auth0`](https://www.npmjs.com/package/nominee-auth0) does resumable
CIBA approvals.

---

## Tokens (the supporting act)

Tools that act on third-party APIs need credentials — fresh ones, at call time, never in the model's context:

```ts
import { Nominee, tokens } from 'nominee'

const nominee = new Nominee({
  policy,
  strategy: tokens(({ user, connection }) => db.getFreshToken(user, connection)),
})

await nominee.run(
  {
    tool: 'github.issue.close',
    input: { repo, issue },
    user: 'alice',
    resource: `repo:${repo}#${issue}`,
    connection: 'github',
    scopes: ['issues:write'],
  },
  ({ token }) => closeIssue({ repo, issue, token }),
)
```

| Strategy | Use case |
|---|---|
| `tokens(fn)` | Simple function — env vars, your DB, a literal string |
| `OAuth2({ connections })` | Generic refresh-token flow, zero deps. `onRefreshToken` persists rotation (GitHub Apps, Google, Okta, Auth0) |
| `Memory({ tokens })` | Dev & test in-memory store |
| [`nominee-supabase`](https://www.npmjs.com/package/nominee-supabase) | Provider tokens stored in Supabase *(optional)* |
| [`nominee-auth0`](https://www.npmjs.com/package/nominee-auth0) | Auth0 Token Vault + CIBA push approvals *(optional)* |
| [`nominee-postgres`](https://www.npmjs.com/package/nominee-postgres) | Durable actions, budgets, capabilities, outcomes, and receipt streams |

Proof that naive refresh breaks under rotation + concurrency (7/8 fail; nominee 8/8):
[`examples/token-refresh-correctness`](https://github.com/bharath31/nominee/tree/main/examples/token-refresh-correctness).

---

## Full API

```ts
// Decision-bound execution (recommended; required in production mode)
await nominee.run({ tool, input, user, resource, tenant, connection, scopes }, execute)
const prepared = await nominee.prepareAction({ tool, input, user })
await nominee.resolveActionApproval(actionId, { decision: 'approved', approver, via })
const resumed = await nominee.resumeAction(actionId)
await nominee.executeCapability(resumed.capability, input, execute) // execute receives { action, input, token? }

// Authorization
await nominee.authorize({ tool, input, user })   // allow | throws PolicyDeniedError / ApprovalDeniedError
await nominee.check({ tool, input, user })       // dry-run: the decision, no side effects
nominee.guard(tools, { user })                   // wrap once, enforce everywhere

// Approvals
await nominee.approve({ user, action, detail })
nominee.resolveApproval(id, 'approved' | 'denied')

// Receipts
nominee.receipts
nominee.verifyReceipts()
formatReceipts(nominee.receipts)
await nominee.flushReceipts()
await nominee.verifyDurableReceipts() // verify durable stream + checkpoint
verifyReceipts(receipts, { key })

// Observability
nominee.onGovernedAction((event) => metrics.record(event))
// or: usageReporter() for opt-in measurement — see docs/measurement.md

// Delegation (policies can only narrow; shared receipt chain)
const sub = nominee.delegate('research-agent', { policy })

// Read durable action state
await nominee.getAction(actionId)

// Tokens
await nominee.token({ user, connection })
await nominee.exchange({ user, connection, actor, scopes }) // RFC 8693
nominee.invalidate(user, connection)

// Fine-grained authz via strategy (e.g. Auth0 FGA)
await nominee.can({ user, action, resource })

// Audit stream (in-process listeners, alongside receipts)
const unsub = nominee.on((event) => log(event))
```

Errors: `PolicyDeniedError`, `ApprovalDeniedError`, `ActionPendingError`,
`AuthorizationInputChangedError`, `CapabilityInvalidError`,
`ExternalAuthorizationDeniedError`, `ActionOutcomePersistenceError`,
`ActionNotFoundError`, `ActionStateError`.

---

## Adapters

| Where your agent runs | Integration |
|---|---|
| **Vercel AI SDK** | [`nominee-ai`](https://www.npmjs.com/package/nominee-ai) — `guardTools()` / `nomineeTool()` |
| **Vercel Eve** | [`nominee-eve`](https://www.npmjs.com/package/nominee-eve) — `nomineeTool()` |
| **Cloudflare Agents** | via `nominee-ai` |
| **OpenAI Agents SDK** | [`nominee-openai`](https://www.npmjs.com/package/nominee-openai) — native resumable approvals |
| **Mastra** | [`nominee-mastra`](https://www.npmjs.com/package/nominee-mastra) — native or portable approvals |
| **MCP servers** | [`nominee-mcp`](https://www.npmjs.com/package/nominee-mcp) — `registerNomineeTool()` |

---

For high-impact paths, use `production: true` with
[`nominee-postgres`](https://www.npmjs.com/package/nominee-postgres). Production
mode fails construction without a default-deny policy, durable action state,
atomic durable receipts, strict delivery, and durable provider approval state.
Review the repository's security guidance and production runbook before launch.

## Contributing

PRs for community strategies and framework adapters are enthusiastically welcome — see [CONTRIBUTING.md](https://github.com/bharath31/nominee/blob/main/.github/CONTRIBUTING.md).

MIT License · [github.com/bharath31/nominee](https://github.com/bharath31/nominee)
