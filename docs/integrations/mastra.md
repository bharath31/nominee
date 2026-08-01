# Mastra Integration

The `nominee-mastra` package integrates Nominee with the Mastra framework.

## Installation

```bash
npm install nominee nominee-mastra @mastra/core
```

## Usage

Wrap Mastra tools using `withNominee` to enforce authorization policies before Mastra executes them.

```typescript
import { Nominee, allow, ask } from 'nominee';
import { withNominee } from 'nominee-mastra';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

const nominee = new Nominee({
  policy: {
    rules: [allow('payments.read'), ask('payments.refund')],
    fallback: 'deny'
  }
});

const rawRefundTool = createTool({
  id: 'refundPayment',
  description: 'Refund a payment',
  inputSchema: z.object({ transactionId: z.string() }),
  execute: async ({ context }) => {
    return { status: 'refunded' };
  }
});

// Create a guarded Mastra tool
export const refundTool = withNominee(nominee, rawRefundTool, { action: 'payments.refund' });
```
