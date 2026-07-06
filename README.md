<p align="center">
  <img src="https://raw.githubusercontent.com/bharath31/nominee/main/.github/media/banner-motion.gif?v=3" alt="nominee — the authorization layer for AI agents. A prompt-injected tool call travels toward the tool and is denied at the policy gate before it lands." width="100%" />
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/nominee"><img src="https://img.shields.io/npm/v/nominee?style=flat-square&colorA=0a0a0f&colorB=7c3aed&label=nominee" alt="npm nominee" /></a>
  <a href="https://www.npmjs.com/package/nominee-ai"><img src="https://img.shields.io/npm/v/nominee-ai?style=flat-square&colorA=0a0a0f&colorB=3b82f6&label=nominee-ai" alt="npm nominee-ai" /></a>
  <a href="https://www.npmjs.com/package/nominee-eve"><img src="https://img.shields.io/npm/v/nominee-eve?style=flat-square&colorA=0a0a0f&colorB=10b981&label=nominee-eve" alt="npm nominee-eve" /></a>
  <a href="https://www.npmjs.com/package/nominee-auth0"><img src="https://img.shields.io/npm/v/nominee-auth0?style=flat-square&colorA=0a0a0f&colorB=f59e0b&label=nominee-auth0" alt="npm nominee-auth0" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/npm/l/nominee?style=flat-square&colorA=0a0a0f&colorB=555" alt="license" /></a>
</p>

<p align="center">
  <strong>The authorization layer for AI agents.</strong><br />
  Your agent logs in as you. nominee decides what it can <em>do</em> as you.<br />
  Policy · approvals · receipts — dependency-free, framework-neutral, no SaaS.
</p>

<p align="center">
  <a href="https://nominee.dev">Website</a> ·
  <a href="https://nominee.dev/docs/">Docs</a> ·
  <a href="https://www.npmjs.com/package/nominee">npm</a> ·
  <a href=".github/SECURITY.md">Security</a>
</p>

---

## The Problem

Your agent authenticates as you — and then it's authorized as you. **All of you.** The token in its context can read every email, merge every PR, delete every repo. One injected sentence in a web page, an email, an issue comment, and the model will happily use that authority against you. Vaults hide the key but still execute the request. Sandboxes contain the process, not the OAuth token. `needsApproval: true` gives you a Y/N prompt for *everything* — which is why everyone ends up running the agent equivalent of `--dangerously-skip-permissions`.

Authentication is solved. **Authorization isn't.**

## What nominee does

nominee sits between the model and your tools, in-process, and gives every tool call three things:

1. **Policy** — declarative `allow` / `deny` / `ask` rules over tool calls: glob patterns, argument-level conditions, call budgets. The model cannot talk its way past a `deny`.
2. **Approvals** — `ask` pauses the call until a human decides, from any channel (Slack, push, your UI), with the full arguments in front of them. Deny means deny.
3. **Receipts** — every decision (including refusals) is sealed into a hash-chained, optionally HMAC-signed, tamper-evident log. Inputs are hashed, not stored — you can prove what the agent saw without logging user data.

Zero dependencies. Works with the Vercel AI SDK, Eve, Mastra, Cloudflare Agents, OpenAI Agents, MCP servers, or a bare `async function`.

```bash
npm i nominee
```

## 60 seconds

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
const tools = nominee.guard({ 'email.read': readEmail, 'email.forward': forwardEmail }, {
  user: 'alice',
})
```

Denied calls throw `PolicyDeniedError` **before the tool runs**. Escalated calls block until a human decides. Every outcome lands on the receipt chain.

## Watch an injected agent fail

<p align="center">
  <img src="https://raw.githubusercontent.com/bharath31/nominee/main/.github/media/nominee-injection.gif?v=1" alt="A prompt-injected agent tries to forward the whole inbox to an attacker; nominee's deny rule blocks the tool call before it runs, holds the delete for a human, and seals a tamper-evident receipt of every decision." width="100%" />
</p>

[`examples/prompt-injection-blocked`](examples/prompt-injection-blocked) — no API keys, one command:

```
2. The model obeys the injection and tries to exfiltrate

  ✓ BLOCKED before the tool ran: nominee: policy denied "email.forward" for alice
    (rule deny:email.forward) — external forwarding is exfiltration

5. The receipt chain (signed, tamper-evident)

  #0 policy.decision email.read       allow    5493c2c54cd54072
  #1 policy.decision email.forward    deny     ca6a069febdb740d
  #2 policy.decision email.delete     ask      d2fe628a52024a1d
  #4 approval.resolved email.delete   denied   2b0ac4aa3ad82dc7
  #5 policy.decision email.forward    allow    fd17436d92c0a162

  chain verifies: ✓ 6 receipts intact
  doctored log (deny receipts removed): ✓ detected — broken at #1
```

The model was fully compromised. The policy didn't care.

## Policy semantics

Small enough to hold in your head:

- **First match wins** within a policy; rules are checked in order.
- **No match → `fallback`** (default `'ask'` — unknown actions reach a human; set `'deny'` for default-deny).
- **`when` predicates** see `{ tool, input, user, chain }` — gate on arguments, not just names.
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

`ask` rules route through one portable approval engine — independent of your framework's (broken, binary) flavor:

```ts
const nominee = new Nominee({
  policy: [ask('github.merge_pr', { timeoutMs: 3600_000 })],
  onApprovalRequest: async (req) => {
    // req.action, req.detail (the full tool input), req.id
    await slack.post(approvalCard(req))   // then req.approve() / req.deny(),
  },                                      // or nominee.resolveApproval(req.id, …) from a webhook
})
```

Denied or expired approvals throw `ApprovalDeniedError` — the tool never runs, and the denial is on the record. Strategies can carry native flows (Auth0 CIBA push approvals via [`nominee-auth0`](packages/auth0)).

## Receipts

Every decision, approval, and token grant appends to a hash chain — each receipt's hash covers its content plus the previous hash, so editing or deleting *any* record breaks verification of everything after it:

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

// Later, offline, from your log sink:
import { verifyReceipts } from 'nominee'
verifyReceipts(exported, { key })  // { ok: false, brokenAt: 41, reason: '…' }
```

