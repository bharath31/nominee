# CLAUDE.md

This repository also includes [AGENTS.md](./AGENTS.md), which is the canonical
guide for coding agents and contributors.

## Quick Orientation

nominee is the authorization layer for AI agents: allow/deny/ask policy on
every tool call, human approvals, hash-chained tamper-evident receipts, and
decision-bound execution that binds each authorization to the exact tool
arguments. Credentials resolve at execution time via the `run()` path.

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
