# nominee-cli

Preview a sample observe report — no policy, report only. This command runs
a hard-coded support-agent tool set; wrapping *your* tools takes `observe()`
in code.

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

Runs a pause-proof of the decision-bound lifecycle against the real `nominee`
package:

- a $200 refund pauses for a human, and the request returns immediately with
  an `actionId` instead of holding the connection open;
- while the human is away, the access token the agent was holding expires;
- the out-of-band approval resumes the action, and a fresh token is minted
  only at execution — after the single-use capability is consumed;
- replaying the consumed approval is rejected, and the approved $200 cannot be
  executed as a $2,000; and
- the receipt chain verifies, while a doctored copy does not.

The proof itself makes no network calls and needs no environment variables or
API keys. (`npx` may first download the package from npm.) After a successful
interactive run, the CLI separately offers one optional **trial** report, as
described below. The proof exits `0` only when every pause and receipt
invariant holds, and `1` if one regresses; reporting cannot change that result.

```
$ npx nominee-cli

A support agent wants to issue a $200 refund.

  allow  refunds up to $50
  ask   refunds up to $500
  deny  larger refunds
  the agent already holds an access token from the start of the request

✓ approval requested   refund.issue $200 → sent out of band, request returns
⏳ the pause           the access token expires while the human is away
✓ approved             fresh token minted at execution, not at plan time
✗ replay               same approval, second attempt → rejected
✗ arg swap             approved $200, executed $2,000 → rejected
✓ receipt chain verifies (and a doctored copy is detected)

The pause is the product: approval out of band, one fresh token at execution,
and a log that shows if anyone edits it.

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
If the chain was sealed with an HMAC key, set `NOMINEE_RECEIPT_KEY` just as for `verify`.

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

Sample report from nominee's built-in demo agent — it never touches your code.
  nominee.observe(yourTools) wraps the tools you pass it — it only sees
  the tools handed to it, not the rest of your app.

Running a support agent for one session. Nothing is enforced.

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

- If the chain was sealed with an HMAC seal key (`receipts: { key }`), set
  `NOMINEE_RECEIPT_KEY` in the environment before verifying — the same
  variable name the reference examples already use. Not sealed (plain
  SHA-256) chains verify with no key at all.
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

## `nominee console`

Starts a polished local dashboard on `127.0.0.1:4317`. It needs no account or
cloud relay and opens an authenticated, one-time bootstrap URL in your browser:

```bash
npx nominee-cli console --report nominee.observations.json
```

The dashboard renders call, mutation, unbounded-argument, and policy-verdict
headlines; drills into each observed tool; writes the same starter policy as
`generate`; tails receipt decisions; and shows exactly what receipt-chain
verification does and does not prove. Load an existing receipt array with
`--receipts receipts.json`, choose a fixed output with `--policy-out`, or use
`--no-open` on a headless machine. Loaded files are durable inputs; live state
is process-local and disappears when the console stops.

### Connect a running agent

The command prints `NOMINEE_CONSOLE_URL` and a random 256-bit
`NOMINEE_CONSOLE_TOKEN`. Export them in the agent process, then opt in by
composing the bridge hooks:

```ts
import { Nominee } from 'nominee'
import { createConsoleBridge } from 'nominee-cli/console'

const bridge = createConsoleBridge()
const nominee = new Nominee({
  policy,
  onApprovalRequest: bridge.onApprovalRequest,
  receipts: { onReceipt: bridge.onReceipt, delivery: 'strict' },
})

// In an observe-mode inventory run only:
const follower = bridge.followObservations(() => nominee.observations())
// await follower.stop() during shutdown
```

An `ask` stays in the agent process while the browser displays its full input.
Approve or deny once; a replay is rejected. If the console connection fails,
the bridge resolves the approval as denied (or expired on timeout), so the tool
does not run. Using receipt `delivery: 'strict'` likewise makes a broken live
receipt path fail closed.

The HTTP surface refuses non-loopback binds. Producer writes require the random
Bearer token; browser mutations require an HttpOnly same-site session plus a
CSRF token and same-origin request. Approval details remain in memory only and
are removed on settlement. The core `nominee` package still contains no
telemetry or console transport; nothing is published unless the application
explicitly composes this bridge.
