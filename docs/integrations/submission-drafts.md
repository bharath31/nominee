# NOM-7 placement submission drafts

These drafts are staging material, not filing instructions. **Do not submit any of them until
NOM-6 has merged.** Rebase them onto the shipped front door and recheck every target's current
contribution template immediately before filing.

## Verification status

| Target | Local integration | Placement gate |
|---|---|---|
| Vercel AI SDK | `docs/integrations/ai-sdk.md` | Draft only |
| MCP Registry | `docs/integrations/mcp.md` and `examples/mcp-action-server` | Package after NOM-8 |
| OpenAI Agents JS | `docs/integrations/openai-agents.md` | Draft only |
| Mastra | `docs/integrations/mastra.md` | Draft only |
| LangChain JS | `docs/integrations/langchain.md` | Draft only |
| awesome-* lists | The relevant guides above | Draft only |

## Vercel AI SDK

**Proposed venue:** a documentation PR to the AI SDK repository's integrations/community tooling
surface. Confirm the exact page and contribution template after NOM-6; this is not an AI model
provider submission.

**Title:** Add Nominee authorization integration for AI SDK tools

**Body:**

> Nominee is an open-source authorization layer for agent tools. `nominee-ai` wraps an AI SDK tool
> map with declarative allow/deny/ask policy, binds approval to the exact tool input, and records
> decisions in a hash-chained, tamper-evident receipt log. It supports AI SDK 5, 6, and 7 and adds
> no runtime dependency to Nominee core. The linked quickstart installs the required model
> provider and schema packages and uses the current `inputSchema` API.

## MCP Registry

The official registry accepts runnable MCP **servers** described by `server.json`; `nominee-mcp`
is a library that server authors embed, so publishing the adapter itself would misrepresent the
artifact. Use `examples/mcp-action-server` as the starting server. After NOM-8, turn that private
workspace example into a distributable package with a clean install path, add and validate its
metadata with the then-current registry publisher CLI, publish it, and submit the server package.

**Future server description:**

> A reference MCP server showing decision-bound allow/deny/ask policy for tool calls. A hijacked
> model can request an exfiltrating action, but policy denial keeps the underlying side effect from
> executing and records the refusal in a tamper-evident receipt chain.

## OpenAI Agents JS

**Proposed venue:** a documentation PR to the OpenAI Agents JS repository's extensions or
community integrations surface. Confirm maintainers currently accept third-party entries before
filing.

**Title:** Document Nominee decision-bound tools for OpenAI Agents JS

**Body:**

> `nominee-openai` creates native Agents SDK function tools with declarative authorization,
> resumable human approval, fresh execution-time credentials, and tamper-evident receipts. Nominee
> maps `ask` decisions to the SDK approval flow, verifies the approved tool-call ID on resume, and
> does not invoke the function after a denial. The integration guide includes a complete current
> `Agent` and `run()` example.

## Mastra

**Proposed venue:** a Mastra documentation/community integrations PR. Confirm whether the current
catalog requires a separately published integration package; `nominee-mastra` is already an npm
package and should be linked rather than copied into Mastra core.

**Title:** Add Nominee authorization tools to Mastra integrations

**Body:**

> `nominee-mastra` creates Mastra tools whose effects pass through declarative allow/deny/ask
> policy. It can map `ask` onto Mastra's native approval flow or preserve a durable pending action
> across requests. Approval is bound to the exact input, credentials are fetched only at
> execution, and every outcome is appended to a tamper-evident receipt chain.

## LangChain JS

**Proposed venue:** a focused LangChain JS docs PR showing the framework-neutral `nominee.run`
boundary around a `DynamicStructuredTool`. Do not propose a partner package until the maintainers
confirm that a dedicated `@langchain/nominee` package is appropriate.

**Title:** Add a Nominee authorization example for LangChain tools

**Body:**

> This example places a LangChain `DynamicStructuredTool` side effect inside Nominee's
> decision-bound execution path. Policy denial means the callback never performs the effect;
> approval is bound to the exact arguments and can resume after a restart. This is a small docs
> integration using the published `nominee` package, with no new LangChain dependency.

## awesome-ai-agents

**Proposed entry:**

> [Nominee](https://github.com/bharath31/nominee) — Authorization and durable human approval for
> AI-agent tool calls, with exact-input binding and tamper-evident decision receipts.

Place it in the repository's security, guardrails, or developer-tools category and preserve the
list's alphabetical ordering and link format.

## awesome-mcp-servers

Do not submit `nominee-mcp` as a server. After `examples/mcp-action-server` has a published package
and final transport metadata, draft an entry using that server artifact. Until then this placement
is intentionally blocked on distribution readiness, not copy.

## awesome-llm-security

**Proposed entry:**

> [Nominee](https://github.com/bharath31/nominee) — Open-source authorization for AI-agent tool
> calls. Contains the blast radius of a hijacked agent with allow/deny/ask policy, exact-input
> approval binding, single-use execution capabilities, and tamper-evident receipts.

Place it under agent/tool authorization or runtime defenses, following the list's ordering and
citation conventions.
