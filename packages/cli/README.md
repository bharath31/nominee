# nominee-cli

Try [nominee](https://nominee.dev) on a support-agent refund flow without cloning
the repository, configuring an API key, or writing code:

```
npx nominee-cli
```

Or, if you don't have any rules yet, start by looking at what your agent can
already do — report only, with no policy decisions enforced:

```
npx nominee-cli observe
```

(the package is `nominee-cli`; it installs a `nominee` binary — `npx nominee`
alone resolves the unrelated core `nominee` library instead, which has no
CLI, so always invoke it as `npx nominee-cli`.)

## `nominee-cli` (no args)

Runs a support-agent policy proof against the real `nominee` package:

- a $25 refund runs immediately;
- a $200 refund asks for approval, then runs once;
- a $2,000 refund is blocked before the refund function runs;
- exporting all customers is blocked too; and
- the receipt chain verifies, while a doctored copy does not.

The proof itself makes no network calls and needs no environment variables or
API keys. (`npx` may first download the package from npm.) After a successful
interactive run, the CLI separately offers one optional activation report, as
described below. The proof exits `0` only when every policy and receipt
invariant holds, and `1` if one regresses; reporting cannot change that result.

```
$ npx nominee-cli

A support agent wants to act for a customer.

  allow  read an order
  allow  refunds up to $50
  ask   refunds up to $500
  deny  larger refunds and customer exports

1. Read order ord_42
  ✓ allowed → Acme Co., $240, delivered

2. Issue a $25 refund
  ✓ allowed → refunded $25 for ord_42

3. Issue a $200 refund
  ? agent paused — waiting for your approval of the $200 refund
  ✓ demo approver approves this exact refund
  ✓ approved once → refunded $200 for ord_42

4. Issue a $2,000 refund
  ✓ blocked before refund.issue ran

5. Export all customer data
  ✓ blocked before customers.export ran

  receipt chain: ✓ receipts verify
  denial removed from log: ✓ detected

Your agent asked. Your rules decided what ran.

Install: npm i nominee
```

### Optional activation report

When both standard input and output are attached to an interactive terminal, a
successful proof asks once whether to share an anonymous activation. It prints
the exact three-field payload before asking:
`event`, a random installation-scoped UUID, and the installed `nominee-cli`
version. Nothing is sent unless you answer yes. The choice is saved before the
request, the request times out after three seconds, redirected or other
non-interactive runs never prompt, and `DO_NOT_TRACK=1` disables even the
prompt. No reporting code exists in the core `nominee` package.

## `nominee observe`

Runs the same sample agent with **no policy at all**, in observe mode, and
prints what it turned out to be able to do. No policy decision is enforced;
runtime and integrity failures still fail closed. Use it to see the shape of
the report before wrapping your own tools.

```
$ npx nominee-cli observe

nominee observe — 9 call(s) across 3 tool(s), 2026-08-14 → 2026-08-14
ENFORCEMENT WAS OFF: every observed call reached its tool callback.

  tool              calls  kind
  refund.issue          5  mutate
                      ↳ amount: number, observed 5–2000 (median 40)  [unbounded]
                      ↳ orderId: string, 1 distinct value(s) observed
  orders.read           3  read
  customers.export      1  unknown

  Every one of those calls ran, including the $2,000 refund and the customer export.
```

Two lines put it around your own tools:

```ts
const nominee = new Nominee({ mode: 'observe' })
const tools = nominee.observe(yourTools)
```

`--out <file>` also writes the machine-readable JSON report (tool callback
attempts, argument types and ranges, bounded cardinalities, and which arguments
are unbounded). Raw strings, booleans, and user IDs are not retained; bounded
counts use SHA-256 fingerprints. Numeric ranges remain visible and should be
treated as sensitive when the underlying numbers are sensitive.

Observe mode is a discovery tool, not a security control: it announces on
startup that enforcement is off, marks every receipt `enforcement: 'observe'`,
and refuses to be constructed with `production: true`. See
[docs/observe.md](https://github.com/bharath31/nominee/blob/main/docs/observe.md).

## `nominee verify <file>`

Verifies a JSON file of exported receipts offline — no server, no database.

**Input shape:** a plain JSON array of `Receipt` objects, exactly what you get
from `JSON.stringify(nominee.receipts)` (or from concatenating whatever your
durable receipt store returns). There is no wrapper object — just the array.

```ts
// wherever you run nominee:
import { writeFileSync } from 'node:fs'
writeFileSync('receipts.json', JSON.stringify(nominee.receipts))
```

```
$ npx nominee-cli verify receipts.json
✓ 7 receipts intact
```

```
$ npx nominee-cli verify tampered.json
✗ broken at #3 (content does not match hash)
```

- If the chain was sealed with an HMAC signing key (`receipts: { key }`), set
  `NOMINEE_RECEIPT_KEY` in the environment before verifying — the same
  variable name the reference examples already use. Unsigned (plain SHA-256)
  chains verify with no key at all.
- Exit code `0` when the chain is intact, `1` if it's broken, unreadable, or
  not valid JSON.

## `nominee check <policy-file>`

Dynamically imports a policy module and reports which rules are reachable —
useful for catching a typo'd tool name before it ships silently as dead code.

**Expected export:** the file's `default` export must be either:

- a `Rule[]` array — exactly what `allow()` / `deny()` / `ask()` produce, e.g.
  `export default [allow('email.read'), deny('email.forward')]`; or
- a `Policy` object — `{ rules: Rule[], fallback?: Effect }`.

These are the same two shapes `new Nominee({ policy })` already accepts
(`NomineeOptions.policy: Policy | Rule[]`), so a real policy file used to
construct your `Nominee` instance can be pointed at directly.

`check` does **not** execute each rule's `when` predicate — it only checks
whether a rule's tool-name pattern (`matchTool`, wildcards included) matches
any tool name in a small built-in set of sample calls
(`email.read`, `email.forward`, `github.merge_pr`, `payment.charge`, …), the
same static reachability check the core library's dev-mode warnings already
perform for guarded tools. A rule that depends entirely on `input` matching
your real tools' argument shapes may still report as reachable/unreachable
based on its tool name alone.

```
$ npx nominee-cli check policy.mjs
Checking 4 rule(s) against 10 sample call(s)

  ✓ allow:email.read matched at least one sample call
  ✓ allow:email.forward matched at least one sample call
  ✗ allow:emial.send never matched any sample call — did you mean "email.read"?
  ✓ ask:email.delete matched at least one sample call

1 rule pattern(s) never matched a sample call.
```

Exit code `0` when every rule matches at least one sample call, `1` if any
rule never matches, the file can't be loaded, or the default export isn't one
of the two shapes above.

## Coming next

`nominee console` — a local web UI for live-tailing receipts and resolving
`ask` approvals from the browser — is not implemented yet. It needs its own
HTTP server and is a substantially larger piece of work than the three
commands above; see the `// TODO` in `src/cli.ts`.
