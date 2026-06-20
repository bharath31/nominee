# CLAUDE.md

This repository also includes [AGENTS.md](./AGENTS.md), which is the canonical
guide for coding agents and contributors.

## Quick Orientation

- `nominee` is the dependency-free core package.
- `nominee-ai` adapts nominee to Vercel AI SDK tools and Cloudflare Agents.
- `nominee-eve` adapts nominee to Vercel Eve tools.
- `nominee-auth0` is the optional Auth0 strategy.
- `site/` contains the static Cloudflare Pages microsite for nominee.dev.

## Before Opening a PR

```bash
pnpm -r build
pnpm -r test
pnpm -r typecheck
pnpm check
```

Keep examples, package READMEs, and the microsite consistent with the TypeScript
API. Internal planning notes should stay in gitignored local files.
