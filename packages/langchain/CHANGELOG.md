# nominee-langchain

## 2.7.0

### Minor Changes

- c98a564: Add `nominee-langchain`: LangChain JS `tool()` wrappers that route through
  `nominee.run()`, so deny never reaches execute and ask surfaces
  `ActionPendingError` for durable resume.
