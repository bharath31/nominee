# Positioning and Decision Record

## The Category
**Agent action authorization**: A deterministic, pre-execution decision over the tuple: `(principal, agent/delegation chain, action, resource, exact input, tenant, policy version, requested credential scope)`.

Nominee is not primarily an approval library, a connector catalog, an agent framework, a prompt-injection detector, or a policy language. Those markets are either crowded or framework-native. 

Its defensible claim is **turning an allowed agent tool call into a short-lived, one-shot, exact-input-bound execution capability, with a fresh least-privilege credential and verifiable evidence.**

## Ideal Customer Profile (ICP)
1. **Primary**: TypeScript product teams adding write-capable, multi-tenant agents to an existing SaaS application. They already own their app authorization (Auth0, Okta, WorkOS, Clerk, custom) and tools, but do not want every agent tool to reimplement authorization, approval, token freshness, and audit handling.
2. **Secondary**: Teams building governed MCP servers for internal enterprise actions.

### Non-ICP
Consumers wiring a generic assistant to hundreds of SaaS APIs. Products like Arcade or Composio are better suited for that use case; Nominee should compose beneath or alongside them when application authorization matters.

## When NOT to use Nominee
- **You need a massive catalog of SaaS integrations.** Use Arcade or Composio.
- **Your agent is read-only** and has no authority worth guarding.
- **Your platform's native permission system covers you end-to-end** and you don't need evidence trails or fresh credentials.
- **You are looking for a standalone Identity Provider (IdP) or Policy Decision Point (PDP).** Nominee is the Policy Enforcement Point (PEP). Use OpenFGA, WorkOS, OPA, or Auth0 for identity and relationships.

## Architectural Composition
Framework → Nominee (PEP & Evidence) → FGA/OPA/IdP/Vault (Identity & Policy Decision) → Action Service

Runnable recipes for the FGA/OPA seam: [`examples/opa-recipe`](../examples/opa-recipe/README.md)
and [`examples/fga-recipe`](../examples/fga-recipe/README.md) — a nominee rule's `when`
predicate calling a mocked OPA- or OpenFGA/WorkOS-FGA-shaped decision function, with the
decision's `reason` landing on the receipt unchanged, and the real-server swap documented.

Partner-specific kits (what nominee adds, a runnable-or-illustrative snippet, and an
honest "not a replacement for" line): [Auth0](partner-kits/auth0.md),
[WorkOS FGA](partner-kits/workos-fga.md), [OPA](partner-kits/opa.md),
[Arcade / Composio](partner-kits/arcade-composio.md).

## Approved Claims
- "Authorize the action, not the agent."
- "Nominee turns an AI tool call into a one-time, exact-input-bound capability."
- "It rechecks your user’s access at execution, obtains a fresh scoped credential, and records what happened."

## Prohibited Claims
- "Stops prompt injection" (Nominee mitigates the *blast radius* of a hijacked agent but does not magically detect prompt injection).
- "Tamper-proof / compliance-ready" without caveats (Receipts are evidence primitives, but require proper key management and external log anchoring for true compliance). **"Tamper-evident" is an approved, materially narrower claim** when describing the hash-chained receipt log.
