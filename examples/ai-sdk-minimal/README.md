# Minimal Vercel AI SDK drop-in

Drop nominee into any Vercel AI SDK tool in **one wrapper** — the call is
authorized against your policy, gated on human approval, and handed a fresh
token at call time, with a receipt of every decision. No SaaS, no provider signup.

```bash
pnpm install
cp .env.example .env   # set GITHUB_TOKEN and OPENROUTER_API_KEY
node --env-file=.env --import tsx agent.ts
```

The whole integration is `nomineeTool({ ... })`:

```ts
const starRepo = nomineeTool({
  nominee,
  user: 'demo-user',
  connection: 'github',
  approval: true,            // gates execute behind a human OK
  action: 'star_repo',
  description: 'Star a GitHub repository on behalf of the user',
  inputSchema: z.object({ owner: z.string(), repo: z.string() }),
  async execute({ owner, repo }, { token }) {
    // `token` is fresh, resolved by nominee at this exact moment.
  },
})
```

You keep the AI SDK's tool-calling loop; nominee gives the tool a fresh token and
gates the sensitive call. The same `nominee` instance works in Eve or standalone.

> **OpenRouter gotcha:** use `openrouter.chat('openai/gpt-4o-mini')` — the
> provider's default endpoint isn't the chat-completions one OpenRouter expects.

## When you don't need this

If your agent is read-only with no authority worth guarding, or your platform's
native permission system already covers you end-to-end, you don't need nominee.
Managed connectors (Vercel Connect, Auth0 Token Vault) can still sit *under*
nominee as the token strategy — nominee adds the policy, approvals, and receipts
they don't.
