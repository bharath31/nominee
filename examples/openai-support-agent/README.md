# openai-support-agent — OpenAI Agents SDK + nominee

A starter for wiring **OpenAI Agents SDK** tools through `nominee-openai`.

The support agent closes GitHub issues on a user's behalf. The sensitive write
is meant to go through `nomineeTool()` so policy (`allow` / `ask` / `deny`),
approvals, and receipts sit in front of the backend — not scattered if-checks
in tool code.

This package currently ships the **backend stub** (`src/backend.ts`) and a
unit test that proves the close-issue helper. Use it alongside the pattern in
[`packages/openai/README.md`](../../packages/openai/README.md): wrap
`closeGitHubIssue` with `nomineeTool`, map `ask` to the SDK's native
`needsApproval` hook, and let denials throw before the backend runs.

## Run it

```bash
# from the repo root
pnpm install
cd examples/openai-support-agent
pnpm test
```

There is no live agent entrypoint yet — the proof for this package is the
test suite against the fake backend.

## Environment variables

None for the current tests. A full agent loop would need whatever credentials
your token strategy returns for the GitHub connection (for example
`GITHUB_TOKEN` or an Auth0 Token Vault setup) plus an OpenAI API key for the
Agents SDK runtime.

## Expected output / proof

```bash
pnpm test
```

```
# tests pass
# closes an issue through the fake backend → "Issue #42 closed on acme/widgets"
```

When you compose the agent with `nomineeTool` (see `nominee-openai`):

- an `ask('github.issue.close')` rule maps to OpenAI's approval pause
- a deny never calls `closeGitHubIssue`
- allowed/approved calls resolve a fresh token at execution time and seal a
  receipt

## Before enforcing an existing agent

This starter is written for enforcement. To inventory existing OpenAI tool
callbacks first, construct the same Nominee with `mode: 'observe'`: native
approval gates from the adapter are suppressed, while `observations()` reports
execution attempts and argument shapes. It retains no raw string/boolean values
or user IDs; numeric aggregates may be sensitive. Remove the mode to enforce;
observe mode is not a security control.
