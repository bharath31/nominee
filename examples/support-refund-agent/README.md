# support-refund-agent — tenant refunds with durable approvals

A small Express app that refunds orders through `nominee-ai`'s `nomineeTool`,
with **PostgreSQL durable stores** under `production: true`.

What it shows:

- **Policy by amount** — refunds ≤ $50 are allowed; larger refunds `ask` a
  human; everything else falls back to `deny`.
- **Durable approvals** — pending actions live in `PostgresControlStore`, so an
  approval can arrive on a later request via `/approve` or `/deny`.
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

Then open `http://localhost:3000` and post approvals:

```bash
curl -X POST http://localhost:3000/approve \
  -H "Authorization: Bearer change-me" \
  -d "actionId=<pending-action-id>"
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
- Larger refunds pause as pending actions; `/approve` with a valid Bearer
  credential resolves them; a missing/wrong credential returns `401`.
- `pnpm test` covers HTML escaping and approver credential checks.
