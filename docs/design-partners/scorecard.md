# ICP scorecard

From [docs/positioning.md](../positioning.md). Do not widen the ICP to fill
ten slots. The wrong partners produce case studies that attract the wrong
developers, who churn — and that churn will be misread as a product failure.

## Must be true (primary)

- [ ] TypeScript product team (the agent runtime they will wrap is JS/TS).
- [ ] They already have a SaaS application with real users and tenancy.
- [ ] They are adding (or just added) an agent that can **write**: refund,
      ticket update, merge, email send, provision, delete, or similar.
- [ ] They already own app authorization (Auth0, Okta, WorkOS, Clerk, or
      custom). Nominee composes under that; it is not their IdP.
- [ ] They do not want every agent tool to reimplement authorization,
      approval, token freshness, and audit handling.

If any box is unchecked, they are not a primary partner. Stop.

## Secondary (allowed, still narrow)

- [ ] They are building a governed **MCP server** for internal enterprise
      actions that write. OAuth is the connection; nominee is the action.

Secondary does not mean “anyone with an MCP README.” Consumer assistants
wired to hundreds of SaaS APIs are **non-ICP** — Arcade or Composio fit
that job.

## Automatic no

- Read-only agents (search, summarize, RAG with no side effects).
- Teams asking nominee to replace OpenFGA / OPA / Auth0.
- Teams whose only pain is “the model got jailbroken” and who want
  detection. Blast-radius containment is the honest offer; detection is
  prohibited.
- Filling a slot because the calendar says ten.

## Scoring (use after the must-haves)

| Signal | Weight | Notes |
| --- | --- | --- |
| Write tool already in production, even if ungated | high | Nervous in public is a plus |
| Multi-tenant; resource permission can change during a pause | high | This is the month-six reason, but they feel it now |
| EU / high-risk classification curiosity (Article 14) | high | Budget and a deadline; still verify they are ICP |
| Already on Auth0 / WorkOS / Clerk | medium | Composition story, not a requirement |
| MCP server that commits / closes / refunds | medium | Secondary ICP |
| Want a connector catalog | disqualify | Point at Arcade/Composio |

A partner who scores well and then **goes quiet for a week** is more
valuable than a partner who loves the README. Record the silence.
