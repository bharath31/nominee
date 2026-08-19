# nominee examples

Every example that wraps tools with `nominee.guard()`, `guardTools()`, or
`nomineeTool()` routes through the decision-bound `run()` path: policy checks
the exact arguments, issues a single-use capability, resolves credentials at
consumption time, and seals every outcome into the receipt chain. When an
approval outlives the request, adapters surface `ActionPendingError` with a
durable action id for `resumeAction()`.

## Support refund demo — start here

The same refund tool gets three outcomes from policy: $25 runs, $200 waits for
approval, and $2,000 is blocked before the refund function runs. Start with the
10-second proof:

```bash
npx nominee-cli
```

Then open [`support-refund-agent`](./support-refund-agent) for durable production
wiring: Vercel AI SDK tools, approvals that survive the request, authenticated
approve/deny endpoints, and PostgreSQL stores under `production: true`.

Or use the [live playground](https://nominee.dev/playground/) to edit the rules,
approve the $200 call yourself, and inspect the real receipt chain in the browser.

## [`support-refund-agent`](./support-refund-agent) — durable production wiring

## [`prompt-injection-blocked`](./prompt-injection-blocked) — supporting security proof

A prompt-injected agent tries to exfiltrate your email — and physically can't.
The tools are wrapped with `nominee.guard()`; the deny rule fires **before the
tool runs**, the delete-the-evidence step is escalated to (and denied by) a
human, and every attempt is sealed into a signed, tamper-evident receipt chain.
Doctoring the log is detected. No API keys, no network, one command:

```bash
cd examples/prompt-injection-blocked
node run.mjs
```

## [`ai-sdk-minimal`](./ai-sdk-minimal) / [`ai-sdk-github-agent`](./ai-sdk-github-agent)

Drop nominee into Vercel AI SDK tools — policy + fresh token + approval + audit
in one `nomineeTool` wrapper (or `guardTools` for a whole tools object). Both
route through `nominee.run()` internally; see each README for `ActionPendingError`
when an approval outlives the request.

## [`token-refresh-correctness`](./token-refresh-correctness)

The token-freshness proof: naive concurrent + rotating OAuth refresh fails 7/8;
nominee gets 8/8 with the same agent code. `node run.mjs`, no mocks that cheat.

## [`github-agent`](./github-agent) — the golden Eve example

An [Eve](https://eve.dev) agent that reviews a pull request and merges it on your
behalf, scoped by a real `nominee` policy (reads run free, a merge asks — every
decision receipted) — and, since a merge is also a long-running action, one
whose access **survives the approval pause** because nominee re-resolves it at
action time. Three levels, picked by what you say in the chat:

- **"merge pr"** — the hand-rolled way: grabs access up front, waits, merges —
  the access has expired → **real 403**. The problem.
- **"merge with nominee"** — nominee requests **fresh access at merge time** →
  **real merge**. (Works for everybody; no Auth0.)
- **"merge with nominee and auth0"** — the token is a real GitHub token from
  **Auth0 Token Vault** and approval is a **CIBA push to your phone**.
  (Enterprise Auth0 tenant.)

Everything is real — real GitHub API, real merge of a real PR. Quickstart:

```bash
cd examples/github-agent
nvm use            # Node 24 (Eve requires it)
pnpm install       # workspace install (run once, from the repo root)
pnpm setup         # model credential + a real GitHub token → .env.local
pnpm seed          # opens a PR on a testbed repo on your own GitHub
# then, in two terminals:
pnpm broker        # the merge-access broker (holds the GitHub credential)
pnpm dev           # the agent (interactive chat)
```

See [`github-agent/README.md`](./github-agent/README.md) for the full walkthrough,
including the `pnpm setup:auth0` Token Vault + CIBA path.

## [`opa-recipe`](./opa-recipe) / [`fga-recipe`](./fga-recipe)

Nominee is the enforcement point (PEP), not the decision point (PDP) — these
recipes show the seam. A nominee rule's `when` predicate calls a mocked
OPA-shaped (`opa-recipe`) or OpenFGA/WorkOS-FGA-shaped (`fga-recipe`)
decision function; the decision's `reason` lands on the resulting receipt
unchanged. No server, no network — each README documents the one-line swap
to a real OPA instance or FGA store.

## [`openai-support-agent`](./openai-support-agent) — OpenAI Agents SDK native approval bridge

`node run.mjs`, no API keys: an `ask` rule becomes the SDK's native tool
approval, the approved call id is sealed into the nominee receipt chain as
framework evidence, and a replay with a mutated input is refused on the spot.

## [`langchain-approval`](./langchain-approval) / [`mastra-approval`](./mastra-approval)

The `ask` path, end to end, for the two adapters with no reference
implementation. LangChain JS has no approval bridge — `invoke()` throws
`ActionPendingError`, and this example shows the full recover loop
(`resolveActionApproval` → `resumeAction` → `executeCapability`) including the
"you must persist the input yourself" requirement. Mastra's native approval
bridge works through its suspend/approve primitives, but `nativeApprovals` is
off by default — the example shows both the bridge working and the
off-by-default `ActionPendingError` you get otherwise. One file each, no keys,
no network.

## See also

- [`packages/auth0`](../packages/auth0) — the `auth0()` strategy (Token Vault +
  CIBA) used at Level 3, and how to wire it to any provider.
- [`site/agent-worker`](../site/agent-worker) — the deeper, deployed demo running
  live at [nominee.dev/agent](https://nominee.dev/agent) (Cloudflare Durable
  Object, out-of-band approval). Production code, not a starter.
