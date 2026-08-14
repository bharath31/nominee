# Partner kit: Auth0

**What nominee adds.** Auth0 tells you *who* the user is and can hand you a
federated token or a push-to-phone CIBA approval. It does not know that your
agent is about to close issue #482 in a repo the user doesn't own, that this
is the 21st search call this hour, or that a `delete` should always pause for
a human regardless of what the user's token allows. Nominee sits between the
agent's tool call and Auth0: it evaluates your policy first (allow / deny /
ask, with budgets and per-argument conditions), and only then asks Auth0 for
a token or an approval — fresh, at execution time, bound to the exact call
that was authorized. `nominee-auth0` is the existing, shipped, tested
strategy that wires this up; this kit is the shortest path from "I already
use Auth0" to a working nominee policy in front of it.

## Quickstart

```bash
npm i nominee nominee-auth0
```

```ts
import { Nominee, allow, deny, ask } from 'nominee'
import { Auth0 } from 'nominee-auth0'

const nominee = new Nominee({
  policy: {
    rules: [
      allow('github.issue.close'),
      deny('github.repo.delete', { reason: 'destructive; not agent-authorized' }),
      ask('github.issue.close', { when: ({ input }) => input.repo.startsWith('prod-') }),
    ],
    fallback: 'deny',
  },
  strategy: Auth0({
    domain: process.env.AUTH0_DOMAIN!,
    clientId: process.env.AUTH0_CLIENT_ID!,
    clientSecret: process.env.AUTH0_CLIENT_SECRET!,
    subjectToken: ({ user }) => sessionStore.getRefreshToken(user),
    ciba: { bindingMessage: (req) => `Approve "${req.action}"?` }, // push-to-phone for `ask`
  }),
})

// Policy runs first. Only an allowed/approved call reaches Auth0 Token Vault
// for a fresh federated token — bound to this exact call, resolved at execution.
await nominee.run(
  { tool: 'github.issue.close', input: { repo, issue }, user: 'auth0|user_123', connection: 'github' },
  ({ token }) => closeIssue({ repo, issue, token }),
)
```

For zero-config local/demo use, `auth0()` (lowercase) reads
`AUTH0_DOMAIN`/`AUTH0_CLIENT_ID`/`AUTH0_CLIENT_SECRET`/`AUTH0_REFRESH_TOKEN`
from the environment and falls back to a mock token when they're unset — see
[`packages/auth0/README.md`](../../packages/auth0/README.md) for the full
Token Vault and CIBA reference, and
[`examples/github-agent`](../../examples/github-agent) for a complete
PR review-and-merge agent built on it.

**Runnable?** Illustrative kit snippet (needs Auth0 env). The in-repo Auth0-backed
agent is [`examples/github-agent`](../../examples/github-agent) —
`pnpm --filter github-agent typecheck`. There is no `pnpm --filter` test for
the snippet above.

## Not a replacement for

Auth0 Token Vault and CIBA. `nominee-auth0` is a thin strategy adapter, not a
reimplementation — it calls Auth0's real token-exchange and `bc-authorize`
APIs. Nominee adds the policy decision and the tamper-evident receipt in
front of them; it does not manage your Auth0 tenant, connections, or user
identities.
