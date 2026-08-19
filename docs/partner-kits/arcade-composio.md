# Partner kit: Arcade and Composio

**What nominee adds.** Arcade and Composio solve connector breadth — one
SDK, hundreds of pre-built SaaS tools, hosted OAuth for each. What they don't
give you is your *own* application's authorization model on top: which of
your tenants' users can invoke which of those tools against which resources,
whether a given call should pause for a human, and a hash-chained record of
what was decided. Nominee is not a competing connector catalog — see
[`docs/positioning.md`](../positioning.md), which names Arcade/Composio as
the better choice when you need a large SaaS tool catalog. Nominee composes
underneath either one: your policy runs first, and only an allowed (or
approved) call reaches the connector's `execute()`.

## Illustrative snippet

Neither Arcade's nor Composio's SDK is a dependency of this repo, so this
snippet is illustrative — it shows the wrapping pattern, not a tested
integration. It follows the same `nominee.guard()` shape used throughout
[`packages/core/README.md`](../../packages/core/README.md#quickstart), which
wraps plain functions or any framework's `{ execute }`-shaped tool as-is:

**Runnable?** Illustrative only — neither Arcade nor Composio is a dependency
of this repo, and there is no `examples/` recipe to `pnpm --filter` test.

```ts
import { Nominee, allow, deny, ask } from 'nominee'
// import { ArcadeClient } from '@arcadeai/arcadejs' // or Composio's client

const nominee = new Nominee({
  policy: {
    rules: [
      allow('github.star_repo'),
      ask('slack.send_message', { when: ({ input }) => input.channel === '#general' }),
      deny('gmail.send_email', { reason: 'outbound email not agent-authorized yet' }),
    ],
    fallback: 'deny',
  },
})

// A connector-sourced tool call, shaped as a plain async function:
// (Arcade: `arcade.tools.execute(...)`; Composio: `composio.actions.execute(...)`)
async function githubStarRepo(input: { repo: string }) {
  // return arcade.tools.execute({ tool: 'Github.StarRepo', input, user_id: userId })
}

const tools = nominee.guard(
  { 'github.star_repo': githubStarRepo },
  { user: 'user_123' },
)

// Policy runs before the connector call; a denial never reaches Arcade/Composio.
await tools['github.star_repo']({ repo: 'bharath31/nominee' })
```

Swap `githubStarRepo`'s body for the real Arcade/Composio SDK call — the
wrapping is identical to any other tool nominee guards (see
[`nomineeTool`/`withNominee` in `packages/ai/README.md`](../../packages/ai/README.md#nominetool--per-tool-config)
for the equivalent pattern when the agent itself is built on the Vercel AI SDK).

## Not a replacement for

Arcade or Composio's connector catalog, hosted OAuth, or tool marketplace.
Nominee does not source, host, or authenticate third-party tools — it
authorizes the call your policy governs before it reaches whichever
connector platform executes it.
