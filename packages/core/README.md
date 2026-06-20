# nominee

**Identity and token delegation for AI agents.** nominee is the provider-neutral auth layer for agents that act on your behalf — the "Passport.js of agent auth."

```bash
npm install nominee
```

## Why nominee?

When an AI agent makes a tool call on behalf of a user (starring a repo, sending an email, creating a ticket), it needs a **fresh** third-party access token at that exact moment. nominee handles:

- **Token freshness** — caches per `(user, connection)` and refreshes before expiry. Never hands out a stale captured token.
- **Human-in-the-loop approval** — gate any action behind a real-time approval request.
- **Audit log** — every token fetch and approval decision is streamed to your audit sink.
- **Zero dependencies** — the core package has no runtime deps.

## Quickstart

```ts
import { Nominee, tokens } from 'nominee'

const nominee = new Nominee({
  // Simplest strategy: a function that returns a token.
  // No signup, no service required.
  strategy: tokens(({ connection }) =>
    process.env[`${connection.toUpperCase()}_TOKEN`]!
  ),

  // Optional: gate actions behind human approval
  onApprovalRequest: async (req) => {
    await sendPushNotification(req.user, req.action, req.detail)
  },

  // Optional: audit sink
  onAudit: (event) => console.log(event),

  agent: 'my-agent',
})

// In your tool — always call at request time, never cache the result yourself
const token = await nominee.token({ user: 'user_123', connection: 'github' })
```

## Human-in-the-loop approval

```ts
// Pause execution until the user approves or denies
await nominee.approve({
  user: 'user_123',
  action: 'delete_file',
  detail: 'Delete /important/data.csv',
})

// From your webhook, settle the approval
nominee.resolveApproval(approvalId, 'approved') // or 'denied'
```

## Strategies

| Strategy | Description |
|---|---|
| `tokens(fn)` | Simple function — env vars, your DB, a literal. Default choice. |
| `OAuth2({ connections })` | Generic refresh-token flow, zero deps. |
| `Memory({ tokens })` | Dev/test in-memory store. |
| [`nominee-auth0`](https://www.npmjs.com/package/nominee-auth0) | Auth0 Token Vault + CIBA approval. Optional managed upgrade. |

## Adapters

| Framework | Package |
|---|---|
| Vercel AI SDK | [`nominee-ai`](https://www.npmjs.com/package/nominee-ai) |
| Vercel Eve | [`nominee-eve`](https://www.npmjs.com/package/nominee-eve) |

## API

```ts
nominee.token({ user, connection })      // fresh token, auto-refreshed
nominee.approve({ user, action, detail }) // resolves on approve, throws ApprovalDeniedError on deny
nominee.resolveApproval(id, 'approved' | 'denied') // settle from your webhook
nominee.can({ user, action, resource })  // FGA — throws unless strategy implements it
nominee.on((event) => ...)               // audit stream; returns unsubscribe
```

## License

MIT
