# Open issue triage — August 5, 2026

This scan covers the ten open GitHub issues visible on August 5, 2026. Issues that are product, documentation, or partner-development work remain implementation tasks unless a shipped repository surface already covers the request. Issues that appear already satisfied by repository content are listed as close candidates, but closing requires GitHub write permission or a merged PR that references the issue.

## Close candidates

| Issue | Why it appears covered |
|---|---|
| #43 — Task 4: Build an OpenAI Agents SDK reference app with native HITL composition | The repository includes the OpenAI adapter package and `examples/openai-support-agent`, which demonstrates the OpenAI support-agent shape requested by the issue. |
| #45 — Task 6: Publish an adversarial contract test suite | The repository includes `security-contract/contract.test.ts` with contract tests for denial-before-execution, production default-deny requirements, input binding, capability single use, and receipt integrity. |
| #49 — Task 10: Ship an isolated action-service pattern | The repository includes the production runbook's explicit isolated service boundary guidance and a production-shaped MCP action-server example. |

## Still needs implementation

| Issue | Implementation needed |
|---|---|
| #47 — Task 8: Add first-class policy-engine and FGA recipes | Add executable OPA and FGA recipes plus any generic metadata-preserving authorizer decision contract that is not yet represented in public docs. |
| #48 — Task 9: Improve adapter semantics and compatibility guarantees | Add adapter compatibility tests and a compatibility matrix against current framework approval/resume behavior. |
| #50 — Task 11: Add evidence export and observability recipes | Addressed in this branch by adding the evidence export and OpenTelemetry recipe. |
| #51 — Task 12: Establish security-review and release discipline | Add attacker models, non-goals, claim-to-test traceability, and an independent review checklist. |
| #52 — Task 13: Recruit ten narrow design partners | Non-code GTM/research task; requires partner discovery and outreach rather than repository implementation. |
| #53 — Task 14: Publish technical “comparison proof” | Add developer-facing comparison articles explaining native approval, OAuth, FGA, connector platforms, and action authorization boundaries. |
| #54 — Task 15: Create partner-ready integration kits | Add Auth0, WorkOS FGA, OPA, Arcade, and Composio partner kits that position Nominee as complementary infrastructure. |

## Closing note

This branch can close #50 when merged. The close candidates above should be closed manually or by follow-up PRs that reference the exact shipped surfaces maintainers accept as complete.
