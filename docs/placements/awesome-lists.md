# awesome-* list PRs

Three lists, one blurb each. SEO-bearing and permanent. Keep the prohibited
claim out of every PR.

Shared link: https://nominee.dev/?utm_source=<list>&utm_medium=placement

`awesome-mcp-servers` maintainers currently require a Glama listing and
score badge before merge. Do not open that PR until
https://glama.ai/mcp/servers shows the server.

## awesome-mcp-servers

**Repo:** https://github.com/punkpeye/awesome-mcp-servers
**Section:** [Security](https://github.com/punkpeye/awesome-mcp-servers#security)
**Also:** submit the server at https://glama.ai/mcp/servers and claim it.

**Suggested entry** (add the Glama badge URL after listing exists):

```md
- [bharath31/nominee](https://github.com/bharath31/nominee) - Authorization layer for MCP tool calls. OAuth connects the client; nominee allow/ask/deny decides which action runs. TypeScript, `nominee-mcp`. Does not detect prompt injection.
```

Do not describe it as an MCP server catalog or as a prompt-injection detector.
The list is of *servers*; if they reject a library, point at
`examples/mcp-action-server` once it is published.

## awesome-ai-sdks (not awesome-ai-agents)

**Repo:** https://github.com/e2b-dev/awesome-ai-sdks

[`e2b-dev/awesome-ai-agents`](https://github.com/e2b-dev/awesome-ai-agents)
is a list of autonomous *products*. Their contributing note sends SDKs and
libraries to **awesome-ai-sdks**. File there.

```md
- [nominee](https://nominee.dev/?utm_source=awesome-ai-sdks&utm_medium=placement) - Open-source allow/ask/deny checks before AI agent tool calls. Adapters for Vercel AI SDK, Eve, OpenAI Agents, Mastra, MCP.
```

## awesome-llm-security

**Canonical list:** https://github.com/corca-ai/awesome-llm-security
(Tools / Defense). Other forks exist; prefer the one with the Awesome badge
and an active Tools section.

```md
- [nominee](https://nominee.dev/?utm_source=awesome-llm-security&utm_medium=placement) - Blast-radius containment for hijacked agents: deny the tool before it runs, receipt the attempt. Does not detect prompt injection.
```

## Owner checklist

- [ ] Glama listing for the MCP example server
- [ ] awesome-mcp-servers PR (Security, with badge)
- [ ] e2b-dev/awesome-ai-sdks PR
- [ ] corca-ai/awesome-llm-security PR
- [ ] Paste live URLs into [README.md](README.md)
