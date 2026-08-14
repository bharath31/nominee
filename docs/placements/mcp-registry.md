# MCP registry listing

**Route in:** official MCP registry + `nominee-mcp`.
**Guide:** [docs/integrations/mcp.md](../integrations/mcp.md)

The registry lists servers, not libraries. Draft `server.json` belongs with a
public reference server. Until that package is published with an `mcp-name`
marker, do not write “listed in the MCP registry” on public surfaces.

Headline (allowed): the model can be hijacked; the denied tool still does not
run. Prohibited: “stops prompt injection.”

OAuth authorizes the connection. nominee authorizes the action.

## Suggested description (≤100 characters)

MCP tools behind allow/ask/deny. OAuth connects; nominee authorizes the action.

## Links

- https://nominee.dev/docs/mcp/ (page ships with the MCP front-door PR)
- https://github.com/bharath31/nominee/blob/main/docs/integrations/mcp.md
- https://nominee.dev/?utm_source=mcp-registry&utm_medium=placement

## Owner checklist

- [ ] Publish a public npm server package (reference server is currently private)
- [ ] `npx mcp-publisher login` as the GitHub owner
- [ ] `npx mcp-publisher publish`
- [ ] Confirm search on registry.modelcontextprotocol.io
- [ ] Paste the live URL into [README.md](README.md)
