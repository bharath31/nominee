# LangChain JS listing

**Route in:** docs issue on [`langchain-ai/docs`](https://github.com/langchain-ai/docs) after reading [INTEGRATIONS.md](https://github.com/langchain-ai/langchainjs/blob/main/.github/contributing/INTEGRATIONS.md).
LangChain wants standalone npm packages for first-party listings. There is no
`nominee-langchain` adapter; `nominee.run()` wraps the side effect inside a
`DynamicStructuredTool`. Treat this as a **community how-to**, not a
`@langchain/community` PR, unless we later publish a dedicated package.
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

Docs PRs must link an approved issue or discussion
(https://docs.langchain.com/oss/javascript/contributing/documentation).

## Owner checklist

- [ ] Open an issue on `langchain-ai/docs` proposing a JS how-to that uses `DynamicStructuredTool` + `nominee.run`
- [ ] After maintainer approval, PR the how-to (Python+JS co-location may be required — say JS-only if they allow it)
- [ ] Paste the live URL into [README.md](README.md)
