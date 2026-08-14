# CLAUDE.md

This repository also includes [AGENTS.md](./AGENTS.md), which is the canonical
guide for coding agents and contributors.

## Quick Orientation

nominee is the authorization layer for AI agents: allow/deny/ask policy on
every tool call, human approvals, hash-chained tamper-evident receipts, and
decision-bound execution that binds each authorization to the exact tool
arguments. Credentials resolve at execution time via the `run()` path. ExecuteActionContext includes the bound input, and in-memory receipts retain a bounded window by default.

`mode: 'observe'` is the report-only mode: it records policy decisions without
applying deny, ask, or budget gates. Runtime and integrity failures still fail
closed. It must stay impossible to enable by accident — it is refused under
`production: true`, announces itself on startup, and marks every receipt
`enforcement: 'observe'` without rewriting the policy verdict. Observation
reports count callbacks that actually start, retain no raw string/boolean
values or user IDs, and expose bounded numeric aggregates. See
[docs/observe.md](./docs/observe.md).

- `nominee` is the dependency-free core package (action lifecycle, policy, receipts).
- `nominee-ai` adapts nominee to Vercel AI SDK tools and Cloudflare Agents.
- `nominee-eve` adapts nominee to Vercel Eve tools.
- `nominee-openai` adapts nominee to the OpenAI Agents SDK.
- `nominee-mastra` adapts nominee to Mastra.
- `nominee-mcp` adapts nominee to MCP servers.
- `nominee-auth0` is the optional Auth0 strategy (Token Vault + CIBA).
- `nominee-supabase` is the optional Supabase strategy.
- `nominee-postgres` supplies durable action/receipt stores for production.
- `site/` contains the static Cloudflare Pages microsite for nominee.dev.

## Before Opening a PR

```bash
pnpm -r build
pnpm -r test
pnpm -r typecheck
pnpm check
node brand/check-surfaces.mjs
```

Keep examples, package READMEs, and the microsite consistent with the TypeScript
API. When changing core action lifecycle or adapter `run()` wiring, update root
README, both `llms.txt` files, `site/docs/index.html`, and affected package
READMEs. Internal planning notes should stay in gitignored local files.
