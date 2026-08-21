# Adapter compatibility

This is a snapshot of what each official adapter (`packages/ai`, `packages/eve`,
`packages/langchain`, `packages/mastra`, `packages/mcp`, `packages/openai`) declares as its supported
framework version range, cross-checked against that framework's *actual*
resolved version in this monorepo's lockfile (`pnpm why <peer>`), and how each
adapter maps onto that framework's current approval/resume mechanism. Re-verify
this table whenever a `peerDependencies` range changes or a framework ships a
major/minor that touches tool-calling, approval, or resume APIs.

## Flagged findings

**nominee-ai ships a CommonJS build that breaks under `ai@7` outside newer
Node.** `nominee-ai`'s `peerDependencies` accepts `ai: ^5 || ^6 || ^7`, and the
package ships both an ESM (`dist/index.js`) and a CJS (`dist/index.cjs`) build.
As of `ai@7`, the AI SDK dropped its CommonJS output entirely: `ai@7`'s
`package.json` is `"type": "module"` and its `exports` map has only
`import`/`default` conditions, no `require`. `ai@5` and `ai@6` both still ship a
real `require` condition (verified against the resolved `ai@6.0.208` in this
lockfile). `dist/index.cjs`'s top-level `require('ai')` only works today because
Node ≥22.12 added synchronous `require()`-of-ESM interop — confirmed empirically
in this environment (`node -e "require('./dist/index.cjs')"` succeeds against
the resolved `ai@7.0.41` on Node v22.22.2). A CJS consumer on an older Node
runtime, or run through a bundler/test runner that resolves `exports` maps
strictly at build time (webpack, `ts-jest` in CommonJS mode, etc.) instead of
deferring to Node's runtime interop, will fail to load nominee-ai's `.cjs` entry
once `ai@7` is the resolved peer. This trap is specific to the top of the
declared range — it doesn't reproduce with `ai@5`/`ai@6`.

**Four adapters declare open-ended floors with no ceiling.** `nominee-langchain`
(`@langchain/core: >=1.0.0`), `nominee-mastra` (`@mastra/core: >=1.54.0`),
`nominee-mcp` (`@modelcontextprotocol/sdk: >=1.30.0`), and `nominee-openai`
(`@openai/agents: >=0.14.1`) all accept any
future version once past the floor. Diffing each framework's changelog from the
declared floor to its current published `latest` on npm (Mastra `1.57.0`, MCP
SDK `1.30.0` — identical to the floor, OpenAI Agents SDK `0.14.3`) turned up no
change to the `createTool`/`requireApproval`, `McpServer.registerTool`, or
`tool()`/`needsApproval`/`isToolApproved` shapes these adapters depend on. But
with no upper bound, a future breaking major (or, for the still-pre-1.0
`@openai/agents`, even a breaking *minor* — semver explicitly allows that before
1.0) is accepted silently by npm/pnpm instead of failing dependency resolution.

