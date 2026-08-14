# Flagship: an AI SDK agent scoped by policy, that merges a PR on your behalf

A Vercel AI SDK agent that reviews a GitHub pull request and merges it **for you** —
with a declarative policy deciding what it may do, not app code that a confused
model could talk its way around:

1. **Policy, not scattered flags.** One `policy` on the `Nominee` instance in
   [`agent.ts`](./agent.ts) says it all: `github.*` calls outside the allowed org are
   denied outright, `github.get_pr` (a read) runs free, `github.merge_pr` (a write)
   asks a human. `tools.ts` is just two named actions — see the
   [policy semantics in the root README](../../README.md#policy-semantics).
2. **Fresh token at merge time.** `nomineeTool` routes through `run()`: the GitHub
   token is resolved at capability consumption, not grabbed up front — so it's
   still valid even after the agent pauses for approval. On a provider that rotates
   refresh tokens, nominee persists the rotated token (`onRefreshToken`) so a long
   run keeps working.
3. **Receipts + audit.** Every policy decision, approval, and token fetch is sealed
   into a hash-chained receipt (printed and verified at the end of the run) and
   appended to `audit.log`, attributed to the `github-agent` identity.

## Run it

```bash
pnpm install
cp .env.example .env   # GitHub App creds + a seed refresh token, OpenRouter key
node --env-file=.env --import tsx agent.ts <owner> <repo> <pr-number>
```

What you'll see: `get_pr` runs immediately (allowed by policy), then `merge_pr`
triggers an approval prompt and pauses; after approval, nominee fetches a fresh
token and the merge goes through. Try it against a PR outside the allowed org
(`GITHUB_ALLOWED_OWNER` in `.env`, defaults to `bharath31`) and the policy denies
the call before either tool runs — no approval prompt, no token fetch.

At the end of the run:

```bash
cat audit.log
# {"type":"approval.requested","action":"github.merge_pr",...,"agent":"github-agent"}
# {"type":"approval.resolved","action":"github.merge_pr","decision":"approved",...}
# {"type":"token.issued","connection":"github",...,"agent":"github-agent"}
```

and the receipt chain prints inline:

```
receipts (5):
  #0 policy.decision github.get_pr allow 5e8f2a1c9b3d
  #1 token.issued  1a2b3c4d5e6f
  #2 policy.decision github.merge_pr ask 9f8e7d6c5b4a
  #3 approval.requested  3c4d5e6f7a8b
  #4 approval.resolved approved 8b7a6c5d4e3f
chain verifies: ✓ 5 receipts intact
```

The integration is just two `nomineeTool(...)` wrappers — see [`tools.ts`](./tools.ts) —
over the same `nominee` instance in [`agent.ts`](./agent.ts). Both route through
`nominee.run()` internally; if an approval outlives the request,
`ActionPendingError` carries a durable action id for `resumeAction()`.

## Why a GitHub *App* (or token-expiring OAuth app)?

Classic GitHub tokens don't expire and don't rotate, so they don't exercise the
interesting case. GitHub **Apps** (and OAuth apps with "Expire user authorization
tokens" enabled) issue short-lived access tokens with **rotating** refresh tokens —
exactly the shape that breaks naive refresh code. That's the case nominee handles;
see [`../token-refresh-correctness`](../token-refresh-correctness) for the proof.

## When you don't need this

If your agent is read-only with no authority worth guarding, or your platform's
native permission system covers you end-to-end, you don't need nominee. Managed
connectors (Vercel Connect, Auth0 Token Vault) can still sit *under* nominee as
the token strategy — nominee adds the policy, approvals, and receipts they don't.

## Demo recording

See [`record-gif.md`](./record-gif.md) for the steps to capture the ~30s demo GIF.

## Before enforcing an existing agent

This example intentionally enforces its policy. To inventory existing tools
first, construct the same Nominee with `mode: 'observe'`: policy denies and
approval gates are recorded rather than enforced, while `observations()`
reports execution attempts and argument shapes. It retains no raw
string/boolean values or user IDs; numeric aggregates may be sensitive. Remove
the mode to enforce; observe mode is not a security control.
