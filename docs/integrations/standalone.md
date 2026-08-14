# Standalone Usage

Nominee is designed to work out-of-the-box in any Node.js/TypeScript environment without requiring a specific AI framework.

## Installation

```bash
npm install nominee
```

## Decision-bound `run()` (copy-paste)

Wrap a plain function — not an SDK `tool()` — with `nominee.run()`. Policy is
evaluated, an approval (if any) is bound to the exact arguments, and the
callback runs only after a capability is consumed. `production: true` also
requires durable action/receipt stores (`nominee-postgres`); this snippet is
the in-memory default.

```ts
import { Nominee, allow, ask } from 'nominee'

const nominee = new Nominee({
  policy: {
    rules: [
      allow('orders.read'),
      ask('refund.issue', { reason: 'a person approves every refund' }),
    ],
    fallback: 'deny',
  },
  // Inline settlement so this snippet actually returns. Out-of-band
  // approvals use resolveActionApproval → resumeAction → executeCapability
  // and must persist the original input alongside the action id.
  onApprovalRequest: (req) => req.approve(),
})

async function issueRefund(user: string, amount: number, orderId: string) {
  return nominee.run(
    { tool: 'refund.issue', input: { amount, orderId }, user },
    async () => {
      // Fake side effect. Denied calls never reach here.
      return `refunded $${amount} for ${orderId}`
    },
  )
}

// Express-shaped handler (no Express dependency):
export async function postRefund(req: { user: string; body: { amount: number; orderId: string } }) {
  return issueRefund(req.user, req.body.amount, req.body.orderId)
}
```

An `ask` rule pauses until `onApprovalRequest` or `resolveActionApproval`.
Without one of those, `run()` throws `ActionPendingError` and the callback
never runs. Official adapters and this standalone path share the same
contract: bind authorization to the argument fingerprint; resolve credentials
inside the `run()` callback; persist the original input with `error.actionId`
when approval outlives the request. See
[`.github/CONTRIBUTING.md`](../../.github/CONTRIBUTING.md).

`nominee.guard()` still wraps a map of functions for convenience. Prefer
`run()` (or an official adapter) whenever the call must stay decision-bound.
`authorize()` then a bare call is not the execution path under `production: true`.
