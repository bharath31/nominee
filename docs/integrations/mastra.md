# Mastra Integration

The `nominee-mastra` package creates Mastra tools whose side effects run through Nominee's
decision-bound action lifecycle.

## Installation

```bash
npm install nominee nominee-mastra @mastra/core zod
```

## Usage

```typescript
import { Nominee, allow, ask } from 'nominee'
import { nomineeTool } from 'nominee-mastra'
import { z } from 'zod'

const nominee = new Nominee({
  policy: {
    rules: [allow('payments.read'), ask('payments.refund')],
    fallback: 'deny',
  },
})

export const refundTool = nomineeTool({
  id: 'refundPayment',
  description: 'Refund a payment',
  inputSchema: z.object({ transactionId: z.string() }),
  outputSchema: z.object({ status: z.literal('refunded') }),
  nominee,
  user: 'user-123',
  action: 'payments.refund',
  execute: async ({ transactionId }, { action }) => {
    console.log(`Refunding ${transactionId} as action ${action.id}`)
    return { status: 'refunded' as const }
  },
})
```

Add `refundTool` to a Mastra agent's `tools`. By default, a Nominee `ask` decision surfaces as an
`ActionPendingError`, which supports approval that outlives the current request. Set
`nativeApprovals: true` to map policy `ask` decisions onto Mastra's agent approval flow, or set
`requireApproval` to require that native flow independently of the policy.
