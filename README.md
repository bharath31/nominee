<h1 align="center">nominee</h1>

<p align="center">
  Building an AI agent that can change real data?<br />
  <strong>Your agent calls tools. Your rules decide what runs.</strong><br />
  nominee is an open-source TypeScript library that checks every AI tool call<br />
  before your tool code executes.
</p>

<p align="center">
  <a href="https://nominee.dev">Website</a> ·
  <a href="https://nominee.dev/docs/">Docs</a> ·
  <a href="https://nominee.dev/playground/">Playground</a> ·
  <a href="https://nominee.dev/agent">Security demo</a> ·
  <a href="https://www.npmjs.com/package/nominee">npm</a> ·
  <a href=".github/SECURITY.md">Security</a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/nominee"><img src="https://img.shields.io/npm/v/nominee?style=flat-square&colorA=0a0a0f&colorB=7c3aed&label=nominee" alt="npm nominee" /></a>
  <a href="https://www.npmjs.com/package/nominee-ai"><img src="https://img.shields.io/npm/v/nominee-ai?style=flat-square&colorA=0a0a0f&colorB=3b82f6&label=nominee-ai" alt="npm nominee-ai" /></a>
  <a href="https://www.npmjs.com/package/nominee-eve"><img src="https://img.shields.io/npm/v/nominee-eve?style=flat-square&colorA=0a0a0f&colorB=10b981&label=nominee-eve" alt="npm nominee-eve" /></a>
  <a href="https://www.npmjs.com/package/nominee-auth0"><img src="https://img.shields.io/npm/v/nominee-auth0?style=flat-square&colorA=0a0a0f&colorB=f59e0b&label=nominee-auth0" alt="npm nominee-auth0" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/npm/l/nominee?style=flat-square&colorA=0a0a0f&colorB=555" alt="license" /></a>
</p>

---

## Try it now

