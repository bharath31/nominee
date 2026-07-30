# nominee-postgres

Transactional PostgreSQL storage for Nominee's decision-bound action lifecycle:

- atomic policy-budget reservations shared by every replica;
- single-use execution capabilities;
- durable approvals and terminal outcomes;
- an immutable action transition journal; and
- atomically sequenced, hash-chained receipt streams.

The package deliberately does not depend on a PostgreSQL driver. Pass your
existing `pg.Pool` (or a structurally compatible pool):

```ts
import { Pool } from 'pg'
import { Nominee, allow } from 'nominee'
import {
  POSTGRES_SCHEMA,
  PostgresControlStore,
  postgresDatabase,
} from 'nominee-postgres'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
await pool.query(POSTGRES_SCHEMA) // normally run this through your migration system

const control = new PostgresControlStore(postgresDatabase(pool))
const nominee = new Nominee({
  production: true,
  policy: { rules: [allow('github.issue.close')], fallback: 'deny' },
  policyVersion: '2026-07-29.1',
  actionStore: control,
  receipts: {
    store: control,
    stream: 'tenant:acme',
    key: process.env.NOMINEE_RECEIPT_KEY,
    delivery: 'strict',
  },
})
```

Use one receipt stream per tenant or compliance boundary. Keep the HMAC key in
your secrets manager and run `verifyDurableReceipts()` as an operational check.
`nominee_action_events` is an append-only recovery journal for action state
transitions; do not grant the application role `UPDATE` or `DELETE` on it.
