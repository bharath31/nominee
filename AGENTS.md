# AGENTS.md - nominee

Guide for AI coding agents and contributors working in this repository.

## Project

nominee is the authorization layer for AI agents. Every tool call is checked
against a declarative allow/deny/ask policy (`nominee.authorize()` /
`nominee.guard()`), risky calls pause for human approval, and every decision —
including refusals — is sealed into a hash-chained, tamper-evident receipt log.
Tools that act on third-party APIs call `nominee.token()` at execution time to
get a fresh access token for a user and connection.

The framework decides *when* to call a tool. nominee decides *whether the call
may execute* — and for high-impact actions that decision is bound to the exact
arguments, consumable once, and recoverable across restarts. See
[docs/production.md](docs/production.md) for that lifecycle.

Four design commitments matter most:

1. **Install-and-go by default.** A policy-only nominee needs no strategy, no
   provider, no signup. Core token usage works with a plain function that
   returns a token. Auth0 is an optional managed strategy, not a requirement.
2. **Core stays dependency-free.** `packages/core` must have zero runtime
   dependencies (it carries its own SHA-256/HMAC). Provider and framework
   dependencies belong in strategy or adapter packages.
3. **Enforcement is honest.** Deny means the tool never runs; receipts record
   refusals as faithfully as approvals; sub-agent policies can only narrow
   authority, never widen it.
4. **Fail closed, and say so.** A store, sink, or authorizer that errors must
   never degrade into `allow`. In-memory stores are conformance
   implementations and deliberately refuse `production: true`.

## Layout

```text
packages/
  core/     published as nominee           - engine, action lifecycle, Strategy interface
  ai/       published as nominee-ai        - Vercel AI SDK and Cloudflare Agents adapter
  eve/      published as nominee-eve       - Vercel Eve adapter
  openai/   published as nominee-openai    - OpenAI Agents SDK adapter
  mastra/   published as nominee-mastra    - Mastra adapter
  mcp/      published as nominee-mcp       - MCP server adapter
  auth0/    published as nominee-auth0     - optional Auth0 strategy (+ CIBA stores)
  supabase/ published as nominee-supabase  - optional Supabase strategy
  postgres/ published as nominee-postgres  - durable action/receipt stores for multi-replica
examples/
  prompt-injection-blocked/   flagship demo: injected exfiltration blocked by policy (no API keys)
  github-agent/               golden Eve + Auth0 example (PR review-and-merge agent)
site/
  static microsite for nominee.dev
  agent-worker/   deployed nominee.dev/agent worker (Cloudflare Durable Object) -
                  live pause/hibernate/resume demo: receipt chain resumes across
                  hibernation, credential fetched fresh only at resume; demonstrates
                  prepareAction/resolveActionApproval/resumeAction/executeCapability usage
```

## Public API Shape

```ts
import { Nominee, allow, deny, ask, tokens, verifyReceipts } from 'nominee'

const nominee = new Nominee({
  policy: {
    rules: [
      allow('email.read'),
      allow('email.forward', { when: ({ input }) => input.to.endsWith('@acme.com') }),
      deny('email.forward', { reason: 'external forwarding is exfiltration' }),
      ask('email.delete'),
      allow('search.*', { max: 20 }), // budget: call #21 escalates to a human
    ],
    fallback: 'deny', // default is 'ask'
  },
  receipts: { key: process.env.RECEIPT_KEY, onReceipt: (r) => sink.write(r) },
  strategy: tokens(({ user, connection }) => db.getFreshToken(user, connection)), // optional
  onApprovalRequest: async (req) => notifyUser(req),
  onAudit: (event) => auditDb.insert(event),
  agent: 'triage-bot',
})

// Authorization
await nominee.authorize({ tool, input, user }) // throws PolicyDeniedError / ApprovalDeniedError
await nominee.assertUnchanged(authorization, input) // bind a manual authorize to execution
await nominee.check({ tool, input, user })     // dry run, no side effects
const tools = nominee.guard(rawTools, { user }) // wrap functions or { execute } tools

// Decision-bound execution (required under `production: true`)
await nominee.run({ tool, input, user, resource, tenant, connection, scopes }, execute)
const prepared = await nominee.prepareAction({ tool, input, user }) // capability or pending id
await nominee.resolveActionApproval(actionId, { decision: 'approved', approver, via })
const resumed = await nominee.resumeAction(actionId)
await nominee.executeCapability(resumed.capability, input, execute)

// Receipts
nominee.receipts
nominee.verifyReceipts()
await nominee.flushReceipts()        // await buffered async sinks before shutdown
await nominee.verifyDurableReceipts() // verify the durable stream + checkpoint
verifyReceipts(exported, { key })

// Delegation (policies can only narrow; receipts share one chain)
const sub = nominee.delegate('research-agent', { policy: [deny('email.*')] })

// Approvals + tokens (as before)
await nominee.token({ user, connection })
await nominee.approve({ user, action, detail })
nominee.resolveApproval(id, 'approved')
await nominee.can({ user, action, resource })
nominee.on((event) => auditDb.insert(event))
```

