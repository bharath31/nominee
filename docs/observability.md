# Evidence export and observability

Nominee receipts are tamper-evident evidence records. Observability pipelines should make them searchable and alertable without weakening that evidence boundary: keep raw receipt JSON in durable storage, export a redacted projection to telemetry, and keep signed stream tips outside the primary database.

## Export model

Use three layers:

1. **Receipt stream**: the canonical hash-chained receipt record, verified with `verifyReceipts()` or `verifyDurableReceipts()`.
2. **Telemetry projection**: low-cardinality attributes for traces, logs, and metrics.
3. **Evidence bundle**: an incident or audit export containing the receipt range, stream checkpoints, policy version, and verification result.

Do not put access tokens, capability bearers, CIBA ID tokens, or raw tool inputs in telemetry. Nominee records `inputHash` by default so operators can correlate the reviewed input without leaking it.

## OpenTelemetry-friendly attributes

Use the `nominee.*` namespace for Nominee-specific attributes. Prefer strings and small enums; hash or omit values that are user-provided, high-cardinality, or sensitive.

| Attribute | Source | Notes |
|---|---|---|
| `nominee.agent` | `receipt.agent` | Agent name or adapter name. |
| `nominee.tool` | `receipt.tool` | Policy action/tool name, for example `refund.create`. |
| `nominee.decision` | `receipt.decision` | `allow`, `deny`, `ask`, approval outcome, or lifecycle outcome. |
| `nominee.reason` | `receipt.reason` | Keep reasons bounded; avoid embedding user input. |
| `nominee.policy.version` | configured `policyVersion` | Required for production forensics. |
| `nominee.policy.rule` | matching rule id/name when available | Optional; keep stable across deploys. |
| `nominee.input_hash` | `receipt.inputHash` | Safe correlation key for exact reviewed arguments. |
| `nominee.receipt.seq` | `receipt.seq` | Sequence in the receipt stream. |
| `nominee.receipt.hash` | `receipt.hash` | Current hash-chain tip for this receipt. |
| `nominee.receipt.prev_hash` | `receipt.prev` | Previous hash-chain tip. |
| `nominee.receipt.stream` | configured stream | Tenant/compliance boundary; hash if tenant id is sensitive. |
| `nominee.action.id` | action id | High-cardinality; attach to logs/traces, not metric labels. |
| `nominee.action.status` | action lifecycle status | Use for stuck-action alerts. |
| `nominee.tenant.hash` | hashed tenant | Never export raw tenant ids unless your telemetry backend is scoped for them. |
| `nominee.resource.hash` | hashed resource | Useful for investigation without leaking customer data. |
| `nominee.approval.id` | approval id | High-cardinality; logs/traces only. |
| `nominee.approval.via` | approval channel/provider | Example: `dashboard`, `auth0-ciba`, `framework`. |
| `nominee.error.type` | error class/name | Fail-closed reasons should be distinguishable. |

Map execution spans to the standard OpenTelemetry `error.type` attribute when a Nominee error prevents execution, and set span status to error for `deny`, approval denial, capability validation failure, authorizer denial, durable-store failure, or receipt delivery failure.

## Sink recipe

Attach the projection in the receipt sink and keep strict receipt delivery enabled in production:

```ts
import { createHash } from 'node:crypto'
import { trace } from '@opentelemetry/api'
import { Nominee } from 'nominee'

const hash = (value: unknown) =>
  value === undefined ? undefined : createHash('sha256').update(String(value)).digest('hex')

const nominee = new Nominee({
  production: true,
  policy,
  policyVersion: process.env.POLICY_VERSION,
  actionStore: control,
  receipts: {
    store: control,
    stream: `tenant:${tenantId}`,
    key: process.env.NOMINEE_RECEIPT_KEY,
    delivery: 'strict',
    onReceipt: async (receipt) => {
      const span = trace.getActiveSpan()
      span?.setAttributes({
        'nominee.agent': receipt.agent,
        'nominee.tool': receipt.tool,
        'nominee.decision': receipt.decision,
        'nominee.reason': receipt.reason,
        'nominee.policy.version': process.env.POLICY_VERSION,
        'nominee.input_hash': receipt.inputHash,
        'nominee.receipt.seq': receipt.seq,
        'nominee.receipt.hash': receipt.hash,
        'nominee.receipt.prev_hash': receipt.prev,
        'nominee.receipt.stream': hash(`tenant:${tenantId}`),
      })
    },
  },
})
```

For async exporters, call `flushReceipts()` during graceful shutdown so buffered sinks finish before the process exits.

## Evidence bundle checklist

When exporting evidence for an incident, support case, or audit, include:

- Receipt stream name or hashed stream identifier.
- Inclusive receipt sequence range.
- The receipt JSON entries for that range.
- The prior hash before the range and final hash after the range.
- The policy version and deployment commit that evaluated the actions.
- The verification command/output from `verifyReceipts()` or `verifyDurableReceipts()`.
- Related action ids and lifecycle statuses.
- Redacted application records needed to prove the third-party side effect, keyed by Nominee action id/idempotency key.

## Alerts

Start with these alerts:

- Receipt sink or atomic receipt-store append failure.
- `verifyDurableReceipts()` failure or stream checkpoint mismatch.
- Actions stuck in `executing` beyond the downstream service timeout.
- Capability validation failures, especially reuse attempts.
- Authorizer denials after approval, which can indicate permission revocation during a pause.
- Repeated policy denials for one tool/user hash, which can indicate prompt-injection attempts.
