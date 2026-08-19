---
"nominee": patch
"nominee-ai": patch
"nominee-eve": patch
"nominee-openai": patch
"nominee-mastra": patch
"nominee-mcp": patch
"nominee-langchain": patch
---

Document the out-of-band approval path — the approval that outlives the request. New
site page at `nominee.dev/docs/approvals` with the four-step flow (catch
`ActionPendingError` and persist the action id and the original input,
`resolveActionApproval()`, `resumeAction()`, `executeCapability()`); a compressed
four-step section in the core README quickstart; a "What happens on `ask`"
subsection in every adapter README; and `examples/support-refund-agent` named as the
canonical reference implementation.