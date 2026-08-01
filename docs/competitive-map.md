# Competitive Map

This document outlines the market landscape for AI agent authorization and how Nominee fits within it. Nominee is positioned as the independent policy enforcement point (PEP) at the tool-execution boundary.

## Layer-by-Layer Comparison

| Solution | App-Resource Auth | Exact Input Binding | Post-Pause Recheck | Capability Issuance | Credentials | Multi-Framework | Durable Evidence |
|----------|-------------------|---------------------|--------------------|---------------------|-------------|-----------------|------------------|
| **Framework Native (AI SDK / OpenAI)** | ❌ (Delegated to dev) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **FGA / OPA (PDPs)** | ✅ | ❌ (Decides, doesn't execute) | ❌ | ❌ | ❌ | ✅ | ❌ |
| **Arcade / Composio** | ❌ (Focus on SaaS accounts) | ✅ / ❌ | ❌ | ❌ | ✅ (Managed Vault) | ✅ | ✅ (SaaS Audit) |
| **MCP OAuth / EMA** | ❌ (Connection-level) | ❌ | ❌ | ❌ | ✅ (Transport) | ✅ | ❌ |
| **Nominee** | ✅ (Via authorizer hook) | ✅ | ✅ | ✅ | ✅ (Fresh at execute) | ✅ | ✅ (Hash chain) |

## Build / Partner / Do-Not-Build

### Build
- **Runtime enforcement** (the `run()` decision-bound execution path)
- **Framework adapters** (AI SDK, OpenAI, Mastra, MCP, Eve)
- **Durable stores** (PostgreSQL reference implementation for actions, budgets, receipts)
- **Policy test & evidence tooling**

### Partner
- **Identity & FGA (IdPs & PDPs)**: Auth0, Okta, WorkOS FGA, OpenFGA, OPA, Cerbos. (Nominee serves as their enforcement layer).
- **OAuth Vaults & Connectors**: Arcade, Composio.
- **SIEM / Audit sinks**: OpenTelemetry, external logging platforms.

### Do Not Build (Now)
- SaaS connector catalog
- Generic agent runtime / orchestrator
- Visual policy admin product
- LLM semantic-intent policy engine
- Hosted multi-tenant control plane
