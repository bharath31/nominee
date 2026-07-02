<h1 align="center">nominee</h1>

<p align="center">
  <a href="https://www.npmjs.com/package/nominee"><img src="https://img.shields.io/npm/v/nominee?style=flat-square&colorA=0a0a0f&colorB=7c3aed" alt="npm" /></a>
  <a href="https://github.com/bharath31/nominee/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/nominee?style=flat-square&colorA=0a0a0f&colorB=555" alt="license" /></a>
</p>

<p align="center">
  <strong>The authorization layer for AI agents.</strong><br />
  Your agent logs in as you. nominee decides what it can <em>do</em> as you.<br />
  Policy · approvals · receipts — zero dependencies, framework-neutral, no SaaS.
</p>

---

## Installation

```bash
npm i nominee
```

No signup. No SaaS account. No vendor lock-in. Zero runtime dependencies.

---

## The Problem

Your agent authenticates as you — and then it's authorized as you. **All of you.** One injected sentence in an email or web page, and the model will use that authority against you. Vaults hide the key but still execute the request. `needsApproval: true` gives you a Y/N prompt for everything, which is why everyone ends up skipping permissions entirely.

nominee sits between the model and your tools, in-process, and gives every tool call:

1. **Policy** — declarative `allow` / `deny` / `ask` rules: glob patterns, argument-level conditions, call budgets. The model cannot talk its way past a `deny`.
2. **Approvals** — `ask` pauses the call until a human decides, with the full arguments in front of them.
3. **Receipts** — every decision (including refusals) sealed into a hash-chained, optionally HMAC-signed, tamper-evident log. Inputs hashed, never stored.

---

## Quickstart

```ts
import { Nominee, allow, deny, ask } from 'nominee'

const nominee = new Nominee({
  policy: {
    rules: [
      allow('email.read'),
      allow('email.forward', { when: ({ input }) => input.to.endsWith('@acme.com') }),
      deny('email.forward', { reason: 'external forwarding is exfiltration' }),
      ask('email.delete'),               // a human decides, every time
      allow('search.web', { max: 20 }),  // budget: call #21 asks a human
    ],
    fallback: 'deny',
  },
  onApprovalRequest: (req) => notifySlack(req), // req.approve() / req.deny()
})

// One line. Works with plain functions or any framework's { execute } tools.
const tools = nominee.guard(
  { 'email.read': readEmail, 'email.forward': forwardEmail },
  { user: 'alice' },
)
```

Denied calls throw `PolicyDeniedError` **before the tool runs**. Escalated calls block until a human decides (denial throws `ApprovalDeniedError`). Every outcome lands on the receipt chain.

Watch a prompt-injected agent fail to exfiltrate, with no API keys:
[`examples/prompt-injection-blocked`](https://github.com/bharath31/nominee/tree/main/examples/prompt-injection-blocked).

---

## Policy semantics

- **First match wins** within a policy; rules are checked in order.
- **No match → `fallback`** (default `'ask'`; set `'deny'` for default-deny).
- **`when` predicates** see `{ tool, input, user, chain }`.
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
    onReceipt: (r) => auditLog.write(r),   // stream to your sink
  },
})

nominee.receipts          // the chain so far
nominee.verifyReceipts()  // { ok: true, checked: 128 }

// Later, offline, from your exported log:
import { verifyReceipts } from 'nominee'
verifyReceipts(exported, { key })  // { ok: false, brokenAt: 41, reason: '…' }
```

Each receipt's hash covers its content plus the previous hash — editing or deleting *any* record breaks verification of everything after it. Inputs are recorded as `inputHash` by default: you can prove what an approver saw without writing user data into logs.

---

## Human-in-the-Loop Approvals

```ts
// Gate an action — blocks until the user responds (via an ask rule, or directly):
await nominee.approve({ user: 'alice', action: 'repo.delete', detail: { repo: 'a/b' } })

// Settle from your webhook (Slack button, push notification, UI):
nominee.resolveApproval(approvalId, 'approved') // or 'denied'
```

Strategies can carry native approval flows — [`nominee-auth0`](https://www.npmjs.com/package/nominee-auth0) does CIBA push approvals.

---

## Tokens (the supporting act)

Tools that act on third-party APIs need credentials — fresh ones, at call time, never in the model's context:

```ts
import { Nominee, tokens } from 'nominee'

const nominee = new Nominee({
  policy,
  strategy: tokens(({ user, connection }) => db.getFreshToken(user, connection)),
})

// Inside a tool: valid *now*, cached, auto-refreshed, single-flight under concurrency.
const token = await nominee.token({ user: 'alice', connection: 'github' })
```

| Strategy | Use case |
|---|---|
| `tokens(fn)` | Simple function — env vars, your DB, a literal string |
| `OAuth2({ connections })` | Generic refresh-token flow, zero deps. `onRefreshToken` persists rotation (GitHub Apps, Google, Okta, Auth0) |
| `Memory({ tokens })` | Dev & test in-memory store |
| [`nominee-supabase`](https://www.npmjs.com/package/nominee-supabase) | Provider tokens stored in Supabase *(optional)* |
| [`nominee-auth0`](https://www.npmjs.com/package/nominee-auth0) | Auth0 Token Vault + CIBA push approvals *(optional)* |

Proof that naive refresh breaks under rotation + concurrency (7/8 fail; nominee 8/8):
[`examples/token-refresh-correctness`](https://github.com/bharath31/nominee/tree/main/examples/token-refresh-correctness).

---

## Full API

```ts
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
verifyReceipts(receipts, { key })

// Delegation (policies can only narrow; shared receipt chain)
const sub = nominee.delegate('research-agent', { policy })

// Tokens
await nominee.token({ user, connection })
await nominee.exchange({ user, connection, actor, scopes }) // RFC 8693
nominee.invalidate(user, connection)

// Fine-grained authz via strategy (e.g. Auth0 FGA)
await nominee.can({ user, action, resource })

// Audit stream (in-process listeners, alongside receipts)
const unsub = nominee.on((event) => log(event))
```

---

## Adapters

| Where your agent runs | Integration |
|---|---|
| **Vercel AI SDK** | [`nominee-ai`](https://www.npmjs.com/package/nominee-ai) — `guardTools()` / `nomineeTool()` |
| **Vercel Eve** | [`nominee-eve`](https://www.npmjs.com/package/nominee-eve) — `nomineeTool()` |
| **Cloudflare Agents** | via `nominee-ai` |
| **Mastra / OpenAI Agents / MCP / anything** | core `nominee.guard()` wraps any object of functions or `{ execute }` tools |

---

## Contributing

PRs for community strategies and framework adapters are enthusiastically welcome — see [CONTRIBUTING.md](https://github.com/bharath31/nominee/blob/main/.github/CONTRIBUTING.md).

MIT License · [github.com/bharath31/nominee](https://github.com/bharath31/nominee)