The action lifecycle is
`planned → policy_checked → pending_approval → approved → capability_issued →
executing → succeeded | failed`. A capability is returned once, expires quickly,
and executes once; `resumeAction()` before consumption rotates it and
invalidates the old value. An approval is bound to a canonical hash of the
input, so mutating the arguments after approval throws
`AuthorizationInputChangedError` instead of executing. When an action names a
`resource`, the application `authorizer` is consulted while planning *and* again
after capability consumption, so a permission revoked mid-approval fails closed.

`production: true` refuses construction unless a default-deny policy, a durable
action store, an atomic durable receipt store, and `delivery: 'strict'` are all
configured. `nominee-postgres` supplies the stores.

Policy semantics: first matching rule wins within a policy; no match falls back
to `fallback` (default `'ask'`); across a delegation chain the strictest
outcome wins (deny > ask > allow). Sub-agent policies passed to `delegate()`
default their fallback to `'allow'` (they are restrictions on top of the
chain).

Adapters expose `nomineeTool(config)`, `withNominee(nominee, defaults)`, and —
for `nominee-ai` — `guardTools(nominee, tools, { user })`; `nominee-mcp` exposes
`registerNomineeTool`. Adapter config uses `inputSchema`, optional `connection`,
optional `approval` (forces an ask), optional `action` (the policy tool name),
and an `execute(input, ctx)` function. The adapter context is `{ token?, user,
ai }` for `nominee-ai` and `{ token?, user, eve }` for `nominee-eve`. Official
adapters route through the decision-bound path, so they bind authorization to an
argument fingerprint and surface `ActionPendingError` when an approval outlives
the request.

## Commands

```bash
pnpm install
pnpm -r build
pnpm -r test
pnpm -r typecheck
pnpm check
pnpm format
```

CI and the deploy workflows run Node 24; develop on Node 24+.

Use per-package filters when working narrowly:

```bash
pnpm --filter nominee test
pnpm --filter nominee-ai build
```

## Conventions

- TypeScript strict mode is enabled.
- Use `import type` for type-only imports.
- Use `.js` extensions on relative TypeScript imports.
- Biome formatting uses single quotes, no semicolons, trailing commas, and
  100-character line width.
- Keep public APIs small and documented.
- Prefer focused tests in `test/*.test.ts` next to the package being changed.
- Do not add runtime dependencies to `packages/core`.

## Documentation

First-touch docs live in three places:

- `README.md` for the GitHub landing page.
- `packages/*/README.md` for npm package pages.
- `site/` for nominee.dev.

Deeper operator docs live in `docs/`: [production.md](docs/production.md) for the
production runbook and [measurement.md](docs/measurement.md) for the opt-in usage
reporter. Positioning and GTM working notes are gitignored and stay local.

Keep examples aligned with the actual exported API before publishing.

### Public surface sync

When you change `packages/core/src/nominee.ts`, `action.ts`, adapter `run()`
wiring, or the decision-bound lifecycle, update these surfaces in the same PR:

| Surface | File |
|---|---|
| GitHub landing | `README.md` |
| LLM context (both copies) | `llms.txt`, `site/llms.txt` |
| Docs | `site/docs/index.html` |
| Landing page | `site/index.html` |
| Package READMEs | `packages/*/README.md` (especially adapters) |
| Examples | `examples/*/README.md` |
| Agent guide | `AGENTS.md`, `CLAUDE.md` |

Run `node brand/check-surfaces.mjs` before opening a PR — CI enforces it.
Positioning copy changes start in `brand/content.ts`; walk `brand/README.md`'s
surface registry for narrative surfaces.
