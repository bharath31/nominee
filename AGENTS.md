# AGENTS.md - nominee

Guide for AI coding agents and contributors working in this repository.

## Project

nominee is the authorization layer for AI agents. Every tool call is checked
against a declarative allow/deny/ask policy (`nominee.authorize()` /
`nominee.guard()`), risky calls pause for human approval, and every decision —
including refusals — is sealed into a hash-chained, tamper-evident receipt log.
Tools that act on third-party APIs call `nominee.token()` at execution time to
get a fresh access token for a user and connection.

Three design commitments matter most:

1. **Install-and-go by default.** A policy-only nominee needs no strategy, no
   provider, no signup. Core token usage works with a plain function that
   returns a token. Auth0 is an optional managed strategy, not a requirement.
2. **Core stays dependency-free.** `packages/core` must have zero runtime
   dependencies (it carries its own SHA-256/HMAC). Provider and framework
   dependencies belong in strategy or adapter packages.
3. **Enforcement is honest.** Deny means the tool never runs; receipts record
   refusals as faithfully as approvals; sub-agent policies can only narrow
   authority, never widen it.

## Layout

```text
packages/
  core/   published as nominee        - engine, Strategy interface, built-in strategies
  ai/     published as nominee-ai     - Vercel AI SDK and Cloudflare Agents adapter
  eve/    published as nominee-eve    - Vercel Eve adapter
  auth0/  published as nominee-auth0  - optional Auth0 strategy
examples/
  prompt-injection-blocked/   flagship demo: injected exfiltration blocked by policy (no API keys)
  github-agent/               golden Eve + Auth0 example (PR review-and-merge agent)
site/
  static microsite for nominee.dev
  agent-worker/   deployed nominee.dev/agent worker (Cloudflare Durable Object)
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
await nominee.check({ tool, input, user })     // dry run, no side effects
const tools = nominee.guard(rawTools, { user }) // wrap functions or { execute } tools

// Receipts
nominee.receipts
nominee.verifyReceipts()
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

Policy semantics: first matching rule wins within a policy; no match falls back
to `fallback` (default `'ask'`); across a delegation chain the strictest
outcome wins (deny > ask > allow). Sub-agent policies passed to `delegate()`
default their fallback to `'allow'` (they are restrictions on top of the
chain).

Adapters expose `nomineeTool(config)`, `withNominee(nominee, defaults)`, and —
for `nominee-ai` — `guardTools(nominee, tools, { user })`. Adapter config uses
`inputSchema`, optional `connection`, optional `approval` (forces an ask),
optional `action` (the policy tool name), and an `execute(input, ctx)`
function. The adapter context is `{ token?, user, ai }` for `nominee-ai` and
`{ token?, user, eve }` for `nominee-eve`.

## Commands

```bash
pnpm install
pnpm -r build
pnpm -r test
pnpm -r typecheck
pnpm check
pnpm format
```

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

Keep examples aligned with the actual exported API before publishing.