By default inputs are recorded as `inputHash` — you can prove what an approver saw without writing user data into logs (`input: 'raw'` and `'none'` are available). If your compliance story needs "who authorized this agent action, seeing what, when" — this is that, as a data structure.

A durable or hibernating agent that reconstructs its `Nominee` instance across restarts (a Durable Object, a resumed job) can persist receipts itself and pass `receipts: { resume: { seq, prev } }` to continue the same chain instead of starting a second genesis — see the live agent demo at [nominee.dev/agent](https://nominee.dev/agent) for a worked example.

## Framework adapters

| Where your agent runs | Integration |
|---|---|
| **Vercel AI SDK** | `guardTools(nominee, tools, { user })` from [`nominee-ai`](packages/ai) — or `nomineeTool` for per-tool config |
| **Vercel Eve** | `nomineeTool` from [`nominee-eve`](packages/eve) — policy + portable approvals inside Eve tools |
| **Cloudflare Agents** | via `nominee-ai` |
| **Mastra / OpenAI Agents / MCP / anything** | core `nominee.guard()` wraps any object of functions or `{ execute }` tools |
| **Standalone** | `nominee.authorize({ tool, input, user })` anywhere you like |

```ts
// Vercel AI SDK — one line around your existing tools:
import { guardTools } from 'nominee-ai'

const result = await generateText({
  model,
  tools: guardTools(nominee, { searchEmail, forwardEmail, mergePr }, { user: session.userId }),
})
```

## Tokens (the supporting act)

Tools that act on third-party APIs also need credentials — fresh ones, at call time, never in the model's context. nominee's strategy layer does that too: call-time resolution, single-flight refresh under concurrency, rotation persistence, and swappable backends (your DB → OAuth2 → Auth0 Token Vault → Supabase) without touching agent code.

```ts
const nominee = new Nominee({
  policy,
  strategy: tokens(({ user, connection }) => db.getFreshToken(user, connection)),
})

// In a tool: a token that is valid *now*, auto-refreshed, audited.
const token = await nominee.token({ user, connection: 'github' })
```

Runnable proof that naive refresh breaks under rotation + concurrency (7/8 fail; nominee 8/8): [`examples/token-refresh-correctness`](examples/token-refresh-correctness).

## API

```ts
// Authorization
await nominee.authorize({ tool, input, user })   // allow | throws PolicyDeniedError / ApprovalDeniedError
await nominee.check({ tool, input, user })       // dry-run: the decision, no side effects
nominee.guard(tools, { user })                   // wrap once, enforce everywhere

// Approvals
await nominee.approve({ user, action, detail })  // block until a human decides
nominee.resolveApproval(id, 'approved')          // settle from your webhook

// Receipts
nominee.receipts                                 // hash-chained record
nominee.verifyReceipts()                         // tamper check
verifyReceipts(receipts, { key })                // offline / exported verification

// Delegation
const sub = nominee.delegate('research-agent', { policy })  // can only narrow

// Tokens
await nominee.token({ user, connection })        // fresh at call time, single-flight refresh
await nominee.exchange({ user, connection, actor, scopes }) // RFC 8693 downscoping
nominee.invalidate(user, connection)

// Audit stream (in-process listeners, alongside receipts)
const unsub = nominee.on((event) => log(event))
```

## Why not …?

- **`needsApproval: true`** — binary, per-tool, no argument conditions, no budgets, no record of the decision, broken for dynamic/MCP tools. nominee is a policy, not a flag — and it's the same policy on every framework.
- **Credential vaults / proxies** — they stop the model *seeing* the key, but the agent can still do anything *through* them. Authorization is the missing half; nominee is that half (and composes fine with a vault as its strategy).
- **Sandboxes** — contain the filesystem and network of the process. Your OAuth authority isn't in the sandbox; it's in the token. Use both.
- **Hosted agent-auth platforms** (Arcade, Composio, Auth0 for AI, Vercel Connect) — good products, but they're SaaS: per-call billing, per-vendor lock-in, and the policy brain lives on their side. nominee is MIT, in-process, and bring-your-own-everything. Use them *under* nominee as strategies if you like them.

### When you *don't* need nominee

- A read-only agent with no authority worth guarding.
- Your platform's native permission system already covers you end-to-end and you're happy inside it.
- You want one fully-managed vendor for tools + auth + policy — use Arcade or Composio directly.

Upgrading from 2.0? It's fully additive, nothing changed shape — see [Migrating from 2.0](https://nominee.dev/docs/#migrating).

## Contributing

PRs for community strategies (Clerk, WorkOS, Firebase, …) and framework adapters (Mastra, OpenAI Agents, LangGraph) are enthusiastically welcome — `nominee-auth0` and `nominee-supabase` show the shape. See [CONTRIBUTING.md](.github/CONTRIBUTING.md). By participating you agree to the [Code of Conduct](.github/CODE_OF_CONDUCT.md).

Found a security issue? Please report it privately — see [SECURITY.md](.github/SECURITY.md).

---

<p align="center">
  Built by <a href="https://github.com/bharath31">Bharath</a> · MIT License · Neutral by design
</p>
