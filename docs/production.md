# Production runbook

Nominee's production boundary is the decision-bound action lifecycle, not a
standalone `authorize()` check:

`planned → policy_checked → pending_approval → approved → capability_issued → executing → succeeded | failed`

## Required configuration

Use a default-deny policy, a stable policy version, transactional action state,
an atomic receipt stream, and strict delivery:

```ts
import { Pool } from 'pg'
import { Nominee, allow, deny } from 'nominee'
import {
  POSTGRES_SCHEMA,
  PostgresControlStore,
  postgresDatabase,
} from 'nominee-postgres'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const control = new PostgresControlStore(postgresDatabase(pool))

const nominee = new Nominee({
  production: true,
  policy: {
    rules: [
      allow('refund.create', {
        when: ({ input }) => input.cents <= 5_000,
        max: 20,
      }),
      deny('refund.create', { reason: 'outside automatic refund policy' }),
    ],
    fallback: 'deny',
  },
  policyVersion: process.env.POLICY_VERSION,
  actionStore: control,
  receipts: {
    store: control,
    stream: `tenant:${tenantId}`,
    key: process.env.NOMINEE_RECEIPT_KEY,
    delivery: 'strict',
  },
  authorizer: ({ user, action, resource, tenant }) =>
    applicationAuthz.can({ user, action, resource, tenant }),
  strategy: credentialBroker,
})
```

Run `POSTGRES_SCHEMA` through the normal migration system before starting an
application replica. Use one receipt stream per tenant or compliance boundary.
Keep the HMAC key in a secret manager and rotate it by starting a versioned
stream; retain the old key for verification.

## Execution boundary

Use `run()` for an action that can finish in the current request. Use
`prepareAction()` when the runtime or approval can pause:

```ts
const prepared = await nominee.prepareAction({
  tool: 'refund.create',
  input: { orderId, cents },
  user: session.userId,
  tenant: session.tenantId,
  resource: `order:${orderId}`,
  connection: 'payments',
  scopes: ['refunds:write'],
})

if (prepared.status === 'pending_approval') {
  await jobs.save({ actionId: prepared.action.id, input: { orderId, cents } })
  return
}

await nominee.executeCapability(prepared.capability, { orderId, cents }, ({ token }) =>
  payments.refund({ orderId, cents, token, idempotencyKey: prepared.action.id }),
)
```

The downstream mutation must use the Nominee action id as its idempotency key.
No local library can make an arbitrary third-party side effect transactional
with PostgreSQL. Idempotency is what makes a lost response or retry safe.

When an action names a `resource`, Nominee calls the application authorizer
while planning and again after capability consumption, immediately before
credential resolution and tool execution. A permission revoked while approval
was pending therefore fails closed without running the tool.

## Approval recovery

- Resolve dashboard/webhook approvals with `resolveActionApproval()`.
- Poll provider approvals with `resumeAction()`.
- Store raw workflow input in the application's encrypted job state; Nominee
  stores only its canonical hash.
- Auth0 CIBA production deployments must pass `PostgresCibaStore` or another
  durable `CibaStore`. A successful poll requires a verified ID token whose
  subject equals the intended approver.
- A capability is returned once, expires quickly, and can execute once. Calling
  `resumeAction()` before consumption rotates it and invalidates the old value.
- [nominee.dev/agent](https://nominee.dev/agent) (`site/agent-worker`) is a
  deployed reference for the pause/hibernate/resume shape — a Cloudflare
  Durable Object agent whose receipt chain resumes across hibernation and
  whose credential is fetched fresh only at resume. It predates this action
  lifecycle and does not itself call `prepareAction`/`resumeAction`/
  `executeCapability`; treat it as a durability reference, not a literal
  usage example of this API.

## Operational checks

- Run `verifyDurableReceipts()` continuously or on a schedule.
- Export or anchor signed receipt-stream tips outside the primary database.
  The transactional stream checkpoint detects accidental truncation, but an
  administrator who can roll back both receipts and their checkpoint requires
  an external checkpoint or write-once sink to detect.
- Alert on receipt append failure, actions stuck in `executing`, capability
  validation failures, CIBA verifier failures, and cross-tenant auth denials.
- Reconcile `nominee_action_events` against `nominee_receipts` after a database
  or receipt-sink incident. The action journal is the recovery source of truth.
- Restrict the application role from updating or deleting action-event and
  receipt rows. Use a separate retention role.
- Never log capability bearers, access tokens, CIBA ID tokens, or raw tool
  inputs.

## Known boundary

Nominee does not isolate code by itself. If model-controlled code can import the
raw tool or read the root credential, it can bypass an in-process wrapper.
Put high-impact tools in a separate execution service and expose only the
decision-bound call path. Receipts are evidence primitives, not a compliance
certification.
