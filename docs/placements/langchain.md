# LangChain JS listing

**Route in:** integration doc + package. There is no `nominee-langchain`
adapter; `nominee.run()` wraps the side effect inside a `DynamicStructuredTool`.
**Guide:** [docs/integrations/langchain.md](../integrations/langchain.md)

## Suggested blurb

LangChain JS has no built-in tool-call authorization bound to application
identity and exact arguments. Put the side effect inside `nominee.run` so the
tool function only runs after a single-use capability is issued for that input.

```ts
func: async (input) =>
  nominee.run({ tool: 'payments.refund', input, user }, async () => refund(input))
```

- Guide: https://github.com/bharath31/nominee/blob/main/docs/integrations/langchain.md
- Site: https://nominee.dev/?utm_source=langchain-js&utm_medium=placement

## Owner checklist

- [ ] Confirm current LangChain JS docs “integrations / tools” contribution path
- [ ] Open the PR with the guide above, start to finish
- [ ] Paste the live URL into [README.md](README.md)
