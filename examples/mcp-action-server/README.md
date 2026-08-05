# mcp-action-server — durable MCP tools behind nominee

An MCP server that registers tools with `registerNomineeTool` from
`nominee-mcp`, backed by `nominee-postgres` durable stores under
`production: true`.

What it shows:

- **Policy at the MCP boundary** — `github.read` is allowed; `github.commit`
  requires human approval (`ask`).
- **Decision-bound actions** — approvals and receipts survive process restarts
  via `PostgresControlStore`.
- **Separate concerns** — app user auth (`user`) vs. tool OAuth connection
  (`connection: 'github-oauth'`).

## Prerequisites

- Node 24+ and pnpm (workspace install from the repo root)
- PostgreSQL (local Docker Compose included)

## Run it

```bash
# from the repo root
pnpm install
cd examples/mcp-action-server

# start Postgres
docker compose up -d

# build + start the MCP server (stdio transport)
export NOMINEE_RECEIPT_KEY=dev-receipt-key
# optional: DATABASE_URL=postgresql://nominee:password@localhost:5432/nominee_lifecycle
pnpm build
pnpm start
```

Wire the built server into an MCP client (Claude Desktop, Cursor, etc.) as a
stdio MCP server pointing at `node dist/index.js` with the same env.

### Tests

```bash
# integration tests skip unless DATABASE_URL is set
export DATABASE_URL=postgresql://nominee:password@localhost:5432/nominee_lifecycle
export NOMINEE_RECEIPT_KEY=test-receipt-key
pnpm test
```

## Environment variables

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `NOMINEE_RECEIPT_KEY` | **yes** | — | HMAC key for receipt signing (`production: true`) |
| `DATABASE_URL` | no | `postgresql://nominee:password@localhost:5432/nominee_lifecycle` | Postgres for durable action + receipt stores |

## Expected output / proof

- Server process starts and speaks MCP over stdio.
- `nominee.check({ tool: 'github.commit', … })` returns `effect: 'ask'`
  (covered by the integration test when Postgres is available).
- A `github.commit` tool call pauses for approval rather than executing
  immediately; receipts land in the durable Postgres store.
