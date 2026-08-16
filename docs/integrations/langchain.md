# LangChain JS Integration

`nominee-langchain` wraps LangChain's `tool()` helper so the side effect runs
only after Nominee issues a single-use capability for the exact input.

## Installation

```bash
npm install nominee nominee-langchain @langchain/core zod
```

## Usage

```typescript
import { Nominee, ask } from 'nominee'
import { nomineeTool } from 'nominee-langchain'
import { z } from 'zod'

const nominee = new Nominee({
  policy: {
    rules: [ask('payments.refund')],
    fallback: 'deny',
  },
})

export const refundTool = nomineeTool({
  name: 'payments_refund',
  description: 'Refund a payment',
  schema: z.object({ transactionId: z.string() }),
  nominee,
  action: 'payments.refund',
  user: ({ config }) => String(config?.metadata?.userId ?? ''),
  resource: ({ input }) => `payment:${input.transactionId}`,
  execute: async (input, { token }) => `Refunded ${input.transactionId} with ${token ?? 'no token'}`,
})
```

Pass `refundTool` to any LangChain agent that accepts structured tools. Denials
never enter the callback. For an `ask` rule without an inline approval handler,
preserve `ActionPendingError` and resume the durable Nominee action after the
human decision; do not catch it and run the side effect directly.

LangChain JS has no first-class resumable tool-approval primitive comparable to
OpenAI Agents `needsApproval`. The adapter uses Nominee's portable approval
path. You can still wrap a side effect with core `nominee.run()` inside a
hand-rolled `DynamicStructuredTool` if you do not want the package.
