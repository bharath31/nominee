# OpenAI Agents JS listing

**Route in:** ecosystem page / third-party mention in official docs, or the SDK awesome list.
**Repos:** [`openai/openai-agents-js`](https://github.com/openai/openai-agents-js) · docs https://openai.github.io/openai-agents-js/
**Fallback listing:** [`e2b-dev/awesome-ai-sdks`](https://github.com/e2b-dev/awesome-ai-sdks) (this *is* the SDK list; `awesome-ai-agents` is products)
**Guide:** [docs/integrations/openai-agents.md](../integrations/openai-agents.md)
**Package:** `nominee-openai`
**Example:** `examples/openai-support-agent` (native HITL composition)

## Suggested blurb

nominee-openai maps Nominee `ask` rules onto the OpenAI Agents SDK’s native
resumable approvals. Policy still runs before the tool function. Denials never
reach the handler.

```ts
import { nomineeTool } from 'nominee-openai'
```

- npm: https://www.npmjs.com/package/nominee-openai
- Guide: https://github.com/bharath31/nominee/blob/main/docs/integrations/openai-agents.md
- Site: https://nominee.dev/?utm_source=openai-agents&utm_medium=placement

## Owner checklist

- [ ] Find the current official ecosystem / examples listing
- [ ] Open the PR or submit the form
- [ ] Paste the live URL into [README.md](README.md)