**No adapter special-cases an already-dropped framework version.**
`nominee-eve`'s deprecated `needsApproval` config field documents an Eve-side
rename (Eve's own tool field went from `needsApproval` to `approval`) that
shipped in `eve@0.14.0` — well below the declared floor of `eve >=0.27.0` — so
it is a backward-compatibility alias for nominee-eve's own callers, not stale
handling of an Eve version this adapter no longer supports.

**npm name collision on `eve` (verified 2026-08-21).** Bare `npm i eve`
resolves to `eve@0.5.x` — an unrelated 2013-era "Simple custom events" library
that still owns the low version numbers — even though the registry's `latest`
dist-tag points at Vercel's Eve (`0.42.0` at time of verification). Only an
explicit specifier (`eve@latest`, `eve@^0.42.0`) fetches the agent framework.
npm auto-installs this adapter's `eve` peer at a satisfying version; pnpm does
not install peers by default. Install Eve explicitly and pinned — see the
warning in [`packages/eve/README.md`](../packages/eve/README.md).

## Compatibility table

| Framework | Supported version range | Approval/resume mechanism nominee hooks | Last-verified date |
| --- | --- | --- | --- |
| **nominee-ai** — Vercel AI SDK (`ai`) | `^5 \|\| ^6 \|\| ^7` (resolved: `7.0.41`) | Wraps AI SDK's `tool()`. Nominee's own portable `approval: boolean` blocks synchronously inside `execute` via `nominee.run()` — it does not use the AI SDK's native resumable `needsApproval`/tool-approval flow. A `PolicyDeniedError`/`ApprovalDeniedError` thrown from `execute` is caught by the AI SDK's own tool-calling loop (`executeToolCall`) and surfaces as a `tool-error` content/step part, not a thrown `generateText`/`streamText` rejection. Verified end-to-end against the real `generateText` + `MockLanguageModelV4` loop in `packages/ai/test/ai.compat.test.ts`. | 2026-08-06 |
| **nominee-eve** — Vercel Eve (`eve`) | `>=0.27.0 <1` (resolved: `0.27.12`) | Wraps `defineTool()` from `eve/tools`, returning a real Eve-branded tool. Nominee's `approval: boolean` blocks inside `execute` via `nominee.run()`, the same portable mechanism as nominee-ai. Eve's own native approval gate (`approval`, formerly `needsApproval`, on `defineTool`) is independent and passed straight through via the adapter config's `eveApproval` (or deprecated `needsApproval`) field. A denial thrown from `execute` propagates as a rejected `tool.execute()` promise. | 2026-08-06 |
| **nominee-mastra** — Mastra (`@mastra/core`) | `>=1.54.0` (resolved: `1.54.0`) | Wraps `createTool()`. Mastra's own `requireApproval` callback (native suspend/resume) is evaluated by the Mastra agent runtime *before* Mastra ever calls `execute`; when it resolves true from an agent tool call, nomineeTool binds the run's live `context.agent.toolCallId` into `nominee.run()` as `frameworkApproval: { id, via: 'mastra' }` so nominee records the framework's approval evidence instead of asking again. Direct/workflow execution (no trusted `agent.toolCallId`) falls back to nominee's own portable `ActionPendingError` rather than self-approving. A policy denial throws from `execute`, surfacing as a rejected `tool.execute()` call. | 2026-08-06 |
| **nominee-mcp** — Model Context Protocol SDK (`@modelcontextprotocol/sdk`) | `>=1.30.0` (resolved: `1.30.0`) | `registerNomineeTool` registers a handler on the real `McpServer.registerTool`. There is no MCP-native approval primitive to hook into, so approval is nominee's own portable `requireApproval: boolean` blocking inside the handler via `nominee.run()`. A denial thrown from the handler is caught by the SDK's `CallToolRequest` handler and returned as `{ isError: true, content: [...] }`, not a protocol-level rejection. Verified against the real `McpServer` class in `packages/mcp/test/mcp.test.ts` (existing coverage — see note below). | 2026-08-06 |
| **nominee-openai** — OpenAI Agents SDK (`@openai/agents`) | `>=0.14.1` (resolved: `0.14.1`) | Wraps `tool()`. Nominee's `ask` decision is mapped into the SDK's native resumable `needsApproval` function, which pauses the run until `RunContext.isToolApproved` reports the call approved on resume; nomineeTool then binds the approved `callId` into `nominee.run()` as `frameworkApproval: { id, via: 'openai-agents' }` so nominee records the native approval instead of blocking again. A policy denial throws from `execute`, surfacing as a rejected `tool.invoke()` call. Verified against the real `RunContext` class and `tool.invoke()`/`tool.needsApproval()` in `packages/openai/test/openai.test.ts` (existing coverage — see note below). | 2026-08-06 |
| **nominee-langchain** — LangChain JS (`@langchain/core`) | `>=1.0.0` (resolved: `1.2.8`) | Wraps LangChain's `tool()`. There is no LangChain-native resumable tool-approval primitive comparable to OpenAI Agents `needsApproval`, so approval is nominee's portable `requireApproval` / `ask` path inside the tool function via `nominee.run()`. A policy denial throws from `invoke()`, surfacing as a rejected promise. Verified against the real `tool()` helper and `StructuredTool.invoke()` in `packages/langchain/test/langchain.test.ts`. | 2026-08-15 |

## Test coverage notes

Per adapter, whether the existing single test file already exercised the
adapter against the framework's real exported types/shapes (not a hand-rolled
local mock), and what was added:

- **nominee-ai** — `ai.test.ts` calls `tool.execute(input, fakeOptions)`
  directly against a hand-rolled `fakeOptions = {...} as never` stand-in for
  `ToolCallOptions`, and never imports anything from `ai`. Added
  `packages/ai/test/ai.compat.test.ts`, which drives the same `nomineeTool`
  through the real `generateText` tool-calling loop using `ai`'s own
  `MockLanguageModelV4` test double (`ai/test`) and the SDK's real
  `ToolCallOptions`, asserting both a successful run and that a policy denial
  surfaces as a real `tool-error` content part.
- **nominee-eve** — `eve.test.ts` calls `tool.execute(input, fakeCtx)` against
  a `fakeCtx = { session: { userId: 'u1' } } as never`, which bypasses
  type-checking against Eve's `ToolContext` entirely and never imports from
  `eve`. Added `packages/eve/test/eve.compat.test.ts`, which builds a
  `ToolContext` value `satisfies`-checked against the real, currently-installed
  `eve` package's exported `ToolContext` type and drives the real
  `defineTool`-branded tool through it — a future Eve release that adds,
  removes, or renames a required `ToolContext` field fails `tsc` on this file.
- **nominee-mastra** — `mastra.test.ts` already imports and instantiates the
  real `RequestContext` class from `@mastra/core/request-context`, and drives
  the real tool object returned by the real `createTool()` (from
  `@mastra/core/tools`, used inside `nomineeTool`) through `tool.execute?.()`.
  No new test added.
- **nominee-mcp** — `mcp.test.ts` already imports the real `McpServer` class
  from `@modelcontextprotocol/sdk/server/mcp.js`, instantiates a real server,
  and calls the real `registerNomineeTool` → `server.registerTool` path,
  asserting on the real `RegisteredTool` it returns. No new test added.
- **nominee-langchain** — `langchain.test.ts` imports `tool()` from
  `@langchain/core/tools` (used inside `nomineeTool`) and drives the real
  structured tool through `invoke()`. No separate compat file.
- **nominee-openai** — `openai.test.ts` already imports the real `RunContext`
  class from `@openai/agents`, instantiates it for real, and drives the real
  `FunctionTool` returned by the real `tool()` (used inside `nomineeTool`)
  through its real `tool.invoke()` / `tool.needsApproval()` methods. No new
  test added.
