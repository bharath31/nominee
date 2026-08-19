# openai-support-agent — OpenAI Agents SDK + nominee

A runnable proof that `nominee-openai` bridges the OpenAI Agents SDK's **native
tool approval** into nominee's approval evidence and receipt chain.

A support agent closes GitHub issues on a user's behalf. Its tools are wrapped
with `nomineeTool()`, so policy (`allow` / `ask` / `deny`) and a hash-chained
(HMAC) receipt chain sit in front of the backend — not scattered if-checks in
tool code.

**No API keys. No network.** The "model" is scripted on purpose (see
[`src/scripted-model.mjs`](./src/scripted-model.mjs) for why that is honest) —
the point is what the *tools* will and won't do. Enforcement is identical with
a real LLM: the model only ever sees the guarded tools and can only *ask*; the
policy and the human decide.

## Run it

```bash
# from the repo root
pnpm install
cd examples/openai-support-agent
node run.mjs
# or: pnpm test (runs the same scenario as assertions)
```

### Environment variables

None required. Optional:

| Variable | Default | Purpose |
| --- | --- | --- |
| `NOMINEE_RECEIPT_KEY` | `demo-signing-key` | HMAC key for receipt signing |

## What it demonstrates

1. **Read runs free** — `github.issue.read` is `allow`; the tool executes with a
   single-use capability, no approval.
2. **The close pauses on the SDK's native approval flow** — `github.issue.close`
   is `ask`, so `nomineeTool`'s `needsApproval` hook tells the OpenAI Agents
   SDK to interrupt the run. Nothing in the backend runs before a human
   approves (offline: `state.approve()`; in production: the OpenAI platform UI).
3. **The approval is sealed as nominee evidence** — on resume, the SDK tells
   the tool *which call* was approved (`isToolApproved({ toolName, callId })`);
   nominee-openai passes that as `frameworkApproval: { id: callId, via:
   'openai-agents' }` into the decision-bound `run()`, so the receipt chain
   records who approved, through which framework, and for which exact call.
4. **The credential is fetched at execution time** — the token strategy runs
   only when the approved capability is consumed.
5. **Input mutation is refused** — a second close is approved out-of-band
   (`resolveActionApproval` with a named approver). Replaying the capability
   with a *different* issue number throws `AuthorizationInputChangedError`;
   the refusal is sealed into the receipt chain as a denial, and the chain
   still verifies end to end.

## What it does NOT do

- It does not call OpenAI — the scripted model stands in for the LLM, and a
  real deployment simply drops the `Runner({ model: ... })` override.
- It does not use a durable store — receipts and actions live in memory. For
  approvals that must survive restarts, see
  [`support-refund-agent`](../support-refund-agent) for the durable wiring.
- It does not model the OpenAI platform UI — `state.approve()` simulates the
  human approving in the UI; the approval *evidence* is the same either way.

## Before enforcing an existing agent

To inventory an existing OpenAI agent's tool calls first, construct the same
Nominee with `mode: 'observe'`: the adapter's native approval gate is
suppressed, while `observations()` reports execution attempts and argument
shapes. It retains no raw string/boolean values or user IDs; numeric
aggregates may be sensitive. Remove the mode to enforce; observe mode is not
a security control.