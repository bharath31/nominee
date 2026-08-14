# LangChain JS Integration

Nominee does not require a framework-specific adapter to guard a LangChain tool. Put the side
effect inside `nominee.run`; LangChain invokes that function only after Nominee issues a
single-use capability for the exact input.

## Installation

```bash
npm install nominee @langchain/core zod
```

## Usage

```typescript
import { DynamicStructuredTool } from '@langchain/core/tools'
import { Nominee, ask } from 'nominee'
import { z } from 'zod'

const nominee = new Nominee({
  policy: {
    rules: [ask('payments.refund')],
    fallback: 'deny',
  },
})

export const refundTool = new DynamicStructuredTool({
  name: 'payments_refund',
  description: 'Refund a payment',
  schema: z.object({ transactionId: z.string() }),
  func: async (input) =>
    nominee.run(
      {
        tool: 'payments.refund',
        input,
        user: 'user-123',
        resource: `payment:${input.transactionId}`,
      },
      async () => `Refunded ${input.transactionId}`,
    ),
})
```

Pass `refundTool` to any LangChain agent that accepts tools. Denials never enter the callback.
For an `ask` rule without an inline approval handler, preserve the resulting `ActionPendingError`
and resume the durable Nominee action after the human decision; do not catch it and run the side
effect directly.
