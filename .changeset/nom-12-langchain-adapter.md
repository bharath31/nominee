---
"nominee-langchain": minor
---

Add `nominee-langchain`: LangChain JS `tool()` wrappers that route through
`nominee.run()`, so deny never reaches execute and ask surfaces
`ActionPendingError` for durable resume.
