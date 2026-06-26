# nominee-supabase

[Supabase](https://supabase.com) strategy for [nominee](https://nominee.dev) — use
Supabase as your store of provider tokens, and let nominee keep them fresh.

When a user signs in with a third-party provider, Supabase Auth hands you a
`provider_refresh_token` **once**. You persist it (a row per user + provider).
This strategy reads that row over PostgREST and, when the cached access token is
missing or stale, refreshes it at the provider and writes the fresh one back.
Zero dependencies — just `fetch`.

It proves the point of nominee: the agent code is identical to the Auth0 or
OAuth2 path. Only the strategy line changes.

```bash
npm i nominee nominee-supabase
```

```ts
import { Nominee } from 'nominee'
import { Supabase } from 'nominee-supabase'

const nominee = new Nominee({
  strategy: Supabase({
    url: process.env.SUPABASE_URL!,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY!, // server-side; or anon + RLS
    // refresh stored refresh tokens at the provider when they go stale:
    connections: {
      github: {
        tokenEndpoint: 'https://github.com/login/oauth/access_token',
        clientId: process.env.GITHUB_CLIENT_ID!,
        clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      },
    },
  }),
})

// identical to every other strategy — fresh token at call time
const token = await nominee.token({ user: 'alice', connection: 'github' })
```

## The table

By default the strategy reads a table named `agent_connections`:

| column | holds |
|---|---|
| `user_id` | matches the nominee `user` |
| `provider` | matches the nominee `connection` (e.g. `github`) |
| `refresh_token` | the provider refresh token you stored at sign-in |
| `access_token` | cached provider access token (written back on refresh) |
| `expires_at` | access token expiry (ISO string or epoch) |

```sql
create table agent_connections (
  user_id text not null,
  provider text not null,
  refresh_token text,
  access_token text,
  expires_at timestamptz,
  primary key (user_id, provider)
);
```

Override any name via `columns`, the table via `table`, and the schema via
`schema`. Set `persist: false` to never write refreshed tokens back.

## How it resolves a token

1. Read the `(user, provider)` row.
2. If a cached `access_token` is still fresh, return it — no provider call.
3. Otherwise refresh the `refresh_token` at the provider, return the new token,
   and (by default) persist it back to the row.

If a connection has no refresh config, the stored `access_token` is returned
as-is and nominee re-reads it next time.
