# Observe mode

Observe mode answers one question: **what can your agent already do?**

It wraps your existing tools, requires no policy, and blocks nothing. Every
call is evaluated, recorded into the same hash-chained receipt log enforcing
mode writes, and then allowed to run. At the end you get a report of the tools
your agent actually called, how often, with what arguments, and which of those
arguments nothing bounds.

```ts
import { Nominee, formatObservations } from 'nominee'

const nominee = new Nominee({ mode: 'observe' })
const tools = nominee.observe({ readOrder, issueRefund, exportCustomers })

// …run your agent exactly as you do today…

console.log(formatObservations(nominee.observations()))
```

Or see it on a sample agent first, with nothing installed:

```bash
npx nominee-cli observe
```

## What it is not

Observe mode is **not** a security control. While it is on, nominee enforces
nothing:

- A `deny` rule records a denial and the call runs anyway.
- An `ask` rule records the escalation and the call runs without a human.
- An exhausted budget records the escalation and the call runs.
- An application authorizer that revokes access mid-action records the
  revocation and the call runs.

That is the trade: you learn what your agent does without changing what it
does. Nothing about it is a judgement of what your agent *should* be allowed
to do.

## The safety rails

Observe mode is a deliberate exception to nominee's "fail closed, and say so"
commitment, so it says so, loudly and unavoidably:

1. **You must ask for it by name.** `mode` defaults to `'enforce'`. There is no
   configuration that turns enforcement off by accident, and no environment
   variable that flips it.
2. **`production: true` refuses it.** Constructing a nominee with both throws.
   An unguarded production path cannot be reached through this feature.
3. **Startup announces it.** Every observe-mode instance prints a notice that
   enforcement is off — in every environment, including
   `NODE_ENV=production`, where the notice gets an extra line.
4. **Every receipt says so.** Receipts written in observe mode carry
   `enforcement: 'observe'`, and the receipt keeps the verdict the policy
   actually reached (`effect: 'deny'` stays `'deny'`). A log from an observe
   session can never be read, or presented, as evidence of enforcement.
5. **Sub-agents inherit it.** `delegate()` copies the parent's mode. A
   sub-agent can no more turn enforcement off than it can widen its policy.
6. **Nothing else is relaxed.** Input binding, single-use capabilities, and the
   receipt chain behave exactly as they do in enforcing mode. Observe mode
   changes what happens to a decision, not how the decision is made or
   recorded. See `security-contract/contract.test.ts`.

## Reading the report

`nominee.observations()` returns plain JSON — argument *shapes* and ranges, not
raw user data:

```jsonc
{
  "mode": "observe",
  "version": 1,
  "window": { "from": 1755168000000, "to": 1755772800000 },
  "totals": { "calls": 142, "tools": 6, "allow": 142, "ask": 0, "deny": 0 },
  "tools": [
    {
      "tool": "refund.issue",
      "calls": 37,
      "users": 12,
      "kind": "mutate",          // from the tool's name, not from its behaviour
      "baseline": "ask",         // a starting point to edit, not a recommendation
      "arguments": [
        {
          "name": "amount",
          "types": ["number"],
          "range": { "min": 5, "max": 2000, "median": 40 },
          "unbounded": true,
          "note": "numeric — nothing observed puts a ceiling on this value"
        }
      ],
      "unboundedArguments": ["amount"]
    }
  ]
}
```

`kind` and `baseline` are derived from the tool's *name*. A tool called
`orders.read` can still be the most dangerous call in your system, and a tool
we call `unknown` may be entirely safe. Treat both as prompts for a human
decision.

Unbounded arguments are the interesting part. They are where an agent's
authority is widest: a numeric `amount` with no ceiling accepts `5` and
`5_000_000` alike, and observing a week of `$5`–`$180` refunds tells you what
happened, not what is possible.

## When you are done observing

Remove `mode: 'observe'`, write rules, and use `guard()` / `run()`. The report
tells you which tools to write rules for first — start with the mutating tools
that carry unbounded arguments.

```ts
const nominee = new Nominee({
  policy: {
    rules: [allow('orders.read'), ask('refund.issue'), deny('customers.export')],
    fallback: 'deny',
  },
})
```

Verify the rules you wrote are reachable with `npx nominee-cli check
./nominee.policy.ts`.
