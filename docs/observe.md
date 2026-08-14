# Observe mode

Observe mode answers one question: **what can your agent already do?**

It wraps your existing tools, requires no policy, and does not enforce deny,
ask, budget, or false-authorizer decisions. Every call is evaluated and
recorded into the same hash-chained receipt log enforcing mode writes before
execution continues. Runtime, integrity, authorizer, and persistence errors
still fail closed. At the end you get a report of the tool callbacks that
actually started, how often, with what argument shapes, and which arguments
nothing bounds. Preparing an action does not count as a call; an invoked
callback does count even if it later throws.

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

Observe mode is **not** a security control. While it is on, nominee does not
enforce policy outcomes:

- A `deny` rule records a denial and the call runs anyway.
- An `ask` rule records the escalation and the call runs without a human.
- An exhausted budget records the escalation and the call runs.
- An application authorizer that revokes access mid-action records the
  revocation and the call runs.

An authorizer that throws, an invalid or reused capability, a changed input,
token failure, or receipt/action-store failure still stops execution. Observe
mode disables authorization outcomes, not runtime integrity checks.

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
3. **Startup announces it.** Every explicitly constructed observe-mode instance
   prints a notice that policy enforcement is off — in every environment, including
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

Custom `ActionStore` implementations must honor
`ApplyActionDecision.enforcement: 'observe'`: advance the action through the
allowed lifecycle while retaining the supplied policy `effect`. The bundled
memory and PostgreSQL stores implement this contract. Ignoring the marker fails
closed before tool execution rather than silently weakening enforcement.

## Reading the report

`nominee.observations()` returns plain JSON — argument shapes, bounded
cardinalities, and numeric ranges rather than enumerated string values:

```jsonc
{
  "mode": "observe",
  "version": 2,
  "window": { "from": 1755168000000, "to": 1755772800000 },
  "totals": { "calls": 142, "tools": 6, "allow": 142, "ask": 0, "deny": 0 },
  "availableTools": ["customers.export", "orders.read", "refund.issue"],
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
        },
        {
          "name": "currency",
          "types": ["string"],
          "distinctValues": 1,
          "unbounded": false,
          "note": "a small set of scalar fingerprints was observed"
        }
      ],
      "unboundedArguments": ["amount"]
    }
  ]
}
```

`availableTools` is a bounded inventory of callable tools passed to
`observe()`, including tools that did not run during the window. It does not
count as traffic. Comparing it with `tools` is the only honest way to identify
unused authority; a report cannot infer tools it was never given. Schema version
1 reports remain accepted by the CLI, but cannot support never-called-tool
rules. `availableToolsTruncated` says when the inventory cap was reached.

The collector never retains or emits raw string or boolean argument values. For
short scalars it keeps at most eight SHA-256 fingerprints so it can report
bounded cardinality such as `distinctValues: 1`; strings longer than 64
characters are treated as free-form and are not retained even as fingerprints.
User IDs are also counted by fingerprint. Numeric minimum and maximum cover
every finite value seen, and the median is sampled from at most the first 1,000
numbers, so treat the report as sensitive whenever numeric inputs are sensitive.

Collection is deliberately bounded. A report sets `argumentsTruncated` or
`usersTruncated` when a per-tool cap is exceeded and `untrackedTools` when it
cannot detail more tool names. `totals.tools` includes the bounded untracked
count. If that second cap is also exceeded, `toolsTruncated` is true and
`totals.tools` is an explicit lower bound.

`kind` and `baseline` are derived from the tool's *name*. A tool called
`orders.read` can still be the most dangerous call in your system, and a tool
we call `unknown` may be entirely safe. Treat both as prompts for a human
decision.

Unbounded arguments are the interesting part. They are where an agent's
authority is widest: a numeric `amount` with no ceiling accepts `5` and
`5_000_000` alike, and observing a week of `$5`–`$180` refunds tells you what
happened, not what is possible.

## Generate a policy to review

Write the report and ask the CLI for an editable starter policy:

```bash
npx nominee-cli observe --out nominee.observations.json
npx nominee-cli generate nominee.observations.json --out nominee.policy.ts
npx nominee-cli check nominee.policy.ts
```

The generator allows name-classified reads, proposes the observed
minimum-to-median range followed by `ask` for mutations with numeric evidence,
asks for other called tools, denies inventoried tools that never ran, and ends with
`fallback: 'deny'`. Every rule carries its evidence. The header states the
important limitation: observed traffic is not a security recommendation. Read
and edit the file before enforcement. The CLI refuses to overwrite an existing
policy unless `--force` is explicit.

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
./nominee.policy.ts`. Generated files carry their observed tool inventory so
this check uses real names rather than the CLI's generic examples.

For the related human-oversight and record-keeping pattern, see
[Article 14 human oversight for AI agents](https://nominee.dev/blog/eu-ai-act-article-14-human-oversight/).
