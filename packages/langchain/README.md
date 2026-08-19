# nominee-langchain

Decision-bound tools for LangChain JS. The side effect runs only after
`nominee.run()` issues a single-use capability for the exact input.

```ts
import { Nominee, allow, ask } from 'nominee'
import { nomineeTool } from 'nominee-langchain'
import { z } from 'zod'

const refund = nomineeTool({
  name: 'payments_refund',
  description: 'Refund a payment',
  schema: z.object({ transactionId: z.string() }),
  nominee: new Nominee({
    policy: {
      rules: [allow('payments.read'), ask('payments.refund')],
      fallback: 'deny',
    },
  }),
  action: 'payments.refund',
  user: ({ config }) => String(config?.metadata?.userId ?? ''),
  resource: ({ input }) => `payment:${input.transactionId}`,
  execute: async ({ transactionId }, { token }) => {
    await issueRefund({ transactionId, token })
    return `Refunded ${transactionId}`
  },
})
```

Pass `refund` to any LangChain agent that accepts structured tools.
Denied calls never reach `execute`. For an `ask` rule without an inline
approval handler, preserve `ActionPendingError` and resume the durable
Nominee action after the human decision.

LangChain has no first-class resumable tool-approval primitive comparable
to OpenAI Agents `needsApproval`. This adapter uses Nominee's portable
approval path rather than inventing a second pause protocol.

## What happens on `ask`

There is no native pause primitive to bridge to, so `ask` uses Nominee's portable path: an `ask` that cannot be settled inline — e.g. no `onApprovalRequest` handler, or a handler that only notifies — makes `invoke()` reject with `ActionPendingError`, carrying the durable `actionId` and `approvalId`. Catch it, persist the `actionId` **and the original input** (the durable action record stores only an input hash), then resume after the human decision with `resolveActionApproval()` → `resumeAction()` → `executeCapability()` — the full walkthrough is on the [Approvals that outlive the request](https://nominee.dev/docs/approvals/) page. Denied calls never reach `execute`, and the refusal lands on the receipt chain.

## Observe before enforcing

Use the same tool with `new Nominee({ mode: 'observe' })` to inventory
callbacks that actually run before writing a policy. Observation reports
do not retain raw string/boolean values or user IDs; numeric aggregates
may be sensitive. Observe mode is not a security control and cannot be
combined with `production: true`.
