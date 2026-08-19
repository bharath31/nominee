---
"nominee": patch
"nominee-cli": patch
"nominee-ai": patch
"nominee-openai": patch
"nominee-mastra": patch
"nominee-mcp": patch
"nominee-langchain": patch
"nominee-eve": patch
"nominee-supabase": patch
"nominee-auth0": patch
"nominee-postgres": patch
---

Repositioned the package surfaces around the pause narrative: npm package
descriptions now lead with the consequence of approvals that outlive the
request — a token minted at execution, bound to the arguments a human
reviewed, spendable once, sealed into a hash-chained receipt — instead of a
capability list. The core and adapter READMEs align with the same story,
budget examples use `maxCalls` (lifetime call count, no time window, never
resets, escalates to `ask` on exhaustion), and every tamper-evidence claim
now carries its trust boundary (tamper-evident against a downstream log
editor, not non-repudiation against the agent host).
