# Standalone Usage

Nominee is designed to work out-of-the-box in any Node.js/TypeScript environment without requiring a specific AI framework.

## Installation

```bash
npm install nominee
```

## Usage

Use `nominee.authorize` or `nominee.guard` to secure standalone application logic.

```typescript
import { Nominee, allow, ask, deny } from 'nominee';

const nominee = new Nominee({
  policy: {
    rules: [allow('billing.view'), ask('billing.update')],
    fallback: 'deny'
  }
});

// Guarding an individual execution
async function updateBilling(user: string, plan: string) {
  // Throws PolicyDeniedError or ApprovalDeniedError if not permitted
  await nominee.authorize({
    tool: 'billing.update',
    input: { plan },
    user
  });
  
  console.log('Billing updated');
}

// Guarding a collection of functions
const services = {
  viewBilling: (plan) => `Viewing ${plan}`,
  updateBilling: (plan) => `Updated to ${plan}`
};

const guardedServices = nominee.guard(services, { user: 'user-123' });
```
