# nominee-auth0

**Auth0 strategy for [nominee](https://www.npmjs.com/package/nominee)** — Token Vault tokens and CIBA human-in-the-loop approval for AI agents.

```bash
npm install nominee nominee-auth0
```

## What it does

An optional managed upgrade for nominee that replaces the plain function strategy with Auth0's production-grade infrastructure:

- **Token Vault** — fetches federated connection tokens (GitHub, Google, Slack, etc.) from Auth0's Token Vault via a token-exchange grant. No token storage in your DB.
- **CIBA (Client-Initiated Backchannel Authentication)** — pushes real-time approval requests to the user's device (phone notification) and polls until approved or expired.

Use this if you don't want to manage refresh tokens yourself.

## Usage

```ts
import { Nominee } from 'nominee'
import { Auth0 } from 'nominee-auth0'

const nominee = new Nominee({
  strategy: new Auth0({
    // Token Vault — fetches federated connection tokens
    domain: process.env.AUTH0_DOMAIN!,
    clientId: process.env.AUTH0_CLIENT_ID!,
    clientSecret: process.env.AUTH0_CLIENT_SECRET!,

    // CIBA — optional, enables push-to-phone approval
    ciba: {
      bindingMessage: (req) => `Approve: ${req.action}`,
    },
  }),
})

// Token Vault: fetch a fresh GitHub token for this user
const token = await nominee.token({
  user: 'auth0|user_123',
  connection: 'github',
})

// CIBA: gate an action behind real-time user approval
await nominee.approve({
  user: 'auth0|user_123',
  action: 'delete_repo',
  detail: 'Delete my-org/old-project',
})
```

## With adapters

Works with any nominee adapter — just pass the Auth0 strategy:

```ts
import { nomineeTool } from 'nominee-ai'  // or nominee-eve
import { z } from 'zod'

const starRepo = nomineeTool({
  nominee,       // uses Auth0 strategy under the hood
  user: 'auth0|user_123',
  connection: 'github',
  approval: true,
  action: 'star_repo',
  description: 'Star a GitHub repository',
  parameters: z.object({ repo: z.string() }),
  execute: async ({ repo }, ctx) => {
    await fetch(`https://api.github.com/user/starred/${repo}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${ctx.token}` },
    })
    return `Starred ${repo}`
  },
})
```

## Auth0 setup

1. Enable **Token Vault** in your Auth0 tenant (Actions → Token Vault).
2. Add your social connections (GitHub, Google, etc.) as federated connections.
3. Enable **CIBA** in your Auth0 tenant for push-to-phone approvals.

See the [Auth0 docs](https://auth0.com/docs) for tenant configuration.

## License

MIT
