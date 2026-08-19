# support-refund-agent — the production refund example

A small Express app that refunds orders through `nominee-ai`'s `nomineeTool`,
with **PostgreSQL durable stores** under `production: true`.

**This is the canonical reference implementation of the out-of-band approval
path** — the approval that outlives the request: the call returns `202` with an
`actionId`, a human approves on a later request, and the same original input is
re-supplied through `resumeAction()` + `executeCapability()`. The step-by-step
writeup is the
[Approvals that outlive the request](https://nominee.dev/docs/approvals/) docs
page.

It shows how to carry the 10-second `npx nominee-cli` proof into durable
production wiring:

- **Policy by amount** — refunds ≤ $50 run, refunds ≤ $500 ask a human, and
  larger refunds are denied before the refund function runs.
- **Durable approvals** — pending actions live in `PostgresControlStore`, so an
  approval can arrive on a later request via `/approve` or `/deny`; the `202`
  response echoes the original `input` back so the caller can re-supply it at
  `/refund/resume`.
- **Approver auth** — approval endpoints require a Bearer credential
  (`APPROVER_CREDENTIAL`); HTML escaping helpers keep the boundary safe.

## Prerequisites

- Node 24+ and pnpm (workspace install from the repo root)
- PostgreSQL (local Docker Compose included)

## Run it

```bash
# from the repo root
pnpm install
cd examples/support-refund-agent

# start Postgres
docker compose up -d

export RECEIPT_KEY=dev-receipt-key
export APPROVER_CREDENTIAL=change-me
# optional: DATABASE_URL=postgresql://root:password@localhost:5432/nominee_test
pnpm start
```

Then open `http://localhost:3000`, or call the refund endpoint directly:

```bash
curl -X POST http://localhost:3000/refund \
  -H 'Content-Type: application/json' \
  -d '{"orderId":"ord_42","amount":200}'
```

A $200 call returns `202` with an `actionId`. Approve it, then resume the exact
input:

```bash
curl -X POST http://localhost:3000/approve \
  -H "Authorization: Bearer change-me" \
  -H 'Content-Type: application/json' \
  -d '{"actionId":"<pending-action-id>"}'

curl -X POST http://localhost:3000/refund/resume \
  -H "Authorization: Bearer change-me" \
  -H 'Content-Type: application/json' \
  -d '{"actionId":"<pending-action-id>","orderId":"ord_42","amount":200}'
```

### Tests

```bash
pnpm test
```

## Environment variables

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `RECEIPT_KEY` | no | `test-key` | HMAC key for receipt signing |
| `DATABASE_URL` | no | `postgresql://root:password@localhost:5432/nominee_test` | Postgres for durable stores |
| `APPROVER_CREDENTIAL` | for real approvals | — | Bearer token required by `/approve` and `/deny` |

## Expected output / proof

- Server logs `Listening on 3000`.
- Refunds ≤ $50 execute immediately through `nomineeTool` / `run()`.
- Refunds from $50.01 through $500 pause as pending actions; `/approve` with a valid Bearer
  credential resolves them; a missing/wrong credential returns `401`.
- Refunds over $500 throw before the refund function runs.
- `pnpm test` covers all three policy outcomes, HTML escaping, and approver
  credential checks.

## Before enforcing an existing agent

This example intentionally uses `production: true`, so it enforces. In a
separate non-production inventory run, use `mode: 'observe'` instead: policy
denies and approval gates are recorded rather than enforced, while
`observations()` reports execution attempts and argument shapes. It retains no
raw string/boolean values or user IDs; numeric aggregates may be sensitive.
Observe mode and `production: true` cannot be combined.

Write the inventory to JSON and run `npx nominee-cli generate` to draft a
default-deny policy before adapting it to this production setup. Every generated
rule cites observed evidence, and every threshold must be reviewed: traffic
history describes what happened, not what should be authorized.

For local development, `npx nominee-cli console` can also display receipts and
settle `ask` calls through the explicit `createConsoleBridge()` hooks exported
by `nominee-cli/console`. Keep the durable application approval endpoints in
production: console state is process-local, and the server intentionally
refuses non-loopback binds.
