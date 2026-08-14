# Sourcing

Do not build a scraped email list. Each outreach row needs a public
reason we are writing *this* team (a changelog, a repo, a talk, a
comment). No reason, no mail.

## Where they are

1. **Teams that just shipped a write-capable agent and said so.**
   Search changelogs and engineering blogs for refund, “AI agent”,
   “can now update”, “merge”, “close the ticket”. Prefer product
   companies whose app is already multi-tenant SaaS, not AI wrappers.
2. **EU / high-risk oversight.** People citing Article 14, human
   oversight, or record-keeping for agent actions. Door-opener:
   https://nominee.dev/blog/eu-ai-act-article-14-human-oversight/
   Still run [scorecard.md](scorecard.md); a deadline is not an ICP.
3. **MCP authors whose tools write.** Start from servers that commit,
   close, refund, email, or provision — not read-only catalog servers.
   `docs/placements/awesome-lists.md` is a source of *projects*, not
   of addresses.
4. **IdP ecosystem.** Auth0, WorkOS, Clerk customers adding agents.
   Those vendors are allies. Use [partner kits](../partner-kits/auth0.md).
5. **Inbound from Phase 2 placements** once a row in
   `docs/placements/README.md` is actually live. Until then this
   channel is empty, not zero-converted.

## Non-ICP traps

- Consumer “connect 400 APIs” assistants.
- Read-only RAG / support-search bots.
- Ourselves, the playground, and `examples/`. Repository proofs are
  not design partners.

## Research notes (public signals, not contacts)

These are *places to look*, recorded so the next agent does not start
from zero. None of them are partners. Do not add them to
[pipeline.md](pipeline.md) until a human has a named engineer and a
reason to write.

| Signal | Why it might match | Why it might not |
| --- | --- | --- |
| SaaS support products shipping an agent that refunds or edits tickets | Write + multi-tenant + existing IdP | Might be a giant platform team, not a product team we can reach |
| Internal MCP servers in `awesome-mcp-servers` Security / Developer Tools that mutate GitHub/Jira | Secondary ICP | Many are toys or OAuth-only |
| Auth0/WorkOS customers on those vendors’ “AI” blog posts | Composition story | Post may be the vendor, not the customer |
| Teams commenting on Vercel AI SDK HITL docs that `needsApproval` is not enough | Exact pain | Commenters are often exploring, not shipping |

When a human picks a row, copy the public URL into the pipeline
“source” cell and run the scorecard before sending mail.
