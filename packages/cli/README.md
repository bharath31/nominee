# nominee-cli

Find out what your agent can actually do — no policy, report only:

```
npx nominee-cli observe
```

Then enforce a policy on the same support-agent refund flow, without cloning
the repository, configuring an API key, or writing code:

```
npx nominee-cli
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
interactive run, the CLI separately offers one optional **trial** report, as
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

### Optional trial report

When both standard input and output are attached to an interactive terminal, a
successful proof asks once whether to share an anonymous trial. It prints
the exact three-field payload before asking:
`event`, a random installation-scoped UUID, and the installed `nominee-cli`
version. Nothing is sent unless you answer yes. The choice is saved before the
request, the request times out after three seconds, redirected or other
non-interactive runs never prompt, and `DO_NOT_TRACK=1` disables even the
prompt. This event is `cli_proof_completed`: it measures a trial of the bundled
example, **not** an activated developer. No reporting code exists in the core
`nominee` package.

## `nominee activate <policy-file> <receipts.json>`

An activated developer has written at least one policy rule and successfully
run it against one of their own tools. This command proves those facts locally
before offering a separate report:

```bash
npx nominee-cli activate ./nominee.policy.ts ./receipts.json
```

The policy must default-export a non-empty `Rule[]` or `Policy`. The receipt
file must be the complete, intact JSON array from the governed application and
must contain an enforced `policy.decision` plus `execution.succeeded` for a tool
matched by at least one supplied rule. Observe-mode executions do not qualify.
If the chain was HMAC-signed, set `NOMINEE_RECEIPT_KEY` just as for `verify`.

Policy and receipt contents never leave the process. After the local proof, an
interactive terminal shows the exact optional payload before asking: only
`event: "developer_activated"`, the random installation-scoped UUID, and the
installed CLI version. The trial and activation choices are stored separately;
declining a trial report never suppresses a later real activation report.
`DO_NOT_TRACK=1` disables the prompt, and reporting failure cannot change a
successful local proof's exit code.

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

`--out <file>` also writes the machine-readable JSON report (the callable-tool
inventory, callback attempts, argument types and ranges, bounded cardinalities,
and which arguments are unbounded). Available tools that never ran stay in the
inventory without being counted as traffic. Raw strings, booleans, and user IDs
are not retained; bounded counts use SHA-256 fingerprints. Numeric ranges remain
visible and should be treated as sensitive when the underlying numbers are
sensitive.

Observe mode is a discovery tool, not a security control: it announces on
startup that enforcement is off, marks every receipt `enforcement: 'observe'`,
and refuses to be constructed with `production: true`. See
[docs/observe.md](https://github.com/bharath31/nominee/blob/main/docs/observe.md).

## `nominee generate <observations.json>`

Turns an observe report into a readable `nominee.policy.ts` you can edit and
commit:

```bash
npx nominee-cli observe --out nominee.observations.json
npx nominee-cli generate nominee.observations.json --out nominee.policy.ts
npx nominee-cli check nominee.policy.ts
```

Read-classified tools start at `allow`. Mutating tools with numeric evidence get
an allow rule for the observed minimum-to-median range followed by `ask`; other
called tools start at `ask`. Inventoried tools that never ran get `deny`, and the file
ends with `fallback: 'deny'`. Every rule cites its call count, dates, and any
range used.

Those thresholds describe the captured traffic; they are **not security
recommendations**. The generated header says so, and `generate` refuses to
overwrite an existing output unless you pass `--force`. Version 1 reports are
accepted, but they predate the callable-tool inventory and therefore cannot
identify never-called tools.

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
any tool name. Generated policies embed the observed inventory, so `check` uses
those real names. Other policy files use a small built-in set of sample calls
(`email.read`, `email.forward`, `github.merge_pr`, `payment.charge`, …), the
same static reachability check the core library's dev-mode warnings already
perform for guarded tools. A rule that depends entirely on `input` matching
your real tools' argument shapes may still report as reachable/unreachable
based on its tool name alone.

Pass `--tools=refund.issue,inventory.adjust` to **append** extra sample names
(built-ins stay). Pass `--replace-samples` with `--tools` to use only the
names you listed. `check` also reports rules that can never fire because an
earlier *unconditional* pattern already matches the same tool name (`allow('*')`
shadows a later `deny('customers.export')`). An earlier rule with a `when`
predicate is not treated as a shadow: if the predicate is false, evaluation
continues. `when` predicates are still not executed.

```
$ npx nominee-cli check policy.mjs --tools=refund.issue
Checking 1 rule(s) against 11 sample call(s)

  ✓ allow:refund.issue matched at least one sample call

All rules reachable.
```

Exit code `0` when every rule matches at least one sample call, `1` if any
rule never matches, the file can't be loaded, or the default export isn't one
of the two shapes above.

## Coming next

`nominee console` — a local web UI for live-tailing receipts and resolving
`ask` approvals from the browser — is not implemented yet. It needs its own
HTTP server and is a substantially larger piece of work than the three
commands above; see the `// TODO` in `src/cli.ts`.
