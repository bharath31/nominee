# LangChain JS listing

**Route in:** docs issue on [`langchain-ai/docs`](https://github.com/langchain-ai/docs) after reading [INTEGRATIONS.md](https://github.com/langchain-ai/langchainjs/blob/main/.github/contributing/INTEGRATIONS.md).
LangChain wants standalone npm packages for first-party listings.
**Package:** [`nominee-langchain`](https://www.npmjs.com/package/nominee-langchain) (`packages/langchain`)
**Guide:** [docs/integrations/langchain.md](../integrations/langchain.md)

## Suggested blurb

LangChain JS has no first-class tool-call authorization bound to application
identity and exact arguments. `nominee-langchain` wraps `tool()` so the side
effect runs only after a single-use capability is issued for that input.

```ts
import { nomineeTool } from 'nominee-langchain'
```

- npm: https://www.npmjs.com/package/nominee-langchain
- Guide: https://github.com/bharath31/nominee/blob/main/docs/integrations/langchain.md
- Site: https://nominee.dev/?utm_source=langchain-js&utm_medium=placement

Docs PRs must link an approved issue or discussion
(https://docs.langchain.com/oss/javascript/contributing/documentation).

## Owner checklist

- [ ] Open an issue on `langchain-ai/docs` proposing a JS how-to that uses `nominee-langchain`
- [ ] After maintainer approval, PR the how-to (Python+JS co-location may be required — say JS-only if they allow it)
- [ ] Paste the live URL into [README.md](README.md)
