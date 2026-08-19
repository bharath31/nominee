---
"nominee-ai": minor
---

`guardTools` now accepts the full per-call context of `nomineeTool`: `resource` and `tenant` (static values or resolvers of the tool's input and tool-call options), `connection`, and `scopes`. Every resolved value is forwarded to `nominee.run()`, so tenant- and resource-scoped policy rules and token strategies work through the whole-object one-liner. Existing `guardTools(nominee, tools, { user })` calls are unchanged.