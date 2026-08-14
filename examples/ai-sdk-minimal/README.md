# Minimal Vercel AI SDK drop-in

Drop nominee into any Vercel AI SDK tool in **one wrapper** — the call routes
through `nominee.run()`: policy checks the exact arguments, gates on human
approval, resolves a fresh token at capability consumption, and seals a receipt
of every decision. No SaaS, no provider signup.

```bash
pnpm install
cp .env.example .env   # set GITHUB_TOKEN and OPENROUTER_API_KEY
node --env-file=.env --import tsx agent.ts
```

The whole integration is one `policy` and one `nomineeTool({ ... })`:

```ts
const nominee = new Nominee({
  policy: [ask('star_repo')],   // the policy gates execute behind a human OK
  strategy: ({ connection }) => process.env[`${connection.toUpperCase()}_TOKEN`]!,
})

const starRepo = nomineeTool({
  nominee,
  user: 'demo-user',
  connection: 'github',
  action: 'star_repo',          // what the policy above matches on
  description: 'Star a GitHub repository on behalf of the user',
  inputSchema: z.object({ owner: z.string(), repo: z.string() }),
  async execute({ owner, repo }, { token }) {
    // `token` is fresh, resolved by nominee at this exact moment.
  },
})
```

You keep the AI SDK's tool-calling loop; `nomineeTool` routes through `run()`
internally. If an approval outlives the request, `ActionPendingError` carries a
durable action id for `resumeAction()`. The same `nominee` instance works in Eve
or standalone.

> **OpenRouter gotcha:** use `openrouter.chat('openai/gpt-4o-mini')` — the
> provider's default endpoint isn't the chat-completions one OpenRouter expects.

## When you don't need this

If your agent is read-only with no authority worth guarding, or your platform's
native permission system already covers you end-to-end, you don't need nominee.
Managed connectors (Vercel Connect, Auth0 Token Vault) can still sit *under*
nominee as the token strategy — nominee adds the policy, approvals, and receipts
they don't.

## Before enforcing an existing agent

This example intentionally enforces its policy. To inventory existing tools
first, construct the same Nominee with `mode: 'observe'`: policy denies and
approval gates are recorded rather than enforced, while `observations()`
reports execution attempts and argument shapes. It retains no raw
string/boolean values or user IDs; numeric aggregates may be sensitive. Remove
the mode to enforce; observe mode is not a security control.