[Open the live support agent](https://nominee.dev/playground/) to edit the policy, run refund calls, approve the `$200` call yourself, and inspect the receipts.

Or run the same proof in your terminal:

```bash
npx nominee-cli
```

No signup, API key, or clone. The command runs a support agent against the real package. The proof itself is offline; `npx` may first download it from npm.

```text
✓ $25 refund    allowed → refund.issue ran
? $200 refund   agent paused → waiting for your approval
✓ $200 refund   approved once → refund.issue ran
✗ $2,000 refund blocked before refund.issue ran
✗ customer export blocked before customers.export ran
✓ receipt chain verifies
```

Your agent requests a tool call. Nominee checks your rules before the tool function runs.

## Add it to your agent

```bash
npm i nominee
```

```ts
import { Nominee, allow, ask, deny } from 'nominee'

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
  onApprovalRequest: (request) => sendToYourApprovalUI(request),
})

const tools = nominee.guard(
  {
    'orders.read': readOrder,
    'refund.issue': issueRefund,
    'customers.export': exportCustomers,
  },
  { user: session.userId },
)
```

For durable production wiring, see [`examples/support-refund-agent`](examples/support-refund-agent): Vercel AI SDK tools, approvals that survive the request, and PostgreSQL stores under `production: true`.

The result is literal:

- `allow`: call the tool.
- `ask`: wait for a person; an approval applies to the arguments they reviewed.
- `deny`: throw before the tool function runs.
- Every outcome leaves a receipt.

The core has zero runtime dependencies. Adapters wrap Vercel AI SDK, Eve, OpenAI Agents, Mastra, Cloudflare Agents, and MCP tools.

## Why add it instead of an `if`?

For one low-risk tool, use an `if`.

Nominee becomes useful when an approval lasts longer than one request, two workers share a limit, a user's permission can change during the wait, or the same rules must cover several agent frameworks. It binds approval to one set of arguments, rechecks resource access after the pause, executes once, and records the result.

> **Security Boundary Warning:** In-process wrapping only enforces actions that actually route through Nominee. For high-impact tools, raw credentials and the raw tool implementations must be entirely inaccessible to model-controlled code (e.g. by using an isolated action service), otherwise a compromised model could bypass the wrapper entirely.

## Security proof: untrusted content cannot change the rules

<p align="center">
  <img src="https://raw.githubusercontent.com/bharath31/nominee/main/.github/media/nominee-injection.gif?v=1" alt="A prompt-injected agent tries to forward the whole inbox to an attacker; nominee's deny rule blocks the tool call before it runs, holds the delete for a human, and seals a tamper-evident receipt of every decision." width="100%" />
</p>

[`examples/prompt-injection-blocked`](examples/prompt-injection-blocked) is a second, security-focused example. An email tells the agent to forward the inbox to an attacker. The model follows the instruction; the deny rule still stops the tool before it runs.

```
2. The model obeys the injection and tries to exfiltrate

  ✓ BLOCKED before the tool ran: nominee: policy denied "email.forward" for alice
    (rule deny:email.forward) — external forwarding is exfiltration

3. …then tries the delete it was told to do

  ⏸  approval requested: email.delete {"id":2}
  ✗  human denies (nobody asked for a deletion)
  ✓ BLOCKED by the human: nominee: approval denied (id=apr_…)

5. The receipt chain (signed, tamper-evident — decision-bound: plan → policy → capability → execute)

  #0  action.planned       email.read                85ec42ce6f90
  #1  policy.decision      email.read       allow     9085d0623e9b
  #2  capability.issued    email.read                a66cd4224439
  #3  capability.consumed  email.read                6032829a4e84
  #4  execution.started    email.read                16e4cee522be
  #5  execution.succeeded  email.read       succeeded 9453041b527a
  #6  action.planned       email.forward             484cf3d44d24
  #7  policy.decision      email.forward    deny      0772bf7ce862
  #8  action.planned       email.delete              b2b3c0db07f5
  #9  policy.decision      email.delete     ask       f819e42e6284
  #10 approval.requested   email.delete              2f91d44acb4c
  #11 approval.resolved    email.delete     denied    82a3b97d991d
  #12 action.planned       email.forward             84819ea52ae1
  #13 policy.decision      email.forward    allow     8e1eef0951b6
  ...

  chain verifies: ✓ 18 receipts intact
  doctored log (deny receipts removed): ✓ detected — broken at #7
```

The support-agent example explains the product. This example tests the same boundary against untrusted model input.

## Policy semantics

Small enough to hold in your head:

- **First match wins** within a policy; rules are checked in order.
- **No match → `fallback`** (default `'ask'` — unknown actions reach a human; set `'deny'` for default-deny).
- **`when` predicates** see `{ tool, input, user, tenant, resource, chain }` —
  gate on trusted application context and arguments, not just names.
- **Budgets**: `allow('search.*', { max: 20 })` — the 21st call escalates to a human instead of failing.
- **Delegation can only narrow**: across `nominee.delegate('sub-agent', { policy })` chains, the strictest outcome wins (deny > ask > allow). A sub-agent can never allow what its parent denies.

```ts
const researcher = nominee.delegate('researcher', {
  policy: [deny('email.*'), deny('github.merge_*')],
})
// researcher's receipts carry chain: ['orchestrator', 'researcher']
```

Dry-run any call without consuming budgets or asking anyone:

```ts
await nominee.check({ tool: 'repo.delete', user: 'alice' }) // → { effect: 'deny', ... }
```

## Approvals

`ask` rules route through a portable approval engine when you need one approval policy or channel outside the agent runtime:

```ts
const nominee = new Nominee({
  policy: [ask('github.merge_pr', { timeoutMs: 3600_000 })],
  onApprovalRequest: async (req) => {
    // req.action, req.detail (the full tool input), req.id
    await slack.post(approvalCard(req))   // then req.approve() / req.deny(),
  },                                      // or nominee.resolveApproval(req.id, …) from a webhook
})
```

The legacy `approve()` API waits in-process. The decision-bound `run()` and
adapter paths instead surface `ActionPendingError` when an approval outlives
the current request; persist its action id, resolve or poll it, then call
`resumeAction()`. Denied or expired actions never run, and the refusal is on
the record. Strategies can carry native flows (Auth0 CIBA via
[`nominee-auth0`](packages/auth0)).

See it deployed: [nominee.dev/agent](https://nominee.dev/agent) — a real
Cloudflare Durable Object agent that hibernates mid-session while it waits
for your approval (email link or Auth0 Guardian push), then resumes the same
hash-chained receipt log and fetches a fresh GitHub token only at that
moment. [`site/agent-worker`](site/agent-worker) is the source.

## Receipts

Every decision, approval, and token grant appends to a hash chain — each receipt's hash covers its content plus the previous hash, so editing or deleting *any* record breaks verification of everything after it:

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
await nominee.flushReceipts() // checkpoint buffered sinks before shutdown/resume

// Later, offline, from your log sink:
import { formatReceipts, verifyReceipts } from 'nominee'
console.log(formatReceipts(nominee.receipts))
verifyReceipts(exported, { key })  // { ok: false, brokenAt: 41, reason: '…' }
```

By default inputs are recorded as `inputHash` — you can prove what an approver saw without writing user data into logs (`input: 'raw'` and `'none'` are available). If your compliance story needs "who authorized this agent action, seeing what, when" — this is that, as a data structure.
In-memory receipts retain the latest 1,000 entries by default to keep development servers bounded; pass `receipts: { retain: 'all' }` or use `onReceipt` / `nominee-postgres` for an unbounded audit history.

Anchor the signed stream tip outside the primary database when whole-database
rollback is in scope; a chain alone cannot distinguish a complete rollback to
an older valid tip.

For multi-replica production, [`nominee-postgres`](packages/postgres) atomically
sequences the receipt stream alongside durable action, approval, capability,
budget, outcome, and transition-journal state. The in-memory stores remain
useful conformance implementations, but deliberately fail `production: true`.

## Framework adapters

| Where your agent runs | Integration |
|---|---|
| **Vercel AI SDK** | `guardTools(nominee, tools, { user })` from [`nominee-ai`](packages/ai) — or `nomineeTool` for per-tool config |
| **Vercel Eve** | `nomineeTool` from [`nominee-eve`](packages/eve) — policy + portable approvals inside Eve tools |
| **Cloudflare Agents** | via `nominee-ai` |
| **OpenAI Agents SDK** | `nomineeTool` from [`nominee-openai`](packages/openai) — Nominee `ask` maps to native resumable approval |
| **Mastra** | `nomineeTool` from [`nominee-mastra`](packages/mastra) — native or portable durable approval |
| **MCP servers** | `registerNomineeTool` from [`nominee-mcp`](packages/mcp) |
| **Standalone** | `nominee.run({ tool, input, user, resource }, execute)` around any side effect |

```ts
// Vercel AI SDK — one line around your existing tools:
import { guardTools } from 'nominee-ai'

const result = await generateText({
  model,
  tools: guardTools(nominee, { searchEmail, forwardEmail, mergePr }, { user: session.userId }),
})
```

## Tokens (the supporting act)

Tools that act on third-party APIs also need credentials — fresh ones, at call time, never in the model's context. nominee's strategy layer does that too: call-time resolution, single-flight refresh under concurrency, rotation persistence, and swappable backends (your DB → OAuth2 → Auth0 Token Vault → Supabase) without touching agent code. In the decision-bound path the credential resolver receives the action, resource, capability, input hash, and policy version as an authorization ceiling.

```ts
const nominee = new Nominee({
  policy,
  strategy: tokens(({ user, connection }) => db.getFreshToken(user, connection)),
})

await nominee.run(
  {
    tool: 'github.issue.close',
    input: { repo, issue },
    user,
    resource: `repo:${repo}#${issue}`,
    connection: 'github',
    scopes: ['issues:write'],
  },
  ({ token }) => closeIssue({ repo, issue, token }),
)
```

Runnable proof that naive refresh breaks under rotation + concurrency (7/8 fail; nominee 8/8): [`examples/token-refresh-correctness`](examples/token-refresh-correctness).

## API

```ts
// Decision-bound execution (recommended; required by production mode)
await nominee.run({ tool, input, user, resource, tenant, connection, scopes }, execute)
const prepared = await nominee.prepareAction({ tool, input, user }) // capability or pending id
await nominee.resolveActionApproval(actionId, { decision: 'approved', approver, via })
const resumed = await nominee.resumeAction(actionId)
await nominee.executeCapability(resumed.capability, input, execute)
// execute receives { action, input, token? }

// Authorization
const authorization = await nominee.authorize({ tool, input, user }) // allow | throws on refusal
await nominee.assertUnchanged(authorization, input) // bind manual authorization to execution
await nominee.check({ tool, input, user })       // dry-run: the decision, no side effects
nominee.guard(tools, { user })                   // wrap once, enforce everywhere

// Approvals
await nominee.approve({ user, action, detail })  // block until a human decides
nominee.resolveApproval(id, 'approved')          // settle from your webhook

// Receipts
nominee.receipts                                 // hash-chained record
nominee.verifyReceipts()                         // tamper check
formatReceipts(nominee.receipts)                 // compact terminal printer
await nominee.flushReceipts()                    // await buffered async sink writes
await nominee.verifyDurableReceipts()            // verify durable stream + checkpoint
verifyReceipts(receipts, { key })                // offline / exported verification

// Observability
nominee.onGovernedAction((event) => metrics.record(event))
// or: usageReporter() for opt-in measurement — see docs/measurement.md

// Delegation
const sub = nominee.delegate('research-agent', { policy })  // can only narrow
await nominee.getAction(actionId)                // read durable action state

// Tokens
await nominee.token({ user, connection })        // fresh at call time, single-flight refresh
await nominee.exchange({ user, connection, actor, scopes }) // RFC 8693 downscoping
nominee.invalidate(user, connection)

// Audit stream (in-process listeners, alongside receipts)
const unsub = nominee.on((event) => log(event))
```

## Why not …?

- **Framework-native approval** — the right choice for framework-local confirmation and durable run control. nominee is useful when the decision must also incorporate application entitlements, stay consistent across runtimes, control credential delivery, or feed one evidence stream. If native approval covers the whole boundary, do not add nominee.
- **Credential vaults / proxies** — they stop the model *seeing* the key, but the agent can still do anything *through* them. Authorization is the missing half; nominee is that half (and composes fine with a vault as its strategy).
- **Sandboxes** — contain the filesystem and network of the process. Your OAuth authority isn't in the sandbox; it's in the token. Use both.
- **Hosted agent-auth platforms** (Arcade, Composio, Auth0 for AI, Vercel Connect) — useful connection and credential systems. Nominee can use them underneath its enforcement path when you need one portable application-authorization contract and evidence stream across providers and runtimes.

Partner-specific integration kits: [Auth0](docs/partner-kits/auth0.md) ·
[WorkOS FGA](docs/partner-kits/workos-fga.md) · [OPA](docs/partner-kits/opa.md) ·
[Arcade / Composio](docs/partner-kits/arcade-composio.md).

### When you *don't* need nominee

- A read-only agent with no authority worth guarding.
- Your platform's native permission system already covers you end-to-end and you're happy inside it.
- You want one fully-managed vendor for tools + auth + policy — use Arcade or Composio directly.

For a high-impact path, enable `production: true`. Construction then fails
unless a default-deny policy, durable action store, atomic durable receipt
store, and strict receipt delivery are configured. The reference
[`nominee-postgres`](packages/postgres) implementation supplies those stores;
Auth0 CIBA production deployments must use `PostgresCibaStore` (or another
durable implementation) for restart-safe, ID-token-verified approval polling.
This is infrastructure, not a compliance certification—read
[Security](.github/SECURITY.md) and the
[production runbook](docs/production.md).

## Contributing

PRs for community strategies (Clerk, WorkOS, Firebase, …) and additional framework adapters are enthusiastically welcome — `nominee-auth0`, `nominee-supabase`, and the adapter packages show the shape. See [CONTRIBUTING.md](.github/CONTRIBUTING.md). By participating you agree to the [Code of Conduct](.github/CODE_OF_CONDUCT.md).

Found a security issue? Please report it privately — see [SECURITY.md](.github/SECURITY.md).

---

<p align="center">
  Built by <a href="https://github.com/bharath31">Bharath</a> · MIT License · Neutral by design
</p>
