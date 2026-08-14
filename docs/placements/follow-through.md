# Placement follow-through (NOM-7)

Standing weekly check-in. Persistence is the job. Do not mark
[README.md](README.md) live from activity in *this* repo.

Owner: unassigned (needs a named human; agents cannot authenticate to
upstream GitHub orgs, the MCP publisher, or Glama).

## This week (2026-08-14)

| Target | Blocker | Next human action |
| --- | --- | --- |
| Vercel AI SDK | Needs a PR on `vercel/ai`, not here | Open PR adding a “authorization beyond `needsApproval`” note on the HITL cookbook |
| MCP registry | Example server is `private: true`; `mcp-publisher login` needs the GitHub owner | Publish npm package with `mcpName`, then `npx mcp-publisher publish` |
| OpenAI Agents JS | No official third-party ecosystem page | PR against `openai/openai-agents-js` docs *or* list on awesome-ai-sdks |
| Mastra | They ask for an issue before a docs PR | File integration request issue; Discord + ashwin@mastra.ai |
| LangChain JS | Community integrations are standalone packages + a docs issue | Open issue on `langchain-ai/docs` linking `docs/integrations/langchain.md` |
| awesome-mcp-servers | Glama listing + A-grade badge required | Submit server to glama.ai, then PR Security section |
| awesome-ai-sdks | `awesome-ai-agents` is the wrong list (agents, not SDKs) | PR `e2b-dev/awesome-ai-sdks` |
| awesome-llm-security | Pick one canonical list and stay honest about detection | PR Tools/Defense; do not say “stops injection” |

## Log

| Date | What moved | What did not |
| --- | --- | --- |
| 2026-08-14 | In-repo copy, upstream URLs, `mcpName` on the example `server.json` companion | Zero live inbound URLs |

## Rules

- One nudge per target per week. Then wait.
- Never write “listed in …” on nominee.dev until the Live URL cell is a
  real, public, clickable listing.
- Prohibited: “stops prompt injection.”
